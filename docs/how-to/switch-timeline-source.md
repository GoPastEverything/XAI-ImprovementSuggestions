# Switch the For You refresh source

The **refresh source** controls which API runs when you click **Refresh For You timeline**. It does **not** disable **The Pipetrix** background Grok ticks when xAI is configured (unless **real-data-only** blocks Grok canonical on Home).

**TwitterSpider** runs on the server on a schedule and via **More → Run TwitterSpider now** — independent of this dropdown. See {doc}`../explanation/twitter-spider`.

| Source | When to use |
|--------|-------------|
| **Live X API (recommended)** | Real following timeline + fallbacks; production-style testing |
| **Grok-generated timeline** | xAI-only corpus on refresh; needs `XAI_API_KEY` |
| **Offline demo** | `server/seed-tweets.json`; no OAuth |

## Change source

**Home:** Timeline source dropdown (top strip).

**Ranking lab:** Refresh source dropdown (same state, synced via `sessionStorage` + `?home=`).

## URL parameter

| `?home=` | Mode |
|----------|------|
| `live` | Live X API |
| `xai` | Grok-generated |
| `seed` | Offline JSON |

Example: `https://liveandletdev.com/?page=home&tab=top&home=live`

## After switching

- Click **Refresh For You timeline** once to populate `ifixedx_local.posts` for the new source.
- Or **wipe** local DB if you do not want old Grok rows mixed in — {doc}`wipe-local-data`.
