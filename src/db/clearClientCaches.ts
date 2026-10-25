import { ENTERED_KEY } from "../XAuthLanding";

/** Grok live Spaces/Broadcasts snapshot (must match `App.tsx`). */
export const GROK_LIVE_SNAPSHOT_KEY = "ix_grok_live_snapshot_v1";

/** All sessionStorage keys iFixedX uses for feed / layout; cleared on full wipe. */
export const IFIXEDX_SESSION_CACHE_KEYS = [
  GROK_LIVE_SNAPSHOT_KEY,
  "ix_home_feed_mode",
  "ix_xai_live_search",
  "ix_layout_mode",
  "ix_include_seen_in_feed",
  "ix_posts_media_schema_v2",
  ENTERED_KEY
] as const;

/** localStorage keys used by the client (see also `feedtrixClock.ts`). */
export const IFIXEDX_LOCAL_CACHE_KEYS = [
  "thepipetrix_session_clock_v1",
  /** legacy name before Pipetrix rename */
  "thefeedtrix_session_clock_v1"
] as const;

/**
 * Removes browser session/local keys so a wipe truly resets mixer prefs, landing skip, and rail snapshots.
 * Safe to call before or after IndexedDB teardown.
 */
export function clearClientCaches(): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of IFIXEDX_SESSION_CACHE_KEYS) {
      sessionStorage.removeItem(k);
    }
  } catch {
    /* quota / private mode */
  }
  try {
    for (const k of IFIXEDX_LOCAL_CACHE_KEYS) {
      localStorage.removeItem(k);
    }
  } catch {
    /* quota / private mode */
  }
}
