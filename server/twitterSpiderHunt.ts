import { fetchRecentSearchWithBearerFallback } from "./corpus.js";
import { fetchHomeFeedWithFallbacks } from "./forYouCorpus.js";
import { pickRotatingIndex } from "./liveDiscoveryQueries.js";
import { dedupeTweetsById } from "./tweetDedupe.js";
import type { Tweet } from "./search.js";
import { ingestTweetsIntoSpiderPipe } from "./twitterSpiderPipe.js";

export const TWITTER_SPIDER_RECENT_QUERIES = [
  "lang:en -is:retweet -is:reply",
  "lang:en has:links -is:retweet",
  "lang:en (breaking OR trending) -is:retweet",
  "lang:en (#news OR #tech) -is:retweet",
  '("live" OR "breaking") lang:en -is:retweet',
  "lang:en min_faves:5 -is:retweet",
  "lang:en has:images -is:retweet",
  "lang:en has:videos -is:retweet"
] as const;

export type TwitterSpiderHuntResult = {
  ingested: number;
  updated: number;
  duplicatesRemoved: number;
  total: number;
  queries: string[];
  warning?: string;
};

export async function runTwitterSpiderHunt(
  env: NodeJS.ProcessEnv,
  sessionId: string | null,
  huntPass: number,
  opts?: { maxPerQuery?: number; includeHomeSample?: boolean }
): Promise<TwitterSpiderHuntResult> {
  const maxPerQuery = Math.min(50, Math.max(10, opts?.maxPerQuery ?? 25));
  const qIdx = pickRotatingIndex(huntPass, TWITTER_SPIDER_RECENT_QUERIES.length, 0);
  const q2Idx = pickRotatingIndex(huntPass + 2, TWITTER_SPIDER_RECENT_QUERIES.length, 5);
  const queries = [
    TWITTER_SPIDER_RECENT_QUERIES[qIdx]!,
    TWITTER_SPIDER_RECENT_QUERIES[q2Idx]!
  ];

  const warnings: string[] = [];
  const batches: Tweet[][] = [];

  for (const query of queries) {
    try {
      const tweets = await fetchRecentSearchWithBearerFallback(
        env,
        query,
        maxPerQuery,
        true,
        sessionId
      );
      if (tweets.length) batches.push(tweets);
    } catch (e) {
      warnings.push(`search: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (opts?.includeHomeSample !== false && sessionId) {
    try {
      const home = await fetchHomeFeedWithFallbacks(env, Math.min(30, maxPerQuery), null, sessionId);
      if (home.tweets.length) batches.push(home.tweets);
    } catch {
      /* optional */
    }
  }

  const merged = dedupeTweetsById(batches.flat());
  const r = await ingestTweetsIntoSpiderPipe(merged, {
    query: queries.join(" | "),
    source: "x_recent_search"
  });

  return {
    ingested: r.added,
    updated: r.updated,
    duplicatesRemoved: r.duplicatesRemoved,
    total: r.total,
    queries,
    ...(warnings.length ? { warning: warnings.join(" · ") } : {})
  };
}
