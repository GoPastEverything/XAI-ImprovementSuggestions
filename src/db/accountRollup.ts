import type { TweetResult } from "../api/types";
import type { StoredPostDoc } from "./ifixedxDb";
import { getIfixedxDb } from "./ifixedxDb";

function normHandle(h: string): string {
  return h.replace(/^@/, "").trim().toLowerCase();
}

/** Prefer TwIMG profile URLs over placeholders when merging. */
function pickBetterAvatar(prev: string, next: string): string {
  const a = prev.trim();
  const b = next.trim();
  if (!b) return a;
  if (!a) return b;
  if (a.includes("pbs.twimg.com/profile_images") && !b.includes("pbs.twimg.com/profile_images")) return a;
  if (b.includes("pbs.twimg.com/profile_images") && !a.includes("pbs.twimg.com/profile_images")) return b;
  return b;
}

/**
 * Build / refresh local `accounts` rows from tweet-shaped data — same idea as X’s user cache.
 * Call after any ingest (API, Grok, seed, canonical) so handles converge on best-known avatars.
 */
export async function rollupAccountsFromTweetBatch(
  tweets: Iterable<TweetResult>,
  now: number = Date.now()
): Promise<void> {
  if (typeof window === "undefined") return;
  type Agg = { displayName: string; avatarUrl: string; postDelta: number };
  const byHandle = new Map<string, Agg>();

  const bump = (handleRaw: string, author: string | undefined, avatarUrl: string | undefined, posts = 1) => {
    const handleNorm = normHandle(handleRaw);
    if (!handleNorm) return;
    const prev = byHandle.get(handleNorm);
    const displayName = (author?.trim() || prev?.displayName || handleNorm).slice(0, 240);
    const av = pickBetterAvatar(prev?.avatarUrl ?? "", avatarUrl?.trim() ?? "");
    byHandle.set(handleNorm, {
      displayName,
      avatarUrl: av.slice(0, 4096),
      postDelta: (prev?.postDelta ?? 0) + posts
    });
  };

  for (const t of tweets) {
    bump(t.handle, t.author, t.avatarUrl, 1);
    const rc = t.repostContext;
    if (rc?.byHandle) bump(rc.byHandle, rc.byAuthor, rc.byAvatarUrl, 0);
  }

  if (!byHandle.size) return;

  try {
    const db = await getIfixedxDb();
    for (const [handleNorm, row] of byHandle) {
      try {
        const prev = await db.accounts.findOne(handleNorm).exec();
        await db.accounts.upsert({
          handleNorm,
          displayName: row.displayName,
          avatarUrl: pickBetterAvatar(prev?.avatarUrl ?? "", row.avatarUrl).slice(0, 4096),
          lastSeenAt: now,
          seenPostCount: (prev?.seenPostCount ?? 0) + row.postDelta
        });
      } catch {
        /* ignore single-account failures */
      }
    }
  } catch {
    /* ignore */
  }
}

/** Same rollup from persisted post rows (Explore/home merge output). */
export async function rollupAccountsFromStoredDocs(
  docs: Iterable<StoredPostDoc>,
  now?: number
): Promise<void> {
  const tweets: TweetResult[] = [];
  for (const d of docs) {
    tweets.push({
      id: d.id,
      text: d.text,
      author: d.author,
      handle: d.handle,
      createdAt: d.createdAt,
      likes: d.likes,
      retweets: d.retweets,
      replyCount: d.replyCount,
      viewCount: d.viewCount,
      hasMedia: d.hasMedia,
      tags: [],
      score: 0,
      breakdown: {},
      avatarUrl: d.avatarUrl || undefined,
      transmission: (d.transmission as TweetResult["transmission"]) ?? undefined
    });
  }
  await rollupAccountsFromTweetBatch(tweets, now);
}
