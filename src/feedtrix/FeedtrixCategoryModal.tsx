import { FEEDTRIX_TOPICS } from "./topics";

export function FeedtrixCategoryModal(props: {
  open: boolean;
  onClose: () => void;
  prefs: Record<string, boolean>;
  onToggle: (topicId: string, enabled: boolean) => void;
  onReset: () => void;
}) {
  if (!props.open) return null;

  return (
    <div
      className="ix-ftrix-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className="ix-ftrix-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ix-ftrix-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ix-ftrix-head">
          <h2 id="ix-ftrix-title" className="ix-ftrix-title">
            Feed categories
          </h2>
          <button type="button" className="ix-ftrix-x" aria-label="Close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <p className="ix-ftrix-sub ix-muted ix-fineprint">
          Toggle topical buckets powered by Grok batches into{" "}
          <strong>The Pipetrix</strong> (IndexedDB <code>thefeedtrix_local</code>). Disabled topics hide those posts from the mixer and pause
          background pulls for them.
        </p>
        <ul className="ix-ftrix-list">
          {FEEDTRIX_TOPICS.map((t) => {
            const on = props.prefs[t.id] !== false;
            return (
              <li key={t.id} className="ix-ftrix-row">
                <span className="ix-ftrix-row-icon" aria-hidden>
                  {t.icon}
                </span>
                <span className="ix-ftrix-row-label">{t.label}</span>
                <label className="ix-ftrix-switch">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => props.onToggle(t.id, e.target.checked)}
                  />
                  <span className="ix-ftrix-switch-ui" aria-hidden />
                </label>
              </li>
            );
          })}
        </ul>
        <button type="button" className="ix-ftrix-reset" onClick={props.onReset}>
          Reset all on
        </button>
      </div>
    </div>
  );
}
