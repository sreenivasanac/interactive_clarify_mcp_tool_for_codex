declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface Window {
  __INTERACTIVE_CLARIFY_QUESTIONS__: import("@interactive-clarify/shared").QuestionItem[];
}
