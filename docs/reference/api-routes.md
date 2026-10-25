# HTTP API routes (Express)

Base: **`/api`** on port **3847** (Vite dev proxies `/api` from `:5173`).

Handlers are registered in `server/index.ts`; OAuth in `server/oauth/xAuthRoutes.ts`; TwIMG in `server/twimgProxy.ts`.

## Health & session

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/health` | GET | `oauthConfigured`, `bearerConfigured`, `xaiConfigured`, session hints |
| `/api/me` | GET | Linked X user (`connected`, profile, errors) — cookie session |

## Timelines & search

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/compare` | GET | Explore: search + rank (`q`, `source`, `mode`, ranking params) |
| `/api/for-you` | GET | Home corpus + rank (`source`, `home`, `mock`, ranking params) |
| `/api/search` | GET | Alias/wrapper around search corpus |

## xAI / Grok

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/xai/trending-tweets` | GET | One-shot Grok home batch (`n`, `live`) |
| `/api/xai/the-feedtrix/batch` | GET | Single topic Grok batch (`topic`, `maxResults`) |
| `/api/xai/live-sessions` | GET | Spaces + Broadcasts from **Feedtrix pipes** (`nSpaces`, `nBroadcasts`, `refresh=1`) |

## Live session detail

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/x/live-session-detail` | GET | Space/broadcast preview (`kind`, `linkUrl`, optional fallbacks) |

## TwitterSpider

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/twitter-spider/status` | GET | Pipe stats + scheduler state |
| `/api/twitter-spider/run` | POST | Manual hunt (+ background validate); OAuth session when signed in |
| `/api/twitter-spider/batch` | GET | Active tweets for client (`n`, `sinceMs`) |

## Media proxy

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cdn/twimg` | GET | TwIMG hotlink fallback — see [TwIMG proxy](twimg-proxy.md) |

## OAuth (Sign in with X)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/x/login` | GET | Start OAuth 2.0 PKCE → redirect to X |
| `/api/auth/x/callback` | GET | Exchange code, set `ix_session` cookie, redirect `FRONTEND_URL` |
| `/api/auth/x/logout` | POST | Clear session + cookie |

## Static

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | API info JSON (non-production) or SPA static when `dist/` present |

## Common query parameters

| Param | Routes | Meaning |
|-------|--------|---------|
| `source` | compare, for-you | `live` or `mock` |
| `home` | for-you | `live`, `xai`, `seed` refresh mode |
| `recencyWeight`, `strictMatch`, `maxResults` | compare, for-you | Ranking lab sliders |
| `refresh=1` | live-sessions | Kick Feedtrix live hunt in background |

## Related

- [Environment variables](environment.md)
- [OAuth sessions](oauth-sessions.md)
- [X API](x-api.md)
- [Grok / xAI](grok-xai.md)
- [TwitterSpider](../explanation/twitter-spider.md)
