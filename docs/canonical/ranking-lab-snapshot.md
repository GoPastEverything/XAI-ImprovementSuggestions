# Ranking lab snapshot (canonical)

When posts enter **Pipetrix** (`thefeedtrix_local.tf_canonical_posts`), the client may attach a **Ranking lab snapshot** so later analysis knows which sliders produced the batch.

## Type

From `src/feedtrix/canonicalIngest.ts`:

```typescript
type RankingLabMixerSnapshot = {
  recencyWeight: number;
  strictMatch: boolean;
  maxResults: number;
};
```

## Storage

Merged into **`mixerMetaJson`** on the canonical post document:

| Field | Meaning |
|-------|---------|
| `rankingLab` | Snapshot object |
| `rankingLabCapturedAt` | `Date.now()` at ingest |

Previous keys in `mixerMetaJson` are preserved (shallow merge).

## When captured

Typically on:

- Grok For You / mixer ingest (`ingestComparePayloadToCanonical`)
- Feedtrix topic batch ingest (same helper path)

Explore-only searches that do not write canonical rows **do not** create snapshots.

## Usage today

- **Documentation / debugging** — compare feed behavior to slider settings
- **Future fairness** — exp-sharing or replay should read `mixerMetaJson`, not a separate DB

## Related

- [Ranking parameters](../reference/ranking-parameters.md)
- [Pipetrix canonical](pipetrix.md)
