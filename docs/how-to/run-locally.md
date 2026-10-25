# Run iFixedX locally

## Dev (client + API)

```bash
npm run dev
```

Runs `concurrently`:

- `npm run dev:client` — Vite `:5173`
- `npm run dev:server` — `tsx watch server/index.ts` `:3847`

## Production build (app)

```bash
npm run build
```

Outputs:

- `dist/` — static SPA
- `dist-server/` — compiled API (if you run Node from `dist-server/index.js`)

Serve `dist/` behind nginx/Caddy and proxy `/api` to the Node process.

## Documentation site

```bash
cd docs
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
make html
make serve   # http://127.0.0.1:8765/
```

See {doc}`publish-docs-site`.
