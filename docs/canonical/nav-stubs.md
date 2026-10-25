# Nav stubs (canonical)

Several left-nav items **match X’s chrome** but are **not wired** to routes yet. They render as disabled or no-op buttons so layout parity is preserved during feed/mixer work.

## Stub items (typical)

| Nav label | Status |
|-----------|--------|
| Notifications | Stub |
| Messages | Stub |
| Grok | Stub (Grok features live under Ranking / Spaces APIs, not this nav) |
| Premium | Stub |
| Bookmarks | Stub |
| Creator Studio | Stub |
| Articles | Stub |
| Profile | Stub |

## Routed items

| Nav label | `page` param |
|-----------|----------------|
| Home | `home` |
| Explore | `explore` |
| XGaming | `xgaming` |

Account and Ranking are reachable via **More** menu or direct URL (`?page=account`, `?page=ranking`).

## Implementation note

`goPage()` only updates URL for known `AppPage` values. Stubs should not call `goPage` until a feature module exists — prefer adding a new `page` value + section component under `src/features/` when implementing (see [Platform roadmap](../explanation/platform-roadmap.md) Phase 2).

## Related

- [UI shell](../explanation/ui-shell.md)
