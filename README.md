# XAI-ImprovementSuggestions

Independent interface and product experiments for X, built on iFixedX.

**TROTT — The Rest Of The Thread** adds persistent discussions, topics, and branching replies inside the existing X-style interface. **PULSE** is a separate ranking research experiment; it is not active in the app.

> **This demo ships with SAVED DATA, not a live X connection.** The included timeline is a static snapshot of 12 public posts with 18 saved images. It lets anyone run and review the interface without X API credentials. Counts are frozen at save time; truncated posts and unavailable videos remain marked in TROTT.
>
> **Before enabling an API integration:** use your coding assistant (`@bot`) or your own coding skills to review and adapt the saved-data loader and post format first. Keep credentials on the server. Follow the [beginner guide](docs/before-live-data.md) before switching to an authorized live source.

This project is not affiliated with X, xAI, or Reddit. It does not alter live X or provide access to the author's account.

## Run the demo

Install Node.js 22.12+ and Git. In this folder:

```powershell
npm ci
npm run dev
```

The first run creates a local `.env` from the credential-free example without overwriting an existing file. The bundled timeline works immediately.

- Home: http://127.0.0.1:5173/?page=home&home=seed
- TROTT: http://127.0.0.1:5173/?page=trott

Use **Branch into TROTT** on a saved post to begin a separate local discussion. Nothing you write is sent to X. Discussions are saved in `data/trott.json`, which is excluded from Git. Stop the servers with Ctrl+C. Windows users can also use `Start TROTT.cmd`.

## What is included

- The iFixedX shell, Home, Explore, layout modes, and ranking lab.
- TROTT topic browsing, search, source-post attribution, discussions, and nested replies.
- A sanitized, attributed saved timeline and locally served demo images.
- A reusable saved-page importer: `python tools/import_x_snapshot.py path/to/saved-page.zip`.
- An isolated PULSE contract test harness, with its upstream license and provenance.

Personal saved-page imports go under ignored `data/` and `public/local-snapshot/` directories and override the bundled example locally. Do not commit raw browser saves, cookies, account sessions, or personal snapshots.

## Verify changes

```powershell
npm run typecheck
npm test
npm run build
npm audit
```

Optional PULSE tests require Rust:

```powershell
cargo test --manifest-path pulse-lab/Cargo.toml
```

## Status and limitations

This is a single-user local prototype. It has no multiuser authentication, production discussion database, or completed moderation system. The original live-X features are optional experiments requiring your own authorized setup; consult [the data integration guide](docs/before-live-data.md) before using them. Legacy iFixedX documentation under `docs/` describes earlier behavior and may refer to the original hosting setup.

The PULSE estimator is experimental; its tests verify the coded contract, not real-world detection accuracy. It is not connected to TROTT ranking. The public X infrastructure as a whole is not included.

See [SECURITY.md](SECURITY.md) for publication exclusions and local security boundaries, and [NOTICE.md](NOTICE.md) for source and content attribution.
