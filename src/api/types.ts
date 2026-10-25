/** Post shape for iFixedX UI badges: TX original, RTX retweet, QTX quote tweet */
export type TransmissionKind = "tx" | "rtx" | "qtx";

export type TweetResult = {
  id: string;
  text: string;
  author: string;
  handle: string;
  createdAt: string;
  likes: number;
  retweets: number;
  /** X public_metrics.reply_count when available (comments / replies) */
  replyCount?: number;
  /** X public_metrics.impression_count when available; mock corpus may omit */
  viewCount?: number;
  hasMedia: boolean;
  tags: string[];
  score: number;
  breakdown: Record<string, number>;
  refinedScoring?: RefinedScoring;
  /** From seed/API; defaults to TX in UI when absent */
  transmission?: TransmissionKind;
  /** X-style “Name reposted” line; original author is author/handle/avatarUrl */
  repostContext?: {
    byAuthor: string;
    byHandle: string;
    byAvatarUrl?: string;
  };
  /** Native-style video (served from `public/` in dev, e.g. `/mariovideo-1.mp4`) */
  videoUrl?: string;
  avatarUrl?: string;
  mediaUrls?: string[];
  /** AI-generated context (xAI Grok home mode) */
  mixerNote?: string;
};

/** Raw Grok items + model metadata (home xAI path) for local persistence. */
export type XaiIngestPayload = {
  storedAt: string;
  model: string;
  liveSearch: boolean;
  warning?: string;
  items: Record<string, unknown>[];
};

export type ComparePayload = {
  query?: string;
  /** Present for Explore search compare */
  source?: "mock" | "live";
  /** Present for home timeline For You */
  feed?: "home_reverse_chronological";
  homeDataSource?:
    | "following_timeline"
    | "user_authored"
    | "user_authored_app"
    | "list_timeline"
    | "recent_search_fallback"
    | "mock_seed"
    | "xai_grok";
  corpusSize: number;
  omitRetweets?: boolean;
  twitterBearerConfigured?: boolean;
  twitterUserTokensPresent?: boolean;
  twitterLiveSearchReady?: boolean;
  liveAuth?: "user_oauth" | "app_bearer" | null;
  platform_style: TweetResult[];
  refined: TweetResult[];
  /** Present on Grok home responses; use for RxDB / backups of model output */
  xaiIngest?: XaiIngestPayload;
  note?: string;
  /** Following timeline pagination (Live X home). */
  homeTimelineNextToken?: string;
  error?: string;
};


export interface RefinedScoring {
  version: 1;
  engagementRaw: number;
  engagementFinal: number;
  engagementCapped: boolean;
  recency: number;
  overlap: number;
  phrase: number;
  spam: number;
  finalScore: number;
  scoredAt: number;
}

export type MeResponse =
  | { connected: false; error?: string }
  | {
      connected: true;
      tokenPresent: true;
      id?: string;
      name?: string;
      username?: string;
      profile_image_url?: string;
      profileUrl?: string;
      /** GET /2/users/me failed; token file present but X rejected or plan blocks it */
      profileFetchError?: string;
    };


