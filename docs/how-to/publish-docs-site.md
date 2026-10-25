# Publish documentation to docs.liveandletdev.com

The docs site is **static HTML** produced by Sphinx. Point your GoDaddy subdomain at this output.

## Build

```bash
cd /srv/ifixedx/docs
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
make html
```

Output directory: **`docs/_build/html/`**

Verify locally:

```bash
make serve
# http://127.0.0.1:8765/
```

## GoDaddy / DNS

1. Create subdomain **`docs`** → **A** record to the same host as the app (**66.42.120.183** on the current box), or **CNAME** to `liveandletdev.com`.
2. TLS: included on the shared Let's Encrypt cert via Certbot (see below).

## nginx on this server (already configured)

Site file: `/etc/nginx/sites-available/ifixedx`

- **App:** `liveandletdev.com`, `www`, `api` → `/srv/ifixedx/dist` + `/api` proxy
- **Docs:** `docs.liveandletdev.com` → `/srv/ifixedx/docs/_build/html`

Expand certificate when adding subdomains:

```bash
sudo certbot --nginx \
  -d liveandletdev.com -d www.liveandletdev.com \
  -d api.liveandletdev.com -d docs.liveandletdev.com \
  --expand --non-interactive
sudo systemctl reload nginx
```

Rebuild and redeploy `docs/_build/html` after doc changes (`npm run docs:build` or `make html` in `docs/`).

## Optional CI

Add a workflow that runs `make html` and rsyncs `_build/html` to the doc host on push to `main`.

## Canonical URL

`docs/conf.py` sets `html_baseurl = "https://docs.liveandletdev.com/"` for sitemap generation.
