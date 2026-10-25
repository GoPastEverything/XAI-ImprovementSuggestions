import type { TweetResult, ComparePayload } from "../api/types";
import { shouldIngestCanonicalFromPayload } from "../realDataOnly";
import { rollupAccountsFromTweetBatch } from "../db/accountRollup";
import { getTheFeedtrixDb } from "../db/thefeedtrixDb";
import { feedTopicSlugFromTag } from "../mixer/topicPrefs";

/** Aligns with Grok / pipeline naming — extend as sources grow (e.g. user_post). */
export type CanonicalSourceType =
  | "grok_topic"
  | "grok_mixer"
  | "live_api"
  | "twitter_spider"
  | "seed"
  | "user_post"
  | "repost";

/** Snapshot of Ranking lab sliders at ingest time (stored in mixerMetaJson). */
export type RankingLabMixerSnapshot = {
  recencyWeight: number;
  strictMatch: boolean;
  maxResults: number;
};

function mergeMixerMetaJson(
  prevRaw: string | undefined,
  rankingLab: RankingLabMixerSnapshot | null | undefined,
  refinedScoring?: any
): string {
  let base: Record<string, unknown> = {};
  if (prevRaw) {
    try {
      const p = JSON.parse(prevRaw) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) base = p as Record<string, unknown>;
    } catch {
      /* keep empty */
    }
  }
  if (rankingLab != null) {
    base.rankingLab = rankingLab;
    base.rankingLabCapturedAt = Date.now();
  }
  if (refinedScoring) {
    base.refinedScoring = refinedScoring;
    base.refinedScoringCapturedAt = Date.now();
  }
  return JSON.stringify(base);
}

function parseTopicIdsJson(raw: string): string[] {
  try {
    const p = JSON.parse(raw) as unknown;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function mergeTopicIdsJson(existingJson: string | undefined, add: string[]): string {
  const s = new Set(parseTopicIdsJson(existingJson ?? "[]"));
  for (const t of add) {
    if (t) s.add(t);
  }
  return JSON.stringify([...s].sort());
}

export function inferTopicIdsFromTweet(t: TweetResult): string[] {
  const out: string[] = [];
  for (const tag of t.tags ?? []) {
    const slug = feedTopicSlugFromTag(tag);
    if (slug) out.push(slug);
  }
  return out;
}

export function canonicalSourceFromComparePayload(
  p: ComparePayload,
  override?: CanonicalSourceType
): CanonicalSourceType {
  if (override) return override;
  if (p.feed === "home_reverse_chronological") {
    switch (p.homeDataSource) {
      case "xai_grok":
        return "grok_mixer";
      case "mock_seed":
        return "seed";
      default:
        return "live_api";
    }
  }
  if (p.source === "mock") return "seed";
  if (p.source === "live") return "live_api";
  return "grok_mixer";
}

function resolveSourceForTweet(
  base: CanonicalSourceType,
  t: TweetResult,
  extraTopicIds?: string[]
): CanonicalSourceType {
  if (inferTopicIdsFromTweet(t).length > 0 || (extraTopicIds?.length ?? 0) > 0) return "grok_topic";
  return base;
}

export async function upsertCanonicalTweet(
  tweet: TweetResult,
  sourceType: CanonicalSourceType,
  extraTopicIds?: string[],
  rankingLab?: RankingLabMixerSnapshot | null
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await getTheFeedtrixDb();
    const id = String(tweet.id);
    const now = Date.now();
    const json = JSON.stringify(tweet);
    const fromTweet = [...inferTopicIdsFromTweet(tweet), ...(extraTopicIds ?? [])];
    const resolvedSource = resolveSourceForTweet(sourceType, tweet, extraTopicIds);

    // Pull refinedScoring from the tweet if the server provided it
    const refinedScoring = (tweet as any).refinedScoring ?? undefined;

    const prevDoc = await db.tf_canonical_posts.findOne(id).exec();
    if (prevDoc) {
      const topicIdsJson = mergeTopicIdsJson(prevDoc.topicIdsJson, fromTweet);
      const newMeta = mergeMixerMetaJson(prevDoc.mixerMetaJson, rankingLab, refinedScoring);
      await prevDoc.incrementalPatch({
        tweetJson: json,
        sourceType: resolvedSource,
        ingestedAt: now,
        topicIdsJson,
        mixerMetaJson: newMeta,
      });
    } else {
      await db.tf_canonical_posts.insert({
        id,
        tweetJson: json,
        sourceType: resolvedSource,
        ingestedAt: now,
        topicIdsJson: mergeTopicIdsJson("[]", fromTweet),
        mixerMetaJson: mergeMixerMetaJson(undefined, rankingLab, refinedScoring),
        seen: false,
      });
    }
  } catch {
    /* ignore browser/storage failures */
  }
}

export async function stageOptimisticUserPost(tweet: TweetResult): Promise<void> {
  await upsertCanonicalTweet(tweet, "user_post");
}

export async function ingestCanonicalTweetBatch(
  posts: TweetResult[],
  sourceType: CanonicalSourceType,
  topicIds?: string[],
  rankingLab?: RankingLabMixerSnapshot | null
): Promise<number> {
  if (typeof window === "undefined" || !posts.length) return 0;
  const seen = new Set<string>();
  let n = 0;
  for (const p of posts) {
    const id = String(p.id);
    if (seen.has(id)) continue;
    seen.add(id);
    await upsertCanonicalTweet(p, sourceType, topicIds, rankingLab);
    n++;
  }
  await rollupAccountsFromTweetBatch(posts);
  return n;
}

export async function ingestCanonicalFromComparePayload(
  p: ComparePayload,
  opts?: {
    sourceOverride?: CanonicalSourceType;
    rankingLab?: RankingLabMixerSnapshot | null;
  }
): Promise<number> {
  if (typeof window === "undefined") return 0;
  const base = canonicalSourceFromComparePayload(p, opts?.sourceOverride);
  if (!shouldIngestCanonicalFromPayload(p)) return 0;
  const plat = p.platform_style ?? [];
  const ref = p.refined ?? [];
  const byId = new Map<string, TweetResult>();
  for (const t of [...plat, ...ref]) byId.set(String(t.id), t);
  let n = 0;
  const rankingLab = opts?.rankingLab;
  for (const t of byId.values()) {
    await upsertCanonicalTweet(t, base, undefined, rankingLab);
    n++;
  }
  await rollupAccountsFromTweetBatch(byId.values());
  return n;
}
