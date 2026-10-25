import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const SESSION_COOKIE_NAME = "ix_session";
// Per-process development secret. Never ship a shared, predictable signing key.
const developmentSessionSecret = randomBytes(32).toString('hex');

/** Secret used to verify incoming session cookies. In production without IFIXEDX_SESSION_SECRET, verification fails (no user sessions). */
export function getSessionSecretForVerification(env: NodeJS.ProcessEnv): string {
  const s = env.IFIXEDX_SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  if (env.NODE_ENV === "production") {
    return "";
  }
  return developmentSessionSecret;
}

/** Secret used when issuing a new session cookie. Never weak in production. */
export function getSessionSecretForSigning(env: NodeJS.ProcessEnv): string {
  const s = env.IFIXEDX_SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  if (env.NODE_ENV === "production") {
    throw new Error(
      "IFIXEDX_SESSION_SECRET is required to complete Sign in with X in production (add a long random string to server .env)."
    );
  }
  return developmentSessionSecret;
}

export function newSessionId(): string {
  return randomBytes(32).toString("hex");
}

function signSessionId(secret: string, sessionId: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}

export function packSessionCookieValue(env: NodeJS.ProcessEnv, sessionId: string): string {
  const secret = getSessionSecretForSigning(env);
  const sig = signSessionId(secret, sessionId);
  return `${sessionId}.${sig}`;
}

/** Verify signed cookie and return raw session id, or null. */
export function unpackSessionCookieValue(env: NodeJS.ProcessEnv, raw: string | undefined): string | null {
  if (!raw?.includes(".")) return null;
  const lastDot = raw.lastIndexOf(".");
  const sessionId = raw.slice(0, lastDot);
  const sig = raw.slice(lastDot + 1);
  if (!/^[a-f0-9]{64}$/.test(sessionId) || !sig) return null;
  const secret = getSessionSecretForVerification(env);
  if (!secret) return null;
  let expected: string;
  try {
    expected = signSessionId(secret, sessionId);
  } catch {
    return null;
  }
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return sessionId;
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    let v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      v = decodeURIComponent(v);
    } catch {
      /* use raw */
    }
    out[k] = v;
  }
  return out;
}

export function getVerifiedSessionIdFromRequest(req: Request, env: NodeJS.ProcessEnv): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE_NAME];
  return unpackSessionCookieValue(env, raw);
}

function cookieSecureFlag(env: NodeJS.ProcessEnv): boolean {
  if (env.IFIXEDX_COOKIE_SECURE === "1" || env.IFIXEDX_COOKIE_SECURE === "true") return true;
  return env.NODE_ENV === "production";
}

/** SameSite=Lax is correct for same-site UI+API; use IFIXEDX_COOKIE_SAMESITE=None + Secure only if UI and API are on different sites. */
function sameSiteAttr(env: NodeJS.ProcessEnv): string {
  const raw = env.IFIXEDX_COOKIE_SAMESITE?.trim().toLowerCase();
  if (raw === "none") return "SameSite=None";
  if (raw === "strict") return "SameSite=Strict";
  return "SameSite=Lax";
}

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export function appendSetSessionCookie(res: Response, sessionId: string, env: NodeJS.ProcessEnv): void {
  const val = packSessionCookieValue(env, sessionId);
  const secure = cookieSecureFlag(env);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(val)}`,
    "Path=/",
    "HttpOnly",
    sameSiteAttr(env),
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
    ...(secure ? ["Secure"] : [])
  ];
  res.append("Set-Cookie", parts.join("; "));
}

export function appendClearSessionCookie(res: Response, env: NodeJS.ProcessEnv): void {
  const secure = cookieSecureFlag(env);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    sameSiteAttr(env),
    "Max-Age=0",
    ...(secure ? ["Secure"] : [])
  ];
  res.append("Set-Cookie", parts.join("; "));
}
