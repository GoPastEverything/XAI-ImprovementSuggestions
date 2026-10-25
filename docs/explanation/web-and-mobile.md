# Web and mobile platform

## Web (primary)

iFixedX is a **Vite + React** SPA:

- **Classic layout** — X-like three columns (nav / feed / widgets).
- **Stream layout** — wide center feed with thumb column (Explore-style).
- **Home feed** — single-column `TweetCard` classic rows; full-width media with natural aspect ratio.

### Responsive behavior

- Narrow viewports collapse rails.
- Stream layout uses `minmax(0, 1fr)` center column to avoid horizontal overflow.
- Media uses `object-fit: contain` with max-height caps (portrait-safe).

## Mobile web

Same bundle; no separate native shell in this repo.

| Concern | Approach |
|---------|----------|
| Touch | Standard links/buttons; focus modal for post detail |
| Performance | Windowed feed render (`FEED_RENDER_BATCH`) + lazy images |
| Storage | RxDB on device; wipe flow for reset |
| OAuth | Browser redirect to API; session cookie |

Future native apps would reuse **API + canonical contracts** documented under {doc}`/canonical/index`.

## PWA

Not required for v1 docs; deploy as HTTPS SPA. Add manifest/service worker later if offline shell is needed.

## TwIMG / avatars

`TwimgImg` / avatar blob cache — see `src/TwimgMedia.tsx`, `src/db/avatarBlobCache.ts`. Direct TwIMG first, `/api/cdn/twimg` fallback.
