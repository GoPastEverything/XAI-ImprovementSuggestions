# UI shell (web)

iFixedX mimics the **X (Twitter) desktop shell**: left nav, center feed, right widgets. This page maps **routes**, **layouts**, and **components** in the shipped SPA.

## App layout modes

| Mode | CSS root | When |
|------|----------|------|
| **Classic** | `ix-app--classic` | Default — 275px nav / 720px feed / 350px right rail |
| **Stream** | `ix-app--stream` | Wide center column + thumb-friendly post rows |

Toggle: **More → Classic X layout** / **Stream layout (Explore)**. Persisted in `sessionStorage` (`ix_layout_mode`).

## Pages (`?page=`)

| `page` | Purpose | Right rail |
|--------|---------|------------|
| `home` | For You feed (Top / Latest / Media / People / Lists) | Live & Spaces + Who to follow |
| `explore` | Search + ranked results | Ranking lab widgets |
| `ranking` | Sliders, refresh source, wipe | “Using this page” |
| `account` | Sign in / sign out | — |
| `spaces` | Spaces directory (tiles) | — |
| `broadcasts` | Broadcasts directory | — |
| `xgaming` | LAN-era gaming mock | Game picker (stream layout) |

Entry before first visit: **XAuthLanding** (`sessionStorage` `ifixedx_app_entered`).

Implementation: `src/App.tsx`, routing via `goPage()` + `popstate`.

## Home feed tabs (`?tab=`)

| Tab | Feed behavior |
|-----|----------------|
| `top` | Ranked list — **Default (engagement-style)** or **iFixedX rank** |
| `latest` | Newest first (platform corpus, time-filtered) |
| `media` | Posts with images or video |
| `people` | Unique authors derived from current corpus |
| `lists` | Placeholder — layout only |

**Time scope** (Top / Latest / Media): click active tab again → menu for past 24h / 7d / 30d / all corpus (`tw_top`, `tw_latest`, `tw_media` URL params).

## Tweet presentation

| Variant | Used on Home today | Notes |
|---------|-------------------|--------|
| `classic` | Yes | Single-column row, full-width media |
| `stream` | Optional layout mode | Thumb + text column |
| `tile` | Spaces/Broadcasts masonry | Not Home main tabs |

**Focus modal:** click a post (non-link targets) → full post in dialog.

**Live session preview:** click Space/Broadcast tile → modal with detail API + join link.

## Transmission badges

| Badge | Meaning |
|-------|---------|
| **TX** | Original post |
| **RTX** | Repost |
| **QTX** | Quote |

See [Transmission badges](../canonical/transmission-badges.md).

## Left nav

| Item | Status |
|------|--------|
| Home, Explore, XGaming | Routed pages |
| Notifications, Messages, Grok, Premium, Bookmarks, Creator Studio, Articles, Profile | **Stubs** — [Nav stubs](../canonical/nav-stubs.md) |

## More menu (⋯)

| Item | Action |
|------|--------|
| Account | `?page=account` |
| Ranking lab | `?page=ranking` |
| Category settings… | Pipetrix topic modal |
| Topic checkboxes | Enable/disable background Grok topics |
| **Run TwitterSpider now** | Server hunt + Pipetrix ingest |
| Classic / Stream layout | Toggle `ix_layout_mode` |

## Right rail (Home)

- **Live & Spaces** — from `GET /api/xai/live-sessions`
- **Who to follow** — derived from current feed authors

## Related

- [URL and routing](url-and-routing.md)
- [Web and mobile](web-and-mobile.md)
- [Mixer pipeline](mixer-pipeline.md)
- [TwitterSpider](twitter-spider.md)
