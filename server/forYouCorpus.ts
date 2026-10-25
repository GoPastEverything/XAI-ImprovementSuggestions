import {
  fetchListTimelineTweets,
  fetchReverseChronologicalHomeTimeline,
  fetchUserAuthoredTweets
} from "./xApiV2.js";
import { fetchRecentSearchWithBearerFallback } from "./corpus.js";
import { getValidUserAccessToken } from "./oauth/tokenService.js";
import { fetchSignedInProfile } from "./xUser.js";
import type { Tweet } from "./search.js";

function isPlanOrTimelineBlocked(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /403|\(402\)|\b402\b|not included in your X developer access|USER_AUTHORED_TIMELINE_BLOCKED/i.test(m);
}

export type HomeFeedCorpus = {
  tweets: Tweet[];
  homeDataSource:
    | "following_timeline"
    | "user_authored"
    | "user_authored_app"
    | "list_timeline"
    | "recent_search_fallback";
  note: string;
  /** Set when more pages exist (following timeline only). */
  homeTimelineNextToken?: string;
};

/**
 * Best-effort “Home / For You” corpus for your access tier:
 * 1) Following reverse-chron timeline (if entitled)
 * 2) Your authored tweets (user OAuth)
 * 3) List timeline when IFIXEDX_HOME_LIST_ID is set (curated stand-in for “my feed”; OAuth needs list.read — re-sign-in after upgrading)
 * 4) Your authored tweets (app Bearer) — if user-context read failed but app credentials work
 * 5) Recent Search with IFIXEDX_HOME_FALLBACK_QUERY or from:yourhandle
 */
export async function fetchHomeFeedWithFallbacks(
  env: NodeJS.ProcessEnv,
  maxResults: number,
  recentSearchQueryOverride: string | null,
  sessionId: string | null,
  paginationToken?: string | null
): Promise<HomeFeedCorpus> {
  const token = await getValidUserAccessToken(env, sessionId);
  if (!token) {
    throw new Error(
      "For You needs Sign in with X. Home timeline requests must use a user access token, not the app Bearer alone."
    );
  }
  const profile = await fetchSignedInProfile(token);
  try {
    const page = await fetchReverseChronologicalHomeTimeline(
      token,
      profile.id,
      maxResults,
      paginationToken
    );
    return {
      tweets: page.tweets,
      homeDataSource: "following_timeline",
      note: "Following timeline (reverse chronological). Re-ranked locally — not X’s full in-app For You mixer.",
      ...(page.nextToken ? { homeTimelineNextToken: page.nextToken } : {})
    };
  } catch (first) {
    if (!isPlanOrTimelineBlocked(first)) throw first;
  }

  let userTimelineOAuthFailed = false;
  try {
    const tweets = await fetchUserAuthoredTweets(token, profile.id, maxResults);
    if (tweets.length) {
      return {
        tweets,
        homeDataSource: "user_authored",
        note: "Home (following) timeline not available on your API tier. Showing your posts via GET /2/users/:id/tweets, then re-ranking."
      };
    }
  } catch (e) {
    if (!isPlanOrTimelineBlocked(e)) throw e;
    userTimelineOAuthFailed = true;
  }

  const listId = env.IFIXEDX_HOME_LIST_ID?.trim();
  if (listId) {
    try {
      const tweets = await fetchListTimelineTweets(token, listId, maxResults);
      if (tweets.length) {
        return {
          tweets,
          homeDataSource: "list_timeline",
          note:
            `Loaded posts from X List ${listId} (GET /2/lists/:id/tweets). Add accounts you follow to that list on x.com — closest API-safe stand-in when home timeline + search are blocked. Re-sign in with X if list reads fail (scope list.read).`
        };
      }
    } catch (e) {
      if (!isPlanOrTimelineBlocked(e)) throw e;
    }
  }

  const appBearer = env.TWITTER_BEARER_TOKEN?.trim();
  if (appBearer && userTimelineOAuthFailed) {
    try {
      const tweets = await fetchUserAuthoredTweets(appBearer, profile.id, maxResults);
      if (tweets.length) {
        return {
          tweets,
          homeDataSource: "user_authored_app",
          note:
            "Your user token could not read /2/users/:id/tweets; loaded your public posts with TWITTER_BEARER_TOKEN instead, then re-ranking."
        };
      }
    } catch (e) {
      if (!isPlanOrTimelineBlocked(e)) throw e;
    }
  }

  const handle = profile.username.replace(/^@/, "");
  const qRaw =
    recentSearchQueryOverride?.trim() ||
    env.IFIXEDX_HOME_FALLBACK_QUERY?.trim() ||
    `from:${handle} -is:retweet`;

  const searchMax = Math.max(10, maxResults);
  try {
    const tweets = await fetchRecentSearchWithBearerFallback(env, qRaw, searchMax, true, sessionId);
    return {
      tweets,
      homeDataSource: "recent_search_fallback",
      note:
        `Home APIs unavailable on your plan. Recent Search drives this feed: ${qRaw.slice(0, 200)}${qRaw.length > 200 ? "…" : ""}. ` +
        `If you saw 403 with OAuth, we retried with TWITTER_BEARER_TOKEN when set. ` +
        `Set IFIXEDX_HOME_FALLBACK_QUERY in server .env for a broader query.`
    };
  } catch (e) {
    const last = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot load Home feed: home timeline APIs are not available on your project, and Recent Search failed (${last}). ` +
        `Ensure TWITTER_BEARER_TOKEN is set in server .env, enable Recent Search for the app in the X developer portal, ` +
        `and/or set IFIXEDX_HOME_LIST_ID to a list you own (add people you follow to that list — no scraping needed). ` +
        `Use Explore → Live while you fix portal settings. Optional: IFIXEDX_HOME_FALLBACK_QUERY for a broader Recent Search mixer.`
    );
  }
}
