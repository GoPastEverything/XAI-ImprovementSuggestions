import { getAccessTokenForLiveSearch } from "./corpus.js";
import { parseSpaceIdFromUrl } from "./liveSessionUrls.js";
import { applySpaceMetaToRow, fetchSpaceMetaByIds } from "./xSpaceMeta.js";
import type { XaiLiveSessionRow } from "./xaiLiveSessions.js";

/**
 * Ground Grok Space rows against GET /2/spaces when X credentials exist.
 * Enriches host @handle, title, live state, and listener counts.
 */
export async function validateSpaceRowsWithXApi(
  env: NodeJS.ProcessEnv,
  sessionId: string | null,
  rows: XaiLiveSessionRow[]
): Promise<{ rows: XaiLiveSessionRow[]; validated: boolean; note?: string }> {
  const spaceRows = rows.filter((r) => r.kind === "space");
  if (!spaceRows.length) return { rows, validated: false };

  let token: string;
  try {
    token = await getAccessTokenForLiveSearch(env, sessionId);
  } catch {
    return {
      rows,
      validated: false,
      note: "Spaces not validated (sign in with X or set TWITTER_BEARER_TOKEN)."
    };
  }

  const idByRow = new Map<string, XaiLiveSessionRow>();
  const ids: string[] = [];
  for (const row of spaceRows) {
    const sid = parseSpaceIdFromUrl(row.linkUrl);
    if (!sid) continue;
    idByRow.set(sid, row);
    if (!ids.includes(sid)) ids.push(sid);
  }
  if (!ids.length) return { rows, validated: false };

  let metaById: Map<string, import("./xSpaceMeta.js").XSpaceMeta>;
  try {
    metaById = await fetchSpaceMetaByIds(token, ids);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Spaces lookup failed";
    return { rows, validated: false, note: `Spaces validation skipped: ${msg}` };
  }

  if (metaById.size === 0) {
    return {
      rows,
      validated: false,
      note:
        "X API returned no matching Spaces (403 or tier limit). Showing Grok discovery only — links may still work on X."
    };
  }

  const liveIds = new Set<string>();
  const updated = new Map<string, XaiLiveSessionRow>();

  for (const [sid, meta] of metaById) {
    const row = idByRow.get(sid);
    if (!row) continue;
    if (meta.live) liveIds.add(sid);
    let enriched = applySpaceMetaToRow(row, meta);
    if (!meta.live) {
      enriched = { ...enriched, live: false, endedAgo: enriched.endedAgo ?? "recently" };
    }
    updated.set(sid, enriched);
  }

  const spaceOnly = rows.filter((r) => r.kind === "space");
  const other = rows.filter((r) => r.kind !== "space");

  const grounded: XaiLiveSessionRow[] = [];
  for (const row of spaceOnly) {
    const sid = parseSpaceIdFromUrl(row.linkUrl);
    if (!sid || !liveIds.has(sid)) continue;
    const u = updated.get(sid);
    if (u?.live) grounded.push(u);
  }

  const unvalidated = spaceOnly.filter((row) => {
    const sid = parseSpaceIdFromUrl(row.linkUrl);
    return sid && !metaById.has(sid);
  });

  return {
    rows: [...other, ...grounded, ...unvalidated],
    validated: true,
    note:
      metaById.size < ids.length
        ? `X API confirmed ${metaById.size}/${ids.length} Space(s); rest are Grok-only.`
        : undefined
  };
}
