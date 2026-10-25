# TwIMG proxy

**Route:** `GET /api/cdn/twimg?u=<url-encoded HTTPS URL>`

**File:** `server/twimgProxy.ts`

## Purpose

Fetch X/Twitter static media server-side when the browser cannot load TwIMG directly (403, missing Referer, extension blocking).

## Security

| Rule | Detail |
|------|--------|
| Host allowlist | `pbs.twimg.com`, `abs.twimg.com`, `video.twimg.com` only |
| Scheme | HTTPS only |
| Size cap | 15 MB response body |
| No open proxy | Arbitrary URLs rejected with `400` |

## Upstream fetch

Uses browser-like headers:

- `Referer: https://x.com/`, `Origin: https://x.com`
- Chrome `User-Agent`
- On 403/401/503: retry with simpler `Referer: https://twitter.com/`

## Client usage

`src/api/twimgProxy.ts` builds:

```text
/api/cdn/twimg?u=<encodeURIComponent(originalTwimgUrl)>
```

`TwimgImg` / `TwimgVideo` try direct URL first, then proxy URL.

## Caching

Responses may set cache headers suitable for CDN reuse (see handler in `twimgProxy.ts`). Avatar blob cache is separate — [Media and avatars](../explanation/media-and-avatars.md).

## Related

- [API routes](api-routes.md)
