# Fair ranking philosophy

iFixedX is an **algorithm R&D** vehicle: learn how to improve discovery at X-scale without shipping a separate “boost slot” product.

## Principles (product north star)

1. **No artificial boost lanes** — do not reserve feed slots that only small accounts can win; that feels rigged.
2. **Keep stochastic surfacing** — the feed stays partly “lotto-like”; better **candidate generation** and **scoring** improve odds for merit, not guaranteed impressions.
3. **Merit over pity** — smaller accounts should win when posts are genuinely strong, not because of diversity injection.
4. **Richer signals** (directional):
   - Semantic quality / substance (Grok seasoning, bounded cost)
   - Originality vs noise
   - Conversation quality
   - Author consistency over time
   - **Who** engaged (network quality), not raw follower count alone

## “Exp sharing” (design space)

Ideas under discussion (not all implemented):

- Reputation-weighted engagement
- Discovery credit when quality accounts amplify smaller ones
- Author-level features accumulated in Pipetrix `mixerMetaJson` and optionally [Account rollup](../reference/account-rollup.md) (`seenPostCount`, `lastSeenAt`)

Implementations should extend **existing types** (`Tweet`, canonical ingest, `search.ts`) — not a parallel social graph DB unless necessary. Replay raw Grok batches via [Grok ingests](../canonical/grok-ingests.md) when re-scoring without new xAI calls.

## Two rankers today

| Mode | Location | Character |
|------|----------|-----------|
| **Default (engagement-style)** | `platform_style` | Closer to velocity / engagement heuristics |
| **iFixedX rank** | `refined` | Text match + recency + anti-spam sliders |

Grok supplies **candidates and context** (`mixerNote`, topic batches); local code owns **ordering**.

## Evaluation

Use Ranking lab sliders; ingest snapshots `rankingLab` into canonical `mixerMetaJson` for offline comparison.

## Grok collaboration

When Grok on the box proposes scoring changes, start from:

- `src/mixer/merge.ts`
- `src/mixer/buildFeedPosts.ts`
- `src/feedtrix/canonicalIngest.ts`
- `server/forYouCorpus.ts`
- `server/search.ts`

See {doc}`grok-handoff`.
