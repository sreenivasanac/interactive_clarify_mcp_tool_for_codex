/** A single option within a clarifying question. */
export interface OptionItem {
  /** Display text for this option (1-5 words). */
  label: string;
  /** What this option means or what happens if chosen. */
  description: string;
  /** Optional preview content shown when this option is focused. */
  preview?: string;
}

/** A single clarifying question with multiple options. */
export interface QuestionItem {
  /** Optional stable identifier for internal state and rendering. */
  id?: string;
  /** Plain-text question prompt shown in the UI. */
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
  /** Legacy map of question header -> selected answer(s). */
  answers: Record<string, string | string[]>;
  /** Stable ordered answer items keyed by question id when available. */
  answerItems?: Array<{
    id?: string;
    header: string;
    answer: string | string[];
  }>;
  /** Optional per-question annotations (notes, etc). */
  annotations?: Record<string, { notes?: string; optionNotes?: Record<string, string> }>;
}

/** Persisted response captured after a live request disconnects or times out. */
export interface LateResponseRecord extends InteractiveClarifyOutput {
  requestId: string;
  createdAt: string;
  questions: QuestionItem[];
}

/**
 * Returns a stable internal key for a question. Falls back to index to preserve
 * behavior for older clients that do not send an explicit id yet.
 */
export function getQuestionKey(question: QuestionItem, index: number): string {
  return question.id ?? `${index}:${question.header}`;
}
