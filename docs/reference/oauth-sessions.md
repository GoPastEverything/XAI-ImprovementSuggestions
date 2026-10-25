# OAuth and sessions

Sign in with X uses **OAuth 2.0 PKCE** on the API server. Access tokens are **not** stored in browser `localStorage` — only an **httpOnly** session cookie.

## Flow

```text
Browser                    API server                 X
   |  GET /api/auth/x/login  |                        |
   |------------------------>|  redirect authorize    |
   |<------------------------|------------------------>|
   |  callback ?code=…       |  token exchange        |
   |------------------------>|  write oauth-sessions  |
   |  Set-Cookie ix_session  |                        |
   |<------------------------|  redirect FRONTEND_URL |
```

1. **`GET /api/auth/x/login`** — PKCE verifier + state, redirect to X authorize.
2. User approves on X.
3. **`GET /api/auth/x/callback`** — validate state, exchange code, store tokens, set cookie, redirect to `FRONTEND_URL`.
4. **`GET /api/me`** — profile / connection status for this cookie session.
5. **`POST /api/auth/x/logout`** — clear session file + cookie.

## Session cookie

| Property | Value |
|----------|--------|
| Name | `ix_session` |
| Format | `{session-id}.{hmac-signature}` |
| Flags | `httpOnly`, `secure` in production, `sameSite` from env (default Lax) |

Implementation: `server/oauth/sessionCookie.ts`

## Environment

| Variable | Purpose |
|----------|---------|
| `TWITTER_CLIENT_ID` | OAuth app client id |
| `TWITTER_CLIENT_SECRET` | Client secret (confidential clients) |
| `TWITTER_REDIRECT_URI` | Must match X developer portal exactly |
| `FRONTEND_URL` | Post-login redirect |
| `IFIXEDX_SESSION_SECRET` | HMAC signing — **required in production** |

Without `IFIXEDX_SESSION_SECRET` in production, sign-in **cannot complete**.

## Token storage

Per session file:

```text
data/oauth-sessions/<session-id>.json
```

Legacy `data/oauth-tokens.json` is **ignored** — delete if present.

Tokens are used server-side for:

- `GET /api/me`
- `GET /api/for-you` (following timeline, list, user tweets)
- `GET /api/compare` (user Recent Search)
- TwitterSpider / Feedtrix live hunts (optional session boost for user-context search)

## Client behavior

- `fetch(..., { credentials: "include" })` on API calls
- Account page: sign-in / sign-out
- Live Home timeline: requires valid session (or Bearer-only fallbacks where implemented)

## Production checklist

See [OAuth in production](../how-to/oauth-production.md).

## Related

- [Environment variables](environment.md)
- [API routes](api-routes.md)
