# Ranking system

iFixedX ranks the **same corpus** two ways so you can compare X-style engagement ordering with a **text + recency + anti-spam** ranker. Scoring runs on the **API server** (`server/search.ts`); the client displays `score` and optional `breakdown` per tweet.

## Ranker vs mixer (boundary)

| Stage | Where | What it does |
|-------|--------|----------------|
| **Ranker** | `server/search.ts` → `scoreTweet` / `rankTweets` | Assigns `score` + `breakdown` per tweet for a given query and sliders |
| **Corpus cap** | `server/index.ts` | Slices tweets **before** `rankTweets` (`maxResults` query param) |
| **Mixer** | `src/mixer/merge.ts`, `buildFeedPosts.ts` | Merges live batch + Pipetrix canonical, unseen-first, tab filters — **does not re-score** |

Home **Top** shows one ranked list (platform or refined) **after** mixer merge and time-window filter. Changing sliders requires a new API fetch (or re-rank from stored corpus on Explore).

## Modes

| UI label | API `mode` | Character |
|----------|------------|-----------|
| **Default (engagement-style)** | `platform_style` | Stronger weight on likes/retweets (log-scaled) |
| **iFixedX rank** | `refined` | Query overlap + phrase match + recency − spam; weaker engagement |

Home **Top** tab uses one of these lists (after mixer merge and time filter). **Explore** always computes both for comparison.

## Scoring components

Each tweet gets a numeric `score` and `breakdown` object:

| Key | Meaning |
|-----|---------|
| `overlap` | Token overlap between query and post text |
| `phrase` | Bonus when full query appears as substring |
| `recency` | Exponential decay, 14-day half-life, × `3.2 × recencyWeight` |
| `engagement` | `log10(10+likes)×0.35 + log10(10+retweets)×0.25`, then × **1.65** (platform) or × **0.45** (refined) |
| `spam` | Negative — hashtags, promo words, tag-based bait (refined only) |

**Final score:** `overlap + phrase + recency + engagement - spam` (spam stored in breakdown as negative `spam`).

### Recency formula (code)

```text
ageHours = max(1, hours since createdAt)
decay = exp(-ln(2) * ageHours / (24 * 14))
recency = decay * 3.2 * recencyWeight
```

`recencyWeight` is clamped to `[0, 1]` on the API.

### Refined-only rules

- With a **non-empty query**, if overlap + phrase &lt; 0.8, score is multiplied by **0.35** (weak textual match sinks).
- **Strict match** enables hashtag/promo penalties and extra penalty when tags look engagement-bait shaped.

### Home / empty query

On For You, the query string is often empty. Overlap/phrase are ~0; **recency** and **engagement** (platform mode) still sort the feed. This is intentional — search ranking rules do not demote the whole timeline.

## Ranking lab sliders

Controlled in UI, sent to `/api/compare` and `/api/for-you`:

| Parameter | Default (server) | Effect |
|-----------|------------------|--------|
| `recencyWeight` | `0.78` | 0 = ignore age; higher = prefer newer posts |
| `strictMatch` | `1` → true | Anti-spam / hashtag penalties |
| `maxResults` | Compare: **30**; For You: **35**; xAI home: **12** (max 25) | Corpus size **before** `rankTweets` |

Explore also supports **`omitRetweets`** (Recent Search query `-is:retweet`).

`SearchParams` in `search.ts` only includes `q`, `mode`, `recencyWeight`, `strictMatch` — `maxResults` is enforced in route handlers, not inside `scoreTweet`.

Slider values are snapshotted into Pipetrix **`mixerMetaJson.rankingLab`** on ingest — see [Ranking lab snapshot](../canonical/ranking-lab-snapshot.md).

## API flow

```text
corpus[]  →  rankTweets()  →  platform_style[] + refined[]
```

- **Explore:** `GET /api/compare?q=…&source=mock|live`
- **Home:** `GET /api/for-you` (live / mock / xai paths)

## Fairness direction

Product goal: better **candidate quality** and **seasoning**, not reserved “boost slots.” See [Fair ranking philosophy](fair-ranking-philosophy.md).

Future work (exp-sharing, Grok semantic scores) should extend `scoreTweet` / `mixerMetaJson`, not a parallel ranker DB. Raw Grok batches for replay live in [Grok ingests](../canonical/grok-ingests.md).

## Related

- [Ranking parameters](../reference/ranking-parameters.md)
- [Grok ingests](../canonical/grok-ingests.md)
- [Account rollup](../reference/account-rollup.md)
- [Mixer pipeline](mixer-pipeline.md)
