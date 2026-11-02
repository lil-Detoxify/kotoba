import type { Data, QuizType, Word } from "@jp/models";
import { miniPracticeFeedback } from "./study-feedback";

export interface HistoricalPractice {
  bookId: string;
  type: QuizType;
  range: 7 | 30;
}

const quizTypes: readonly QuizType[] = ["kana-meaning", "kanji-reading", "audio-meaning", "kana-input", "dictation"];

export function parseHistoricalPractice(value: unknown): HistoricalPractice | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.bookId !== "string" || !candidate.bookId.trim()
    || !quizTypes.includes(candidate.type as QuizType) || (candidate.range !== 7 && candidate.range !== 30)) return null;
  return { bookId: candidate.bookId, type: candidate.type as QuizType, range: candidate.range };
}

/** Re-read saved answers at launch; a checkpoint may only narrow this queue. */
export function historicalPracticeWords(data: Data, request: HistoricalPractice, now = new Date(), remainingIds?: string[]): Word[] {
  const row = miniPracticeFeedback(data, now, request.range, request.bookId).quiz.find(item => item.id === request.type);
  const available = new Map((row?.previewWords ?? []).map(word => [word.id, word]));
  return (remainingIds ?? row?.practiceWordIds ?? []).flatMap(id => {
    const word = available.get(id);
    return word ? [word] : [];
  });
}
