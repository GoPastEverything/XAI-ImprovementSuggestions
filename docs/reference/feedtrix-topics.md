# Feedtrix topics

**The Pipetrix** organizes Grok-ingested posts into **topic buckets** for background refresh and canonical `topicIdsJson`.

## Allow-listed slugs

Defined in `server/feedtrixTopics.ts` (`FEEDTRIX_TOPIC_BY_SLUG`):

| Slug | Display title |
|------|----------------|
| `politics` | Politics |
| `sports` | Sports |
| `business_finance` | Business & Finance |
| `science_technology` | Science & Technology |
| `entertainment` | Entertainment & Arts |
| `artificial_intelligence` | Artificial Intelligence |
| `gaming` | Gaming |
| `crypto` | Crypto |
| `videos` | Videos |

Invalid slugs return **400** on batch API.

## API

`GET /api/xai/the-feedtrix/batch?topic=<slug>&maxResults=<n>`

- Fetches Grok JSON for one topic
- Server returns posts; client ingests via `feedtrixService` / `canonicalIngest`
- Background tick: `runSingleFeedtrixBackgroundTick` (~12.5 s interval when xAI configured and not real-data-only)

## Topic inference from tags

`inferTopicIdsFromTweet()` maps tweet `tags[]` through `feedTopicSlugFromTag()` (`src/mixer/topicPrefs.ts`). Tags that map to a slug ingest as **`grok_topic`**; otherwise **`grok_mixer`**.

## User preferences

`tf_topic_prefs` in **`thefeedtrix_local`** — toggles in **More** menu (`src/feedtrix/feedtrixService.ts`).

## Caps

- ~**420** posts per topic in `tf_posts`
- **69** default server batch size (`THE_FEEDTRIX_BATCH_SIZE`)

## Related

- [Pipetrix canonical](../canonical/pipetrix.md)
- [Ingest sources](../canonical/ingest-sources.md)
- [Real-data-only](../explanation/real-data-only.md)
