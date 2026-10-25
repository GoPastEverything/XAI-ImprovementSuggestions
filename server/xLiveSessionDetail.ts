import { getAccessTokenForLiveSearch } from "./corpus.js";
import { parseBroadcastIdFromUrl, parseSpaceIdFromUrl } from "./liveSessionUrls.js";

const SPACES_LOOKUP = "https://api.twitter.com/2/spaces";
const USERS_LOOKUP = "https://api.twitter.com/2/users";
const UA = "iFixedX/1.0 (live session detail)";

export type LiveSessionParticipant = {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  role: "Host" | "Co-host" | "Speaker" | "Broadcaster";
};

export type LiveSessionDetailResponse = {
  kind: "space" | "broadcast";
  title: string;
  linkUrl: string;
  live: boolean;
  listeners: number;
  participants: LiveSessionParticipant[];
  otherListenersLabel?: string;
  note?: string;
};

function sharperAvatar(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  return url.replace(/_normal(\.(jpe?g|png|webp|gif))$/i, "_400x400$1");
}

type XUser = {
  id: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
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

async function fetchJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA }
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 280) || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as unknown;
}

async function fetchUsersByIds(token: string, ids: string[]): Promise<Map<string, XUser>> {
  const out = new Map<string, XUser>();
  if (!ids.length) return out;
  const unique = [...new Set(ids)].slice(0, 100);
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const u = new URL(USERS_LOOKUP);
    u.searchParams.set("ids", chunk.join(","));
    u.searchParams.set("user.fields", "name,username,profile_image_url");
    const body = (await fetchJson(u.toString(), token)) as {
      data?: XUser[];
    };
    for (const user of body.data ?? []) {
      if (user?.id) out.set(user.id, user);
    }
  }
  return out;
}

async function fetchUserByUsername(
  token: string,
  username: string
): Promise<XUser | null> {
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return null;
  const u = new URL(`${USERS_LOOKUP}/by/username/${encodeURIComponent(handle)}`);
  u.searchParams.set("user.fields", "name,username,profile_image_url");
  try {
    const body = (await fetchJson(u.toString(), token)) as { data?: XUser };
    return body.data?.id ? body.data : null;
  } catch {
    return null;
  }
}

function userToParticipant(user: XUser, role: LiveSessionParticipant["role"]): LiveSessionParticipant {
  return {
    id: user.id,
    name: String(user.name ?? user.username ?? "User").slice(0, 80),
    username: String(user.username ?? "unknown").replace(/^@/, ""),
    avatarUrl: sharperAvatar(user.profile_image_url),
    role
  };
}

const MAX_SHOWN = 6;

export async function fetchLiveSessionDetail(
  env: NodeJS.ProcessEnv,
  sessionId: string | null,
  opts: {
    kind: "space" | "broadcast";
    linkUrl: string;
    fallbackTitle?: string;
    fallbackHandle?: string;
    fallbackListeners?: number;
    fallbackLive?: boolean;
  }
): Promise<LiveSessionDetailResponse> {
  const linkUrl = opts.linkUrl.trim();
  const base: LiveSessionDetailResponse = {
    kind: opts.kind,
    title: opts.fallbackTitle?.trim() || "Live on X",
    linkUrl,
    live: opts.fallbackLive ?? true,
    listeners: Math.max(0, Math.floor(opts.fallbackListeners ?? 0)),
    participants: []
  };

  let token: string;
  try {
    token = await getAccessTokenForLiveSearch(env, sessionId);
  } catch {
    return {
      ...base,
      note: "Sign in with X or set TWITTER_BEARER_TOKEN to load hosts and speakers."
    };
  }

  if (opts.kind === "broadcast") {
    const bid = parseBroadcastIdFromUrl(linkUrl);
    const handle = opts.fallbackHandle?.replace(/^@/, "") ?? "unknown";
    const user = await fetchUserByUsername(token, handle);
    if (user) {
      base.participants = [userToParticipant(user, "Broadcaster")];
      base.title = opts.fallbackTitle?.trim() || `${user.name ?? handle} — Live broadcast`;
    } else {
      base.participants = [
        {
          id: `broadcast-host:${handle}`,
          name: opts.fallbackTitle?.trim() || "Live broadcast",
          username: handle,
          role: "Broadcaster"
        }
      ];
    }
    return base;
  }

  const spaceId = parseSpaceIdFromUrl(linkUrl);
  if (!spaceId) {
    return { ...base, note: "Invalid Space URL." };
  }

  const u = new URL(SPACES_LOOKUP);
  u.searchParams.set("ids", spaceId);
  u.searchParams.set(
    "space.fields",
    "title,state,participant_count,creator_id,host_ids,speaker_ids"
  );

  let space: XSpaceApi | undefined;
  try {
    const body = (await fetchJson(u.toString(), token)) as { data?: XSpaceApi[] };
    space = body.data?.[0];
  } catch (e) {
    return {
      ...base,
      note: `Could not load Space details: ${e instanceof Error ? e.message : e}`
    };
  }

  if (!space?.id) {
    return { ...base, note: "Space not found on X API." };
  }

  const state = String(space.state ?? "").toLowerCase();
  base.live = state === "live";
  base.listeners =
    typeof space.participant_count === "number" && space.participant_count >= 0
      ? Math.floor(space.participant_count)
      : base.listeners;
  const apiTitle = String(space.title ?? "").trim();
  if (apiTitle) base.title = apiTitle.slice(0, 280);

  const roleOrder: { id: string; role: LiveSessionParticipant["role"] }[] = [];
  const seenIds = new Set<string>();

  const pushId = (id: string | undefined, role: LiveSessionParticipant["role"]) => {
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    roleOrder.push({ id, role });
  };

  pushId(space.creator_id, "Host");
  for (const id of space.host_ids ?? []) pushId(id, "Co-host");
  for (const id of space.speaker_ids ?? []) pushId(id, "Speaker");

  const userIds = roleOrder.map((r) => r.id).slice(0, 100);
  let users: Map<string, XUser>;
  try {
    users = await fetchUsersByIds(token, userIds);
  } catch {
    users = new Map();
  }

  const participants: LiveSessionParticipant[] = [];
  for (const { id, role } of roleOrder) {
    if (participants.length >= MAX_SHOWN) break;
    const user = users.get(id);
    if (user) {
      participants.push(userToParticipant(user, role));
    } else {
      participants.push({
        id,
        name: role,
        username: "unknown",
        role
      });
    }
  }

  base.participants = participants;

  const others = Math.max(0, base.listeners - participants.length);
  if (others > 0) {
    base.otherListenersLabel =
      others >= 1000 ? `${(others / 1000).toFixed(1).replace(/\.0$/, "")}K other listeners` : `${others.toLocaleString()} other listeners`;
  }

  if (!participants.length && opts.fallbackHandle) {
    const user = await fetchUserByUsername(token, opts.fallbackHandle);
    if (user) base.participants = [userToParticipant(user, "Host")];
  }

  return base;
}
