# RxDB collections (browser)

## `ifixedx_local`

| Collection | Purpose |
|------------|---------|
| `posts` | Full tweet rows + scores from last compare/for-you ingest |
| `accounts` | Avatar/display rollup per handle — [Account rollup](account-rollup.md) |
| `grok_ingests` | Raw Grok JSON backups (home xAI path) — [Grok ingests](../canonical/grok-ingests.md) |
| `seen_items` | Posts / Spaces user opened (dedupe UI) |

**Rehydrate:** `loadPersistedMixerCorpus()` restores `platform` / `refined` from `posts` on Home open.

## `thefeedtrix_local` (The Pipetrix)

| Collection | Purpose |
|------------|---------|
| `tf_topic_prefs` | Enabled topic slugs |
| `tf_posts` | Per-topic Grok batch rows |
| `tf_canonical_posts` | Deduped canonical tweets for mixer |

Canonical fields: `tweetJson`, `sourceType`, `ingestedAt`, `topicIdsJson`, `mixerMetaJson`, `seen`.

## No `mixerCache`

Final feed order is computed in memory:

- `mergeFeedWithUnseenCanonicalFirst` / `mergeFeedById` (`src/mixer/merge.ts`)
- `dedupeTweetsById` (`src/mixer/dedupeTweets.ts`)
- `buildMixerFeedPostsBase` (`src/mixer/buildFeedPosts.ts`)

One-time duplicate cleanup on boot: `runOneTimeLocalTweetDedupe` (`src/db/dedupeLocalTweets.ts`).

A persisted `mixer_snapshot` collection is **optional future work** only if frozen order replay is required.
