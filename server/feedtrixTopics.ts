/** Allow-list for GET /api/xai/the-feedtrix/batch (slug → display title). */
export const FEEDTRIX_TOPIC_BY_SLUG = {
  politics: "Politics",
  sports: "Sports",
  business_finance: "Business & Finance",
  science_technology: "Science & Technology",
  entertainment: "Entertainment & Arts",
  artificial_intelligence: "Artificial Intelligence",
  gaming: "Gaming",
  crypto: "Crypto",
  videos: "Videos"
} as const;

export type FeedtrixTopicSlug = keyof typeof FEEDTRIX_TOPIC_BY_SLUG;

export function getFeedtrixTopicOrNull(
  slug: string
): { slug: FeedtrixTopicSlug; title: string } | null {
  const k = slug.trim() as FeedtrixTopicSlug;
  if (!(k in FEEDTRIX_TOPIC_BY_SLUG)) return null;
  const title = FEEDTRIX_TOPIC_BY_SLUG[k];
  return { slug: k, title };
}
