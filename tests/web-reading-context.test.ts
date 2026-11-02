import { describe, expect, it } from 'vitest';
import { cleanReadingContext, upsertReadingContext } from '../apps/web/src/services/reading-context';

describe('reading context content', () => {
  it('keeps the original sentence and normalizes optional attribution fields', () => {
    expect(cleanReadingContext({ sentence: ' 昨日、寿司を食べました。\r\n楽しかったです。 ', translation: ' 昨天吃了寿司。 ', sourceTitle: ' 阅读练习 ', sourceUrl: ' https://EXAMPLE.test/story ', matchedText: ' 食べました ' })).toEqual({
      sentence: '昨日、寿司を食べました。\n楽しかったです。', translation: '昨天吃了寿司。', sourceTitle: '阅读练习', sourceUrl: 'https://example.test/story', matchedText: '食べました',
    });
    expect(() => cleanReadingContext({ sentence: '  ' })).toThrow('请填写');
    expect(() => cleanReadingContext({ sentence: '原句', sourceUrl: 'example.test/story' })).toThrow('完整');
  });

  it('updates a repeated sentence from the same source without allocating another record', () => {
    const first = upsertReadingContext([], { sentence: '朝、本を読みます。', sourceUrl: 'https://example.test/story' }, { now: new Date('2026-10-10T00:00:00Z'), createId: () => 'context-1' });
    const second = upsertReadingContext(first.contexts, { sentence: '朝、本を読みます。', translation: '早上读书。', sourceUrl: 'https://example.test/story' }, { now: new Date('2026-10-10T01:00:00Z'), createId: () => { throw new Error('must not allocate'); } });
    expect(second.created).toBe(false);
    expect(second.contexts).toHaveLength(1);
    expect(second.contexts[0]).toMatchObject({ id: 'context-1', createdAt: first.contexts[0].createdAt, translation: '早上读书。' });
    expect(first.contexts[0].translation).toBeUndefined();
    const repeated = upsertReadingContext(second.contexts, { sentence: '朝、本を読みます。', sourceUrl: 'https://example.test/story' }, { now: new Date(), createId: () => 'unused' });
    expect(repeated.contexts[0].translation).toBe('早上读书。');
    const cleared = upsertReadingContext(second.contexts, { sentence: '朝、本を読みます。', sourceUrl: 'https://example.test/story' }, { contextId: 'context-1', now: new Date(), createId: () => 'unused' });
    expect(cleared.contexts[0].translation).toBeUndefined();
    const other = upsertReadingContext(second.contexts, { sentence: '朝、本を読みます。', sourceUrl: 'https://example.test/another-story' }, { now: new Date(), createId: () => 'context-2' });
    expect(other.contexts).toHaveLength(2);
  });

  it('edits a selected record while retaining its identity and rejects conflicting edits', () => {
    const first = upsertReadingContext([], { sentence: '本を読みます。' }, { now: new Date(), createId: () => 'first' });
    const edited = upsertReadingContext(first.contexts, { sentence: '本を読んでいます。' }, { contextId: 'first', now: new Date(), createId: () => 'unused' });
    expect(edited.id).toBe('first');
    expect(edited.contexts[0].createdAt).toBe(first.contexts[0].createdAt);
    expect(() => upsertReadingContext(first.contexts, { sentence: '句子' }, { contextId: 'missing', now: new Date(), createId: () => 'new' })).toThrow('重新打开');
    const two = upsertReadingContext(edited.contexts, { sentence: '別の原句。' }, { now: new Date(), createId: () => 'second' });
    expect(() => upsertReadingContext(two.contexts, { sentence: '別の原句。' }, { contextId: 'first', now: new Date(), createId: () => 'unused' })).toThrow('已收藏');
  });
});
