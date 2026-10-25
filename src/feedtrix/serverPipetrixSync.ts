import { fetchPipetrixBatch } from "../api/pipetrix";
import type { TweetResult } from "../api/types";
import type { CanonicalSourceType } from "./canonicalIngest";
import { ingestCanonicalTweetBatch } from "./canonicalIngest";
import { canonicalSourceAllowsRealOnly, isRealDataOnly } from "../realDataOnly";

const LAST_PULL_KEY = "ix_server_pipetrix_last_pull_v1";
const FULL_SYNC_GAP_MS = 60 * 60 * 1000;

export function getServerPipetrixLastPullMs(): number {
  if (typeof window === "undefined") return 0;
  const n = Number(sessionStorage.getItem(LAST_PULL_KEY) ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function setServerPipetrixLastPullMs(ms: number): void {
  try {
    sessionStorage.setItem(LAST_PULL_KEY, String(ms));
  } catch {
    /* ignore */
  }
}

function toCanonicalSource(st: string): CanonicalSourceType {
  if (
    st === "twitter_spider" ||
    st === "live_api" ||
    st === "grok_topic" ||
    st === "grok_mixer" ||
    st === "seed" ||
    st === "user_post" ||
    st === "repost"
  ) {
    return st;
  }
  return "twitter_spider";
}

/**
 * Pull server Pipetrix canonical into browser RxDB (mixer reads local mirror).
 * TwitterSpider + live refreshes accumulate on the server while you are away.
 */
export async function pullServerPipetrixIntoLocal(): Promise<number> {
  if (typeof window === "undefined") return 0;

  const last = getServerPipetrixLastPullMs();
  const fullSync = !last || Date.now() - last > FULL_SYNC_GAP_MS;
  const sinceMs = fullSync ? 0 : last;

  const { posts } = await fetchPipetrixBatch({
    n: fullSync ? 400 : 200,
    sinceMs: sinceMs || undefined
  });

  const grouped = new Map<CanonicalSourceType, TweetResult[]>();
  for (const row of posts) {
    const st = toCanonicalSource(row.sourceType);
    if (isRealDataOnly() && !canonicalSourceAllowsRealOnly(st)) continue;
    const tweet: TweetResult = {
      ...row.tweet,
      tags: [...new Set([...(row.tweet.tags ?? []), "pipetrix-server"])]
    };
    const list = grouped.get(st) ?? [];
    list.push(tweet);
    grouped.set(st, list);
  }

  let total = 0;
  for (const [st, batch] of grouped) {
    if (!batch.length) continue;
    total += await ingestCanonicalTweetBatch(batch, st);
  }

  setServerPipetrixLastPullMs(Date.now());
  return total;
}

/** @deprecated Use pullServerPipetrixIntoLocal */
export async function pullTwitterSpiderIntoPipetrix(): Promise<number> {
  return pullServerPipetrixIntoLocal();
}
