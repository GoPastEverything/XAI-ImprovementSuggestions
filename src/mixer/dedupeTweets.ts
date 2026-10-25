import type { TweetResult } from "../api/types";

export function isPlausibleTweetId(id: string): boolean {
  return /^\d{15,22}$/.test(String(id).trim());
}

function tweetRowQuality(t: TweetResult): number {
  let q = 0;
  if (t.hasMedia) q += 50;
  if (t.mediaUrls?.length) q += 20;
  if (t.videoUrl) q += 30;
  q += Math.min(9999, (t.likes ?? 0) + (t.retweets ?? 0) * 2);
  return q;
}

/** Timeline guard: one card per X tweet id. */
export function dedupeTweetsById(rows: TweetResult[]): TweetResult[] {
  const byId = new Map<string, TweetResult>();
  for (const t of rows) {
    const id = String(t.id ?? "").trim();
    if (!isPlausibleTweetId(id)) continue;
    const prev = byId.get(id);
    if (!prev || tweetRowQuality(t) > tweetRowQuality(prev)) {
      byId.set(id, t);
    }
  }
  return [...byId.values()];
}
