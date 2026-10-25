import type { ComparePayload, TweetResult } from "./api/types";

/** Home rows that came from the official X API path (not Grok mixer / seed). */
export const LIVE_HOME_DATA_SOURCES: ReadonlySet<ComparePayload["homeDataSource"]> = new Set([
  "following_timeline",
  "user_authored",
  "user_authored_app",
  "list_timeline",
  "recent_search_fallback"
]);

/**
 * Grok often emits plausible-looking status URLs whose numeric IDs 404 on X
 * (e.g. 1834567890123456789). Reject before showing or persisting.
 */
export function isSuspiciousTweetId(id: string): boolean {
  const s = String(id).trim();
  if (!/^\d{15,22}$/.test(s)) return true;
  if (/^1834567890\d{9}$/.test(s)) return true;
  if (/^1234567890\d{9}$/.test(s)) return true;

  let inc = 1;
  for (let i = 1; i < s.length; i++) {
    const a = Number(s[i - 1]);
    const b = Number(s[i]);
    if (Number.isFinite(a) && Number.isFinite(b) && b === a + 1) inc++;
    else inc = 1;
    if (inc >= 8) return true;
  }
  return false;
}

/** Grok / Pipetrix / seed rows that must not masquerade as Live X on Home. */
export function isLikelyGrokOrSyntheticTweet(t: TweetResult): boolean {
  const id = String(t.id ?? "").trim();
  if (isSuspiciousTweetId(id)) return true;

  const note = String(t.mixerNote ?? "").trim();
  if (note.length > 0) return true;

  const tags = t.tags ?? [];
  if (
    tags.some((tag) => {
      const x = String(tag).toLowerCase();
      return x === "xai-grok" || x === "feedtrix" || x === "thefeedtrix" || x.startsWith("feedtrix-");
    })
  ) {
    return true;
  }

  return false;
}

export function filterLiveHomeTimelinePosts(posts: TweetResult[]): TweetResult[] {
  return posts.filter((t) => !isLikelyGrokOrSyntheticTweet(t));
}

export function isLiveHomeDataSource(src: string | undefined): boolean {
  if (!src?.trim()) return false;
  return LIVE_HOME_DATA_SOURCES.has(src.trim() as ComparePayload["homeDataSource"]);
}
