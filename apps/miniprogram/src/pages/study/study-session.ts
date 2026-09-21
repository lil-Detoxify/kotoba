import { createStudyQueue, evaluate, getDifficultWords, getDueWords, initialState, stateFor } from "@jp/core";
import type { Data, StudyMode, Word, WordState } from "@jp/models";
import type { Grade } from "ts-fsrs";
import { ensureStudyRuntime } from "../../adapters/runtime";

/** Build the queue without silently widening an invalid lesson selection. */
export function getStudyQueue(data: Data, mode: StudyMode, lessonId?: string): Word[] {
  const lessonIds = lessonId ? [lessonId] : undefined;
  const selectedLesson = lessonId ? data.lessons.find((lesson) => lesson.id === lessonId) : undefined;
  if (lessonId && !selectedLesson) return [];

  let scoped = data;
  if (lessonId) {
    scoped = { ...data, words: data.words.filter((word) => word.lessonId === lessonId) };
  } else if (mode === "new" && data.currentBookId) {
    const bookLessonIds = new Set(data.lessons.filter((lesson) => lesson.bookId === data.currentBookId).map((lesson) => lesson.id));
    scoped = { ...data, words: data.words.filter((word) => bookLessonIds.has(word.lessonId)) };
  }

  // Keep these explicit so this boundary remains easy to audit when core evolves.
  if (mode === "review") return getDueWords(scoped, new Date());
  if (mode === "difficult") return getDifficultWords(scoped);
  return createStudyQueue(scoped, "new", lessonIds);
}

export interface StudyRatingResult {
  state: WordState;
  log: Data["logs"][number];
}

/** Apply a rating against the state currently present in the transaction. */
export function applyStudyRating(
  data: Data,
  word: Word,
  rating: Grade,
  mode: StudyMode,
  now = new Date(),
  id = `log_${now.getTime()}`,
  responseTime = 0,
): StudyRatingResult {
  if (![1, 2, 3, 4].includes(rating)) throw new Error("Invalid review rating");
  if (!data.words.some((item) => item.id === word.id)) throw new Error("Word no longer available");
  const previous = stateFor(data, word.id) || initialState(word.id);
  if (previous.isIgnored) throw new Error("Word is ignored");
  ensureStudyRuntime();
  const evaluated = evaluate(previous, rating, mode, now, id, responseTime);
  const bookId = data.lessons.find((lesson) => lesson.id === word.lessonId)?.bookId;
  const state: WordState = { ...evaluated.state, bookId, lessonId: word.lessonId };
  const log = {
    ...evaluated.log,
    newState: state,
    studyMode: mode,
  };
  const index = data.states.findIndex((item) => item.wordId === word.id && item.userId === state.userId);
  if (index >= 0) data.states[index] = state;
  else data.states.push(state);
  data.logs.push(log);
  return { state, log };
}
