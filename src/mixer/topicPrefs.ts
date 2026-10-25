import type { TweetResult } from "../api/types";

/** Hide posts stamped with disabled TheFeedtrix topic tags (`feedtrix-{slug}`). */
export type TopicPrefsRecord = Record<string, boolean>;

export function feedTopicSlugFromTag(tag: string): string | null {
  const m = /^feedtrix-([a-zA-Z0-9_]+)$/.exec(tag.trim());
  return m ? m[1]!.toLowerCase() : null;
}

export function tweetVisibleForTopicPrefs(t: TweetResult, prefs: TopicPrefsRecord): boolean {
  for (const tag of t.tags ?? []) {
    const slug = feedTopicSlugFromTag(tag);
    if (slug !== null && prefs[slug] === false) return false;
  }
  return true;
}
