import { createHash } from "node:crypto";
import { extractJsonObject } from "./xaiTrendingTweets.js";
import { isCanonicalLiveSessionUrl, normalizeLiveSessionUrl } from "./liveSessionUrls.js";
import type { XaiLiveSessionRow } from "./xaiLiveSessions.js";

const BROADCAST_URL_RE =
  /https?:\/\/(?:x\.com|twitter\.com)\/i\/broadcasts\/([A-Za-z0-9]+)(?:[^\s\])"'<>]*)?/gi;
const SPACE_URL_RE = /https?:\/\/(?:x\.com|twitter\.com)\/i\/spaces\/([A-Za-z0-9]+)(?:[^\s\])"'<>]*)?/gi;

function idFromUrl(kind: string, url: string, i: number): string {
  const h = createHash("sha256").update(`${kind}\0${url}\0${i}`).digest("hex").slice(0, 16);
  return `${kind}-${h}`;
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

function titleFromLine(line: string, url: string): string {
  let t = line.replace(url, "").trim();
  t = t.replace(/^[\d]+[.)]\s*/, "");
  t = t.replace(/^[-–—•*]\s*/, "");
  const dashSplit = t.split(/\s+[—–-]\s+/);
  const parts = dashSplit.map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[0]!.slice(0, 280);
  if (parts[0]) return parts[0].slice(0, 280);
  return "Live on X";
}

function handleFromLine(line: string): string | undefined {
  const m = line.match(/@([A-Za-z0-9_]{1,30})/);
  return m?.[1]?.toLowerCase();
}

function rowsFromUrlScan(content: string, kind: "space" | "broadcast"): XaiLiveSessionRow[] {
  const re = kind === "space" ? SPACE_URL_RE : BROADCAST_URL_RE;
  const lines = content.split(/\n/);
  const out: XaiLiveSessionRow[] = [];
  const seen = new Set<string>();

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const idPart = m[1]!;
      const url = normalizeLiveSessionUrl(m[0]!.replace(/[.,;:!?*)\]}>'"]+$/g, ""));
      if (!isCanonicalLiveSessionUrl(url, kind)) continue;
      const dedupe = `${kind}:${idPart}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const handle = handleFromLine(line) ?? "pending";
      out.push({
        id: idFromUrl(kind, url, out.length),
        kind,
        handle,
        author: handle.startsWith("@") ? handle : `@${handle}`,
        title: titleFromLine(line, m[0]!),
        live: true,
        listeners: 0,
        linkUrl: kind === "space" && !url.includes("/peek") ? `${url.replace(/\/+$/, "")}/peek` : url
      });
    }
  }

  return out;
}

function coerceItem(
  raw: Record<string, unknown>,
  kind: "space" | "broadcast",
  index: number
): XaiLiveSessionRow | null {
  const title = String(raw.title ?? raw.name ?? "").trim();
  const url = normalizeLiveSessionUrl(String(raw.url ?? raw.link ?? ""));
  if (!title || !url || !isCanonicalLiveSessionUrl(url, kind)) return null;
  const hostLabel = String(raw.host ?? raw.hosts ?? raw.account ?? "").trim();
  const handle = slugHandleFromHost(hostLabel, kind === "space" ? "spaces" : "broadcast");
  return {
    id: idFromUrl(kind, url, index),
    kind,
    handle,
    author: hostLabel || (kind === "space" ? "X Space" : "X Broadcast"),
    title: title.slice(0, 280),
    live: typeof raw.live === "boolean" ? raw.live : true,
    listeners:
      typeof raw.listeners === "number" && raw.listeners >= 0
        ? Math.floor(raw.listeners)
        : typeof raw.listener_count === "number"
          ? Math.max(0, Math.floor(raw.listener_count))
          : 0,
    linkUrl: kind === "space" && !url.includes("/peek") ? `${url.replace(/\/+$/, "")}/peek` : url
  };
}

function rowsFromJsonObject(data: unknown, kind: "space" | "broadcast", max: number): XaiLiveSessionRow[] {
  if (!data || typeof data !== "object") return [];
  const rec = data as Record<string, unknown>;
  const key =
    kind === "space"
      ? (rec.live_x_spaces ?? rec.spaces ?? rec.live_spaces ?? rec.items)
      : (rec.live_x_broadcasts ?? rec.broadcasts ?? rec.live_broadcasts ?? rec.items);
  if (!Array.isArray(key)) return [];
  const out: XaiLiveSessionRow[] = [];
  for (let i = 0; i < key.length; i++) {
    const o = key[i];
    if (!o || typeof o !== "object") continue;
    const row = coerceItem(o as Record<string, unknown>, kind, i);
    if (row) out.push(row);
  }
  return out.slice(0, max);
}

/** Parse Grok Heavy-style prose lists or JSON blobs into session rows. */
export function parseGrokLiveSessionContent(
  content: string,
  kind: "space" | "broadcast",
  max: number
): XaiLiveSessionRow[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  try {
    const data = extractJsonObject(trimmed);
    const fromJson = rowsFromJsonObject(data, kind, max);
    if (fromJson.length) return fromJson;
  } catch {
    /* fall through to URL scan */
  }

  return rowsFromUrlScan(trimmed, kind).slice(0, max);
}
