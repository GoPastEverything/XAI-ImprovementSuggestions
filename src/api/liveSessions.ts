import { apiUrlAbsolute } from "./base";

export type LiveSessionApiRow = {
  id: string;
  kind: "space" | "broadcast";
  handle: string;
  author: string;
  title: string;
  live: boolean;
  listeners: number;
  endedAgo?: string;
  linkUrl: string;
};

export type LiveSessionsPayload = {
  spaces: LiveSessionApiRow[];
  broadcasts: LiveSessionApiRow[];
  model: string;
  liveSearch: boolean;
  warning?: string;
  /** Spaces grounded via GET /2/spaces when X credentials are available. */
  spacesValidated?: boolean;
  validationNote?: string;
  fromCache?: boolean;
  fetchedAt?: number;
  cacheAgeMs?: number;
  refreshInProgress?: boolean;
  cacheLastError?: string;
  totalSpaces?: number;
  totalBroadcasts?: number;
  fromFeedtrixPipe?: boolean;
  pipeStats?: {
    spaces: { total: number; active: number; inactive: number; pipeUpdatedAt: number };
    broadcasts: { total: number; active: number; inactive: number; pipeUpdatedAt: number };
  };

  xaiConfigured?: boolean;
  error?: string;
};

export async function fetchLiveSessions(payload: {
  nSpaces?: number;
  nBroadcasts?: number;
  /** Prefer Grok live / X search (server also respects XAI_LIVE_SEARCH). */
  live?: boolean;
}): Promise<LiveSessionsPayload> {
  const u = new URL(apiUrlAbsolute("/api/xai/live-sessions"));
  u.searchParams.set("nSpaces", String(payload.nSpaces ?? 12));
  u.searchParams.set("nBroadcasts", String(payload.nBroadcasts ?? 12));
  if (payload.live === true) u.searchParams.set("live", "1");
  if (payload.live === false) u.searchParams.set("live", "0");

  const res = await fetch(u.toString(), { credentials: "include" });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  const obj = parsed as { error?: string };

  if (!res.ok) {
    const msg =
      typeof obj.error === "string" && obj.error.length
        ? obj.error
        : text.trim().slice(0, 280) || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return parsed as LiveSessionsPayload;
}
