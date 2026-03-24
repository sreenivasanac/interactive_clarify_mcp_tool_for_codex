# Debug Prompt: Interactive Clarify VS Code Extension

## Problem

I built a VS Code extension that renders a webview panel for an MCP tool called `interactive_clarify`. The webview shows clarifying questions with multiple options in a tab-based UI. There are several issues:

### Issue 1: CSS not rendering properly
The CSS file (`panel.css`) is extracted by esbuild as a separate file. I tried two approaches to load it:
1. `<link rel="stylesheet" href="${panelCssUri}">` — didn't work (likely CSP or URI resolution issue in the webview)
2. Inlining via `fs.readFileSync` in `getWebviewContent.ts` — still seems to not apply properly

The result is that option cards appear as white/light blocks with no dark-theme styling, no selection highlighting (blue border + glow), and no active tab indicator.

### Issue 2: Cancellation not working
When the user closes the VS Code tab or presses Escape, the MCP tool call should be cancelled and return immediately. Instead, Codex CLI keeps showing "Calling Interactive Clarify tool from Interactive Clarify MCP" indefinitely.

The flow:
1. User closes tab → `panel.onDidDispose` fires → calls `sendResponse({ status: "cancelled" })`
2. `sendResponse` calls `respond(response)` which calls `writeMessage(socket, response)` in `ipc-server.ts`
3. MCP server's `ipc-client.ts` should receive the response and reject with "User cancelled"
4. `tool-handler.ts` should catch this and return `{ status: "cancelled", isError: true }` without falling back to TUI

Something in this chain isn't working.

### Issue 3: Multi-select vs single-select
Need to verify that both modes work correctly. The `multiSelect` boolean on each question should toggle between radio (single) and checkbox (multi) behavior.

## Architecture

```
AI Agent (Codex CLI) → MCP stdio → MCP Server (Node.js) → Unix socket IPC → VS Code Extension → Webview Panel
                                                        ↘ Ink TUI fallback (renders to stderr)
```

## Build Commands

```bash
pnpm install
pnpm -r build      # builds shared → mcp-server → vscode-extension
cd packages/vscode-extension
npx @vscode/vsce package --no-dependencies --allow-missing-repository
code --install-extension interactive-clarify-vscode-0.1.0.vsix --force
# Then reload VS Code: Cmd+Shift+P → "Developer: Reload Window"
```

## Key Files to Focus On

The webview rendering pipeline:
- `packages/vscode-extension/src/webview/getWebviewContent.ts` — generates HTML, inlines CSS
- `packages/vscode-extension/src/webview/WebviewManager.ts` — creates webview panel
- `packages/vscode-extension/src/webview/panel/styles.css` — all CSS (uses VS Code CSS variables)
- `packages/vscode-extension/src/webview/panel/*.tsx` — React components

The cancellation pipeline:
- `packages/vscode-extension/src/webview/WebviewManager.ts` — `onDidDispose` handler
- `packages/vscode-extension/src/ipc-server.ts` — `writeMessage` back to MCP client
- `packages/mcp-server/src/ipc-client.ts` — receives response, rejects on "cancelled"
- `packages/mcp-server/src/tool-handler.ts` — catches rejection, returns cancellation result

## Source Code

### All source files follow:

#### `packages/vscode-extension/src/webview/panel/styles.css`

```css
/* ================================================================
   Interactive Clarify - VS Code Webview Styles (v2)
   ================================================================ */

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-editor-foreground, #cccccc);
  background-color: var(--vscode-editor-background, #1e1e1e);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ── Container ── */

.ic-container {
  max-width: 680px;
  margin: 0 auto;
  padding: 20px 20px 16px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Header ── */

.ic-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}

.ic-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ic-header__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--vscode-button-background, #007acc);
  color: var(--vscode-button-foreground, #fff);
  font-size: 14px;
  flex-shrink: 0;
}

.ic-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-editor-foreground, #cccccc);
}

.ic-progress {
  font-size: 11px;
  font-weight: 500;
  color: var(--vscode-descriptionForeground, #888);
  background: var(--vscode-badge-background, #4d4d4d);
  padding: 2px 10px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Tab Bar ── */

.ic-tab-bar {
  display: flex;
  gap: 2px;
  margin-bottom: 16px;
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
  border-bottom: 1px solid var(--vscode-widget-border, #393939);
  padding-bottom: 0;
}

.ic-tab-bar::-webkit-scrollbar {
  display: none;
}

.ic-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px 9px;
  border: none;
  background: transparent;
  color: var(--vscode-tab-inactiveForeground, #969696);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s ease;
  outline: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.ic-tab:hover {
  color: var(--vscode-editor-foreground, #cccccc);
}

.ic-tab--active {
  color: var(--vscode-editor-foreground, #ffffff);
  font-weight: 600;
  border-bottom-color: var(--vscode-button-background, #007acc);
}

.ic-tab__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

/* Unanswered tab index badge */
.ic-tab:not(.ic-tab--answered) .ic-tab__index {
  border: 1.5px solid var(--vscode-widget-border, #555);
  color: var(--vscode-descriptionForeground, #888);
  background: transparent;
}

.ic-tab--active:not(.ic-tab--answered) .ic-tab__index {
  border-color: var(--vscode-button-background, #007acc);
  color: var(--vscode-button-background, #007acc);
}

/* Answered tab index badge → green check */
.ic-tab--answered .ic-tab__index {
  border: none;
  background: #28a745;
  color: #fff;
}

.ic-tab__label {
  display: inline-block;
}

/* ── Question Panel ── */

.ic-question-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ic-question-counter {
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-button-background, #007acc);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ic-question-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--vscode-editor-foreground, #cccccc);
  line-height: 1.6;
}

.ic-select-hint {
  font-size: 11px;
  color: var(--vscode-descriptionForeground, #888);
  display: flex;
  align-items: center;
  gap: 6px;
}

.ic-select-hint__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1.5px solid var(--vscode-descriptionForeground, #888);
  font-size: 8px;
}

/* ── Option Cards ── */

.ic-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ic-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  border: 1.5px solid var(--vscode-widget-border, #393939);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--vscode-editor-foreground, #cccccc);
  font: inherit;
  transition: border-color 0.12s ease, background-color 0.12s ease, box-shadow 0.12s ease;
  outline: none;
}

.ic-option:hover {
  border-color: var(--vscode-focusBorder, #007acc);
  background: rgba(0, 122, 204, 0.08);
}

.ic-option:focus-visible {
  border-color: var(--vscode-focusBorder, #007acc);
  box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007acc);
}

/* ── Selected state ── */

.ic-option--selected {
  border-color: var(--vscode-button-background, #007acc);
  background: rgba(0, 122, 204, 0.15);
  box-shadow: 0 0 0 1px var(--vscode-button-background, #007acc);
}

.ic-option--selected:hover {
  background: rgba(0, 122, 204, 0.2);
}

/* ── Radio indicator ── */

.ic-indicator {
  flex-shrink: 0;
  margin-top: 2px;
}

.ic-radio {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--vscode-widget-border, #555);
  background: transparent;
  transition: all 0.15s ease;
}

.ic-radio--selected {
  border-color: var(--vscode-button-background, #007acc);
  background: var(--vscode-button-background, #007acc);
}

.ic-radio__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vscode-editor-background, #1e1e1e);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ic-radio--selected .ic-radio__dot {
  opacity: 1;
}

/* ── Checkbox indicator ── */

.ic-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid var(--vscode-widget-border, #555);
  background: transparent;
  transition: all 0.15s ease;
}

.ic-checkbox--selected {
  border-color: var(--vscode-button-background, #007acc);
  background: var(--vscode-button-background, #007acc);
}

.ic-checkbox__check {
  color: var(--vscode-editor-background, #fff);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ic-checkbox--selected .ic-checkbox__check {
  opacity: 1;
}

/* ── Option content ── */

.ic-option__body {
  flex: 1;
  min-width: 0;
}

.ic-option__label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.ic-option--selected .ic-option__label {
  color: var(--vscode-button-background, #007acc);
}

.ic-option__desc {
  font-size: 12px;
  color: var(--vscode-descriptionForeground, #999);
  line-height: 1.4;
  margin-top: 1px;
}

.ic-option--selected .ic-option__desc {
  color: var(--vscode-editor-foreground, #ccc);
}

.ic-option__recommended {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--vscode-button-background, #007acc);
  background: rgba(0, 122, 204, 0.15);
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 6px;
}

/* ── Preview Pane ── */

.ic-preview {
  margin-top: 6px;
  border: 1px solid var(--vscode-widget-border, #393939);
  border-radius: 6px;
  overflow: hidden;
  animation: ic-slide-down 0.15s ease;
}

@keyframes ic-slide-down {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ic-preview__header {
  padding: 6px 12px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vscode-descriptionForeground, #888);
  background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
  border-bottom: 1px solid var(--vscode-widget-border, #393939);
}

.ic-preview__content {
  padding: 10px 12px;
  font-family: var(--vscode-editor-font-family, "Cascadia Code", Consolas, monospace);
  font-size: 12px;
  line-height: 1.5;
  color: var(--vscode-editor-foreground, #cccccc);
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
}

/* ── Footer ── */

.ic-footer {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--vscode-widget-border, #393939);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ic-footer__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.ic-footer__nav {
  display: flex;
  gap: 6px;
}

.ic-footer__buttons {
  display: flex;
  gap: 8px;
}

.ic-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.12s ease, background-color 0.12s ease;
  outline: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ic-btn:focus-visible {
  outline: 2px solid var(--vscode-focusBorder, #007acc);
  outline-offset: 2px;
}

.ic-btn--primary {
  background: var(--vscode-button-background, #007acc);
  color: var(--vscode-button-foreground, #ffffff);
}

.ic-btn--primary:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground, #0062a3);
}

.ic-btn--primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ic-btn--secondary {
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  color: var(--vscode-button-secondaryForeground, #cccccc);
}

.ic-btn--secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground, #45494e);
}

.ic-btn--ghost {
  background: transparent;
  color: var(--vscode-descriptionForeground, #999);
  padding: 6px 10px;
}

.ic-btn--ghost:hover {
  color: var(--vscode-editor-foreground, #ccc);
  background: var(--vscode-list-hoverBackground, #2a2d2e);
}

.ic-btn--ghost:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Keyboard Hints ── */

.ic-hints {
  display: flex;
  justify-content: center;
  gap: 16px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground, #666);
}

.ic-hints__item {
  display: flex;
  align-items: center;
  gap: 4px;
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 1px solid var(--vscode-widget-border, #444);
  border-radius: 3px;
  background: var(--vscode-editorGroupHeader-tabsBackground, #2a2a2a);
  color: var(--vscode-descriptionForeground, #999);
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}

/* ── Empty State ── */

.ic-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--vscode-descriptionForeground, #888);
  font-style: italic;
}

/* ── Responsive ── */

@media (max-width: 480px) {
  .ic-container {
    padding: 12px;
  }

  .ic-tab {
    padding: 6px 10px 8px;
    font-size: 11px;
  }

  .ic-tab__index {
    width: 16px;
    height: 16px;
    font-size: 9px;
  }

  .ic-option {
    padding: 8px 10px;
  }

  .ic-footer__actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .ic-footer__buttons {
    justify-content: flex-end;
  }

  .ic-hints {
    flex-wrap: wrap;
    gap: 8px;
  }
}

```

#### `packages/vscode-extension/src/webview/panel/App.tsx`

```tsx
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

```

#### `packages/vscode-extension/src/webview/panel/TabBar.tsx`

```tsx
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

```

#### `packages/vscode-extension/src/webview/panel/QuestionPanel.tsx`

```tsx
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

```

#### `packages/vscode-extension/src/webview/panel/SubmitBar.tsx`

```tsx
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

```

#### `packages/vscode-extension/src/webview/panel/index.tsx`

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { QuestionItem } from "@interactive-clarify/shared";
import "./styles.css";

// Read injected questions data
const questions: QuestionItem[] =
  (window as unknown as { __INTERACTIVE_CLARIFY_QUESTIONS__: QuestionItem[] })
    .__INTERACTIVE_CLARIFY_QUESTIONS__ ?? [];

// Acquire VS Code webview API (can only be called once)
const vscodeApi = acquireVsCodeApi();

const rootEl = document.getElementById("root");
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App questions={questions} vscodeApi={vscodeApi} />);
}

```

#### `packages/vscode-extension/src/webview/panel/vscode.d.ts`

```ts
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface Window {
  __INTERACTIVE_CLARIFY_QUESTIONS__: import("@interactive-clarify/shared").QuestionItem[];
}

```

#### `packages/vscode-extension/src/webview/getWebviewContent.ts`

```ts
import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { QuestionItem } from "@interactive-clarify/shared";

/**
 * Generate a nonce string for CSP script tags.
 */
function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/**
 * Generates the full HTML document for the Interactive Clarify webview.
 *
 * @param webview - The webview instance (used for CSP source)
 * @param questions - The questions to inject into the page
 * @param panelJsUri - URI to the bundled panel.js script
 */
export function getWebviewContent(
  webview: vscode.Webview,
  questions: QuestionItem[],
  panelJsUri: vscode.Uri,
  extensionPath: string
): string {
  const nonce = getNonce();
  const cspSource = webview.cspSource;

  // Read the CSS file and inline it to guarantee it loads
  let cssContent = "";
  try {
    const cssPath = path.join(extensionPath, "webview-dist", "panel.css");
    cssContent = fs.readFileSync(cssPath, "utf-8");
  } catch {
    // CSS file missing — styles will be unstyled but functional
  }

  // Escape the questions JSON for safe embedding in a script tag
  const questionsJson = JSON.stringify(questions)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             font-src ${cspSource};">
  <title>Interactive Clarify</title>
  <style>${cssContent}</style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__INTERACTIVE_CLARIFY_QUESTIONS__ = ${questionsJson};
  </script>
  <script nonce="${nonce}" src="${panelJsUri}"></script>
</body>
</html>`;
}

```

#### `packages/vscode-extension/src/webview/WebviewManager.ts`

```ts
import * as vscode from "vscode";
import * as path from "node:path";
import type { QuestionItem, QuestionResponse } from "@interactive-clarify/shared";
import { getWebviewContent } from "./getWebviewContent";

/**
 * Manages the creation and lifecycle of the Interactive Clarify webview panel.
 */
export class WebviewManager {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Create and display a webview panel showing the given questions.
   *
   * @param questions - Array of questions to display
   * @param requestId - The IPC request ID for correlating the response
   * @param onResponse - Callback to send the response back via IPC
   */
  showQuestions(
    questions: QuestionItem[],
    requestId: string,
    onResponse: (response: QuestionResponse) => void
  ): void {
    let hasResponded = false;

    const sendResponse = (response: QuestionResponse): void => {
      if (hasResponded) {
        return;
      }
      hasResponded = true;
      onResponse(response);
    };

    // Path to the bundled webview assets
    const webviewDistPath = path.join(
      this.context.extensionPath,
      "webview-dist"
    );
    const webviewDistUri = vscode.Uri.file(webviewDistPath);

    const panel = vscode.window.createWebviewPanel(
      "interactiveClarify",
      "Interactive Clarify",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [webviewDistUri],
        retainContextWhenHidden: true,
      }
    );

    panel.iconPath = undefined;

    // Generate and set the webview HTML content
    const panelJsUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewDistPath, "panel.js"))
    );

    panel.webview.html = getWebviewContent(
      panel.webview,
      questions,
      panelJsUri,
      this.context.extensionPath
    );

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      (message: { type: string; answers?: Record<string, string | string[]>; annotations?: Record<string, { notes?: string }> }) => {
        switch (message.type) {
          case "submit":
            sendResponse({
              type: "question_response",
              requestId,
              status: "answered",
              answers: message.answers,
              annotations: message.annotations,
            });
            panel.dispose();
            break;

          case "cancel":
            sendResponse({
              type: "question_response",
              requestId,
              status: "cancelled",
            });
            panel.dispose();
            break;
        }
      },
      undefined,
      []
    );

    // If the panel is closed without responding, send a cancelled response
    panel.onDidDispose(() => {
      sendResponse({
        type: "question_response",
        requestId,
        status: "cancelled",
      });
    });
  }
}

```

#### `packages/vscode-extension/src/extension.ts`

```ts
import * as vscode from "vscode";
import { IpcServer } from "./ipc-server";
import { WebviewManager } from "./webview/WebviewManager";
import type { QuestionRequest, QuestionResponse } from "@interactive-clarify/shared";

let ipcServer: IpcServer | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Interactive Clarify");
  outputChannel.appendLine("Interactive Clarify extension activating...");

  ipcServer = new IpcServer(outputChannel);

  ipcServer.on(
    "question",
    (request: QuestionRequest, respond: (response: QuestionResponse) => void) => {
      outputChannel.appendLine(
        `Received question request: ${request.requestId} with ${request.questions.length} question(s)`
      );

      const webviewManager = new WebviewManager(context);
      webviewManager.showQuestions(
        request.questions,
        request.requestId,
        (response: QuestionResponse) => {
          outputChannel.appendLine(
            `Sending response for ${request.requestId}: ${response.status}`
          );
          respond(response);
        }
      );
    }
  );

  ipcServer.start().then(
    () => outputChannel.appendLine("IPC server started successfully."),
    (err) => {
      outputChannel.appendLine(`Failed to start IPC server: ${err}`);
      vscode.window.showErrorMessage(
        `Interactive Clarify: Failed to start IPC server. ${err}`
      );
    }
  );

  const showPanelCmd = vscode.commands.registerCommand(
    "interactiveClarify.showPanel",
    () => {
      vscode.window.showInformationMessage(
        "Interactive Clarify: Waiting for questions from an MCP client..."
      );
    }
  );

  context.subscriptions.push(
    { dispose: () => ipcServer?.stop() },
    outputChannel,
    showPanelCmd
  );
}

export function deactivate(): void {
  if (ipcServer) {
    ipcServer.stop();
    ipcServer = undefined;
  }
}

```

#### `packages/vscode-extension/src/ipc-server.ts`

```ts
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import type * as vscode from "vscode";
import {
  resolveSocketPath,
  createMessageReader,
  writeMessage,
  type QuestionRequest,
  type QuestionResponse,
  type IpcMessage,
} from "@interactive-clarify/shared";

/**
 * Unix domain socket server that listens for question requests
 * from the MCP server and emits them as events.
 *
 * Events:
 *   'question' -> (request: QuestionRequest, respond: (response: QuestionResponse) => void)
 */
export class IpcServer extends EventEmitter {
  private server: net.Server | undefined;
  private socketPath: string | undefined;
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    super();
    this.outputChannel = outputChannel;
  }

  /** Start listening on the IPC socket. */
  async start(): Promise<void> {
    this.socketPath = resolveSocketPath();
    this.outputChannel.appendLine(`IPC socket path: ${this.socketPath}`);

    // Ensure parent directory exists
    const parentDir = path.dirname(this.socketPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
      this.outputChannel.appendLine(`Created directory: ${parentDir}`);
    }

    // Remove stale socket file if it exists
    if (fs.existsSync(this.socketPath)) {
      this.outputChannel.appendLine("Removing stale socket file...");
      fs.unlinkSync(this.socketPath);
    }

    return new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on("error", (err) => {
        this.outputChannel.appendLine(`IPC server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        this.outputChannel.appendLine("IPC server listening.");
        // Restrict socket permissions on Unix
        if (this.socketPath) {
          try {
            fs.chmodSync(this.socketPath, 0o600);
          } catch {
            // Non-critical; some platforms may not support chmod on sockets
          }
        }
        resolve();
      });
    });
  }

  /** Stop the server and clean up the socket file. */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }

    if (this.socketPath && fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
        this.outputChannel.appendLine("Removed socket file.");
      } catch {
        // Best-effort cleanup
      }
    }
  }

  /** Handle a new client connection. */
  private handleConnection(socket: net.Socket): void {
    this.outputChannel.appendLine("Client connected to IPC server.");

    const reader = createMessageReader((msg: IpcMessage) => {
      this.handleMessage(msg, socket);
    });

    socket.on("data", reader);

    socket.on("error", (err) => {
      this.outputChannel.appendLine(`Client socket error: ${err.message}`);
    });

    socket.on("close", () => {
      this.outputChannel.appendLine("Client disconnected.");
    });
  }

  /** Route an incoming IPC message. */
  private handleMessage(msg: IpcMessage, socket: net.Socket): void {
    switch (msg.type) {
      case "ping":
        writeMessage(socket, { type: "pong" });
        break;

      case "question_request": {
        const request = msg as QuestionRequest;
        const respond = (response: QuestionResponse): void => {
          if (!socket.destroyed) {
            writeMessage(socket, response);
          }
        };
        this.emit("question", request, respond);
        break;
      }

      default:
        this.outputChannel.appendLine(
          `Unhandled IPC message type: ${(msg as IpcMessage).type}`
        );
    }
  }
}

```

#### `packages/vscode-extension/package.json`

```json
{
  "name": "interactive-clarify-vscode",
  "displayName": "Interactive Clarify",
  "description": "Rich UI for AI coding agent clarifying questions via MCP",
  "version": "0.1.0",
  "publisher": "interactive-clarify",
  "engines": {
    "vscode": "^1.95.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "interactiveClarify.showPanel",
        "title": "Interactive Clarify: Show Questions Panel"
      }
    ]
  },
  "scripts": {
    "build:webview": "esbuild src/webview/panel/index.tsx --bundle --outfile=webview-dist/panel.js --format=iife --target=es2020 --loader:.css=css --define:process.env.NODE_ENV=\\\"production\\\"",
    "build:extension": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --format=cjs --platform=node --external:vscode",
    "build": "pnpm run build:webview && pnpm run build:extension",
    "dev": "pnpm run build",
    "package": "pnpm run build && vsce package"
  },
  "dependencies": {
    "@interactive-clarify/shared": "workspace:*"
  },
  "devDependencies": {
    "@markdown-ui/marked-ext": "^1.4.0",
    "@markdown-ui/react": "^0.4.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/vscode": "^1.95.0",
    "@vscode/vsce": "^3.7.1",
    "esbuild": "^0.25.0",
    "marked": "^15.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.7.0"
  }
}

```

#### `packages/mcp-server/src/tool-handler.ts`

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { InteractiveClarifyInput, InteractiveClarifyOutput } from "@interactive-clarify/shared";
import { askViaIpc } from "./ipc-client.js";
import { askViaTui } from "./tui/render-tui.js";

/** Thrown when the user explicitly cancels (close tab, Esc, Cancel button). */
class UserCancelledError extends Error {
  constructor(message = "User cancelled") {
    super(message);
    this.name = "UserCancelledError";
  }
}

/**
 * Handle an interactive_clarify tool call.
 *
 * Strategy: try the IPC path first (VS Code extension),
 * and fall back to the built-in Ink TUI only if the IPC connection itself fails.
 * If the user explicitly cancels, return immediately — do NOT fall back to TUI.
 */
export async function handleInteractiveClarify(
  input: InteractiveClarifyInput,
): Promise<CallToolResult> {
  let output: InteractiveClarifyOutput;

  try {
    output = await askViaIpc(input);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // User explicitly cancelled — return a cancellation result, don't fall back to TUI
    if (message === "User cancelled") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "cancelled",
              message: "User cancelled the clarifying questions.",
            }),
          },
        ],
        isError: true,
      };
    }

    // IPC connection failed — fall back to TUI
    try {
      output = await askViaTui(input);
    } catch (tuiErr: unknown) {
      const tuiMessage = tuiErr instanceof Error ? tuiErr.message : String(tuiErr);

      if (tuiMessage === "User cancelled") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "cancelled",
                message: "User cancelled the clarifying questions.",
              }),
            },
          ],
          isError: true,
        };
      }

      throw tuiErr;
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify(output) }],
  };
}

```

#### `packages/mcp-server/src/ipc-client.ts`

```ts
import * as net from "node:net";
import * as crypto from "node:crypto";
import {
  resolveSocketPath,
  writeMessage,
  createMessageReader,
  IPC_CONNECT_TIMEOUT,
  RESPONSE_TIMEOUT,
} from "@interactive-clarify/shared";
import type {
  InteractiveClarifyInput,
  InteractiveClarifyOutput,
  QuestionRequest,
  QuestionResponse,
  IpcMessage,
} from "@interactive-clarify/shared";

/**
 * Ask the user via the IPC channel (e.g. VS Code extension).
 *
 * Connects to the Unix domain socket, sends a QuestionRequest,
 * and waits for a matching QuestionResponse.
 */
export function askViaIpc(input: InteractiveClarifyInput): Promise<InteractiveClarifyOutput> {
  return new Promise<InteractiveClarifyOutput>((resolve, reject) => {
    const socketPath = resolveSocketPath();
    const requestId = crypto.randomUUID();
    const socket = new net.Socket();

    let settled = false;

    function settle(fn: () => void): void {
      if (!settled) {
        settled = true;
        fn();
        cleanup();
      }
    }

    // -- Timeouts --

    // Connection timeout: reject if we can't connect quickly
    const connectTimer = setTimeout(() => {
      settle(() => reject(new Error("IPC connection timeout")));
    }, IPC_CONNECT_TIMEOUT);

    // Response timeout: reject if user takes too long
    let responseTimer: ReturnType<typeof setTimeout> | undefined;

    // -- Cleanup --

    function cleanup(): void {
      clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      socket.removeAllListeners();
      socket.destroy();
    }

    // -- Socket events --

    socket.on("error", (err) => {
      settle(() => reject(err));
    });

    socket.on("close", () => {
      settle(() => reject(new Error("IPC socket closed before response")));
    });

    socket.connect(socketPath, () => {
      clearTimeout(connectTimer);

      // Connection established -- send the request
      const request: QuestionRequest = {
        type: "question_request",
        requestId,
        timestamp: Date.now(),
        questions: input.questions,
      };
      writeMessage(socket, request);

      // Start the response timeout
      responseTimer = setTimeout(() => {
        settle(() => reject(new Error("IPC response timeout")));
      }, RESPONSE_TIMEOUT);

      // Listen for the matching response
      const reader = createMessageReader((msg: IpcMessage) => {
        if (msg.type !== "question_response") return;

        const response = msg as QuestionResponse;
        if (response.requestId !== requestId) return;

        if (response.status === "cancelled") {
          settle(() => reject(new Error("User cancelled")));
          return;
        }

        if (response.status === "timeout") {
          settle(() => reject(new Error("Response timed out on host side")));
          return;
        }

        // status === "answered"
        settle(() =>
          resolve({
            answers: response.answers ?? {},
            annotations: response.annotations,
          }),
        );
      });

      socket.on("data", reader);
    });
  });
}

```

#### `packages/mcp-server/src/index.ts`

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TOOL_NAME } from "@interactive-clarify/shared";
import { handleInteractiveClarify } from "./tool-handler.js";

const server = new McpServer({
  name: "interactive-clarify",
  version: "0.1.0",
});

server.tool(
  TOOL_NAME,
  "Present clarifying questions to the user with multiple options. Questions are shown one-by-one in a tab-based interface. Use this when you need user input before proceeding with a task.",
  {
    questions: z.array(
      z.object({
        question: z.string().describe("The full question text (markdown supported)."),
        header: z
          .string()
          .max(12)
          .describe('Short tab label, max 12 characters (e.g. "Auth method", "Database").'),
        options: z
          .array(
            z.object({
              label: z.string().describe("Display text for this option (1-5 words)."),
              description: z.string().describe("What this option means or what happens if chosen."),
              preview: z
                .string()
                .optional()
                .describe("Optional markdown preview content shown when focused."),
            }),
          )
          .describe("The available choices (2-4 options)."),
        multiSelect: z
          .boolean()
          .optional()
          .describe("Allow selecting multiple options. Default: false."),
      }),
    ),
  },
  async (input) => {
    return handleInteractiveClarify(input);
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server fatal error:", err);
  process.exit(1);
});

```

#### `packages/mcp-server/package.json`

```json
{
  "name": "@interactive-clarify/mcp-server",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "interactive-clarify-mcp": "./dist/bin/ask-user-mcp.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/bin/ask-user-mcp.js"
  },
  "dependencies": {
    "@interactive-clarify/shared": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^3.24.0",
    "ink": "^5.1.0",
    "@inkjs/ui": "^2.0.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}

```

#### `packages/shared/src/types.ts`

```ts
/** A single option within a clarifying question. */
export interface OptionItem {
  /** Display text for this option (1-5 words). */
  label: string;
  /** What this option means or what happens if chosen. */
  description: string;
  /** Optional markdown preview content shown when this option is focused. */
  preview?: string;
}

/** A single clarifying question with multiple options. */
export interface QuestionItem {
  /** The full question text (markdown supported). */
  question: string;
  /** Short tab label, max 12 characters (e.g. "Auth method", "Database"). */
  header: string;
  /** The available choices (2-4 options). */
  options: OptionItem[];
  /** Allow selecting multiple options. Default: false. */
  multiSelect?: boolean;
}

/** Input payload for the interactive_clarify MCP tool. */
export interface InteractiveClarifyInput {
  questions: QuestionItem[];
}

/** Output payload returned by the interactive_clarify MCP tool. */
export interface InteractiveClarifyOutput {
  /** Map of question header -> selected answer(s). */
  answers: Record<string, string | string[]>;
  /** Optional per-question annotations (notes, etc). */
  annotations?: Record<string, { notes?: string }>;
}

```

#### `packages/shared/src/ipc-protocol.ts`

```ts
import * as path from "node:path";
import * as os from "node:os";
import * as net from "node:net";
import type { QuestionItem } from "./types.js";
import { SOCKET_FILENAME } from "./constants.js";

// ── IPC Message Types ──

export interface QuestionRequest {
  type: "question_request";
  requestId: string;
  timestamp: number;
  questions: QuestionItem[];
}

export interface QuestionResponse {
  type: "question_response";
  requestId: string;
  status: "answered" | "cancelled" | "timeout";
  answers?: Record<string, string | string[]>;
  annotations?: Record<string, { notes?: string }>;
}

export interface PingMessage {
  type: "ping";
}

export interface PongMessage {
  type: "pong";
}

export type IpcMessage =
  | QuestionRequest
  | QuestionResponse
  | PingMessage
  | PongMessage;

// ── Socket Path Resolution ──

/**
 * Resolves the IPC socket path.
 * Priority:
 *  1. INTERACTIVE_CLARIFY_SOCKET env var
 *  2. XDG_RUNTIME_DIR/interactive-clarify.sock (Linux)
 *  3. ~/.interactive-clarify/ipc.sock (macOS / fallback)
 */
export function resolveSocketPath(): string {
  if (process.env.INTERACTIVE_CLARIFY_SOCKET) {
    return process.env.INTERACTIVE_CLARIFY_SOCKET;
  }

  if (process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, SOCKET_FILENAME);
  }

  return path.join(os.homedir(), ".interactive-clarify", "ipc.sock");
}

// ── Length-Prefixed Message Framing ──
// Each message: [4-byte BE length][UTF-8 JSON payload]

/** Write a length-prefixed JSON message to a socket. */
export function writeMessage(socket: net.Socket, msg: IpcMessage): void {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  socket.write(Buffer.concat([header, payload]));
}

/**
 * Creates a message reader that accumulates data from a socket
 * and invokes the callback for each complete message.
 */
export function createMessageReader(
  onMessage: (msg: IpcMessage) => void,
): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);

  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const msgLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + msgLen) {
        break; // incomplete message, wait for more data
      }

      const jsonBuf = buffer.subarray(4, 4 + msgLen);
      buffer = buffer.subarray(4 + msgLen);

      try {
        const msg = JSON.parse(jsonBuf.toString("utf-8")) as IpcMessage;
        onMessage(msg);
      } catch {
        // malformed message, skip
      }
    }
  };
}

```

#### `packages/shared/src/constants.ts`

```ts
/** How long to wait for IPC connection to VS Code extension (ms). */
export const IPC_CONNECT_TIMEOUT = 2000;

/** How long to wait for user to answer questions (ms). 5 minutes. */
export const RESPONSE_TIMEOUT = 5 * 60 * 1000;

/** Protocol version for IPC messages. */
export const PROTOCOL_VERSION = "0.1.0";

/** MCP tool name. */
export const TOOL_NAME = "interactive_clarify";

/** Socket file name. */
export const SOCKET_FILENAME = "interactive-clarify.sock";

```

#### `packages/shared/src/index.ts`

```ts
export type {
  OptionItem,
  QuestionItem,
  InteractiveClarifyInput,
  InteractiveClarifyOutput,
} from "./types.js";

export {
  IPC_CONNECT_TIMEOUT,
  RESPONSE_TIMEOUT,
  PROTOCOL_VERSION,
  TOOL_NAME,
  SOCKET_FILENAME,
} from "./constants.js";

export type {
  QuestionRequest,
  QuestionResponse,
  PingMessage,
  PongMessage,
  IpcMessage,
} from "./ipc-protocol.js";

export {
  resolveSocketPath,
  writeMessage,
  createMessageReader,
} from "./ipc-protocol.js";

```

#### `packages/shared/package.json`

```json
{
  "name": "@interactive-clarify/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}

```

#### `package.json`

```json
{
  "name": "interactive-clarify",
  "private": true,
  "description": "Universal 'Ask User Questions' MCP tool for AI coding agents",
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm -r --parallel dev",
    "clean": "pnpm -r exec rm -rf dist webview-dist"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}

```

#### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx"
  }
}

```
