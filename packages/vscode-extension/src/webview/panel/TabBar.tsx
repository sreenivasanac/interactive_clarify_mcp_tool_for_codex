import React, { useRef, useEffect } from "react";
import type { QuestionItem } from "@interactive-clarify/shared";

interface TabBarProps {
  questions: QuestionItem[];
  activeTab: number;
  isAnswered: (index: number) => boolean;
  onTabChange: (index: number) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  questions,
  activeTab,
  isAnswered,
  onTabChange,
}) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Scroll active tab into view when it changes
  useEffect(() => {
    tabRefs.current[activeTab]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTab]);

  return (
    <div className="ic-tab-bar" role="tablist" aria-label="Questions">
      {questions.map((q, index) => {
        const active = index === activeTab;
        const answered = isAnswered(index);

        return (
          <button
            key={q.header}
            ref={(el) => { tabRefs.current[index] = el; }}
            role="tab"
            aria-selected={active}
            aria-controls={`ic-panel-${index}`}
            id={`ic-tab-${index}`}
            tabIndex={active ? 0 : -1}
            className={[
              "ic-tab",
              active && "ic-tab--active",
              answered && "ic-tab--answered",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onTabChange(index)}
          >
            <span className="ic-tab__index">
              {answered ? "\u2713" : index + 1}
            </span>
            <span className="ic-tab__label">{q.header}</span>
          </button>
        );
      })}
    </div>
  );
};
