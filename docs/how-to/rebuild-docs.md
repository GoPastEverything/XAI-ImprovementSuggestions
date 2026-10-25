# Rebuild the documentation site

Local build and deploy steps for **https://docs.liveandletdev.com/**.

## Prerequisites

```bash
cd /srv/ifixedx/docs
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Build HTML

From repo root:

```bash
npm run docs:build
```

Or directly:

```bash
cd /srv/ifixedx/docs && .venv/bin/sphinx-build -M html . _build
```

Output: `docs/_build/html/`

## Preview locally

```bash
npm run docs:serve
```

Opens a static server on the built HTML (port varies by script).

## Deploy to production

On the server hosting docs:

1. Build (above).
2. nginx `root` should point at `/srv/ifixedx/docs/_build/html` for `docs.liveandletdev.com`.
3. Reload nginx after build: `sudo nginx -t && sudo systemctl reload nginx`

Full nginx + TLS steps: [Publish the docs site](publish-docs-site.md).

## After adding pages

1. Create `.md` under `docs/` (tutorial, how-to, reference, explanation, canonical).
2. Add entry to the section **`index.md`** `toctree`.
3. Rebuild and verify no Myst warnings for broken links.

## Related

- [Platform roadmap](../explanation/platform-roadmap.md) — which pages to add next
