# Platform map (what iFixedX is today)

Single-page inventory of **surfaces**, **data paths**, and **doc coverage**. Use with [Platform roadmap](platform-roadmap.md) for what to build next.

## Product surfaces

| Surface | Route / trigger | Status | Docs |
|---------|-----------------|--------|------|
| **Landing** | Pre-app `XAuthLanding` | Live | [Getting started](../tutorial/getting-started.md) |
| **Home** | `?page=home` | Live | [UI shell](ui-shell.md), [Mixer pipeline](mixer-pipeline.md) |
| **Explore** | `?page=explore` + `?q=` | Live | [Ranking system](ranking-system.md) |
| **Ranking lab** | `?page=ranking` | Live | [Ranking parameters](../reference/ranking-parameters.md) |
| **Account** | `?page=account` | Live (OAuth) | [OAuth sessions](../reference/oauth-sessions.md) |
| **All Spaces** | `?page=spaces` | Live | [Live & Spaces](live-spaces.md) |
| **All Broadcasts** | `?page=broadcasts` | Live | [Live & Spaces](live-spaces.md) |
| **XGaming** | `?page=xgaming` | Live (mock) | [XGaming](../reference/xgaming.md) |
| **Focus modal** | Click post | Live | [UI shell](ui-shell.md) |
| **Live session preview** | Click Space/Broadcast tile | Live | [Live & Spaces](live-spaces.md) |
| **Legal** | `/legal/*.html` in `dist/` | Static | Served with SPA deploy |

### Home sub-tabs

| Tab | Behavior | Docs |
|-----|----------|------|
| **Top** | Ranked list + time window | [Ranking system](ranking-system.md) |
| **Latest** | Reverse-chron | [UI shell](ui-shell.md) |
| **Media** | Attachments filter | [UI shell](ui-shell.md) |
| **People** | Unique authors | [UI shell](ui-shell.md) |
| **Lists** | Placeholder UI | [Nav stubs](../canonical/nav-stubs.md) |

### More menu (⋯)

| Action | Docs |
|--------|------|
| Account / Ranking lab shortcuts | [UI shell](ui-shell.md) |
| Pipetrix category toggles | [Feedtrix topics](../reference/feedtrix-topics.md) |
| **Run TwitterSpider now** | [TwitterSpider](twitter-spider.md) |
| Classic / Stream layout | [UI shell](ui-shell.md) |

## Layout & client modes

| Mode | Class / state | Docs |
|------|---------------|------|
| **Classic** | `ix-app--classic` | [UI shell](ui-shell.md) |
| **Stream** | `ix-app--stream` | [UI shell](ui-shell.md) |
| **Real-data-only** | `sessionStorage` `ix_real_data_only` | [Real-data-only](real-data-only.md) |

## Data & pipeline layers

| Layer | Technology | Docs |
|-------|------------|------|
| **Live ingest** | `forYouCorpus`, `corpus`, `xApiV2` | [X API](../reference/x-api.md) |
| **Grok ingest** | `xaiTrendingTweets`, Feedtrix batch | [Grok / xAI](../reference/grok-xai.md) |
| **TwitterSpider** | `data/twitter-spider-pipe.json` → Pipetrix | [TwitterSpider](twitter-spider.md) |
| **Feedtrix live pipes** | Spaces + Broadcasts JSON pipes | [Live & Spaces](live-spaces.md) |
| **Canonical (Pipetrix)** | `tf_canonical_posts` | [Pipetrix](../canonical/pipetrix.md) |
| **Session posts** | `ifixedx_local.posts` | [RxDB](../reference/rxdb-collections.md) |
| **Mixer** | merge + rank slice + dedupe | [Mixer pipeline](mixer-pipeline.md) |
| **Dedupe** | tweet id + live session keys | [Dedupe contract](../canonical/dedupe-contract.md) |
| **Seen** | `seen_items` + canonical `seen` | [Seen items](../canonical/seen-items.md) |
| **Avatars** | `accounts` + blob IDB | [Media and avatars](media-and-avatars.md) |
| **TwIMG** | Client candidates + `/api/cdn/twimg` | [TwIMG proxy](../reference/twimg-proxy.md) |

## Server API (Express)

| Endpoint | Purpose | Docs |
|----------|---------|------|
| `GET /api/health` | Config flags | [API routes](../reference/api-routes.md) |
| `GET /api/me` | OAuth session / profile | [OAuth sessions](../reference/oauth-sessions.md) |
| `GET /api/compare` | Explore rank | [API routes](../reference/api-routes.md) |
| `GET /api/for-you` | Home timeline | [API routes](../reference/api-routes.md) |
| `GET /api/search` | Search wrapper | [API routes](../reference/api-routes.md) |
| `GET /api/x/live-session-detail` | Space/broadcast preview | [Live & Spaces](live-spaces.md) |
| `GET /api/xai/live-sessions` | Spaces/Broadcasts from pipes | [Live & Spaces](live-spaces.md) |
| `GET /api/xai/trending-tweets` | Grok home batch | [Grok / xAI](../reference/grok-xai.md) |
| `GET /api/xai/the-feedtrix/batch` | Topic pull | [Feedtrix topics](../reference/feedtrix-topics.md) |
| `GET/POST /api/twitter-spider/*` | Tweet discovery pipe | [TwitterSpider](twitter-spider.md) |
| `GET /api/cdn/twimg` | Media proxy | [TwIMG proxy](../reference/twimg-proxy.md) |
| `GET/POST /api/auth/x/*` | OAuth | [OAuth sessions](../reference/oauth-sessions.md) |

## Schedulers (API host)

| Scheduler | Default interval | Disable |
|-----------|------------------|---------|
| Feedtrix live hunt | ~5 min | `FEEDTRIX_LIVE_SCHEDULER=0` |
| Feedtrix live validate | ~90 s | (same) |
| TwitterSpider hunt | ~5 min | `TWITTER_SPIDER_SCHEDULER=0` |
| TwitterSpider validate | ~90 s | (same) |
| Legacy Grok live cache | optional | `XAI_LIVE_SESSIONS_SCHEDULER=0` |

## Deployment topology

| Host | Role | Docs |
|------|------|------|
| `liveandletdev.com` | SPA + `/api` proxy | [Deploy app](../how-to/deploy-app.md) |
| `docs.liveandletdev.com` | Sphinx `_build/html` | [Publish docs](../how-to/publish-docs-site.md) |

## Coverage summary

- **Documented:** shell, routing, mixer, Pipetrix, ranking, OAuth, Live Spaces, TwitterSpider, dedupe, real-data-only, media/TwIMG, deploy/docs host.
- **Optional depth later:** People/Lists implementation, legal copy, content-hash dedupe.
- **Code structure:** `App.tsx` remains large — see [Roadmap](platform-roadmap.md) Phase 2.
