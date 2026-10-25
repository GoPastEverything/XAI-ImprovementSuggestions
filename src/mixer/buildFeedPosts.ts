import type { TweetResult } from "../api/types";
import type { TopicPrefsRecord } from "./topicPrefs";
import type { LatestWindow } from "./latestWindow";
import { filterByLatestWindow } from "./latestWindow";
import { sortLatest } from "./sort";
import { dedupeTweetsById } from "./dedupeTweets";
import { tweetVisibleForTopicPrefs } from "./topicPrefs";

function tweetHasDisplayableAttachments(t: TweetResult): boolean {
  if (typeof t.videoUrl === "string" && t.videoUrl.trim()) return true;
  return Boolean(t.mediaUrls?.some((u) => typeof u === "string" && u.trim().length > 0));
}

export type MixerHomeTab = "top" | "latest" | "media";

export type TopRankMode = "platform" | "refined";

/**
 * Home mixer slice: time window → tab branch → optional topic prefs (Feedtrix tags).
 * Mirrors the orchestration layer X calls Home Mixer for (gather → filter → rank branch).
 */
export function buildMixerFeedPostsBase(args: {
  platform: TweetResult[] | null;
  refined: TweetResult[] | null;
  mainTab: MixerHomeTab | string;
  corpusTimeScope: LatestWindow;
  topRank: TopRankMode;
  topicPrefs: TopicPrefsRecord;
}): TweetResult[] {
  const { platform, refined, mainTab, corpusTimeScope, topRank, topicPrefs } = args;
  if (mainTab !== "top" && mainTab !== "latest" && mainTab !== "media") return [];

  const plat = filterByLatestWindow(platform ?? [], corpusTimeScope);
  const refF = filterByLatestWindow(refined ?? [], corpusTimeScope);
  let list: TweetResult[];
  switch (mainTab) {
    case "top":
      list = topRank === "platform" ? plat : refF;
      break;
    case "latest":
      list = sortLatest(plat);
      break;
    case "media":
      list = sortLatest(plat).filter((t) => tweetHasDisplayableAttachments(t));
      break;
    default:
      return [];
  }
  return dedupeTweetsById(list.filter((t) => tweetVisibleForTopicPrefs(t, topicPrefs)));
}
