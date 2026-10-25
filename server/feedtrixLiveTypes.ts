import type { XaiLiveSessionRow } from "./xaiLiveSessions.js";

/** Persistent row in FeedtrixSpaces / FeedtrixBroadcasts server pipes. */
export type FeedtrixLiveRecord = {
  /** Stable key: `space:{id}` or `broadcast:{id}` */
  pipeId: string;
  kind: "space" | "broadcast";
  platformId: string;
  linkUrl: string;
  handle: string;
  author: string;
  title: string;
  listeners: number;
  isActive: boolean;
  /** Epoch ms — last time we probed X / x_search / Spaces API */
  lastActiveCheck: number;
  firstSeenAt: number;
  lastSeenAt: number;
  /** How this row entered the pipe */
  discoverySource: "xai_hunt" | "x_api" | "manual";
  /** Optional validation detail for UI/debug */
  validationNote?: string;
};

export type FeedtrixLivePipeFile = {
  version: 1;
  pipeName: "FeedtrixSpaces" | "FeedtrixBroadcasts";
  updatedAt: number;
  records: FeedtrixLiveRecord[];
};

export function feedtrixRecordToSessionRow(r: FeedtrixLiveRecord): XaiLiveSessionRow {
  const endedAgo =
    !r.isActive && r.lastActiveCheck > 0
      ? endedAgoFromMs(Date.now() - r.lastActiveCheck)
      : undefined;
  return {
    id: r.pipeId,
    kind: r.kind,
    handle: r.handle,
    author: r.author,
    title: r.title,
    live: r.isActive,
    listeners: r.listeners,
    linkUrl: r.linkUrl,
    ...(endedAgo ? { endedAgo } : {})
  };
}

function endedAgoFromMs(ms: number): string {
  const mins = Math.max(1, Math.floor(ms / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
