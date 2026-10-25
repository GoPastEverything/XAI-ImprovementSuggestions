import type { Express, Request, Response } from "express";

/** SSRF-safe allowlist — X/Twitter static asset hosts used by seed + API corpora. */
const ALLOWED_HOSTS = new Set(["pbs.twimg.com", "abs.twimg.com", "video.twimg.com"]);

const MAX_BYTES = 15 * 1024 * 1024;

const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Headers that often satisfy TwIMG hotlink checks when server-side fetching. */
const UPSTREAM_HEADERS_PRIMARY: Record<string, string> = {
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://x.com/",
  Origin: "https://x.com",
  "User-Agent": UA_CHROME,
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site"
};

const UPSTREAM_HEADERS_FALLBACK: Record<string, string> = {
  Accept: "image/*,video/*,*/*;q=0.8",
  Referer: "https://twitter.com/",
  "User-Agent": UA_CHROME
};

async function fetchTwimg(url: string): Promise<globalThis.Response> {
  let res = await fetch(url, { redirect: "follow", headers: UPSTREAM_HEADERS_PRIMARY });
  if (res.ok) return res;
  // Many CDN edges return 403 to “CLI” requests; a simpler header set sometimes succeeds.
  if (res.status === 403 || res.status === 401 || res.status === 503) {
    res = await fetch(url, { redirect: "follow", headers: UPSTREAM_HEADERS_FALLBACK });
  }
  return res;
}

/**
 * Browser-facing TwIMG proxy so profile pics + media render when CDN blocks embeds (Referer / tracker blocking).
 * GET /api/cdn/twimg?u=https%3A%2F%2Fpbs.twimg.com%2F...
 */
export function mountTwimgProxy(app: Express): void {
  app.get("/api/cdn/twimg", async (req: Request, res: Response) => {
    const raw = typeof req.query.u === "string" ? req.query.u.trim() : "";
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      res.status(400).json({ error: "bad_url" });
      return;
    }

    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
      res.status(400).json({ error: "host_not_allowed" });
      return;
    }

    try {
      const upstream = await fetchTwimg(target.toString());

      if (!upstream.ok) {
        res.status(502).json({ error: "upstream_http", status: upstream.status });
        return;
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > MAX_BYTES) {
        res.status(413).json({ error: "too_large" });
        return;
      }

      const ct = upstream.headers.get("content-type") ?? "application/octet-stream";
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", upstream.headers.get("cache-control") ?? "public, max-age=86400");
      res.send(buf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "proxy_failed";
      res.status(500).json({ error: msg });
    }
  });
}
