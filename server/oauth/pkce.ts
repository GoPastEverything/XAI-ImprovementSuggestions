import { createHash, randomBytes } from "node:crypto";

/** RFC 7636 PKCE verifier. */
export function createCodeVerifier(): string {
  const v = randomBytes(32).toString("base64url");
  if (v.length < 43) return createCodeVerifier();
  return v.slice(0, 128);
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function randomOAuthState(): string {
  return randomBytes(16).toString("hex");
}
