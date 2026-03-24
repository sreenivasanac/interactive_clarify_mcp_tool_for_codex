import React, { useMemo } from "react";
import type { QuestionItem, OptionItem } from "@interactive-clarify/shared";

interface QuestionPanelProps {
  index: number;
  total: number;
  question: QuestionItem;
  answer: string | string[] | undefined;
  onAnswer: (value: string | string[]) => void;
}

export const QuestionPanel: React.FC<QuestionPanelProps> = ({
  index,
  total,
  question,
  answer,
  onAnswer,
}) => {
  const isMulti = question.multiSelect ?? false;

  const selectedLabels = useMemo<string[]>(() => {
    if (answer === undefined) return [];
    if (Array.isArray(answer)) return answer;
    return [answer];
  }, [answer]);

  const selectedOption = useMemo<OptionItem | undefined>(() => {
    if (selectedLabels.length === 0) return undefined;
    const lastSelected = selectedLabels[selectedLabels.length - 1];
    return question.options.find((o) => o.label === lastSelected);
  }, [selectedLabels, question.options]);

  const handleClick = (option: OptionItem): void => {
    if (isMulti) {
      const current = Array.isArray(answer) ? answer : [];
      if (current.includes(option.label)) {
        onAnswer(current.filter((l) => l !== option.label));
      } else {
        onAnswer([...current, option.label]);
      }
    } else {
      onAnswer(option.label);
    }
  };

  return (
    <div className="ic-question-panel" role="tabpanel" id={`ic-panel-${index}`}>
      <div className="ic-question-counter">
        Question {index + 1} of {total}
      </div>

      <div className="ic-question-text">{question.question}</div>

      {isMulti && (
        <div className="ic-select-hint">
          <span className="ic-select-hint__icon">{"\u2713"}</span>
          Select all that apply
        </div>
      )}

      <div className="ic-options">
        {question.options.map((option, optIdx) => {
          const isSelected = selectedLabels.includes(option.label);
          const isRecommended = optIdx === 0 && option.label.toLowerCase().includes("recommend");

          return (
            <button
              key={option.label}
              className={[
                "ic-option",
                isSelected && "ic-option--selected",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handleClick(option)}
              aria-pressed={isSelected}
            >
              <div className="ic-indicator">
                {isMulti ? (
                  <span className={`ic-checkbox ${isSelected ? "ic-checkbox--selected" : ""}`}>
                    <span className="ic-checkbox__check">{"\u2713"}</span>
                  </span>
                ) : (
                  <span className={`ic-radio ${isSelected ? "ic-radio--selected" : ""}`}>
                    <span className="ic-radio__dot" />
                  </span>
                )}
              </div>
              <div className="ic-option__body">
                <div className="ic-option__label">
                  {option.label}
                  {isRecommended && (
                    <span className="ic-option__recommended">Recommended</span>
                  )}
                </div>
                <div className="ic-option__desc">{option.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedOption?.preview && (
        <div className="ic-preview">
          <div className="ic-preview__header">Preview</div>
          <pre className="ic-preview__content">{selectedOption.preview}</pre>
        </div>
      )}
    </div>
  );
};
