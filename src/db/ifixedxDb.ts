import { createRxDatabase, type RxDatabase, type RxCollection } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

const DB_NAME = "ifixedx_local";

export type StoredPostDoc = {
  id: string;
  handle: string;
  author: string;
  text: string;
  createdAt: string;
  likes: number;
  retweets: number;
  replyCount: number;
  viewCount: number;
  hasMedia: boolean;
  scorePlatform: number;
  scoreRefined: number;
  breakdownPlatformJson: string;
  breakdownRefinedJson: string;
  tagsJson: string;
  mediaUrlsJson: string;
  avatarUrl: string;
  mixerNote: string;
  homeDataSource: string;
  transmission: string;
  videoUrl: string;
  lastIngestAt: number;
};

export type StoredAccountDoc = {
  handleNorm: string;
  displayName: string;
  avatarUrl: string;
  lastSeenAt: number;
  seenPostCount: number;
};

export type GrokIngestDoc = {
  id: string;
  storedAt: number;
  isoStoredAt: string;
  model: string;
  liveSearch: boolean;
  warning: string;
  itemsJson: string;
  homeDataSource: string;
};

export type LiveSessionKind = "space" | "broadcast";

/** User has opened/focused this post or live session — used to dedupe feeds. */
export type SeenItemDoc = {
  key: string;
  kind: "post" | LiveSessionKind;
  /** Post: tweet id; live: link or id fallback */
  ref: string;
  seenAt: number;
};

export type IfixedxCollections = {
  posts: RxCollection<StoredPostDoc>;
  accounts: RxCollection<StoredAccountDoc>;
  grok_ingests: RxCollection<GrokIngestDoc>;
  seen_items: RxCollection<SeenItemDoc>;
};

let dbPromise: Promise<RxDatabase<IfixedxCollections>> | null = null;

/** Close + delete IndexedDB storage; next `getIfixedxDb()` creates an empty DB. */
export async function destroyIfixedxDatabase(): Promise<void> {
  if (typeof window === "undefined") return;
  const p = dbPromise;
  dbPromise = null;
  if (!p) return;
  try {
    const db = await p;
    await db.remove();
  } catch {
    /* ignore */
  }
}

const postSchema = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 80 },
    handle: { type: "string", maxLength: 100 },
    author: { type: "string", maxLength: 240 },
    text: { type: "string", maxLength: 32768 },
    createdAt: { type: "string", maxLength: 48 },
    likes: { type: "integer", minimum: 0, maximum: 2000000000, multipleOf: 1 },
    retweets: { type: "integer", minimum: 0, maximum: 2000000000, multipleOf: 1 },
    replyCount: { type: "integer", minimum: 0, maximum: 2000000000, multipleOf: 1 },
    viewCount: { type: "integer", minimum: 0, maximum: 2000000000000, multipleOf: 1 },
    hasMedia: { type: "boolean" },
    scorePlatform: { type: "number" },
    scoreRefined: { type: "number" },
    breakdownPlatformJson: { type: "string", maxLength: 12000 },
    breakdownRefinedJson: { type: "string", maxLength: 12000 },
    tagsJson: { type: "string", maxLength: 16000 },
    mediaUrlsJson: { type: "string", maxLength: 48000 },
    avatarUrl: { type: "string", maxLength: 4096 },
    mixerNote: { type: "string", maxLength: 32000 },
    homeDataSource: { type: "string", maxLength: 100 },
    transmission: { type: "string", maxLength: 16 },
    videoUrl: { type: "string", maxLength: 4096 },
    lastIngestAt: { type: "number", minimum: 0, maximum: 10000000000000, multipleOf: 1 }
  },
  required: [
    "id",
    "handle",
    "author",
    "text",
    "createdAt",
    "likes",
    "retweets",
    "replyCount",
    "viewCount",
    "hasMedia",
    "scorePlatform",
    "scoreRefined",
    "breakdownPlatformJson",
    "breakdownRefinedJson",
    "tagsJson",
    "mediaUrlsJson",
    "avatarUrl",
    "mixerNote",
    "homeDataSource",
    "transmission",
    "videoUrl",
    "lastIngestAt"
  ],
  indexes: ["lastIngestAt", "handle", "homeDataSource"]
} as const;

const accountSchema = {
  version: 0,
  primaryKey: "handleNorm",
  type: "object",
  properties: {
    handleNorm: { type: "string", maxLength: 100 },
    displayName: { type: "string", maxLength: 240 },
    avatarUrl: { type: "string", maxLength: 4096 },
    lastSeenAt: { type: "number", minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    seenPostCount: { type: "integer", minimum: 0, maximum: 2000000, multipleOf: 1 }
  },
  required: ["handleNorm", "displayName", "avatarUrl", "lastSeenAt", "seenPostCount"],
  indexes: ["lastSeenAt"]
} as const;

const grokIngestSchema = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 120 },
    storedAt: { type: "number", minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    isoStoredAt: { type: "string", maxLength: 48 },
    model: { type: "string", maxLength: 120 },
    liveSearch: { type: "boolean" },
    warning: { type: "string", maxLength: 4000 },
    itemsJson: { type: "string", maxLength: 900000 },
    homeDataSource: { type: "string", maxLength: 100 }
  },
  required: ["id", "storedAt", "isoStoredAt", "model", "liveSearch", "warning", "itemsJson", "homeDataSource"],
  indexes: ["storedAt"]
} as const;

const seenItemSchema = {
  version: 0,
  primaryKey: "key",
  type: "object",
  properties: {
    key: { type: "string", maxLength: 640 },
    kind: { type: "string", maxLength: 16 },
    ref: { type: "string", maxLength: 640 },
    seenAt: { type: "number", minimum: 0, maximum: 10000000000000, multipleOf: 1 }
  },
  required: ["key", "kind", "ref", "seenAt"],
  indexes: ["kind", "seenAt"]
} as const;

export function getIfixedxDb(): Promise<RxDatabase<IfixedxCollections>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("RxDB is browser-only"));
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await createRxDatabase<IfixedxCollections>({
        name: DB_NAME,
        storage: getRxStorageDexie(),
        multiInstance: false
      });
      await db.addCollections({
        posts: { schema: postSchema },
        accounts: { schema: accountSchema },
        grok_ingests: { schema: grokIngestSchema },
        seen_items: { schema: seenItemSchema }
      });
      return db;
    })();
  }
  return dbPromise;
}
