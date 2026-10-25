import { isLikelyGrokOrSyntheticTweet } from "../realTweetFilter";
import { getIfixedxDb } from "./ifixedxDb";

const GROK_HOME_SOURCES = new Set(["xai_grok", "mock_seed", "home_unknown", ""]);

/**
 * Removes Grok/seed/suspicious rows from `ifixedx_local.posts` so Live Home rehydrate cannot resurrect 404 IDs.
 */
export async function purgeSyntheticPostsFromLocalDb(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const db = await getIfixedxDb();
    const docs = await db.posts.find().exec();
    const removeIds: string[] = [];
    for (const d of docs) {
      const src = d.homeDataSource?.trim() ?? "";
      if (GROK_HOME_SOURCES.has(src) || src.includes("grok")) {
        removeIds.push(d.id);
        continue;
      }
      const tags = (() => {
        try {
          const v = JSON.parse(d.tagsJson) as unknown;
          return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
        } catch {
          return [];
        }
      })();
      const stub: import("../api/types").TweetResult = {
        id: d.id,
        text: d.text,
        author: d.author,
        handle: d.handle,
        createdAt: d.createdAt,
        likes: d.likes,
        retweets: d.retweets,
        tags,
        score: d.scorePlatform,
        hasMedia: d.hasMedia,
        breakdown: {},
        ...(d.mixerNote.trim() ? { mixerNote: d.mixerNote } : {})
      };
      if (isLikelyGrokOrSyntheticTweet(stub)) removeIds.push(d.id);
    }
    if (!removeIds.length) return 0;
    const uniq = [...new Set(removeIds)];
    const toDrop = await db.posts.findByIds(uniq).exec();
    await Promise.all([...toDrop.values()].map((d) => d.remove()));
    return uniq.length;
  } catch {
    return 0;
  }
}
