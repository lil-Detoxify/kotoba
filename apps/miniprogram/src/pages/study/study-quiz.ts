import { createQuestion, quizAttempt, quizRating, type Question } from "@jp/core";
import type { ExerciseType, QuizAttempt, QuizType, Word } from "@jp/models";
import type { Grade } from "ts-fsrs";
import { normalizeLegacyQuizAttempt } from "../../services/quiz-compat";

export type StudyExercise = ExerciseType;

export function createStudyQuestion(
  word: Word,
  pool: Word[],
  exercise: StudyExercise,
  random: () => number = Math.random,
  canPlayAudio: () => boolean = () => true,
): Question | null {
  if (exercise === "card") return null;
  const types: QuizType[] = exercise === "mixed"
    ? (["kana-meaning", "kanji-reading", "audio-meaning"] as QuizType[]).sort(() => random() - 0.5)
    : [exercise];
  for (const type of types) {
    // Listening questions require a playable URL. The caller supplies the URL
    // gate because the URL may depend on the selected voice and runtime.
    if (type === "audio-meaning" && (!word.reading || !canPlayAudio())) continue;
    const question = createQuestion(word, pool, type, random);
    if (question) return question;
  }
  return null;
}

export function submitStudyAnswer(question: Question, selected: string | null): QuizAttempt {
  return normalizeLegacyQuizAttempt(quizAttempt(question, selected));
}

export function ratingForStudyAnswer(attempt: QuizAttempt, uncertain = false): Grade {
  return quizRating(attempt, uncertain) as Grade;
}
