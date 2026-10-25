/** Weak metadata from Grok URL-only lines (no @handle in source text). */
export function isWeakLiveHandle(handle: string | undefined): boolean {
  const h = String(handle ?? "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  return !h || h === "unknown" || h === "spaces" || h === "broadcast";
}

export function isGenericLiveTitle(title: string | undefined): boolean {
  const t = String(title ?? "")
    .trim()
    .toLowerCase();
  return !t || t === "live on x" || t === "x space" || t === "x broadcast";
}

export function preferLiveHandle(prev: string, next: string): string {
  if (isWeakLiveHandle(next) && !isWeakLiveHandle(prev)) return prev;
  if (!isWeakLiveHandle(next)) return next.replace(/^@/, "").slice(0, 30);
  return prev || next;
}

export function preferLiveTitle(prev: string, next: string): string {
  if (isGenericLiveTitle(next) && !isGenericLiveTitle(prev)) return prev;
  if (!isGenericLiveTitle(next)) return next.slice(0, 280);
  return prev || next;
}

export function preferLiveAuthor(prev: string, next: string, handle?: string): string {
  const n = String(next ?? "").trim();
  if (n && n.toLowerCase() !== "space host" && n.toLowerCase() !== "pending") {
    return n.replace(/^@/, "").slice(0, 240);
  }
  if (handle && !isWeakLiveHandle(handle)) return handle.replace(/^@/, "").slice(0, 240);
  return prev || "Space host";
}

/** Hide from directory until enriched or confirmed live with real title. */
export function shouldShowInLiveDirectory(opts: {
  isActive: boolean;
  handle: string;
  title: string;
  validationNote?: string;
}): boolean {
  if (!opts.isActive) return false;
  const note = String(opts.validationNote ?? "");
  if (note.includes("ended") || note.includes("dead") || note.includes("404")) return false;
  if (isWeakLiveHandle(opts.handle) && isGenericLiveTitle(opts.title)) {
    return false;
  }
  return true;
}
