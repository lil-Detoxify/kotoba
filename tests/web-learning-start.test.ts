import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@jp/core';
import { emptyData, type Book, type Data } from '@jp/models';
import {
  firstLessonTarget,
  LEARNING_START_PATHS,
  recommendedStartBooks,
  shouldShowLearningStart,
} from '../apps/web/src/services/learning-start';

type StartMeta = Book & { wordCount: number; lessons: Array<{ order: number; wordCount: number }> };

function meta(id: string, lessons: StartMeta['lessons'] = []): StartMeta {
  return { id, title: id, description: '', language: 'ja', createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z', wordCount: 0, lessons };
}

function preferenceStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('learning start choices', () => {
  it('exposes the three learning paths', () => {
    expect(LEARNING_START_PATHS.map(path => path.id)).toEqual(['textbook', 'jlpt', 'everyday']);
    expect(LEARNING_START_PATHS.every(path => path.title && path.description)).toBe(true);
  });

  it('recommends existing textbook and JLPT metadata in path order without changing identities', () => {
    const books = [
      meta('jlpt-n4'), meta('biaori-intermediate-upper'), meta('biaori-beginner-upper'), meta('unknown'), meta('jlpt-n5'),
    ];
    const before = structuredClone(books);

    const textbook = recommendedStartBooks('textbook', books);
    const jlpt = recommendedStartBooks('jlpt', books);

    expect(textbook.map(book => book.id)).toEqual(['biaori-beginner-upper', 'biaori-intermediate-upper']);
    expect(jlpt.map(book => book.id)).toEqual(['jlpt-n5', 'jlpt-n4']);
    expect(textbook[0]).toBe(books[2]);
    expect(recommendedStartBooks('everyday', books)).toEqual([]);
    expect(books).toEqual(before);
  });

  it('uses the first lesson by order and rounds half pace up without imposing a word cap', () => {
    const book = meta('large', [{ order: 2, wordCount: 3 }, { order: 1, wordCount: 101 }]);

    expect(firstLessonTarget(book, 0.5)).toBe(51);
    expect(firstLessonTarget(book, 1)).toBe(101);
  });

  it('returns zero when no lesson is available', () => {
    expect(firstLessonTarget(meta('empty'), 0.5)).toBe(0);
    expect(firstLessonTarget(undefined, 1)).toBe(0);
  });
});

describe('learning start visibility', () => {
  const eligible = { ready: true, hasCheckpoint: false, dismissed: false };

  it('shows only after readiness when there is no checkpoint or dismissal', () => {
    const data = emptyData();
    expect(shouldShowLearningStart(data, eligible)).toBe(true);
    expect(shouldShowLearningStart(data, { ...eligible, ready: false })).toBe(false);
    expect(shouldShowLearningStart(data, { ...eligible, hasCheckpoint: true })).toBe(false);
    expect(shouldShowLearningStart(data, { ...eligible, dismissed: true })).toBe(false);
  });

  it('does not mistake a flag-only state for study, but hides after study history or logs', () => {
    const flagged = initialState('flagged');
    flagged.isDifficult = true;
    const data: Pick<Data, 'states' | 'logs'> = {
      states: [flagged],
      logs: [],
    };
    expect(shouldShowLearningStart(data, eligible)).toBe(true);
    expect(shouldShowLearningStart({ ...data, states: [{ ...data.states[0], firstSeenAt: '2026-10-10T00:00:00Z' }] }, eligible)).toBe(false);
    expect(shouldShowLearningStart({ ...data, states: [{ ...data.states[0], reviewCount: 1 }] }, eligible)).toBe(false);
    const studied = initialState('flagged');
    expect(shouldShowLearningStart({ ...data, logs: [{
      id: 'log', userId: 'local', wordId: 'flagged', reviewedAt: '2026-10-10T00:00:00Z', rating: 3,
      responseTime: 100, previousState: studied, newState: studied, studyMode: 'new',
    }] }, eligible)).toBe(false);
  });
});

describe('learning start dismissal preference', () => {
  it('keeps dismissal per owner and restores it after a module reload', async () => {
    const storage = preferenceStorage();
    vi.resetModules();
    let preference = await import('../apps/web/src/services/learning-start');
    preference.useLearningStartPreference().dismiss('account-a');
    expect(preference.useLearningStartPreference().isDismissed('account-a')).toBe(true);
    expect(preference.useLearningStartPreference().isDismissed('account-b')).toBe(false);
    expect(storage.get('kotobud.web.learning-start.v1')).toBe(JSON.stringify({ 'account-a': true }));

    vi.resetModules();
    preference = await import('../apps/web/src/services/learning-start');
    expect(preference.useLearningStartPreference().isDismissed('account-a')).toBe(true);
    expect(preference.useLearningStartPreference().isDismissed('account-b')).toBe(false);
  });

  it('falls back to an undismissed preference when the saved value is malformed', async () => {
    preferenceStorage({ 'kotobud.web.learning-start.v1': '{bad json' });
    vi.resetModules();
    const preference = await import('../apps/web/src/services/learning-start');

    expect(preference.useLearningStartPreference().isDismissed('account-a')).toBe(false);
    preference.useLearningStartPreference().dismiss('account-a');
    expect(preference.useLearningStartPreference().isDismissed('account-a')).toBe(true);
  });
});
