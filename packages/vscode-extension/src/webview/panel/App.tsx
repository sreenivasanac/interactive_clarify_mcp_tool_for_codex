import React, { useState, useCallback, useEffect } from "react";
import type { QuestionItem } from "@interactive-clarify/shared";
import { TabBar } from "./TabBar";
import { QuestionPanel } from "./QuestionPanel";
import { SubmitBar } from "./SubmitBar";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

interface AppProps {
  questions: QuestionItem[];
  vscodeApi: VsCodeApi;
}

export const App: React.FC<AppProps> = ({ questions, vscodeApi }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const activeQuestion = questions[activeTab];

  const isAnswered = useCallback(
    (index: number): boolean => {
      const header = questions[index]?.header;
      if (!header) return false;
      const answer = answers[header];
      if (answer === undefined) return false;
      if (Array.isArray(answer)) return answer.length > 0;
      return answer !== "";
    },
    [answers, questions],
  );

  const answeredCount = questions.filter((_, i) => isAnswered(i)).length;
  const allAnswered = answeredCount === questions.length;

  /** Find the next unanswered question after `from`, wrapping around. */
  const findNextUnanswered = useCallback(
    (from: number): number | null => {
      for (let i = 1; i <= questions.length; i++) {
        const idx = (from + i) % questions.length;
        if (!isAnswered(idx)) return idx;
      }
      return null;
    },
    [isAnswered, questions.length],
  );

  const handleAnswer = useCallback(
    (value: string | string[]) => {
      if (!activeQuestion) return;
      setAnswers((prev) => ({
        ...prev,
        [activeQuestion.header]: value,
      }));

      // For single-select, auto-advance to next unanswered question after a short delay
      if (!activeQuestion.multiSelect && typeof value === "string") {
        setTimeout(() => {
          const next = findNextUnanswered(activeTab);
          if (next !== null) {
            setActiveTab(next);
          }
        }, 250);
      }
    },
    [activeQuestion, activeTab, findNextUnanswered],
  );

  const goToPrev = useCallback(() => {
    setActiveTab((t) => (t - 1 + questions.length) % questions.length);
  }, [questions.length]);

  const goToNext = useCallback(() => {
    setActiveTab((t) => (t + 1) % questions.length);
  }, [questions.length]);

  // Global keyboard navigation: left/right arrows switch tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "Escape") {
        vscodeApi.postMessage({ type: "cancel" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goToPrev, goToNext, vscodeApi]);

  const handleSubmit = useCallback(() => {
    vscodeApi.postMessage({ type: "submit", answers });
  }, [answers, vscodeApi]);

  const handleCancel = useCallback(() => {
    vscodeApi.postMessage({ type: "cancel" });
  }, [vscodeApi]);

  if (questions.length === 0) {
    return (
      <div className="ic-empty">
        <p>No questions to display.</p>
      </div>
    );
  }

  return (
    <div className="ic-container">
      <div className="ic-header">
        <div className="ic-header__left">
          <div className="ic-header__icon">?</div>
          <h2 className="ic-title">Interactive Clarify</h2>
        </div>
        <span className="ic-progress">
          {answeredCount} of {questions.length} answered
        </span>
      </div>

      <TabBar
        questions={questions}
        activeTab={activeTab}
        isAnswered={isAnswered}
        onTabChange={setActiveTab}
      />

      {activeQuestion && (
        <QuestionPanel
          key={activeTab}
          index={activeTab}
          total={questions.length}
          question={activeQuestion}
          answer={answers[activeQuestion.header]}
          onAnswer={handleAnswer}
        />
      )}

      <SubmitBar
        activeTab={activeTab}
        total={questions.length}
        allAnswered={allAnswered}
        onPrev={goToPrev}
        onNext={goToNext}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
};
