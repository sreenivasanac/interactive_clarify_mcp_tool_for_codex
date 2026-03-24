import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { QuestionItem } from "@interactive-clarify/shared";
import { TabBar } from "./TabBar";
import { QuestionPanel } from "./QuestionPanel";
import { SubmitBar } from "./SubmitBar";
import { getQuestionKey } from "./questionKey";

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
  const [answersByKey, setAnswersByKey] = useState<Record<string, string | string[]>>({});
  const autoAdvanceTimerRef = useRef<number | null>(null);

  const questionKeys = useMemo(
    () => questions.map((question, index) => getQuestionKey(question, index)),
    [questions],
  );

  const activeQuestion = questions[activeTab];
  const activeQuestionKey = activeQuestion ? questionKeys[activeTab] : undefined;

  const hasAnswer = useCallback((answer: string | string[] | undefined): boolean => {
    if (answer === undefined) return false;
    return Array.isArray(answer) ? answer.length > 0 : answer !== "";
  }, []);

  const isAnswered = useCallback(
    (index: number): boolean => {
      const questionKey = questionKeys[index];
      if (!questionKey) return false;
      return hasAnswer(answersByKey[questionKey]);
    },
    [answersByKey, hasAnswer, questionKeys],
  );

  const answeredCount = questions.filter((_, i) => isAnswered(i)).length;
  const allAnswered = answeredCount === questions.length;

  /** Find the next unanswered question after `from`, wrapping around. */
  const findNextUnanswered = useCallback(
    (from: number, answers: Record<string, string | string[]>): number | null => {
      for (let i = 1; i <= questions.length; i++) {
        const idx = (from + i) % questions.length;
        const questionKey = questionKeys[idx];
        if (questionKey && !hasAnswer(answers[questionKey])) return idx;
      }
      return null;
    },
    [hasAnswer, questionKeys, questions.length],
  );

  const handleAnswer = useCallback(
    (value: string | string[]) => {
      if (!activeQuestion || !activeQuestionKey) return;

      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }

      const nextAnswers = {
        ...answersByKey,
        [activeQuestionKey]: value,
      };

      setAnswersByKey((prev) => ({
        ...prev,
        [activeQuestionKey]: value,
      }));

      // For single-select, auto-advance to next unanswered question after a short delay
      if (!activeQuestion.multiSelect && typeof value === "string") {
        autoAdvanceTimerRef.current = window.setTimeout(() => {
          const next = findNextUnanswered(activeTab, nextAnswers);
          if (next !== null) {
            setActiveTab(next);
          }
          autoAdvanceTimerRef.current = null;
        }, 250);
      }
    },
    [activeQuestion, activeQuestionKey, activeTab, answersByKey, findNextUnanswered],
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
    return () => {
      window.removeEventListener("keydown", handler);
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, [goToPrev, goToNext, vscodeApi]);

  const serializedAnswers = useMemo<Record<string, string | string[]>>(
    () =>
      questions.reduce<Record<string, string | string[]>>((acc, question, index) => {
        const answer = answersByKey[questionKeys[index]];
        if (answer !== undefined) {
          acc[question.header] = answer;
        }
        return acc;
      }, {}),
    [answersByKey, questionKeys, questions],
  );

  const handleSubmit = useCallback(() => {
    vscodeApi.postMessage({ type: "submit", answers: serializedAnswers });
  }, [serializedAnswers, vscodeApi]);

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
          answer={activeQuestionKey ? answersByKey[activeQuestionKey] : undefined}
          onAnswer={handleAnswer}
        />
      )}

      <SubmitBar
        activeTab={activeTab}
        total={questions.length}
        answeredCount={answeredCount}
        allAnswered={allAnswered}
        onPrev={goToPrev}
        onNext={goToNext}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
};
