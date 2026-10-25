/**
 * xAI Grok — live X Spaces + Broadcasts lists (JSON). Uses live search when enabled.
 * Same API key as trending tweets; billed per console usage.
 */

import { createHash } from "node:crypto";
import { isCanonicalLiveSessionUrl, normalizeLiveSessionUrl } from "./liveSessionUrls.js";
import { sortLiveSessionRows } from "./liveSessionRank.js";
import { validateSpaceRowsWithXApi } from "./xSpacesValidate.js";
import { extractJsonObject } from "./xaiTrendingTweets.js";

const XAI_URL = "https://api.x.ai/v1/chat/completions";

export type XaiLiveSessionRow = {
  id: string;
  kind: "space" | "broadcast";
  handle: string;
  author: string;
  title: string;
  live: boolean;
  listeners: number;
  endedAgo?: string;
  /** Open this on X (Space/Broadcast URL), not only the host profile */
  linkUrl: string;
};

function normalizeXUrl(raw: string): string {
  return normalizeLiveSessionUrl(raw);
}

function slugHandleFromHost(host: string | undefined, fallback: string): string {
  if (!host?.trim()) return fallback;
  const t = host.trim();
  const at = t.match(/^@?([A-Za-z0-9_]{1,30})$/);
  if (at) return at[1]!.toLowerCase();
  const word = t.split(/[\s,]+/)[0] ?? "";
  const slug = word.replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
  return slug.slice(0, 24) || fallback;
}

function idFromUrl(kind: string, url: string, i: number): string {
  const h = createHash("sha256").update(`${kind}\0${url}\0${i}`).digest("hex").slice(0, 16);
  return `${kind}-${h}`;
}

function coerceItem(
  raw: Record<string, unknown>,
  kind: "space" | "broadcast",
  index: number
): XaiLiveSessionRow | null {
  const title = String(raw.title ?? raw.name ?? "").trim();
  const url = normalizeXUrl(String(raw.url ?? raw.link ?? ""));
  if (!title || !url || !isCanonicalLiveSessionUrl(url, kind)) return null;

  const hostLabel = String(raw.host ?? raw.hosts ?? raw.account ?? "").trim();
  const handle = slugHandleFromHost(hostLabel, kind === "space" ? "spaces" : "broadcast");
  const author = hostLabel || (kind === "space" ? "X Space" : "X Broadcast");

  const listeners =
    typeof raw.listeners === "number" && Number.isFinite(raw.listeners) && raw.listeners >= 0
      ? Math.floor(raw.listeners)
      : typeof raw.listener_count === "number"
        ? Math.max(0, Math.floor(raw.listener_count))
        : 0;

  let live = true;
  if (typeof raw.live === "boolean") live = raw.live;
  else if (typeof raw.is_live === "boolean") live = raw.is_live;

  const endedAgo =
    typeof raw.endedAgo === "string" && raw.endedAgo.trim()
      ? raw.endedAgo.trim()
      : typeof raw.ended_ago === "string" && raw.ended_ago.trim()
        ? raw.ended_ago.trim()
        : undefined;

  return {
    id: idFromUrl(kind, url, index),
    kind,
    handle,
    author,
    title: title.slice(0, 280),
    live,
    listeners,
    ...(endedAgo && !live ? { endedAgo } : {}),
    linkUrl: url
  };
}

function parsePayload(
  data: unknown,
  nSpaces: number,
  nBroadcasts: number
): { spaces: XaiLiveSessionRow[]; broadcasts: XaiLiveSessionRow[] } {
  if (!data || typeof data !== "object") throw new Error("Model did not return a JSON object");
  const rec = data as Record<string, unknown>;

  const spacesRaw = rec.live_x_spaces ?? rec.spaces ?? rec.live_spaces;
  const broadRaw = rec.live_x_broadcasts ?? rec.broadcasts ?? rec.live_broadcasts;

  if (!Array.isArray(spacesRaw)) throw new Error('Expected array "live_x_spaces" (or "spaces")');
  if (!Array.isArray(broadRaw)) throw new Error('Expected array "live_x_broadcasts" (or "broadcasts")');

  const spaces: XaiLiveSessionRow[] = [];
  const broadcasts: XaiLiveSessionRow[] = [];

  for (let i = 0; i < spacesRaw.length; i++) {
    const o = spacesRaw[i];
    if (!o || typeof o !== "object") continue;
    const row = coerceItem(o as Record<string, unknown>, "space", i);
    if (row) spaces.push(row);
  }
  for (let i = 0; i < broadRaw.length; i++) {
    const o = broadRaw[i];
    if (!o || typeof o !== "object") continue;
    const row = coerceItem(o as Record<string, unknown>, "broadcast", i);
    if (row) broadcasts.push(row);
  }

  return {
    spaces: spaces.slice(0, nSpaces),
    broadcasts: broadcasts.slice(0, nBroadcasts)
  };
}

function buildPrompt(nSpaces: number, nBroadcasts: number): string {
  return `You are filling a product UI with **currently live** (or very recently live) sessions on **X (Twitter) only**.

Return **ONLY** valid JSON (no markdown, no commentary). Exact shape:
{
  "live_x_spaces": [
    { "title": "string", "url": "https://x.com/i/spaces/SOMEID/peek or https://twitter.com/i/spaces/SOMEID/peek", "host": "string (display name or @handle if known)", "language": "string", "listeners": number optional }
  ],
  "live_x_broadcasts": [
    { "title": "string", "url": "https://x.com/i/broadcasts/SOMEID", "host": "string", "language": "string", "listeners": number optional }
  ]
}

Rules:
- **Exactly ${nSpaces}** objects in live_x_spaces and **exactly ${nBroadcasts}** in live_x_broadcasts.
- Only **real X.com** Spaces and Broadcasts URLs (paths /i/spaces/ and /i/broadcasts/). No other platforms. URLs must open real sessions (we validate Space IDs against X API).
- Prefer **English (US)**-language rooms when possible.
- List **live right now first** in each array (highest listeners first). After live rows, add a few that **ended within the last ~30 minutes** with "live": false and "endedAgo" (e.g. "12m ago").
- **listeners**: current listener count for live sessions; 0 if unknown.
- Titles must match what a user would see on X (short, factual). Do not invent Space/Broadcast IDs.`;
}

export type XaiLiveSessionsResponse = {
  spaces: XaiLiveSessionRow[];
  broadcasts: XaiLiveSessionRow[];
  model: string;
  liveSearch: boolean;
  warning?: string;
  /** True when GET /2/spaces grounded Space rows (live vs ended, listener counts). */
  spacesValidated?: boolean;
  validationNote?: string;
};

export async function fetchLiveSessionsViaXai(
  env: NodeJS.ProcessEnv,
  opts: { nSpaces: number; nBroadcasts: number; liveSearch?: boolean; sessionId?: string | null }
): Promise<XaiLiveSessionsResponse> {
  const key = env.XAI_API_KEY?.trim();
  if (!key) throw new Error("Missing XAI_API_KEY in server environment");

  const model = env.XAI_MODEL?.trim() || "grok-4.3";
  const nSpaces = Math.min(24, Math.max(1, Math.floor(opts.nSpaces)));
  const nBroadcasts = Math.min(24, Math.max(1, Math.floor(opts.nBroadcasts)));
  const wantLive =
    opts.liveSearch ??
    (env.XAI_LIVE_SEARCH === "1" || env.XAI_LIVE_SEARCH === "true");

  const bodyBase = {
    model,
    temperature: 0.35,
    max_tokens: 8192,
    messages: [
      {
        role: "system" as const,
        content:
          "You output ONLY compact JSON. Never use markdown fences. Follow the user schema exactly. Use live / X search when available to ground URLs in real sessions."
      },
      { role: "user" as const, content: buildPrompt(nSpaces, nBroadcasts) }
    ]
  };

  const tryBodies: Record<string, unknown>[] = [];
  if (wantLive) {
    tryBodies.push({ ...bodyBase, search_parameters: { mode: "auto" } });
  }
  tryBodies.push(bodyBase);

  let lastErr = "xAI request failed";
  let json: unknown = null;
  let usedLiveSearch = false;

  for (const body of tryBodies) {
    const withSearch = "search_parameters" in body;
    const res = await fetch(XAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) {
      lastErr = text.slice(0, 500) || `HTTP ${res.status}`;
      continue;
    }
    try {
      json = JSON.parse(text) as Record<string, unknown>;
      usedLiveSearch = withSearch;
      break;
    } catch {
      lastErr = "Invalid JSON from xAI";
      json = null;
    }
  }

  if (!json) {
    throw new Error(lastErr);
  }

  const root = json as {
    choices?: { message?: { content?: string | null } }[];
    citations?: unknown;
  };
  const content = root.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Empty completion from xAI");
  }

  let parsed: unknown;
  try {
    parsed = extractJsonObject(content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "parse error";
    throw new Error(`Could not parse model JSON: ${msg}. Snippet: ${content.slice(0, 220)}…`);
  }

  let { spaces, broadcasts } = parsePayload(parsed, nSpaces, nBroadcasts);

  const spaceVal = await validateSpaceRowsWithXApi(env, opts.sessionId ?? null, spaces);
  spaces = sortLiveSessionRows(spaceVal.rows);
  broadcasts = sortLiveSessionRows(
    broadcasts.filter((r) => isCanonicalLiveSessionUrl(r.linkUrl, "broadcast"))
  );

  const w: string[] = [];
  if (spaces.length < nSpaces) w.push(`spaces: got ${spaces.length}, wanted ${nSpaces}`);
  if (broadcasts.length < nBroadcasts) w.push(`broadcasts: got ${broadcasts.length}, wanted ${nBroadcasts}`);
  if (spaceVal.note) w.push(spaceVal.note);
  const warning = w.length ? w.join(" · ") : undefined;

  return {
    spaces,
    broadcasts,
    model,
    liveSearch: usedLiveSearch,
    spacesValidated: spaceVal.validated,
    ...(spaceVal.note && !spaceVal.validated ? { validationNote: spaceVal.note } : {}),
    ...(warning ? { warning } : {})
  };
}
