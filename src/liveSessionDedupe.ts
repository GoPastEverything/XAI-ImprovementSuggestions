/** Client-side dedupe — one card per Space/Broadcast id. */

export type LiveSessionKind = "space" | "broadcast";

export type LiveSessionDedupeRow = {
  kind: LiveSessionKind;
  linkUrl?: string;
  id: string;
  handle?: string;
  author?: string;
  title?: string;
  live?: boolean;
  listeners?: number;
};

function normalizeUrl(raw: string): string {
  let u = raw.trim().replace(/^http:\/\//i, "https://");
  u = u.replace(/^(https:\/\/)twitter\.com/i, "$1x.com");
  return u;
}

function platformIdFromUrl(url: string, kind: LiveSessionKind): string | null {
  try {
    const path = new URL(normalizeUrl(url)).pathname;
    const m =
      kind === "space"
        ? path.match(/^\/i\/spaces\/([A-Za-z0-9]+)/i)
        : path.match(/^\/i\/broadcasts\/([A-Za-z0-9]+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function liveSessionPlatformKey(row: LiveSessionDedupeRow): string | null {
  const url = row.linkUrl?.trim();
  if (url) {
    const pid = platformIdFromUrl(url, row.kind);
    if (pid) return `${row.kind}:${pid}`;
  }
  const m = row.id.match(/^(?:space|broadcast):([A-Za-z0-9]+)$/);
  return m ? `${row.kind}:${m[1]}` : null;
}

function rowQuality(r: LiveSessionDedupeRow): number {
  let q = 0;
  if (r.live) q += 20;
  const listeners = r.listeners ?? 0;
  if (listeners > 0) q += 1000 + Math.min(listeners, 9999);
  const title = (r.title ?? "").trim().toLowerCase();
  if (title && title !== "live on x") q += 100;
  const handle = (r.handle ?? "").replace(/^@/, "").toLowerCase();
  if (handle && handle !== "spaces" && handle !== "broadcast" && handle !== "unknown" && handle !== "pending")
    q += 50;
  return q;
}

export function dedupeLiveSessionRows<T extends LiveSessionDedupeRow>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const r of rows) {
    const key = liveSessionPlatformKey(r);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || rowQuality(r) > rowQuality(prev)) {
      byKey.set(key, { ...r, id: `${r.kind}:${key.split(":")[1]}` } as T);
    }
  }
  return [...byKey.values()];
}
