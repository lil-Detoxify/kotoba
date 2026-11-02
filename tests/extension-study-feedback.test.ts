import { describe, expect, it } from 'vitest';
import { evaluate, initialState } from '@jp/core';
import type { ReviewLog, WordState } from '@jp/models';
import { canFeedbackPractice, extensionSessionSummary, extensionWeakPracticeSuggestions, feedbackPracticeQueue } from '../apps/extension/src/study-feedback';
import { emptySnapshot, type ExtensionSnapshot, type ExtensionWord } from '../apps/extension/src/model';

const now = new Date('2026-10-16T12:00:00.000Z');

function word(id: string, patch: Partial<ExtensionWord> = {}): ExtensionWord {
  return {
    id,
    lessonId: 'book-l-1',
    bookId: 'book',
    term: id,
    reading: 'よみ',
    meaning: 'meaning',
    order: 1,
    source: 'textbook',
    bookTitle: 'Book',
    lessonTitle: 'Lesson',
    ...patch,
  };
}

function snapshot(userId = 'local'): ExtensionSnapshot {
  const result = emptySnapshot();
  result.identity = { partitionKey: `account:${userId}`, userId };
  return result;
}

function state(wordId: string, userId: string, patch: Partial<WordState> = {}): WordState {
  return { ...initialState(wordId, now, userId), ...patch };
}

function log(
  id: string,
  target: ExtensionWord,
  userId: string,
  rating: 1 | 2 | 3 | 4,
  reviewedAt: string,
  previousReviewCount = 0,
  quiz?: ReviewLog['quiz'],
): ReviewLog {
  const previous = state(target.id, userId, {
    reviewCount: previousReviewCount,
    ...(previousReviewCount ? { firstSeenAt: '2026-10-01T00:00:00.000Z' } : {}),
  });
  const result = evaluate(previous, rating, previousReviewCount ? 'review' : 'new', new Date(reviewedAt), id, 300);
  return { ...result.log, id, quiz };
}

describe('extension study feedback', () => {
  it('summarizes only receipt logs that advanced beyond each starting review count', () => {
    const current = snapshot();
    const reviewed = word('reviewed');
    const unchanged = word('unchanged', { order: 2 });
    const exact = log('receipt-reviewed', reviewed, 'local', 1, now.toISOString(), 2);
    const belowBaseline = log('receipt-unchanged', unchanged, 'local', 3, now.toISOString(), 1);
    const laterUnreceiptedLog = log('later-log', reviewed, 'local', 4, '2026-10-16T12:01:00.000Z', 3);
    current.learning.logs.push(exact, belowBaseline, laterUnreceiptedLog);

    const summary = extensionSessionSummary(current, [reviewed, unchanged], [
      { word: reviewed, baselineReviewCount: 2, logId: exact.id },
      { word: unchanged, baselineReviewCount: 4, logId: belowBaseline.id },
    ]);

    expect([summary.newCount, summary.reviewCount, summary.skippedCount]).toEqual([0, 1, 1]);
    expect(summary.reviewWords.map(entry => entry.id)).toEqual(['reviewed']);
    expect(summary.practiceWords.map(entry => entry.id)).toEqual(['reviewed']);
    expect(summary.self).toEqual({ total: 1, forgotten: 1, uncertain: 0, remembered: 0 });
  });

  it('keeps receipt ownership strict and does not classify self-ratings as objective quiz results', () => {
    const current = snapshot('user-a');
    const subjective = word('subjective');
    const incorrect = word('objective-incorrect', { order: 2 });
    const correct = word('objective-correct', { order: 3 });
    const subjectiveLog = log('same-id', subjective, 'user-a', 1, now.toISOString());
    const wrongOwnerDuplicate = log('same-id', subjective, 'user-b', 1, now.toISOString());
    const foreign = log('foreign-only', incorrect, 'user-b', 1, now.toISOString());
    const incorrectLog = { ...log('objective-wrong', incorrect, 'user-a', 4, now.toISOString()), quiz: {
      type: 'kana-meaning', prompt: '', options: ['x', 'y'], selected: 'x', correct: 'y', isCorrect: false,
    } };
    const correctLog = { ...log('objective-right', correct, 'user-a', 3, now.toISOString()), quiz: {
      type: 'audio-meaning', prompt: '', options: ['x', 'y'], selected: 'x', correct: 'x', isCorrect: true,
    } };
    current.learning.logs.push(wrongOwnerDuplicate, foreign, incorrectLog, correctLog);
    current.logs.push(subjectiveLog);

    const summary = extensionSessionSummary(current, [subjective, incorrect, correct], [
      { word: subjective, baselineReviewCount: 0, logId: subjectiveLog.id },
      { word: incorrect, baselineReviewCount: 0, logId: incorrectLog.id },
      { word: correct, baselineReviewCount: 0, logId: correctLog.id },
      { word: word('foreign-only'), baselineReviewCount: 0, logId: foreign.id },
    ]);

    expect([summary.newCount, summary.reviewCount, summary.skippedCount]).toEqual([3, 0, 1]);
    expect(summary.quiz).toEqual({ total: 2, correct: 1, incorrect: 1, accuracy: 50 });
    expect(summary.self).toEqual({ total: 1, forgotten: 1, uncertain: 0, remembered: 0 });
    expect(summary.practiceWords.map(entry => entry.id)).toEqual(['subjective', 'objective-incorrect']);
  });

  it('applies shared 30-day suggestion rules to the current owner, selected book, and portable lessons', () => {
    const current = snapshot('user-a');
    const forgotten = word('forgotten', { lessonId: 'portable-lesson-key', bookId: 'manual-book', source: 'manual' });
    const recovered = word('recovered', { lessonId: 'portable-lesson-key', bookId: 'manual-book', source: 'manual', order: 2 });
    const ignored = word('ignored', { lessonId: 'portable-lesson-key', bookId: 'manual-book', source: 'manual', order: 3 });
    const foreignOnly = word('foreign-only', { lessonId: 'portable-lesson-key', bookId: 'manual-book', source: 'manual', order: 4 });
    const outsideBook = word('outside-book', { lessonId: 'other-portable-lesson', bookId: 'other-book', source: 'manual', order: 5 });
    const difficult = word('difficult', { lessonId: 'portable-lesson-key', bookId: 'manual-book', source: 'manual', order: 6 });
    current.words = [forgotten, recovered, ignored, foreignOnly, outsideBook, difficult].map((entry, index) => ({
      word: entry,
      savedAt: now.toISOString(),
      state: state(entry.id, 'user-a', index === 2 ? { isIgnored: true } : {}),
    }));
    current.learning.states.push(state('difficult', 'user-a', { isDifficult: true }));
    current.learning.logs.push(
      log('forget-once', forgotten, 'user-a', 1, '2026-10-15T00:00:00.000Z'),
      log('recover-forget', recovered, 'user-a', 1, '2026-10-14T00:00:00.000Z'),
      log('recover-remember', recovered, 'user-a', 3, '2026-10-15T00:00:00.000Z', 1),
      log('ignored-log', ignored, 'user-a', 1, '2026-10-15T00:00:00.000Z'),
      log('foreign-log', foreignOnly, 'user-b', 1, '2026-10-15T00:00:00.000Z'),
      log('old-log', outsideBook, 'user-a', 1, '2026-09-14T00:00:00.000Z'),
      log('other-book-log', outsideBook, 'user-a', 1, '2026-10-15T00:00:00.000Z'),
    );

    const suggestions = extensionWeakPracticeSuggestions(current, [], now, 'manual-book');

    expect(suggestions.map(({ word: entry }) => entry.id)).toEqual(['forgotten', 'difficult']);
    expect(suggestions[0].word.bookId).toBe('manual-book');
    expect(suggestions[0].reason).toBe('近 30 天有 1 次「忘记」');
    expect(suggestions[1].reason).toBe('你标记了生词');
  });

  it('builds a read-only practice queue in requested canonical order with current-owner state', () => {
    const current = snapshot('user-a');
    const alpha = word('alpha', { lessonId: 'portable-lesson-key', bookId: 'manual-book' });
    const legacy = word('legacy', { lessonId: 'portable-lesson-key', bookId: 'manual-book', source: 'manual', order: 2 });
    const ignored = word('ignored', { order: 3 });
    const foreignState = word('foreign-state', { order: 4 });
    current.learning.words = [legacy];
    current.learning.states = [
      state('alpha', 'user-a', { reviewCount: 7 }),
      state('ignored', 'user-a', { isIgnored: true }),
      state('foreign-state', 'user-b', { isDifficult: true, isIgnored: true }),
    ];
    current.words = [{ word: legacy, savedAt: now.toISOString(), state: state('legacy', 'user-a', { reviewCount: 4 }) }];
    const before = structuredClone(current);

    const queue = feedbackPracticeQueue(current, [alpha, ignored, foreignState], [
      'legacy', 'alpha', 'ignored', 'deleted', 'foreign-state', 'alpha',
    ], now);

    expect(queue.map(item => item.word.id)).toEqual(['legacy', 'alpha', 'foreign-state']);
    expect(queue.map(item => item.state.reviewCount)).toEqual([4, 7, 0]);
    expect(queue.map(item => item.state.userId)).toEqual(['user-a', 'user-a', 'user-a']);
    expect(queue.map(item => item.state.bookId)).toEqual(['manual-book', 'manual-book', 'book']);
    expect(queue[0].word.lessonId).toBe('portable-lesson-key');
    expect(current).toEqual(before);
  });

  it('permits only current-owner difficulty or recent real feedback and rejects ignored words', () => {
    const current = snapshot('user-a');
    current.learning.states.push(
      state('difficult', 'user-a', { isDifficult: true }),
      state('ignored', 'user-a', { isDifficult: true, isIgnored: true }),
      state('foreign-difficulty', 'user-b', { isDifficult: true }),
    );
    const lowRating = word('low-rating');
    const wrongQuiz = word('wrong-quiz');
    const foreign = word('foreign');
    const future = word('future');
    const tooOld = word('too-old');
    current.learning.logs.push(
      log('low', lowRating, 'user-a', 2, '2026-10-15T00:00:00.000Z'),
      { ...log('wrong-answer', wrongQuiz, 'user-a', 4, '2026-10-15T00:00:00.000Z'), quiz: {
        type: 'kana-meaning', prompt: '', options: ['x', 'y'], selected: 'x', correct: 'y', isCorrect: false,
      } },
      log('foreign-only', foreign, 'user-b', 1, '2026-10-15T00:00:00.000Z'),
      log('future-log', future, 'user-a', 1, '2026-10-17T00:00:00.000Z'),
      log('old-log', tooOld, 'user-a', 1, '2026-09-14T11:59:59.999Z'),
      log('ignored-log', word('ignored'), 'user-a', 1, '2026-10-15T00:00:00.000Z'),
    );

    expect(canFeedbackPractice(current, 'difficult', now)).toBe(true);
    expect(canFeedbackPractice(current, 'low-rating', now)).toBe(true);
    expect(canFeedbackPractice(current, 'wrong-quiz', now)).toBe(true);
    expect(canFeedbackPractice(current, 'foreign-difficulty', now)).toBe(false);
    expect(canFeedbackPractice(current, 'foreign', now)).toBe(false);
    expect(canFeedbackPractice(current, 'future', now)).toBe(false);
    expect(canFeedbackPractice(current, 'too-old', now)).toBe(false);
    expect(canFeedbackPractice(current, 'ignored', now)).toBe(false);
  });

  it('uses user settings when runtime identity is unavailable', () => {
    const current = snapshot('settings-user');
    current.identity = undefined;
    current.learning.userSettings = { userId: 'settings-user', updatedAt: now.toISOString() };
    current.learning.logs.push(log('settings-log', word('settings-word'), 'settings-user', 1, now.toISOString()));

    expect(canFeedbackPractice(current, 'settings-word', now)).toBe(true);
  });
});
