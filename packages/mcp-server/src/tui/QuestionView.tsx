import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { QuestionItem, OptionItem } from "@interactive-clarify/shared";

interface QuestionViewProps {
  question: QuestionItem;
  currentAnswer: string | string[] | undefined;
  onAnswer: (value: string | string[]) => void;
}

/**
 * Renders a single question with its options.
 *
 * For single-select: arrow keys to move focus, Enter to select.
 * For multi-select: arrow keys to move focus, Space to toggle, Enter to confirm.
 * Shows the focused option's description below the list.
 * If an option has a preview, displays it in a bordered box.
 */
export function QuestionView({
  question,
  currentAnswer,
  onAnswer,
}: QuestionViewProps): React.ReactElement {
  const [focusIndex, setFocusIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const options = question.options;
  const focusedOption: OptionItem | undefined = options[focusIndex];

  // Clamp focus index if options change
  const clampedFocus = Math.min(focusIndex, options.length - 1);
  if (clampedFocus !== focusIndex) {
    setFocusIndex(clampedFocus);
  }

  useInput((input, key) => {
    // Navigate options with up/down arrow keys
    if (key.upArrow) {
      setFocusIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (key.downArrow) {
      setFocusIndex((prev) => Math.min(prev + 1, options.length - 1));
      return;
    }

    if (question.multiSelect) {
      // Space toggles selection in multi-select mode
      if (input === " " && focusedOption) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(focusedOption.label)) {
            next.delete(focusedOption.label);
          } else {
            next.add(focusedOption.label);
          }
          return next;
        });
        return;
      }

      // Enter confirms multi-select
      if (key.return && selected.size > 0) {
        onAnswer(Array.from(selected));
      }
    } else {
      // Enter selects in single-select mode
      if (key.return && focusedOption) {
        onAnswer(focusedOption.label);
      }
    }
  });

  return (
    <Box flexDirection="column">
      {/* Question text */}
      <Box marginBottom={1}>
        <Text bold>{question.question}</Text>
      </Box>

      {/* Current answer indicator */}
      {currentAnswer !== undefined && (
        <Box marginBottom={1}>
          <Text dimColor>
            Current answer:{" "}
            {Array.isArray(currentAnswer) ? currentAnswer.join(", ") : currentAnswer}
          </Text>
        </Box>
      )}

      {/* Options list */}
      <Box flexDirection="column">
        {options.map((opt, index) => {
          const isFocused = index === focusIndex;
          const isSelected = selected.has(opt.label);

          return (
            <Box key={opt.label}>
              <Text>
                {isFocused ? "\u276f " : "  "}
                {question.multiSelect && (
                  <Text>{isSelected ? "[\u2713] " : "[ ] "}</Text>
                )}
                <Text inverse={isFocused} bold={isFocused}>
                  {opt.label}
                </Text>
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Hint text */}
      <Box marginTop={1}>
        <Text dimColor>
          {question.multiSelect
            ? "Up/Down: navigate | Space: toggle | Enter: confirm"
            : "Up/Down: navigate | Enter: select"}
        </Text>
      </Box>

      {/* Description of focused option */}
      {focusedOption && (
        <Box marginTop={1}>
          <Text color="gray">{focusedOption.description}</Text>
        </Box>
      )}

      {/* Preview box for focused option (if available) */}
      {focusedOption?.preview && (
        <Box
          marginTop={1}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          paddingY={0}
          flexDirection="column"
        >
          <Text dimColor bold>
            Preview
          </Text>
          <Text>{focusedOption.preview}</Text>
        </Box>
      )}
    </Box>
  );
}
