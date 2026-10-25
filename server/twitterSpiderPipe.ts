import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dedupeTweetsById, isPlausibleTweetId } from "./tweetDedupe.js";
import type { Tweet } from "./search.js";
import type { TwitterSpiderPipeFile, TwitterSpiderRecord } from "./twitterSpiderTypes.js";
import { tweetToSpiderRecord } from "./twitterSpiderTypes.js";
import { upsertServerCanonicalTweets } from "./pipetrixStore.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "..", "data");
const PIPE_PATH = join(DATA_DIR, "twitter-spider-pipe.json");

const MAX_RECORDS = 2500;
const INACTIVE_TTL_MS = 7 * 24 * 60 * 60_000;

function emptyPipe(): TwitterSpiderPipeFile {
  return { version: 1, pipeName: "TwitterSpider", updatedAt: 0, records: [] };
}

function dedupeRecords(records: TwitterSpiderRecord[]): TwitterSpiderRecord[] {
  const byId = new Map<string, TwitterSpiderRecord>();
  for (const r of records) {
    if (!isPlausibleTweetId(r.tweetId)) continue;
    const prev = byId.get(r.tweetId);
    if (!prev || r.lastSeenAt > prev.lastSeenAt) {
      byId.set(r.tweetId, r);
    }
  }
  return [...byId.values()];
}

export async function loadTwitterSpiderPipe(): Promise<TwitterSpiderPipeFile> {
  try {
    const raw = await readFile(PIPE_PATH, "utf8");
    const p = JSON.parse(raw) as TwitterSpiderPipeFile;
    if (p?.version === 1 && p.pipeName === "TwitterSpider" && Array.isArray(p.records)) {
      const deduped = dedupeRecords(p.records);
      if (deduped.length !== p.records.length) {
        p.records = deduped;
        await saveTwitterSpiderPipe(p);
      } else {
        p.records = deduped;
      }
      return p;
    }
  } catch {
    /* new */
  }
  return emptyPipe();
}

export async function saveTwitterSpiderPipe(pipe: TwitterSpiderPipeFile): Promise<void> {
  const now = Date.now();
  const pruned = pipe.records.filter((r) => {
    if (r.isActive) return true;
    return now - r.lastActiveCheck < INACTIVE_TTL_MS;
  });
  pruned.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.lastSeenAt - a.lastSeenAt;
  });
  const out: TwitterSpiderPipeFile = {
    ...pipe,
    updatedAt: now,
    records: dedupeRecords(pruned.slice(0, MAX_RECORDS))
  };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PIPE_PATH, JSON.stringify(out), "utf8");
}

export async function ingestTweetsIntoSpiderPipe(
  tweets: Tweet[],
  meta: { query: string; source: TwitterSpiderRecord["discoverySource"] }
): Promise<{ added: number; updated: number; duplicatesRemoved: number; total: number }> {
  const pipe = await loadTwitterSpiderPipe();
  const before = pipe.records.length;
  const now = Date.now();
  const byId = new Map(pipe.records.map((r) => [r.tweetId, r]));
  let added = 0;
  let updated = 0;

  const unique = dedupeTweetsById(tweets);
  for (const t of unique) {
    const rec = tweetToSpiderRecord(t, now, meta);
    if (!rec) continue;
    const prev = byId.get(rec.tweetId);
    if (!prev) {
      byId.set(rec.tweetId, rec);
      added++;
      continue;
    }
    prev.tweetJson = rec.tweetJson;
    prev.handle = rec.handle || prev.handle;
    prev.author = rec.author || prev.author;
    prev.createdAt = rec.createdAt || prev.createdAt;
    prev.lastSeenAt = now;
    if (prev.isActive || !prev.validationNote?.includes("dead")) {
      prev.isActive = true;
      prev.lastActiveCheck = now;
    }
    updated++;
  }

  pipe.records = dedupeRecords([...byId.values()]);
  await saveTwitterSpiderPipe(pipe);
  if (unique.length) {
    await upsertServerCanonicalTweets(unique, "twitter_spider", { isActive: true });
  }
  const duplicatesRemoved = Math.max(0, before + added - pipe.records.length);
  return { added, updated, duplicatesRemoved, total: pipe.records.length };
}

export async function listSpiderTweetsForClient(opts: {
  limit: number;
  onlyActive?: boolean;
  sinceMs?: number;
}): Promise<{ tweets: Tweet[]; stats: ReturnType<typeof pipeStats> }> {
  const pipe = await loadTwitterSpiderPipe();
  const since = opts.sinceMs ?? 0;
  const rows = pipe.records
    .filter((r) => (opts.onlyActive !== false ? r.isActive : true))
    .filter((r) => !since || r.lastSeenAt >= since || r.firstSeenAt >= since)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const tweets: Tweet[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (tweets.length >= opts.limit) break;
    if (seen.has(r.tweetId)) continue;
    seen.add(r.tweetId);
    try {
      tweets.push(JSON.parse(r.tweetJson) as Tweet);
    } catch {
      /* skip */
    }
  }
  return { tweets: dedupeTweetsById(tweets), stats: pipeStats(pipe) };
}

export function pipeStats(pipe: TwitterSpiderPipeFile) {
  const active = pipe.records.filter((r) => r.isActive);
  return {
    total: pipe.records.length,
    active: active.length,
    inactive: pipe.records.length - active.length,
    pipeUpdatedAt: pipe.updatedAt
  };
}

export async function getTwitterSpiderStats() {
  const pipe = await loadTwitterSpiderPipe();
  return pipeStats(pipe);
}

export async function markSpiderRecordsChecked(
  updates: { tweetId: string; isActive: boolean; note?: string }[]
): Promise<void> {
  if (!updates.length) return;
  const pipe = await loadTwitterSpiderPipe();
  const now = Date.now();
  const byId = new Map(pipe.records.map((r) => [r.tweetId, r]));
  for (const u of updates) {
    const rec = byId.get(u.tweetId);
    if (!rec) continue;
    rec.isActive = u.isActive;
    rec.lastActiveCheck = now;
    if (u.note) rec.validationNote = u.note;
  }
  pipe.records = [...byId.values()];
  await saveTwitterSpiderPipe(pipe);
}

export async function compactTwitterSpiderPipe(): Promise<{
  removedDuplicates: number;
  total: number;
}> {
  const pipe = await loadTwitterSpiderPipe();
  const before = pipe.records.length;
  pipe.records = dedupeRecords(pipe.records);
  await saveTwitterSpiderPipe(pipe);
  return { removedDuplicates: Math.max(0, before - pipe.records.length), total: pipe.records.length };
}
