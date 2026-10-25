# Grok ingests (canonical backup)

**`grok_ingests`** in `ifixedx_local` stores the **raw Grok model payload** from Home **xAI** refreshes. It is an audit/replay layer — not used for feed ordering today.

## When rows are written

Only when `GET /api/for-you` runs with **`xai=1`** (Home timeline source **Grok / xAI**) and the server attaches `xaiIngest` on the JSON response.

Flow:

```text
fetchTrendingTweetsViaXai → grokItemsToTweets → rankTweets (platform + refined)
        │
        └── xaiIngest { items, model, … } on ComparePayload
                │
                └── persistComparePayload → grok_ingests.insert (if items present)
```

Live X and seed paths **do not** write `grok_ingests`.

## API payload (`XaiIngestPayload`)

Type: `src/api/types.ts`

| Field | Type | Meaning |
|-------|------|---------|
| `storedAt` | ISO string | Server timestamp when batch was built |
| `model` | string | xAI model id used for the call |
| `liveSearch` | boolean | Whether live search was requested |
| `warning` | string? | Server warning text (quota, parse, etc.) |
| `items` | `Record<string, unknown>[]` | **Unmodified** Grok JSON objects before `grokItemsToTweets` mapping |

Ranked tweets in `platform_style` / `refined` are derived from these items; scores live on **`posts`**, not inside `itemsJson`.

## RxDB document (`GrokIngestDoc`)

Schema: `src/db/ifixedxDb.ts` (`grokIngestSchema`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (PK) | `grok-{storedAt}-{random}` |
| `storedAt` | number | `Date.now()` at insert |
| `isoStoredAt` | string | Copy of `xaiIngest.storedAt` |
| `model` | string | Max 120 chars |
| `liveSearch` | boolean | |
| `warning` | string | Max 4000 chars |
| `itemsJson` | string | `JSON.stringify(items)` — max **900_000** chars in schema |
| `homeDataSource` | string | Always `xai_grok` on insert today |

Indexed: `storedAt` (newest-first queries).

## Size guard

If `itemsJson.length > 890_000`, insert is **skipped** (console warning). Normal batches should fit; huge Grok responses may lose raw backup but still persist ranked **`posts`**.

## Relationship to Pipetrix

| Store | Content |
|-------|---------|
| `grok_ingests` | Raw Grok batch (replay, diff prompts, train eval) |
| `tf_canonical_posts` | Normalized tweet + `sourceType`, `mixerMetaJson`, topics |
| `posts` | Last ranked platform/refined scores for session rehydrate |

Canonical ingest may run in parallel from the same API response; **`grok_ingests` does not replace canonical**.

## Future ranking / exp-sharing use

Planned uses (not implemented):

- Replay Grok output after `search.ts` changes without re-calling xAI
- Compare `items[].…` fields to ranked `breakdown` for calibration
- Store prompt version ids in `mixerMetaJson` alongside [Ranking lab snapshot](ranking-lab-snapshot.md)

## Wipe

Removed with full local wipe — [Wipe local data](../how-to/wipe-local-data.md).

## Related

- [Grok / xAI](../reference/grok-xai.md)
- [Ranking system](../explanation/ranking-system.md)
- [RxDB collections](../reference/rxdb-collections.md)
