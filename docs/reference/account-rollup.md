# Account rollup

The **`accounts`** collection in `ifixedx_local` is a **per-handle cache** of display names and avatar URLs. It is updated after every compare/for-you persist and after Pipetrix canonical ingest paths that call rollup helpers.

Implementation: `src/db/accountRollup.ts`

## Document schema (`StoredAccountDoc`)

| Field | Type | Meaning |
|-------|------|---------|
| `handleNorm` | string (PK) | Lowercase handle without `@` |
| `displayName` | string | Latest non-empty author name (max 240) |
| `avatarUrl` | string | Best-known TwIMG profile URL (max 4096) |
| `lastSeenAt` | number | Last rollup touch (`Date.now()`) |
| `seenPostCount` | integer | Cumulative posts counted from ingested tweets |

Indexed: `lastSeenAt`.

## Rollup rules

### Handle normalization

`@User` → `user` via `normHandle()`.

### Avatar preference

`pickBetterAvatar()` keeps an existing `pbs.twimg.com/profile_images` URL over placeholders when merging batches.

### Post count

Each tweet in a batch increments `seenPostCount` by **1** for its author.

**Repost context** (`repostContext.byHandle`) updates display/avatar for the reposter but adds **0** to post count (reposter is not treated as authoring the inner post).

### Upsert

For each handle in the batch:

```text
seenPostCount := previous.seenPostCount + postDelta
displayName / avatarUrl := merge with new row
lastSeenAt := now
```

Failures on individual handles are ignored; whole-batch failure is ignored (best-effort).

## Entry points

| Function | Called from |
|----------|-------------|
| `rollupAccountsFromTweetBatch` | Canonical ingest, Grok batches, API-shaped tweets |
| `rollupAccountsFromStoredDocs` | `persistComparePayload` after `posts` upsert |

## UI consumption

- **`AvatarWithFallbacks`** — prefers `accounts` row, then tweet `avatarUrl`, then TwIMG chain
- **Who to follow** rail — can use handles seen in feed + account metadata

## Ranking / exp-sharing (directional)

`seenPostCount` and `lastSeenAt` are **not scoring inputs** today. They are reserved for future author-level features (consistency, reputation seasoning) described in [Fair ranking philosophy](../explanation/fair-ranking-philosophy.md).

Do not conflate with:

- **`seen_items`** — user opened a post (mixer dedupe)
- **`tf_canonical_posts.seen`** — Pipetrix seen flag

## Wipe

Cleared when `ifixedx_local` is destroyed — [Wipe local data](../how-to/wipe-local-data.md).

## Related

- [Media and avatars](../explanation/media-and-avatars.md)
- [RxDB collections](rxdb-collections.md)
