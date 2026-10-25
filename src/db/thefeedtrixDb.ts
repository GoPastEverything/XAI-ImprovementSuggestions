import { createRxDatabase, type RxDatabase, type RxCollection } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";

const DB_NAME = "thefeedtrix_local";

export type TfTopicPrefDoc = {
  topicId: string;
  enabled: boolean;
  updatedAt: number;
};

/** One flattened post row for background Grok buckets (max ~420 Slug-topic). */
export type TfPostDoc = {
  entryKey: string;
  topicId: string;
  tweetJson: string;
  ingestAt: number;
};

/**
 * Unified deduped store (canonical tweet id): all ingest paths funnel here for mixer-style reads later.
 */
export type TfCanonicalPostDoc = {
  id: string;
  tweetJson: string;
  sourceType: string;
  ingestedAt: number;
  /** JSON string array of topic slugs when relevant (`feedtrix-*` buckets). */
  topicIdsJson: string;
  /** Optional ranking snapshot JSON for experiments / Ranking lab alignment. */
  mixerMetaJson: string;
  seen: boolean;
};

export type TheFeedtrixCollections = {
  tf_topic_prefs: RxCollection<TfTopicPrefDoc>;
  tf_posts: RxCollection<TfPostDoc>;
  tf_canonical_posts: RxCollection<TfCanonicalPostDoc>;
};

let dbPromise: Promise<RxDatabase<TheFeedtrixCollections>> | null = null;

/** Close + delete TheFeedtrix IndexedDB; next `getTheFeedtrixDb()` creates an empty DB. */
export async function destroyTheFeedtrixDatabase(): Promise<void> {
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

const topicPrefSchema = {
  version: 0,
  primaryKey: "topicId",
  type: "object",
  properties: {
    topicId: { type: "string", maxLength: 64 },
    enabled: { type: "boolean" },
    updatedAt: { type: "number", minimum: 0, maximum: 10000000000000, multipleOf: 1 }
  },
  required: ["topicId", "enabled", "updatedAt"],
  indexes: ["updatedAt"]
} as const;

const postSchema = {
  version: 0,
  primaryKey: "entryKey",
  type: "object",
  properties: {
    entryKey: { type: "string", maxLength: 200 },
    topicId: { type: "string", maxLength: 64 },
    tweetJson: { type: "string", maxLength: 100000 },
    ingestAt: { type: "number", minimum: 0, maximum: 10000000000000, multipleOf: 1 }
  },
  required: ["entryKey", "topicId", "tweetJson", "ingestAt"],
  indexes: ["topicId", "ingestAt"]
} as const;

const canonicalPostSchema = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 128 },
    tweetJson: { type: "string", maxLength: 100000 },
    sourceType: { type: "string", maxLength: 32 },
    ingestedAt: { type: "number", minimum: 0, maximum: 10000000000000, multipleOf: 1 },
    topicIdsJson: { type: "string", maxLength: 4000 },
    mixerMetaJson: { type: "string", maxLength: 8000 },
    seen: { type: "boolean" }
  },
  required: ["id", "tweetJson", "sourceType", "ingestedAt", "topicIdsJson", "mixerMetaJson", "seen"],
  indexes: ["ingestedAt", "sourceType"]
} as const;

export function getTheFeedtrixDb(): Promise<RxDatabase<TheFeedtrixCollections>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("TheFeedtrix (RxDB) is browser-only"));
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await createRxDatabase<TheFeedtrixCollections>({
        name: DB_NAME,
        storage: getRxStorageDexie(),
        multiInstance: false
      });
      await db.addCollections({
        tf_topic_prefs: { schema: topicPrefSchema },
        tf_posts: { schema: postSchema },
        tf_canonical_posts: { schema: canonicalPostSchema }
      });
      return db;
    })();
  }
  return dbPromise;
}
