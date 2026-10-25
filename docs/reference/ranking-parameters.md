# Ranking parameters

Query and body fields that control **`server/search.ts`** ranking and related API handlers.

## `SearchParams` (compare / for-you)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | `""` | Search query; empty on For You |
| `mode` | `platform_style` \| `refined` | (per request) | Which score profile |
| `recencyWeight` | number | `0.78` | Scales recency term (0 = off) |
| `strictMatch` | boolean | `true` | Enables spam/hashtag penalties |
| `maxResults` | number | Route-specific | Cap **before** `rankTweets` (not inside `scoreTweet`) |
| `omitRetweets` | boolean | `false` | Live search only: append `-is:retweet` |

## Server defaults (`server/index.ts`)

| Route | `maxResults` default | Clamp |
|-------|---------------------|--------|
| `GET /api/compare` | 30 | 10–100 |
| `GET /api/for-you` (live/mock) | 35 | 5–100 |
| `GET /api/for-you?xai=1` | 12 | 1–25 |

## Compare endpoint

`GET /api/compare`

| Param | Notes |
|-------|-------|
| `q` | Required for meaningful Explore results |
| `source` | `mock` \| `live` |
| `recencyWeight`, `strictMatch`, `maxResults`, `omitRetweets` | Corpus cap + ranker inputs |

Returns `platform_style` and `refined` arrays (field names match `ComparePayload`).

## For You endpoint

`GET /api/for-you`

| Param | Notes |
|-------|-------|
| `home` | `live` \| `xai` \| `seed` (client `homeFeedMode`) |
| Same slider fields | From Ranking lab state |

Paths:

- **live** — X home timeline (session required); query `xai` omitted
- **xai** — `xai=1`; Grok batch + optional `xaiIngest` → [Grok ingests](../canonical/grok-ingests.md)
- **seed** — `mock=1` / seed path — `server/seed-tweets.json`

## Scoring reference

See [Ranking system](../explanation/ranking-system.md) for `overlap`, `phrase`, `recency`, `engagement`, `spam`.

## Pipetrix snapshot

On ingest, UI may pass `rankingLab: { recencyWeight, strictMatch, maxResults }` into canonical writes → stored in `mixerMetaJson`. See [Ranking lab snapshot](../canonical/ranking-lab-snapshot.md).

## Related

- [Fair ranking philosophy](../explanation/fair-ranking-philosophy.md)
- [Grok / xAI](grok-xai.md) (`maxResults` on topic batch)
