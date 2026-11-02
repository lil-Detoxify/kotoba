import { describe, expect, it } from 'vitest';
import type { ReadingContext, Word } from '@jp/models';
import { contextClozeExample, personalClozeExampleFor, personalExampleFor } from '../apps/web/src/services/personal-learning-example';

function context(overrides: Partial<ReadingContext> = {}): ReadingContext {
  return {
    id: 'context-1', sentence: '昨日、本を買いました。', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function word(overrides: Partial<Word> = {}): Word {
  return { id: 'word-1', lessonId: 'lesson-1', term: '本', reading: 'ほん', meaning: '书', order: 1, ...overrides };
}

describe('personal learning examples', () => {
  it('uses the newest valid original sentence without mutating the context list or inventing reading', () => {
    const contexts = [
      context({ id: 'old', sentence: '古い文。' }),
      context({ id: 'new', sentence: '新しい文。', updatedAt: '2026-10-03T00:00:00.000Z' }),
      context({ id: 'newest-created', sentence: '创建时间最新。', translation: '新句子', updatedAt: '2026-10-03T00:00:00.000Z', createdAt: '2026-10-04T00:00:00.000Z' }),
      { id: 'invalid', sentence: '', createdAt: '', updatedAt: '' } as ReadingContext,
    ];
    const originalOrder = contexts.map(item => item.id);
    const result = personalExampleFor(word({ readingContexts: contexts }));
    expect(result).toMatchObject({ context: { id: 'newest-created' }, example: { ja: '创建时间最新。', reading: '', zh: '新句子' } });
    expect(result?.example.cloze).toBeUndefined();
    expect(contexts.map(item => item.id)).toEqual(originalOrder);
  });

  it('prefers a requested fillable original and otherwise falls back to the newest fillable one', () => {
    const wordWithContexts = word({ readingContexts: [
      context({ id: 'latest', sentence: '本を読みました。', updatedAt: '2026-10-03T00:00:00.000Z' }),
      context({ id: 'chosen', sentence: '本を買いました。', updatedAt: '2026-10-02T00:00:00.000Z' }),
      context({ id: 'not-fillable', sentence: '勉強しました。', matchedText: '食べました', updatedAt: '2026-10-04T00:00:00.000Z' }),
    ] });
    expect(personalClozeExampleFor(wordWithContexts, 'chosen')?.context.id).toBe('chosen');
    expect(personalClozeExampleFor(wordWithContexts, 'not-fillable')?.context.id).toBe('latest');
  });

  it('creates a cloze only from the exact headword and preserves its literal source slice', () => {
    const original = context({ sentence: '本を買った。', matchedText: '本', translation: '买了书。' });
    expect(contextClozeExample(word(), original)).toEqual({
      ja: '本を買った。', reading: '', zh: '买了书。', cloze: { answer: '本', reading: 'ほん' },
    });
  });

  it('accepts a normalized reading but keeps the exact matched characters as the answer', () => {
    const original = context({ sentence: 'ホンを買った。', matchedText: 'ホン' });
    expect(contextClozeExample(word(), original)).toMatchObject({
      ja: 'ホンを買った。', reading: '', cloze: { answer: 'ホン', reading: 'ほん' },
    });
  });

  it('keeps inflected forms as display examples without making them cloze targets', () => {
    const original = context({ sentence: '昨日、本を食べました。', matchedText: '食べました' });
    expect(contextClozeExample(word(), original)).toBeUndefined();
    expect(personalExampleFor(word({ readingContexts: [original] }))).toMatchObject({
      context: { id: original.id }, example: { ja: original.sentence, reading: '' },
    });
  });

  it('does not make a cloze when the supported target appears more than once', () => {
    const original = context({ sentence: '本を買って、本を読みました。' });
    expect(contextClozeExample(word(), original)).toBeUndefined();
    expect(personalClozeExampleFor(word({ readingContexts: [original] }))).toBeUndefined();
  });
});
