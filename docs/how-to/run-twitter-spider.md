# Run TwitterSpider

TwitterSpider discovers public tweets on the API server and fills Pipetrix so Home can show posts you have not seen on your timeline yet.

## Prerequisites

- API server running with `TWITTER_BEARER_TOKEN` and/or **Sign in with X** (OAuth Recent Search).
- `TWITTER_SPIDER_SCHEDULER` not set to `0` (default: enabled).

## Automatic (background)

On API boot, the scheduler:

1. Compacts the pipe and removes duplicate ids.
2. Runs an initial hunt + validate.
3. Repeats hunt every **5 minutes** and validate every **90 seconds**.

No UI action required.

## Manual (More menu)

1. Open the app → **More** (⋯) in the left nav.
2. Click **Run TwitterSpider now**.
3. Wait for the status line (hunt summary + Pipetrix ingest count).

This calls `POST /api/twitter-spider/run` then pulls `GET /api/twitter-spider/batch` into `tf_canonical_posts`.

## Verify

```bash
curl -s http://127.0.0.1:3847/api/twitter-spider/status | jq .
```

Expect `total` / `active` to grow after hunts when X API credentials work.

On Home (real-data-only on), unseen spider tweets appear mixed ahead of the live timeline.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `+0 new` every hunt | Bearer token, OAuth scopes, or query rate limits |
| Nothing on Home | Real-data-only filters Grok-only canonical; confirm `sourceType: twitter_spider` in IndexedDB |
| Duplicates | Re-open app (one-time dedupe) or wipe local data |

## Related

- [TwitterSpider](../explanation/twitter-spider.md)
- [Environment variables](../reference/environment.md)
