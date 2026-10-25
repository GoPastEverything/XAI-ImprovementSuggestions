import { twimgDisplaySrcCandidates } from "../api/twimgProxy";

const IDB_NAME = "ifixedx_avatar_blob_v1";
const IDB_STORE = "avatars";
const IDB_VERSION = 1;
const MAX_BYTES = 380_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type AvatarRecord = {
  handleNorm: string;
  storedAt: number;
  sourceUrl: string;
  contentType: string;
  buffer: ArrayBuffer;
};

/** In-memory object URLs for this tab (avoid duplicate createObjectURL per tile). */
const sessionObjectUrls = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "handleNorm" });
      }
    };
  });
}

function normHandle(h: string): string {
  return h.replace(/^@/, "").trim().toLowerCase();
}

async function idbGet(handleNorm: string): Promise<AvatarRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const st = tx.objectStore(IDB_STORE);
    const r = st.get(handleNorm);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result as AvatarRecord | undefined);
  });
}

async function idbPut(rec: AvatarRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(IDB_STORE).put(rec);
  });
}

async function fetchFirstImageBlob(sourceUrl: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  for (const u of twimgDisplaySrcCandidates(sourceUrl)) {
    try {
      const res = await fetch(u, { credentials: "omit", mode: "cors" });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "image/jpeg";
      if (!ct.startsWith("image/")) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) continue;
      return { buffer: buf, contentType: ct.split(";")[0]!.trim() };
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Returns a **blob:** object URL for this handle when cached or downloadable.
 * Safe to call from many avatars; dedupes via `inFlight`.
 */
export async function getOrCreateAvatarObjectUrl(handle: string, sourceUrl: string | undefined): Promise<string | null> {
  const handleNorm = normHandle(handle);
  if (!handleNorm || !sourceUrl?.trim()) return null;
  const existingSession = sessionObjectUrls.get(handleNorm);
  if (existingSession) return existingSession;

  const pending = inFlight.get(handleNorm);
  if (pending) return pending;

  const work = (async (): Promise<string | null> => {
    try {
      const rec = await idbGet(handleNorm);
      if (rec && Date.now() - rec.storedAt < MAX_AGE_MS) {
        const blob = new Blob([rec.buffer], { type: rec.contentType || "image/jpeg" });
        const url = URL.createObjectURL(blob);
        sessionObjectUrls.set(handleNorm, url);
        return url;
      }

      const img = await fetchFirstImageBlob(sourceUrl.trim());
      if (!img) return null;

      await idbPut({
        handleNorm,
        storedAt: Date.now(),
        sourceUrl: sourceUrl.trim().slice(0, 2048),
        contentType: img.contentType,
        buffer: img.buffer
      });

      const blob = new Blob([img.buffer], { type: img.contentType });
      const url = URL.createObjectURL(blob);
      sessionObjectUrls.set(handleNorm, url);
      return url;
    } catch {
      return null;
    } finally {
      inFlight.delete(handleNorm);
    }
  })();

  inFlight.set(handleNorm, work);
  return work;
}

/** Call from “wipe all” so IndexedDB matches RxDB reset. */
export async function deleteAvatarBlobDatabase(): Promise<void> {
  sessionObjectUrls.forEach((u) => {
    try {
      URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  });
  sessionObjectUrls.clear();
  inFlight.clear();
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    req.onblocked = () => resolve();
  });
}
