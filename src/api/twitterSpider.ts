import { apiUrlAbsolute } from "./base";
import type { TweetResult } from "./types";

export type TwitterSpiderStatus = {
  ok?: boolean;
  total: number;
  active: number;
  inactive: number;
  pipeUpdatedAt: number;
  scheduler?: {
    lastHuntAt: number;
    lastValidateAt: number;
    huntInProgress: boolean;
    validateInProgress: boolean;
    lastHuntError?: string;
    lastHuntSummary?: string;
  };
  lastHuntSummary?: string;
  error?: string;
};

export type TwitterSpiderRunResult = {
  ok: boolean;
  summary: string;
  status?: TwitterSpiderStatus;
  error?: string;
};

export async function fetchTwitterSpiderStatus(): Promise<TwitterSpiderStatus> {
  const res = await fetch(apiUrlAbsolute("/api/twitter-spider/status"), { credentials: "include" });
  const text = await res.text();
  let parsed: TwitterSpiderStatus;
  try {
    parsed = JSON.parse(text) as TwitterSpiderStatus;
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(parsed.error ?? `HTTP ${res.status}`);
  return parsed;
}

export async function runTwitterSpiderNow(): Promise<TwitterSpiderRunResult> {
  const res = await fetch(apiUrlAbsolute("/api/twitter-spider/run"), {
    method: "POST",
    credentials: "include"
  });
  const text = await res.text();
  let parsed: TwitterSpiderRunResult;
  try {
    parsed = JSON.parse(text) as TwitterSpiderRunResult;
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(parsed.error ?? parsed.summary ?? `HTTP ${res.status}`);
  return parsed;
}

export async function fetchTwitterSpiderBatch(opts?: {
  n?: number;
  sinceMs?: number;
}): Promise<{ tweets: TweetResult[]; stats: TwitterSpiderStatus }> {
  const u = new URL(apiUrlAbsolute("/api/twitter-spider/batch"));
  u.searchParams.set("n", String(opts?.n ?? 48));
  if (opts?.sinceMs) u.searchParams.set("sinceMs", String(opts.sinceMs));
  const res = await fetch(u.toString(), { credentials: "include" });
  const text = await res.text();
  let parsed: { tweets?: TweetResult[]; stats?: TwitterSpiderStatus; error?: string };
  try {
    parsed = JSON.parse(text) as { tweets?: TweetResult[]; stats?: TwitterSpiderStatus; error?: string };
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(parsed.error ?? `HTTP ${res.status}`);
  return {
    tweets: parsed.tweets ?? [],
    stats: parsed.stats ?? { total: 0, active: 0, inactive: 0, pipeUpdatedAt: 0 }
  };
}
