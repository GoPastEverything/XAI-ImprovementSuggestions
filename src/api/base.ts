/** Set in `.env.production` (or CI) when the browser UI is on a different origin than the API. Omit for local dev → Vite proxies `/api` to port 3847. */
export function apiOrigin(): string {
  const raw = import.meta.env?.VITE_PUBLIC_API_ORIGIN;
  return typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
}

/** Relative `/api/...` when no origin set; absolute `https://api…/api/...` when set. */
export function apiUrl(path: string): string {
  const base = apiOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** Full URL for `fetch` / `URL` helpers (handles cross-origin API). */
export function apiUrlAbsolute(path: string): string {
  const u = apiUrl(path);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (typeof window === "undefined") return u;
  return `${window.location.origin}${u}`;
}
