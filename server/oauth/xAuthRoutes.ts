import type { Express, Request, Response } from "express";

import { randomOAuthState } from "./pkce.js";
import { createCodeVerifier, codeChallengeS256 } from "./pkce.js";
import { savePendingOAuth, takePendingOAuth } from "./pendingStore.js";
import { disconnectOAuthSession, exchangeAuthorizationCode } from "./tokenService.js";
import { writeOAuthTokensForSession } from "./tokenFile.js";
import {
  appendClearSessionCookie,
  appendSetSessionCookie,
  getVerifiedSessionIdFromRequest,
  newSessionId
} from "./sessionCookie.js";

const AUTH = "https://twitter.com/i/oauth2/authorize";
const DEFAULT_SCOPES = ["tweet.read", "users.read", "list.read", "offline.access"].join(" ");

function frontendBase(env: NodeJS.ProcessEnv): string {
  const u = env.FRONTEND_URL?.trim() || "http://localhost:5173";
  return u.replace(/\/+$/, "");
}

function redirectUri(env: NodeJS.ProcessEnv): string {
  const u = env.TWITTER_REDIRECT_URI?.trim();
  if (u) return u;
  const port = env.PORT || "3847";
  return `http://localhost:${port}/api/auth/x/callback`;
}

export function mountXOAuth(app: Express): void {
  app.get("/api/auth/x/login", (req: Request, res: Response) => {
    const clientId = process.env.TWITTER_CLIENT_ID?.trim();
    if (!clientId) {
      res.status(500).send("Missing TWITTER_CLIENT_ID in server .env");
      return;
    }

    const state = randomOAuthState();
    const verifier = createCodeVerifier();
    savePendingOAuth(state, verifier);

    const callback = redirectUri(process.env);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: callback,
      scope: DEFAULT_SCOPES,
      state,
      code_challenge: codeChallengeS256(verifier),
      code_challenge_method: "S256"
    });

    res.redirect(`${AUTH}?${params.toString()}`);
  });

  app.get("/api/auth/x/callback", async (req: Request, res: Response) => {
    const fb = frontendBase(process.env);
    const err = typeof req.query.error === "string" ? req.query.error : null;
    const desc =
      typeof req.query.error_description === "string" ? req.query.error_description : "";
    if (err) {
      res.redirect(`${fb}/?x_auth_error=${encodeURIComponent(err + (desc ? `: ${desc}` : ""))}`);
      return;
    }

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    if (!code || !state) {
      res.redirect(`${fb}/?x_auth_error=${encodeURIComponent("missing code or state")}`);
      return;
    }

    const verifier = takePendingOAuth(state);
    if (!verifier) {
      res.redirect(`${fb}/?x_auth_error=${encodeURIComponent("OAuth session expired — try Sign in again")}`);
      return;
    }

    const clientId = process.env.TWITTER_CLIENT_ID!.trim();
    const clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim() || null;
    const redirect = redirectUri(process.env);

    try {
      const tokens = await exchangeAuthorizationCode({
        code,
        codeVerifier: verifier,
        clientId,
        clientSecret,
        redirectUri: redirect
      });
      const sessionId = newSessionId();
      await writeOAuthTokensForSession(sessionId, tokens);
      appendSetSessionCookie(res, sessionId, process.env);

      res.redirect(`${fb}/?x_connected=1`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "token exchange failed";
      res.redirect(`${fb}/?x_auth_error=${encodeURIComponent(msg)}`);
    }
  });

  app.post("/api/auth/x/logout", async (req: Request, res: Response) => {
    const sid = getVerifiedSessionIdFromRequest(req, process.env);
    await disconnectOAuthSession(sid);
    appendClearSessionCookie(res, process.env);
    res.json({ ok: true });
  });
}
