# Getting started with iFixedX

This tutorial walks through running iFixedX locally and loading your first **For You** timeline with **Live X API** (recommended).

## What you need

- Node.js 20+ and npm
- A clone of the iFixedX repo
- For **Live** timelines: X developer app (OAuth) — see [Environment variables](../reference/environment.md)
- For **Pipetrix** background fills: `XAI_API_KEY` on the API server (optional)
- For **TwitterSpider** / Recent Search: `TWITTER_BEARER_TOKEN` and/or OAuth

## 1. Configure the API server

```bash
cp .env.example .env
# Edit .env: TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, TWITTER_REDIRECT_URI, FRONTEND_URL
# Optional: XAI_API_KEY, TWITTER_BEARER_TOKEN
```

See [Environment variables](../reference/environment.md) for every variable.

## 2. Start dev stack

From the repo root:

```bash
npm install
npm run dev
```

- **Client:** Vite on port **5173** (proxies `/api` to the server)
- **API:** Express on port **3847**

Open `http://127.0.0.1:5173/`.

## 3. Enter the app and sign in

1. Continue past the landing screen (or **Sign in with X**).
2. Open **Home** → set **Timeline source** to **Live X API (sign-in) — recommended**.
3. Confirm the URL uses `?home=live`.

## 4. Load and verify the pipeline

1. Click **Refresh For You timeline** once (or let auto-bootstrap run on an empty DB).
2. You should see a **single-column** post list (classic layout).
3. Open **Ranking lab** — confirm **Refresh source** matches Home.
4. Optional: enable topic categories under **More → Category settings** for Grok background ticks.
5. Optional: **More → Run TwitterSpider now** to fill Pipetrix with public tweets (needs Bearer/OAuth).

## 5. Confirm local persistence

1. Reload the page — posts should **rehydrate** from `ifixedx_local.posts`.
2. After wipe, **real-data-only** mode is on by default — Home uses live + spider canonical only.
3. To reset: Ranking lab → **Wipe offline IndexedDB & reload**.

## 6. Verify server schedulers (optional)

```bash
curl -s http://127.0.0.1:3847/api/health | jq .
curl -s http://127.0.0.1:3847/api/twitter-spider/status | jq .
```

API logs should mention Feedtrix live and TwitterSpider intervals on boot.

## Next steps

- [Mixer pipeline](../explanation/mixer-pipeline.md)
- [TwitterSpider](../explanation/twitter-spider.md)
- [Platform map](../explanation/platform-map.md)
- [Publish docs site](../how-to/publish-docs-site.md)
