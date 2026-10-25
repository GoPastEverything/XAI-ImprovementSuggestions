import { getIfixedxDb, type SeenItemDoc, type LiveSessionKind } from "./ifixedxDb";
import { getTheFeedtrixDb } from "./thefeedtrixDb";

function safeNow(): number {
  return Date.now();
}

/** Normalize X / twitter URLs so /peek vs full URL still match. */
export function normalizeLiveUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    let path = u.pathname.replace(/\/$/, "");
    path = path.replace(/\/peek$/i, "");
    return `${host}${path}`;
  } catch {
    return raw.toLowerCase();
  }
}

export function liveSessionSeenKey(kind: LiveSessionKind, linkUrl: string): string {
  return `live:${kind}:${normalizeLiveUrl(linkUrl)}`;
}

export function liveSessionSeenKeyFromRow(row: { kind: LiveSessionKind; linkUrl?: string; id: string }): string {
  const link = row.linkUrl?.trim();
  if (link) return liveSessionSeenKey(row.kind, link);
  const m = row.id.match(/^(?:space|broadcast):([A-Za-z0-9]+)$/);
  if (m) return `live:${row.kind}:x.com/i/${row.kind === "space" ? "spaces" : "broadcasts"}/${m[1]}`;
  return `live:${row.kind}:id:${row.id}`;
}

export function postSeenKey(tweetId: string): string {
  return `post:${String(tweetId)}`;
}

async function patchCanonicalPostSeenFlag(tweetId: string): Promise<void> {
  try {
    const db = await getTheFeedtrixDb();
    const doc = await db.tf_canonical_posts.findOne(tweetId).exec();
    if (doc?.seen === false) await doc.incrementalPatch({ seen: true });
  } catch {
    /* ignore */
  }
}

/** Best-effort: align TheFeedtrix canonical `seen` with iFixedX `seen_items` post refs. */
export async function syncCanonicalSeenFlagsFromSeenPostIds(ids: Set<string>): Promise<void> {
  if (!ids.size) return;
  const slice = [...ids].slice(0, 4000);
  try {
    const db = await getTheFeedtrixDb();
    for (let i = 0; i < slice.length; i += 48) {
      const chunk = slice.slice(i, i + 48);
      await Promise.all(
        chunk.map(async (id) => {
          try {
            const doc = await db.tf_canonical_posts.findOne(id).exec();
            if (doc?.seen === false) await doc.incrementalPatch({ seen: true });
          } catch {
            /* ignore */
          }
        })
      );
    }
  } catch {
    /* ignore */
  }
}

export async function loadSeenPostIds(): Promise<Set<string>> {
  if (typeof window === "undefined") return new Set();
  try {
    const db = await getIfixedxDb();
    const docs = await db.seen_items.find({ selector: { kind: "post" } }).exec();
    return new Set(docs.map((d) => d.ref));
  } catch {
    return new Set();
  }
}

export async function loadSeenLiveKeys(): Promise<Set<string>> {
  if (typeof window === "undefined") return new Set();
  try {
    const db = await getIfixedxDb();
    const docs = await db.seen_items
      .find({
        selector: {
          kind: { $in: ["space", "broadcast"] }
        }
      })
      .exec();
    return new Set(docs.map((d) => d.key));
  } catch {
    return new Set();
  }
}

export async function markPostSeen(tweetId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await getIfixedxDb();
    const id = String(tweetId);
    const doc: SeenItemDoc = {
      key: postSeenKey(id),
      kind: "post",
      ref: id,
      seenAt: safeNow()
    };
    await db.seen_items.upsert(doc);
    await patchCanonicalPostSeenFlag(id);
  } catch {
    /* best-effort */
  }
}

export async function markLiveSessionSeen(row: { kind: LiveSessionKind; linkUrl?: string; id: string }): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await getIfixedxDb();
    const key = liveSessionSeenKeyFromRow(row);
    const ref = row.linkUrl?.trim() || row.id;
    const doc: SeenItemDoc = {
      key,
      kind: row.kind,
      ref: ref.slice(0, 512),
      seenAt: safeNow()
    };
    await db.seen_items.upsert(doc);
  } catch {
    /* best-effort */
  }
}

/** Reset TheFeedtrix canonical `seen` so backlog ranks as unseen again. */
export async function resetAllCanonicalPostsSeenFlags(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await getTheFeedtrixDb();
    const docs = await db.tf_canonical_posts.find().exec();
    for (let i = 0; i < docs.length; i += 40) {
      await Promise.all(
        docs.slice(i, i + 40).map(async (d) => {
          try {
            if (d.seen !== false) await d.incrementalPatch({ seen: false });
          } catch {
            /* ignore */
          }
        })
      );
    }
  } catch {
    /* ignore */
  }
}

/** Remove all seen records (e.g. to re-test offline / seed flows). */
export async function clearAllSeenItems(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await getIfixedxDb();
    const docs = await db.seen_items.find().exec();
    await Promise.all(docs.map((d) => d.remove()));
  } catch {
    /* ignore */
  }
  await resetAllCanonicalPostsSeenFlags();
}
