import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

import { DATA_DIR, OAUTH_SESSIONS_DIR, OAUTH_TOKEN_FILE } from "./paths.js";

export type StoredOAuthTokens = {
  access_token: string;
  refresh_token?: string;
  /** Epoch ms when access_token should be refreshed */
  expires_at: number;
  scope?: string;
  token_type?: string;
};

export function safeSessionId(candidate: string | null | undefined): string | null {
  if (!candidate || typeof candidate !== "string") return null;
  if (!/^[a-f0-9]{64}$/.test(candidate)) return null;
  return candidate;
}

function sessionTokenPath(sessionId: string): string {
  const s = safeSessionId(sessionId);
  if (!s) throw new Error("Invalid OAuth session id");
  const target = path.join(OAUTH_SESSIONS_DIR, `${s}.json`);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(OAUTH_SESSIONS_DIR) + path.sep)) {
    throw new Error("Invalid session path");
  }
  return target;
}

export async function readOAuthTokensForSession(sessionId: string): Promise<StoredOAuthTokens | null> {
  try {
    const p = sessionTokenPath(sessionId);
    const raw = await readFile(p, "utf8");
    const j = JSON.parse(raw) as StoredOAuthTokens;
    if (!j?.access_token) return null;
    return j;
  } catch {
    return null;
  }
}

export async function writeOAuthTokensForSession(
  sessionId: string,
  tokens: StoredOAuthTokens
): Promise<void> {
  await mkdir(OAUTH_SESSIONS_DIR, { recursive: true });
  const p = sessionTokenPath(sessionId);
  await writeFile(p, JSON.stringify(tokens, null, 2), "utf8");
}

export async function deleteOAuthTokensForSession(sessionId: string): Promise<void> {
  try {
    const s = safeSessionId(sessionId);
    if (!s) return;
    await unlink(path.join(OAUTH_SESSIONS_DIR, `${s}.json`));
  } catch {
    /* no file */
  }
}

/** True if any `data/oauth-sessions/*.json` exists (server has at least one stored OAuth session). */
export function oauthSessionFilesProbablyPresent(): boolean {
  try {
    if (!existsSync(OAUTH_SESSIONS_DIR)) return false;
    return readdirSync(OAUTH_SESSIONS_DIR).some((f) => f.endsWith(".json"));
  } catch {
    return false;
  }
}

/** Legacy global `oauth-tokens.json` (pre–per-session cookies). Harmless if unused; remove to avoid confusion. */
export function oauthLegacyGlobalFilePresent(): boolean {
  try {
    if (!existsSync(OAUTH_TOKEN_FILE)) return false;
    const raw = readFileSync(OAUTH_TOKEN_FILE, "utf8");
    const j = JSON.parse(raw) as StoredOAuthTokens;
    return Boolean(j?.access_token);
  } catch {
    return false;
  }
}

/**
 * @deprecated Token availability is per session cookie; health/live hints use bearer + session dir + legacy file.
 */
export function oauthTokensProbablyPresent(): boolean {
  return oauthSessionFilesProbablyPresent() || oauthLegacyGlobalFilePresent();
}

/** Guard against path tricks if ever derived from input (not currently). */
export function isUnderData(file: string): boolean {
  const resolved = path.resolve(file);
  return resolved.startsWith(path.resolve(DATA_DIR));
}
