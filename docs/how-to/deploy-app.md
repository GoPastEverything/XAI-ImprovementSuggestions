# Deploy the iFixedX web app

## Build fresh assets

```bash
npm run build
```

Deploy **`dist/`** to your web root (e.g. `liveandletdev.com`).

Deploy/run the API from **`dist-server/`** or `tsx server/index.ts` with production `.env`.

## Common “old UI” symptom

If users still see **Grok mixer** labels or **two-column masonry** tiles, the host is serving an **old `dist/`** bundle. Rebuild and replace all files under `dist/assets/` (hashed filenames change each build).

## Recommended production defaults

- Document **Timeline source: Live X API**
- Users sign in with X
- `XAI_API_KEY` enabled for Pipetrix background only
- Avoid bookmarking `?home=xai` unless testing Grok-front refresh

## Environment

Copy `.env.example` → `.env` on the server. Never commit secrets.

See {doc}`/reference/environment`.
