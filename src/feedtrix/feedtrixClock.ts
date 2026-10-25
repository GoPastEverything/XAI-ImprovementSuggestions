/**
 * Pipetrix “session clock” (legacy label: Feedtrix) — persisted anchors so ranking/search can compare against a stable
 * calendar day (local + UTC) without trusting only wall-clock at ingest time.
 *
 * Stored in localStorage (browser) so existing RxDB installs need no migration. Pair with
 * tweet `createdAt` for post age; call `touchFeedtrixSessionClock()` after app entry.
 */

/** Persisted session calendar anchor for relative ages (“today”, etc.). */
const STORAGE_KEY = "thepipetrix_session_clock_v1";

export type FeedtrixSessionClock = {
  /** Local calendar YYYY-MM-DD when last touched */
  localCalendarDate: string;
  /** UTC calendar YYYY-MM-DD when last touched */
  utcCalendarDate: string;
  /** `Date.now()` when last touched */
  updatedAtMs: number;
  /** `new Date().getTimezoneOffset()` snapshot */
  tzOffsetMinutes: number;
};

function isoDateInTimeZone(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Fresh anchor from the client clock (always call for live age deltas). */
export function computeFeedtrixClockNow(): FeedtrixSessionClock {
  const now = new Date();
  return {
    localCalendarDate: isoDateInTimeZone(now, Intl.DateTimeFormat().resolvedOptions().timeZone),
    utcCalendarDate: now.toISOString().slice(0, 10),
    updatedAtMs: now.getTime(),
    tzOffsetMinutes: now.getTimezoneOffset()
  };
}

export function readFeedtrixSessionClock(): FeedtrixSessionClock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<FeedtrixSessionClock>;
    if (
      typeof p.localCalendarDate === "string" &&
      typeof p.utcCalendarDate === "string" &&
      typeof p.updatedAtMs === "number"
    ) {
      return {
        localCalendarDate: p.localCalendarDate,
        utcCalendarDate: p.utcCalendarDate,
        updatedAtMs: p.updatedAtMs,
        tzOffsetMinutes: typeof p.tzOffsetMinutes === "number" ? p.tzOffsetMinutes : 0
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist latest calendar anchors (throttled by caller if needed). */
export function touchFeedtrixSessionClock(): FeedtrixSessionClock {
  const snap = computeFeedtrixClockNow();
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      /* quota / private mode */
    }
  }
  return snap;
}

/** Calendar-day difference in the user’s local timezone: post date vs “today”. */
export function calendarDaysAgoLocal(iso: string, clock?: FeedtrixSessionClock | null): number | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const today =
      clock?.localCalendarDate ?? computeFeedtrixClockNow().localCalendarDate;
    const postDay = isoDateInTimeZone(d, Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [ty, tm, td] = today.split("-").map(Number);
    const [py, pm, pd] = postDay.split("-").map(Number);
    const t0 = Date.UTC(ty, tm - 1, td);
    const t1 = Date.UTC(py, pm - 1, pd);
    return Math.round((t0 - t1) / 86400000);
  } catch {
    return null;
  }
}

/** User-facing short age (timeline tiles): uses Feedtrix session calendar for “today” / “yesterday”. */
export function formatRelativeTweetAge(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (Number.isNaN(d.getTime())) return iso;
    const diffMs = now.getTime() - d.getTime();
    const daysAgo = calendarDaysAgoLocal(iso, readFeedtrixSessionClock());
    if (daysAgo === 0) {
      const hours = Math.floor(diffMs / 36e5);
      if (hours < 1) return "<1h";
      return `${hours}h`;
    }
    if (daysAgo === 1) return "Yesterday";
    if (daysAgo != null && daysAgo > 1 && daysAgo < 7) return `${daysAgo}d`;
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
  } catch {
    return iso;
  }
}
