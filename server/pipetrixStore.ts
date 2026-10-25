import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dedupeTweetsById, isPlausibleTweetId } from "./tweetDedupe.js";
import type { Tweet } from "./search.js";
import { loadTwitterSpiderPipe } from "./twitterSpiderPipe.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "..", "data");
const STORE_PATH = join(DATA_DIR, "pipetrix-canonical.json");

const DEFAULT_MAX_POSTS = 15_000;

export type ServerCanonicalSourceType =
  | "twitter_spider"
  | "live_api"
  | "grok_mixer"
  | "grok_topic"
  | "seed"
  | "user_post"
  | "repost";

const SOURCE_PRIORITY: Record<ServerCanonicalSourceType, number> = {
  live_api: 50,
  user_post: 50,
  twitter_spider: 40,
  grok_topic: 30,
  grok_mixer: 20,
  repost: 20,
  seed: 10
};

export type PipetrixCanonicalRow = {
  id: string;
  tweetJson: string;
  sourceType: ServerCanonicalSourceType;
  ingestedAt: number;
  firstIngestedAt: number;
  topicIdsJson: string;
  /** false when TwitterSpider validation marks tweet dead */
  isActive: boolean;
};

export type PipetrixCanonicalFile = {
  version: 1;
  storeName: "PipetrixCanonical";
  updatedAt: number;
  posts: PipetrixCanonicalRow[];
};

function maxPosts(env: NodeJS.ProcessEnv): number {
  const n = Number(env.PIPETRIX_MAX_CANONICAL ?? DEFAULT_MAX_POSTS);
  return Math.min(50_000, Math.max(500, Number.isFinite(n) ? Math.floor(n) : DEFAULT_MAX_POSTS));
}

function emptyStore(): PipetrixCanonicalFile {
  return { version: 1, storeName: "PipetrixCanonical", updatedAt: 0, posts: [] };
}

function dedupeRows(rows: PipetrixCanonicalRow[]): PipetrixCanonicalRow[] {
  const byId = new Map<string, PipetrixCanonicalRow>();
  for (const r of rows) {
    if (!isPlausibleTweetId(r.id)) continue;
    const prev = byId.get(r.id);
    if (!prev || r.ingestedAt > prev.ingestedAt) {
      byId.set(r.id, r);
    }
  }
  return [...byId.values()];
}

export async function loadPipetrixStore(): Promise<PipetrixCanonicalFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const s = JSON.parse(raw) as PipetrixCanonicalFile;
    if (s?.version === 1 && s.storeName === "PipetrixCanonical" && Array.isArray(s.posts)) {
      const deduped = dedupeRows(s.posts);
      if (deduped.length !== s.posts.length) {
        s.posts = deduped;
        await savePipetrixStore(s, process.env);
      } else {
        s.posts = deduped;
      }
      return s;
    }
  } catch {
    /* new store */
  }
  return emptyStore();
}

export async function savePipetrixStore(
  store: PipetrixCanonicalFile,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const cap = maxPosts(env);
  const now = Date.now();
  const sorted = dedupeRows(store.posts).sort((a, b) => b.ingestedAt - a.ingestedAt);
  const out: PipetrixCanonicalFile = {
    ...store,
    updatedAt: now,
    posts: sorted.slice(0, cap)
  };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(out), "utf8");
}

export function pipetrixStats(store: PipetrixCanonicalFile) {
  const bySource: Record<string, number> = {};
  let active = 0;
  for (const p of store.posts) {
    bySource[p.sourceType] = (bySource[p.sourceType] ?? 0) + 1;
    if (p.isActive) active++;
  }
  return {
    total: store.posts.length,
    active,
    inactive: store.posts.length - active,
    bySource,
    storeUpdatedAt: store.updatedAt
  };
}

export async function getPipetrixStatsPayload() {
  const store = await loadPipetrixStore();
  return pipetrixStats(store);
}

export async function upsertServerCanonicalTweets(
  tweets: Tweet[],
  sourceType: ServerCanonicalSourceType,
  opts?: { topicIds?: string[]; isActive?: boolean }
): Promise<{ added: number; updated: number; total: number }> {
  const store = await loadPipetrixStore();
  const now = Date.now();
  const byId = new Map(store.posts.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;
  const topicIdsJson = JSON.stringify(opts?.topicIds ?? []);
  const activeDefault = opts?.isActive !== false;

  for (const t of dedupeTweetsById(tweets)) {
    const id = String(t.id ?? "").trim();
    if (!isPlausibleTweetId(id)) continue;
    const json = JSON.stringify(t);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, {
        id,
        tweetJson: json,
        sourceType,
        ingestedAt: now,
        firstIngestedAt: now,
        topicIdsJson,
        isActive: activeDefault
      });
      added++;
      continue;
    }
    prev.tweetJson = json;
    prev.ingestedAt = now;
    if (activeDefault) prev.isActive = true;
    if (topicIdsJson !== "[]") prev.topicIdsJson = topicIdsJson;
    if ((SOURCE_PRIORITY[sourceType] ?? 0) >= (SOURCE_PRIORITY[prev.sourceType] ?? 0)) {
      prev.sourceType = sourceType;
    }
    updated++;
  }

  store.posts = [...byId.values()];
  await savePipetrixStore(store);
  return { added, updated, total: store.posts.length };
}

/** Mirror active TwitterSpider pipe rows into the server Pipetrix store. */
export async function syncSpiderPipeToPipetrix(): Promise<{ synced: number; total: number }> {
  const pipe = await loadTwitterSpiderPipe();
  const activeTweets: Tweet[] = [];
  const inactiveIds = new Set<string>();

  for (const r of pipe.records) {
    if (!isPlausibleTweetId(r.tweetId)) continue;
    if (!r.isActive) {
      inactiveIds.add(r.tweetId);
      continue;
    }
    try {
      activeTweets.push(JSON.parse(r.tweetJson) as Tweet);
    } catch {
      /* skip */
    }
  }

  await upsertServerCanonicalTweets(activeTweets, "twitter_spider", { isActive: true });

  if (inactiveIds.size) {
    const store = await loadPipetrixStore();
    const now = Date.now();
    let touched = 0;
    for (const p of store.posts) {
      if (p.sourceType === "twitter_spider" && inactiveIds.has(p.id) && p.isActive) {
        p.isActive = false;
        p.ingestedAt = now;
        touched++;
      }
    }
    if (touched) await savePipetrixStore(store);
  }

  const store = await loadPipetrixStore();
  return { synced: activeTweets.length, total: store.posts.length };
}

export type PipetrixClientPost = { tweet: Tweet; sourceType: ServerCanonicalSourceType };

export async function listPipetrixBatchForClient(opts: {
  limit: number;
  sinceMs?: number;
  sourceTypes?: ServerCanonicalSourceType[];
  activeOnly?: boolean;
}): Promise<{ posts: PipetrixClientPost[]; stats: ReturnType<typeof pipetrixStats> }> {
  const store = await loadPipetrixStore();
  const since = opts.sinceMs ?? 0;
  const types = opts.sourceTypes?.length ? new Set(opts.sourceTypes) : null;
  const activeOnly = opts.activeOnly !== false;

  const rows = store.posts
    .filter((p) => (activeOnly ? p.isActive : true))
    .filter((p) => !types || types.has(p.sourceType))
    .filter((p) => !since || p.ingestedAt >= since || p.firstIngestedAt >= since)
    .sort((a, b) => b.ingestedAt - a.ingestedAt);

  const posts: PipetrixClientPost[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (posts.length >= opts.limit) break;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    try {
      posts.push({
        tweet: JSON.parse(r.tweetJson) as Tweet,
        sourceType: r.sourceType
      });
    } catch {
      /* skip */
    }
  }

  const byId = new Map<string, PipetrixClientPost>();
  for (const p of posts) {
    const id = String(p.tweet.id);
    const prev = byId.get(id);
    if (!prev || (SOURCE_PRIORITY[p.sourceType] ?? 0) >= (SOURCE_PRIORITY[prev.sourceType] ?? 0)) {
      byId.set(id, p);
    }
  }

  return { posts: [...byId.values()], stats: pipetrixStats(store) };
}

export function homeDataSourceToCanonical(
  homeDataSource: string | undefined,
  source: string | undefined,
  feed: string | undefined
): ServerCanonicalSourceType {
  if (feed === "home_reverse_chronological") {
    switch (homeDataSource) {
      case "xai_grok":
        return "grok_mixer";
      case "mock_seed":
        return "seed";
      default:
        return "live_api";
    }
  }
  if (source === "mock") return "seed";
  if (source === "live") return "live_api";
  return "grok_mixer";
}

export async function ingestRankedPayloadToPipetrix(args: {
  platform_style?: Tweet[];
  refined?: Tweet[];
  homeDataSource?: string;
  source?: string;
  feed?: string;
}): Promise<number> {
  const sourceType = homeDataSourceToCanonical(args.homeDataSource, args.source, args.feed);
  const byId = new Map<string, Tweet>();
  for (const t of [...(args.platform_style ?? []), ...(args.refined ?? [])]) {
    byId.set(String(t.id), t);
  }
  if (!byId.size) return 0;
  const r = await upsertServerCanonicalTweets([...byId.values()], sourceType);
  return r.added + r.updated;
}
