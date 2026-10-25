import { parseGrokLiveSessionContent } from "./parseGrokLiveSessionContent.js";
import { sortLiveSessionRows } from "./liveSessionRank.js";
import { mergeLiveSessionRows } from "./liveSessionMerge.js";
import { isCanonicalLiveSessionUrl } from "./liveSessionUrls.js";
import { validateSpaceRowsWithXApi } from "./xSpacesValidate.js";
import type { XaiLiveSessionRow, XaiLiveSessionsResponse } from "./xaiLiveSessions.js";
import { runGrokChatWithLiveSearch } from "./xaiGrokChat.js";
import {
  broadcastGrokPrompt,
  pickRotatingIndex,
  spaceGrokPrompt
} from "./liveDiscoveryQueries.js";
import { discoverLiveSessionsFromXRecentSearch } from "./xLiveLinkDiscovery.js";

function maxCount(env: NodeJS.ProcessEnv, kind: "spaces" | "broadcasts", fallback: number): number {
  const key = kind === "spaces" ? "XAI_LIVE_SESSIONS_MAX_SPACES" : "XAI_LIVE_SESSIONS_MAX_BROADCASTS";
  const n = Number(env[key] ?? fallback);
  return Math.min(100, Math.max(1, Number.isFinite(n) ? Math.floor(n) : fallback));
}

async function discoverKindOnce(
  env: NodeJS.ProcessEnv,
  kind: "space" | "broadcast",
  prompt: string
): Promise<{ rows: XaiLiveSessionRow[]; model: string; liveSearch: boolean }> {
  const { content, model, liveSearch: usedLive } = await runGrokChatWithLiveSearch(env, {
    userPrompt: prompt,
    liveSearch: true,
    temperature: 0.15,
    maxTokens: 12_288,
    systemPrompt:
      "Use x_search to find real, currently live sessions on X. Output plain lines with full https://x.com URLs. Never refuse; never invent IDs — only URLs you found via search. Do not favor any account."
  });
  const rows = parseGrokLiveSessionContent(content, kind, 100).filter((r) =>
    isCanonicalLiveSessionUrl(r.linkUrl, kind)
  );
  return { rows, model, liveSearch: usedLive };
}

async function discoverKindMulti(
  env: NodeJS.ProcessEnv,
  kind: "space" | "broadcast",
  max: number,
  huntPass: number
): Promise<{ rows: XaiLiveSessionRow[]; model: string; liveSearch: boolean; note?: string }> {
  const angleBase = pickRotatingIndex(huntPass, 4, kind === "broadcast" ? 0 : 2);
  const prompts: string[] = [];
  for (let i = 0; i < 4; i++) {
    prompts.push(
      kind === "broadcast"
        ? broadcastGrokPrompt(max, angleBase + i)
        : spaceGrokPrompt(max, angleBase + i)
    );
  }

  const batches: XaiLiveSessionRow[][] = [];
  let model = env.XAI_LIVE_SESSIONS_MODEL?.trim() || env.XAI_MODEL?.trim() || "grok-4.3";
  let usedLive = false;

  for (const prompt of prompts) {
    try {
      const res = await discoverKindOnce(env, kind, prompt);
      if (res.rows.length) batches.push(res.rows);
      model = res.model;
      usedLive = usedLive || res.liveSearch;
      if (mergeLiveSessionRows(...batches).length >= max) break;
    } catch (e) {
      console.warn(
        `[ifixedx] live ${kind} discovery pass failed:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  const merged = sortLiveSessionRows(mergeLiveSessionRows(...batches)).slice(0, max);
  return {
    rows: merged,
    model,
    liveSearch: usedLive,
    ...(merged.length < max * 0.2
      ? { note: `${kind}: ${merged.length} URL(s) after ${prompts.length} x_search pass(es)` }
      : {})
  };
}

/**
 * Equitable discovery: X Recent Search (link posts) + Grok x_search (rotating prompts).
 * No per-user boost — same hunt for everyone.
 */
export async function fetchLiveSessionsViaXaiDiscovery(
  env: NodeJS.ProcessEnv,
  opts: {
    nSpaces?: number;
    nBroadcasts?: number;
    liveSearch?: boolean;
    sessionId?: string | null;
    /** Rotates query angles each scheduler tick */
    huntPass?: number;
  }
): Promise<XaiLiveSessionsResponse & { ingest: LiveDiscoveryIngest }> {
  const maxSpaces = Math.min(opts.nSpaces ?? maxCount(env, "spaces", 48), maxCount(env, "spaces", 48));
  const maxBroadcasts = Math.min(
    opts.nBroadcasts ?? maxCount(env, "broadcasts", 48),
    maxCount(env, "broadcasts", 48)
  );
  const huntPass = Math.max(0, Math.floor(opts.huntPass ?? 0));

  const w: string[] = [];
  let model = env.XAI_LIVE_SESSIONS_MODEL?.trim() || env.XAI_MODEL?.trim() || "grok-4.3";
  let usedLive = false;

  const xLink = await discoverLiveSessionsFromXRecentSearch(env, opts.sessionId ?? null, huntPass, {
    maxBroadcasts: maxBroadcasts,
    maxSpaces: maxSpaces
  });
  if (xLink.note) w.push(xLink.note);

  const broadRes = await discoverKindMulti(env, "broadcast", maxBroadcasts, huntPass);
  const spaceRes = await discoverKindMulti(env, "space", maxSpaces, huntPass);

  model = broadRes.model || spaceRes.model;
  usedLive = broadRes.liveSearch || spaceRes.liveSearch;
  if (broadRes.note) w.push(broadRes.note);
  if (spaceRes.note) w.push(spaceRes.note);

  let broadcasts = sortLiveSessionRows(
    mergeLiveSessionRows(xLink.broadcasts, broadRes.rows)
  ).slice(0, maxBroadcasts);
  let spaces = sortLiveSessionRows(mergeLiveSessionRows(xLink.spaces, spaceRes.rows)).slice(
    0,
    maxSpaces
  );

  const spaceVal = await validateSpaceRowsWithXApi(env, opts.sessionId ?? null, spaces);
  spaces = sortLiveSessionRows(spaceVal.rows);
  if (spaceVal.note) w.push(spaceVal.note);

  if (spaces.length < maxSpaces) w.push(`spaces: got ${spaces.length}, target ${maxSpaces}`);
  if (broadcasts.length < maxBroadcasts) {
    w.push(`broadcasts: got ${broadcasts.length}, target ${maxBroadcasts}`);
  }

  return {
    spaces,
    broadcasts,
    model,
    liveSearch: usedLive,
    spacesValidated: spaceVal.validated,
    ingest: {
      spacesXApi: xLink.spaces,
      spacesXai: spaceRes.rows,
      broadcastsXApi: xLink.broadcasts,
      broadcastsXai: broadRes.rows
    },
    ...(spaceVal.note && !spaceVal.validated ? { validationNote: spaceVal.note } : {}),
    ...(w.length ? { warning: w.join(" · ") } : {})
  };
}

export type LiveDiscoveryIngest = {
  spacesXApi: XaiLiveSessionRow[];
  spacesXai: XaiLiveSessionRow[];
  broadcastsXApi: XaiLiveSessionRow[];
  broadcastsXai: XaiLiveSessionRow[];
};
