import { isRealDataOnly } from "./realDataOnly";

export type HomeFeedMode = "seed" | "live" | "xai";

export const HOME_FEED_MODE_OPTIONS: { value: HomeFeedMode; label: string }[] = [
  { value: "live", label: "Live X API (sign-in) — recommended" },
  { value: "xai", label: "Grok-generated timeline (xAI)" },
  { value: "seed", label: "Saved X snapshot (offline)" }
];

export function homeFeedModeOptionsForUi(): typeof HOME_FEED_MODE_OPTIONS {
  if (!isRealDataOnly() || import.meta.env.VITE_LOCAL_SNAPSHOT === '1') return HOME_FEED_MODE_OPTIONS;
  return HOME_FEED_MODE_OPTIONS.filter((o) => o.value === "live");
}

export function parseHomeFeedModeFromUrl(sp: URLSearchParams): HomeFeedMode | null {
  const h = sp.get("home");
  if (h === "live" || h === "seed" || h === "xai") return h;
  return null;
}

export function readHomeFeedModeInitial(): HomeFeedMode {
  if (typeof window === "undefined") return "live";
  if (import.meta.env.VITE_LOCAL_SNAPSHOT === '1') {
    return parseHomeFeedModeFromUrl(new URLSearchParams(window.location.search)) || 'seed';
  }
  if (isRealDataOnly()) return "live";
  const fromUrl = parseHomeFeedModeFromUrl(new URLSearchParams(window.location.search));
  if (fromUrl) return fromUrl;
  const v = sessionStorage.getItem("ix_home_feed_mode");
  if (v === "live" || v === "seed" || v === "xai") return v;
  return "live";
}

export function persistHomeFeedMode(mode: HomeFeedMode, syncUrl: boolean): void {
  sessionStorage.setItem("ix_home_feed_mode", mode);
  if (!syncUrl || typeof window === "undefined") return;
  const nu = new URL(window.location.href);
  nu.searchParams.set("home", mode);
  window.history.replaceState({}, "", nu.toString());
}

export type HomeFeedModeHelpProps = {
  mode: HomeFeedMode;
  xaiHomeBatch: number;
  xaiLiveSearch: boolean;
  onXaiLiveSearchChange: (v: boolean) => void;
};

export function HomeFeedSourceHelp({
  mode,
  xaiHomeBatch,
  xaiLiveSearch,
  onXaiLiveSearchChange
}: HomeFeedModeHelpProps) {
  if (mode === "seed") {
    return (
      <p className="ix-muted ix-fineprint" style={{ marginTop: 0 }}>
        Posts and images from your saved X page. This is a local snapshot, not a live feed. No X sign-in or API credentials required.
      </p>
    );
  }
  if (mode === "live") {
    return (
      <p className="ix-muted ix-fineprint" style={{ marginTop: 0 }}>
        Primary path: following timeline → your posts → optional List (<code>IFIXEDX_HOME_LIST_ID</code>) → Recent Search
        fallback. Persists to <code>ifixedx_local.posts</code> and rehydrates on Home open. With <code>XAI_API_KEY</code>,{" "}
        <strong>The Pipetrix</strong> fills interest topics in the background; unseen canonical posts remix ahead of this live
        layer.
      </p>
    );
  }
  return (
    <>
      <p className="ix-muted ix-fineprint" style={{ marginTop: 0 }}>
        Refresh pulls ~<strong>{xaiHomeBatch}</strong> Grok posts into the live mixer layer (needs <code>XAI_API_KEY</code>).
        Same store as Live: <code>posts</code> + Pipetrix canonical. For production-style testing, prefer{" "}
        <strong>Live X API</strong> and let Pipetrix run in the background.
      </p>
      <label className="ix-check">
        <input
          type="checkbox"
          checked={xaiLiveSearch}
          onChange={(e) => onXaiLiveSearchChange(e.target.checked)}
        />
        <span>Prefer xAI live search (when supported)</span>
      </label>
    </>
  );
}

type SelectProps = {
  id?: string;
  className?: string;
  value: HomeFeedMode;
  onChange: (mode: HomeFeedMode) => void;
  syncUrl?: boolean;
  xaiConfigured: boolean | null;
  ariaLabel?: string;
};

export function HomeFeedSourceSelect({
  id,
  className = "ix-latest-select",
  value,
  onChange,
  syncUrl = false,
  xaiConfigured,
  ariaLabel = "For You timeline source: Live X, Grok, or offline seed"
}: SelectProps) {
  return (
    <select
      id={id}
      className={className}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== "live" && v !== "seed" && v !== "xai") return;
        onChange(v);
        persistHomeFeedMode(v, syncUrl);
      }}
    >
      {homeFeedModeOptionsForUi().map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.value === "xai" && xaiConfigured === false}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
