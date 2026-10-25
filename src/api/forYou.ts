import type { ComparePayload } from "./types";
import { apiUrlAbsolute } from "./base";

export async function fetchForYou(payload: {
  recencyWeight: number;
  strictMatch: boolean;
  maxResults: number;
  /** Offline curated corpus (same seed as Explore → Mock) */
  mock?: boolean;
  /** xAI Grok-generated timeline (needs XAI_API_KEY on server) */
  xai?: boolean;
  /** Prefer xAI live search when supported */
  xaiLive?: boolean;
  /** Load next page of following timeline (Live X). */
  paginationToken?: string;
}): Promise<ComparePayload> {
  const u = new URL(apiUrlAbsolute("/api/for-you"));
  u.searchParams.set("recencyWeight", String(payload.recencyWeight));
  u.searchParams.set("strictMatch", payload.strictMatch ? "1" : "0");
  u.searchParams.set("maxResults", String(payload.maxResults));
  if (payload.mock) u.searchParams.set("mock", "1");
  if (payload.xai) u.searchParams.set("xai", "1");
  if (payload.xaiLive) u.searchParams.set("xaiLive", "1");
  if (payload.paginationToken?.trim()) {
    u.searchParams.set("paginationToken", payload.paginationToken.trim());
  }

  const res = await fetch(u.toString(), { credentials: "include" });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  const obj = parsed as { error?: string };

  if (!res.ok) {
    const msg =
      typeof obj.error === "string" && obj.error.length
        ? obj.error
        : text.trim().slice(0, 280) || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return parsed as ComparePayload;
}
