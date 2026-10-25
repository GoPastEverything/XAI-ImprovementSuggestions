import type { TweetResult } from "../api/types";
import { getTheFeedtrixDb } from "../db/thefeedtrixDb";
import type { TopicPrefsRecord } from "../mixer/topicPrefs";
import { tweetVisibleForTopicPrefs } from "../mixer/topicPrefs";
import { canonicalSourceAllowsRealOnly, isRealDataOnly } from "../realDataOnly";

/** Parses canonical rows into tweets the Home mixer can merge (respects Feedtrix topic prefs). */
export async function loadCanonicalPostsForMixer(prefs: TopicPrefsRecord): Promise<TweetResult[]> {
  if (typeof window === "undefined") return [];
  try {
    const db = await getTheFeedtrixDb();
    const docs = await db.tf_canonical_posts.find().exec();
    const out: TweetResult[] = [];
    for (const d of docs) {
      try {
        if (isRealDataOnly() && !canonicalSourceAllowsRealOnly(d.sourceType as "live_api")) continue;
        const t = JSON.parse(d.tweetJson) as TweetResult;
        if (!tweetVisibleForTopicPrefs(t, prefs)) continue;
        out.push(t);
      } catch {
        /* skip corrupt */
      }
    }
    out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return out;
  } catch {
    return [];
  }
}

/**
 * Reactive candidate pool from TheFeedtrix canonical store (RxDB → mixer gather phase).
 * Refetch whenever prefs change via effect deps; subscribe catches ingest/background fills.
 */
export async function subscribeCanonicalMixerPosts(
  getPrefs: () => TopicPrefsRecord,
  onUpdate: (posts: TweetResult[]) => void
): Promise<() => void> {
  const db = await getTheFeedtrixDb();
  const flush = () => {
    void loadCanonicalPostsForMixer(getPrefs()).then(onUpdate);
  };
  flush();
  const sub = db.tf_canonical_posts.find().$.subscribe(flush);
  return () => sub.unsubscribe();
}
