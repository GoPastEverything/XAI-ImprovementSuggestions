import type { ComparePayload } from "./types";
import { apiUrlAbsolute } from "./base";

export async function fetchCompare(payload: {
  q: string;
  source: "mock" | "live";
  recencyWeight: number;
  strictMatch: boolean;
  maxResults: number;
  omitRetweets: boolean;
}): Promise<ComparePayload> {
  const u = new URL(apiUrlAbsolute("/api/compare"));
  u.searchParams.set("q", payload.q);
  u.searchParams.set("source", payload.source);
  u.searchParams.set("recencyWeight", String(payload.recencyWeight));
  u.searchParams.set("strictMatch", payload.strictMatch ? "1" : "0");
  u.searchParams.set("maxResults", String(payload.maxResults));
  u.searchParams.set("omitRetweets", payload.omitRetweets ? "1" : "0");

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
