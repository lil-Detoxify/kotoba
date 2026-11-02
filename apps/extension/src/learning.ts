import { initialState } from '@jp/core';
import { dayKey, daysBefore } from '@jp/shared';
import type { ReviewLog, WordState } from '@jp/models';
import type {
  ExtensionBook,
  ExtensionQuizAttempt,
  ExtensionWord,
  LearningStatistics,
  StudyQueueItem,
  StudyQueueOptions
} from './model';

export function bookIdForWord(word: Pick<ExtensionWord, 'lessonId' | 'bookId'>): string {
  if (word.bookId) return word.bookId;
  const separator = word.lessonId.indexOf('-l-');
  return separator > 0 ? word.lessonId.slice(0, separator) : word.lessonId;
}

export function listLearningBooks(words: ExtensionWord[], customBooks: ExtensionBook[] = []): ExtensionBook[] {
  const groups = new Map<string, ExtensionBook>();
  const firstWordOrder = new Map<string, number>();
  for (const word of words) {
    const id = bookIdForWord(word);
    const current = groups.get(id);
    firstWordOrder.set(id, Math.min(firstWordOrder.get(id) ?? Number.POSITIVE_INFINITY, word.order));
    if (current) {
      current.wordCount++;
      if (word.source === 'textbook') current.source = 'textbook';
    } else {
      groups.set(id, {
        id,
        title: word.bookTitle || id,
        description: '',
        wordCount: 1,
        source: word.source
      });
    }
  }
  for (const book of customBooks) {
    groups.set(book.id, { ...book });
    if (!firstWordOrder.has(book.id)) firstWordOrder.set(book.id, Number.POSITIVE_INFINITY);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'textbook' ? -1 : 1;
    const orderDifference = (firstWordOrder.get(a.id) ?? Number.POSITIVE_INFINITY) - (firstWordOrder.get(b.id) ?? Number.POSITIVE_INFINITY);
    return orderDifference || a.title.localeCompare(b.title, 'ja') || a.id.localeCompare(b.id);
  });
}

function uniqueWords(words: ExtensionWord[]): ExtensionWord[] {
  const seen = new Set<string>();
  return words.filter(word => {
    if (seen.has(word.id)) return false;
    seen.add(word.id);
    return true;
  });
}

export function buildStudyQueue(
  words: ExtensionWord[],
  states: WordState[],
  options: StudyQueueOptions
): StudyQueueItem[] {
  const now = options.now ? new Date(options.now) : new Date();
  const stateById = new Map<string, WordState>();
  for (const state of states) stateById.set(state.wordId, state);
  const bookFilter = options.bookIds?.length ? new Set(options.bookIds) : undefined;
  const lessonFilter = options.lessonIds?.length ? new Set(options.lessonIds) : undefined;
  let queue = uniqueWords(words).flatMap(word => {
    if (bookFilter && !bookFilter.has(bookIdForWord(word))) return [];
    if (lessonFilter && !lessonFilter.has(word.lessonId)) return [];
    const saved = stateById.get(word.id);
    const state = saved ?? { ...initialState(word.id, now, 'local'), bookId: bookIdForWord(word), lessonId: word.lessonId };
    if (state.isIgnored) return [];
    if (options.mode === 'new' && (state.firstSeenAt || state.reviewCount > 0)) return [];
    if (options.mode === 'review' && (!state.nextReviewAt || new Date(state.nextReviewAt).getTime() > now.getTime())) return [];
    if (options.mode === 'difficult' && !state.isDifficult) return [];
    return [{ word, state }];
  });
  if (options.mode === 'review') {
    queue.sort((a, b) => new Date(a.state.nextReviewAt!).getTime() - new Date(b.state.nextReviewAt!).getTime() || a.word.order - b.word.order);
  } else {
    queue.sort((a, b) => a.word.order - b.word.order || a.word.id.localeCompare(b.word.id));
  }
  if (options.limit !== undefined) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 0) throw new RangeError('queue limit must be a non-negative integer');
    queue = queue.slice(0, options.limit);
  }
  return queue;
}

function uniqueLogs(logs: ReviewLog[]): ReviewLog[] {
  const seen = new Set<string>();
  return logs.filter(log => {
    if (seen.has(log.id)) return false;
    seen.add(log.id);
    return true;
  });
}

export function summarizeLearning(
  words: ExtensionWord[],
  states: WordState[],
  logs: ReviewLog[],
  quizAttempts: ExtensionQuizAttempt[],
  now = new Date(),
  dailyGoal = 20
): LearningStatistics {
  const stateById = new Map<string, WordState>();
  for (const state of states) stateById.set(state.wordId, state);
  const allWords = uniqueWords(words);
  const active = allWords.filter(word => !stateById.get(word.id)?.isIgnored);
  const learnedWords = active.filter(word => {
    const state = stateById.get(word.id);
    return !!state?.firstSeenAt || (state?.reviewCount ?? 0) > 0;
  });
  const mastered = active.filter(word => stateById.get(word.id)?.status === 'mastered').length;
  const due = active.filter(word => {
    const next = stateById.get(word.id)?.nextReviewAt;
    return !!next && Number.isFinite(new Date(next).getTime()) && new Date(next).getTime() <= now.getTime();
  }).length;
  const difficult = active.filter(word => stateById.get(word.id)?.isDifficult).length;
  const uniqueReviewLogs = uniqueLogs(logs);
  const today = dayKey(now);
  const todayLogs = uniqueReviewLogs.filter(log => dayKey(new Date(log.reviewedAt)) === today);
  const newToday = new Set(todayLogs.filter(log => !log.previousState.firstSeenAt && log.previousState.reviewCount === 0).map(log => log.wordId)).size;
  const reviewToday = todayLogs.filter(log => !!log.previousState.firstSeenAt || log.previousState.reviewCount > 0).length;
  const activeDays = new Set(uniqueReviewLogs.map(log => dayKey(new Date(log.reviewedAt))));
  let streak = 0;
  let offset = activeDays.has(today) ? 0 : 1;
  while (activeDays.has(dayKey(daysBefore(now, offset)))) {
    streak++;
    offset++;
  }
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = daysBefore(now, 6 - index);
    const day = dayKey(date);
    return { day, label: `${date.getMonth() + 1}/${date.getDate()}`, count: uniqueReviewLogs.filter(log => dayKey(new Date(log.reviewedAt)) === day).length };
  });
  const validGoal = Number.isSafeInteger(dailyGoal) && dailyGoal > 0 ? dailyGoal : 20;
  const quizzesById = new Map<string, ExtensionQuizAttempt>();
  for (const attempt of quizAttempts) if (!quizzesById.has(attempt.id)) quizzesById.set(attempt.id, attempt);
  const uniqueQuizzes = [...quizzesById.values()];
  const correct = uniqueQuizzes.filter(attempt => attempt.isCorrect).length;
  return {
    total: active.length,
    learned: learnedWords.length,
    mastered,
    percent: active.length ? Math.round(learnedWords.length / active.length * 100) : 0,
    new: active.length - learnedWords.length,
    due,
    difficult,
    newToday,
    reviewToday,
    totalReviews: uniqueReviewLogs.length,
    streak,
    todayCount: todayLogs.length,
    dailyGoal: validGoal,
    goalRemaining: Math.max(0, validGoal - todayLogs.length),
    days,
    quiz: {
      attempts: uniqueQuizzes.length,
      correct,
      accuracy: uniqueQuizzes.length ? Math.round(correct / uniqueQuizzes.length * 100) : 0,
      elapsedMs: uniqueQuizzes.reduce((total, attempt) => total + attempt.elapsedMs, 0)
    }
  };
}
