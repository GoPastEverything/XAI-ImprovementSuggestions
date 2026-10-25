import type { Tweet, TransmissionKind } from "./search.js";

const TWEET_FIELDS =
  "created_at,public_metrics,author_id,attachments,conversation_id,referenced_tweets";

/** Aligns with X “full user in one response” guidance (verified optional for future UI). */
const USER_FIELDS = "name,username,profile_image_url,verified";

const TIMELINE_EXPANSIONS = "author_id,attachments.media_keys";
const MEDIA_FIELDS = "url,preview_image_url,type,variants";

const DEFAULT_UA = "iFixedX/1.0 (ranking prototype)";

/** Respect 429 + Retry-After (seconds), with bounded backoff fallback. */
async function fetchXJson(url: string, bearerToken: string, retries = 4): Promise<Response> {
  const headers = {
    Authorization: `Bearer ${bearerToken}`,
    "User-Agent": DEFAULT_UA
  };
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 429 && attempt < retries - 1) {
      let waitMs = 2500 * (attempt + 1);
      const ra = res.headers.get("retry-after");
      if (ra) {
        const sec = parseInt(ra, 10);
        if (Number.isFinite(sec) && sec >= 0) waitMs = Math.min(120_000, Math.max(500, sec * 1000));
      }
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    return res;
  }
  return fetch(url, { headers });
}

/** Upscale default `_normal` avatars for sharper masonry tiles. */
function sharperProfileImageUrl(url: string | undefined): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  return u.replace(/_normal(\.(jpg|jpeg|png|webp))$/i, "_400x400$1");
}

const RECENT_SEARCH = "https://api.twitter.com/2/tweets/search/recent";

/** User home timeline (reverse chronological). OAuth 2 user context only — not app-only Bearer. */
function reverseChronUrl(userId: string): string {
  return `https://api.twitter.com/2/users/${encodeURIComponent(userId)}/timelines/reverse_chronological`;
}

type XPublicMetrics = {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
  bookmark_count?: number;
  impression_count?: number;
};

type XTweet = {
  id: string;
  text: string;
  author_id: string;
  created_at?: string;
  public_metrics?: XPublicMetrics;
  attachments?: { media_keys?: string[] };
  referenced_tweets?: { type: string; id: string }[];
};

type XUser = {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
};

type XMediaVariant = {
  bit_rate?: number;
  content_type?: string;
  url?: string;
};

type XMedia = {
  media_key: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  variants?: XMediaVariant[];
};

type RecentSearchResponse = {
  data?: XTweet[];
  includes?: { users?: XUser[]; media?: XMedia[] };
  meta?: { result_count?: number; next_token?: string };
  errors?: { title?: string; detail?: string; status?: number }[];
};

/** Prefer large TwIMG variant for timeline cards (natural aspect in classic layout). */
function twimgDisplayUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  if (/[?&]name=/.test(u)) return u.replace(/([?&])name=\w+/i, "$1name=large");
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}name=large`;
}

function applyTimelineQueryParams(u: URL): void {
  u.searchParams.set("tweet.fields", TWEET_FIELDS);
  u.searchParams.set("expansions", TIMELINE_EXPANSIONS);
  u.searchParams.set("user.fields", USER_FIELDS);
  u.searchParams.set("media.fields", MEDIA_FIELDS);
}

function mediaAttachmentsForTweet(
  tw: XTweet,
  mediaByKey: Map<string, XMedia>
): { mediaUrls?: string[]; videoUrl?: string } {
  const keys = tw.attachments?.media_keys ?? [];
  if (!keys.length) return {};

  const mediaUrls: string[] = [];
  let videoUrl: string | undefined;

  for (const key of keys) {
    const m = mediaByKey.get(key);
    if (!m) continue;

    if (m.type === "photo" && m.url) {
      const u = twimgDisplayUrl(m.url);
      if (!mediaUrls.includes(u)) mediaUrls.push(u);
      continue;
    }

    if (m.type === "video" || m.type === "animated_gif") {
      if (m.preview_image_url) {
        const u = twimgDisplayUrl(m.preview_image_url);
        if (!mediaUrls.includes(u)) mediaUrls.push(u);
      }
      const mp4s = (m.variants ?? []).filter(
        (v) => v.content_type === "video/mp4" && typeof v.url === "string" && v.url.trim()
      );
      mp4s.sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
      const best = mp4s[0]?.url?.trim();
      if (best && !videoUrl) videoUrl = best;
    }
  }

  return {
    ...(mediaUrls.length ? { mediaUrls } : {}),
    ...(videoUrl ? { videoUrl } : {})
  };
}

/** Build Recent Search query; keeps user text; trims length for API limits. */
export function buildRecentSearchQuery(userQuery: string, opts: { omitRetweets: boolean }): string {
  const trimmed = userQuery.trim().slice(0, 400);
  const base = trimmed.length ? trimmed : "\"\"";
  const q = opts.omitRetweets ? `${base} -is:retweet` : base;
  return q.length > 512 ? q.slice(0, 512) : q;
}

function inferTags(text: string): string[] {
  const tags: string[] = [];
  const hashtags = text.match(/#[\w\u00c0-\u024f]+/gi) ?? [];
  if (hashtags.length >= 4) tags.push("hashtag-heavy");
  if (/\b(follow|giveaway|free|click\s*here|trial)\b/i.test(text)) tags.push("promo-shaped");
  return tags;
}

/**
 * Recent Search (GET — tweets from last ~7 days, Bearer: app or user OAuth).
 * Paginates with `meta.next_token` until `maxResults` or `maxPages` (whichever first).
 * @see https://developer.x.com/en/docs/twitter-api/tweets/search/quick-start/recent-search
 */
export async function fetchRecentPostsAsTweets(
  bearerToken: string,
  userQuery: string,
  maxResults: number,
  omitRetweets: boolean,
  opts?: { maxPages?: number }
): Promise<Tweet[]> {
  const query = buildRecentSearchQuery(userQuery, { omitRetweets });
  const desiredTotal = Math.min(500, Math.max(10, Math.floor(maxResults)));
  const maxPages = Math.max(1, Math.min(10, Math.floor(opts?.maxPages ?? 3)));

  const merged: Tweet[] = [];
  const seen = new Set<string>();
  let nextToken: string | undefined;

  for (let page = 0; page < maxPages && merged.length < desiredTotal; page++) {
    const pageSize = Math.min(100, Math.max(10, desiredTotal - merged.length));
    const u = new URL(RECENT_SEARCH);
    u.searchParams.set("query", query);
    u.searchParams.set("max_results", String(pageSize));
    applyTimelineQueryParams(u);
    if (nextToken) u.searchParams.set("next_token", nextToken);

    const res = await fetchXJson(u.toString(), bearerToken);
    const body = (await res.json()) as RecentSearchResponse;

    if (!res.ok || body.errors?.length) {
      const fromErrors =
        body.errors?.map((e) => e.detail || e.title).filter(Boolean).join(" • ") || "";
      if (res.status === 402) {
        throw new Error(
          `X API 402 (Payment Required): Recent Search is not on your current X developer access level. ` +
            `${fromErrors ? `X: ${fromErrors} ` : ""}` +
            `Use Corpus → Mock for demos, or upgrade at https://developer.x.com/`
        );
      }
      const msg = fromErrors || `X API error (${res.status})`;
      throw new Error(msg);
    }

    for (const t of mapTimelineDataToTweets(body)) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }

    nextToken = body.meta?.next_token;
    if (!nextToken) break;
  }

  return merged.slice(0, desiredTotal);
}

function transmissionFromReferenced(refs?: { type: string }[]): TransmissionKind | undefined {
  if (!refs?.length) return undefined;
  if (refs.some((r) => r.type === "retweeted")) return "rtx";
  if (refs.some((r) => r.type === "quoted")) return "qtx";
  return "tx";
}

function mapTimelineDataToTweets(body: RecentSearchResponse): Tweet[] {
  const users = new Map<string, XUser>();
  for (const user of body.includes?.users ?? []) {
    users.set(user.id, user);
  }

  const mediaByKey = new Map<string, XMedia>();
  for (const m of body.includes?.media ?? []) {
    if (m.media_key) mediaByKey.set(m.media_key, m);
  }

  const tweets: Tweet[] = [];
  for (const tw of body.data ?? []) {
    const uinfo = users.get(tw.author_id);
    const metrics = tw.public_metrics;
    const attachmentMedia = mediaAttachmentsForTweet(tw, mediaByKey);
    const hasMedia = Boolean(
      tw.attachments?.media_keys?.length ||
        attachmentMedia.mediaUrls?.length ||
        attachmentMedia.videoUrl
    );
    const impression = metrics?.impression_count;
    const avatarUrl = sharperProfileImageUrl(uinfo?.profile_image_url);
    const replies = metrics?.reply_count;
    tweets.push({
      id: tw.id,
      text: tw.text,
      author: uinfo?.name ?? "Unknown",
      handle: uinfo?.username ?? tw.author_id,
      createdAt: tw.created_at ?? new Date().toISOString(),
      likes: metrics?.like_count ?? 0,
      retweets: metrics?.retweet_count ?? 0,
      ...(typeof replies === "number" && replies >= 0 ? { replyCount: replies } : {}),
      ...(typeof impression === "number" && impression >= 0 ? { viewCount: impression } : {}),
      hasMedia,
      tags: inferTags(tw.text),
      transmission: transmissionFromReferenced(tw.referenced_tweets),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...attachmentMedia
    });
  }
  return tweets;
}

/**
 * Reverse-chronological home timeline (posts from accounts you follow).
 * @see https://developer.x.com/en/docs/twitter-api/tweets/timelines/migrate
 */
export type PaginatedHomeTimeline = {
  tweets: Tweet[];
  nextToken?: string;
};

export async function fetchReverseChronologicalHomeTimeline(
  userAccessToken: string,
  userNumericId: string,
  maxResults: number,
  paginationToken?: string | null
): Promise<PaginatedHomeTimeline> {
  const max = Math.min(100, Math.max(5, Math.floor(maxResults)));
  const u = new URL(reverseChronUrl(userNumericId));
  u.searchParams.set("max_results", String(max));
  applyTimelineQueryParams(u);
  const pt = paginationToken?.trim();
  if (pt) u.searchParams.set("pagination_token", pt);

  const res = await fetchXJson(u.toString(), userAccessToken);

  const body = (await res.json()) as RecentSearchResponse;

  if (!res.ok || body.errors?.length) {
    const fromX = body.errors?.map((e) => e.detail || e.title).filter(Boolean).join(" • ");
    if (res.status === 402 || res.status === 403) {
      throw new Error(
        `Home timeline is not included in your X developer access (HTTP ${res.status}). ` +
          `The reverse-chronological following feed typically requires a paid API tier; Recent Search under Explore may still work on your plan. ` +
          `See https://developer.x.com/en/docs/twitter-api` +
          (fromX ? `. X says: ${fromX}` : ".")
      );
    }
    const msg = fromX || `X API error (${res.status})`;
    throw new Error(msg);
  }

  return {
    tweets: mapTimelineDataToTweets(body),
    nextToken: body.meta?.next_token
  };
}

/**
 * Tweets from a List you own or follow (`GET /2/lists/:id/tweets`).
 * Works as a “pseudo home” when reverse-chron home and Recent Search are blocked: pin a list of accounts on x.com
 * and set IFIXEDX_HOME_LIST_ID to the numeric id from the list URL.
 */
export async function fetchListTimelineTweets(
  userAccessToken: string,
  listId: string,
  maxResults: number
): Promise<Tweet[]> {
  const max = Math.min(100, Math.max(5, Math.floor(maxResults)));
  const u = new URL(`https://api.twitter.com/2/lists/${encodeURIComponent(listId)}/tweets`);
  u.searchParams.set("max_results", String(max));
  applyTimelineQueryParams(u);

  const res = await fetchXJson(u.toString(), userAccessToken);

  const body = (await res.json()) as RecentSearchResponse;

  if (!res.ok || body.errors?.length) {
    const fromX = body.errors?.map((e) => e.detail || e.title).filter(Boolean).join(" • ");
    if (res.status === 402 || res.status === 403) {
      throw new Error(
        `List timeline not available (HTTP ${res.status}). ` +
          (fromX ? `X says: ${fromX}` : "") +
          (fromX ? "" : " Confirm the list id and List read access for your app.")
      );
    }
    const msg = fromX || `X API error (${res.status})`;
    throw new Error(msg);
  }

  return mapTimelineDataToTweets(body);
}

/** Tweets authored by this user (`GET /2/users/:id/tweets`). Fallback when home timeline is blocked. */
export async function fetchUserAuthoredTweets(
  userAccessToken: string,
  userNumericId: string,
  maxResults: number
): Promise<Tweet[]> {
  const max = Math.min(100, Math.max(5, Math.floor(maxResults)));
  const u = new URL(`https://api.twitter.com/2/users/${encodeURIComponent(userNumericId)}/tweets`);
  u.searchParams.set("max_results", String(max));
  u.searchParams.set("exclude", "retweets");
  applyTimelineQueryParams(u);

  const res = await fetchXJson(u.toString(), userAccessToken);

  const body = (await res.json()) as RecentSearchResponse;

  if (!res.ok || body.errors?.length) {
    const fromX = body.errors?.map((e) => e.detail || e.title).filter(Boolean).join(" • ");
    if (res.status === 402 || res.status === 403) {
      throw new Error(
        `USER_AUTHORED_TIMELINE_BLOCKED ${res.status}` + (fromX ? `: ${fromX}` : "")
      );
    }
    const msg = fromX || `X API error (${res.status})`;
    throw new Error(msg);
  }

  return mapTimelineDataToTweets(body);
}
