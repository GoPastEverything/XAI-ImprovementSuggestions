# Live & Spaces

iFixedX surfaces **X Spaces** and **Broadcasts** from **Feedtrix live pipes** on the API host, supplemented by Grok + X Recent Search discovery. This is separate from the main tweet timeline but uses the same visual language (tiles, facepile, links to X).

## Where it appears

| Surface | Behavior |
|---------|----------|
| **Home right rail** | Active rows from last `GET /api/xai/live-sessions` (up to 6) |
| **All Spaces** (`?page=spaces`) | Spaces directory — refresh kicks hunt when `refresh=1` |
| **All Broadcasts** (`?page=broadcasts`) | Broadcasts directory |
| **Preview modal** | Click tile → participants, title, **Join** / listen link |

Rail copy may note that directory pages refresh the pipe; Home uses the latest API response.

## API

### `GET /api/xai/live-sessions`

Query params:

| Param | Purpose |
|-------|---------|
| `nSpaces`, `nBroadcasts` | List sizes (up to 100) |
| `live=1` / `live=0` | Hint for Grok hunt (server-side) |
| `refresh=1` | Kick background Feedtrix live **hunt** without blocking response |

Response: `spaces[]`, `broadcasts[]`, `fromFeedtrixPipe: true`, `pipeStats`, scheduler hints, optional `warning`.

Rows are built from **validated active** pipe records first (`server/feedtrixLiveScheduler.ts` → `buildLiveSessionsFromFeedtrixPipes`).

### `GET /api/x/live-session-detail`

| Param | Purpose |
|-------|---------|
| `kind` | `space` or `broadcast` |
| `linkUrl` | X URL for the session |
| `title`, `handle`, `listeners`, `live` | UI fallbacks when API lookup is thin |

Used by `src/live/LiveSessionPreviewModal.tsx`.

## FeedtrixSpaces / FeedtrixBroadcasts pipes

Persistent queues on the API host (not ephemeral Grok-only cache):

| Pipe | File |
|------|------|
| **FeedtrixSpaces** | `data/feedtrix-spaces-pipe.json` |
| **FeedtrixBroadcasts** | `data/feedtrix-broadcasts-pipe.json` |

Key fields: `isActive`, `lastActiveCheck`, `lastSeenAt`, `linkUrl`, `discoverySource` (`x_api` | `xai_hunt`), host/title metadata.

### Scheduler loop

1. **Hunt** (~5 min) — **two equitable sources** (no per-user handle boost):
   - **X Recent Search** — rotating queries for broadcast/space URLs.
   - **Grok + x_search** — rotating Heavy-style prompts (`server/xaiLiveSessionsDiscovery.ts`).
2. **Validate** (~90 s) — Spaces via `GET /2/spaces` when allowed; broadcasts via URL probe; enrich host/title from X API when possible.
3. **Serve** — UI reads active rows; ended sessions age out per TTL.

Disable: `FEEDTRIX_LIVE_SCHEDULER=0` or `XAI_LIVE_SESSIONS_SCHEDULER=0`.

Requires `XAI_API_KEY` for Grok hunt passes; Bearer/OAuth for X API legs.

## Dedupe & display quality

- **Dedupe key:** `liveSessionPlatformKey` (space/broadcast id + kind) — not tweet ids.
- Weak rows (`@unknown`, generic “Live on X”) are filtered or enriched on validate.
- **Display meta:** `liveSessionDisplayMeta` normalizes titles/handles for tiles.

## Client persistence

Optional **`sessionStorage`** `ix_grok_live_snapshot_v1` for rail rehydrate between visits; authoritative list comes from API/pipes on refresh.

## Row model

Each row includes title, listener count, live vs ended, facepile avatars, `linkUrl`, and stable platform key for seen-state. See [Seen items](../canonical/seen-items.md).

## Configuration

See [Environment variables](../reference/environment.md) — `FEEDTRIX_LIVE_*`, `XAI_LIVE_SESSIONS_*`.

## Related

- [Grok / xAI](../reference/grok-xai.md)
- [UI shell](ui-shell.md)
- [Dedupe contract](../canonical/dedupe-contract.md)
