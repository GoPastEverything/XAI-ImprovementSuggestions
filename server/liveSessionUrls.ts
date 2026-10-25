/** Parse X Space / Broadcast URLs returned by Grok into stable IDs for validation. */

const SPACE_PATH = /^\/i\/spaces\/([A-Za-z0-9]+)(?:\/|$)/i;
const BROADCAST_PATH = /^\/i\/broadcasts\/([A-Za-z0-9]+)(?:\/|$)/i;

export function normalizeLiveSessionUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return u;
  u = u.replace(/^http:\/\//i, "https://");
  u = u.replace(/^(https:\/\/)twitter\.com/i, "$1x.com");
  u = u.replace(/\/peck\b/gi, "/peek");
  return u;
}

export function parseSpaceIdFromUrl(url: string): string | null {
  try {
    const u = new URL(normalizeLiveSessionUrl(url));
    const m = u.pathname.match(SPACE_PATH);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function parseBroadcastIdFromUrl(url: string): string | null {
  try {
    const u = new URL(normalizeLiveSessionUrl(url));
    const m = u.pathname.match(BROADCAST_PATH);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isCanonicalLiveSessionUrl(url: string, kind: "space" | "broadcast"): boolean {
  const norm = normalizeLiveSessionUrl(url);
  if (!/^https:\/\/(x\.com|twitter\.com)\//i.test(norm)) return false;
  return kind === "space" ? Boolean(parseSpaceIdFromUrl(norm)) : Boolean(parseBroadcastIdFromUrl(norm));
}
