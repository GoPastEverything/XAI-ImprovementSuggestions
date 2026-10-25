import type { Tweet } from "./search.js";

/** Snowflake-style X tweet ids (15–22 digits). */
export function isPlausibleTweetId(id: string): boolean {
  return /^\d{15,22}$/.test(String(id).trim());
}

export function tweetStableKey(t: { id: string }): string {
  const id = String(t.id ?? "").trim();
  return isPlausibleTweetId(id) ? id : `bad:${id}`;
}

/** One row per tweet id; prefer row with media / higher engagement. */
export function dedupeTweetsById<T extends Tweet>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const t of rows) {
    const key = tweetStableKey(t);
    if (!isPlausibleTweetId(key)) continue;
    const prev = byId.get(key);
    if (!prev || tweetRowQuality(t) > tweetRowQuality(prev)) {
      byId.set(key, t);
    }
  }
  return [...byId.values()];
}

function tweetRowQuality(t: Tweet): number {
  let q = 0;
  if (t.hasMedia) q += 50;
  if (t.mediaUrls?.length) q += 20 + Math.min(t.mediaUrls.length, 4) * 5;
  if (t.videoUrl) q += 30;
  if (t.text?.trim()) q += 10;
  q += Math.min(9999, (t.likes ?? 0) + (t.retweets ?? 0) * 2);
  return q;
}
