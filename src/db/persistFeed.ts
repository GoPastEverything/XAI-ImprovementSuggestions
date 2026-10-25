import type { ComparePayload, TweetResult } from "../api/types";
import { isLikelyGrokOrSyntheticTweet, isLiveHomeDataSource } from "../realTweetFilter";
import { isRealDataOnly } from "../realDataOnly";
import { rollupAccountsFromStoredDocs } from "./accountRollup";
import { getIfixedxDb, type StoredPostDoc } from "./ifixedxDb";

function dsKey(payload: ComparePayload): string {
  return (
    payload.homeDataSource ??
    (payload.feed === "home_reverse_chronological" ? "home_unknown" : `explore_${payload.source ?? "unknown"}`)
  );
}

function tweetToPartialStored(
  t: TweetResult,
  mode: "platform_style" | "refined",
  payload: ComparePayload,
  now: number
): Omit<StoredPostDoc, never> {
  const homeDataSource = dsKey(payload);
  const base: StoredPostDoc = {
    id: String(t.id),
    handle: String(t.handle ?? "").slice(0, 100),
    author: String(t.author ?? "").slice(0, 240),
    text: String(t.text ?? ""),
    createdAt: String(t.createdAt ?? ""),
    likes: Math.max(0, Math.floor(Number(t.likes) || 0)),
    retweets: Math.max(0, Math.floor(Number(t.retweets) || 0)),
    replyCount: Math.max(0, Math.floor(typeof t.replyCount === "number" ? t.replyCount : 0)),
    viewCount: Math.max(
      0,
      Math.floor(typeof t.viewCount === "number" && t.viewCount >= 0 ? t.viewCount : 0)
    ),
    hasMedia: Boolean(t.hasMedia),
    scorePlatform: mode === "platform_style" ? t.score : 0,
    scoreRefined: mode === "refined" ? t.score : 0,
    breakdownPlatformJson:
      mode === "platform_style" ? JSON.stringify(t.breakdown ?? {}) : "{}",
    breakdownRefinedJson: mode === "refined" ? JSON.stringify(t.breakdown ?? {}) : "{}",
    tagsJson: JSON.stringify(t.tags ?? []),
    mediaUrlsJson: JSON.stringify(t.mediaUrls ?? []),
    avatarUrl: (t.avatarUrl ?? "").slice(0, 4096),
    mixerNote: (t.mixerNote ?? "").slice(0, 32000),
    homeDataSource: homeDataSource.slice(0, 100),
    transmission: String(t.transmission ?? "").slice(0, 16),
    videoUrl: (t.videoUrl ?? "").slice(0, 4096),
    lastIngestAt: now
  };
  return base;
}

/**
 * Upserts every tweet in the payload into `posts` (full text, scores, media JSON, etc.).
 * Account rollups go to `accounts`; raw Grok batches go to `grok_ingests` when present.
 * This does not filter by “seen” — duplicate IDs still refresh `lastIngestAt` so offline corpora stay complete.
 * Client-side dedupe of the UI uses the separate `seen_items` collection (`src/db/seenItems.ts`).
 */
function shouldPersistTweet(t: TweetResult, payload: ComparePayload): boolean {
  if (!isRealDataOnly()) return true;
  if (payload.feed !== "home_reverse_chronological") return true;
  const src = dsKey(payload);
  if (!isLiveHomeDataSource(src)) return false;
  return !isLikelyGrokOrSyntheticTweet(t);
}

export async function persistComparePayload(payload: ComparePayload): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await getIfixedxDb();
    const platform = (payload.platform_style ?? []).filter((t) => shouldPersistTweet(t, payload));
    const refined = (payload.refined ?? []).filter((t) => shouldPersistTweet(t, payload));
    const refinedById = new Map(refined.map((t) => [String(t.id), t]));
    const now = Date.now();

    const merged = new Map<string, StoredPostDoc>();

    for (const t of platform) {
      const doc = tweetToPartialStored(t, "platform_style", payload, now);
      merged.set(doc.id, doc);
    }
    for (const t of refined) {
      const id = String(t.id);
      const existing = merged.get(id);
      if (existing) {
        existing.scoreRefined = t.score;
        existing.breakdownRefinedJson = JSON.stringify(t.breakdown ?? {});
        existing.lastIngestAt = now;
      } else {
        const doc = tweetToPartialStored(t, "refined", payload, now);
        merged.set(id, doc);
      }
    }

    for (const doc of merged.values()) {
      const r = refinedById.get(doc.id);
      if (r) {
        doc.scoreRefined = r.score;
        doc.breakdownRefinedJson = JSON.stringify(r.breakdown ?? {});
      }
    }

    await db.posts.bulkUpsert([...merged.values()]);
    await rollupAccountsFromStoredDocs(merged.values(), now);

    const hasMediaUrls = [...merged.values()].some((d) => {
      try {
        const urls = JSON.parse(d.mediaUrlsJson) as unknown;
        return Array.isArray(urls) && urls.length > 0;
      } catch {
        return false;
      }
    });
    if (hasMediaUrls) {
      try {
        sessionStorage.setItem("ix_posts_media_schema_v2", "2");
      } catch {
        /* ignore */
      }
    }

    if (payload.xaiIngest?.items?.length) {
      try {
        const ingestId = `grok-${now}-${Math.random().toString(36).slice(2, 10)}`;
        const itemsJson = JSON.stringify(payload.xaiIngest.items);
        if (itemsJson.length > 890_000) {
          console.warn("[ifixedx] Grok ingest JSON too large for local store; skipping raw backup row.");
        } else {
          await db.grok_ingests.insert({
            id: ingestId,
            storedAt: now,
            isoStoredAt: payload.xaiIngest.storedAt,
            model: String(payload.xaiIngest.model ?? ""),
            liveSearch: Boolean(payload.xaiIngest.liveSearch),
            warning: String(payload.xaiIngest.warning ?? ""),
            itemsJson,
            homeDataSource: "xai_grok"
          });
        }
      } catch (e) {
        console.warn("[ifixedx] grok_ingests insert failed:", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.warn("[ifixedx] RxDB persist skipped:", e instanceof Error ? e.message : e);
  }
}
