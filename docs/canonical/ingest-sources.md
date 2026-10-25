# Ingest sources

Two related concepts: **API payload** `homeDataSource` (how Home was refreshed) and **canonical** `sourceType` (how a row entered Pipetrix).

## `homeDataSource` (compare / for-you payload)

Recorded on compare/for-you responses and stored on each `ifixedx_local.posts` row.

| Value | Meaning |
|-------|---------|
| `following_timeline` | OAuth reverse-chron home |
| `user_authored` | User tweets fallback |
| `user_authored_app` | App bearer user tweets |
| `list_timeline` | Configured list id (`IFIXEDX_HOME_LIST_ID`) |
| `recent_search_fallback` | Search when timelines blocked |
| `mock_seed` | Offline JSON corpus |
| `xai_grok` | Grok-generated home batch |

## Canonical `sourceType` (Pipetrix)

| Value | Meaning |
|-------|---------|
| `live_api` | Live X refresh (default for non-Grok home paths) |
| `grok_mixer` | Grok home / generic mixer batch |
| `grok_topic` | Feedtrix topic batch with matched topic slug |
| `twitter_spider` | TwitterSpider server pipe |
| `seed` | Mock Explore/Home |
| `user_post` | Reserved |
| `repost` | Reserved |

## UI refresh source mapping

| UI mode (`?home=`) | Typical `homeDataSource` | Canonical `sourceType` |
|--------------------|--------------------------|-------------------------|
| Live X API | `following_timeline`, etc. | `live_api` |
| Grok-generated | `xai_grok` | `grok_mixer` |
| Offline demo | `mock_seed` | `seed` |

TwitterSpider does **not** change `homeDataSource`; it writes `twitter_spider` canonical rows independently.

## Real-data-only gating

When `ix_real_data_only` is enabled, `shouldIngestCanonicalFromPayload` and mixer load allow only **`live_api`** and **`twitter_spider`**. See [Real-data-only](../explanation/real-data-only.md).

## Related

- [Pipetrix](pipetrix.md)
- [Mixer pipeline](../explanation/mixer-pipeline.md)
