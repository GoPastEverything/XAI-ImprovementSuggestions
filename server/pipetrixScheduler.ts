import { syncSpiderPipeToPipetrix, getPipetrixStatsPayload } from "./pipetrixStore.js";

let lastSyncAt = 0;
let syncInProgress = false;
let lastSyncError: string | undefined;
let lastSyncSummary: string | undefined;

export function getPipetrixSyncState() {
  return { lastSyncAt, syncInProgress, lastSyncError, lastSyncSummary };
}

/** Push spider pipe → server Pipetrix canonical (runs after hunts). */
export async function runPipetrixSpiderSyncNow(): Promise<{ ok: boolean; summary: string }> {
  if (syncInProgress) return { ok: false, summary: "Pipetrix sync already in progress." };
  syncInProgress = true;
  try {
    const { synced, total } = await syncSpiderPipeToPipetrix();
    lastSyncAt = Date.now();
    lastSyncError = undefined;
    const stats = await getPipetrixStatsPayload();
    lastSyncSummary = `Pipetrix: synced ${synced} spider tweets, ${total} total (${stats.active} active)`;
    console.log(`[ifixedx] ${lastSyncSummary}`);
    return { ok: true, summary: lastSyncSummary };
  } catch (e) {
    lastSyncError = e instanceof Error ? e.message : String(e);
    console.warn("[ifixedx] Pipetrix spider sync failed:", lastSyncError);
    return { ok: false, summary: lastSyncError };
  } finally {
    syncInProgress = false;
  }
}
