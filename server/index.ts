import "dotenv/config";
import cors from "cors";
import express from "express";
import { mountTrott } from "./trott.js";
import { localRequestGuard } from './localRequestGuard.js';
import { resolveCorpus, type CorpusSource } from "./corpus.js";
import { fetchHomeFeedWithFallbacks } from "./forYouCorpus.js";
import { rankTweets, loadTweets, type SearchMode } from "./search.js";
import {
  oauthLegacyGlobalFilePresent,
  oauthSessionFilesProbablyPresent,
  oauthTokensProbablyPresent
} from "./oauth/tokenFile.js";
import { getValidUserAccessToken } from "./oauth/tokenService.js";
import { mountXOAuth } from "./oauth/xAuthRoutes.js";
import { getVerifiedSessionIdFromRequest } from "./oauth/sessionCookie.js";
import { getMeForApi } from "./xUser.js";
import { fetchTrendingTweetsViaXai } from "./xaiTrendingTweets.js";
import { grokItemsToTweets } from "./grokToTweets.js";
import {
  buildLiveSessionsFromFeedtrixPipes,
  getFeedtrixLiveSchedulerState,
  runFeedtrixLiveHunt,
  startFeedtrixLiveScheduler
} from "./feedtrixLiveScheduler.js";
import { getFeedtrixTopicOrNull } from "./feedtrixTopics.js";
import { fetchLiveSessionDetail } from "./xLiveSessionDetail.js";
import {
  getTwitterSpiderStatusPayload,
  runTwitterSpiderHuntNow,
  runTwitterSpiderValidateNow,
  startTwitterSpiderScheduler
} from "./twitterSpiderScheduler.js";
import { listSpiderTweetsForClient } from "./twitterSpiderPipe.js";
import {
  getPipetrixStatsPayload,
  ingestRankedPayloadToPipetrix,
  listPipetrixBatchForClient,
  syncSpiderPipeToPipetrix,
  upsertServerCanonicalTweets
} from "./pipetrixStore.js";
import { getPipetrixSyncState, runPipetrixSpiderSyncNow } from "./pipetrixScheduler.js";
import { mountTwimgProxy } from "./twimgProxy.js";

function persistPayloadToServerPipetrix(payload: {
  platform_style?: import("./search.js").Tweet[];
  refined?: import("./search.js").Tweet[];
  homeDataSource?: string;
  source?: string;
  feed?: string;
}): void {
  void ingestRankedPayloadToPipetrix(payload).catch((e) => {
    console.warn("[ifixedx] Pipetrix persist failed:", e instanceof Error ? e.message : e);
  });
}

const app = express();
const PORT = Number(process.env.PORT) || 3847;

const bearerConfigured = Boolean(process.env.TWITTER_BEARER_TOKEN?.trim());
const oauthClientConfigured = Boolean(process.env.TWITTER_CLIENT_ID?.trim());
const xaiConfigured = Boolean(process.env.XAI_API_KEY?.trim());

function liveSearchConfiguredSync(): boolean {
  return bearerConfigured || oauthSessionFilesProbablyPresent() || oauthLegacyGlobalFilePresent();
}

app.use(localRequestGuard);
app.use(
  cors({
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    credentials: true
  })
);
app.use(express.json({ limit: '32kb' }));
mountTrott(app);

mountTwimgProxy(app);

mountXOAuth(app);

/** API only — Vite serves the UI on port 5173 during `npm run dev`. */
app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>iFixedX API</title></head>
<body style="font-family:system-ui,sans-serif;max-width:42rem;margin:2rem;line-height:1.5;">
  <h1>iFixedX API</h1>
  <p>This server exposes JSON under <code>/api</code>. There is no app at <code>/</code>.</p>
  <p><strong>Open the demo UI:</strong> <a href="http://localhost:5173">http://localhost:5173</a>
  (start with <code>npm run dev</code> — runs Vite + this API).</p>
  <p>
    Try: <code>GET /api/health</code> · <code>GET /api/me</code><br/>
    Sign in: <a href="/api/auth/x/login"><code>GET /api/auth/x/login</code></a> (redirects to X)<br/>
    Comparison: <code>GET /api/compare?q=test&amp;source=live</code><br/>
    For You: <code>GET /api/for-you</code> (OAuth user home timeline)<br/>
    TwIMG proxy (avatars/media): <code>GET /api/cdn/twimg?u=https%3A%2F%2Fpbs.twimg.com%2F...</code><br/>
    Grok curated feed JSON: <code>GET /api/xai/trending-tweets?n=10</code> (needs <code>XAI_API_KEY</code>)
  </p>
</body></html>`);
});

app.get("/api/health", (_req, res) => {
  try {
    const liveReady = liveSearchConfiguredSync();
    res.json({
      ok: true,
      twitterBearerConfigured: bearerConfigured,
      twitterOAuthClientConfigured: oauthClientConfigured,
      twitterUserTokensPresent: oauthTokensProbablyPresent(),
      twitterOAuthSessionFilesPresent: oauthSessionFilesProbablyPresent(),
      twitterLegacyGlobalOAuthFilePresent: oauthLegacyGlobalFilePresent(),
      twitterLiveSearchReady: liveReady,
      xaiConfigured,
      hints: [
        liveReady
          ? "Live search: Bearer token and/or at least one stored OAuth session on this server."
          : "For live posts: configure TWITTER_CLIENT_ID + Sign in with X per browser, and/or add TWITTER_BEARER_TOKEN.",
        "OAuth tokens are per-browser (HttpOnly cookie + data/oauth-sessions/). Set IFIXEDX_SESSION_SECRET in production.",
        "If you still have data/oauth-tokens.json from an old build, delete it — it is ignored and was insecure on shared hosts.",
        "OAuth callback URI must exactly match TWITTER_REDIRECT_URI (default http://localhost:3847/api/auth/x/callback)."
      ]
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "health check failed";
    res.status(500).json({ ok: false, error: msg });
  }
});

app.get("/api/me", async (req, res) => {
  try {
    const sid = getVerifiedSessionIdFromRequest(req, process.env);
    const me = await getMeForApi(process.env, sid);
    res.json(me);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "me endpoint failed";
    res.status(200).json({ connected: false, error: msg });
  }
});

function parseSource(raw: unknown): CorpusSource {
  const s = String(raw ?? "").toLowerCase();
  return s === "live" ? "live" : "mock";
}

function parseMode(raw: unknown): SearchMode {
  const m = String(raw ?? "refined");
  return m === "platform_style" ? "platform_style" : "refined";
}

async function twitterUserOAuthActiveThisRequest(req: Parameters<typeof getVerifiedSessionIdFromRequest>[0]) {
  const sid = getVerifiedSessionIdFromRequest(req, process.env);
  const tok = await getValidUserAccessToken(process.env, sid);
  return { sessionId: sid, hasUserOAuth: tok !== null };
}

async function liveAuthLabel(
  req: Parameters<typeof getVerifiedSessionIdFromRequest>[0]
): Promise<"user_oauth" | "app_bearer" | null> {
  try {
    const { hasUserOAuth } = await twitterUserOAuthActiveThisRequest(req);
    if (hasUserOAuth) return "user_oauth";
    if (bearerConfigured) return "app_bearer";
    return null;
  } catch {
    return bearerConfigured ? "app_bearer" : null;
  }
}

app.get("/api/compare", async (req, res) => {
  const q = String(req.query.q ?? "");
  const source = parseSource(req.query.source);
  const recencyWeight = Math.min(1, Math.max(0, Number(req.query.recencyWeight ?? 0.78)));
  const strictMatch = String(req.query.strictMatch ?? "1") === "1";
  const maxResults = Math.min(100, Math.max(10, Number(req.query.maxResults ?? 30)));
  const omitRetweets = String(req.query.omitRetweets ?? "1") === "1";

  if (!q.trim()) {
    res.status(400).json({ error: "Missing q" });
    return;
  }

  if (source === "live" && !liveSearchConfiguredSync()) {
    res.status(400).json({
      error:
        "Live search is not configured. Sign in with X from the app (OAuth) and/or set TWITTER_BEARER_TOKEN in .env.",
      twitterLiveSearchReady: false
    });
    return;
  }

  try {
    const sessionId = getVerifiedSessionIdFromRequest(req, process.env);
    const corpus = await resolveCorpus({
      source,
      query: q,
      env: process.env,
      maxResults,
      omitRetweets,
      sessionId
    });

    const liveAuth = source === "live" ? await liveAuthLabel(req) : null;
    const { hasUserOAuth } = await twitterUserOAuthActiveThisRequest(req);

    if (!corpus.length) {
      res.json({
        query: q,
        source,
        corpusSize: 0,
        omitRetweets,
        twitterBearerConfigured: bearerConfigured,
        twitterUserTokensPresent: hasUserOAuth,
        twitterLiveSearchReady: liveSearchConfiguredSync(),
        liveAuth,
        platform_style: [],
        refined: [],
        note:
          source === "live"
            ? "X API returned zero posts for this query (try broader terms)."
            : undefined
      });
      return;
    }

    const base = {
      q,
      recencyWeight: Number.isFinite(recencyWeight) ? recencyWeight : 0.78,
      strictMatch
    };

    const platform_style = rankTweets(corpus, { ...base, mode: "platform_style" });
    const refined = rankTweets(corpus, { ...base, mode: "refined" });
    persistPayloadToServerPipetrix({ platform_style, refined, source });

    res.json({
      query: q,
      source,
      corpusSize: corpus.length,
      omitRetweets,
      twitterBearerConfigured: bearerConfigured,
      twitterUserTokensPresent: hasUserOAuth,
      twitterLiveSearchReady: liveSearchConfiguredSync(),
      liveAuth,
      platform_style,
      refined
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(502).json({ error: message, source });
  }
});

app.get("/api/for-you", async (req, res) => {
  const recencyWeight = Math.min(1, Math.max(0, Number(req.query.recencyWeight ?? 0.78)));
  const strictMatch = String(req.query.strictMatch ?? "1") === "1";
  const maxResults = Math.min(100, Math.max(5, Number(req.query.maxResults ?? 35)));
  const useMock = String(req.query.mock ?? "") === "1";
  const useXai = String(req.query.xai ?? "") === "1";

  try {
    const { hasUserOAuth } = await twitterUserOAuthActiveThisRequest(req);

    if (useXai) {
      if (!xaiConfigured) {
        res.status(503).json({
          error:
            "xAI is not configured. Set XAI_API_KEY in the server .env. See .env.example.",
          feed: "home_reverse_chronological" as const,
          homeDataSource: undefined
        });
        return;
      }
      const liveQ = String(req.query.xaiLive ?? req.query.live ?? "").toLowerCase();
      const xaiLive = liveQ === "1" || liveQ === "true";
      const n = Math.min(25, Math.max(1, Number(req.query.maxResults ?? 12)));
      const { tweets: items, model, liveSearch, warning } = await fetchTrendingTweetsViaXai(
        process.env,
        { count: n, liveSearch: xaiLive }
      );
      const batchSalt = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const corpus = grokItemsToTweets(items, batchSalt);
      const base = {
        q: "",
        recencyWeight: Number.isFinite(recencyWeight) ? recencyWeight : 0.78,
        strictMatch
      };
      const platform_style = rankTweets(corpus, { ...base, mode: "platform_style" });
      const refined = rankTweets(corpus, { ...base, mode: "refined" });
      persistPayloadToServerPipetrix({
        platform_style,
        refined,
        feed: "home_reverse_chronological",
        homeDataSource: "xai_grok"
      });
      res.json({
        feed: "home_reverse_chronological" as const,
        corpusSize: corpus.length,
        twitterBearerConfigured: bearerConfigured,
        twitterUserTokensPresent: hasUserOAuth,
        twitterLiveSearchReady: liveSearchConfiguredSync(),
        liveAuth: null,
        platform_style,
        refined,
        note: [`xAI ${model}${liveSearch ? " · live search" : ""}.`, warning ?? ""].join(" ").trim(),
        homeDataSource: "xai_grok" as const,
        xaiIngest: {
          storedAt: new Date().toISOString(),
          model,
          liveSearch,
          warning,
          items: items.map((it) => ({ ...it }))
        }
      });
      return;
    }

    if (useMock) {
      const all = await loadTweets();
      const corpus = [...all].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const limited = corpus.slice(0, maxResults);
      const base = {
        q: "",
        recencyWeight: Number.isFinite(recencyWeight) ? recencyWeight : 0.78,
        strictMatch
      };
      const platform_style = rankTweets(limited, { ...base, mode: "platform_style" });
      const refined = rankTweets(limited, { ...base, mode: "refined" });
      persistPayloadToServerPipetrix({
        platform_style,
        refined,
        feed: "home_reverse_chronological",
        homeDataSource: "mock_seed"
      });
      res.json({
        feed: "home_reverse_chronological" as const,
        corpusSize: limited.length,
        twitterBearerConfigured: bearerConfigured,
        twitterUserTokensPresent: hasUserOAuth,
        twitterLiveSearchReady: liveSearchConfiguredSync(),
        liveAuth: null,
        platform_style,
        refined,
        note:
          "Saved-data demo — not a live X connection. Text, images, and counts reflect the saved snapshot. No X API requests.",
        homeDataSource: "mock_seed" as const
      });
      return;
    }

    const sid = getVerifiedSessionIdFromRequest(req, process.env);
    const userTok = await getValidUserAccessToken(process.env, sid);
    if (!userTok) {
      res.status(401).json({
        error:
          "Sign in with X is required for For You. Home timeline uses your OAuth token (not the app Bearer).",
        twitterUserTokensPresent: false
      });
      return;
    }

    const homeQ = typeof req.query.homeQ === "string" && req.query.homeQ.trim() ? req.query.homeQ.trim() : null;
    const paginationToken =
      typeof req.query.paginationToken === "string" && req.query.paginationToken.trim()
        ? req.query.paginationToken.trim()
        : null;

    const { tweets: corpus, homeDataSource, note: homeNote, homeTimelineNextToken } =
      await fetchHomeFeedWithFallbacks(process.env, maxResults, homeQ, sid, paginationToken);
    const liveAuth = await liveAuthLabel(req);

    if (!corpus.length) {
      res.json({
        feed: "home_reverse_chronological" as const,
        corpusSize: 0,
        twitterBearerConfigured: bearerConfigured,
        twitterUserTokensPresent: true,
        twitterLiveSearchReady: liveSearchConfiguredSync(),
        liveAuth,
        platform_style: [],
        refined: [],
        note: homeNote + " (no posts returned; try a broader IFIXEDX_HOME_FALLBACK_QUERY or homeQ= on the API).",
        homeDataSource
      });
      return;
    }

    const base = {
      q: "",
      recencyWeight: Number.isFinite(recencyWeight) ? recencyWeight : 0.78,
      strictMatch
    };

    const platform_style = rankTweets(corpus, { ...base, mode: "platform_style" });
    const refined = rankTweets(corpus, { ...base, mode: "refined" });
    persistPayloadToServerPipetrix({
      platform_style,
      refined,
      feed: "home_reverse_chronological",
      homeDataSource
    });

    res.json({
      feed: "home_reverse_chronological" as const,
      corpusSize: corpus.length,
      twitterBearerConfigured: bearerConfigured,
      twitterUserTokensPresent: true,
      twitterLiveSearchReady: liveSearchConfiguredSync(),
      liveAuth,
      platform_style,
      refined,
      note: homeNote,
      homeDataSource,
      ...(homeTimelineNextToken ? { homeTimelineNextToken } : {})
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = /Sign in with X|user access token|user id/i.test(message) ? 401 : 502;
    res.status(status).json({ error: message, feed: "home_reverse_chronological" });
  }
});

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q ?? "");
  const mode = parseMode(req.query.mode);
  const source = parseSource(req.query.source);
  const recencyWeight = Math.min(1, Math.max(0, Number(req.query.recencyWeight ?? 0.78)));
  const strictMatch = String(req.query.strictMatch ?? "1") === "1";
  const maxResults = Math.min(100, Math.max(10, Number(req.query.maxResults ?? 30)));
  const omitRetweets = String(req.query.omitRetweets ?? "1") === "1";

  if (!q.trim()) {
    res.status(400).json({ error: "Missing q" });
    return;
  }

  if (source === "live" && !liveSearchConfiguredSync()) {
    res.status(400).json({
      error: "Live search not configured (OAuth session or TWITTER_BEARER_TOKEN)",
      twitterLiveSearchReady: false
    });
    return;
  }

  try {
    const sessionId = getVerifiedSessionIdFromRequest(req, process.env);
    const corpus = await resolveCorpus({
      source,
      query: q,
      env: process.env,
      maxResults,
      omitRetweets,
      sessionId
    });
    const normalizedMode = mode === "platform_style" ? "platform_style" : "refined";
    const liveAuth = source === "live" ? await liveAuthLabel(req) : null;

    const results = rankTweets(corpus, {
      q,
      mode: normalizedMode,
      recencyWeight: Number.isFinite(recencyWeight) ? recencyWeight : 0.78,
      strictMatch
    });

    res.json({
      query: q,
      mode: normalizedMode,
      source,
      corpusSize: corpus.length,
      liveAuth,
      results
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(502).json({ error: message, source });
  }
});

app.get("/api/x/live-session-detail", async (req, res) => {
  const kindQ = String(req.query.kind ?? "").toLowerCase();
  const kind = kindQ === "broadcast" ? "broadcast" : kindQ === "space" ? "space" : null;
  const linkUrl = String(req.query.linkUrl ?? "").trim();
  if (!kind || !linkUrl) {
    res.status(400).json({ error: "kind (space|broadcast) and linkUrl are required." });
    return;
  }

  try {
    const sessionId = getVerifiedSessionIdFromRequest(req, process.env);
    const out = await fetchLiveSessionDetail(process.env, sessionId, {
      kind,
      linkUrl,
      fallbackTitle: String(req.query.title ?? "").trim() || undefined,
      fallbackHandle: String(req.query.handle ?? "").trim() || undefined,
      fallbackListeners: Number(req.query.listeners ?? NaN),
      fallbackLive: String(req.query.live ?? "1") !== "0"
    });
    res.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "live-session-detail failed";
    res.status(502).json({ error: message });
  }
});

app.get("/api/xai/live-sessions", async (req, res) => {
  const nSpaces = Math.min(100, Math.max(1, Number(req.query.nSpaces ?? 24)));
  const nBroadcasts = Math.min(100, Math.max(1, Number(req.query.nBroadcasts ?? 24)));
  const liveQ = String(req.query.live ?? "").toLowerCase();
  let liveSearch: boolean | undefined;
  if (liveQ === "1" || liveQ === "true") liveSearch = true;
  else if (liveQ === "0" || liveQ === "false") liveSearch = false;
  const forceRefresh = String(req.query.refresh ?? "") === "1";

  if (!xaiConfigured) {
    res.status(503).json({
      error: "xAI is not configured. Set XAI_API_KEY in the server .env.",
      xaiConfigured: false
    });
    return;
  }

  try {
    const sessionId = getVerifiedSessionIdFromRequest(req, process.env);

    if (forceRefresh) {
      void runFeedtrixLiveHunt(process.env, { sessionId });
    }

    const out = await buildLiveSessionsFromFeedtrixPipes(nSpaces, nBroadcasts);
    const sched = getFeedtrixLiveSchedulerState();
    res.json({
      ...out,
      xaiConfigured: true,
      fromFeedtrixPipe: true,
      refreshInProgress: sched.huntInProgress || sched.validateInProgress,
      ...(sched.lastHuntError ? { cacheLastError: sched.lastHuntError } : {}),
      warning: [
        out.warning,
        `Pipe: ${out.pipeStats.spaces.active} active spaces / ${out.pipeStats.spaces.total} tracked · ${out.pipeStats.broadcasts.active} active broadcasts / ${out.pipeStats.broadcasts.total} tracked`
      ]
        .filter(Boolean)
        .join(" · ")
    });
  } catch (e) {
    try {
      const out = await buildLiveSessionsFromFeedtrixPipes(nSpaces, nBroadcasts);
      if (out.spaces.length || out.broadcasts.length) {
        res.json({
          ...out,
          xaiConfigured: true,
          fromFeedtrixPipe: true,
          warning: `Build failed; partial pipe. ${e instanceof Error ? e.message : e}`
        });
        return;
      }
    } catch {
      /* fall through */
    }
    const message = e instanceof Error ? e.message : "xAI live-sessions failed";
    const status = /Missing XAI_API_KEY/i.test(message) ? 503 : 502;
    res.status(status).json({ error: message, xaiConfigured: true });
  }
});

app.get("/api/xai/trending-tweets", async (req, res) => {
  const n = Math.min(25, Math.max(1, Number(req.query.n ?? 10)));
  const liveQ = String(req.query.live ?? "").toLowerCase();
  let liveSearch: boolean | undefined;
  if (liveQ === "1" || liveQ === "true") liveSearch = true;
  else if (liveQ === "0" || liveQ === "false") liveSearch = false;

  if (!xaiConfigured) {
    res.status(503).json({
      error: "xAI is not configured. Set XAI_API_KEY in the server .env (never commit the key).",
      xaiConfigured: false
    });
    return;
  }

  try {
    const out = await fetchTrendingTweetsViaXai(process.env, { count: n, liveSearch });
    res.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "xAI trending request failed";
    const status = /Missing XAI_API_KEY/i.test(message) ? 503 : 502;
    res.status(status).json({ error: message, xaiConfigured: true });
  }
});

app.get("/api/xai/the-feedtrix/batch", async (req, res) => {
  const slug = String(req.query.topic ?? "").trim();
  const topic = slug ? getFeedtrixTopicOrNull(slug) : null;
  const liveQ = String(req.query.live ?? "").toLowerCase();
  let liveSearch: boolean | undefined;
  if (liveQ === "1" || liveQ === "true") liveSearch = true;
  else if (liveQ === "0" || liveQ === "false") liveSearch = false;

  const cfgBatch = Number(process.env.THE_FEEDTRIX_BATCH_SIZE ?? 69);
  const nReq = Math.min(80, Math.max(1, Number(req.query.n ?? NaN)));
  const nFallback = Number.isFinite(cfgBatch) ? cfgBatch : 69;
  const n = Number.isFinite(nReq) ? nReq : Math.min(80, Math.max(12, nFallback));

  if (!slug || !topic) {
    res.status(400).json({ error: "Missing or unknown topic slug", xaiConfigured });
    return;
  }

  if (!xaiConfigured) {
    res.status(503).json({
      error: "xAI is not configured. Set XAI_API_KEY in the server .env.",
      xaiConfigured: false
    });
    return;
  }

  try {
    const salt = `${topic.slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { tweets: items, model, liveSearch: usedLive, warning } = await fetchTrendingTweetsViaXai(process.env, {
      count: n,
      liveSearch,
      feedtrixTopic: { slug: topic.slug, title: topic.title }
    });
    const posts = grokItemsToTweets(items, salt, { feedtrixTopicSlug: topic.slug });
    void upsertServerCanonicalTweets(posts, "grok_topic", { topicIds: [topic.slug] });
    res.json({
      xaiConfigured: true,
      topic: topic.slug,
      topicTitle: topic.title,
      model,
      liveSearch: usedLive,
      ...(warning ? { warning } : {}),
      requested: n,
      received: posts.length,
      posts
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "the-feedtrix batch failed";
    const status = /Missing XAI_API_KEY/i.test(message) ? 503 : 502;
    res.status(status).json({ error: message, xaiConfigured: true });
  }
});

app.get("/api/twitter-spider/status", async (_req, res) => {
  try {
    const out = await getTwitterSpiderStatusPayload();
    res.json({ ok: true, ...out });
  } catch (e) {
    const message = e instanceof Error ? e.message : "twitter-spider status failed";
    res.status(502).json({ ok: false, error: message });
  }
});

app.post("/api/twitter-spider/run", async (req, res) => {
  try {
    const sessionId = getVerifiedSessionIdFromRequest(req, process.env);
    const hunt = await runTwitterSpiderHuntNow(process.env, sessionId);
    if (hunt.ok) {
      await runTwitterSpiderValidateNow(process.env, sessionId);
      await runPipetrixSpiderSyncNow();
    }
    const status = await getTwitterSpiderStatusPayload();
    const pipetrix = await getPipetrixStatsPayload();
    res.json({ ...hunt, status, pipetrix });
  } catch (e) {
    const message = e instanceof Error ? e.message : "twitter-spider run failed";
    res.status(502).json({ ok: false, error: message });
  }
});

app.get("/api/pipetrix/status", async (_req, res) => {
  try {
    const stats = await getPipetrixStatsPayload();
    res.json({ ok: true, ...stats, sync: getPipetrixSyncState() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "pipetrix status failed";
    res.status(502).json({ ok: false, error: message });
  }
});

app.get("/api/pipetrix/batch", async (req, res) => {
  const n = Math.min(500, Math.max(1, Number(req.query.n ?? 120)));
  const sinceMs = Math.max(0, Number(req.query.sinceMs ?? 0));
  const sourceQ = String(req.query.source ?? "").trim();
  const sourceTypes = sourceQ
    ? (sourceQ.split(",").map((s) => s.trim()).filter(Boolean) as import("./pipetrixStore.js").ServerCanonicalSourceType[])
    : undefined;
  try {
    const { posts, stats } = await listPipetrixBatchForClient({
      limit: n,
      sinceMs: sinceMs || undefined,
      sourceTypes,
      activeOnly: true
    });
    res.json({
      posts,
      tweets: posts.map((p) => p.tweet),
      stats
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "pipetrix batch failed";
    res.status(502).json({ error: message });
  }
});

app.post("/api/pipetrix/sync", async (_req, res) => {
  try {
    const spider = await runPipetrixSpiderSyncNow();
    const stats = await getPipetrixStatsPayload();
    res.json({ ...spider, stats, sync: getPipetrixSyncState() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "pipetrix sync failed";
    res.status(502).json({ ok: false, error: message });
  }
});

app.get("/api/twitter-spider/batch", async (req, res) => {
  const n = Math.min(100, Math.max(1, Number(req.query.n ?? 40)));
  const sinceMs = Math.max(0, Number(req.query.sinceMs ?? 0));
  try {
    const { tweets, stats } = await listSpiderTweetsForClient({
      limit: n,
      onlyActive: true,
      sinceMs: sinceMs || undefined
    });
    res.json({ tweets, stats });
  } catch (e) {
    const message = e instanceof Error ? e.message : "twitter-spider batch failed";
    res.status(502).json({ error: message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  startFeedtrixLiveScheduler(process.env);
  startTwitterSpiderScheduler(process.env);
  void syncSpiderPipeToPipetrix().then((r) => {
    console.log(`[ifixedx] Pipetrix canonical store: ${r.total} tweets (boot sync from spider pipe)`);
  });
  console.log(`API http://localhost:${PORT}  (UI: http://localhost:5173 when using npm run dev)`);
  console.log(
    `Live search: ${liveSearchConfiguredSync() ? "ready (Bearer and/or stored OAuth sessions)" : "needs Bearer and/or OAuth sign-in per browser"}`
  );
  if (oauthLegacyGlobalFilePresent()) {
    console.warn(
      "[ifixedx] Legacy data/oauth-tokens.json detected — ignored. Delete it; OAuth is now per-session (cookie + data/oauth-sessions/)."
    );
  }
  if (process.env.NODE_ENV === "production" && !process.env.IFIXEDX_SESSION_SECRET?.trim()) {
    console.warn(
      "[ifixedx] IFIXEDX_SESSION_SECRET is not set — Sign in with X will fail in production until you add a long random secret to .env."
    );
  }
});
