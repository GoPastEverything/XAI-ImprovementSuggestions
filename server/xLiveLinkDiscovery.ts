import { fetchRecentSearchWithBearerFallback } from "./corpus.js";
import { extractLiveSessionRowsFromText } from "./liveSessionFromText.js";
import {
  pickRotatingIndex,
  X_RECENT_BROADCAST_QUERIES,
  X_RECENT_SPACE_QUERIES
} from "./liveDiscoveryQueries.js";
import { mergeLiveSessionRows } from "./liveSessionMerge.js";
import { sortLiveSessionRows } from "./liveSessionRank.js";
import type { XaiLiveSessionRow } from "./xaiLiveSessions.js";

/**
 * Platform-wide Recent Search: posts that link to live Space/Broadcast URLs.
 * Same rules for everyone — no signed-in handle bias.
 */
export async function discoverLiveSessionsFromXRecentSearch(
  env: NodeJS.ProcessEnv,
  sessionId: string | null,
  huntPass: number,
  opts: { maxBroadcasts: number; maxSpaces: number }
): Promise<{ broadcasts: XaiLiveSessionRow[]; spaces: XaiLiveSessionRow[]; note?: string }> {
  const bQ =
    X_RECENT_BROADCAST_QUERIES[
      pickRotatingIndex(huntPass, X_RECENT_BROADCAST_QUERIES.length, 0)
    ]!;
  const sQ =
    X_RECENT_SPACE_QUERIES[pickRotatingIndex(huntPass, X_RECENT_SPACE_QUERIES.length, 1)]!;

  const warnings: string[] = [];
  const broadcastBatches: XaiLiveSessionRow[][] = [];
  const spaceBatches: XaiLiveSessionRow[][] = [];

  try {
    const tweets = await fetchRecentSearchWithBearerFallback(
      env,
      bQ,
      Math.min(100, opts.maxBroadcasts * 4),
      true,
      sessionId
    );
    for (const tw of tweets) {
      const rows = extractLiveSessionRowsFromText(tw.text, "broadcast", {
        handle: tw.handle,
        author: tw.author,
        titleFallback: tw.text.slice(0, 120)
      });
      if (rows.length) broadcastBatches.push(rows);
    }
  } catch (e) {
    warnings.push(`broadcast search: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const tweets = await fetchRecentSearchWithBearerFallback(
      env,
      sQ,
      Math.min(100, opts.maxSpaces * 4),
      true,
      sessionId
    );
    for (const tw of tweets) {
      const rows = extractLiveSessionRowsFromText(tw.text, "space", {
        handle: tw.handle,
        author: tw.author,
        titleFallback: tw.text.slice(0, 120)
      });
      if (rows.length) spaceBatches.push(rows);
    }
  } catch (e) {
    warnings.push(`spaces search: ${e instanceof Error ? e.message : e}`);
  }

  const broadcasts = sortLiveSessionRows(mergeLiveSessionRows(...broadcastBatches)).slice(
    0,
    opts.maxBroadcasts
  );
  const spaces = sortLiveSessionRows(mergeLiveSessionRows(...spaceBatches)).slice(0, opts.maxSpaces);

  return {
    broadcasts,
    spaces,
    ...(warnings.length
      ? { note: `x_recent_search: ${warnings.join(" · ")}` }
      : broadcasts.length + spaces.length === 0
        ? { note: "x_recent_search: no URLs (need TWITTER_BEARER_TOKEN or Sign in with X)" }
        : {})
  };
}
