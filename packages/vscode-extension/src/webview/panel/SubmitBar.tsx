import React from "react";

interface SubmitBarProps {
  activeTab: number;
  total: number;
  answeredCount: number;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export const SubmitBar: React.FC<SubmitBarProps> = ({
  activeTab,
  total,
  answeredCount,
  onPrev,
  onNext,
  onSubmit,
  onCancel,
}) => {
  return (
    <div className="ic-footer">
      <div className="ic-footer__actions">
        <div className="ic-footer__nav">
          <button
            className="ic-btn ic-btn--ghost"
            onClick={onPrev}
            disabled={total <= 1}
            title="Previous question (←)"
            type="button"
          >
            ← Prev
          </button>
          <button
            className="ic-btn ic-btn--ghost"
            onClick={onNext}
            disabled={total <= 1}
            title="Next question (→)"
            type="button"
          >
            Next →
          </button>
        </div>
        <div className="ic-footer__buttons">
          <button
            className="ic-btn ic-btn--secondary"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="ic-btn ic-btn--primary"
            onClick={onSubmit}
            type="button"
            title="Submit current answers"
          >
            {answeredCount === total ? "Submit →" : `Submit (${answeredCount} / ${total})`}
          </button>
        </div>
      </div>
      <div className="ic-hints">
        <span className="ic-hints__item"><kbd>←</kbd><kbd>→</kbd> Switch questions</span>
        <span className="ic-hints__item"><kbd>↑</kbd><kbd>↓</kbd> Move options</span>
        <span className="ic-hints__item"><kbd>Tab</kbd> Move focus</span>
        <span className="ic-hints__item"><kbd>Enter</kbd> Submit</span>
        <span className="ic-hints__item"><kbd>Esc</kbd> Cancel</span>
      </div>
    </div>
  );
};
