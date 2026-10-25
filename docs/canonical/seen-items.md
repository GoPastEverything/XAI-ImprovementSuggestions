# Seen items (canonical)

**Seen state** prevents the mixer from repeatedly surfacing the same canonical posts and tracks **Live & Spaces** rows the user opened.

## Database

Collection: **`seen_items`** in `ifixedx_local` (`src/db/ifixedxDb.ts`)

| Field | Meaning |
|-------|---------|
| `kind` | `post` or `live` |
| `ref` | Stable key string |
| `seenAt` | Timestamp |

## Post keys

```text
post:{tweetId}
```

Helpers: `postSeenKey()`, `loadSeenPostIds()`, `markPostSeen()` in `src/db/seenItems.ts`.

Mixer: `mergeFeedWithUnseenCanonicalFirst` prefers unseen Pipetrix rows; seen posts fall back in merge order.

## Pipetrix alignment

`tf_canonical_posts.seen` boolean mirrors post seen state:

- `markPostSeen` patches canonical doc when possible
- `syncCanonicalSeenFlagsFromSeenPostIds()` bulk-aligns after load

## Live session keys

```text
live:{kind}:{normalizedUrl}
```

`normalizeLiveUrl()` strips `/peek` and normalizes host/path so different X URL shapes dedupe.

Kinds: `space`, `broadcast` (`LiveSessionKind`).

## Reset without wipe

URL: `?reset_seen=1` — clears seen history, reloads (handled in `App.tsx`).

Full wipe also clears seen items — [Wipe local data](../how-to/wipe-local-data.md).

## Related

- [Mixer contract](mixer-contract.md)
- [Live & Spaces](../explanation/live-spaces.md)
