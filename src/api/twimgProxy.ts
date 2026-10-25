import { apiUrlAbsolute } from "./base";

const TWIMG_HOSTS = new Set(["pbs.twimg.com", "abs.twimg.com", "video.twimg.com"]);

export function needsTwimgProxy(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && TWIMG_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function proxyUrlForTwimg(t: string): string {
  return apiUrlAbsolute(`/api/cdn/twimg?u=${encodeURIComponent(t)}`);
}

/**
 * Ordered `<img>` / `<video>` `src` candidates for X static assets.
 * **Direct TwIMG URL first** — many hosts block *server-side* fetches (502 from `/api/cdn/twimg`) while the
 * visitor's browser can still load `pbs.twimg.com` with `referrerPolicy="no-referrer"`.
 * Second: same-origin proxy for edge cases (e.g. strict browser blocking, offline corpora).
 */
export function twimgDisplaySrcCandidates(url: string | undefined): string[] {
  if (!url?.trim()) return [];
  const t = url.trim();
  if (t.startsWith("/")) return [t];
  if (!needsTwimgProxy(t)) return [t];
  if (typeof window === "undefined") return [proxyUrlForTwimg(t)];
  return [t, proxyUrlForTwimg(t)];
}

/**
 * Single best-effort URL (proxy in SSR/build; browser callers should prefer `twimgDisplaySrcCandidates` for `<img>`).
 */
export function proxiedTwimgUrl(url: string | undefined): string | undefined {
  if (!url?.trim()) return url;
  const t = url.trim();
  if (t.startsWith("/")) return t;
  if (!needsTwimgProxy(t)) return t;
  if (typeof window === "undefined") return t;
  return proxyUrlForTwimg(t);
}
