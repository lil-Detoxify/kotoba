import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import type { WordState } from '@jp/models';
import { createStudyCheckpointStore, resolveStudyCheckpoint, type ExtensionStudyCheckpoint } from '../apps/extension/src/study-checkpoint';
import { emptySnapshot, type ExtensionSnapshot, type ExtensionWord } from '../apps/extension/src/model';

function word(id: string, lessonId = 'book-l-1', order = 1): ExtensionWord {
  return {
    id, lessonId, term: id, reading: 'よみ', meaning: id, order,
    source: 'textbook', bookTitle: 'Book', lessonTitle: 'Lesson'
  };
}

function state(id: string, userId: string, patch: Partial<WordState> = {}): WordState {
  return { ...initialState(id, new Date('2026-10-15T00:00:00.000Z'), userId), ...patch };
}

function checkpoint(owner: string, patch: Partial<ExtensionStudyCheckpoint> = {}): ExtensionStudyCheckpoint {
  return {
    version: 1,
    owner,
    bookIds: ['book'],
    wordIds: ['word-a'],
    reviewCounts: [0],
    mode: 'new',
    exercise: 'card',
    updatedAt: '2026-10-15T00:00:00.000Z',
    ...patch
  };
}

function snapshot(partitionKey = 'current', userId = 'local'): ExtensionSnapshot {
  return { ...emptySnapshot(), identity: { partitionKey, userId } };
}

describe('extension study checkpoints', () => {
  it('isolates saved checkpoints by owner and clears when the remaining queue is empty', () => {
    const values = new Map<string, string>();
    const store = createStudyCheckpointStore({
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); }
    });
    const local = checkpoint('current');
    const account = checkpoint('account:user-1', { wordIds: ['account-word'] });

    expect(store.write(local)).toBe(true);
    expect(store.write(account)).toBe(true);
    expect(store.read('current')?.wordIds).toEqual(['word-a']);
    expect(store.read('account:user-1')?.wordIds).toEqual(['account-word']);
    expect(store.read('local')).toBeNull();

    expect(store.write(checkpoint('current', { wordIds: [], reviewCounts: [] }))).toBe(true);
    expect(store.read('current')).toBeNull();
    expect(store.read('account:user-1')?.wordIds).toEqual(['account-word']);
  });

  it('restores only remaining valid words in checkpoint order', () => {
    const keepB = word('keep-b', 'book-l-1', 2);
    const ignored = word('ignored');
    const learned = word('learned');
    const changed = word('changed');
    const outsideBook = word('outside-book', 'other-l-1');
    const keepA = word('keep-a', 'book-l-2', 1);
    const current = snapshot();
    current.learning.states = [
      state('ignored', 'local', { isIgnored: true }),
      state('learned', 'local', { firstSeenAt: '2026-10-14T00:00:00.000Z', reviewCount: 1 }),
      state('changed', 'local', { reviewCount: 2 })
    ];
    const saved = checkpoint('current', {
      wordIds: ['keep-b', 'deleted', 'ignored', 'keep-a', 'learned', 'changed', 'outside-book'],
      reviewCounts: [0, 0, 0, 0, 0, 0, 0]
    });

    const resolved = resolveStudyCheckpoint(
      [keepB, ignored, learned, changed, outsideBook, keepA],
      current,
      saved
    );

    expect(resolved.map(item => item.word.id)).toEqual(['keep-b', 'keep-a']);
    expect(resolved[0].word).toBe(keepB);
    expect(resolved[1].word).toBe(keepA);
    expect(resolved[0].state.userId).toBe('local');
  });

  it('round trips a valid scene id while accepting checkpoints saved before scene mode', () => {
    const values = new Map<string, string>();
    const store = createStudyCheckpointStore({
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); }
    });
    const sceneCheckpoint = checkpoint('current', { sceneId: 'shopping' });
    expect(store.write(sceneCheckpoint)).toBe(true);
    expect(store.read('current')).toMatchObject({ sceneId: 'shopping' });

    const legacyCheckpoint = checkpoint('current');
    expect(store.write(legacyCheckpoint)).toBe(true);
    expect(store.read('current')).toEqual(legacyCheckpoint);
    expect(store.read('current')).not.toHaveProperty('sceneId');
    expect(store.write(checkpoint('current', { sceneId: 'missing' }))).toBe(false);
  });

  it('round trips selected personal reading contexts only for queued words', () => {
    const values = new Map<string, string>();
    const store = createStudyCheckpointStore({
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); }
    });
    const saved = checkpoint('current', {
      exercise: 'sentence-cloze',
      readingContextIds: { 'word-a': 'context-1' }
    });

    expect(store.write(saved)).toBe(true);
    expect(store.read('current')?.readingContextIds).toEqual({ 'word-a': 'context-1' });
    expect(store.write(checkpoint('current', { readingContextIds: { 'other-word': 'context-1' } }))).toBe(false);
    expect(store.write(checkpoint('current', { readingContextIds: { 'word-a': '  ' } }))).toBe(false);
  });

  it('prefers same-owner canonical state over its legacy mirror and ignores foreign state', () => {
    const current = snapshot('account:user-a', 'user-a');
    current.learning.states = [
      state('canonical-wins', 'user-a', { reviewCount: 3 }),
      state('foreign-state', 'user-b', { reviewCount: 9 })
    ];
    const legacyWord = word('canonical-wins');
    current.words = [{ word: legacyWord, savedAt: '2026-10-01T00:00:00.000Z', state: state('canonical-wins', 'user-a', { reviewCount: 2 }) }];
    const foreignWord = word('foreign-state');
    const saved = checkpoint('account:user-a', {
      mode: 'review',
      wordIds: ['canonical-wins', 'foreign-state'],
      reviewCounts: [2, 0]
    });

    const resolved = resolveStudyCheckpoint([legacyWord, foreignWord], current, saved);

    expect(resolved.map(item => item.word.id)).toEqual(['foreign-state']);
    expect(resolved[0].state.userId).toBe('user-a');
    expect(resolved[0].state.reviewCount).toBe(0);
  });

  it('uses the local owner when the snapshot has no runtime identity', () => {
    const current = emptySnapshot();
    const saved = checkpoint('local', { wordIds: ['word-a'] });
    const currentWord = word('word-a');

    expect(resolveStudyCheckpoint([currentWord], current, saved).map(item => item.word)).toEqual([currentWord]);
    expect(resolveStudyCheckpoint([currentWord], current, checkpoint('current', { wordIds: ['word-a'] }))).toEqual([]);
  });

  it('treats unavailable storage as best effort', () => {
    const store = createStudyCheckpointStore({
      getItem: () => { throw new Error('storage unavailable'); },
      setItem: () => { throw new Error('storage unavailable'); },
      removeItem: () => { throw new Error('storage unavailable'); }
    });

    expect(store.read('current')).toBeNull();
    expect(store.write(checkpoint('current'))).toBe(false);
    expect(() => store.clear('current')).not.toThrow();
  });
});
