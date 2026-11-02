import type { InputQuizType, QuizAttempt, Word } from '@jp/models';
export type { InputQuizType };

export interface InputQuestion {
  type: InputQuizType;
  wordId: string;
  prompt: string;
  meaning: string;
  correct: string;
}

/** Convert full-width, half-width, and katakana input to comparable hiragana. */
export function normalizeKanaAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s/gu, '')
    .replace(/[ァ-ヶ]/gu, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

function readableKana(value: string): string | null {
  const normalized = normalizeKanaAnswer(value);
  if (!normalized || !/\p{Script=Hiragana}/u.test(normalized)) return null;
  if (!/^[\p{Script=Hiragana}・ー]+$/u.test(normalized)) return null;
  return normalized;
}

export function createInputQuestion(word: Word, type: InputQuizType): InputQuestion | null {
  const correct = readableKana(word.reading);
  if (!correct) return null;

  const hasHan = /\p{Script=Han}/u.test(word.term);
  return {
    type,
    wordId: word.id,
    prompt: type === 'dictation' ? '' : (hasHan ? word.term : word.meaning),
    meaning: word.meaning,
    correct,
  };
}

export function inputAttempt(question: InputQuestion, value: string | null): QuizAttempt {
  const selected = value === null ? null : value.trim();
  return {
    type: question.type,
    prompt: question.prompt,
    options: [],
    selected,
    correct: question.correct,
    isCorrect: selected !== null && normalizeKanaAnswer(selected) === question.correct,
  };
}
