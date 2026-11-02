import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import { emptyData, type Data, type ReviewLog } from '@jp/models';
import { learningAnalytics, libraryProgress } from '../apps/web/src/services/learning-analytics';
import { bookPresentation, fullBookTitle } from '../apps/web/src/services/book-presentation';

const now = new Date(2026, 9, 5, 18);
const iso = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();
function dataFixture(): Data {
  return { ...emptyData(), currentBookId: 'a', books: ['a', 'b'].map(id => ({ id, title: '词书 ' + id, description: '', language: 'ja', createdAt: '', updatedAt: '' })), lessons: ['a', 'b'].map(id => ({ id: 'lesson-' + id, bookId: id, title: '第1课', order: 1 })), words: ['a', 'b'].map(id => ({ id: 'word-' + id, lessonId: 'lesson-' + id, term: '词', reading: '', meaning: '', order: 1 })) };
}
function log(id: string, wordId: string, reviewedAt: string, userId = 'local'): ReviewLog {
  const state = initialState(wordId, now, userId);
  return { id, wordId, reviewedAt, userId, rating: 3, studyMode: 'new', responseTime: 100, previousState: state, newState: state };
}

describe('Web learning chart data', () => {
  it('distinguishes daily distinct words, interval distinct words and evaluations', () => {
    const data = dataFixture();
    data.logs = [log('1', 'word-a', iso(4)), log('2', 'word-a', iso(4)), log('3', 'word-b', iso(4)), log('4', 'word-a', iso(5))];
    const result = learningAnalytics(data, now, 7);
    expect(result.days.at(-2)).toMatchObject({ words: 2, reviews: 3 });
    expect(result.days.at(-1)).toMatchObject({ words: 1, reviews: 1 });
    expect(result).toMatchObject({ reviews: 4, distinctWords: 2, activeDays: 2, shareTotal: 2 });
    expect(result.shares.map(s => s.count)).toEqual([1, 1]);
  });
  it('excludes other accounts, duplicate events, invalid dates, old and future records', () => {
    const data = dataFixture();
    data.logs = [log('1', 'word-a', iso(5), 'alice'), log('1', 'word-a', iso(5), 'alice'), log('2', 'word-b', iso(5), 'bob'), log('3', 'word-b', iso(5)), log('4', 'word-b', 'bad', 'alice'), log('5', 'word-b', iso(6), 'alice'), log('6', 'word-b', new Date(2026, 8, 20).toISOString(), 'alice')];
    expect(learningAnalytics(data, now, 7, 'alice')).toMatchObject({ reviews: 1, distinctWords: 1 });
    expect(learningAnalytics(data, now, 30, 'alice')).toMatchObject({ reviews: 2, distinctWords: 2 });
  });
  it('counts learning methods from the same filtered events as the period total', () => {
    const data = dataFixture();
    const entries = [log('1', 'word-a', iso(5)), log('2', 'word-a', iso(5)), log('3', 'word-b', iso(5)), log('4', 'word-b', iso(5))];
    entries[1].studyMode = 'review';
    entries[2].studyMode = 'difficult';
    entries[3].studyMode = 'review';
    data.logs = [...entries, entries[1], log('5', 'word-a', iso(5), 'bob'), log('6', 'word-a', iso(6)), log('7', 'word-a', new Date(2026, 8, 20).toISOString())];
    const result = learningAnalytics(data, now, 7);
    expect(result.methods).toEqual([
      { id: 'new', title: '新词学习', count: 1 },
      { id: 'review', title: '常规复习', count: 2 },
      { id: 'difficult', title: '难词强化', count: 1 },
    ]);
    expect(result.methods.reduce((sum, method) => sum + method.count, 0)).toBe(result.reviews);
    expect(result.distinctWords).toBe(2);
    expect(learningAnalytics(data, now, 30).methods[0].count).toBe(2);
    expect(learningAnalytics(data, now, 7, 'bob').methods.map(method => method.count)).toEqual([1, 0, 0]);
  });
  it('uses local midnight boundaries and fills days without records with zero', () => {
    const data = dataFixture();
    data.logs = [log('1', 'word-a', new Date(2026, 9, 4, 23, 59).toISOString()), log('2', 'word-b', new Date(2026, 9, 5, 0, 1).toISOString())];
    const result = learningAnalytics(data, now, 7);
    expect(result.days).toHaveLength(7);
    expect(result.days[0].words).toBe(0);
    expect(result.days.at(-2)).toMatchObject({ day: '2026-10-04', words: 1 });
    expect(result.days.at(-1)).toMatchObject({ day: '2026-10-05', words: 1 });
  });
  it('uses saved log location when textbook words are not loaded and preserves unknown events', () => {
    const data = dataFixture();
    data.words = [];
    const saved = log('1', 'unloaded', iso(5));
    saved.newState.bookId = 'b';
    data.logs = [saved, log('2', 'missing', iso(5))];
    expect(learningAnalytics(data, now, 7).shares).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'b', count: 1 }), expect.objectContaining({ id: 'unassigned', count: 1 })]));
  });
  it('limits ring segments to five without dropping any records', () => {
    const data = dataFixture();
    data.logs = Array.from({ length: 8 }, (_, i) => { const entry = log(String(i), 'word-' + i, iso(5)); entry.newState.bookId = 'book-' + i; return entry; });
    const result = learningAnalytics(data, now, 7);
    expect(result.shares).toHaveLength(5);
    expect(result.shares.at(-1)).toMatchObject({ id: 'other', count: 4, percent: 50 });
    expect(result.shareTotal).toBe(8);
  });
  it('keeps empty data genuinely empty', () => {
    const result = learningAnalytics(emptyData(), now, 7);
    expect(result).toMatchObject({ shareTotal: 0, reviews: 0, distinctWords: 0, shares: [] });
    expect(result.methods.map(method => method.count)).toEqual([0, 0, 0]);
  });
});

describe('Web textbook progress and presentation', () => {
  it('keeps memory stages within each book, using catalog totals and excluding ignored words', () => {
    const data = dataFixture();
    data.words = [];
    const learned = { ...initialState('seen', now), firstSeenAt: iso(1), reviewCount: 1, status: 'learning' as const, bookId: 'a', lessonId: 'lesson-a' };
    data.states = [learned, { ...learned, wordId: 'reviewed', bookId: 'b', lessonId: 'lesson-b', status: 'review' }, { ...learned, wordId: 'mastered', bookId: 'b', lessonId: 'lesson-b', status: 'mastered' }, { ...learned, wordId: 'ignored', isIgnored: true }, { ...learned, wordId: 'foreign', userId: 'bob' }];
    const result = libraryProgress(data, [{ id: 'a', wordCount: 10, lessons: [{ id: 'lesson-a', wordCount: 10 }] }, { id: 'b', wordCount: 20, lessons: [{ id: 'lesson-b', wordCount: 20 }] }]);
    expect(result.books[0]).toMatchObject({ total: 9, learned: 1, stages: { new: 8, learning: 1, review: 0, mastered: 0 } });
    expect(result.books[1]).toMatchObject({ total: 20, learned: 2, stages: { new: 18, learning: 0, review: 1, mastered: 1 } });
    expect(result.stages).toEqual({ new: 26, learning: 1, review: 1, mastered: 1 });
  });
  it('shows unloaded catalog totals and excludes ignored and other-account progress', () => {
    const data = dataFixture();
    data.words = [];
    const seen = { ...initialState('seen', now), firstSeenAt: iso(1), reviewCount: 1, status: 'review' as const, bookId: 'a', lessonId: 'lesson-a' };
    data.states = [seen, { ...initialState('ignore', now), isIgnored: true, bookId: 'a', lessonId: 'lesson-a' }, { ...seen, wordId: 'foreign', userId: 'bob' }];
    const result = libraryProgress(data, [{ id: 'a', wordCount: 10, lessons: [{ id: 'lesson-a', wordCount: 10 }] }, { id: 'b', wordCount: 20, lessons: [{ id: 'lesson-b', wordCount: 20 }] }]);
    expect(result.books[0]).toMatchObject({ total: 9, learned: 1, percent: 11 });
    expect(result.books[1]).toMatchObject({ total: 20, learned: 0, percent: 0 });
    expect(result.stages).toEqual({ new: 28, learning: 0, review: 1, mastered: 0 });
  });
  it('calculates custom-book progress from loaded words without changing input', () => {
    const data = dataFixture();
    data.states = [{ ...initialState('word-a', now), firstSeenAt: iso(1), status: 'learning' }];
    const before = structuredClone(data);
    expect(libraryProgress(data, []).books[0]).toMatchObject({ total: 1, learned: 1, percent: 100 });
    expect(data).toEqual(before);
  });
  it('uses complete edition titles and unique scenes, preserving custom titles', () => {
    const ids = ['beginner-upper', 'beginner-lower', 'intermediate-upper', 'intermediate-lower', 'advanced-upper', 'advanced-lower'];
    const profiles = ids.map(id => bookPresentation({ id: 'biaori-' + id, title: '旧标题', description: '' }));
    expect(profiles[0].title).toBe('新版标准日本语初级上册');
    expect(profiles.at(-1)?.title).toBe('新版标准日本语高级下册');
    expect(new Set(profiles.map(p => p.scene)).size).toBe(6);
    expect(fullBookTitle({ id: 'custom', title: '我的旅行词书' })).toBe('我的旅行词书');
  });
  it('chooses a stable cover from custom book content', () => {
    const book = { id: 'custom', title: '我的词书', description: '' };
    expect(bookPresentation(book, '车站 電車').scene).toBe('train');
    expect(bookPresentation({ ...book, title: '日本文化与艺术' }).scene).toBe('museum');
    expect(bookPresentation(book)).toEqual(bookPresentation(book));
  });
});
