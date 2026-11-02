import { initialState } from '@jp/core';
import type { ReviewLog, QuizType } from '@jp/models';
import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { bookIdForWord } from '../apps/extension/src/learning';
import { ignoredLibraryWords, extensionPracticeFeedback } from '../apps/extension/src/library-reports';
import { emptySnapshot, type ExtensionBook, type ExtensionSnapshot, type ExtensionWord } from '../apps/extension/src/model';

const now = new Date(2026, 9, 16, 12, 0, 0);
const owner = 'account-a';

function word(
  id: string,
  bookId: string,
  lessonId: string,
  order: number,
  fields: Partial<Pick<ExtensionWord, 'term' | 'reading' | 'meaning' | 'source' | 'bookTitle' | 'lessonTitle'>> = {},
): ExtensionWord {
  return {
    id, bookId, lessonId, order,
    term: fields.term ?? '言葉',
    reading: fields.reading ?? 'ことば',
    meaning: fields.meaning ?? 'word',
    source: fields.source ?? 'manual',
    bookTitle: fields.bookTitle ?? bookId,
    lessonTitle: fields.lessonTitle ?? lessonId,
  };
}

function book(id: string, title = id, source: ExtensionBook['source'] = 'manual'): ExtensionBook {
  return { id, title, description: '', wordCount: 0, source };
}

function addState(snapshot: ExtensionSnapshot, item: ExtensionWord, userId: string, isIgnored: boolean, saved = false) {
  const state = initialState(item.id, now, userId);
  state.bookId = bookIdForWord(item);
  state.lessonId = item.lessonId;
  state.isIgnored = isIgnored;
  if (saved) {
    snapshot.words.push({ word: item, savedAt: now.toISOString(), state });
  } else {
    snapshot.learning.states.push(state);
  }
  return state;
}

function shiftedStamp(offsetDays: number, hour = 10, minute = 0): string {
  const date = new Date(now);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function addLog(
  snapshot: ExtensionSnapshot,
  input: {
    id: string;
    wordId: string;
    userId?: string;
    reviewedAt?: string;
    bookId?: string;
    lessonId?: string;
    type?: QuizType;
    isCorrect?: boolean;
    rating?: 1 | 2 | 3 | 4;
    store?: 'canonical' | 'legacy';
  },
): ReviewLog {
  const userId = input.userId ?? owner;
  const reviewedAt = input.reviewedAt ?? now.toISOString();
  const date = new Date(reviewedAt);
  const previousState = initialState(input.wordId, date, userId);
  previousState.bookId = input.bookId;
  previousState.lessonId = input.lessonId;
  const newState = { ...previousState };
  const log: ReviewLog = {
    id: input.id,
    userId,
    wordId: input.wordId,
    reviewedAt,
    rating: input.rating ?? 3,
    responseTime: 120,
    previousState,
    newState,
    studyMode: 'review',
    ...(input.type ? {
      quiz: {
        type: input.type,
        prompt: 'prompt',
        options: ['answer', 'other'],
        selected: input.isCorrect ? 'answer' : 'other',
        correct: 'answer',
        isCorrect: input.isCorrect ?? false,
      },
    } : {}),
  };
  if (input.store === 'legacy') snapshot.logs.push(log);
  else snapshot.learning.logs.push(log);
  return log;
}

function manualSnapshot(item: ExtensionWord): ExtensionSnapshot {
  const snapshot = emptySnapshot();
  const bookId = bookIdForWord(item);
  snapshot.learning.books.push(book(bookId, item.bookTitle));
  snapshot.learning.lessons = [{ id: item.lessonId, bookId, title: item.lessonTitle, order: 0 }];
  snapshot.learning.words.push(item);
  return snapshot;
}

describe('extension library reports', () => {
  it('uses the partition identity and counts only its first deduplicated log copy', () => {
    const item = word('manual-w-1', 'manual-book', 'portable-lesson-id', 1, { bookTitle: 'Manual' });
    const snapshot = manualSnapshot(item);
    snapshot.identity = { partitionKey: 'partition-a', userId: owner };
    snapshot.learning.userSettings = { userId: 'account-b', updatedAt: now.toISOString() };
    const first = addLog(snapshot, { id: 'duplicate', wordId: item.id, type: 'kana-meaning', isCorrect: false });
    const duplicate = addLog(snapshot, {
      id: first.id, wordId: item.id, type: 'kana-meaning', isCorrect: true, store: 'legacy',
    });
    addLog(snapshot, { id: 'foreign', wordId: item.id, userId: 'account-b', type: 'kana-meaning', isCorrect: true });

    const row = extensionPracticeFeedback(snapshot, [], now, 7, 'manual-book').quiz.find(entry => entry.id === 'kana-meaning')!;

    expect(duplicate.quiz?.isCorrect).toBe(true);
    expect(row).toMatchObject({ total: 1, correct: 0, incorrect: 1, accuracy: 0 });
  });

  it('prefers canonical current-owner flags and uses legacy favorite state only as fallback', () => {
    const textbookWord = word('text-word', 'jlpt-n5', 'jlpt-n5-l-1', 1, {
      term: '猫', reading: 'ねこ', meaning: 'cat', source: 'textbook', bookTitle: 'N5',
    });
    const legacyOnlyWord = word('legacy-word', 'manual-book', 'portable-lesson', 2, {
      term: '言葉', reading: 'ことば', meaning: 'word', bookTitle: 'Personal',
    });
    const foreignWord = word('foreign-word', 'manual-book', 'portable-lesson', 3, { bookTitle: 'Personal' });
    const snapshot = emptySnapshot();
    snapshot.identity = { partitionKey: 'partition-a', userId: owner };
    snapshot.learning.userSettings = { userId: 'account-b', updatedAt: now.toISOString() };
    snapshot.learning.books.push(book('manual-book', 'Personal'));
    snapshot.learning.lessons = [{ id: 'portable-lesson', bookId: 'manual-book', title: 'Lesson', order: 0 }];
    snapshot.learning.words.push(legacyOnlyWord, foreignWord);
    addState(snapshot, textbookWord, owner, false);
    addState(snapshot, textbookWord, owner, true, true);
    addState(snapshot, legacyOnlyWord, owner, true, true);
    addState(snapshot, foreignWord, 'account-b', true, true);

    const ignored = ignoredLibraryWords(snapshot, [textbookWord]);

    expect(ignored.map(entry => entry.word.id)).toEqual(['legacy-word']);
    expect(ignored[0]).toMatchObject({ bookId: 'manual-book', bookTitle: 'Personal', lessonTitle: 'Lesson' });
  });

  it('filters by actual book and portable lesson IDs and sorts by book, lesson, and word order', () => {
    const a = word('a-word', 'book-a', 'portable-a', 1, { term: '猫', reading: 'ねこ', meaning: 'cat', bookTitle: 'A词书' });
    const b2 = word('b-second', 'book-b', 'portable-b', 2, { term: '犬', reading: 'いぬ', meaning: 'dog', bookTitle: 'B词书' });
    const b1 = word('b-first', 'book-b', 'portable-b', 1, { term: '鳥', reading: 'とり', meaning: 'bird', bookTitle: 'B词书' });
    const snapshot = emptySnapshot();
    snapshot.identity = { partitionKey: 'partition-a', userId: owner };
    snapshot.learning.books.push(book('book-b', 'B词书'), book('book-a', 'A词书'));
    snapshot.learning.lessons = [
      { id: 'portable-b', bookId: 'book-b', title: '第二课', order: 2 },
      { id: 'portable-a', bookId: 'book-a', title: '第一课', order: 1 },
    ];
    snapshot.learning.words.push(b2, a, b1);
    for (const item of [a, b2, b1]) addState(snapshot, item, owner, true);

    const all = ignoredLibraryWords(snapshot, []);
    const filtered = ignoredLibraryWords(snapshot, [], { bookId: 'book-b', lessonId: 'portable-b', query: 'いぬ' });

    expect(all.map(entry => entry.word.id)).toEqual(['a-word', 'b-first', 'b-second']);
    expect(filtered.map(entry => entry.word.id)).toEqual(['b-second']);
    expect(ignoredLibraryWords(snapshot, [], { query: 'bird' }).map(entry => entry.word.id)).toEqual(['b-first']);
    expect(ignoredLibraryWords(snapshot, [], { query: '鳥' }).map(entry => entry.word.id)).toEqual(['b-first']);
  });

  it('uses the same inclusive local-calendar boundaries for 7 and 30 days and cancels recovered retries', () => {
    const recovered = word('recovered', 'manual-book', 'portable-lesson', 1, { bookTitle: 'Manual' });
    const oldWrong = word('old-wrong', 'manual-book', 'portable-lesson', 2, { bookTitle: 'Manual' });
    const thirtyBoundary = word('thirty-boundary', 'manual-book', 'portable-lesson', 3, { bookTitle: 'Manual' });
    const snapshot = manualSnapshot(recovered);
    snapshot.identity = { partitionKey: 'partition-a', userId: owner };
    snapshot.learning.words.push(oldWrong, thirtyBoundary);
    addState(snapshot, recovered, owner, false);
    addState(snapshot, oldWrong, owner, false);
    addState(snapshot, thirtyBoundary, owner, false);
    addLog(snapshot, { id: 'recover-wrong', wordId: recovered.id, type: 'kana-meaning', isCorrect: false, reviewedAt: shiftedStamp(-6, 0) });
    addLog(snapshot, { id: 'recover-right', wordId: recovered.id, type: 'kana-meaning', isCorrect: true, reviewedAt: shiftedStamp(-1) });
    addLog(snapshot, { id: 'old-only', wordId: oldWrong.id, type: 'kana-meaning', isCorrect: false, reviewedAt: shiftedStamp(-10) });
    addLog(snapshot, { id: 'thirty-in', wordId: thirtyBoundary.id, type: 'kana-meaning', isCorrect: false, reviewedAt: shiftedStamp(-29, 0) });
    addLog(snapshot, { id: 'thirty-out', wordId: thirtyBoundary.id, type: 'kana-meaning', isCorrect: false, reviewedAt: shiftedStamp(-30, 23, 59) });

    const seven = extensionPracticeFeedback(snapshot, [], now, 7, 'manual-book').quiz.find(entry => entry.id === 'kana-meaning')!;
    const thirty = extensionPracticeFeedback(snapshot, [], now, 30, 'manual-book').quiz.find(entry => entry.id === 'kana-meaning')!;

    expect(seven).toMatchObject({ total: 2, correct: 1, incorrect: 1, practiceWordIds: [] });
    expect(thirty).toMatchObject({ total: 4, correct: 1, incorrect: 3 });
    expect(thirty.practiceWordIds).toEqual(['old-wrong', 'thirty-boundary']);
  });

  it('keeps objective retries separate from self ratings, excludes ignored words, and reports unloaded textbook IDs', () => {
    const builtin = word('jlpt-n5-w-loaded', 'jlpt-n5', 'jlpt-n5-l-1', 1, {
      term: '猫', reading: 'ねこ', meaning: 'cat', source: 'textbook', bookTitle: 'N5',
    });
    const manual = word('manual-w-1', 'manual-book', 'portable-lesson', 1, { bookTitle: 'Manual' });
    const snapshot = manualSnapshot(manual);
    snapshot.learning.books.push(book('jlpt-n5', 'N5', 'textbook'));
    snapshot.learning.lessons?.push({ id: builtin.lessonId, bookId: 'jlpt-n5', title: '第一课', order: 0 });
    snapshot.identity = { partitionKey: 'partition-a', userId: owner };
    addState(snapshot, builtin, owner, true);
    addState(snapshot, manual, owner, false);
    addLog(snapshot, { id: 'ignored-false', wordId: builtin.id, bookId: 'jlpt-n5', lessonId: builtin.lessonId, type: 'kana-meaning', isCorrect: false });
    addLog(snapshot, { id: 'unloaded-false', wordId: 'jlpt-n5-w-unloaded', bookId: 'jlpt-n5', type: 'kana-meaning', isCorrect: false });
    addLog(snapshot, { id: 'unknown-false', wordId: 'unknown-word', type: 'kana-meaning', isCorrect: false });
    addLog(snapshot, { id: 'manual-wrong-1', wordId: manual.id, bookId: 'manual-book', lessonId: manual.lessonId, type: 'kana-meaning', isCorrect: false });
    addLog(snapshot, { id: 'manual-wrong-2', wordId: manual.id, bookId: 'manual-book', lessonId: manual.lessonId, type: 'kana-meaning', isCorrect: false, reviewedAt: shiftedStamp(-1) });
    addLog(snapshot, { id: 'manual-self', wordId: manual.id, bookId: 'manual-book', lessonId: manual.lessonId, rating: 1 });

    const builtinRow = extensionPracticeFeedback(snapshot, [builtin], now, 7, 'jlpt-n5').quiz.find(entry => entry.id === 'kana-meaning')!;
    const manualReport = extensionPracticeFeedback(snapshot, [builtin], now, 7, 'manual-book');
    const manualRow = manualReport.quiz.find(entry => entry.id === 'kana-meaning')!;

    expect(builtinRow).toMatchObject({ total: 2, incorrect: 2, practiceWordIds: [], unresolvedWordIds: ['jlpt-n5-w-unloaded'] });
    expect(manualRow).toMatchObject({ total: 2, incorrect: 2, practiceWordIds: ['manual-w-1'] });
    expect(manualReport.self).toEqual({ total: 1, forgotten: 1, uncertain: 0, remembered: 0 });
  });

  it('accepts Vue-reactive inputs and leaves their data unchanged', () => {
    const item = word('manual-w-1', 'manual-book', 'portable-lesson', 1, { bookTitle: 'Manual' });
    const rawSnapshot = manualSnapshot(item);
    rawSnapshot.identity = { partitionKey: 'partition-a', userId: owner };
    addState(rawSnapshot, item, owner, true);
    addLog(rawSnapshot, { id: 'wrong', wordId: item.id, type: 'kana-meaning', isCorrect: false });
    const snapshot = reactive(rawSnapshot) as unknown as ExtensionSnapshot;
    const catalog = reactive([] as ExtensionWord[]) as unknown as ExtensionWord[];
    const before = JSON.stringify({ snapshot, catalog });

    expect(extensionPracticeFeedback(snapshot, catalog, now, 7, 'manual-book').quiz[0].total).toBe(1);
    expect(ignoredLibraryWords(snapshot, catalog).map(entry => entry.word.id)).toEqual([item.id]);
    expect(JSON.stringify({ snapshot, catalog })).toBe(before);
  });
});
