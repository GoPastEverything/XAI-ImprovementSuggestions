export function isWeakLiveHandle(handle: string | undefined): boolean {
  const h = String(handle ?? "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  return !h || h === "unknown" || h === "spaces" || h === "broadcast" || h === "pending";
}

export function isGenericLiveTitle(title: string | undefined): boolean {
  const t = String(title ?? "")
    .trim()
    .toLowerCase();
  return !t || t === "live on x";
}

export function liveSessionDisplayMeta(row: {
  handle: string;
  author: string;
  title: string;
}): { author: string; handle: string } {
  if (isWeakLiveHandle(row.handle) && !isGenericLiveTitle(row.title)) {
    return { author: row.title, handle: "space" };
  }
  return {
    author: row.author,
    handle: row.handle.replace(/^@/, "").replace(/^pending$/i, "…")
  };
}
