import { createHash } from "node:crypto";
import {
  isCanonicalLiveSessionUrl,
  normalizeLiveSessionUrl,
  parseBroadcastIdFromUrl,
  parseSpaceIdFromUrl
} from "./liveSessionUrls.js";
import type { XaiLiveSessionRow } from "./xaiLiveSessions.js";

const BROADCAST_URL_RE =
  /https?:\/\/(?:x\.com|twitter\.com)\/i\/broadcasts\/([A-Za-z0-9]+)(?:[^\s\])"'<>]*)?/gi;
const SPACE_URL_RE = /https?:\/\/(?:x\.com|twitter\.com)\/i\/spaces\/([A-Za-z0-9]+)(?:[^\s\])"'<>]*)?/gi;

function idFromUrl(kind: string, url: string, i: number): string {
  const h = createHash("sha256").update(`${kind}\0${url}\0${i}`).digest("hex").slice(0, 16);
  return `${kind}-${h}`;
}

function titleFromContext(text: string, url: string, fallback: string): string {
  const idx = text.indexOf(url);
  let t = idx >= 0 ? text.slice(0, idx) + text.slice(idx + url.length) : text;
  t = t.replace(url, "").trim();
  t = t.replace(/^[\d]+[.)]\s*/, "").replace(/^[-–—•*]\s*/, "").trim();
  if (t.length >= 8 && t.length <= 280) return t;
  return fallback.slice(0, 280);
}

/** Extract canonical Space/Broadcast rows from arbitrary text (tweet body, Grok prose, etc.). */
export function extractLiveSessionRowsFromText(
  text: string,
  kind: "space" | "broadcast",
  meta: { handle: string; author: string; titleFallback?: string }
): XaiLiveSessionRow[] {
  const re = kind === "space" ? SPACE_URL_RE : BROADCAST_URL_RE;
  const out: XaiLiveSessionRow[] = [];
  const seen = new Set<string>();
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    const platformId = m[1]!;
    if (seen.has(platformId)) continue;
    seen.add(platformId);
    const raw = m[0]!;
    const norm = normalizeLiveSessionUrl(raw.split(/[\s\])"'<>]/)[0] ?? raw);
    const linkUrl =
      kind === "space"
        ? `https://x.com/i/spaces/${platformId}/peek`
        : `https://x.com/i/broadcasts/${platformId}`;
    if (!isCanonicalLiveSessionUrl(linkUrl, kind)) continue;
    const handle = meta.handle.replace(/^@/, "").toLowerCase() || "unknown";
    out.push({
      id: idFromUrl(kind, linkUrl, i++),
      kind,
      handle,
      author: meta.author,
      title: titleFromContext(text, raw, meta.titleFallback ?? "Live on X"),
      live: true,
      listeners: 0,
      linkUrl
    });
  }
  return out;
}
