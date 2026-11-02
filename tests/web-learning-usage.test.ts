import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeVocabularySearchText } from '@jp/shared';
import type { Word } from '@jp/models';
import { learningUsageCatalog, usageFor } from '../apps/web/src/services/learning-usage';

const identity = (word: { term: string; reading: string }) => JSON.stringify([
  word.term.normalize('NFKC').trim(), normalizeVocabularySearchText(word.reading),
]);
const metadata = JSON.parse(readFileSync(new URL('../apps/web/src/textbooks-metadata.json', import.meta.url), 'utf8')) as { books: Array<{ id: string }> };
const sourceWords = metadata.books.flatMap(book => {
  const data = JSON.parse(readFileSync(new URL(`../apps/web/public/data/books/${book.id}.json`, import.meta.url), 'utf8')) as { lessons: Array<{ words: Array<{ term: string; reading: string }> }> };
  return data.lessons.flatMap(lesson => lesson.words);
});
const sourceIdentities = new Set(sourceWords.map(identity));

describe('verified word usage content', () => {
  it('covers both sides of thirty pairs using distinct forms found in the actual catalog', () => {
    expect(learningUsageCatalog).toHaveLength(60);
    const forms = new Set<string>();
    for (const entry of learningUsageCatalog) {
      expect(entry.forms.length).toBeGreaterThan(0);
      for (const form of entry.forms) {
        const id = identity(form);
        expect(sourceIdentities.has(id), `${entry.id}: ${form.term} / ${form.reading}`).toBe(true);
        expect(forms.has(id), `Duplicate usage alias: ${form.term} / ${form.reading}`).toBe(false);
        forms.add(id);
      }
      expect(entry.contrast).toBeDefined();
      const counterpart = usageFor(entry.contrast!);
      expect(counterpart, `Missing reverse note for ${entry.id}`).toBeDefined();
      expect(usageFor(counterpart!.contrast!)).toBe(entry);
    }
  });

  it('shares verified textbook and dictionary forms while normalizing kana and width', () => {
    const borrow = usageFor({ term: '借ります', reading: 'かります' });
    expect(borrow).toBeDefined();
    expect(usageFor({ term: '借りる', reading: 'かりる' })).toBe(borrow);
    expect(usageFor({ term: ' 借ります ', reading: ' ｶﾘﾏｽ ' })).toBe(borrow);
    expect(usageFor({ term: '貸します', reading: 'かします' })?.contrast?.term).toBe('借りる');
  });

  it('keeps homographs and homophones from receiving the wrong comparison', () => {
    expect(usageFor({ term: '降ります', reading: 'おります' })).toBeDefined();
    expect(usageFor({ term: '降ります', reading: 'ふります' })).toBeUndefined();
    expect(usageFor({ term: '開く', reading: 'あく' })).toBeDefined();
    expect(usageFor({ term: '開く', reading: 'ひらく' })).toBeUndefined();
    expect(usageFor({ term: '切る', reading: 'きる' })).toBeUndefined();
    expect(usageFor({ term: 'ハク', reading: 'ハク' })).toBeUndefined();
  });

  it('provides readable phrases and reciprocal contrasts without modifying the word', () => {
    const word: Word = {
      id: 'source-word', lessonId: 'source-lesson', term: '借ります', reading: 'かります', meaning: '借入', order: 1,
      example: '図書館で本を借りました。', exampleTranslation: '在图书馆借了书。', note: '自己的笔记',
      readingContexts: [{ id: 'mine', sentence: 'ペンを借りました。', createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' }],
    };
    const before = structuredClone(word);
    usageFor(word);
    expect(word).toEqual(before);
    for (const entry of learningUsageCatalog) {
      for (const phrase of [entry.collocation, entry.contrast!.collocation]) {
        expect(phrase.ja && phrase.reading && phrase.zh).toBeTruthy();
        expect(phrase.reading).toMatch(/^[\u3040-\u30ff\s、。ー]+$/u);
      }
      expect(JSON.stringify(entry)).not.toContain('；');
    }
    expect(usageFor({ term: 'unknown', reading: 'unknown' })).toBeUndefined();
  });
});
