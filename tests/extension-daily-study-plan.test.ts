import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import type { WordState } from '@jp/models';
import { extensionDailyStudyPlan } from '../apps/extension/src/daily-study-plan';
import { emptySnapshot, type ExtensionSnapshot, type ExtensionWord } from '../apps/extension/src/model';

const today = new Date('2026-10-08T12:00:00Z');
const accountId = 'account-42';

function fixture(firstLessonCount = 7): { words: ExtensionWord[]; snapshot: ExtensionSnapshot } {
  const words = Array.from({ length: firstLessonCount + 4 }, (_, index): ExtensionWord => {
    const lessonNumber = index < firstLessonCount ? 1 : 2;
    return {
      id: `word-${index}`,
      lessonId: `book-a-l-${lessonNumber}`,
      term: `词${index}`,
      reading: 'ことば',
      meaning: '测试',
      order: index,
      source: 'textbook',
      bookTitle: '词书 A',
      lessonTitle: lessonNumber === 1 ? '第一课' : '第二课',
    };
  });
  const snapshot = emptySnapshot();
  snapshot.identity = { partitionKey: accountId, userId: accountId };
  return { words, snapshot };
}

function state(wordId: string, fields: Partial<WordState> = {}, userId = accountId): WordState {
  return { ...initialState(wordId, today, userId), ...fields };
}

describe('Extension daily study plan', () => {
  it('rounds a half lesson up when the goal exceeds ten words', () => {
    const { words, snapshot } = fixture(25);
    const plan = extensionDailyStudyPlan(words, snapshot, 'book-a', 0.5, today);

    expect(plan).toMatchObject({ lessonId: 'book-a-l-1', target: 13, remaining: 13 });
    expect(plan.pendingWordIds).toEqual(words.slice(0, 13).map((word) => word.id));
  });

  it('keeps a completed goal anchored to the same lesson for the rest of today', () => {
    const { words, snapshot } = fixture(6);
    const first = extensionDailyStudyPlan(words, snapshot, 'book-a', 1, today);
    snapshot.learning.states.push(...first.pendingWordIds.map((id) => state(id, {
      firstSeenAt: '2026-10-08T10:00:00Z',
      reviewCount: 1,
    })));

    expect(extensionDailyStudyPlan(words, snapshot, 'book-a', 1, today)).toMatchObject({
      lessonId: 'book-a-l-1', target: 6, completed: 6, remaining: 0,
    });
  });

  it('continues the unlearned part of a half lesson on the next day', () => {
    const { words, snapshot } = fixture(7);
    const first = extensionDailyStudyPlan(words, snapshot, 'book-a', 0.5, today);
    snapshot.learning.states.push(...first.pendingWordIds.map((id) => state(id, {
      firstSeenAt: '2026-10-08T10:00:00Z',
      reviewCount: 1,
    })));

    expect(extensionDailyStudyPlan(words, snapshot, 'book-a', 0.5, new Date('2026-10-09T12:00:00Z')))
      .toMatchObject({ lessonId: 'book-a-l-1', target: 3, remaining: 3 });
  });

  it('excludes ignored words and gives canonical state precedence over the legacy saved mirror', () => {
    const { words, snapshot } = fixture(6);
    snapshot.learning.states.push(
      state('word-0'),
      state('word-1', { isIgnored: true }),
    );
    snapshot.words.push(
      { word: words[0], savedAt: today.toISOString(), state: state('word-0', { firstSeenAt: '2026-10-07T10:00:00Z', reviewCount: 1 }) },
      { word: words[1], savedAt: today.toISOString(), state: state('word-1') },
    );

    const plan = extensionDailyStudyPlan(words, snapshot, 'book-a', 0.5, today);
    expect(plan).toMatchObject({ target: 3, completed: 0, remaining: 3 });
    expect(plan.pendingWordIds).toEqual(['word-0', 'word-2', 'word-3']);
  });

  it('uses only states from the snapshot account partition', () => {
    const { words, snapshot } = fixture(4);
    snapshot.learning.states.push(...words.slice(0, 4).map((word) => state(word.id, {
      firstSeenAt: '2026-10-07T10:00:00Z',
      reviewCount: 1,
    }, 'another-account')));

    expect(extensionDailyStudyPlan(words, snapshot, 'book-a', 1, today)).toMatchObject({
      lessonId: 'book-a-l-1', target: 4, completed: 0, remaining: 4,
    });
  });
});
