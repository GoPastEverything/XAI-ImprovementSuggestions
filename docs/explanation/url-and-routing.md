# URL and routing

The SPA syncs primary navigation state to **`window.location.search`** so links are shareable and the back button works.

## Page routing

| Param | Values | Effect |
|-------|--------|--------|
| `page` | `home`, `explore`, `account`, `ranking`, `spaces`, `broadcasts`, `xgaming` | Main shell |

Default when omitted: `home` (`parseAppPage` in `src/App.tsx`).

## Home / Explore tabs

| Param | Values |
|-------|--------|
| `tab` | `top`, `latest`, `media`, `people`, `lists` |

## Home refresh source

| Param | Values |
|-------|--------|
| `home` | `live`, `xai`, `seed` |

Synced with Timeline source dropdown + `sessionStorage` `ix_home_feed_mode`. **Prefer `home=live` for production testing.**

## Explore search

| Param | Values |
|-------|--------|
| `q` | Search query string |
| `source` | `mock` or `live` (Explore corpus) |

## Corpus time windows

| Param | Values |
|-------|--------|
| `tw_top`, `tw_latest`, `tw_media` | `day`, `week`, `month` (omit = all corpus) |
| `latest` | Legacy alias for `tw_latest` |

## XGaming

| Param | Values |
|-------|--------|
| `xgtab` | `ladder`, `servers`, `xchat` |
| `xggame` | Supported game id in stream rail |

## One-shot maintenance

| Param | Action |
|-------|--------|
| `wipe_local=1` | Confirm → wipe RxDB + caches → reload |
| `reset_seen=1` | Clear seen history (no full wipe) |

Param is removed from the URL after handling.

## OAuth return

After X OAuth, user lands on app origin with session cookie set; frontend URL from `FRONTEND_URL` in server `.env`.

## Examples

```text
https://liveandletdev.com/?page=home&tab=top&home=live
https://liveandletdev.com/?page=explore&q=ai&source=live&tab=top
https://liveandletdev.com/?page=ranking&home=live
https://liveandletdev.com/?page=xgaming&xgtab=ladder
https://docs.liveandletdev.com/
```

## Related

- [Switch timeline source](../how-to/switch-timeline-source.md)
- [UI shell](ui-shell.md)
