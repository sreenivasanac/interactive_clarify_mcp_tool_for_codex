import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import type { QuestionItem, InteractiveClarifyOutput } from "@interactive-clarify/shared";
import { TabBar } from "./TabBar.js";
import { QuestionView } from "./QuestionView.js";

interface AppProps {
  questions: QuestionItem[];
  onComplete: (output: InteractiveClarifyOutput) => void;
  onCancel: () => void;
}

/**
 * Main TUI application component.
 *
 * Shows a tab bar at the top with question headers, the active question below,
 * and a submit option once all questions have been answered.
 */
export function App({ questions, onComplete, onCancel }: AppProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // Track whether we're on the "submit" pseudo-tab
  const isOnSubmit = activeTab === questions.length;
  const allAnswered = questions.every((q) => answers[q.header] !== undefined);

  const handleAnswer = useCallback(
    (header: string, value: string | string[]) => {
      setAnswers((prev) => ({ ...prev, [header]: value }));

      // Auto-advance to the next unanswered question or submit
      const nextUnanswered = questions.findIndex(
        (q, i) => i > activeTab && answers[q.header] === undefined,
      );
      if (nextUnanswered !== -1) {
        setActiveTab(nextUnanswered);
      } else {
        // All done (or remaining are already answered) -- go to submit
        setActiveTab(questions.length);
      }
    },
    [activeTab, answers, questions],
  );

  // Keyboard navigation for tabs
  useInput((input, key) => {
    if (input === "q") {
      onCancel();
      return;
    }

    // Tab / right arrow = next tab
    if (key.tab && !key.shift) {
      setActiveTab((prev) => Math.min(prev + 1, questions.length));
      return;
    }
    if (key.rightArrow) {
      setActiveTab((prev) => Math.min(prev + 1, questions.length));
      return;
    }

    // Shift+Tab / left arrow = previous tab
    if (key.tab && key.shift) {
      setActiveTab((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (key.leftArrow) {
      setActiveTab((prev) => Math.max(prev - 1, 0));
      return;
    }

    // Enter on submit tab
    if (key.return && isOnSubmit && allAnswered) {
      onComplete({ answers });
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <TabBar
        headers={questions.map((q) => q.header)}
        activeTab={activeTab}
        answers={answers}
        showSubmit={true}
      />

      <Box marginTop={1}>
        {isOnSubmit ? (
          <Box flexDirection="column">
            {allAnswered ? (
              <>
                <Text bold color="green">
                  All questions answered! Press Enter to submit.
                </Text>
                <Box marginTop={1} flexDirection="column">
                  {questions.map((q) => (
                    <Text key={q.header}>
                      <Text bold>{q.header}:</Text>{" "}
                      {Array.isArray(answers[q.header])
                        ? (answers[q.header] as string[]).join(", ")
                        : answers[q.header]}
                    </Text>
                  ))}
                </Box>
              </>
            ) : (
              <Text color="yellow">
                Please answer all questions before submitting. Use arrow keys to navigate tabs.
              </Text>
            )}
          </Box>
        ) : (
          <QuestionView
            question={questions[activeTab]!}
            currentAnswer={answers[questions[activeTab]!.header]}
            onAnswer={(value) => handleAnswer(questions[activeTab]!.header, value)}
          />
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Tab/Arrow keys: navigate | Enter: select | q: cancel
        </Text>
      </Box>
    </Box>
  );
}
