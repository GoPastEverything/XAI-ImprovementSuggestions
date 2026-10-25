import type { TweetResult } from "../api/types";
import { apiUrlAbsolute } from "../api/base";
import { ingestCanonicalTweetBatch } from "./canonicalIngest";
import {
  FEEDTRIX_TOPICS,
  THE_FEEDTRIX_CAP_PER_TOPIC,
  THE_FEEDTRIX_DEFAULT_BATCH
} from "./topics";
import { getTheFeedtrixDb } from "../db/thefeedtrixDb";

export type FeedtrixPrefs = Record<string, boolean>;

const defaultPrefs = (): FeedtrixPrefs =>
  Object.fromEntries(FEEDTRIX_TOPICS.map((t) => [t.id, true])) as FeedtrixPrefs;

export async function ensureFeedtrixTopicPrefs(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await getTheFeedtrixDb();
    const now = Date.now();
    for (const t of FEEDTRIX_TOPICS) {
      const prev = await db.tf_topic_prefs.findOne(t.id).exec();
      if (!prev) {
        await db.tf_topic_prefs.insert({ topicId: t.id, enabled: true, updatedAt: now });
      }
    }
  } catch {
    /* ignore */
  }
}

export async function loadFeedtrixPrefs(): Promise<FeedtrixPrefs> {
  if (typeof window === "undefined") return defaultPrefs();
  await ensureFeedtrixTopicPrefs();
  try {
    const db = await getTheFeedtrixDb();
    const docs = await db.tf_topic_prefs.find().exec();
    const next = defaultPrefs();
    for (const d of docs) {
      next[d.topicId] = Boolean(d.enabled);
    }
    return next;
  } catch {
    return defaultPrefs();
  }
}

export async function saveFeedtrixTopicEnabled(topicId: string, enabled: boolean): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await getTheFeedtrixDb();
    await db.tf_topic_prefs.upsert({
      topicId,
      enabled,
      updatedAt: Date.now()
    });
  } catch {
    /* ignore */
  }
}

export async function resetFeedtrixTopicPrefs(): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  try {
    const db = await getTheFeedtrixDb();
    for (const t of FEEDTRIX_TOPICS) {
      await db.tf_topic_prefs.upsert({ topicId: t.id, enabled: true, updatedAt: now });
    }
  } catch {
    /* ignore */
  }
}

export async function countFeedtrixTopicPosts(topicId: string): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const db = await getTheFeedtrixDb();
    const docs = await db.tf_posts.find({ selector: { topicId } }).exec();
    return docs.length;
  } catch {
    return 0;
  }
}

function entryKey(topicId: string, tweetId: string): string {
  return `${topicId}::${tweetId}`;
}

export async function upsertFeedtrixPosts(topicId: string, posts: TweetResult[]): Promise<number> {
  if (typeof window === "undefined" || !posts.length) return 0;
  try {
    const db = await getTheFeedtrixDb();
    const existing = await countFeedtrixTopicPosts(topicId);
    const capacity = Math.max(0, THE_FEEDTRIX_CAP_PER_TOPIC - existing);
    if (capacity <= 0) return 0;
    let added = 0;
    const now = Date.now();
    const slice = posts.slice(0, capacity);
    for (const p of slice) {
      const id = String(p.id);
      const key = entryKey(topicId, id);
      const prevDoc = await db.tf_posts.findOne(key).exec();
      const json = JSON.stringify(p);
      if (prevDoc) {
        await prevDoc.incrementalPatch({ tweetJson: json, ingestAt: now });
      } else {
        await db.tf_posts.insert({ entryKey: key, topicId, tweetJson: json, ingestAt: now });
        added++;
      }
    }
    void ingestCanonicalTweetBatch(slice, "grok_topic", [topicId]);
    return added;
  } catch {
    return 0;
  }
}

export type FeedtrixBatchResponse = {
  posts?: TweetResult[];
  error?: string;
  warning?: string;
  topic?: string;
  received?: number;
};

export async function fetchFeedtrixBatch(
  topicId: string,
  n: number,
  live: boolean
): Promise<FeedtrixBatchResponse> {
  const u = new URL(apiUrlAbsolute("/api/xai/the-feedtrix/batch"));
  u.searchParams.set("topic", topicId);
  u.searchParams.set("n", String(n));
  if (live) u.searchParams.set("live", "1");
  const res = await fetch(u.toString(), { credentials: "include" });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  const obj = parsed as { error?: string; posts?: TweetResult[] };
  if (!res.ok) {
    return {
      error:
        typeof obj.error === "string"
          ? obj.error
          : text.trim().slice(0, 200) || `HTTP ${res.status}`
    };
  }
  return parsed as FeedtrixBatchResponse;
}

export async function loadFeedtrixPostsForMergedFeed(prefs: FeedtrixPrefs): Promise<TweetResult[]> {
  if (typeof window === "undefined") return [];
  try {
    const db = await getTheFeedtrixDb();
    const all = await db.tf_posts.find().exec();
    const out: TweetResult[] = [];
    for (const d of all) {
      if (prefs[d.topicId] === false) continue;
      try {
        out.push(JSON.parse(d.tweetJson) as TweetResult);
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

let rrCursor = 0;

export async function pickNextFeedtrixTopicSlug(prefs: FeedtrixPrefs): Promise<string | null> {
  const n = FEEDTRIX_TOPICS.length;
  for (let i = 0; i < n; i++) {
    const idx = (rrCursor + i) % n;
    const t = FEEDTRIX_TOPICS[idx];
    if (!t) continue;
    if (prefs[t.id] === false) continue;
    const c = await countFeedtrixTopicPosts(t.id);
    if (c < THE_FEEDTRIX_CAP_PER_TOPIC) {
      rrCursor = (idx + 1) % n;
      return t.id;
    }
  }
  return null;
}

export async function runSingleFeedtrixBackgroundTick(
  prefs: FeedtrixPrefs,
  liveSearch: boolean
): Promise<void> {
  const slug = await pickNextFeedtrixTopicSlug(prefs);
  if (!slug) return;
  const cur = await countFeedtrixTopicPosts(slug);
  if (cur >= THE_FEEDTRIX_CAP_PER_TOPIC) return;
  const remaining = THE_FEEDTRIX_CAP_PER_TOPIC - cur;
  const ask = Math.min(THE_FEEDTRIX_DEFAULT_BATCH, remaining);
  const res = await fetchFeedtrixBatch(slug, ask, liveSearch);
  if (!res.posts?.length || res.error) return;
  await upsertFeedtrixPosts(slug, res.posts);
}
