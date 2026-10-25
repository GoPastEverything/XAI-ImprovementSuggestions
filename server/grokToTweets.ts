import type { XaiTrendingTweetItem } from "./xaiTrendingTweets.js";
import type { Tweet } from "./search.js";
import { isSuspiciousTweetId } from "./tweetIdSanity.js";

/** Pull TwIMG media/video URLs Grok sometimes leaves only in the tweet body. */
function twimgUrlsFromText(text: string): string[] {
  const re = /\bhttps?:\/\/(?:pbs\.twimg\.com|video\.twimg\.com)[^\s\])"'<>]+/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let u = m[0].replace(/[.,;:!?*)\]}>'"]+$/g, "");
    u = u.replace(/^http:\/\//i, "https://");
    if (!/^https:\/\/(?:pbs|video)\.twimg\.com\//i.test(u)) continue;
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function normalizeHttpsUrl(u: string): string | undefined {
  const t = u.trim().replace(/^http:\/\//i, "https://");
  return /^https:\/\//i.test(t) ? t : undefined;
}

function parseStatusFromUrl(url: string): { handle: string; statusId: string } | null {
  try {
    const u = new URL(url.trim().replace(/^http:\/\//i, "https://"));
    const path = u.pathname.replace(/\/+$/, "");
    const m = path.match(/^\/([^/]+)\/status\/(\d+)\/?$/i);
    if (!m) return null;
    return { handle: m[1], statusId: m[2] };
  } catch {
    return null;
  }
}

function displayNameFromHandle(h: string): string {
  const bare = h.replace(/^@/, "").trim();
  if (!bare) return "unknown";
  return bare
    .split(/[_-]+/g)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function sharperProfileImageUrl(url: string | undefined): string | undefined {
  const u = url?.trim();
  if (!u || !/^https:\/\//i.test(u)) return undefined;
  return u.replace(/_normal(\.(jpg|jpeg|png|webp))$/i, "_400x400$1");
}

/** Only return real image URLs (TwIMG etc.). Never `x.com/…/photo` — that is an HTML shell, breaks `<img>`, and spams resets on scroll. */
function resolveGrokAvatarUrl(_handle: string, explicit?: string | undefined): string | undefined {
  void _handle;
  return sharperProfileImageUrl(explicit);
}

/** Map xAI JSON items into the same Tweet shape as seed / X API corpora (then rankTweets). */
export function grokItemsToTweets(
  items: XaiTrendingTweetItem[],
  batchSalt: string,
  extras?: { feedtrixTopicSlug?: string }
): Tweet[] {
  const now = Date.now();
  const out: Tweet[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const parsed = parseStatusFromUrl(item.url);
    /** Skip Grok rows without a real x.com/status/{id} URL — no synthetic IDs (they 404 on X). */
    if (!parsed?.statusId || !/^\d{15,22}$/.test(parsed.statusId) || isSuspiciousTweetId(parsed.statusId)) continue;

    const handleRaw = parsed.handle;
    const handle = handleRaw.replace(/^@/, "").toLowerCase();
    const statusId = parsed.statusId;

    const rec = item as Record<string, unknown>;
    const mediaUrls: string[] = [];
    const mediaKeys = Object.keys(rec)
      .filter((k) => /^media\d+$/i.test(k))
      .sort((a, b) => {
        const na = Number(/\d+/.exec(a)?.[0] ?? 0);
        const nb = Number(/\d+/.exec(b)?.[0] ?? 0);
        return na - nb;
      });
    for (const k of mediaKeys) {
      const v = rec[k];
      if (typeof v === "string") {
        const u = normalizeHttpsUrl(v);
        if (u) mediaUrls.push(u);
      }
    }

    for (const u of twimgUrlsFromText(String(item.postcontentdata ?? ""))) {
      if (!mediaUrls.includes(u)) mediaUrls.push(u);
    }

    const videoRaw = [item.videoUrl, rec.videoUrl, rec.video, rec.video_url].find(
      (x): x is string => typeof x === "string" && /^https?:\/\//i.test(x.trim())
    );
    const videoUrl = videoRaw ? normalizeHttpsUrl(videoRaw) : undefined;

    const ctx = String(item.context ?? "").trim();
    const viewSeed = statusId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const avatarUrl = resolveGrokAvatarUrl(handle, item.profileImageUrl);
    const replyCount =
      typeof item.replyCount === "number" && item.replyCount >= 0 ? item.replyCount : undefined;

    const topicSlug = extras?.feedtrixTopicSlug?.trim();
    const tags = [...(topicSlug ? [`feedtrix-${topicSlug}`, "feedtrix", "thefeedtrix"] : []), "xai-grok", "en-us"];

    out.push({
      id: statusId,
      text: String(item.postcontentdata ?? "").trim(),
      author: displayNameFromHandle(handle),
      handle,
      createdAt: new Date(now - i * 90_000).toISOString(),
      likes: 24 + (viewSeed % 900),
      retweets: 4 + (viewSeed % 200),
      viewCount: 1_200 + (viewSeed % 180_000),
      ...(typeof replyCount === "number" ? { replyCount } : {}),
      hasMedia: mediaUrls.length > 0 || Boolean(videoUrl),
      tags,
      transmission: "tx",
      mediaUrls: mediaUrls.length ? mediaUrls : undefined,
      ...(videoUrl ? { videoUrl } : {}),
      mixerNote: ctx || undefined,
      ...(avatarUrl ? { avatarUrl } : {})
    });
  }

  return out;
}
