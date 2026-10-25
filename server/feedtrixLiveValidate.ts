import { getAccessTokenForLiveSearch } from "./corpus.js";
import {
  ingestHuntIntoFeedtrixPipe,
  listRecordsNeedingCheck,
  updateFeedtrixLiveRecord
} from "./feedtrixLivePipe.js";
import type { FeedtrixLiveRecord } from "./feedtrixLiveTypes.js";
import { preferLiveAuthor, preferLiveHandle, preferLiveTitle } from "./liveSessionQuality.js";
import { parseSpaceIdFromUrl } from "./liveSessionUrls.js";
import { fetchSpaceMetaByIds } from "./xSpaceMeta.js";
import type { XaiLiveSessionRow } from "./xaiLiveSessions.js";

const UA = "iFixedX/1.0 (Feedtrix live validate)";

async function probeUrlLive(url: string): Promise<{ ok: boolean; note?: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(12_000)
    });
    if (res.status === 404 || res.status === 410) {
      return { ok: false, note: `HTTP ${res.status}` };
    }
    if (!res.ok) {
      return { ok: false, note: `HTTP ${res.status}` };
    }
    const text = (await res.text()).slice(0, 8000).toLowerCase();
    if (text.includes("this page doesn't exist") || text.includes("does not exist")) {
      return { ok: false, note: "x.com 404 page" };
    }
    if (text.includes("broadcast has ended") || text.includes("space has ended")) {
      return { ok: false, note: "ended marker" };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "probe failed";
    return { ok: false, note: msg };
  }
}

async function validateSpaceRecords(
  env: NodeJS.ProcessEnv,
  sessionId: string | null,
  records: FeedtrixLiveRecord[]
): Promise<number> {
  if (!records.length) return 0;
  const now = Date.now();
  let checked = 0;

  let token: string | null = null;
  try {
    token = await getAccessTokenForLiveSearch(env, sessionId);
  } catch {
    token = null;
  }

  const ids = [
    ...new Set(
      records.map((r) => parseSpaceIdFromUrl(r.linkUrl)).filter((id): id is string => Boolean(id))
    )
  ];
  let metaById = new Map<string, import("./xSpaceMeta.js").XSpaceMeta>();
  if (token && ids.length) {
    try {
      metaById = await fetchSpaceMetaByIds(token, ids);
    } catch {
      metaById = new Map();
    }
  }

  for (const rec of records) {
    const sid = parseSpaceIdFromUrl(rec.linkUrl);
    const meta = sid ? metaById.get(sid) : undefined;
    let active = false;
    let note = "x_api:skipped";

    if (meta) {
      active = meta.live;
      note = active ? "x_api:live" : "x_api:ended";
      await updateFeedtrixLiveRecord("FeedtrixSpaces", rec.pipeId, {
        isActive: active,
        lastActiveCheck: now,
        listeners: meta.listeners > 0 ? meta.listeners : rec.listeners,
        title: preferLiveTitle(rec.title, meta.title),
        handle: preferLiveHandle(rec.handle, meta.hostHandle),
        author: preferLiveAuthor(rec.author, meta.hostName, meta.hostHandle),
        validationNote: note
      });
    } else {
      const probe = await probeUrlLive(rec.linkUrl);
      active = probe.ok;
      note = probe.ok ? "probe:live" : `probe:${probe.note ?? "dead"}`;
      await updateFeedtrixLiveRecord("FeedtrixSpaces", rec.pipeId, {
        isActive: active,
        lastActiveCheck: now,
        validationNote: note
      });
    }
    checked++;
  }
  return checked;
}

async function validateBroadcastRecords(records: FeedtrixLiveRecord[]): Promise<number> {
  const now = Date.now();
  let checked = 0;
  for (const rec of records) {
    const probe = await probeUrlLive(rec.linkUrl);
    await updateFeedtrixLiveRecord("FeedtrixBroadcasts", rec.pipeId, {
      isActive: probe.ok,
      lastActiveCheck: now,
      validationNote: probe.ok ? "probe:live" : `probe:${probe.note ?? "dead"}`
    });
    checked++;
  }
  return checked;
}

/**
 * Re-check a batch of stale pipe rows (rotates through the queue).
 */
export async function runFeedtrixLiveValidationPass(
  env: NodeJS.ProcessEnv,
  sessionId: string | null,
  opts?: { maxPerPipe?: number; staleAfterMs?: number }
): Promise<{ spacesChecked: number; broadcastsChecked: number }> {
  const max = opts?.maxPerPipe ?? 12;
  const staleMs = opts?.staleAfterMs ?? 90_000;

  const spaceBatch = await listRecordsNeedingCheck("FeedtrixSpaces", max, staleMs);
  const broadBatch = await listRecordsNeedingCheck("FeedtrixBroadcasts", max, staleMs);

  const spacesChecked = await validateSpaceRecords(env, sessionId, spaceBatch);
  const broadcastsChecked = await validateBroadcastRecords(broadBatch);

  return { spacesChecked, broadcastsChecked };
}

/** After hunt: merge discoveries into pipes (x_api rows ingested before xai_hunt). */
export async function reconcileHuntWithPipes(
  spaces: XaiLiveSessionRow[],
  broadcasts: XaiLiveSessionRow[],
  sources?: { spaces?: "x_api" | "xai_hunt"; broadcasts?: "x_api" | "xai_hunt" }
): Promise<void> {
  await ingestHuntIntoFeedtrixPipe(
    "FeedtrixSpaces",
    spaces,
    sources?.spaces ?? "xai_hunt"
  );
  await ingestHuntIntoFeedtrixPipe(
    "FeedtrixBroadcasts",
    broadcasts,
    sources?.broadcasts ?? "xai_hunt"
  );
}
