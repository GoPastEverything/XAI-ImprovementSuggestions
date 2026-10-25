import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { XaiLiveSessionsResponse } from "./xaiLiveSessions.js";
import { mergeLiveSessionRows } from "./liveSessionMerge.js";
import { sortLiveSessionRows } from "./liveSessionRank.js";
import { fetchLiveSessionsViaXaiDiscovery } from "./xaiLiveSessionsDiscovery.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_FILE = join(__dir, "..", "data", "live-sessions-cache.json");

export type LiveSessionsCacheSnapshot = XaiLiveSessionsResponse & {
  fetchedAt: number;
  refreshInProgress: boolean;
  lastError?: string;
  source: "grok_discovery";
};

let memory: LiveSessionsCacheSnapshot | null = null;
let refreshPromise: Promise<void> | null = null;

function cacheFilePath(env: NodeJS.ProcessEnv): string {
  return env.IFIXEDX_LIVE_SESSIONS_CACHE_FILE?.trim() || DEFAULT_CACHE_FILE;
}

function maxCount(env: NodeJS.ProcessEnv, kind: "spaces" | "broadcasts"): number {
  const key = kind === "spaces" ? "XAI_LIVE_SESSIONS_MAX_SPACES" : "XAI_LIVE_SESSIONS_MAX_BROADCASTS";
  const n = Number(env[key] ?? 48);
  return Math.min(100, Math.max(1, Number.isFinite(n) ? Math.floor(n) : 48));
}

function refreshIntervalMs(env: NodeJS.ProcessEnv): number {
  const n = Number(env.XAI_LIVE_SESSIONS_REFRESH_MS ?? 300_000);
  return Math.min(900_000, Math.max(60_000, Number.isFinite(n) ? Math.floor(n) : 300_000));
}

export function getLiveSessionsCache(): LiveSessionsCacheSnapshot | null {
  return memory;
}

export function sliceCachedLiveSessions(
  snap: LiveSessionsCacheSnapshot,
  nSpaces: number,
  nBroadcasts: number
): XaiLiveSessionsResponse & {
  fetchedAt: number;
  cacheAgeMs: number;
  refreshInProgress: boolean;
  totalSpaces: number;
  totalBroadcasts: number;
} {
  return {
    spaces: snap.spaces.slice(0, nSpaces),
    broadcasts: snap.broadcasts.slice(0, nBroadcasts),
    model: snap.model,
    liveSearch: snap.liveSearch,
    warning: snap.warning,
    spacesValidated: snap.spacesValidated,
    validationNote: snap.validationNote,
    fetchedAt: snap.fetchedAt,
    cacheAgeMs: Math.max(0, Date.now() - snap.fetchedAt),
    refreshInProgress: snap.refreshInProgress,
    totalSpaces: snap.spaces.length,
    totalBroadcasts: snap.broadcasts.length
  };
}

async function persistCache(env: NodeJS.ProcessEnv, snap: LiveSessionsCacheSnapshot): Promise<void> {
  const path = cacheFilePath(env);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(snap, null, 0), "utf8");
  } catch (e) {
    console.warn(
      "[ifixedx] live-sessions cache write failed:",
      e instanceof Error ? e.message : e
    );
  }
}

async function loadCacheFromDisk(env: NodeJS.ProcessEnv): Promise<void> {
  const path = cacheFilePath(env);
  try {
    const raw = await readFile(path, "utf8");
    const p = JSON.parse(raw) as LiveSessionsCacheSnapshot;
    if (p?.fetchedAt && Array.isArray(p.spaces) && Array.isArray(p.broadcasts)) {
      memory = { ...p, refreshInProgress: false };
    }
  } catch {
    /* no cache yet */
  }
}

export async function refreshLiveSessionsCache(
  env: NodeJS.ProcessEnv,
  opts?: { sessionId?: string | null }
): Promise<void> {
  if (!env.XAI_API_KEY?.trim()) return;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    if (memory) memory = { ...memory, refreshInProgress: true };
    try {
      const out = await fetchLiveSessionsViaXaiDiscovery(env, {
        nSpaces: maxCount(env, "spaces"),
        nBroadcasts: maxCount(env, "broadcasts"),
        liveSearch: true,
        sessionId: opts?.sessionId ?? null
      });
      const maxS = maxCount(env, "spaces");
      const maxB = maxCount(env, "broadcasts");
      const spaces = sortLiveSessionRows(
        mergeLiveSessionRows(memory?.spaces ?? [], out.spaces)
      ).slice(0, maxS);
      const broadcasts = sortLiveSessionRows(
        mergeLiveSessionRows(memory?.broadcasts ?? [], out.broadcasts)
      ).slice(0, maxB);

      const snap: LiveSessionsCacheSnapshot = {
        ...out,
        spaces,
        broadcasts,
        fetchedAt: Date.now(),
        refreshInProgress: false,
        source: "grok_discovery"
      };

      if (
        snap.spaces.length === 0 &&
        snap.broadcasts.length === 0 &&
        memory &&
        (memory.spaces.length > 0 || memory.broadcasts.length > 0)
      ) {
        memory = {
          ...memory,
          refreshInProgress: false,
          lastError: "Refresh returned 0 URLs; kept previous cache.",
          warning: snap.warning
        };
        console.warn("[ifixedx] live-sessions refresh empty — keeping previous cache");
        return;
      }

      memory = snap;
      await persistCache(env, snap);
      console.log(
        `[ifixedx] live-sessions cache refreshed: ${snap.spaces.length} spaces, ${snap.broadcasts.length} broadcasts (x_search: ${snap.liveSearch})`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (memory) memory = { ...memory, refreshInProgress: false, lastError: msg };
      else {
        memory = {
          spaces: [],
          broadcasts: [],
          model: env.XAI_MODEL?.trim() || "grok-4.3",
          liveSearch: false,
          fetchedAt: 0,
          refreshInProgress: false,
          lastError: msg,
          source: "grok_discovery"
        };
      }
      console.warn("[ifixedx] live-sessions cache refresh failed:", msg);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function startLiveSessionsCacheScheduler(env: NodeJS.ProcessEnv): void {
  if (env.XAI_LIVE_SESSIONS_SCHEDULER === "0") {
    console.log("[ifixedx] live-sessions scheduler disabled (XAI_LIVE_SESSIONS_SCHEDULER=0)");
    return;
  }
  if (!env.XAI_API_KEY?.trim()) {
    console.log("[ifixedx] live-sessions scheduler skipped (no XAI_API_KEY)");
    return;
  }

  const ms = refreshIntervalMs(env);
  void loadCacheFromDisk(env).then(() => {
    if (memory) {
      console.log(
        `[ifixedx] live-sessions cache loaded (${memory.spaces.length} spaces, ${memory.broadcasts.length} broadcasts, age ${Math.round((Date.now() - memory.fetchedAt) / 1000)}s)`
      );
    }
    void refreshLiveSessionsCache(env);
  });

  setInterval(() => {
    void refreshLiveSessionsCache(env);
  }, ms).unref?.();

  console.log(`[ifixedx] live-sessions scheduler every ${Math.round(ms / 1000)}s`);
}
