import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import type { ReviewLog, WordState } from '@jp/models';
import { emptySnapshot, type ExtensionSnapshot, type ExtensionWord } from '../apps/extension/src/model';
import { extensionLearningAnalytics, extensionLibraryProgress } from '../apps/extension/src/learning-analytics';

const now = new Date(2026, 9, 5, 18);
const localIso = (day: number, month = 9, hour = 12) => new Date(2026, month, day, hour).toISOString();

function word(id: string, lessonId: string, bookTitle: string, lessonTitle = '第1课', order = 1, term = id): ExtensionWord {
  return { id, lessonId, term, reading: '', meaning: term, order, source: 'textbook', bookTitle, lessonTitle };
}

function snapshot(userId?: string): ExtensionSnapshot {
  const value = emptySnapshot();
  if (userId) value.identity = { partitionKey: userId === 'local' ? 'current' : 'account:' + userId, userId };
  return value;
}

function state(wordId: string, userId: string, lessonId: string, options: {
  status?: WordState['status'];
  firstSeenAt?: string;
  reviewCount?: number;
  stability?: number;
  isIgnored?: boolean;
} = {}): WordState {
  const base = initialState(wordId, now, userId);
  base.lessonId = lessonId;
  base.bookId = lessonId.slice(0, lessonId.indexOf('-l-'));
  base.status = options.status ?? 'learning';
  base.firstSeenAt = options.firstSeenAt ?? localIso(1);
  base.reviewCount = options.reviewCount ?? 1;
  base.card.stability = options.stability ?? 1;
  base.isIgnored = options.isIgnored ?? false;
  return base;
}

function log(id: string, wordId: string, reviewedAt: string, userId = 'local', studyMode: ReviewLog['studyMode'] = 'new', lessonId?: string): ReviewLog {
  const previousState = state(wordId, userId, lessonId ?? 'custom-l-1');
  return {
    id, wordId, reviewedAt, userId, rating: 3, responseTime: 100,
    previousState, newState: { ...previousState }, studyMode,
  };
}

describe('Extension learning analytics', () => {
  it('fills 7 and 30 local days, deduplicates events, and counts words separately from reviews', () => {
    const data = snapshot();
    const lessonId = 'biaori-beginner-upper-l-1';
    const words = [word('a', lessonId, '旧标题'), word('b', lessonId, '旧标题', '第1课', 2)];
    const repeated = log('event-1', 'a', localIso(4), 'local', 'new', lessonId);
    data.learning.logs = [
      repeated,
      { ...repeated },
      log('event-2', 'a', localIso(4), 'local', 'review', lessonId),
      log('event-3', 'b', localIso(4), 'local', 'difficult', lessonId),
      log('event-4', 'a', localIso(5), 'local', 'review', lessonId),
      log('outside-seven', 'b', localIso(20, 8), 'local', 'new', lessonId),
      log('outside-thirty', 'b', localIso(1, 8), 'local', 'new', lessonId),
      log('future', 'b', localIso(6), 'local', 'new', lessonId),
      log('invalid', 'b', 'invalid-date', 'local', 'new', lessonId),
      log('foreign', 'b', localIso(5), 'bob', 'new', lessonId),
    ];

    const week = extensionLearningAnalytics(words, data, now, 7);
    expect(week.days.at(-2)).toMatchObject({ day: '2026-10-04', words: 2, reviews: 3 });
    expect(week.days.at(-1)).toMatchObject({ day: '2026-10-05', words: 1, reviews: 1 });
    expect(week).toMatchObject({ reviews: 4, distinctWords: 2, activeDays: 2, shareTotal: 2 });
    expect(week.methods.map(method => method.count)).toEqual([1, 2, 1]);

    const month = extensionLearningAnalytics(words, data, now, 30);
    expect(month.reviews).toBe(5);
    expect(month.days).toHaveLength(30);
  });

  it('uses the snapshot account identity for states and logs, including guest partitions', () => {
    const words = [word('a', 'custom-l-1', '旅行词书')];
    const data = snapshot('alice');
    const alice = log('alice-event', 'a', localIso(5), 'alice', 'new', 'custom-l-1');
    data.learning.logs = [alice, { ...alice }, log('guest-event', 'a', localIso(5), 'guest', 'review', 'custom-l-1')];
    data.learning.states = [
      state('a', 'alice', 'custom-l-1'),
      { ...state('a', 'bob', 'custom-l-1'), status: 'mastered', card: { ...state('a', 'bob', 'custom-l-1').card, stability: 60 } },
    ];
    expect(extensionLearningAnalytics(words, data, now, 7)).toMatchObject({ reviews: 1, distinctWords: 1 });
    expect(extensionLibraryProgress(words, data).books[0]).toMatchObject({ learned: 1 });

    data.identity = { partitionKey: 'account:guest', userId: 'guest' };
    expect(extensionLearningAnalytics(words, data, now, 7)).toMatchObject({ reviews: 1, distinctWords: 1 });
    expect(extensionLibraryProgress(words, data).books[0]).toMatchObject({ learned: 0 });
  });

  it('keeps repeated vocabulary in separate books, excludes ignored words, and uses 30-day stability for mastery', () => {
    const data = snapshot();
    const upperLesson = 'biaori-beginner-upper-l-1';
    const jlptLesson = 'jlpt-n5-l-1';
    const ignoredOnlyLesson = 'custom-ignored-l-1';
    const words = [
      word('train-a', upperLesson, '旧版初级上册', '第1课', 1, '電車'),
      word('train-b', jlptLesson, '旧JLPT标题', '第1课', 1, '電車'),
      word('ignored', upperLesson, '旧版初级上册', '第1课', 2, 'ignored'),
      word('new', jlptLesson, '旧JLPT标题', '第1课', 2, 'new'),
      word('ignored-only', ignoredOnlyLesson, '被忽略的词书'),
    ];
    data.learning.books = [{ id: 'custom-ignored', title: '被忽略的词书', description: '', wordCount: 1, source: 'manual' }];
    data.learning.states = [
      state('train-a', 'local', upperLesson, { status: 'review', stability: 29.9 }),
      state('train-b', 'local', jlptLesson, { status: 'review', stability: 30 }),
      state('ignored', 'local', upperLesson, { isIgnored: true }),
      state('ignored-only', 'local', ignoredOnlyLesson, { isIgnored: true }),
    ];
    const before = structuredClone(data);

    const result = extensionLibraryProgress(words, data);
    expect(result.books.map(book => book.id)).toEqual([
      'biaori-beginner-upper',
      'jlpt-n5',
      'custom-ignored',
    ]);
    const upper = result.books.find(book => book.id === 'biaori-beginner-upper')!;
    const jlpt = result.books.find(book => book.id === 'jlpt-n5')!;
    expect(upper).toMatchObject({
      title: '新版标准日本语初级上册',
      total: 1,
      learned: 1,
      stages: { new: 0, learning: 0, review: 1, mastered: 0 },
    });
    expect(jlpt).toMatchObject({
      title: 'JLPT N5 备考词汇',
      total: 2,
      learned: 1,
      stages: { new: 1, learning: 0, review: 0, mastered: 1 },
    });
    expect(result.books.find(book => book.id === 'custom-ignored')).toMatchObject({
      total: 0,
      learned: 0,
      percent: 0,
    });
    expect(result.total).toBe(3);
    expect(result.learned).toBe(2);
    expect(data).toEqual(before);
  });

  it('limits shares to five segments and rolls all books after the first four into other', () => {
    const data = snapshot();
    const words = Array.from({ length: 7 }, (_, index) => {
      const bookId = 'custom-' + index;
      const lessonId = bookId + '-l-1';
      return word('word-' + index, lessonId, '自定义词书' + index);
    });
    data.learning.logs = words.map((entry, index) => log('event-' + index, entry.id, localIso(5), 'local', 'new', entry.lessonId));

    const result = extensionLearningAnalytics(words, data, now, 7);
    expect(result.shares).toHaveLength(5);
    expect(result.shares.at(-1)).toMatchObject({ id: 'other', title: '其他词书', count: 3, percent: 43 });
    expect(result.shareTotal).toBe(7);
  });
});
