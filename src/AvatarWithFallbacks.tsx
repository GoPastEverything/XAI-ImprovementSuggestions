import { useEffect, useMemo, useState, type ReactNode } from "react";
import { avatarImageCandidates } from "./avatarUrls";
import { getOrCreateAvatarObjectUrl } from "./db/avatarBlobCache";
import { getIfixedxDb } from "./db/ifixedxDb";

function normHandle(h: string): string {
  return h.replace(/^@/, "").trim().toLowerCase();
}

export function AvatarWithFallbacks({
  author,
  handle,
  avatarUrl,
  className = "ix-avatar-img",
  initialsFallback,
  imgLoading = "lazy"
}: {
  author: string;
  handle: string;
  avatarUrl?: string;
  className?: string;
  initialsFallback: ReactNode;
  /** Avatars are small; use `eager` in feeds so they aren’t starved behind many `lazy` siblings. */
  imgLoading?: "lazy" | "eager";
}) {
  const hn = normHandle(handle);
  const [accountAvatarUrl, setAccountAvatarUrl] = useState("");
  const [blobSrc, setBlobSrc] = useState<string | null>(null);

  /** Live row from `accounts` — updated whenever ingest refreshes that handle. */
  useEffect(() => {
    if (!hn) return;
    let alive = true;
    let sub: { unsubscribe: () => void } | undefined;
    void getIfixedxDb().then((db) => {
      if (!alive) return;
      const obs = db.accounts.findOne(hn).$;
      sub = obs.subscribe((doc) => {
        setAccountAvatarUrl((doc?.avatarUrl ?? "").trim());
      });
    });
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, [hn]);

  const mergedUrl = (accountAvatarUrl || avatarUrl?.trim() || "").trim();

  const candidatesBase = useMemo(
    () => avatarImageCandidates({ handle, avatarUrl: mergedUrl || undefined }),
    [handle, mergedUrl]
  );

  /** Download once per handle into IndexedDB; `<img>` uses blob URL first (avoids repeat CDN/proxy hits). */
  useEffect(() => {
    if (!hn || !mergedUrl) {
      setBlobSrc(null);
      return;
    }
    let cancelled = false;
    void getOrCreateAvatarObjectUrl(hn, mergedUrl).then((url) => {
      if (!cancelled && url) setBlobSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [hn, mergedUrl]);

  const candidates = useMemo(() => {
    if (blobSrc) return [blobSrc, ...candidatesBase];
    return candidatesBase;
  }, [blobSrc, candidatesBase]);

  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
  }, [candidates.join("|")]);

  if (i >= candidates.length) return <>{initialsFallback}</>;

  return (
    <img
      src={candidates[i]}
      alt=""
      className={className}
      loading={imgLoading}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setI((x) => x + 1)}
    />
  );
}
