# TwitterSpider

**TwitterSpider** is a server-side discovery pipe for **public tweets** discovered outside your signed-in home timeline. It runs on a schedule, validates rows against the X API, and feeds **The Pipetrix** on the client so Home can surface posts you have not yet scrolled past.

It is parallel to **Feedtrix live pipes** (Spaces/Broadcasts) but targets normal tweet cards, not live session tiles.

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ API host (runs while you are away)                            │
│  Hunt (~5m) → spider pipe → Pipetrix canonical store          │
│  Validate (~90s) → deactivate dead ids in both stores         │
│  Live for-you / Explore → also upsert server Pipetrix         │
│  File: data/pipetrix-canonical.json (up to PIPETRIX_MAX_*)   │
└───────────────────────────────┬──────────────────────────────┘
                                │ GET /api/pipetrix/batch
                                v
┌──────────────────────────────────────────────────────────────┐
│ Browser (on return / every 5m)                              │
│  pullServerPipetrixIntoLocal() → tf_canonical_posts mirror    │
└───────────────────────────────┬──────────────────────────────┘
                                v
                    mergeFeedWithUnseenCanonicalFirst (Home)
```

## Server pipe

| Property | Value |
|----------|--------|
| File | `data/twitter-spider-pipe.json` |
| Name | `TwitterSpider` |
| Max rows | 2500 (inactive pruned after 7 days) |

Each record stores tweet JSON, `firstSeenAt` / `lastSeenAt`, `isActive`, validation notes, and `discoverySource` (`x_api` for Recent Search, optional home timeline sample when OAuth is present).

**Hunt** rotates queries from `TWITTER_SPIDER_RECENT_QUERIES` in `server/twitterSpiderHunt.ts` (two queries per pass). **Validate** batch-lookups stale rows via `GET /2/tweets` and deactivates dead or inaccessible ids.

Dedupe is by **tweet snowflake id** at every ingest (`server/tweetDedupe.ts`, `compactTwitterSpiderPipe`).

## HTTP API

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/pipetrix/status` | GET | **Server canonical store** stats + sync state |
| `/api/pipetrix/batch` | GET | Posts for client mirror (`n`, `sinceMs`, optional `source`) |
| `/api/pipetrix/sync` | POST | Force spider pipe → Pipetrix merge |
| `/api/twitter-spider/status` | GET | Spider pipe stats + scheduler state |
| `/api/twitter-spider/run` | POST | Manual hunt + validate + Pipetrix sync |
| `/api/twitter-spider/batch` | GET | Legacy; prefer `/api/pipetrix/batch` |

## Client ingest

- `src/feedtrix/serverPipetrixSync.ts` — `pullServerPipetrixIntoLocal()` every **5 minutes** and on app open.
- Mirrors server store into `tf_canonical_posts` (per-tweet `sourceType` preserved).
- Mixer still runs in the browser; server holds the authoritative corpus while you are offline.
- Tweets gain tag `twitter-spider` for debugging in the UI.

**Real-data-only mode** (`ix_real_data_only` in `sessionStorage`) allows canonical rows from `live_api` and `twitter_spider` only; Grok mixer / seed canonical is skipped on Home.

## More menu

**More → Run TwitterSpider now** calls `POST /api/twitter-spider/run`, then pulls the latest batch into Pipetrix.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `TWITTER_SPIDER_HUNT_MS` | `300000` | Hunt interval (5 min) |
| `TWITTER_SPIDER_VALIDATE_MS` | `90000` | Validate interval |
| `TWITTER_SPIDER_VALIDATE_BATCH` | `25` | Tweets per validate pass |
| `TWITTER_SPIDER_SCHEDULER` | on | Set `0` to disable background loops |

Requires **`TWITTER_BEARER_TOKEN`** and/or a signed-in user OAuth session for Recent Search (same stack as `server/xApiV2.ts`).

## Duplicate prevention

| Layer | Mechanism |
|-------|-----------|
| Spider pipe | One record per tweet id |
| Pipetrix canonical | Primary key = tweet `id` (upsert) |
| Local DB boot | `runOneTimeLocalTweetDedupe()` trims duplicate RxDB docs |
| Timeline | `dedupeTweetsById` in `buildMixerFeedPostsBase` and `mergeFeedById` |

See [Dedupe contract](../canonical/dedupe-contract.md).

## Related

- [Mixer pipeline](mixer-pipeline.md)
- [Pipetrix](../canonical/pipetrix.md)
- [Environment variables](../reference/environment.md)
- [API routes](../reference/api-routes.md)
- [Run TwitterSpider](../how-to/run-twitter-spider.md)
