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
