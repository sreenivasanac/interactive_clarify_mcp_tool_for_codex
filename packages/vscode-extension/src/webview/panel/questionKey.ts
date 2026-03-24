import type { QuestionItem } from "@interactive-clarify/shared";

export function getQuestionKey(question: QuestionItem, index: number): string {
  return question.id ?? `${index}:${question.header}`;
}
