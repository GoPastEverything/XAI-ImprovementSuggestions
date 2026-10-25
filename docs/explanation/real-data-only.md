# Real-data-only mode

After a full local wipe, iFixedX defaults to **real-data-only**: Home and Explore avoid synthetic seed and Grok-mixer canonical rows, while still allowing verified real ingest paths.

## Storage

| Key | Location | Default |
|-----|----------|---------|
| `ix_real_data_only` | `sessionStorage` | `"1"` (enabled) |

Toggle in code: `setRealDataOnly()` / `isRealDataOnly()` in `src/realDataOnly.ts`.

## Allowed canonical sources

When real-data-only is **on**, only these `sourceType` values participate in Home mixer merge and compare ingest:

| `sourceType` | Origin |
|--------------|--------|
| `live_api` | Live X compare/for-you refresh |
| `twitter_spider` | TwitterSpider pipe → client pull |

Blocked for mixer/ingest (until mode off): `grok_mixer`, `grok_topic`, `seed`, etc.

## Home mixer behavior

With real-data-only on **Home**:

- Live API batch (`platform` / `refined`) merges with **unseen canonical first** (`mergeFeedWithUnseenCanonicalFirst`), including TwitterSpider rows.
- Background Grok topic ticks may still write Pipetrix, but those rows are **filtered out** of `loadCanonicalPostsForMixer` unless you disable real-data-only.

## Wipe bootstrap

`enableRealDataOnlyAfterWipe()` sets:

- `ix_real_data_only=1`
- `ix_home_feed_mode=live`
- URL restore `page=home&tab=top&home=live` via `ix_after_wipe_url`

## Related

- [Mixer pipeline](mixer-pipeline.md)
- [Ingest sources](../canonical/ingest-sources.md)
- [Wipe local data](../how-to/wipe-local-data.md)
