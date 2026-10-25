import { compactTwitterSpiderPipe, getTwitterSpiderStats } from "./twitterSpiderPipe.js";
import { runTwitterSpiderHunt } from "./twitterSpiderHunt.js";
import { purgeDuplicateSpiderPipeRecords, runTwitterSpiderValidationPass } from "./twitterSpiderValidate.js";
import { runPipetrixSpiderSyncNow } from "./pipetrixScheduler.js";

type SchedulerState = {
  lastHuntAt: number;
  lastValidateAt: number;
  lastHuntError?: string;
  huntInProgress: boolean;
  validateInProgress: boolean;
  lastHuntSummary?: string;
};

let state: SchedulerState = {
  lastHuntAt: 0,
  lastValidateAt: 0,
  huntInProgress: false,
  validateInProgress: false
};

let huntPass = 0;

function huntIntervalMs(env: NodeJS.ProcessEnv): number {
  const n = Number(env.TWITTER_SPIDER_HUNT_MS ?? 300_000);
  return Math.min(900_000, Math.max(120_000, Number.isFinite(n) ? Math.floor(n) : 300_000));
}

function validateIntervalMs(env: NodeJS.ProcessEnv): number {
  const n = Number(env.TWITTER_SPIDER_VALIDATE_MS ?? 90_000);
  return Math.min(600_000, Math.max(45_000, Number.isFinite(n) ? Math.floor(n) : 90_000));
}

export function getTwitterSpiderSchedulerState(): SchedulerState {
  return { ...state };
}

export async function runTwitterSpiderHuntNow(
  env: NodeJS.ProcessEnv,
  sessionId: string | null
): Promise<{ ok: boolean; summary: string }> {
  if (state.huntInProgress) {
    return { ok: false, summary: "Hunt already in progress." };
  }
  state.huntInProgress = true;
  const pass = huntPass++;
  try {
    const dupes = await purgeDuplicateSpiderPipeRecords();
    const out = await runTwitterSpiderHunt(env, sessionId, pass);
    state.lastHuntAt = Date.now();
    state.lastHuntError = undefined;
    const summary = `TwitterSpider: +${out.ingested} new, ${out.updated} updated, ${dupes + out.duplicatesRemoved} dupes trimmed, ${out.total} in pipe`;
    state.lastHuntSummary = summary;
    console.log(`[ifixedx] ${summary}`);
    void runPipetrixSpiderSyncNow();
    return { ok: true, summary: [summary, out.warning].filter(Boolean).join(" · ") };
  } catch (e) {
    state.lastHuntError = e instanceof Error ? e.message : String(e);
    console.warn("[ifixedx] TwitterSpider hunt failed:", state.lastHuntError);
    return { ok: false, summary: state.lastHuntError };
  } finally {
    state.huntInProgress = false;
  }
}

export async function runTwitterSpiderValidateNow(
  env: NodeJS.ProcessEnv,
  sessionId: string | null
): Promise<void> {
  if (state.validateInProgress) return;
  state.validateInProgress = true;
  try {
    const r = await runTwitterSpiderValidationPass(env, sessionId, {
      maxBatch: Number(process.env.TWITTER_SPIDER_VALIDATE_BATCH ?? 25),
      staleAfterMs: 60_000
    });
    state.lastValidateAt = Date.now();
    if (r.checked) {
      console.log(
        `[ifixedx] TwitterSpider validate: ${r.checked} checked, ${r.deactivated} deactivated`
      );
    }
    void runPipetrixSpiderSyncNow();
  } finally {
    state.validateInProgress = false;
  }
}

export function startTwitterSpiderScheduler(env: NodeJS.ProcessEnv): void {
  if (env.TWITTER_SPIDER_SCHEDULER === "0") {
    console.log("[ifixedx] TwitterSpider scheduler disabled");
    return;
  }

  const huntMs = huntIntervalMs(env);
  const valMs = validateIntervalMs(env);

  void compactTwitterSpiderPipe().then(() =>
    runTwitterSpiderHuntNow(env, null).then(() => runTwitterSpiderValidateNow(env, null))
  );

  setInterval(() => {
    void runTwitterSpiderHuntNow(env, null);
  }, huntMs).unref?.();

  setInterval(() => {
    void runTwitterSpiderValidateNow(env, null);
  }, valMs).unref?.();

  console.log(
    `[ifixedx] TwitterSpider: hunt every ${Math.round(huntMs / 1000)}s, validate every ${Math.round(valMs / 1000)}s`
  );
}

export async function getTwitterSpiderStatusPayload() {
  const stats = await getTwitterSpiderStats();
  const sched = getTwitterSpiderSchedulerState();
  return {
    ...stats,
    scheduler: sched,
    lastHuntSummary: sched.lastHuntSummary
  };
}
