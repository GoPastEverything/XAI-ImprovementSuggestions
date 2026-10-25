import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Project-root `data/` (gitignored token file lives here). */
export const DATA_DIR = path.resolve(here, "../../data");

/** @deprecated Legacy single global token store — do not use for API auth (insecure on shared servers). */
export const OAUTH_TOKEN_FILE = path.join(DATA_DIR, "oauth-tokens.json");

/** Per-browser OAuth sessions: `{sessionId}.json` (see session cookie `ix_session`). */
export const OAUTH_SESSIONS_DIR = path.join(DATA_DIR, "oauth-sessions");
