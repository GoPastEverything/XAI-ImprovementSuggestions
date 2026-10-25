type LiveSortRow = { live: boolean; listeners: number; endedAgo?: string };

function endedAgoSortKey(endedAgo?: string): number {
  const s = String(endedAgo ?? "").trim().toLowerCase();
  if (!s) return 999_999;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 999_999;
  if (s.includes("d")) return n * 24 * 60;
  if (s.includes("h")) return n * 60;
  if (s.includes("m") || s.includes("min")) return n;
  if (s.includes("s") || s.includes("sec")) return n / 60;
  return 999_999;
}

/** Live first (by listeners), then recently ended — matches server ordering. */
export function sortLiveSessionRows<T extends LiveSortRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    if (a.live && b.live) return b.listeners - a.listeners;
    const ea = endedAgoSortKey(a.endedAgo);
    const eb = endedAgoSortKey(b.endedAgo);
    if (ea !== eb) return ea - eb;
    return b.listeners - a.listeners;
  });
}
