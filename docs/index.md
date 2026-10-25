# iFixedX documentation

**iFixedX** is an experimental **web** client and ranking lab for **X (Twitter)**-shaped timelines: transparent scoring, a **multi-pipeline** ingest (Live X API, background Grok, **TwitterSpider**, Feedtrix live pipes), and local control via **RxDB** in the browser.

The product is **not affiliated with X Corp.** It uses documented APIs and your own keys on your server.

```{toctree}
:hidden:
:maxdepth: 2

Tutorials <tutorial/index>
How-to guides <how-to/index>
Reference <reference/index>
Explanation <explanation/index>
Canonical contracts <canonical/index>
Topics <topics>
```

## In this documentation

| Area | Start here |
|------|------------|
| **New to the project** | [Getting started](tutorial/getting-started.md) |
| **Run locally / deploy** | [Run locally](how-to/run-locally.md) · [Deploy app](how-to/deploy-app.md) · [Rebuild docs](how-to/rebuild-docs.md) |
| **UI & routing** | [UI shell](explanation/ui-shell.md) · [URL parameters](explanation/url-and-routing.md) |
| **Mixer & Pipetrix** | [Mixer pipeline](explanation/mixer-pipeline.md) · [Pipetrix](canonical/pipetrix.md) |
| **Discovery pipes** | [TwitterSpider](explanation/twitter-spider.md) · [Live & Spaces](explanation/live-spaces.md) |
| **Environment & API** | [Environment](reference/environment.md) · [API routes](reference/api-routes.md) |
| **Platform inventory** | [Platform map](explanation/platform-map.md) · [Roadmap](explanation/platform-roadmap.md) |

## How this documentation is organized

This site follows the [Diátaxis](https://diataxis.fr/) structure.

- **Tutorials** — first-time setup: API, sign-in, first timeline load.
- **How-to guides** — tasks: wipe local DB, switch timeline source, run TwitterSpider, publish docs.
- **Reference** — env vars, API routes, RxDB collections, file map.
- **Explanation** — architecture, fairness philosophy, pipelines.
- **Canonical contracts** — stable names and data-flow rules (update here first, then code).

## Web & mobile scope

| Surface | Status |
|---------|--------|
| **Web (desktop)** | Primary — classic X three-column and wide “stream” layout |
| **Web (narrow)** | Responsive rails; stream layout for Explore-style reading |
| **Mobile web** | Same SPA; touch targets and single-column feed at small breakpoints |
| **Native apps** | Out of scope for this repo; contracts here are API/RxDB-centric |

## Project links

- **App (demo):** [liveandletdev.com](https://liveandletdev.com/)
- **Documentation:** [docs.liveandletdev.com](https://docs.liveandletdev.com/) (static HTML from `docs/_build/html`)

## Contributing to docs

Edit Markdown under `docs/`. Build with:

```bash
npm run docs:build
# or: cd docs && make html
```

See [Rebuild docs](how-to/rebuild-docs.md) and [Publish docs site](how-to/publish-docs-site.md).
