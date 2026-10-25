import {
  parseBroadcastIdFromUrl,
  parseSpaceIdFromUrl,
  normalizeLiveSessionUrl
} from "./liveSessionUrls.js";
import type { XaiLiveSessionRow } from "./xaiLiveSessions.js";

/** Stable dedupe key: one row per Space/Broadcast platform id. */
export function liveSessionPlatformKey(row: {
  kind: "space" | "broadcast";
  linkUrl?: string;
  id?: string;
}): string | null {
  const url = normalizeLiveSessionUrl(String(row.linkUrl ?? ""));
  const pid =
    row.kind === "space" ? parseSpaceIdFromUrl(url) : parseBroadcastIdFromUrl(url);
  if (pid) return `${row.kind}:${pid}`;
  const id = String(row.id ?? "");
  const m = id.match(/^(?:space|broadcast):([A-Za-z0-9]+)$/);
  return m ? `${row.kind}:${m[1]}` : null;
}

function rowQuality(r: XaiLiveSessionRow): number {
  let q = 0;
  if (r.live) q += 20;
  if (r.listeners > 0) q += 1000 + Math.min(r.listeners, 9999);
  const title = (r.title ?? "").trim().toLowerCase();
  if (title && title !== "live on x") q += 100;
  const handle = (r.handle ?? "").replace(/^@/, "").toLowerCase();
  if (handle && handle !== "spaces" && handle !== "broadcast" && handle !== "unknown" && handle !== "pending")
    q += 50;
  return q;
}

/** Collapse duplicate platform ids; keep the richest metadata row. */
export function dedupeLiveSessionRows(rows: XaiLiveSessionRow[]): XaiLiveSessionRow[] {
  const byKey = new Map<string, XaiLiveSessionRow>();
  for (const r of rows) {
    const key = liveSessionPlatformKey(r);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || rowQuality(r) > rowQuality(prev)) {
      byKey.set(key, { ...r, id: `${r.kind}:${key.split(":")[1]}` });
    }
  }
  return [...byKey.values()];
}
