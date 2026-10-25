import { apiUrlAbsolute } from "./base";

export type LiveSessionParticipant = {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  role: "Host" | "Co-host" | "Speaker" | "Broadcaster";
};

export type LiveSessionDetailPayload = {
  kind: "space" | "broadcast";
  title: string;
  linkUrl: string;
  live: boolean;
  listeners: number;
  participants: LiveSessionParticipant[];
  otherListenersLabel?: string;
  note?: string;
  error?: string;
};

export async function fetchLiveSessionDetail(payload: {
  kind: "space" | "broadcast";
  linkUrl: string;
  title?: string;
  handle?: string;
  listeners?: number;
  live?: boolean;
}): Promise<LiveSessionDetailPayload> {
  const u = new URL(apiUrlAbsolute("/api/x/live-session-detail"));
  u.searchParams.set("kind", payload.kind);
  u.searchParams.set("linkUrl", payload.linkUrl);
  if (payload.title) u.searchParams.set("title", payload.title);
  if (payload.handle) u.searchParams.set("handle", payload.handle.replace(/^@/, ""));
  if (typeof payload.listeners === "number" && Number.isFinite(payload.listeners)) {
    u.searchParams.set("listeners", String(payload.listeners));
  }
  if (payload.live === false) u.searchParams.set("live", "0");

  const res = await fetch(u.toString(), { credentials: "include" });
  const text = await res.text();
  let parsed: LiveSessionDetailPayload;
  try {
    parsed = JSON.parse(text) as LiveSessionDetailPayload;
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(parsed.error ?? (text.slice(0, 200) || `HTTP ${res.status}`));
  }
  return parsed;
}
