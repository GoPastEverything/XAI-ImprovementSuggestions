export type LatestWindow = "all" | "day" | "week" | "month";

export function filterByLatestWindow<T extends { createdAt: string }>(posts: T[], window: LatestWindow): T[] {
  if (window === "all") return posts;
  const now = Date.now();
  const ms =
    window === "day" ? 86400000 : window === "week" ? 7 * 86400000 : 30 * 86400000;
  return posts.filter((t) => {
    const ts = new Date(t.createdAt).getTime();
    if (Number.isNaN(ts)) return true;
    return now - ts <= ms;
  });
}
