# Dedupe contract

iFixedX treats the X **tweet id** (15–22 digit snowflake) as the global dedupe key across server pipes, Pipetrix, session posts, and the visible timeline.

## Key rules

1. **One card per tweet id** in `feedPosts` (mixer output).
2. **Canonical store** — `tf_canonical_posts.id` is the tweet id; upsert replaces `tweetJson` / metadata on re-ingest.
3. **Session posts** — `ifixedx_local.posts.id` is the tweet id; duplicates should not exist after maintenance.
4. **Live sessions** — separate key: `liveSessionPlatformKey` (space/broadcast id + kind), not tweet ids. See [Live & Spaces](../explanation/live-spaces.md).

## Quality tie-break

When two rows share the same id, keep the row with higher **quality score**:

- Media / video present
- Higher engagement (`likes` + `retweets`)

Implementation:

- Server: `server/tweetDedupe.ts`
- Client: `src/mixer/dedupeTweets.ts`

## Maintenance

| When | Action |
|------|--------|
| Spider / live hunt | `compact*Pipe()` + in-pipe dedupe |
| App boot (once per session) | `runOneTimeLocalTweetDedupe()` — `src/db/dedupeLocalTweets.ts` |
| User wipe | Full RxDB wipe via Ranking lab or `?wipe_local=1` |

## Invariants (mixer)

Documented in [Mixer contract](mixer-contract.md):

- `mergeFeedById` and `mergeFeedWithUnseenCanonicalFirst` call `dedupeTweetsById` on output.
- `buildMixerFeedPostsBase` dedupes after tab/topic filters.

## Future (optional)

Content-hash dedupe for near-duplicate text is **not** implemented; tweet id remains the only production key.
