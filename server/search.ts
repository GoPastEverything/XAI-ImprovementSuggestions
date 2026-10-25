import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readXSnapshot } from './xSnapshot.js';

export type TransmissionKind = "tx" | "rtx" | "qtx";

export type Tweet = {
  id: string;
  text: string;
  author: string;
  handle: string;
  createdAt: string;
  likes: number;
  retweets: number;
  /** X API public_metrics.reply_count when available */
  replyCount?: number;
  /** X API impression_count; seed may omit (UI derives a plausible mock) */
  viewCount?: number;
  hasMedia: boolean;
  tags: string[];
  /** TX / RTX / QTX — from X referenced_tweets or seed */
  transmission?: TransmissionKind;
  /** “Sawyer Merritt reposted” style; card shows original author in main row */
  repostContext?: {
    byAuthor: string;
    byHandle: string;
    byAvatarUrl?: string;
  };
  videoUrl?: string;
  /** Optional: X/Twitter CDN profile image for mock / enriched corpus */
  avatarUrl?: string;
  /** Optional: tweet media (images), same host often blocked by hotlink policies — use in dev/demo */
  mediaUrls?: string[];
  /** Optional: AI credibility / context line (xAI Grok corpus) */
  mixerNote?: string;
};

export type SearchMode = "platform_style" | "refined";

export type SearchParams = {
  q: string;
  mode: SearchMode;
  /** 0 = ignore recency, 1 = strong preference for new posts */
  recencyWeight: number;
  /** penalize hashtag / promo spam */
  strictMatch: boolean;
};

export type RefinedScoring = {
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
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveSeedJsonPath(): string {
  const candidates = [
    path.join(__dirname, "seed-tweets.json"),
    path.join(process.cwd(), "server", "seed-tweets.json"),
    path.join(process.cwd(), "dist-server", "seed-tweets.json")
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[1];
}

let cache: Tweet[] | null = null;

export async function loadTweets(): Promise<Tweet[]> {
  const snapshot = readXSnapshot();
  if (snapshot.posts.length) return snapshot.posts.map(p => ({ ...p,
    text: p.text + (p.quote ? `\n\nQuoted @${p.quote.handle}:\n${p.quote.text}` : ''),
    transmission: p.quote ? 'qtx' : 'tx'
  }));
  if (cache) return cache;
  const seedFile = resolveSeedJsonPath();
  const raw = await readFile(seedFile, "utf8");
  cache = JSON.parse(raw) as Tweet[];
  return cache;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#]/g, " ")
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1);
}

function termFrequency(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function phraseBonus(textLower: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return 0;
  return textLower.includes(q) ? 2.4 : 0;
}

function spamPenalty(text: string, strict: boolean, tags: string[], mode: SearchMode): number {
  if (!strict) return 0;
  const hashtagCount = (text.match(/#/g) ?? []).length;
  const promo =
    /\b(free|click here|giveaway|trial|seo|follow me|bots)\b/i.test(text) ? 1.2 : 0;
  let bait = 0;
  if (
    mode === "refined" &&
    tags.some((t) => /engagement|marketing|spam|promo-shaped|hashtag-heavy/i.test(t))
  ) {
    bait = 1.35;
  }
  return Math.min(4, hashtagCount * 0.35 + promo + bait);
}

function engagementBoost(likes: number, retweets: number, mode: SearchMode): number {
  const raw = Math.log10(10 + likes) * 0.35 + Math.log10(10 + retweets) * 0.25;

  if (mode === "platform_style") {
    return raw * 1.65;
  }

  // Refined mode: Significantly de-emphasize raw engagement volume.
  // Engagement is treated as a secondary signal rather than a primary driver.
  const refinedRaw = raw * 0.35;

  // Soft cap to prevent extremely high-engagement posts from dominating
  const maxEngagementContribution = 2.8;
  return Math.min(refinedRaw, maxEngagementContribution);
}

function recencyScore(createdAt: string, now: Date, weight: number): number {
  if (weight <= 0) return 0;
  const ageHours = Math.max(1, (now.getTime() - new Date(createdAt).getTime()) / 36e5);
  const halfLife = 24 * 14;
  const decay = Math.exp(-Math.log(2) * (ageHours / halfLife));
  return decay * 3.2 * weight;
}

function tokenOverlapScore(queryTokens: string[], docTokens: string[]): number {
  if (!queryTokens.length) return 0;
  const docTf = termFrequency(docTokens);
  let s = 0;
  for (const qt of queryTokens) {
    const c = docTf.get(qt) ?? 0;
    if (c > 0) s += 1 + Math.log1p(c);
  }
  return s;
}

export function scoreTweet(
  tweet: Tweet,
  query: string,
  params: SearchParams,
  now: Date
): { score: number; breakdown: Record<string, number>; refinedScoring?: RefinedScoring } {
  const q = query.trim();
  const textLower = tweet.text.toLowerCase();
  const queryTokens = tokenize(q);
  const docTokens = tokenize(tweet.text);

  const overlap = tokenOverlapScore(queryTokens, docTokens);
  const phrase = phraseBonus(textLower, q);
  const spam = spamPenalty(tweet.text, params.strictMatch, tweet.tags, params.mode);
  const engagement = engagementBoost(tweet.likes, tweet.retweets, params.mode);
  const recency = recencyScore(tweet.createdAt, now, params.recencyWeight);

  let score = overlap + phrase + recency + engagement - spam;

  /** Search-only: without a query, overlap/phrase are always ~0 — do not demote the whole feed. */
  if (params.mode === "refined" && q.length > 0 && overlap + phrase < 0.8) {
    score *= 0.35;
  }

  // Additional guard in refined mode: prevent engagement from becoming too dominant
  if (params.mode === "refined") {
    const nonEngagement = score - engagement;
    const maxEngagementShare = 0.45;

    if (engagement > nonEngagement * maxEngagementShare) {
      score = nonEngagement + (nonEngagement * maxEngagementShare);
    }
  }

  const breakdown = {
    overlap,
    phrase,
    recency,
    engagement,
    spam: -spam,
    totalBeforeGuards: overlap + phrase + recency + engagement - spam,
    engagementCapped: engagement > 2.8 && params.mode === "refined" ? 1 : 0,
  };

  let refinedScoring: RefinedScoring | undefined;

  if (params.mode === "refined") {
    refinedScoring = {
      version: 1,
      engagementRaw: engagementBoost(tweet.likes, tweet.retweets, params.mode),
      engagementFinal: engagement,
      engagementCapped: engagement > 2.8,
      recency,
      overlap,
      phrase,
      spam: -spam,
      finalScore: score,
      scoredAt: now.getTime(),
    };
  }

  return { score, breakdown, refinedScoring };
}

export type ScoredTweet = Tweet & {
  score: number;
  breakdown: Record<string, number>;
  refinedScoring?: RefinedScoring;
};

export function rankTweets(corpus: Tweet[], params: SearchParams): ScoredTweet[] {
  const now = new Date();
  const scored = corpus.map((t) => {
    const { score, breakdown, refinedScoring } = scoreTweet(t, params.q, params, now);
    return { ...t, score, breakdown, refinedScoring };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export async function searchTweets(params: SearchParams): Promise<ScoredTweet[]> {
  const tweets = await loadTweets();
  return rankTweets(tweets, params);
}
