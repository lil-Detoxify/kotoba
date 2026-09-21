import type { Data, ReviewLog, WordState } from "@jp/models";
import catalog from "./textbooks-catalog.json";

/** A per-textbook snapshot used by the mini-program home and books pages. */
export interface LearningBookStatistics {
  bookId: string;
  title: string;
  learned: number;
  mastered: number;
  due: number;
  difficult: number;
  total: number;
  /** Percentage in the inclusive range 0..100. */
  progress: number;
  /** Alias kept for consumers that call the percentage `percent`. */
  percent: number;
}

export interface LearningStatistics {
  total: number;
  learned: number;
  mastered: number;
  /** Number of currently due, non-ignored cards. */
  due: number;
  /** Number of currently marked, non-ignored difficult cards. */
  difficult: number;
  /** Number of distinct active dates ending at today or yesterday. */
  streak: number;
  todayNew: number;
  todayReview: number;
  /** Compatibility names used by the core statistics shape. */
  newToday: number;
  reviewToday: number;
  totalReviews: number;
  percent: number;
  progress: number;
  books: LearningBookStatistics[];
  /** Compatibility alias for callers that use `bookStats`. */
  bookStats: LearningBookStatistics[];
  /** Seven local calendar days, oldest first. */
  days: Array<{ day: string; label: string; count: number }>;
}

type CatalogBook = (typeof catalog.books)[number];
type MaybeState = Partial<WordState> & { wordId: string };
type MaybeLog = ReviewLog & {
  previousState?: MaybeState;
  newState?: MaybeState;
};

const catalogBooks: readonly CatalogBook[] = catalog.books;
const catalogIds = new Set(catalogBooks.map((book) => book.id));

function localDay(value: unknown): string | undefined {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timestamp(value: unknown): number | undefined {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function userMatches(value: { userId?: string } | undefined, userId?: string): boolean {
  return !userId || value?.userId === userId || value?.userId === "local";
}

function bookFromWordId(wordId: string): string | undefined {
  for (const book of catalogBooks) {
    if (wordId.startsWith(`${book.id}-w-`)) return book.id;
  }
  return undefined;
}

function bookIdFrom(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const bookId = (value as { bookId?: unknown }).bookId;
  return typeof bookId === "string" && catalogIds.has(bookId) ? bookId : undefined;
}

function latestByWord<T extends { wordId: string }>(items: T[], getTime: (item: T) => number | undefined): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const existing = result.get(item.wordId);
    if (!existing) {
      result.set(item.wordId, item);
      continue;
    }
    const currentTime = getTime(item) ?? Number.NEGATIVE_INFINITY;
    const existingTime = getTime(existing) ?? Number.NEGATIVE_INFINITY;
    if (currentTime >= existingTime) result.set(item.wordId, item);
  }
  return result;
}

function uniqueLogs(data: Data, userId?: string): MaybeLog[] {
  const seenIds = new Set<string>();
  const result: MaybeLog[] = [];
  for (const raw of data.logs ?? []) {
    const log = raw as MaybeLog;
    if (!userMatches(log, userId) || !log.wordId || timestamp(log.reviewedAt) === undefined) continue;
    // A sync retry can leave the same immutable log in the local array twice.
    if (log.id && seenIds.has(log.id)) continue;
    if (log.id) seenIds.add(log.id);
    result.push(log);
  }
  return result;
}

function uniqueStates(data: Data, userId?: string): Map<string, WordState> {
  const candidates = (data.states ?? []).filter((state) => userMatches(state, userId));
  const result = latestByWord(candidates, (state) => timestamp(state.updatedAt ?? state.lastReviewedAt ?? state.firstSeenAt));
  // Prefer the explicitly logged-in user's record when both it and the local
  // guest fallback are present in a user-scoped snapshot.
  if (userId) {
    for (const state of candidates) {
      if (state.userId !== userId) continue;
      const current = result.get(state.wordId);
      if (!current || current.userId === "local" || (timestamp(state.updatedAt) ?? 0) >= (timestamp(current.updatedAt) ?? 0)) {
        result.set(state.wordId, state);
      }
    }
  }
  return result;
}

function wordBookMap(data: Data): Map<string, string> {
  const lessons = new Map((data.lessons ?? []).map((lesson) => [lesson.id, lesson.bookId]));
  const result = new Map<string, string>();
  for (const word of data.words ?? []) {
    const bookId = lessons.get(word.lessonId);
    if (bookId && catalogIds.has(bookId)) result.set(word.id, bookId);
  }
  return result;
}

function isFirstExposure(log: MaybeLog): boolean {
  const previous = log.previousState;
  return !previous?.firstSeenAt && !(previous?.reviewCount && previous.reviewCount > 0);
}

function stateIgnored(state: MaybeState | undefined): boolean {
  return state?.isIgnored === true;
}

function dateLabel(day: Date): string {
  return `${day.getMonth() + 1}/${day.getDate()}`;
}

/**
 * Aggregate learning data without reading the currently loaded word list.
 * Book totals come from the six-book directory; progress and log dates use
 * the device's local calendar, matching the rest of the application.
 */
export function calculateLearningStatistics(data: Data, now = new Date(), userId?: string): LearningStatistics {
  const today = localDay(now) ?? "";
  const logs = uniqueLogs(data, userId).sort((a, b) => (timestamp(a.reviewedAt) ?? 0) - (timestamp(b.reviewedAt) ?? 0));
  const states = uniqueStates(data, userId);
  const booksByWord = wordBookMap(data);
  const latestLogs = latestByWord(logs, (log) => timestamp(log.reviewedAt));
  const ignoredWords = new Set<string>();
  for (const [wordId, state] of states) {
    if (state.isIgnored) ignoredWords.add(wordId);
  }
  for (const [wordId, log] of latestLogs) {
    if (!states.has(wordId) && stateIgnored(log.newState)) ignoredWords.add(wordId);
  }
  const activeLogs = logs.filter((log) => !ignoredWords.has(log.wordId));
  const activeStates = [...states.values()].filter((state) => !ignoredWords.has(state.wordId) && !state.isIgnored);

  const firstNewByWord = new Map<string, { day: string; time: number }>();
  // Activity history remains immutable when a word is later ignored. Current
  // learned/due/difficult totals below still exclude ignored words.
  for (const log of logs) {
    if (!isFirstExposure(log)) continue;
    const day = localDay(log.reviewedAt);
    const time = timestamp(log.reviewedAt);
    const current = firstNewByWord.get(log.wordId);
    if (day && time !== undefined && (!current || time < current.time)) {
      firstNewByWord.set(log.wordId, { day, time });
    }
  }
  // A state can survive a sync without its event. It still represents a first
  // exposure and should appear in today's count.
  for (const state of activeStates) {
    if (!state.firstSeenAt || firstNewByWord.has(state.wordId)) continue;
    const day = localDay(state.firstSeenAt);
    const time = timestamp(state.firstSeenAt);
    if (day && time !== undefined) firstNewByWord.set(state.wordId, { day, time });
  }

  const todayNew = [...firstNewByWord.values()].filter((entry) => entry.day === today).length;
  const todayReview = logs.filter((log) => localDay(log.reviewedAt) === today && !isFirstExposure(log)).length;
  const activeDates = new Set(logs.map((log) => localDay(log.reviewedAt)).filter((day): day is string => !!day));
  let streak = 0;
  let cursor = new Date(now);
  if (!activeDates.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (activeDates.has(localDay(cursor) ?? "")) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const learnedWords = new Set<string>();
  for (const state of activeStates) {
    if (state.firstSeenAt || state.reviewCount > 0) learnedWords.add(state.wordId);
  }
  for (const log of activeLogs) learnedWords.add(log.wordId);

  const due = activeStates.filter((state) => {
    const dueAt = timestamp(state.nextReviewAt);
    return dueAt !== undefined && dueAt <= now.getTime();
  }).length;
  const difficult = activeStates.filter((state) => state.isDifficult).length;

  const logBookByWord = new Map<string, string>();
  for (const log of logs) {
    const bookId = bookIdFrom(log.newState) ?? bookIdFrom(log.previousState);
    if (bookId) logBookByWord.set(log.wordId, bookId);
  }
  const ignoredByBook = new Map<string, number>();
  for (const wordId of ignoredWords) {
    const bookId = bookIdFrom(states.get(wordId)) ?? logBookByWord.get(wordId) ?? booksByWord.get(wordId) ?? bookFromWordId(wordId);
    if (bookId) ignoredByBook.set(bookId, (ignoredByBook.get(bookId) ?? 0) + 1);
  }
  const bookIdFor = (wordId: string): string | undefined => {
    const state = states.get(wordId);
    return bookIdFrom(state) ?? logBookByWord.get(wordId) ?? booksByWord.get(wordId) ?? bookFromWordId(wordId);
  };
  const learnedByBook = new Map<string, Set<string>>();
  const masteredByBook = new Map<string, Set<string>>();
  const dueByBook = new Map<string, Set<string>>();
  const difficultByBook = new Map<string, Set<string>>();
  for (const wordId of learnedWords) {
    const bookId = bookIdFor(wordId);
    if (!bookId) continue;
    const words = learnedByBook.get(bookId) ?? new Set<string>();
    words.add(wordId);
    learnedByBook.set(bookId, words);
  }
  for (const state of activeStates) {
    const bookId = bookIdFor(state.wordId);
    if (!bookId) continue;
    if (state.status === "mastered") {
      const words = masteredByBook.get(bookId) ?? new Set<string>();
      words.add(state.wordId);
      masteredByBook.set(bookId, words);
    }
    const dueAt = timestamp(state.nextReviewAt);
    if (dueAt !== undefined && dueAt <= now.getTime()) {
      const words = dueByBook.get(bookId) ?? new Set<string>();
      words.add(state.wordId);
      dueByBook.set(bookId, words);
    }
    if (state.isDifficult) {
      const words = difficultByBook.get(bookId) ?? new Set<string>();
      words.add(state.wordId);
      difficultByBook.set(bookId, words);
    }
  }
  const books = catalogBooks.map((book) => {
    const total = Math.max(0, book.wordCount - (ignoredByBook.get(book.id) ?? 0));
    const learned = learnedByBook.get(book.id)?.size ?? 0;
    const percent = total ? Math.min(100, Math.round((learned / total) * 100)) : 0;
    return {
      bookId: book.id,
      title: book.title,
      learned,
      mastered: masteredByBook.get(book.id)?.size ?? 0,
      due: dueByBook.get(book.id)?.size ?? 0,
      difficult: difficultByBook.get(book.id)?.size ?? 0,
      total,
      progress: percent,
      percent,
    };
  });
  const total = books.reduce((sum, book) => sum + book.total, 0);
  const mastered = activeStates.filter((state) => state.status === "mastered").length;
  const percent = total ? Math.min(100, Math.round((learnedWords.size / total) * 100)) : 0;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - index));
    const day = localDay(date) ?? "";
    return { day, label: dateLabel(date), count: logs.filter((log) => localDay(log.reviewedAt) === day).length };
  });
  return {
    total,
    learned: learnedWords.size,
    mastered,
    due,
    difficult,
    streak,
    todayNew,
    todayReview,
    newToday: todayNew,
    reviewToday: todayReview,
    totalReviews: logs.length,
    percent,
    progress: percent,
    books,
    bookStats: books,
    days,
  };
}

export const learningStatistics = calculateLearningStatistics;
export const statistics = calculateLearningStatistics;
