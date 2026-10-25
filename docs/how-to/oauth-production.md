# OAuth in production

Checklist for **Sign in with X** on a public host (e.g. `liveandletdev.com`).

## X Developer Portal

1. Create or use an existing **OAuth 2.0** app with user context.
2. Set **Callback URL** exactly to your API callback:
   - `https://YOUR-API-HOST/api/auth/x/callback`
3. Enable scopes used by the app: `tweet.read`, `users.read`, `list.read`, `offline.access` (see `server/oauth/xAuthRoutes.ts`).
4. Copy **Client ID** and **Client Secret** into server `.env`.

## Server `.env`

```text
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
TWITTER_REDIRECT_URI=https://YOUR-API-HOST/api/auth/x/callback
FRONTEND_URL=https://liveandletdev.com
IFIXEDX_SESSION_SECRET=<long random string, e.g. openssl rand -hex 32>
NODE_ENV=production
```

**`IFIXEDX_SESSION_SECRET` is mandatory** in production — without it, callback cannot sign `ix_session`.

If UI and API are on different origins:

```text
IFIXEDX_COOKIE_SAMESITE=None
IFIXEDX_COOKIE_SECURE=1
VITE_PUBLIC_API_ORIGIN=https://YOUR-API-HOST
```

Rebuild the SPA after setting `VITE_PUBLIC_API_ORIGIN`.

## Reverse proxy

- TLS terminates at nginx/Caddy; `/api/` proxies to Node on port 3847.
- Cookie `secure` flag expects HTTPS.

## Verify

1. Open `https://liveandletdev.com/?page=account`
2. **Sign in with X** → approve on X → return to app
3. `GET /api/me` returns `connected: true`
4. Home → Timeline source **Live X API** → refresh works

## Common failures

| Symptom | Fix |
|---------|-----|
| Redirect mismatch | `TWITTER_REDIRECT_URI` must match portal character-for-character |
| Sign-in loops / no session | Set `IFIXEDX_SESSION_SECRET`; restart API |
| Live timeline empty | User revoked app or session expired — sign in again; check list/search fallbacks |
| Cookie not sent | Same-site or `SameSite=None` + `Secure` + `credentials: include` |

## Related

- [OAuth and sessions](../reference/oauth-sessions.md)
- [Environment variables](../reference/environment.md)
