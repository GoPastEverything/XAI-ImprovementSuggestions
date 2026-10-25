import { twimgDisplaySrcCandidates } from "./api/twimgProxy";

/** `https://x.com/handle/photo` (and twitter.com) are not image bytes — using them in `<img src>` causes connection churn when scrolling. */
export function isEmbeddableProfileImageUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  if (t.startsWith("/")) return true;
  if (!/^https:\/\//i.test(t)) return false;
  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "x.com" || host === "twitter.com") {
      if (/\/photo\/?$/i.test(u.pathname)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Avatar `<img src>` list for AvatarWithFallbacks.
 *
 * We intentionally never load `https://x.com/{handle}/photo` in the browser: X often terminates those
 * connections (`net::ERR_CONNECTION_CLOSED`), wastes retries, and floods the console — without fixing pfps.
 *
 * When `avatarUrl` is present (TwIMG etc.), candidates are **direct TwIMG then** `/api/cdn/twimg` (see `twimgDisplaySrcCandidates`).
 * When absent, return no URLs → initials immediately (no extra network churn).
 */
export function avatarImageCandidates(opts: { handle: string; avatarUrl?: string }): string[] {
  const au = opts.avatarUrl?.trim();
  if (!au) return [];
  if (au.startsWith("/")) return [au];
  if (/^https:\/\//i.test(au)) {
    if (!isEmbeddableProfileImageUrl(au)) return [];
    return twimgDisplaySrcCandidates(au);
  }
  return [];
}
