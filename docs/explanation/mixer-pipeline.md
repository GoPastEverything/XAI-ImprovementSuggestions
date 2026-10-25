# Mixer pipeline

The **mixer** is the client-side stage that turns stored corpora into the scrollable Home feed.

## Data flow

```text
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│ Live X API      │     │ Grok topic ticks     │     │ TwitterSpider batch │
│ (refresh)       │     │ (background)         │     │ (5m + manual)       │
└────────┬────────┘     └──────────┬───────────┘     └──────────┬──────────┘
         │                         │                            │
         v                         v                            v
┌─────────────────┐     ┌──────────────────────────────────────────────────┐
│ ifixedx_local   │     │ thefeedtrix_local — tf_canonical_posts           │
│ posts           │     │ sourceType: live_api | grok_* | twitter_spider … │
└────────┬────────┘     └──────────────────────────┬───────────────────────┘
         │                                         │
         └──────────────────┬──────────────────────┘
                            v
              mergeFeedWithUnseenCanonicalFirst (Home)
              mergeFeedById + dedupeTweetsById
                            v
              buildMixerFeedPostsBase (tab / time / topics)
                            v
                       feedPosts (UI)
```

## Layers

### Live layer

- In-memory `platform` / `refined` from last API response.
- Persisted to **`posts`** via `persistComparePayload`.
- **Rehydrated** on Home open — no manual Load required after first ingest.

### Pipetrix layer

- **Canonical** store: deduped tweets from all ingest paths.
- Background Grok fills **topic buckets** (`tf_posts`) then **canonical ingest**.
- **TwitterSpider** pulls server pipe rows with `sourceType: twitter_spider`.
- Subscribed reactively — UI updates when new rows land.

### Real-data-only filter

When `ix_real_data_only` is on (default after wipe), canonical rows for mixer are limited to **`live_api`** and **`twitter_spider`**. See [Real-data-only](real-data-only.md).

### Remix rules (Home)

1. **Unseen canonical** first (newest), optionally shuffled with `feedRemixEpoch` / page-load salt.
2. **Live corpus** appended without id collisions (`dedupeTweetsById`).
3. **Seen canonical** tail (unless “include seen” enabled).

Explore and other pages merge canonical with `mergeFeedById` (no unseen-first preference).

## Dedupe

Tweet **id** is the only timeline key. See [Dedupe contract](../canonical/dedupe-contract.md).

- `src/mixer/dedupeTweets.ts` — client
- `server/tweetDedupe.ts` — server pipes + batches
- `src/db/dedupeLocalTweets.ts` — one-time RxDB cleanup on boot

## Refresh source vs mixer

| Control | Effect |
|---------|--------|
| Timeline **refresh source** | Which API repopulates the **live** layer |
| Top / Latest / Media tabs | Which ranked list and time window |
| iFixedX rank chip | `platform_style` vs `refined` ordering |
| More → Run TwitterSpider | Server hunt + Pipetrix pull (not live layer) |

## Related

- [Pipetrix](../canonical/pipetrix.md)
- [Mixer contract](../canonical/mixer-contract.md)
- [TwitterSpider](twitter-spider.md)
