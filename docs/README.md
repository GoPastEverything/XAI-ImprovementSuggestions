# iFixedX documentation (Sphinx)

Published at **https://docs.liveandletdev.com/** (static HTML).

Structure follows [Diátaxis](https://diataxis.fr/) like [Ubuntu Desktop documentation](https://github.com/ubuntu/ubuntu-desktop-documentation/tree/main/docs).

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
make html
make serve
```

## Layout

| Directory | Diátaxis role |
|-----------|----------------|
| `tutorial/` | Learning-oriented |
| `how-to/` | Task-oriented (incl. run TwitterSpider, OAuth prod) |
| `reference/` | Environment, API routes, RxDB, repo layout |
| `explanation/` | Mixer, TwitterSpider, Live Spaces, platform map |
| `canonical/` | Pipetrix, ingest sources, dedupe contracts |

**Inventory:** [Platform map](explanation/platform-map.md) · **Topics:** [topics.md](topics.md)

## Deploy

See `how-to/publish-docs-site.md`.
