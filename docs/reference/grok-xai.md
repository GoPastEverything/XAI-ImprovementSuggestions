# Grok / xAI

## Roles in iFixedX

| Role | Mechanism |
|------|-----------|
| **Refresh corpus** | `home=xai` → `GET /api/for-you` with xAI batch (`server/xaiTrendingTweets.ts`) |
| **Background interest** | Client `runSingleFeedtrixBackgroundTick` → `GET /api/xai/the-feedtrix/batch` → Pipetrix |
| **Live Spaces/Broadcasts hunt** | Feedtrix live scheduler + `xaiLiveSessionsDiscovery.ts` (x_search) |
| **Per-post context** | `mixerNote` on tweets from Grok mapping |

Grok is **not** the sole ranker. Local **platform_style** vs **refined** scoring lives in `server/search.ts`.

## Live search

- Server: `XAI_LIVE_SEARCH=1` prefers Responses API + **`x_search`** (legacy `search_parameters` returns HTTP 410).
- Client Ranking lab: “Prefer xAI live search” → query param on supported routes.

## Feedtrix live vs TwitterSpider

| Pipe | Content | Client path |
|------|---------|-------------|
| FeedtrixSpaces / FeedtrixBroadcasts | Live session URLs | `GET /api/xai/live-sessions` |
| TwitterSpider | Public tweets | `GET /api/twitter-spider/batch` → Pipetrix |

## Prompt hygiene

Avoid prompts that encourage synthetic celebrity spam or explicit “boost small accounts” slots — aligns with [Fair ranking philosophy](../explanation/fair-ranking-philosophy.md).

## Related

- [Live & Spaces](../explanation/live-spaces.md)
- [TwitterSpider](../explanation/twitter-spider.md)
- [Feedtrix topics](feedtrix-topics.md)
- [Grok ingests](../canonical/grok-ingests.md)
