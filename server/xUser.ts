import { getValidUserAccessToken } from "./oauth/tokenService.js";

const USERS_ME = "https://api.twitter.com/2/users/me";

type MePayload = {
  data?: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
  };
  errors?: { title?: string; detail?: string; status?: number }[];
};

function xErrDetail(body: MePayload): string {
  return (
    body.errors
      ?.map((e) => e.detail || e.title)
      .filter(Boolean)
      .join(" • ") ?? ""
  );
}

/** Resolves current user via OAuth user token, or throws with HTTP status + X error text. */
export async function fetchSignedInProfile(accessToken: string): Promise<{
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
}> {
  const u = new URL(USERS_ME);
  u.searchParams.set("user.fields", "name,username,profile_image_url");

  const res = await fetch(u.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "iFixedX/1.0"
    }
  });

  const text = await res.text();
  let body: MePayload;
  try {
    body = JSON.parse(text) as MePayload;
  } catch {
    throw new Error(
      `GET /2/users/me: invalid JSON (HTTP ${res.status}). Sign out and sign in again, or check X API status.`
    );
  }

  const fromX = xErrDetail(body);

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        `GET /2/users/me: 401 Unauthorized — access token expired or revoked. Use Sign out, then Sign in with X again.${fromX ? ` X: ${fromX}` : ""}`
      );
    }
    if (res.status === 402) {
      throw new Error(
        `GET /2/users/me: 402 Payment Required — your X API project tier may not allow this endpoint.${fromX ? ` X: ${fromX}` : ""} See https://developer.x.com/`
      );
    }
    if (res.status === 403) {
      throw new Error(
        `GET /2/users/me: 403 Forbidden.${fromX ? ` X: ${fromX}` : ""} Confirm the app has users.read and tweet.read for OAuth, then re-authorize.`
      );
    }
    throw new Error(
      `GET /2/users/me failed (HTTP ${res.status}).${fromX ? ` ${fromX}` : " Sign out and sign in again."}`
    );
  }

  if (!body.data?.id || !body.data?.username) {
    throw new Error(
      `GET /2/users/me returned no user.${fromX ? ` ${fromX}` : ""} Sign out and sign in again.`
    );
  }

  return body.data;
}

export async function getMeForApi(env: NodeJS.ProcessEnv, sessionId: string | null) {
  const token = await getValidUserAccessToken(env, sessionId);
  if (!token) return { connected: false as const };

  try {
    const profile = await fetchSignedInProfile(token);
    return {
      connected: true as const,
      tokenPresent: true as const,
      id: profile.id,
      name: profile.name,
      username: profile.username,
      profile_image_url: profile.profile_image_url,
      profileUrl: `https://x.com/${encodeURIComponent(profile.username)}`
    };
  } catch (e) {
    const profileFetchError = e instanceof Error ? e.message : String(e);
    return {
      connected: true as const,
      tokenPresent: true as const,
      profileFetchError
    };
  }
}
