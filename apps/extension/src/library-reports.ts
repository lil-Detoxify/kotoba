import type { ReviewLog, WordState } from '@jp/models';
import {
  practiceFeedback,
  type PracticeFeedbackReport,
} from '../../web/src/services/practice-feedback';
import { bookIdForWord } from './learning';
import { extensionContentWords, personalLibraryData } from './personal-library';
import type { ExtensionSnapshot, ExtensionWord } from './model';

export type { PracticeFeedbackReport };

export interface IgnoredWordEntry {
  word: ExtensionWord;
  bookId: string;
  bookTitle: string;
  lessonTitle: string;
}

export interface IgnoredLibraryWordFilters {
  bookId?: string;
  lessonId?: string;
  query?: string;
}

function currentOwner(snapshot: ExtensionSnapshot): string {
  return snapshot.identity?.userId || snapshot.learning.userSettings?.userId || 'local';
}

/** Canonical state wins; the saved-word copy is a fallback for older snapshots. */
function currentOwnerStates(snapshot: ExtensionSnapshot, userId: string): Map<string, WordState> {
  const states = new Map<string, WordState>();
  for (const state of snapshot.learning.states ?? []) {
    if (state.userId === userId) states.set(state.wordId, state);
  }
  for (const saved of snapshot.words ?? []) {
    if (saved.state.userId === userId && !states.has(saved.word.id)) {
      states.set(saved.word.id, saved.state);
    }
  }
  return states;
}

/**
 * Adapt the extension snapshot to the shared Web report while retaining only
 * this partition owner's progress. personalLibraryData merges duplicate log
 * stores by ID and materializes both textbook and personal content.
 */
export function extensionPracticeFeedback(
  snapshot: ExtensionSnapshot,
  catalog: ExtensionWord[],
  now: Date,
  range: 7 | 30,
  bookId?: string,
): PracticeFeedbackReport {
  const owner = currentOwner(snapshot);
  const data = personalLibraryData(snapshot, catalog);
  data.states = [...currentOwnerStates(snapshot, owner).values()];
  data.logs = data.logs.filter(log => log.userId === owner);
  return practiceFeedback(data, now, range, owner, bookId);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'ja') || left.localeCompare(right);
}

/** Returns ignored words from the current owner's canonical progress and legacy favorites. */
export function ignoredLibraryWords(
  snapshot: ExtensionSnapshot,
  catalog: ExtensionWord[],
  filters: IgnoredLibraryWordFilters = {},
): IgnoredWordEntry[] {
  const owner = currentOwner(snapshot);
  const states = currentOwnerStates(snapshot, owner);
  const data = personalLibraryData(snapshot, catalog);
  const words = extensionContentWords(snapshot, catalog);
  const books = new Map(data.books.map(book => [book.id, book]));
  const lessons = new Map(data.lessons.map(lesson => [lesson.id, lesson]));
  const query = filters.query?.trim().toLocaleLowerCase();

  return words.flatMap(word => {
    const bookId = bookIdForWord(word);
    const state = states.get(word.id);
    if (!state?.isIgnored) return [];
    if (filters.bookId && filters.bookId !== bookId) return [];
    if (filters.lessonId && filters.lessonId !== word.lessonId) return [];

    const searchable = `${word.term}\n${word.reading}\n${word.meaning}`.toLocaleLowerCase();
    if (query && !searchable.includes(query)) return [];

    const book = books.get(bookId);
    const candidateLesson = lessons.get(word.lessonId);
    const lesson = candidateLesson?.bookId === bookId ? candidateLesson : undefined;
    return [{
      word,
      bookId,
      bookTitle: book?.title || word.bookTitle || bookId,
      lessonTitle: lesson?.title || word.lessonTitle || word.lessonId,
    }];
  }).sort((left, right) => {
    const bookTitle = compareText(left.bookTitle, right.bookTitle);
    if (bookTitle) return bookTitle;
    const bookId = left.bookId.localeCompare(right.bookId);
    if (bookId) return bookId;

    const leftLesson = lessons.get(left.word.lessonId);
    const rightLesson = lessons.get(right.word.lessonId);
    const lessonOrder = (leftLesson?.bookId === left.bookId ? leftLesson.order : Number.MAX_SAFE_INTEGER)
      - (rightLesson?.bookId === right.bookId ? rightLesson.order : Number.MAX_SAFE_INTEGER);
    if (lessonOrder) return lessonOrder;
    const lessonTitle = compareText(left.lessonTitle, right.lessonTitle);
    if (lessonTitle) return lessonTitle;
    const lessonId = left.word.lessonId.localeCompare(right.word.lessonId);
    if (lessonId) return lessonId;
    return left.word.order - right.word.order || left.word.id.localeCompare(right.word.id);
  });
}
