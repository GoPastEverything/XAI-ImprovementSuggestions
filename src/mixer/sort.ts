import type { TweetResult } from "../api/types";

export function sortLatest(posts: TweetResult[]): TweetResult[] {
  return [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
