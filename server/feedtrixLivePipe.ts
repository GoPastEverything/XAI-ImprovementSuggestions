import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dedupeLiveSessionRows, liveSessionPlatformKey } from "./liveSessionDedupe.js";
import {
  preferLiveAuthor,
  preferLiveHandle,
  preferLiveTitle,
  shouldShowInLiveDirectory
} from "./liveSessionQuality.js";
import { sortLiveSessionRows } from "./liveSessionRank.js";
import {
  isCanonicalLiveSessionUrl,
  normalizeLiveSessionUrl,
  parseBroadcastIdFromUrl,
  parseSpaceIdFromUrl
} from "./liveSessionUrls.js";
import type { FeedtrixLivePipeFile, FeedtrixLiveRecord } from "./feedtrixLiveTypes.js";
import { feedtrixRecordToSessionRow } from "./feedtrixLiveTypes.js";
import type { XaiLiveSessionRow } from "./xaiLiveSessions.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "..", "data");

const MAX_RECORDS = 500;
const INACTIVE_TTL_MS = 7 * 24 * 60 * 60_000;

type PipeName = FeedtrixLivePipeFile["pipeName"];

function pipePath(name: PipeName): string {
  const file = name === "FeedtrixSpaces" ? "feedtrix-spaces-pipe.json" : "feedtrix-broadcasts-pipe.json";
  return join(DATA_DIR, file);
}

function emptyPipe(name: PipeName): FeedtrixLivePipeFile {
  return { version: 1, pipeName: name, updatedAt: 0, records: [] };
}

export async function loadFeedtrixLivePipe(name: PipeName): Promise<FeedtrixLivePipeFile> {
  try {
    const raw = await readFile(pipePath(name), "utf8");
    const p = JSON.parse(raw) as FeedtrixLivePipeFile;
    if (p?.version === 1 && p.pipeName === name && Array.isArray(p.records)) {
      const deduped = dedupeFeedtrixRecords(p.records);
      if (deduped.length !== p.records.length) {
        p.records = deduped;
        await writeFile(pipePath(name), JSON.stringify({ ...p, updatedAt: Date.now() }), "utf8");
      } else {
        p.records = deduped;
      }
      return p;
    }
  } catch {
    /* new pipe */
  }
  return emptyPipe(name);
}

function recordQuality(r: FeedtrixLiveRecord): number {
  let q = 0;
  if (r.isActive) q += 20;
  if (r.listeners > 0) q += 1000 + Math.min(r.listeners, 9999);
  const title = r.title.trim().toLowerCase();
  if (title && title !== "live on x") q += 100;
  const handle = r.handle.replace(/^@/, "").toLowerCase();
  if (handle && handle !== "spaces" && handle !== "broadcast" && handle !== "unknown" && handle !== "pending")
    q += 50;
  return q;
}

/** One pipe row per platform id (defensive if ingest paths overlap). */
function dedupeFeedtrixRecords(records: FeedtrixLiveRecord[]): FeedtrixLiveRecord[] {
  const byKey = new Map<string, FeedtrixLiveRecord>();
  for (const r of records) {
    const key = liveSessionPlatformKey(r) ?? r.pipeId;
    const prev = byKey.get(key);
    if (!prev || recordQuality(r) > recordQuality(prev)) {
      byKey.set(key, { ...r, pipeId: `${r.kind}:${r.platformId}` });
    }
  }
  return [...byKey.values()];
}

async function saveFeedtrixLivePipe(pipe: FeedtrixLivePipeFile): Promise<void> {
  const now = Date.now();
  const pruned = pipe.records.filter((r) => {
    if (r.isActive) return true;
    return now - r.lastActiveCheck < INACTIVE_TTL_MS;
  });
  pruned.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.isActive && b.isActive) return b.listeners - a.listeners;
    return b.lastActiveCheck - a.lastActiveCheck;
  });
  const trimmed = pruned.slice(0, MAX_RECORDS);
  const out: FeedtrixLivePipeFile = { ...pipe, updatedAt: now, records: trimmed };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(pipePath(pipe.pipeName), JSON.stringify(out), "utf8");
}

function rowFromDiscovery(
  row: XaiLiveSessionRow,
  now: number,
  source: FeedtrixLiveRecord["discoverySource"]
): FeedtrixLiveRecord | null {
  const kind = row.kind;
  const linkUrl = normalizeLiveSessionUrl(row.linkUrl);
  if (!isCanonicalLiveSessionUrl(linkUrl, kind)) return null;
  const platformId =
    kind === "space" ? parseSpaceIdFromUrl(linkUrl) : parseBroadcastIdFromUrl(linkUrl);
  if (!platformId) return null;
  const rawHandle = String(row.handle ?? "").replace(/^@/, "").slice(0, 30);
  const handle = rawHandle || "pending";
  const authorRaw = String(row.author ?? "").trim();
  const author =
    authorRaw && !/^@?pending$/i.test(authorRaw)
      ? authorRaw.replace(/^@/, "").slice(0, 240)
      : handle !== "pending"
        ? handle
        : "Space host";
  return {
    pipeId: `${kind}:${platformId}`,
    kind,
    platformId,
    linkUrl: kind === "space" && !linkUrl.includes("/peek") ? `${linkUrl.replace(/\/+$/, "")}/peek` : linkUrl,
    handle,
    author,
    title: String(row.title ?? "Live on X").slice(0, 280),
    listeners: Math.max(0, Math.floor(row.listeners ?? 0)),
    isActive: true,
    lastActiveCheck: now,
    firstSeenAt: now,
    lastSeenAt: now,
    discoverySource: source
  };
}

/** Merge hunt results into the persistent pipe (queue). */
export async function ingestHuntIntoFeedtrixPipe(
  name: PipeName,
  discovered: XaiLiveSessionRow[],
  source: FeedtrixLiveRecord["discoverySource"] = "xai_hunt"
): Promise<{ added: number; updated: number; total: number }> {
  const pipe = await loadFeedtrixLivePipe(name);
  const now = Date.now();
  const byId = new Map(pipe.records.map((r) => [r.pipeId, r]));
  let added = 0;
  let updated = 0;

  for (const d of discovered) {
    const rec = rowFromDiscovery(d, now, source);
    if (!rec) continue;
    const prev = byId.get(rec.pipeId);
    if (!prev) {
      byId.set(rec.pipeId, rec);
      added++;
      continue;
    }
    prev.title = preferLiveTitle(prev.title, rec.title);
    prev.handle = preferLiveHandle(prev.handle, rec.handle);
    prev.author = preferLiveAuthor(prev.author, rec.author, prev.handle);
    prev.linkUrl = rec.linkUrl;
    prev.listeners = Math.max(prev.listeners, rec.listeners);
    prev.lastSeenAt = now;
    const wasDead =
      prev.validationNote === "x_api:ended" ||
      prev.validationNote?.includes("dead") ||
      prev.validationNote?.includes("404");
    if (!wasDead) {
      prev.isActive = true;
      prev.lastActiveCheck = now;
    }
    updated++;
  }

  pipe.records = dedupeFeedtrixRecords([...byId.values()]);
  await saveFeedtrixLivePipe(pipe);
  return { added, updated, total: pipe.records.length };
}

export async function updateFeedtrixLiveRecord(
  name: PipeName,
  pipeId: string,
  patch: Partial<
    Pick<
      FeedtrixLiveRecord,
      "isActive" | "lastActiveCheck" | "listeners" | "title" | "validationNote" | "handle" | "author"
    >
  >
): Promise<void> {
  const pipe = await loadFeedtrixLivePipe(name);
  const rec = pipe.records.find((r) => r.pipeId === pipeId);
  if (!rec) return;
  Object.assign(rec, patch);
  if (patch.isActive === true) rec.lastSeenAt = Date.now();
  await saveFeedtrixLivePipe(pipe);
}

export async function listRecordsNeedingCheck(
  name: PipeName,
  max: number,
  staleAfterMs: number
): Promise<FeedtrixLiveRecord[]> {
  const pipe = await loadFeedtrixLivePipe(name);
  const cutoff = Date.now() - staleAfterMs;
  const stale = pipe.records
    .filter((r) => r.lastActiveCheck < cutoff)
    .sort((a, b) => a.lastActiveCheck - b.lastActiveCheck);
  return stale.slice(0, max);
}

export type FeedtrixPipeListResult = {
  active: XaiLiveSessionRow[];
  recentInactive: XaiLiveSessionRow[];
  stats: {
    total: number;
    active: number;
    inactive: number;
    pipeUpdatedAt: number;
  };
};

/** Serve UI: active first, then recently validated inactive. */
export async function listFromFeedtrixPipe(
  name: PipeName,
  opts: { activeLimit: number; includeRecentInactive?: number }
): Promise<FeedtrixPipeListResult> {
  const pipe = await loadFeedtrixLivePipe(name);
  const kind = name === "FeedtrixSpaces" ? "space" : "broadcast";
  const activeRecs = pipe.records.filter(
    (r) =>
      r.isActive &&
      r.kind === kind &&
      shouldShowInLiveDirectory({
        isActive: r.isActive,
        handle: r.handle,
        title: r.title,
        validationNote: r.validationNote
      })
  );
  const inactiveRecs = pipe.records.filter((r) => !r.isActive && r.kind === kind);

  const active = dedupeLiveSessionRows(
    sortLiveSessionRows(activeRecs.map(feedtrixRecordToSessionRow))
  ).slice(0, opts.activeLimit);
  const recentN = opts.includeRecentInactive ?? 8;
  const recentInactive = dedupeLiveSessionRows(
    sortLiveSessionRows(
      inactiveRecs
        .filter((r) => Date.now() - r.lastActiveCheck < 45 * 60_000)
        .map(feedtrixRecordToSessionRow)
    )
  ).slice(0, recentN);

  return {
    active,
    recentInactive,
    stats: {
      total: pipe.records.length,
      active: activeRecs.length,
      inactive: inactiveRecs.length,
      pipeUpdatedAt: pipe.updatedAt
    }
  };
}

export async function getFeedtrixPipeSnapshot(): Promise<{
  spaces: FeedtrixPipeListResult;
  broadcasts: FeedtrixPipeListResult;
}> {
  const [spaces, broadcasts] = await Promise.all([
    listFromFeedtrixPipe("FeedtrixSpaces", { activeLimit: 100, includeRecentInactive: 16 }),
    listFromFeedtrixPipe("FeedtrixBroadcasts", { activeLimit: 100, includeRecentInactive: 16 })
  ]);
  return { spaces, broadcasts };
}
