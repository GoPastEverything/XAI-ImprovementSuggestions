# Environment variables

Server configuration: **`.env`** at the repo root (template: **`.env.example`**). Never commit real secrets.

Client build-time (Vite): only variables prefixed with **`VITE_`**.

## X OAuth — Live timelines

| Variable | Required | Purpose |
|----------|----------|---------|
| `TWITTER_CLIENT_ID` | For sign-in | OAuth 2.0 client id |
| `TWITTER_CLIENT_SECRET` | Confidential apps | Token exchange |
| `TWITTER_REDIRECT_URI` | Yes | Must match X developer portal (default `http://localhost:3847/api/auth/x/callback`) |
| `FRONTEND_URL` | Yes | Post-login browser redirect (default `http://localhost:5173`) |
| `IFIXEDX_SESSION_SECRET` | **Production** | HMAC for `ix_session` cookie (≥16 chars) |
| `IFIXEDX_COOKIE_SAMESITE` | Cross-origin | e.g. `None` when UI and API differ |
| `IFIXEDX_COOKIE_SECURE` | Cross-origin | `1` with HTTPS + `SameSite=None` |

## X API — app-only

| Variable | Purpose |
|----------|---------|
| `TWITTER_BEARER_TOKEN` | Recent Search, TwitterSpider, corpus fallbacks when user OAuth unavailable |

## Home timeline fallbacks

| Variable | Purpose |
|----------|---------|
| `IFIXEDX_HOME_LIST_ID` | Numeric list id — list timeline when home/search blocked |
| `IFIXEDX_HOME_FALLBACK_QUERY` | Recent Search query when timelines return empty |

## xAI / Grok

| Variable | Default | Purpose |
|----------|---------|---------|
| `XAI_API_KEY` | — | Grok batches, Feedtrix topics, live-session Grok hunt |
| `XAI_MODEL` | `grok-4.3` | Default chat model |
| `XAI_LIVE_SEARCH` | — | `1` → Responses API + `x_search` for live discovery |

### Live Spaces / Broadcasts (Feedtrix pipes)

| Variable | Default | Purpose |
|----------|---------|---------|
| `XAI_LIVE_SESSIONS_MODEL` | `XAI_MODEL` | Grok model for live hunt prompts |
| `XAI_LIVE_SESSIONS_MAX_SPACES` | `48` | Hunt cap per spaces pipe |
| `XAI_LIVE_SESSIONS_MAX_BROADCASTS` | `48` | Hunt cap per broadcasts pipe |
| `XAI_LIVE_SESSIONS_REFRESH_MS` | `300000` | Legacy alias; hunt interval if `FEEDTRIX_LIVE_HUNT_MS` unset |
| `XAI_LIVE_SESSIONS_SCHEDULER` | on | `0` disables live scheduler |
| `FEEDTRIX_LIVE_HUNT_MS` | `300000` | Hunt interval (~5 min) |
| `FEEDTRIX_LIVE_VALIDATE_MS` | `90000` | Validate interval |
| `FEEDTRIX_LIVE_VALIDATE_BATCH` | `10` | Rows validated per pass |
| `FEEDTRIX_LIVE_SCHEDULER` | on | `0` disables Feedtrix live scheduler |
| `IFIXEDX_LIVE_SESSIONS_CACHE_FILE` | optional | Override Grok snapshot cache path |

### TwitterSpider

| Variable | Default | Purpose |
|----------|---------|---------|
| `TWITTER_SPIDER_HUNT_MS` | `300000` | Hunt interval (~5 min) |
| `TWITTER_SPIDER_VALIDATE_MS` | `90000` | Validate interval |
| `TWITTER_SPIDER_VALIDATE_BATCH` | `25` | Tweets validated per pass |
| `TWITTER_SPIDER_SCHEDULER` | on | `0` disables TwitterSpider scheduler |

### Pipetrix (server batch size)

| Variable | Default | Purpose |
|----------|---------|---------|
| `THE_FEEDTRIX_BATCH_SIZE` | `69` | Grok posts per topic API batch (client caps ~420/topic) |

## Client build

| Variable | Purpose |
|----------|---------|
| `VITE_PUBLIC_API_ORIGIN` | API origin when UI is not same-host (no trailing slash); empty = same-origin / Vite proxy |

## Runtime

| Variable | Purpose |
|----------|---------|
| `PORT` | API listen port (default **3847**) |
| `NODE_ENV` | `production` enforces session secret checks |

## Server filesystem (not env)

| Path | Purpose |
|------|---------|
| `data/oauth-sessions/<id>.json` | Per-browser OAuth tokens |
| `data/feedtrix-spaces-pipe.json` | FeedtrixSpaces pipe |
| `data/feedtrix-broadcasts-pipe.json` | FeedtrixBroadcasts pipe |
| `data/twitter-spider-pipe.json` | TwitterSpider pipe |

## Related

- [OAuth sessions](oauth-sessions.md)
- [OAuth in production](../how-to/oauth-production.md)
- [Run locally](../how-to/run-locally.md)
