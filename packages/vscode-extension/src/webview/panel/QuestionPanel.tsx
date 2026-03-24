import React, { useEffect, useMemo, useState } from "react";
import type { QuestionItem, OptionItem } from "@interactive-clarify/shared";

interface QuestionPanelProps {
  index: number;
  total: number;
  question: QuestionItem;
  answer: string | string[] | undefined;
  optionNotes?: Record<string, string>;
  onAnswer: (value: string | string[]) => void;
  onOptionNoteChange: (optionKey: string, notes: string) => void;
}

function getOptionDomId(prefix: string, index: number, optionLabel: string): string {
  return `${prefix}-${index}-${encodeURIComponent(optionLabel)}`;
}

export const QuestionPanel: React.FC<QuestionPanelProps> = ({
  index,
  total,
  question,
  answer,
  optionNotes,
  onAnswer,
  onOptionNoteChange,
}) => {
  const isMulti = question.multiSelect ?? false;
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);
  const [freeformDraft, setFreeformDraft] = useState("");
  const [freeformActive, setFreeformActive] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const questionHeadingId = `ic-question-${index}`;
  const previewHeadingId = `ic-preview-${index}`;
  const freeformInputId = `ic-freeform-${index}`;
  const freeformTitleId = `${freeformInputId}-label`;
  const freeformHintId = `${freeformInputId}-hint`;

  const selectedLabels = useMemo<string[]>(() => {
    if (answer === undefined) return [];
    if (Array.isArray(answer)) return answer;
    return answer ? [answer] : [];
  }, [answer]);

  const selectedOption = useMemo<OptionItem | undefined>(() => {
    if (selectedLabels.length === 0) return undefined;
    const lastSelected = selectedLabels[selectedLabels.length - 1];
    return question.options.find((o) => o.label === lastSelected);
  }, [selectedLabels, question.options]);

  const freeformValues = useMemo(
    () => selectedLabels.filter((label) => !question.options.some((option) => option.label === label)),
    [question.options, selectedLabels],
  );

  const selectedFreeformValue = freeformValues[freeformValues.length - 1] ?? "";
  const recommendedLabel = question.options[0]?.label;

  useEffect(() => {
    setFreeformDraft(selectedFreeformValue);
    if (selectedFreeformValue) {
      setFreeformActive(true);
    }
  }, [selectedFreeformValue]);

  useEffect(() => {
    if (previewLabel && question.options.some((option) => option.label === previewLabel)) return;
    if (selectedOption?.preview) {
      setPreviewLabel(selectedOption.label);
      return;
    }
    const firstPreviewableOption = question.options.find((option) => option.preview);
    setPreviewLabel(firstPreviewableOption?.label ?? null);
  }, [previewLabel, question.options, selectedOption]);

  const previewOption = useMemo<OptionItem | undefined>(() => {
    if (!previewLabel) return undefined;
    return question.options.find((option) => option.label === previewLabel);
  }, [previewLabel, question.options]);

  const isFreeformSelected = freeformActive || selectedFreeformValue.length > 0;
  const noteTargetOption = useMemo<OptionItem | undefined>(() => {
    if (isFreeformSelected) return undefined;
    if (previewOption && selectedLabels.includes(previewOption.label)) return previewOption;
    return selectedOption;
  }, [isFreeformSelected, previewOption, selectedLabels, selectedOption]);
  const noteValue = noteTargetOption ? optionNotes?.[noteTargetOption.label] ?? "" : "";
  const noteInputId = noteTargetOption
    ? getOptionDomId("ic-note", index, noteTargetOption.label)
    : undefined;

  const handleOptionKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    optionIndex: number,
    totalOptionCount: number,
  ): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    const nextIndex =
      event.key === "ArrowDown"
        ? Math.min(totalOptionCount - 1, optionIndex + 1)
        : Math.max(0, optionIndex - 1);

    const nextElement = document.querySelector<HTMLElement>(
      `[data-question-index="${index}"][data-option-index="${nextIndex}"]`,
    );
    nextElement?.focus();
  };

  const handleClick = (option: OptionItem): void => {
    setFreeformActive(false);

    if (isMulti) {
      const current = Array.isArray(answer) ? answer : [];
      if (current.includes(option.label)) {
        onAnswer(current.filter((l) => l !== option.label));
      } else {
        onAnswer([...current, option.label]);
      }
      return;
    }

    onAnswer(selectedLabels.includes(option.label) ? "" : option.label);
  };

  const syncFreeformAnswer = (nextValue: string): void => {
    const trimmedValue = nextValue.trim();

    if (isMulti) {
      const current = Array.isArray(answer) ? answer : [];
      const withoutPreviousFreeform = current.filter(
        (label) => question.options.some((option) => option.label === label),
      );
      onAnswer(trimmedValue ? [...withoutPreviousFreeform, trimmedValue] : withoutPreviousFreeform);
      return;
    }

    onAnswer(trimmedValue);
  };

  useEffect(() => {
    if (!noteTargetOption) {
      setShowNoteEditor(false);
    }
  }, [noteTargetOption]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!noteTargetOption) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const activeElement = target instanceof HTMLElement ? target : null;
      const tag = activeElement?.tagName;
      const isTextEntryTarget = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (isTextEntryTarget) return;
      if (event.key !== "n" && event.key !== "N") return;

      event.preventDefault();
      setShowNoteEditor(true);
      window.setTimeout(() => {
        if (noteInputId) {
          document.getElementById(noteInputId)?.focus();
        }
      }, 0);
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [index, noteInputId, noteTargetOption]);

  return (
    <div
      className="ic-question-panel"
      role="tabpanel"
      id={`ic-panel-${index}`}
      aria-labelledby={`ic-tab-${index}`}
    >
      <div className="ic-question-counter">
        Question {index + 1} of {total}
      </div>

      <h3 className="ic-question-text" id={questionHeadingId}>
        {question.question}
      </h3>

      {isMulti && (
        <div className="ic-select-hint">
          <span className="ic-select-hint__icon">{"\u2713"}</span>
          Select all that apply
        </div>
      )}

      <div className="ic-question-layout">
        <div className="ic-options">
          <div
            className="ic-optionList"
            role={isMulti ? "group" : "radiogroup"}
            aria-labelledby={questionHeadingId}
          >
          {question.options.map((option, optIdx) => {
            const isSelected = selectedLabels.includes(option.label);
            const hasPreview = Boolean(option.preview);
            const isPreviewed = previewLabel === option.label;
            const isRecommended = option.label === recommendedLabel;

            return (
              <div key={option.label} className="ic-optionBlock">
                <button
                  type="button"
                  className={[
                    "ic-option",
                    isSelected && "ic-option--selected",
                    isPreviewed && "ic-option--previewed",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleClick(option)}
                  onMouseEnter={() => {
                    if (hasPreview) setPreviewLabel(option.label);
                  }}
                  onFocus={() => {
                    if (hasPreview) setPreviewLabel(option.label);
                  }}
                  onKeyDown={(event) => handleOptionKeyDown(event, optIdx, question.options.length + 1)}
                  role={isMulti ? "checkbox" : "radio"}
                  aria-checked={isSelected}
                  data-question-index={index}
                  data-option-index={optIdx}
                >
                  <div className="ic-indicator" aria-hidden="true">
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
                    <div className="ic-option__labelRow">
                      <div className="ic-option__label">{option.label}</div>
                      {isRecommended && <span className="ic-option__recommended">Recommended</span>}
                      {hasPreview && <span className="ic-option__previewTag">Preview</span>}
                    </div>
                    <div className="ic-option__desc">{option.description}</div>
                  </div>
                </button>
              </div>
            );
          })}
          </div>

          <div
            className={`ic-freeform ${isFreeformSelected ? "ic-freeform--selected" : ""}`}
          >
            <button
              type="button"
              className="ic-freeform__toggle"
              aria-describedby={freeformHintId}
              aria-pressed={isFreeformSelected}
              data-question-index={index}
              data-option-index={question.options.length}
              onClick={() => {
                setFreeformActive(true);
                syncFreeformAnswer(freeformDraft);
                document.getElementById(freeformInputId)?.focus();
              }}
              onKeyDown={(event) => {
                handleOptionKeyDown(event, question.options.length, question.options.length + 1);
              }}
            >
              <div className="ic-freeform__titleRow">
                <span className="ic-indicator" aria-hidden="true">
                  {isMulti ? (
                    <span className={`ic-checkbox ${isFreeformSelected ? "ic-checkbox--selected" : ""}`}>
                      <span className="ic-checkbox__check">{"\u2713"}</span>
                    </span>
                  ) : (
                    <span className={`ic-radio ${isFreeformSelected ? "ic-radio--selected" : ""}`}>
                      <span className="ic-radio__dot" />
                    </span>
                  )}
                </span>
                <span className="ic-freeform__title" id={freeformTitleId}>
                  Freeform chat
                </span>
              </div>
              <div className="ic-freeform__subtitle" id={freeformHintId}>
                Custom answer
              </div>
            </button>
            <textarea
              id={freeformInputId}
              name={freeformInputId}
              className="ic-freeform__input"
              value={freeformDraft}
              onChange={(event) => {
                const nextValue = event.target.value;
                setFreeformDraft(nextValue);
                setFreeformActive(true);
                setPreviewLabel(null);
                syncFreeformAnswer(nextValue);
              }}
              onFocus={() => {
                setFreeformActive(true);
                setPreviewLabel(null);
                syncFreeformAnswer(freeformDraft);
              }}
              onBlur={() => {
                syncFreeformAnswer(freeformDraft);
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
              }}
              aria-labelledby={freeformTitleId}
              aria-describedby={freeformHintId}
              placeholder="Write your answer…"
              rows={4}
            />
          </div>
        </div>

        <aside className="ic-preview" aria-labelledby={previewHeadingId}>
          <div className="ic-preview__header" id={previewHeadingId}>
            Preview
          </div>
          <div className="ic-preview__body">
            {previewOption?.preview ? (
              <>
                {previewOption.label === recommendedLabel && (
                  <div className="ic-preview__recommendation">Recommended starting point for this question.</div>
                )}
                <pre className="ic-preview__text">{previewOption.preview}</pre>
              </>
            ) : (
              <div className="ic-preview__empty">Hover or focus an option with preview content to inspect it here.</div>
            )}

            {noteTargetOption && (
              <div className="ic-preview__noteArea">
                {!showNoteEditor ? (
                  <button
                    type="button"
                    className="ic-preview__noteButton"
                    onClick={() => setShowNoteEditor(true)}
                  >
                    Add note
                  </button>
                ) : (
                  <div className="ic-note ic-note--preview">
                    <label className="ic-note__label" htmlFor={noteInputId}>
                      Optional note
                    </label>
                    <textarea
                      id={noteInputId}
                      className="ic-note__input"
                      value={noteValue}
                      onChange={(event) => onOptionNoteChange(noteTargetOption.label, event.target.value)}
                      placeholder="Optional note…"
                      rows={3}
                    />
                  </div>
                )}
                <div className="ic-preview__noteHint">Press N to add note</div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
