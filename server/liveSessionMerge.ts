import { dedupeLiveSessionRows } from "./liveSessionDedupe.js";
import type { XaiLiveSessionRow } from "./xaiLiveSessions.js";

export function mergeLiveSessionRows(
  ...batches: XaiLiveSessionRow[][]
): XaiLiveSessionRow[] {
  const out: XaiLiveSessionRow[] = [];
  for (const batch of batches) {
    out.push(...batch);
  }
  return dedupeLiveSessionRows(out);
}
