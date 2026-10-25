# Media and avatars

X CDN assets (`pbs.twimg.com`, `video.twimg.com`) often fail in the browser due to **hotlink rules**, **CORS**, or blockers. iFixedX uses a **client fallback chain** plus an optional **server proxy** and **avatar blob cache**.

## Image display (`TwimgImg`)

File: `src/TwimgMedia.tsx`, URL planning: `src/api/twimgProxy.ts`

**Try order:**

1. Direct TwIMG URL (often works in-browser)
2. `/api/cdn/twimg?u=…` on the API host

Never use `https://x.com/{handle}/photo` as an image `src` — that URL is an HTML profile page.

Profile URLs from the API are normalized in `src/avatarUrls.ts` and upscaled (`_normal` → `_400x400`) in `server/xApiV2.ts`.

## Video (`TwimgVideo`)

Same candidate chain as images; `className` often `ix-post-video` with max-height caps in CSS.

## TwIMG proxy (server)

`GET /api/cdn/twimg?u=<encoded HTTPS URL>`

- **Allowlist:** `pbs.twimg.com`, `abs.twimg.com`, `video.twimg.com` only (SSRF-safe)
- **Max size:** 15 MB
- **Headers:** Browser-like `Referer` / `Origin` for `x.com` (403 retry with fallback headers)

See [TwIMG proxy](../reference/twimg-proxy.md).

## Avatar blob cache

File: `src/db/avatarBlobCache.ts`

- IndexedDB: `ifixedx_avatar_blob_v1`
- On miss: fetch via TwIMG chain, store ~7 days, serve `blob:` URL in tab
- **`AvatarWithFallbacks`** also reads `accounts` collection for display name / URL

Wipe clears this DB with [Wipe local data](../how-to/wipe-local-data.md).

## Post media layout

Home **classic** timeline:

- Images: full width, `object-fit: contain`, max-height cap
- Multi-image posts: vertical stack (classic), not X’s 2×2 grid (yet)

Stream layout: thumb column with same contain rules.

## Account rollup

Each ingest updates `ifixedx_local.accounts` from post authors (`src/db/accountRollup.ts`) for faster avatar lookup.

## Related

- [X API](../reference/x-api.md) (expansions + `profile_image_url`)
- [UI shell](ui-shell.md)
