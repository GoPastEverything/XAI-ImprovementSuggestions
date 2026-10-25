import type { ComparePayload } from "./api/types";
import { canonicalSourceFromComparePayload, type CanonicalSourceType } from "./feedtrix/canonicalIngest";

/** When enabled (default after wipe), Home/Explore use only Live X + real Grok live-sessions — no seed/Grok-mixer canonical. */
export const REAL_DATA_ONLY_KEY = "ix_real_data_only";

/** Applied once after full wipe reload. */
export const AFTER_WIPE_URL_KEY = "ix_after_wipe_url";

export function isRealDataOnly(): boolean {
  if (typeof window === "undefined") return true;
  const v = sessionStorage.getItem(REAL_DATA_ONLY_KEY);
  if (v === null) {
    if (import.meta.env.VITE_LOCAL_SNAPSHOT === '1') return false;
    sessionStorage.setItem(REAL_DATA_ONLY_KEY, "1");
    return true;
  }
  return v !== "0";
}

export function setRealDataOnly(enabled: boolean): void {
  sessionStorage.setItem(REAL_DATA_ONLY_KEY, enabled ? "1" : "0");
}

export function enableRealDataOnlyAfterWipe(): void {
  sessionStorage.setItem(REAL_DATA_ONLY_KEY, "1");
  sessionStorage.setItem("ix_home_feed_mode", "live");
  sessionStorage.setItem(AFTER_WIPE_URL_KEY, "page=home&tab=top&home=live");
}

/** Run once on boot after wipe reload. */
export function applyAfterWipeUrlIfNeeded(): void {
  if (typeof window === "undefined") return;
  const qs = sessionStorage.getItem(AFTER_WIPE_URL_KEY);
  if (!qs) return;
  sessionStorage.removeItem(AFTER_WIPE_URL_KEY);
  const nu = new URL(window.location.href);
  for (const [k, v] of new URLSearchParams(qs)) {
    nu.searchParams.set(k, v);
  }
  nu.searchParams.delete("source");
  nu.searchParams.delete("q");
  window.history.replaceState({}, "", nu.toString());
}

export function canonicalSourceAllowsRealOnly(source: CanonicalSourceType | string): boolean {
  return source === "live_api" || source === "twitter_spider";
}

export function shouldIngestCanonicalFromPayload(p: ComparePayload): boolean {
  if (!isRealDataOnly()) return true;
  return canonicalSourceAllowsRealOnly(canonicalSourceFromComparePayload(p));
}
