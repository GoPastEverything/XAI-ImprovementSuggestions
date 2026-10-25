# Mixer contract

## Inputs

| Input | Type | Source |
|-------|------|--------|
| `liveBatch` | `TweetResult[]` | API state + `posts` rehydrate |
| `canonicalPool` | `TweetResult[]` | `tf_canonical_posts` (filtered by prefs + real-data-only) |
| `seenPostIds` | `Set<string>` | `seen_items` |
| `churnSeed` | number | Remix epoch + page salt (Home only) |

## Output

`feedPosts` — ordered list for the active tab after:

1. `mergeFeedWithUnseenCanonicalFirst` (Home) or `mergeFeedById` (other pages)
2. `dedupeTweetsById` on merged lists
3. `buildMixerFeedPostsBase` — time window, Top/Latest/Media, topic prefs, final dedupe

## Invariants

- **One row per tweet id** in output — see [Dedupe contract](dedupe-contract.md).
- Unseen canonical precedes live on Home (unless include-seen).
- No persisted `mixerCache` in v1 — order is reproducible given same seed and DB snapshot.

## UI surfaces

- Home: classic/stream `TweetCard` (not masonry for main tabs).
- Spaces/Broadcasts directories: masonry tiles (`ix-feed--masonry`).
- Live session click → preview modal (`GET /api/x/live-session-detail`).

## Related

- [Mixer pipeline](../explanation/mixer-pipeline.md)
