import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import type { ReviewLog, WordState } from '@jp/models';
import { bookIdForWord, buildStudyQueue, listLearningBooks, summarizeLearning } from '../apps/extension/src/learning';
import type { ExtensionQuizAttempt, ExtensionWord } from '../apps/extension/src/model';

function word(id: string, lessonId: string, order: number, overrides: Partial<ExtensionWord> = {}): ExtensionWord {
  return {
    id, lessonId, term: `語${order}`, reading: 'ご', meaning: `word ${order}`, order,
    source: 'textbook', bookTitle: 'Book', lessonTitle: `Lesson ${lessonId}`, ...overrides
  };
}

function state(id: string, now: Date, patch: Partial<WordState> = {}): WordState {
  return { ...initialState(id, now), ...patch };
}

describe('extension learning helpers', () => {
  it('groups textbook and imported words by book and lesson ids', () => {
    const words = [word('a', 'b-l-1', 2), word('b', 'b-l-2', 1), word('c', 'manual-book-l-1', 3, { source: 'manual', bookTitle: 'Custom' })];
    expect(bookIdForWord(words[0])).toBe('b');
    expect(listLearningBooks(words, [{ id: 'manual-book', title: 'Custom', description: '', wordCount: 1, source: 'manual' }])).toEqual([
      { id: 'b', title: 'Book', description: '', wordCount: 2, source: 'textbook' },
      { id: 'manual-book', title: 'Custom', description: '', wordCount: 1, source: 'manual' }
    ]);
  });

  it('orders textbook courses by catalog order and keeps custom books after them', () => {
    const words = [
      word('high-down', 'high-down-l-1', 6, { bookTitle: '高下' }),
      word('middle-up', 'middle-up-l-1', 3, { bookTitle: '中上' }),
      word('begin-down', 'begin-down-l-1', 2, { bookTitle: '初下' }),
      word('begin-up', 'begin-up-l-1', 1, { bookTitle: '初上' }),
      word('high-up', 'high-up-l-1', 5, { bookTitle: '高上' }),
      word('middle-down', 'middle-down-l-1', 4, { bookTitle: '中下' }),
      word('custom-word', 'custom-book-l-1', 0, { source: 'manual', bookTitle: '自定义' })
    ];

    expect(listLearningBooks(words, [{ id: 'custom-book', title: '自定义', description: '', wordCount: 1, source: 'manual' }]).map(book => book.title))
      .toEqual(['初上', '初下', '中上', '中下', '高上', '高下', '自定义']);
  });

  it('builds due, new, and difficult queues while respecting book, lesson, ignore, and limit filters', () => {
    const now = new Date(2026, 9, 2, 12);
    const all = [word('new-1', 'book-l-1', 1), word('due-1', 'book-l-1', 2), word('hard-1', 'book-l-2', 3), word('ignored-1', 'book-l-2', 4)];
    const states = [
      state('due-1', now, { firstSeenAt: new Date(now.getTime() - 86_400_000).toISOString(), reviewCount: 1, nextReviewAt: new Date(now.getTime() - 1_000).toISOString() }),
      state('hard-1', now, { isDifficult: true }),
      state('ignored-1', now, { isDifficult: true, isIgnored: true })
    ];

    expect(buildStudyQueue(all, states, { mode: 'new', bookIds: ['book'], lessonIds: ['book-l-1'], limit: 1, now }).map(item => item.word.id)).toEqual(['new-1']);
    expect(buildStudyQueue(all, states, { mode: 'review', now }).map(item => item.word.id)).toEqual(['due-1']);
    expect(buildStudyQueue(all, states, { mode: 'difficult', now }).map(item => item.word.id)).toEqual(['hard-1']);
  });

  it('counts local-day reviews and de-duplicates legacy and learning logs', () => {
    const now = new Date(2026, 9, 2, 12);
    const current = new Date(now); current.setHours(9, 0, 0, 0);
    const todayIso = current.toISOString();
    const first = state('learned-1', now, { firstSeenAt: todayIso, reviewCount: 1 });
    const duplicate: ReviewLog = {
      id: 'same-event', userId: 'local', wordId: first.wordId, reviewedAt: todayIso, rating: 3, responseTime: 900,
      previousState: state(first.wordId, now), newState: first, studyMode: 'new'
    };
    const quiz: ExtensionQuizAttempt = {
      id: 'quiz-1', requestId: 'quiz-1', wordId: first.wordId, type: 'kana-meaning', prompt: 'にほん',
      options: ['Japan', 'China'], selected: 'Japan', correct: 'Japan', isCorrect: true, elapsedMs: 900, recordedAt: todayIso
    };
    const summary = summarizeLearning([word(first.wordId, 'book-l-1', 1), word('new-1', 'book-l-1', 2)], [first], [duplicate, duplicate], [quiz], now, 5);

    expect(summary).toMatchObject({ total: 2, learned: 1, new: 1, newToday: 1, todayCount: 1, totalReviews: 1, dailyGoal: 5, goalRemaining: 4 });
    expect(summary.quiz).toEqual({ attempts: 1, correct: 1, accuracy: 100, elapsedMs: 900 });
    expect(summary.days[6].day).toBe('2026-10-02');
  });
});
