import { fetchRecentPostsAsTweets } from "./xApiV2.js";
import { getValidUserAccessToken } from "./oauth/tokenService.js";
import { loadTweets, type Tweet } from "./search.js";

export type CorpusSource = "mock" | "live";

export async function getAccessTokenForLiveSearch(
  env: NodeJS.ProcessEnv,
  sessionId: string | null
): Promise<string> {
  const userTok = await getValidUserAccessToken(env, sessionId);
  const appBearer = env.TWITTER_BEARER_TOKEN?.trim();
  const token = userTok ?? appBearer ?? null;
  if (!token) {
    throw new Error(
      "Live search needs tokens: use “Sign in with X” in the app, or set TWITTER_BEARER_TOKEN in the server .env (see .env.example)."
    );
  }
  return token;
}

/**
 * Recent Search: try user OAuth first (when present), then app Bearer if the first call fails with 403/401.
 * Some X projects allow search only for app auth, not user context.
 */
export async function fetchRecentSearchWithBearerFallback(
  env: NodeJS.ProcessEnv,
  userQuery: string,
  maxResults: number,
  omitRetweets: boolean,
  sessionId: string | null
): Promise<Tweet[]> {
  const userTok = await getValidUserAccessToken(env, sessionId);
  const appBearer = env.TWITTER_BEARER_TOKEN?.trim();
  const primary = userTok ?? appBearer ?? null;
  if (!primary) {
    throw new Error(
      "Live search needs tokens: Sign in with X and/or set TWITTER_BEARER_TOKEN in server .env."
    );
  }

  try {
    return await fetchRecentPostsAsTweets(primary, userQuery, maxResults, omitRetweets);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!appBearer || appBearer === primary) throw e;
    if (!/\(403\)|\b403\b|\(401\)|\b401\b|Forbidden|Unauthorized/i.test(msg)) throw e;
    return await fetchRecentPostsAsTweets(appBearer, userQuery, maxResults, omitRetweets);
  }
}

export async function resolveCorpus(options: {
  source: CorpusSource;
  /** Used when source === live */
  query: string;
  env: NodeJS.ProcessEnv;
  maxResults: number;
  omitRetweets: boolean;
  /** Browser OAuth session (HttpOnly cookie); required for user-context live search when Bearer is absent. */
  sessionId: string | null;
}): Promise<Tweet[]> {
  if (options.source === "mock") return loadTweets();

  return fetchRecentSearchWithBearerFallback(
    options.env,
    options.query,
    options.maxResults,
    options.omitRetweets,
    options.sessionId
  );
}
