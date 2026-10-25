# XGaming (reference)

**XGaming** is a **mock gaming hub** inside iFixedX (Quake-era ladder UI, server browser, XChat lobbies). It does not call live matchmaking APIs yet.

## Entry

| URL | |
|-----|---|
| `?page=xgaming` | Main page |
| `?xgtab=ladder` \| `servers` \| `xchat` | Sub-tab |
| `?xggame=<id>` | Selected game in stream-layout rail |

Reader: `readXGamingTabFromUrl()` in `src/XGamingPage.tsx`.

## Tabs

| Tab | Content |
|-----|---------|
| **Ladder** | Mock tournaments, BO3 brackets, skill rank badges |
| **Servers** | Ranked / unranked server lists (placeholder data) |
| **XChat** | Lobby list (classic: sub-tab; stream: column beside main) |

## Assets

Rank images: `public/xgaming/ranks/` (e.g. `Legend.jpg`, `Colonel.jpg`).

Served as `/xgaming/ranks/<filename>`.

## Layout integration

- **Classic:** XGaming uses standard center column
- **Stream:** Game picker in right area; lobbies column beside tab content (`ix-xgaming-stream-col`)

## Nav

Left nav **XGaming** item routes to `page=xgaming`. Not related to Pipetrix or timeline mixer.

## Related

- [UI shell](../explanation/ui-shell.md)
- [URL and routing](../explanation/url-and-routing.md)
