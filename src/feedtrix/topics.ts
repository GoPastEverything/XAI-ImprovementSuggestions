/** Must match server `feedtrixTopics.ts` slug keys for API pulls. */
export type FeedtrixTopic = { id: string; label: string; icon: string };

export const FEEDTRIX_TOPICS: FeedtrixTopic[] = [
  { id: "politics", label: "Politics", icon: "🏛️" },
  { id: "sports", label: "Sports", icon: "🏀" },
  { id: "business_finance", label: "Business & Finance", icon: "💼" },
  { id: "science_technology", label: "Science & Technology", icon: "⚛️" },
  { id: "entertainment", label: "Entertainment & Arts", icon: "🎭" },
  { id: "artificial_intelligence", label: "Artificial Intelligence", icon: "🧠" },
  { id: "gaming", label: "Gaming", icon: "🎮" },
  { id: "crypto", label: "Crypto", icon: "₿" },
  { id: "videos", label: "Videos", icon: "📹" }
];

export const THE_FEEDTRIX_CAP_PER_TOPIC = 420;

export const THE_FEEDTRIX_DEFAULT_BATCH = 69;
