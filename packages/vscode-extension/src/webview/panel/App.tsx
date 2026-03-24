import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  type InteractiveClarifyOutput,
  type QuestionItem,
} from "@interactive-clarify/shared";
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

type AnswerValue = string | string[];
type QuestionAnnotation = { notes?: string; optionNotes?: Record<string, string> };

interface PersistedAppState {
  activeTab: number;
  answersByKey: Record<string, AnswerValue>;
  annotationsByKey: Record<string, QuestionAnnotation>;
  questionKeys: string[];
}

const UNANSWERED_VALUE = "Question not answered";
const RESPONSE_TIMEOUT_MS = 20 * 60 * 1000;
const WARNING_THRESHOLD_MS = 4 * 60 * 1000;

function isAnswerValue(value: unknown): value is AnswerValue {
  return (
    typeof value === "string" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function getInitialState(savedState: unknown, questionKeys: string[]): PersistedAppState {
  const fallbackState: PersistedAppState = {
    activeTab: 0,
    answersByKey: {},
    annotationsByKey: {},
    questionKeys,
  };

  if (!savedState || typeof savedState !== "object") {
    return fallbackState;
  }

  const candidateState = savedState as Partial<PersistedAppState>;
  const savedQuestionKeys = Array.isArray(candidateState.questionKeys)
    ? candidateState.questionKeys.filter((key): key is string => typeof key === "string")
    : [];

  if (
    savedQuestionKeys.length !== questionKeys.length ||
    savedQuestionKeys.some((key, index) => key !== questionKeys[index])
  ) {
    return fallbackState;
  }

  const answersByKey =
    candidateState.answersByKey && typeof candidateState.answersByKey === "object"
      ? Object.fromEntries(
          Object.entries(candidateState.answersByKey).filter(
            ([key, value]) => questionKeys.includes(key) && isAnswerValue(value),
          ),
        )
      : {};

  const annotationsByKey =
    candidateState.annotationsByKey && typeof candidateState.annotationsByKey === "object"
      ? Object.fromEntries(
          Object.entries(candidateState.annotationsByKey).filter(
            ([key, value]) => questionKeys.includes(key) && value && typeof value === "object",
          ),
        ) as Record<string, QuestionAnnotation>
      : {};

  const activeTab =
    typeof candidateState.activeTab === "number" &&
    Number.isInteger(candidateState.activeTab) &&
    candidateState.activeTab >= 0 &&
    candidateState.activeTab < questionKeys.length
      ? candidateState.activeTab
      : 0;

  return {
    activeTab,
    answersByKey,
    annotationsByKey,
    questionKeys,
  };
}

export const App: React.FC<AppProps> = ({ questions, vscodeApi }) => {
  const questionKeys = useMemo(
    () => questions.map((question, index) => getQuestionKey(question, index)),
    [questions],
  );
  const initialState = useMemo(
    () => getInitialState(vscodeApi.getState(), questionKeys),
    [questionKeys, vscodeApi],
  );
  const [activeTab, setActiveTab] = useState(initialState.activeTab);
  const [answersByKey, setAnswersByKey] = useState<Record<string, AnswerValue>>(initialState.answersByKey);
  const [annotationsByKey, setAnnotationsByKey] = useState<Record<string, QuestionAnnotation>>(
    initialState.annotationsByKey,
  );
  const [now, setNow] = useState(() => Date.now());
  const [warningShown, setWarningShown] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [requesterDisconnected, setRequesterDisconnected] = useState(false);
  const startedAt = useMemo(() => Date.now(), []);

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

  useEffect(() => {
    setActiveTab(initialState.activeTab);
    setAnswersByKey(initialState.answersByKey);
    setAnnotationsByKey(initialState.annotationsByKey);
  }, [initialState]);

  useEffect(() => {
    vscodeApi.setState({
      activeTab,
      answersByKey,
      annotationsByKey,
      questionKeys,
    } satisfies PersistedAppState);
  }, [activeTab, answersByKey, annotationsByKey, questionKeys, vscodeApi]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string } | undefined;
      if (data?.type === "requester_disconnected") {
        setRequesterDisconnected(true);
      }
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
    };
  }, []);

  const answeredCount = questions.filter((_, i) => isAnswered(i)).length;
  const remainingMs = Math.max(0, RESPONSE_TIMEOUT_MS - (now - startedAt));
  const showTimeoutWarning = remainingMs <= WARNING_THRESHOLD_MS;
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
  const remainingLabel = `${remainingMinutes}:${String(remainingSeconds).padStart(2, "0")}`;

  useEffect(() => {
    if (!showTimeoutWarning || warningShown) return;
    setWarningShown(true);
    window.alert(
      "Interactive Clarify will time out in less than 4 minutes. You can still submit partial answers.",
    );
  }, [showTimeoutWarning, warningShown]);

  const handleAnswer = useCallback(
    (value: AnswerValue) => {
      if (!activeQuestionKey) return;

      setAnswersByKey((prev) => ({
        ...prev,
        [activeQuestionKey]: value,
      }));
    },
    [activeQuestionKey],
  );

  const handleOptionNoteChange = useCallback(
    (optionKey: string, notes: string) => {
      if (!activeQuestionKey) return;

      setAnnotationsByKey((prev) => {
        const current = prev[activeQuestionKey] ?? {};
        const nextOptionNotes = { ...(current.optionNotes ?? {}) };

        if (notes.trim()) {
          nextOptionNotes[optionKey] = notes;
        } else {
          delete nextOptionNotes[optionKey];
        }

        const nextAnnotation: QuestionAnnotation = {
          ...current,
          optionNotes: nextOptionNotes,
        };

        if (Object.keys(nextOptionNotes).length === 0) {
          delete nextAnnotation.optionNotes;
        }

        return {
          ...prev,
          [activeQuestionKey]: nextAnnotation,
        };
      });
    },
    [activeQuestionKey],
  );

  const goToPrev = useCallback(() => {
    if (questions.length <= 1) return;
    setActiveTab((tabIndex) => (tabIndex === 0 ? questions.length - 1 : tabIndex - 1));
  }, [questions.length]);

  const goToNext = useCallback(() => {
    if (questions.length <= 1) return;
    setActiveTab((tabIndex) => (tabIndex + 1) % questions.length);
  }, [questions.length]);

  const serializedOutput = useMemo<InteractiveClarifyOutput>(() => {
    const answers = questions.reduce<Record<string, string | string[]>>((acc, question, index) => {
      const answer = answersByKey[questionKeys[index]];
      acc[question.header] = hasAnswer(answer) ? answer : UNANSWERED_VALUE;
      return acc;
    }, {});

    const answerItems = questions.map((question, index) => {
      const answer = answersByKey[questionKeys[index]];
      return {
        id: question.id,
        header: question.header,
        answer: hasAnswer(answer) ? answer : UNANSWERED_VALUE,
      };
    });

    const annotations = Object.fromEntries(
      Object.entries(annotationsByKey).filter(([, value]) => {
        if (!value || typeof value !== "object") return false;
        return Boolean(value.notes) || Boolean(value.optionNotes && Object.keys(value.optionNotes).length > 0);
      }),
    );

    return {
      answers,
      answerItems,
      annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
    };
  }, [annotationsByKey, answersByKey, hasAnswer, questionKeys, questions]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const target = e.target;
      const activeElement = target instanceof HTMLElement ? target : null;
      const tag = activeElement?.tagName;
      const isTextEntryTarget = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const isInteractiveTarget = Boolean(
        activeElement?.closest(
          "button, input, textarea, select, a, [role='button'], [role='radio'], [role='checkbox'], [role='tab']",
        ),
      );

      if (e.key === "ArrowLeft") {
        if (isTextEntryTarget || isInteractiveTarget) return;
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight") {
        if (isTextEntryTarget || isInteractiveTarget) return;
        e.preventDefault();
        goToNext();
      } else if (e.key === "Enter" && !isInteractiveTarget) {
        e.preventDefault();
        vscodeApi.postMessage({ type: "submit", ...serializedOutput });
      } else if (e.key === "Escape" && !isTextEntryTarget) {
        e.preventDefault();
        setShowCancelConfirm(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [goToPrev, goToNext, serializedOutput, vscodeApi]);

  const handleSubmit = useCallback(() => {
    vscodeApi.postMessage({ type: "submit", ...serializedOutput });
  }, [serializedOutput, vscodeApi]);

  const handleCancel = useCallback(() => {
    setShowCancelConfirm(true);
  }, []);

  const handleDismissCancel = useCallback(() => {
    setShowCancelConfirm(false);
  }, []);

  const handleConfirmCancel = useCallback(() => {
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
    <main className="ic-container">
      <div className="ic-header">
        <div className="ic-header__left">
          <div className="ic-header__icon" aria-hidden="true">
            ?
          </div>
          <h2 className="ic-title">Interactive Clarify</h2>
        </div>
        <span className="ic-progress" aria-live="polite">
          {answeredCount} of {questions.length} answered
        </span>
      </div>

      {showTimeoutWarning && (
        <div className="ic-timeout" role="alert" aria-live="assertive">
          Session expires in {remainingLabel}. You can submit partial answers.
        </div>
      )}

      {requesterDisconnected && (
        <div className="ic-lateMode" role="status" aria-live="polite">
          Live link ended. You can still submit. Your response will be saved for the coding agent to fetch later.
        </div>
      )}

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
          optionNotes={activeQuestionKey ? annotationsByKey[activeQuestionKey]?.optionNotes : undefined}
          onAnswer={handleAnswer}
          onOptionNoteChange={handleOptionNoteChange}
        />
      )}

      <SubmitBar
        activeTab={activeTab}
        total={questions.length}
        answeredCount={answeredCount}
        onPrev={goToPrev}
        onNext={goToNext}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />

      {showCancelConfirm && (
        <div className="ic-modalBackdrop" role="presentation">
          <div
            className="ic-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ic-cancel-title"
            aria-describedby="ic-cancel-body"
          >
            <h3 className="ic-modal__title" id="ic-cancel-title">
              Cancel this questionnaire?
            </h3>
            <p className="ic-modal__body" id="ic-cancel-body">
              This request will be cancelled. Your draft remains in the current session state.
            </p>
            <div className="ic-modal__actions">
              <button className="ic-btn ic-btn--ghost" type="button" onClick={handleDismissCancel}>
                Keep editing
              </button>
              <button className="ic-btn ic-btn--secondary" type="button" onClick={handleConfirmCancel}>
                Yes, cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
