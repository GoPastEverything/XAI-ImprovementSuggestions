import { fetchLiveSessionsViaXaiDiscovery } from "./xaiLiveSessionsDiscovery.js";
import { reconcileHuntWithPipes, runFeedtrixLiveValidationPass } from "./feedtrixLiveValidate.js";
import { listFromFeedtrixPipe } from "./feedtrixLivePipe.js";
import type { XaiLiveSessionsResponse } from "./xaiLiveSessions.js";
import { dedupeLiveSessionRows } from "./liveSessionDedupe.js";
import { sortLiveSessionRows } from "./liveSessionRank.js";

type SchedulerState = {
  lastHuntAt: number;
  lastValidateAt: number;
  lastHuntError?: string;
  huntInProgress: boolean;
  validateInProgress: boolean;
};

let state: SchedulerState = {
  lastHuntAt: 0,
  lastValidateAt: 0,
  huntInProgress: false,
  validateInProgress: false
};

let huntPass = 0;

function huntIntervalMs(env: NodeJS.ProcessEnv): number {
  const n = Number(env.FEEDTRIX_LIVE_HUNT_MS ?? env.XAI_LIVE_SESSIONS_REFRESH_MS ?? 300_000);
  return Math.min(900_000, Math.max(120_000, Number.isFinite(n) ? Math.floor(n) : 300_000));
}

function validateIntervalMs(env: NodeJS.ProcessEnv): number {
  const n = Number(env.FEEDTRIX_LIVE_VALIDATE_MS ?? 90_000);
  return Math.min(600_000, Math.max(45_000, Number.isFinite(n) ? Math.floor(n) : 90_000));
}

function maxCount(env: NodeJS.ProcessEnv, kind: "spaces" | "broadcasts"): number {
  const key = kind === "spaces" ? "XAI_LIVE_SESSIONS_MAX_SPACES" : "XAI_LIVE_SESSIONS_MAX_BROADCASTS";
  const n = Number(env[key] ?? 48);
  return Math.min(100, Math.max(1, Number.isFinite(n) ? Math.floor(n) : 48));
}

export function getFeedtrixLiveSchedulerState(): SchedulerState {
  return { ...state };
}

export async function runFeedtrixLiveHunt(
  env: NodeJS.ProcessEnv,
  opts?: { sessionId?: string | null }
): Promise<void> {
  if (!env.XAI_API_KEY?.trim()) return;
  if (state.huntInProgress) return;
  state.huntInProgress = true;
  const pass = huntPass++;
  try {
    const out = await fetchLiveSessionsViaXaiDiscovery(env, {
      nSpaces: maxCount(env, "spaces"),
      nBroadcasts: maxCount(env, "broadcasts"),
      liveSearch: true,
      sessionId: opts?.sessionId ?? null,
      huntPass: pass
    });
    if (out.ingest.spacesXApi.length) {
      await reconcileHuntWithPipes(out.ingest.spacesXApi, [], { spaces: "x_api" });
    }
    if (out.ingest.broadcastsXApi.length) {
      await reconcileHuntWithPipes([], out.ingest.broadcastsXApi, { broadcasts: "x_api" });
    }
    if (out.ingest.spacesXai.length) {
      await reconcileHuntWithPipes(out.ingest.spacesXai, [], { spaces: "xai_hunt" });
    }
    if (out.ingest.broadcastsXai.length) {
      await reconcileHuntWithPipes([], out.ingest.broadcastsXai, { broadcasts: "xai_hunt" });
    }
    state.lastHuntAt = Date.now();
    state.lastHuntError = undefined;
    console.log(
      `[ifixedx] Feedtrix hunt → pipes: ${out.spaces.length} spaces, ${out.broadcasts.length} broadcasts ingested`
    );
  } catch (e) {
    state.lastHuntError = e instanceof Error ? e.message : String(e);
    console.warn("[ifixedx] Feedtrix live hunt failed:", state.lastHuntError);
  } finally {
    state.huntInProgress = false;
  }
}

export async function runFeedtrixLiveValidate(
  env: NodeJS.ProcessEnv,
  sessionId: string | null,
  opts?: { maxPerPipe?: number; staleAfterMs?: number }
): Promise<void> {
  if (state.validateInProgress) return;
  state.validateInProgress = true;
  try {
    const r = await runFeedtrixLiveValidationPass(env, sessionId, {
      maxPerPipe: opts?.maxPerPipe ?? Number(env.FEEDTRIX_LIVE_VALIDATE_BATCH ?? 10),
      staleAfterMs: opts?.staleAfterMs ?? 60_000
    });
    state.lastValidateAt = Date.now();
    if (r.spacesChecked || r.broadcastsChecked) {
      console.log(
        `[ifixedx] Feedtrix validate: ${r.spacesChecked} spaces, ${r.broadcastsChecked} broadcasts checked`
      );
    }
  } finally {
    state.validateInProgress = false;
  }
}

/** Build API payload from validated pipes (not raw hunt cache). */
export async function buildLiveSessionsFromFeedtrixPipes(
  nSpaces: number,
  nBroadcasts: number
): Promise<
  XaiLiveSessionsResponse & {
    fetchedAt: number;
    fromFeedtrixPipe: true;
    pipeStats: {
      spaces: Awaited<ReturnType<typeof listFromFeedtrixPipe>>["stats"];
      broadcasts: Awaited<ReturnType<typeof listFromFeedtrixPipe>>["stats"];
    };
  }
> {
  const [s, b] = await Promise.all([
    listFromFeedtrixPipe("FeedtrixSpaces", {
      activeLimit: nSpaces,
      includeRecentInactive: Math.min(12, Math.floor(nSpaces / 2))
    }),
    listFromFeedtrixPipe("FeedtrixBroadcasts", {
      activeLimit: nBroadcasts,
      includeRecentInactive: Math.min(12, Math.floor(nBroadcasts / 2))
    })
  ]);

  const spaces = dedupeLiveSessionRows(
    sortLiveSessionRows([...s.active, ...s.recentInactive])
  ).slice(0, nSpaces);
  const broadcasts = dedupeLiveSessionRows(
    sortLiveSessionRows([...b.active, ...b.recentInactive])
  ).slice(0, nBroadcasts);

  return {
    spaces,
    broadcasts,
    model: process.env.XAI_LIVE_SESSIONS_MODEL?.trim() || process.env.XAI_MODEL?.trim() || "grok-4.3",
    liveSearch: true,
    spacesValidated: true,
    validationNote: "Served from FeedtrixSpaces / FeedtrixBroadcasts pipes (hunt + periodic validation).",
    fetchedAt: Math.max(s.stats.pipeUpdatedAt, b.stats.pipeUpdatedAt, Date.now()),
    fromFeedtrixPipe: true,
    pipeStats: { spaces: s.stats, broadcasts: b.stats }
  };
}

export function startFeedtrixLiveScheduler(env: NodeJS.ProcessEnv): void {
  if (env.FEEDTRIX_LIVE_SCHEDULER === "0" || env.XAI_LIVE_SESSIONS_SCHEDULER === "0") {
    console.log("[ifixedx] Feedtrix live scheduler disabled");
    return;
  }
  if (!env.XAI_API_KEY?.trim()) {
    console.log("[ifixedx] Feedtrix live scheduler skipped (no XAI_API_KEY)");
    return;
  }

  const huntMs = huntIntervalMs(env);
  const valMs = validateIntervalMs(env);

  void runFeedtrixLiveHunt(env).then(() =>
    runFeedtrixLiveValidate(env, null, { maxPerPipe: 40, staleAfterMs: 0 })
  );

  setInterval(() => {
    void runFeedtrixLiveHunt(env);
  }, huntMs).unref?.();

  setInterval(() => {
    void runFeedtrixLiveValidate(env, null);
  }, valMs).unref?.();

  console.log(
    `[ifixedx] Feedtrix live pipes: hunt every ${Math.round(huntMs / 1000)}s, validate every ${Math.round(valMs / 1000)}s`
  );
}
