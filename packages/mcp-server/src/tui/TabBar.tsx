import React from "react";
import { Box, Text } from "ink";

interface TabBarProps {
  headers: string[];
  activeTab: number;
  answers: Record<string, string | string[]>;
  showSubmit: boolean;
}

/**
 * Horizontal tab bar showing question headers.
 * Active tab is highlighted with inverse colors.
 * Answered tabs show a checkmark indicator.
 */
export function TabBar({ headers, activeTab, answers, showSubmit }: TabBarProps): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1}>
      {headers.map((header, index) => {
        const isActive = activeTab === index;
        const isAnswered = answers[header] !== undefined;
        const label = `${isAnswered ? "\u2713 " : ""}${header}`;

        return (
          <Box key={header} paddingX={1}>
            <Text inverse={isActive} bold={isActive} color={isAnswered ? "green" : undefined}>
              {label}
            </Text>
          </Box>
        );
      })}

      {showSubmit && (
        <Box paddingX={1}>
          <Text
            inverse={activeTab === headers.length}
            bold={activeTab === headers.length}
            color="cyan"
          >
            Submit
          </Text>
        </Box>
      )}
    </Box>
  );
}
