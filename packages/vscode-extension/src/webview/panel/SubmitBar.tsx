import React from "react";

interface SubmitBarProps {
  activeTab: number;
  total: number;
  allAnswered: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export const SubmitBar: React.FC<SubmitBarProps> = ({
  activeTab,
  total,
  allAnswered,
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
            disabled={!allAnswered}
            type="button"
            title={allAnswered ? "Submit all answers" : "Answer all questions first"}
          >
            {allAnswered ? "Submit →" : `Submit (${total - (total - activeTab)} / ${total})`}
          </button>
        </div>
      </div>
      <div className="ic-hints">
        <span className="ic-hints__item"><kbd>←</kbd><kbd>→</kbd> Switch questions</span>
        <span className="ic-hints__item"><kbd>Click</kbd> Select option</span>
        <span className="ic-hints__item"><kbd>Esc</kbd> Cancel</span>
      </div>
    </div>
  );
};
