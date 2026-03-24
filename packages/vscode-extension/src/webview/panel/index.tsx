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
