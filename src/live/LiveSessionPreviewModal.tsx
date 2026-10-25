import { useEffect, useState } from "react";
import {
  fetchLiveSessionDetail,
  type LiveSessionDetailPayload,
  type LiveSessionParticipant
} from "../api/liveSessionDetail";

export type LiveSessionPreviewRow = {
  kind: "space" | "broadcast";
  title: string;
  linkUrl?: string;
  handle: string;
  author: string;
  live: boolean;
  listeners: number;
};

function ParticipantCell({ p }: { p: LiveSessionParticipant }) {
  const profileHref = `https://x.com/${encodeURIComponent(p.username)}`;
  const label = p.name || `@${p.username}`;
  const initials =
    label
      .replace(/^@/, "")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <a className="ix-live-preview-person" href={profileHref} target="_blank" rel="noopener noreferrer">
      {p.avatarUrl ? (
        <img className="ix-live-preview-avatar" src={p.avatarUrl} alt="" loading="lazy" />
      ) : (
        <span className="ix-live-preview-avatar ix-live-preview-avatar--fallback" aria-hidden>
          {initials}
        </span>
      )}
      <span className="ix-live-preview-person-name">{label}</span>
      <span className="ix-live-preview-person-role">{p.role}</span>
    </a>
  );
}

export function LiveSessionPreviewModal(props: {
  row: LiveSessionPreviewRow;
  onClose: () => void;
  onJoin?: () => void;
}) {
  const { row, onClose, onJoin } = props;
  const [detail, setDetail] = useState<LiveSessionDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const joinUrl = (detail?.linkUrl ?? row.linkUrl)?.trim() || "#";
  const title = detail?.title ?? row.title;
  const listeners = detail?.listeners ?? row.listeners;
  const live = detail?.live ?? row.live;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const linkUrl = row.linkUrl?.trim();
    if (!linkUrl) {
      setLoading(false);
      setError("No session link.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchLiveSessionDetail({
      kind: row.kind,
      linkUrl,
      title: row.title,
      handle: row.handle,
      listeners: row.listeners,
      live: row.live
    })
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load session");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [row]);

  const joinLabel =
    row.kind === "space"
      ? live
        ? "Start listening"
        : "Open Space on X"
      : live
        ? "Watch on X"
        : "Open broadcast on X";

  return (
    <div
      className="ix-live-preview-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ix-live-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ix-live-preview-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="ix-live-preview-head">
          <button type="button" className="ix-live-preview-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <a
            className="ix-live-preview-share"
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open on X"
            onClick={() => onJoin?.()}
          >
            ↗
          </a>
        </header>

        <h2 id="ix-live-preview-title" className="ix-live-preview-title">
          {title}
        </h2>

        {loading ? (
          <p className="ix-muted ix-fineprint ix-live-preview-status">Loading hosts and speakers…</p>
        ) : null}

        {error ? (
          <p className="ix-warn ix-fineprint ix-live-preview-status">{error}</p>
        ) : null}

        {detail?.note && !error ? (
          <p className="ix-muted ix-fineprint ix-live-preview-status">{detail.note}</p>
        ) : null}

        {detail?.participants?.length ? (
          <div className="ix-live-preview-grid" aria-label="Active participants">
            {detail.participants.map((p) => (
              <ParticipantCell key={`${p.id}-${p.role}`} p={p} />
            ))}
          </div>
        ) : !loading && !error ? (
          <p className="ix-muted ix-fineprint ix-live-preview-status">
            Participant list unavailable — join on X to see who&apos;s live.
          </p>
        ) : null}

        {detail?.otherListenersLabel ? (
          <p className="ix-live-preview-others">{detail.otherListenersLabel}</p>
        ) : live && listeners > 0 ? (
          <p className="ix-live-preview-others">{listeners.toLocaleString()} listening</p>
        ) : null}

        {row.kind === "space" && live ? (
          <p className="ix-muted ix-fineprint ix-live-preview-hint">Your mic will be off to start.</p>
        ) : null}

        <a
          className="ix-live-preview-join"
          href={joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onJoin?.()}
        >
          {joinLabel}
        </a>
      </div>
    </div>
  );
}
