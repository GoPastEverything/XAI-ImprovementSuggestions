import type { Tweet } from "./search.js";

export type TwitterSpiderRecord = {
  tweetId: string;
  tweetJson: string;
  handle: string;
  author: string;
  createdAt: string;
  discoveryQuery: string;
  discoverySource: "x_recent_search" | "x_home_sample";
  isActive: boolean;
  lastActiveCheck: number;
  firstSeenAt: number;
  lastSeenAt: number;
  validationNote?: string;
};

export type TwitterSpiderPipeFile = {
  version: 1;
  pipeName: "TwitterSpider";
  updatedAt: number;
  records: TwitterSpiderRecord[];
};

export function tweetToSpiderRecord(
  t: Tweet,
  now: number,
  meta: { query: string; source: TwitterSpiderRecord["discoverySource"] }
): TwitterSpiderRecord | null {
  const id = String(t.id ?? "").trim();
  if (!/^\d{15,22}$/.test(id)) return null;
  return {
    tweetId: id,
    tweetJson: JSON.stringify(t),
    handle: String(t.handle ?? "").replace(/^@/, "").slice(0, 30) || "unknown",
    author: String(t.author ?? t.handle ?? "unknown").slice(0, 240),
    createdAt: String(t.createdAt ?? new Date().toISOString()),
    discoveryQuery: meta.query.slice(0, 280),
    discoverySource: meta.source,
    isActive: true,
    lastActiveCheck: now,
    firstSeenAt: now,
    lastSeenAt: now
  };
}

export function spiderRecordToTweet(rec: TwitterSpiderRecord): Tweet | null {
  try {
    return JSON.parse(rec.tweetJson) as Tweet;
  } catch {
    return null;
  }
}
