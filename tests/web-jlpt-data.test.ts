import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import metadata from '../apps/web/src/textbooks-metadata.json';
import { validateWebTextbookDefinition, webTextbookWordId } from '../apps/web/src/services/textbook-catalog';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const vocabulary = read('data/wordbooks/jlpt-vocabulary.json');
const legacyFiles = [
  ['biaori-beginner-upper', 'aac035efef8c7ad2ad541e31dfead377b138a6d485730bb6e08058adb0f464d4'],
  ['biaori-beginner-lower', '9becf8d1972a69a8a9fe348351623aa93edfb9fcfcee6ed658764c8ec5ec1dea'],
  ['biaori-intermediate-upper', '57e2ac9b279774d7cab03d21a20130cbeefce74ba4ac8969929e862bade1f2dc'],
  ['biaori-intermediate-lower', 'b699d4034c5be15af247e9c5a315d8da3494e5737127004c2331f466b82d0013'],
  ['biaori-advanced-upper', '46e76474d43c35045bf1fc2690017aebb122a2639934bacc5670623d1806a4f2'],
  ['biaori-advanced-lower', 'ffd42f4b28cf337f5892a0439fe6f28fb26ccbdd91c876915637bc787d4c1cd3'],
];

describe('published Web wordbooks', () => {
  it.each(legacyFiles)('keeps original %s file bytes unchanged', (id, sha256) => {
    expect(createHash('sha256').update(readFileSync(`apps/web/public/data/books/${id}.json`)).digest('hex')).toBe(sha256);
  });

  it('publishes the same validated catalog and stable identities in metadata and lazy-loaded files', () => {
    expect(read('apps/web/public/data/books/index.json')).toEqual(metadata);
    expect(metadata.books.map(book => book.id).slice(0, 6)).toEqual(legacyFiles.map(([id]) => id));
    const identities = new Set<string>();
    const expectedCounts = [674, 630, 1659, 1778, 3068];
    const entries = new Map(vocabulary.entries.map((row: any) => [row.sourceId, row]));
    metadata.books.slice(6).forEach((meta, index) => {
      const book = validateWebTextbookDefinition(read(`apps/web/public/data/books/${meta.id}.json`), meta);
      expect(meta.wordCount).toBe(expectedCounts[index]);
      const seen = new Set<string>();
      for (const lesson of book.lessons) {
        expect(lesson.words.length).toBeGreaterThan(0);
        expect(lesson.words.length).toBeLessThanOrEqual(50);
        for (const [position, word] of lesson.words.entries()) {
          const id = webTextbookWordId(book.id, lesson.order, word, position);
          expect(identities.has(id)).toBe(false);
          identities.add(id);
          expect(seen.has(`${word.term}\u0000${word.reading}`)).toBe(false);
          seen.add(`${word.term}\u0000${word.reading}`);
          expect(word.meaning).toMatch(/[\u3400-\u9fff]/);
          expect(word).not.toHaveProperty('examples');
          const prepared = entries.get(word.sourceId) as any;
          expect(prepared?.level.toLowerCase()).toBe(book.id.slice(5));
          expect(word.meaning).toBe(prepared?.meaning);
        }
      }
    });
    expect(identities.size).toBe(7809);
  });

  it('quarantines conflicting spellings and excludes homophone or unrelated meanings from reviewed expressions', () => {
    const lookup = new Map(vocabulary.entries.map((row: any) => [row.sourceId, row])) as Map<string, any>;
    expect(lookup.has('8814988b80')).toBe(false);
    expect(lookup.has('4ec7fe1166')).toBe(false);
    expect(lookup.get('d374033b31').meaning).toBe('鸦雀无声地；静悄悄地');
    expect(lookup.get('d374033b31').provenance.dictionaryEntryId).toBeUndefined();
    expect(lookup.get('75012ef36e').meaning).toBe('事情的经过；来龙去脉');
    expect(lookup.get('558866ef86').meaning).toBe('什么');
    expect(lookup.get('67f7a8d49f').meaning).toBe('南；南方');
    expect(lookup.get('67f7a8d49f').provenance.dictionaryEntryId).toBe('2869020');
    expect(lookup.get('0ce2b98d3b').meaning).toBe('打电话；拨打');
    expect(lookup.get('ef3eb33c32').meaning).toBe('汉和词典；汉字词典');
    // 会う here means "to meet"; the separate accident sense must not leak in.
    expect(lookup.get('ada066edfd').meaning).not.toMatch(/不幸|事故/);
  });
});
