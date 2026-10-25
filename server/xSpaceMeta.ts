import { parseSpaceIdFromUrl } from "./liveSessionUrls.js";

const SPACES_LOOKUP = "https://api.twitter.com/2/spaces";
const USERS_LOOKUP = "https://api.twitter.com/2/users";
const UA = "iFixedX/1.0 (space meta)";

export type XSpaceMeta = {
  id: string;
  state: string;
  live: boolean;
  title: string;
  listeners: number;
  hostHandle: string;
  hostName: string;
};

type XSpaceApi = {
  id: string;
  state?: string;
  title?: string;
  participant_count?: number;
  creator_id?: string;
  host_ids?: string[];
  speaker_ids?: string[];
};

type XUser = {
  id: string;
  name?: string;
  username?: string;
};

async function fetchJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 280) || `HTTP ${res.status}`);
  return JSON.parse(text) as unknown;
}

async function fetchUsersByIds(token: string, ids: string[]): Promise<Map<string, XUser>> {
  const out = new Map<string, XUser>();
  const unique = [...new Set(ids)].filter(Boolean).slice(0, 100);
  if (!unique.length) return out;
  const u = new URL(USERS_LOOKUP);
  u.searchParams.set("ids", unique.join(","));
  u.searchParams.set("user.fields", "name,username");
  const body = (await fetchJson(u.toString(), token)) as { data?: XUser[] };
  for (const user of body.data ?? []) {
    if (user?.id) out.set(user.id, user);
  }
  return out;
}

/** Ground Space ids with title, state, listeners, and host @handle from X API. */
export async function fetchSpaceMetaByIds(
  token: string,
  ids: string[]
): Promise<Map<string, XSpaceMeta>> {
  const out = new Map<string, XSpaceMeta>();
  if (!ids.length) return out;

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const u = new URL(SPACES_LOOKUP);
    u.searchParams.set("ids", chunk.join(","));
    u.searchParams.set(
      "space.fields",
      "title,state,participant_count,creator_id,host_ids,speaker_ids"
    );

    const body = (await fetchJson(u.toString(), token)) as { data?: XSpaceApi[] };
    const spaces = body.data ?? [];
    const hostIds: string[] = [];
    for (const s of spaces) {
      if (s.creator_id) hostIds.push(s.creator_id);
      for (const h of s.host_ids ?? []) hostIds.push(h);
      if (s.speaker_ids?.[0]) hostIds.push(s.speaker_ids[0]);
    }
    const users = await fetchUsersByIds(token, hostIds);

    for (const s of spaces) {
      if (!s?.id) continue;
      const state = String(s.state ?? "").toLowerCase();
      const live = state === "live";
      const hostId = s.creator_id ?? s.host_ids?.[0] ?? s.speaker_ids?.[0];
      const host = hostId ? users.get(hostId) : undefined;
      const hostHandle = String(host?.username ?? "").replace(/^@/, "").slice(0, 30);
      const hostName = String(host?.name ?? hostHandle ?? "").slice(0, 240);
      const title = String(s.title ?? "").trim();
      out.set(s.id, {
        id: s.id,
        state,
        live,
        title: title.slice(0, 280),
        listeners:
          typeof s.participant_count === "number" && s.participant_count >= 0
            ? Math.floor(s.participant_count)
            : 0,
        hostHandle: hostHandle || "unknown",
        hostName: hostName || "X Space"
      });
    }
  }
  return out;
}

export function applySpaceMetaToRow<T extends {
  linkUrl: string;
  title: string;
  handle: string;
  author: string;
  live: boolean;
  listeners: number;
}>(row: T, meta: XSpaceMeta | undefined): T {
  if (!meta) return row;
  const handle = meta.hostHandle && meta.hostHandle !== "unknown" ? meta.hostHandle : row.handle;
  const author =
    meta.hostName && meta.hostName !== "X Space" ? meta.hostName : meta.hostHandle ? `@${meta.hostHandle}` : row.author;
  return {
    ...row,
    live: meta.live,
    listeners: meta.listeners > 0 ? meta.listeners : row.listeners,
    title: meta.title || row.title,
    handle,
    author: author.startsWith("@") ? author.slice(1) : author
  };
}

export function spaceIdFromRowLink(linkUrl: string): string | null {
  return parseSpaceIdFromUrl(linkUrl);
}
