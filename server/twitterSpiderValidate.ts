import { getAccessTokenForLiveSearch } from "./corpus.js";
import { isPlausibleTweetId } from "./tweetDedupe.js";
import { loadTwitterSpiderPipe, markSpiderRecordsChecked, saveTwitterSpiderPipe } from "./twitterSpiderPipe.js";

const TWEETS_LOOKUP = "https://api.twitter.com/2/tweets";
const UA = "iFixedX/1.0 (TwitterSpider validate)";

async function fetchTweetIdsExist(token: string, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const u = new URL(TWEETS_LOOKUP);
    u.searchParams.set("ids", chunk.join(","));
    u.searchParams.set("tweet.fields", "id");
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": UA }
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
    }
    let body: { data?: { id: string }[] };
    try {
      body = JSON.parse(text) as { data?: { id: string }[] };
    } catch {
      throw new Error("Invalid JSON from tweets lookup");
    }
    for (const row of body.data ?? []) {
      if (row?.id) found.add(row.id);
    }
  }
  return found;
}

/** Re-check stale spider rows; drop ids X no longer returns. */
export async function runTwitterSpiderValidationPass(
  env: NodeJS.ProcessEnv,
  sessionId: string | null,
  opts?: { maxBatch?: number; staleAfterMs?: number }
): Promise<{ checked: number; deactivated: number }> {
  const max = opts?.maxBatch ?? 40;
  const staleMs = opts?.staleAfterMs ?? 60_000;
  const pipe = await loadTwitterSpiderPipe();
  const cutoff = Date.now() - staleMs;
  const batch = pipe.records
    .filter((r) => r.isActive && r.lastActiveCheck < cutoff)
    .sort((a, b) => a.lastActiveCheck - b.lastActiveCheck)
    .slice(0, max);

  if (!batch.length) return { checked: 0, deactivated: 0 };

  let token: string | null = null;
  try {
    token = await getAccessTokenForLiveSearch(env, sessionId);
  } catch {
    return { checked: 0, deactivated: 0 };
  }

  const ids = batch.map((r) => r.tweetId).filter(isPlausibleTweetId);
  let found: Set<string>;
  try {
    found = await fetchTweetIdsExist(token, ids);
  } catch {
    return { checked: 0, deactivated: 0 };
  }

  const updates: { tweetId: string; isActive: boolean; note?: string }[] = [];
  let deactivated = 0;
  for (const rec of batch) {
    const active = found.has(rec.tweetId);
    if (!active) deactivated++;
    updates.push({
      tweetId: rec.tweetId,
      isActive: active,
      note: active ? "x_api:live" : "x_api:gone"
    });
  }
  await markSpiderRecordsChecked(updates);
  return { checked: batch.length, deactivated };
}

export async function purgeDuplicateSpiderPipeRecords(): Promise<number> {
  const pipe = await loadTwitterSpiderPipe();
  const before = pipe.records.length;
  const byId = new Map<string, (typeof pipe.records)[0]>();
  for (const r of pipe.records) {
    const prev = byId.get(r.tweetId);
    if (!prev || r.lastSeenAt > prev.lastSeenAt) byId.set(r.tweetId, r);
  }
  pipe.records = [...byId.values()];
  await saveTwitterSpiderPipe(pipe);
  return Math.max(0, before - pipe.records.length);
}
