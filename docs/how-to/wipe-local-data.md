# Wipe local browser data

Clears all offline state used by the mixer.

## What gets deleted

| Store | Name |
|-------|------|
| RxDB | `ifixedx_local` — posts, accounts, grok_ingests, seen_items |
| RxDB | `thefeedtrix_local` — Pipetrix topic buckets + canonical |
| IndexedDB | Avatar blob cache |
| sessionStorage | Layout, home feed mode, Grok rail snapshot, real-data-only flag, spider pull cursor, etc. |
| localStorage | Pipetrix session clock |

## From the UI

**Ranking lab** → **Wipe offline IndexedDB & reload** → confirm.

After wipe, the app enables **real-data-only**, sets `home=live`, and reloads to Home Top tab.

## URL shortcut

Add `?wipe_local=1` to any app URL, confirm the dialog, page reloads.

## Seen-only reset

`?reset_seen=1` clears **seen_items** and Pipetrix canonical `seen` flags without deleting posts.

## Duplicate cleanup without full wipe

On each app entry, a **one-time** pass removes duplicate tweet ids in Pipetrix and `posts` (`dedupeLocalTweets`). For a full reset, use wipe above.

## When to wipe

- After schema changes
- When stuck on old **Grok mixer** UI (stale deploy + stale DB)
- When duplicate or synthetic Grok posts pollute the feed

## Related

- [Real-data-only](../explanation/real-data-only.md)
- [Dedupe contract](../canonical/dedupe-contract.md)
