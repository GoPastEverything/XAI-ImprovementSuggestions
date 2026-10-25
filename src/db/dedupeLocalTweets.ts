import { getIfixedxDb } from "./ifixedxDb";
import { getTheFeedtrixDb } from "./thefeedtrixDb";

const DEDUPE_ONCE_KEY = "ix_dedupe_local_tweets_v1";

/** Remove duplicate tweet ids from Pipetrix + iFixedX local stores (keeps newest ingestedAt). */
export async function dedupeLocalTweetStores(): Promise<{
  canonicalRemoved: number;
  topicPostsRemoved: number;
  postsRemoved: number;
}> {
  if (typeof window === "undefined") {
    return { canonicalRemoved: 0, topicPostsRemoved: 0, postsRemoved: 0 };
  }

  let canonicalRemoved = 0;
  let topicPostsRemoved = 0;
  let postsRemoved = 0;

  try {
    const tf = await getTheFeedtrixDb();
    const canonDocs = await tf.tf_canonical_posts.find().exec();
    const byCanonId = new Map<string, typeof canonDocs>();
    for (const d of canonDocs) {
      const list = byCanonId.get(d.id) ?? [];
      list.push(d);
      byCanonId.set(d.id, list);
    }
    for (const [, list] of byCanonId) {
      if (list.length <= 1) continue;
      list.sort((a, b) => b.ingestedAt - a.ingestedAt);
      for (let i = 1; i < list.length; i++) {
        await list[i]!.remove();
        canonicalRemoved++;
      }
    }

    const topicDocs = await tf.tf_posts.find().exec();
    const byEntry = new Map<string, typeof topicDocs>();
    for (const d of topicDocs) {
      const key = d.entryKey;
      const list = byEntry.get(key) ?? [];
      list.push(d);
      byEntry.set(key, list);
    }
    for (const [, list] of byEntry) {
      if (list.length <= 1) continue;
      list.sort((a, b) => b.ingestAt - a.ingestAt);
      for (let i = 1; i < list.length; i++) {
        await list[i]!.remove();
        topicPostsRemoved++;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const ix = await getIfixedxDb();
    const postDocs = await ix.posts.find().exec();
    const byPostId = new Map<string, typeof postDocs>();
    for (const d of postDocs) {
      const list = byPostId.get(d.id) ?? [];
      list.push(d);
      byPostId.set(d.id, list);
    }
    for (const [, list] of byPostId) {
      if (list.length <= 1) continue;
      list.sort((a, b) => b.lastIngestAt - a.lastIngestAt);
      for (let i = 1; i < list.length; i++) {
        await list[i]!.remove();
        postsRemoved++;
      }
    }
  } catch {
    /* ignore */
  }

  return { canonicalRemoved, topicPostsRemoved, postsRemoved };
}

export async function runOneTimeLocalTweetDedupe(): Promise<void> {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(DEDUPE_ONCE_KEY) === "1") return;
  const r = await dedupeLocalTweetStores();
  sessionStorage.setItem(DEDUPE_ONCE_KEY, "1");
  if (r.canonicalRemoved + r.topicPostsRemoved + r.postsRemoved > 0) {
    console.info(
      `[ifixedx] Removed duplicate tweets: canonical ${r.canonicalRemoved}, topic ${r.topicPostsRemoved}, posts ${r.postsRemoved}`
    );
  }
}
