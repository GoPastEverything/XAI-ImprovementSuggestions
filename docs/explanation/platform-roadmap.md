# Platform roadmap — docs completeness & modular structure

This answers: **Are we fully covering the platform?** and **Should we restructure the codebase?**

Short answer:

- **Documentation:** Not yet full — use the phased doc plan below (low risk, high value).
- **Code modularization:** **Recommended before the next big feature wave**, but not an emergency rewrite. The app works; `App.tsx` (~3.3k lines) and `server/index.ts` are the main coupling points.

See [Platform map](platform-map.md) for the inventory.

---

## Phase 0 — Align names and defaults (done / maintain)

- Product name: **The Pipetrix** (DB: `thefeedtrix_local`).
- Home default: **Live X API**; URL `?home=live`.
- No `mixerCache` DB — remix on read (documented in canonical).
- Docs host: **https://docs.liveandletdev.com/**

---

## Phase 1 — Documentation completeness ✅ (shipped)

**Goal:** Every *shipped* surface has a home in Sphinx. No code moves required.

**Status:** Phase 1A–1D pages are in the tree (see explanation/reference/canonical/how-to indices). Remaining optional gaps are listed in [Platform map](platform-map.md) coverage summary.

### 1A — New explanation pages

| Page | Contents |
|------|----------|
| `explanation/ui-shell.md` | Pages, tabs, classic/stream, nav stubs, focus modal |
| `explanation/ranking-system.md` | platform vs refined, sliders, breakdown JSON |
| `explanation/live-spaces.md` | Grok rail, Spaces/Broadcasts directories, snapshot |
| `explanation/media-and-avatars.md` | TwIMG proxy, blob cache, `TwimgImg` chain |
| `explanation/url-and-routing.md` | `?page=`, `?tab=`, `?home=`, `?q=`, `?wipe_local=` |

### 1B — New reference pages

| Page | Contents |
|------|----------|
| `reference/oauth-sessions.md` | Cookie, `data/oauth-sessions/`, per-browser model |
| `reference/ranking-parameters.md` | `recencyWeight`, `strictMatch`, `maxResults`, `omitRetweets` |
| `reference/feedtrix-topics.md` | Topic table + caps + API batch |
| `reference/twimg-proxy.md` | `/api/cdn/twimg`, allowed hosts |
| `reference/xgaming.md` | XGaming page scope (mock data) |

### 1C — New canonical contracts

| Page | Contents |
|------|----------|
| `canonical/ranking-lab-snapshot.md` | `mixerMetaJson.rankingLab` schema |
| `canonical/seen-items.md` | `seen_items` + canonical `seen` sync |
| `canonical/nav-stubs.md` | Explicit “not implemented” list |

### 1D — How-to gaps

| Page | Contents |
|------|----------|
| `how-to/rebuild-docs.md` | `npm run docs:build`, deploy to docs host |
| `how-to/oauth-production.md` | Portal URLs, `FRONTEND_URL`, cookie flags |

**Exit criterion:** [Platform map](platform-map.md) has no “Gap” rows for shipped features.

### Phase 1.6 — Discovery pipes & dedupe ✅

| Page | Purpose |
|------|---------|
| [TwitterSpider](twitter-spider.md) | Tweet hunt/validate pipe + Pipetrix ingest |
| [Real-data-only](real-data-only.md) | Post-wipe canonical gating |
| [Dedupe contract](../canonical/dedupe-contract.md) | Tweet id + live session keys |
| [Run TwitterSpider](../how-to/run-twitter-spider.md) | Manual + scheduler ops |
| Updated [Live & Spaces](live-spaces.md), [API routes](../reference/api-routes.md), [Environment](../reference/environment.md) | Align with Feedtrix pipes + spider routes |

### Phase 1.5 — Ranking-adjacent docs ✅

| Page | Purpose |
|------|---------|
| [Grok ingests](../canonical/grok-ingests.md) | Raw xAI batch schema + replay contract |
| [Account rollup](../reference/account-rollup.md) | `accounts` collection + future author signals |
| [Ranking system](ranking-system.md) | Aligned with `server/search.ts` formulas and ranker/mixer boundary |

**Pause here** for heavy docs / modularization; prioritize algorithm work next.

---

## Phase 2 — Code structure (modular monorepo-lite) (1–2 weeks)

**Goal:** Parallel work (you + Grok) without merge conflicts in one god file.

**When:** Start Phase 2 when you add **exp-sharing**, **new rankers**, or **second client** (mobile shell). Optional if only doc + deploy for now.

### Target layout (incremental, not big-bang)

```text
src/
  app/                    # shell: routing, providers, layout
    AppShell.tsx
    routes.ts             # ?page= mapping
  features/
    home/                 # feed, tabs, bootstrap, grok sentinel
    explore/              # search, compare
    ranking/              # Ranking lab panel
    account/              # OAuth UI
    live/                 # Spaces + Broadcasts tiles
    xgaming/              # already XGamingPage.tsx → move here
    tweet/                # TweetCard, focus modal, engagement
  shared/
    api/                  # fetch wrappers (from src/api)
    db/                   # RxDB (from src/db)
    mixer/                # (existing)
    feedtrix/             # (existing)
    media/                # TwimgImg, avatarUrls
  components/             # icons, AvatarWithFallbacks

server/
  index.ts                # mount only
  routes/
    health.ts
    me.ts
    compare.ts
    forYou.ts
    xai.ts
    auth.ts
    twimg.ts
  services/               # corpus, search, forYou, xai (thin wrappers)
  lib/                    # xApiV2, grokToTweets, oauth/*
```

### Rules

1. **No behavior change** in the first PR — moves only (tests/manual QA).
2. **Feature flags** stay env-based, not new frameworks.
3. **Types** stay in `src/shared/api/types.ts` (or `packages/types` later).

**Exit criterion:** `App.tsx` < 400 lines (composition only); no route logic in tweet components.

---

## Phase 3 — Product / algorithm (ongoing)

Aligned with Grok R&D and [Fair ranking philosophy](fair-ranking-philosophy.md):

| Initiative | Type | Notes |
|------------|------|-------|
| **Exp-sharing primitives** | Algorithm | Extend `search.ts` + `mixerMetaJson`; no new DB required v1 |
| **Grok scoring budget** | Ops | Batch/background only; never per-scroll |
| **Dedupe by content hash** | Quality | Optional second key besides tweet id |
| **mixer_snapshot** (optional) | Storage | Only if frozen order replay is required |
| **Lists / People tabs** | Product | Implement or remove from tab bar |
| **Nav stubs** | Product | Wire or hide until ready |

---

## Phase 4 — Mobile / PWA (later)

- Document API contracts first (Phase 1 canonical).
- Native app reuses: `/api/for-you`, `/api/compare`, OAuth, same Pipetrix schema **or** server-side canonical API (not built yet).

---

## What we should **not** do yet

| Temptation | Why wait |
|------------|----------|
| Separate `mixerCache` DB | Remix on read is enough until replay/perf proves otherwise |
| Python sidecar | TypeScript path is working |
| Microservices | Single Node + static SPA matches current scale |
| Full X nav clone | Stubs are fine until features exist |

---

## Recommended order for *you* right now

1. **Phase 1** — fill doc gaps (Grok can draft from `platform-map.md`).
2. **Deploy app** `dist/` so production matches Live + classic feed.
3. **Phase 2** when Grok starts editing ranker + mixer in parallel with UI work.
4. **Phase 3** fairness primitives — small PRs against `search.ts` + canonical ingest.

---

## Grok on the box

Point Grok at:

- [Platform map](platform-map.md) (inventory)
- This roadmap (phases)
- [Canonical contracts](../canonical/index.md) (contracts)

Ask it to **propose diffs**, not new databases, unless Phase 3 explicitly approves a schema change.
