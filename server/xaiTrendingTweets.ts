/**
 * xAI (Grok) — curated JSON list of tweet-like items for demos / mixer experiments.
 * Requires XAI_API_KEY in server env. Optional live search: XAI_LIVE_SEARCH=1
 */

const XAI_URL = "https://api.x.ai/v1/chat/completions";

export type XaiTrendingTweetItem = {
  url: string;
  postcontentdata: string;
  context: string;
  /** Author profile image when the model can supply a real HTTPS URL (e.g. pbs.twimg.com) */
  profileImageUrl?: string;
  /** Approximate public reply/comment count when known from research */
  replyCount?: number;
  /** Direct video or playable asset URL when the model supplies one (e.g. video.twimg.com clip) */
  videoUrl?: string;
  /** media1, media2, … as returned by the model */
  [key: string]: string | number | undefined;
};

export type XaiTrendingResponse = {
  tweets: XaiTrendingTweetItem[];
  model: string;
  /** True only if the successful request included xAI live search parameters. */
  liveSearch: boolean;
  rawCitations?: unknown;
  warning?: string;
};

export function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const unfenced = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(unfenced) as unknown;
}

function normalizeTweet(raw: Record<string, unknown>, index: number): XaiTrendingTweetItem {
  const url = String(raw.url ?? "").trim();
  const postcontentdata = String(raw.postcontentdata ?? raw.postContentData ?? raw.text ?? "").trim();
  const context = String(raw.context ?? "").trim();
  const profileImageUrl = String(
    raw.profileImageUrl ?? raw.profile_image_url ?? raw.avatarUrl ?? ""
  ).trim();
  const out: XaiTrendingTweetItem = { url, postcontentdata, context };

  const pushHttps = (s: string) => s.trim().replace(/^http:\/\//i, "https://");

  for (const [k, v] of Object.entries(raw)) {
    if (/^media\d+$/i.test(k) && typeof v === "string" && v.trim()) {
      out[k.toLowerCase()] = pushHttps(v);
    }
    if (/^media\d+$/i.test(k) && Array.isArray(v)) {
      let n = Number(/\d+/.exec(k)?.[0] ?? 0) || 1;
      for (const x of v) {
        if (typeof x === "string" && x.trim()) {
          out[`media${n}`] = pushHttps(x);
          n++;
        }
      }
    }
  }

  const seenMedia = new Set<string>();
  for (const [k, v] of Object.entries(out)) {
    if (/^media\d+$/i.test(k) && typeof v === "string") seenMedia.add(v);
  }
  let nextIdx = 1;
  while (`media${nextIdx}` in out) nextIdx++;
  const addMedia = (s: string) => {
    const h = pushHttps(s);
    if (!/^https:\/\//i.test(h)) return;
    if (seenMedia.has(h)) return;
    seenMedia.add(h);
    while (`media${nextIdx}` in out) nextIdx++;
    out[`media${nextIdx}`] = h;
    nextIdx++;
  };
  const arrayKeys = ["media", "images", "imageUrls", "mediaUrls", "photos"] as const;
  for (const key of arrayKeys) {
    const v = raw[key];
    if (!Array.isArray(v)) continue;
    for (const x of v) {
      if (typeof x === "string") addMedia(x);
    }
  }
  const singleImg = raw.image ?? raw.thumbnail ?? raw.thumbUrl;
  if (typeof singleImg === "string") addMedia(singleImg);

  if (profileImageUrl && /^https?:\/\//i.test(profileImageUrl)) {
    const h = pushHttps(profileImageUrl);
    try {
      const u = new URL(h);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const isXPhotoShell =
        (host === "x.com" || host === "twitter.com") && /\/photo\/?$/i.test(u.pathname);
      if (!isXPhotoShell) out.profileImageUrl = h;
    } catch {
      out.profileImageUrl = h;
    }
  }

  for (const vk of ["videoUrl", "video", "video_url"] as const) {
    const v = raw[vk];
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) {
      out.videoUrl = pushHttps(v);
      break;
    }
  }

  const rc = raw.replyCount ?? raw.reply_count;
  if (typeof rc === "number" && Number.isFinite(rc) && rc >= 0) {
    out.replyCount = Math.min(1_000_000, Math.floor(rc));
  }
  if (!url || !postcontentdata) {
    throw new Error(`Tweet ${index + 1} missing url or postcontentdata`);
  }
  return out;
}

function parseTweetsPayload(data: unknown): XaiTrendingTweetItem[] {
  if (!data || typeof data !== "object") throw new Error("Model did not return a JSON object");
  const rec = data as Record<string, unknown>;
  const tweetsRaw = rec.tweets ?? rec.items ?? rec.posts;
  if (!Array.isArray(tweetsRaw)) throw new Error('Expected top-level array field "tweets"');
  return tweetsRaw.map((t, i) => {
    if (!t || typeof t !== "object") throw new Error(`Tweet ${i + 1} is not an object`);
    return normalizeTweet(t as Record<string, unknown>, i);
  });
}

function buildUserPrompt(n: number): string {
  return `You are helping build realistic English (US) timeline data for a feed mixer demo.

Use your ${n === 10 ? "" : "(adjustable) "}research to pick **exactly ${n}** posts on X (Twitter) that are **currently trending, breaking, or broadly popular** in the United States among real-looking accounts — **avoid** obvious spam bots, engagement farms, or copy-paste reply rings.

Rules:
- Posts must be **English (US)** only.
- Prefer posts you can tie to **real status URLs** on X: \`https://x.com/{handle}/status/{id}\` (or twitter.com).
- For **postcontentdata**: use the visible tweet text (no "RT @" prefix for pure retweets; if quoting, you may include quote context in **context**).
- For **context**: 1–3 sentences on why this post is relevant / credible / not obviously botted (organic discussion, verified-adjacent, journalist, brand, etc.).
- Media: If the post has images, GIFs, or video, you MUST attach usable **direct HTTPS** asset URLs — **never rely on t.co alone** for rendering.
  - Use **media1**, **media2**, … for still images / GIF thumbs (\`pbs.twimg.com/media/...\`, etc.).
  - Use **videoUrl** for a direct clip when applicable (\`video.twimg.com/...\`).
  - If a TwIMG URL appears in **postcontentdata**, repeat it in **media1** or **videoUrl** so the feed can render it.
  - If there is no media, omit media* and **videoUrl** entirely.
- **profileImageUrl** (optional): Direct **image** URL only — e.g. \`https://pbs.twimg.com/profile_images/...\`. **Never** use \`https://x.com/{handle}/photo\` (that is a web page, not an image). Omit if unknown.
- **replyCount** (optional): Approximate **public reply/comment count** visible on the post if you can infer it from research; omit if unknown.

Return **ONLY** valid JSON (no markdown, no commentary) with this exact shape:
{"tweets":[{"url":"...","postcontentdata":"...","context":"...","profileImageUrl":"https://...","replyCount":123}]}

profileImageUrl and replyCount may be omitted per tweet. You may add optional string fields **media1**, **media2**, etc. on each object. Exactly ${n} objects in "tweets".`;
}

/** Category pull for TheFeedtrix: same JSON shape, focused on one topic area. */
export function buildFeedtrixTopicPrompt(n: number, topicTitle: string): string {
  return `You are building English (US) X (Twitter) corpus data for a topical feed bucket.

Topic area: **${topicTitle}**.

Use your research to pick **exactly ${n}** posts that are **strongly about this topic** — currently discussed, breaking, or substantive — from real-looking US-English accounts on X. Avoid obvious spam, engagement farms, and pure viral memes unrelated to the topic.

Rules:
- Posts must be **English (US)** only.
- Prefer **real status URLs** on X: \`https://x.com/{handle}/status/{id}\` (or twitter.com).
- **postcontentdata**: visible tweet text (no unnecessary "RT @" prefix).

- **context**: 1–3 sentences tying the post to the topic and credibility.
- **media*** optional as in standard schema; **profileImageUrl** / **replyCount** optional.

Return **ONLY** valid JSON (no markdown) with shape:
{"tweets":[{"url":"...","postcontentdata":"...","context":"..."}]}

Exactly ${n} objects in "tweets".`;
}

export async function fetchTrendingTweetsViaXai(
  env: NodeJS.ProcessEnv,
  opts: {
    count: number;
    liveSearch?: boolean;
    /** When set, request is topic-focused and allows larger batch caps (TheFeedtrix). */
    feedtrixTopic?: { slug: string; title: string };
  }
): Promise<XaiTrendingResponse> {
  const key = env.XAI_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing XAI_API_KEY in server environment");
  }

  const model = env.XAI_MODEL?.trim() || "grok-4.3";
  const ftBatch = Number(env.THE_FEEDTRIX_BATCH_SIZE ?? 69);
  const batchCap =
    opts.feedtrixTopic != null ? Math.min(80, Math.max(12, Number.isFinite(ftBatch) ? ftBatch : 69)) : 25;
  const count = Math.min(batchCap, Math.max(1, opts.count));
  const userContent = opts.feedtrixTopic
    ? buildFeedtrixTopicPrompt(count, opts.feedtrixTopic.title)
    : buildUserPrompt(count);

  const wantLive =
    opts.liveSearch ??
    (env.XAI_LIVE_SEARCH === "1" || env.XAI_LIVE_SEARCH === "true");

  const bodyBase = {
    model,
    temperature: opts.feedtrixTopic ? 0.3 : 0.25,
    max_tokens: opts.feedtrixTopic ? 12_288 : 8192,
    messages: [
      {
        role: "system" as const,
        content:
          "You output ONLY compact JSON. Never use markdown fences. Follow the user schema exactly. Prefer factual, verifiable X post URLs when live search is available."
      },
      { role: "user" as const, content: userContent }
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

  const tweets = parseTweetsPayload(parsed);
  const adjusted = tweets.slice(0, count);
  const warning =
    tweets.length < count
      ? `Model returned ${tweets.length} tweets; expected ${count}.`
      : tweets.length > count
        ? `Trimmed from ${tweets.length} to ${count}.`
        : undefined;

  return {
    tweets: adjusted,
    model,
    liveSearch: usedLiveSearch,
    rawCitations: root.citations,
    ...(warning ? { warning } : {})
  };
}
