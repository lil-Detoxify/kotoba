import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ExtensionRepository } from '../apps/extension/src/repository';
import { resolveStudyCheckpoint, createStudyCheckpointStore } from '../apps/extension/src/study-checkpoint';
import type { ExtensionWord } from '../apps/extension/src/model';
import { buildStudyQueue } from '../apps/extension/src/learning';

const word: ExtensionWord = { id: 'book-word', lessonId: 'book-l-1', term: '旅', reading: 'たび', meaning: '旅行', order: 1, source: 'textbook', bookTitle: '旅途', lessonTitle: '第一课' };
function repository(partition = 'current') { return new ExtensionRepository(`feedback-${crypto.randomUUID()}`, partition); }

describe('extension explicit feedback practice', () => {
  it('restores an ignored word without resetting its schedule, logs or difficult flag', async () => {
    const repo = repository();
    await repo.rateLearning(word, 3, 'learned', 0, 'new', 500);
    await repo.setLearningFlags(word.id, { isDifficult: true, isIgnored: true }, word);
    const before = await repo.read();
    const restored = await repo.setLearningFlags(word.id, { isIgnored: false }, word);
    expect(restored.learning.logs).toEqual(before.learning.logs);
    expect(restored.learning.states[0].card).toEqual(before.learning.states[0].card);
    expect(restored.learning.states[0]).toMatchObject({ reviewCount: 1, isDifficult: true, isIgnored: false, nextReviewAt: before.learning.states[0].nextReviewAt });
    expect(buildStudyQueue([word], restored.learning.states, { mode: 'new' })).toEqual([]);
  });

  it('returns an unlearned restored word to the new-word queue', async () => {
    const repo = repository();
    const ignored = await repo.setLearningFlags(word.id, { isIgnored: true }, word);
    expect(buildStudyQueue([word], ignored.learning.states, { mode: 'new' })).toEqual([]);
    const restored = await repo.setLearningFlags(word.id, { isIgnored: false }, word);
    expect(buildStudyQueue([word], restored.learning.states, { mode: 'new' }).map(item => item.word.id)).toEqual([word.id]);
    expect(restored.learning.logs).toEqual([]);
  });

  it('retries a forgotten original word before its due date, keeps flags, and survives a checkpoint reload', async () => {
    const repo = repository();
    const first = await repo.rateLearning(word, 1, 'first', 0, 'new', 500);
    const values = new Map<string, string>();
    const store = createStudyCheckpointStore({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } });
    store.write({ version: 1, owner: 'current', bookIds: ['book'], wordIds: [word.id], reviewCounts: [1], mode: 'difficult', exercise: 'card', feedbackPractice: true, updatedAt: new Date().toISOString() });
    const checkpoint = store.read('current')!;
    expect(checkpoint.feedbackPractice).toBe(true);
    expect(resolveStudyCheckpoint([word], first, checkpoint).map(item => item.word.id)).toEqual([word.id]);
    // Reproduce Chromium's null serialization for absent quiz/scene slots.
    const graded = await repo.rateLearning(word, 3, 'practice', 1, 'difficult', 600, null, null, true);
    expect(graded.learning.states[0]).toMatchObject({ wordId: word.id, bookId: 'book', lessonId: 'book-l-1', reviewCount: 2, isDifficult: false });
    expect(graded.learning.logs).toHaveLength(2);
    expect(await repo.rateLearning(word, 3, 'practice', 1, 'difficult', 600, null, null, true)).toEqual(graded);
    expect(resolveStudyCheckpoint([word], graded, checkpoint)).toEqual([]);
  });

  it('allows retry after an objectively wrong answer even when the user gave a remembered rating', async () => {
    const repo = repository('account:synthetic-user');
    await repo.recordQuizAttempt({ requestId: 'wrong-quiz', wordId: word.id, word, type: 'kana-input', prompt: '旅', options: [], selected: 'たふ', correct: 'たび', elapsedMs: 400 });
    const first = await repo.rateLearning(word, 3, 'first', 0, 'new', 500, 'wrong-quiz');
    expect(first.learning.logs[0].quiz?.isCorrect).toBe(false);
    const graded = await repo.rateLearning(word, 3, 'practice', 1, 'difficult', 600, null, null, true);
    expect(graded.learning.states[0]).toMatchObject({ userId: 'synthetic-user', reviewCount: 2, isDifficult: false });
    expect(graded.learning.logs).toHaveLength(2);
  });

  it('keeps normal difficult-mode rules and rejects an unrelated word without changing progress', async () => {
    const repo = repository();
    const first = await repo.rateLearning(word, 3, 'first', 0, 'new', 500);
    await expect(repo.rateLearning(word, 3, 'invalid-practice', 1, 'difficult', 600, null, null, true)).rejects.toThrow();
    expect(await repo.read()).toEqual(first);
    const forgotten = await repo.rateLearning({ ...word, id: 'forgotten' }, 1, 'forgotten-first', 0, 'new', 500);
    await expect(repo.rateLearning({ ...word, id: 'forgotten' }, 3, 'ordinary-difficult', 1, 'difficult', 600)).rejects.toThrow();
    expect(await repo.read()).toEqual(forgotten);
  });
});
