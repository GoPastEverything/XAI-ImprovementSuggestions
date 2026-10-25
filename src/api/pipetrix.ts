import { apiUrlAbsolute } from "./base";
import type { TweetResult } from "./types";

export type PipetrixServerStats = {
  total: number;
  active: number;
  inactive: number;
  bySource: Record<string, number>;
  storeUpdatedAt: number;
};

export type PipetrixStatus = PipetrixServerStats & {
  ok?: boolean;
  sync?: {
    lastSyncAt: number;
    syncInProgress: boolean;
    lastSyncError?: string;
    lastSyncSummary?: string;
  };
  error?: string;
};

export async function fetchPipetrixStatus(): Promise<PipetrixStatus> {
  const res = await fetch(apiUrlAbsolute("/api/pipetrix/status"), { credentials: "include" });
  const text = await res.text();
  let parsed: PipetrixStatus;
  try {
    parsed = JSON.parse(text) as PipetrixStatus;
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(parsed.error ?? `HTTP ${res.status}`);
  return parsed;
}

export type PipetrixBatchPost = { tweet: TweetResult; sourceType: string };

export async function fetchPipetrixBatch(opts?: {
  n?: number;
  sinceMs?: number;
  source?: string;
}): Promise<{ posts: PipetrixBatchPost[]; tweets: TweetResult[]; stats: PipetrixServerStats }> {
  const u = new URL(apiUrlAbsolute("/api/pipetrix/batch"));
  u.searchParams.set("n", String(opts?.n ?? 200));
  if (opts?.sinceMs) u.searchParams.set("sinceMs", String(opts.sinceMs));
  if (opts?.source) u.searchParams.set("source", opts.source);
  const res = await fetch(u.toString(), { credentials: "include" });
  const text = await res.text();
  let parsed: {
    posts?: PipetrixBatchPost[];
    tweets?: TweetResult[];
    stats?: PipetrixServerStats;
    error?: string;
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(parsed.error ?? `HTTP ${res.status}`);
  const posts =
    parsed.posts ??
    (parsed.tweets ?? []).map((tweet) => ({ tweet, sourceType: "twitter_spider" }));
  return {
    posts,
    tweets: posts.map((p) => p.tweet),
    stats: parsed.stats ?? { total: 0, active: 0, inactive: 0, bySource: {}, storeUpdatedAt: 0 }
  };
}

export async function syncServerPipetrixNow(): Promise<PipetrixStatus & { ok: boolean; summary?: string }> {
  const res = await fetch(apiUrlAbsolute("/api/pipetrix/sync"), {
    method: "POST",
    credentials: "include"
  });
  const text = await res.text();
  let parsed: PipetrixStatus & { ok: boolean; summary?: string };
  try {
    parsed = JSON.parse(text) as PipetrixStatus & { ok: boolean; summary?: string };
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(parsed.error ?? parsed.summary ?? `HTTP ${res.status}`);
  return parsed;
}
