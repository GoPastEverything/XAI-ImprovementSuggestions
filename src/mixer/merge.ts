import type { TweetResult } from "../api/types";
import { dedupeTweetsById } from "./dedupeTweets";

export function mergeFeedById(prev: TweetResult[], batch: TweetResult[]): TweetResult[] {
  const ids = new Set(prev.map((t) => String(t.id)));
  return dedupeTweetsById([...prev, ...batch.filter((t) => !ids.has(String(t.id)))]);
}

export { dedupeTweetsById } from "./dedupeTweets";

/** 32-bit FNV-1a hash of string parts (used to derive mixer shuffle seeds). */
export function fnv1aSeed(parts: string[]): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x7c3a_7b4d;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random order copy; same seed → same permutation. */
export function seededShuffleCopy<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Home mixer: put **all** unseen Pipetrix canonical rows (`tf_canonical_posts`) first (newest first), then the live
 * corpus (Live X / Grok-front timeline / seed) without id collisions, then seen canonical. Surfaces Grok-ingested
 * backlog ahead of the next API pull. Optional `maxUnseenBeforeLive` caps the head for extreme corpora.
 *
 * With `churnSeed`, shuffles **unseen head** and **tail** separately (different sub-seeds) so order
 * varies on each refresh while unseen posts still precede live/seen material.
 *
 * With `preferLiveFirst` (Home + Live X or seed), the active timeline batch stays on top — same visual
 * priority as the offline seed masonry demo; Pipetrix backlog follows without burying TwIMG media.
 */
export function mergeFeedWithUnseenCanonicalFirst(
  liveBatch: TweetResult[],
  canonicalPool: TweetResult[],
  seenPostIds: Set<string>,
  opts?: {
    includeSeen?: boolean;
    maxUnseenBeforeLive?: number;
    churnSeed?: number;
    preferLiveFirst?: boolean;
  }
): TweetResult[] {
  if (opts?.includeSeen) {
    const flat = mergeFeedById(liveBatch, canonicalPool);
    return opts.churnSeed != null ? seededShuffleCopy(flat, opts.churnSeed) : flat;
  }
  const unseen = canonicalPool
    .filter((t) => !seenPostIds.has(String(t.id)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const limitHead = opts?.maxUnseenBeforeLive;
  const head =
    typeof limitHead === "number" && limitHead > 0 ? unseen.slice(0, limitHead) : unseen;
  const tail =
    typeof limitHead === "number" && limitHead > 0 ? unseen.slice(limitHead) : [];

  const unseenIds = new Set(unseen.map((t) => String(t.id)));
  const liveFiltered = liveBatch.filter((t) => !unseenIds.has(String(t.id)));
  const seenCanon = canonicalPool.filter((t) => seenPostIds.has(String(t.id)));
  const afterLive = mergeFeedById(tail, seenCanon);
  const mergedTail = mergeFeedById(liveFiltered, afterLive);

  if (opts?.preferLiveFirst) {
    const liveIds = new Set(liveBatch.map((t) => String(t.id)));
    const canonAfterLive = [...head, ...tail, ...seenCanon].filter((t) => !liveIds.has(String(t.id)));
    const merged = [...liveBatch, ...canonAfterLive];
    if (opts.churnSeed == null) return merged;
    return seededShuffleCopy(merged, opts.churnSeed >>> 0);
  }

  if (opts?.churnSeed == null) return [...head, ...mergedTail];
  const s = opts.churnSeed >>> 0;
  const shHead = head.length ? seededShuffleCopy(head, (s ^ 0xdea7beef) >>> 0) : [];
  const shTail = mergedTail.length ? seededShuffleCopy(mergedTail, (s ^ 0x51eed001) >>> 0) : [];
  return [...shHead, ...shTail];
}
