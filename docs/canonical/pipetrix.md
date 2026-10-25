# The Pipetrix (canonical store)

**Database:** `thefeedtrix_local` (RxDB, browser-only)

**Product name:** The Pipetrix (legacy code: Feedtrix / TheFeedtrix)

## Purpose

Deduplicated tweet store for all ingest paths. Background Grok topic pulls, Live compare/for-you, and **TwitterSpider** write here; Home mixer reads via `subscribeCanonicalMixerPosts`.

## Collections

| Collection | Contract |
|------------|----------|
| `tf_topic_prefs` | `topicId`, `enabled`, `updatedAt` — toggles in More menu |
| `tf_posts` | `entryKey`, `topicId`, `tweetJson`, `ingestAt` — raw topic buckets (~420 cap per topic) |
| `tf_canonical_posts` | Primary key = tweet `id` |

## Canonical document

Required fields: `id`, `tweetJson`, `sourceType`, `ingestedAt`, `topicIdsJson`, `mixerMetaJson`, `seen`.

### `sourceType` values

| Value | Typical origin |
|-------|----------------|
| `live_api` | Live X `/api/for-you` or Explore live |
| `grok_mixer` | Grok home refresh (`home=xai`) |
| `grok_topic` | Feedtrix topic batch (tags map to topic slug) |
| `twitter_spider` | TwitterSpider pipe → client pull |
| `seed` | Mock / offline corpus |
| `user_post` | Reserved for user-authored ingest |
| `repost` | Reserved for repost-specific ingest |

Mapping from API payloads: `canonicalSourceFromComparePayload()` in `src/feedtrix/canonicalIngest.ts`.

`mixerMetaJson` may include `rankingLab` snapshot at ingest time — [Ranking lab snapshot](ranking-lab-snapshot.md).

## Read path

`loadCanonicalPostsForMixer` / `subscribeCanonicalMixerPosts` → filtered by topic prefs and **real-data-only** (`canonicalSourceAllowsRealOnly`) → merged in Home mixer.

## Related

- [Ingest sources](ingest-sources.md)
- [Dedupe contract](dedupe-contract.md)
- [TwitterSpider](../explanation/twitter-spider.md)
