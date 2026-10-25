# Grok agent handoff (on-box)

Brief for **Grok Build** sessions on the same machine as `/srv/ifixedx`.

## Facts

- **Stack:** TypeScript — React + Express + RxDB. No Python fetch layer.
- **DB name:** `thefeedtrix_local` (product name: **The Pipetrix**).
- **No `mixerCache` collection** — remix on read from `posts` + `tf_canonical_posts`.
- **Default test URL:** `?home=live` + X sign-in.
- **Real-data-only:** default after wipe — canonical mixer allows `live_api` + `twitter_spider` only.
- **Server pipes:** `data/feedtrix-*-pipe.json`, `data/twitter-spider-pipe.json`.
- **Deploy:** Rebuild `npm run build` before expecting new UI on liveandletdev.com.

## Good tasks

1. Propose fairness primitives in `search.ts` / `mixerMetaJson` without new DBs.
2. Prompt hygiene in `xaiTrendingTweets.ts` and Feedtrix batches.
3. Evaluation harness comparing `platform_style` vs `refined` on same corpus.
4. Doc updates under `docs/` when adding routes, env vars, or `sourceType` values.

## Read first (docs)

- [Platform map](platform-map.md) — inventory
- [Ranking system](ranking-system.md) — formulas in `server/search.ts`
- [TwitterSpider](twitter-spider.md) — tweet discovery pipe
- [Live & Spaces](live-spaces.md) — Feedtrix live pipes
- [Canonical contracts](../canonical/index.md)
- [Dedupe contract](../canonical/dedupe-contract.md)

## Avoid

- Assuming frontend loads from `mixerCache`.
- Wrong OAuth paths (`/api/auth/x/login`, not `/start`; `/api/me`, not `/api/auth/me`).
- Per-user “boost handle” in live discovery (removed — equitable rotation only).
- “Boost slots” for small accounts in product copy or prompts.

## Philosophy

See [Fair ranking philosophy](fair-ranking-philosophy.md).

## Human docs

This Sphinx site is the canonical human-readable spec: **https://docs.liveandletdev.com/**

After editing docs: `npm run docs:build`
