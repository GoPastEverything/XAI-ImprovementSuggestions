import {
  deleteOAuthTokensForSession,
  readOAuthTokensForSession,
  writeOAuthTokensForSession,
  type StoredOAuthTokens
} from "./tokenFile.js";

const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";

function clientAuthHeader(clientId: string, clientSecret: string | undefined): string | undefined {
  if (!clientSecret?.trim()) return undefined;
  const raw = `${clientId.trim()}:${clientSecret.trim()}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

type TokenEndpointResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

function mapToStored(parsed: TokenEndpointResponse, prevRefresh?: string): StoredOAuthTokens {
  const expiresIn = parsed.expires_in ?? 7200;
  return {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token ?? prevRefresh,
    expires_at: Date.now() + Math.max(60, expiresIn - 120) * 1000,
    scope: parsed.scope,
    token_type: parsed.token_type
  };
}

async function parseTokenErrors(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: string; error_description?: string };
    return [j.error, j.error_description].filter(Boolean).join(" — ") || text.slice(0, 300);
  } catch {
    return text.slice(0, 300) || `HTTP ${res.status}`;
  }
}

export async function exchangeAuthorizationCode(opts: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
}): Promise<StoredOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
    client_id: opts.clientId
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "iFixedX/1.0"
  };

  const basic = clientAuthHeader(opts.clientId, opts.clientSecret ?? undefined);
  if (basic) headers.Authorization = basic;

  const res = await fetch(TOKEN_URL, { method: "POST", headers, body });
  if (!res.ok) throw new Error(await parseTokenErrors(res));

  const parsed = (await res.json()) as TokenEndpointResponse;
  return mapToStored(parsed);
}

export async function refreshUserAccessToken(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret?: string | null;
}): Promise<StoredOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "iFixedX/1.0"
  };

  const basic = clientAuthHeader(opts.clientId, opts.clientSecret ?? undefined);
  if (basic) headers.Authorization = basic;

  const res = await fetch(TOKEN_URL, { method: "POST", headers, body });
  if (!res.ok) throw new Error(await parseTokenErrors(res));

  const parsed = (await res.json()) as TokenEndpointResponse;
  return mapToStored(parsed, opts.refreshToken);
}

/**
 * Valid user access token for **this browser session** only (HttpOnly cookie → `data/oauth-sessions/{id}.json`).
 * Pass `sessionId` from `getVerifiedSessionIdFromRequest`. No global shared token file.
 */
export async function getValidUserAccessToken(
  env: NodeJS.ProcessEnv,
  sessionId: string | null | undefined
): Promise<string | null> {
  const sid = sessionId?.trim() || null;
  if (!sid) return null;

  const stored = await readOAuthTokensForSession(sid);
  if (!stored?.access_token) return null;

  const clientId = env.TWITTER_CLIENT_ID?.trim();
  const clientSecret = env.TWITTER_CLIENT_SECRET?.trim();

  const freshBefore = stored.expires_at - 120_000;
  if (Date.now() < freshBefore) return stored.access_token;

  if (!stored.refresh_token || !clientId) return null;

  try {
    const next = await refreshUserAccessToken({
      refreshToken: stored.refresh_token,
      clientId,
      clientSecret: clientSecret || null
    });
    await writeOAuthTokensForSession(sid, next);
    return next.access_token;
  } catch {
    return null;
  }
}

export async function disconnectOAuthSession(sessionId: string | null | undefined): Promise<void> {
  const sid = sessionId?.trim() || null;
  if (!sid) return;
  await deleteOAuthTokensForSession(sid);
}
