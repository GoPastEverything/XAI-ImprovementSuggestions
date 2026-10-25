/** Rotating, unbiased discovery angles — no per-user boost. */

export const X_RECENT_BROADCAST_QUERIES = [
  '("x.com/i/broadcasts" OR "i/broadcasts/") filter:links -is:retweet lang:en',
  '("live on x" OR "streaming now" OR "going live") filter:links lang:en -is:retweet',
  'filter:links "broadcast" ("live" OR "LIVE") lang:en -is:retweet',
  '("watch live" OR "tune in") (x.com OR twitter.com) filter:links lang:en'
] as const;

export const X_RECENT_SPACE_QUERIES = [
  "filter:spaces lang:en",
  '("x.com/i/spaces" OR "/i/spaces/") filter:links lang:en -is:retweet',
  "filter:spaces (english OR lang:en) min_faves:0",
  '("join my space" OR "live space" OR "X Space") filter:links lang:en'
] as const;

export function pickRotatingIndex(huntPass: number, poolLength: number, kindOffset: number): number {
  if (poolLength <= 0) return 0;
  const n = Math.max(0, Math.floor(huntPass));
  return (n + kindOffset) % poolLength;
}

export function broadcastGrokPrompt(max: number, angle: number): string {
  const angles = [
    `pull up ${max} valid active X broadcasts right now (not spaces). Use x_search: "x.com/i/broadcasts" filter:links since:today. One URL per line: https://x.com/i/broadcasts/{id} — title (@handle). No invented IDs.`,
    `Search X Latest for posts in the last 2 hours linking to https://x.com/i/broadcasts/. List every distinct live video broadcast URL — up to ${max} lines with @handle.`,
    `What native X video live streams are running globally right now? x_search only. Output up to ${max} real https://x.com/i/broadcasts/ URLs (not Spaces).`,
    `Find active X live video broadcasts (gaming, news, sports, any language). Up to ${max} lines: https://x.com/i/broadcasts/{id} — description (@handle).`
  ];
  return angles[angle % angles.length]!;
}

export function spaceGrokPrompt(max: number, angle: number): string {
  const angles = [
    `pull up ${max} valid active X SPACES right now (not video broadcasts). x_search: filter:spaces lang:en since:today. Format: https://x.com/i/spaces/{id}/peek — title (@handle)`,
    `Search X for live audio Spaces in English right now. List up to ${max} https://x.com/i/spaces/ peek URLs from real posts.`,
    `What X Spaces are live globally now? Prefer English. Up to ${max} lines with https://x.com/i/spaces/ URLs only.`,
    `Find active community / news / tech X Spaces happening now. Up to ${max} real Space peek links — no broadcast URLs.`
  ];
  return angles[angle % angles.length]!;
}
