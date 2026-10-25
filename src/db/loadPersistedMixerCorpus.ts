import type { ComparePayload, TweetResult } from "../api/types";
import {
  filterLiveHomeTimelinePosts,
  isLiveHomeDataSource,
  isLikelyGrokOrSyntheticTweet
} from "../realTweetFilter";
import { isRealDataOnly } from "../realDataOnly";
import { getIfixedxDb, type StoredPostDoc } from "./ifixedxDb";

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseBreakdown(raw: string): Record<string, number> {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function storedDocToTweet(doc: StoredPostDoc, mode: "platform_style" | "refined"): TweetResult | null {
  const score = mode === "platform_style" ? doc.scorePlatform : doc.scoreRefined;
  if (!Number.isFinite(score)) return null;

  const tags = parseJsonArray(doc.tagsJson);
  const mediaUrls = parseJsonArray(doc.mediaUrlsJson);
  const breakdown =
    mode === "platform_style"
      ? parseBreakdown(doc.breakdownPlatformJson)
      : parseBreakdown(doc.breakdownRefinedJson);

  return {
    id: doc.id,
    text: doc.text,
    author: doc.author,
    handle: doc.handle,
    createdAt: doc.createdAt,
    likes: doc.likes,
    retweets: doc.retweets,
    replyCount: doc.replyCount,
    viewCount: doc.viewCount,
    hasMedia: doc.hasMedia,
    tags,
    score,
    breakdown,
    ...(doc.avatarUrl.trim() ? { avatarUrl: doc.avatarUrl } : {}),
    ...(doc.mixerNote.trim() ? { mixerNote: doc.mixerNote } : {}),
    ...(doc.videoUrl.trim() ? { videoUrl: doc.videoUrl } : {}),
    ...(mediaUrls.length ? { mediaUrls } : {}),
    ...(doc.transmission === "tx" || doc.transmission === "rtx" || doc.transmission === "qtx"
      ? { transmission: doc.transmission }
      : {})
  };
}

export type PersistedMixerCorpus = {
  platform_style: TweetResult[];
  refined: TweetResult[];
  corpusSize: number;
  /** Dominant `homeDataSource` on stored rows (what the live layer last ingested as). */
  homeDataSource?: ComparePayload["homeDataSource"];
  note: string;
};

/**
 * Rehydrates the Home mixer “live” layer from `ifixedx_local.posts` (written by `persistComparePayload`).
 * This is the browser-side stand-in for a dedicated `mixerCache` collection: ranked rows are rebuilt on read,
 * then merged with Pipetrix canonical in `App.tsx` via `mergeFeedWithUnseenCanonicalFirst`.
 */
export async function loadPersistedMixerCorpus(opts?: {
  maxPosts?: number;
  /** When true (default under real-data-only), drop Grok/seed/suspicious IDs from rehydrate. */
  liveHomeOnly?: boolean;
}): Promise<PersistedMixerCorpus | null> {
  if (typeof window === "undefined") return null;
  const maxPosts = Math.min(800, Math.max(20, opts?.maxPosts ?? 400));
  const liveHomeOnly = opts?.liveHomeOnly ?? isRealDataOnly();
  try {
    const db = await getIfixedxDb();
    const docs = await db.posts
      .find()
      .sort({ lastIngestAt: "desc" })
      .limit(maxPosts)
      .exec();

    if (!docs.length) return null;

    const platform_style: TweetResult[] = [];
    const refined: TweetResult[] = [];
    const sourceCounts = new Map<string, number>();

    for (const d of docs) {
      const src = d.homeDataSource?.trim();
      if (liveHomeOnly) {
        if (!isLiveHomeDataSource(src)) continue;
      }
      const p = storedDocToTweet(d, "platform_style");
      if (!p || (liveHomeOnly && isLikelyGrokOrSyntheticTweet(p))) continue;
      if (src) sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
      platform_style.push(p);
      const r = storedDocToTweet(d, "refined");
      if (r && !(liveHomeOnly && isLikelyGrokOrSyntheticTweet(r))) refined.push(r);
    }

    if (!platform_style.length && !refined.length) return null;

    const platformFiltered = liveHomeOnly ? filterLiveHomeTimelinePosts(platform_style) : platform_style;
    const refinedFiltered = liveHomeOnly
      ? filterLiveHomeTimelinePosts(refined.length ? refined : platform_style)
      : refined.length
        ? refined
        : platform_style;

    if (!platformFiltered.length && !refinedFiltered.length) return null;

    let homeDataSource: ComparePayload["homeDataSource"] | undefined;
    let best = 0;
    for (const [src, n] of sourceCounts) {
      if (n <= best) continue;
      best = n;
      if (
        src === "following_timeline" ||
        src === "user_authored" ||
        src === "user_authored_app" ||
        src === "list_timeline" ||
        src === "recent_search_fallback" ||
        src === "mock_seed" ||
        src === "xai_grok"
      ) {
        homeDataSource = src;
      }
    }

    return {
      platform_style: platformFiltered,
      refined: refinedFiltered.length ? refinedFiltered : platformFiltered,
      corpusSize: platformFiltered.length,
      homeDataSource,
      note: liveHomeOnly
        ? "Rehydrated from local RxDB (Live X rows only — Grok/seed excluded)."
        : "Rehydrated from local RxDB posts (last ingest)."
    };
  } catch {
    return null;
  }
}
