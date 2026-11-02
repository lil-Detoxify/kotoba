import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COVER_SCENES,
  createCatalog,
  EXPECTED_BOOK_WORD_COUNTS,
  JLPT_BOOK_WORD_COUNTS,
  LEGACY_TEXTBOOK_IDS,
  textbookCatalogWordId,
} from '../apps/extension/scripts/prepare.mjs';
import { bookCategory, bookPresentation, fullBookTitle } from '../apps/extension/src/book-presentation';
import { webTextbookWordId } from '../apps/web/src/services/textbook-catalog';
import { ExtensionRepository } from '../apps/extension/src/repository';
import type {
  ExtensionCatalogWord,
  TextbookBookMetadata,
  TextbookBookSource,
} from '../apps/extension/scripts/prepare.mjs';

const repo = process.cwd();
const bookIndex = JSON.parse(readFileSync(resolve(repo, 'apps/web/public/data/books/index.json'), 'utf8')) as {
  books: TextbookBookMetadata[];
};
const booksById = new Map<string, TextbookBookSource>(bookIndex.books.map(meta => [
  meta.id,
  JSON.parse(readFileSync(resolve(repo, 'apps/web/public/data/books/' + meta.id + '.json'), 'utf8')) as TextbookBookSource,
] as const));
const catalog = createCatalog(bookIndex.books, booksById);
const wordsById = new Map<string, ExtensionCatalogWord>(catalog.map(word => [word.id, word] as const));

describe('extension textbook catalog compatibility', () => {
  it('keeps all six legacy book IDs, word IDs, source contents and order', () => {
    const legacyCount = LEGACY_TEXTBOOK_IDS.reduce(
      (sum, id) => sum + EXPECTED_BOOK_WORD_COUNTS[id as keyof typeof EXPECTED_BOOK_WORD_COUNTS],
      0,
    );
    expect(legacyCount).toBe(9_117);
    let expectedOrder = 0;

    for (const bookId of LEGACY_TEXTBOOK_IDS) {
      const book = booksById.get(bookId)!;
      let bookCount = 0;
      for (const lesson of book.lessons) {
        for (const [index, row] of lesson.words.entries()) {
          const sourceIndex = row.sourceIndex ?? index;
          const id = bookId + '-w-' + lesson.order + '-' + sourceIndex;
          const packed = catalog[expectedOrder];
          expect(packed.id).toBe(id);
          expect(packed.lessonId).toBe(bookId + '-l-' + lesson.order);
          expect(packed.order).toBe(expectedOrder + 1);
          expect(packed).toMatchObject({
            term: row.term,
            reading: row.reading,
            meaning: row.meaning,
            bookTitle: book.title,
            lessonTitle: lesson.title,
          });
          for (const field of ['partOfSpeech', 'audioTerm', 'rawTerm', 'example'] as const) {
            if (row[field] !== undefined) expect(packed[field]).toEqual(row[field]);
          }
          expectedOrder++;
          bookCount++;
        }
      }
      expect(bookCount).toBe(EXPECTED_BOOK_WORD_COUNTS[bookId as keyof typeof EXPECTED_BOOK_WORD_COUNTS]);
    }
    expect(expectedOrder).toBe(9_117);
  });

  it('uses the canonical Web sourceId identity for all five JLPT books', () => {
    let jlptCount = 0;
    for (const [bookId, expectedCount] of Object.entries(JLPT_BOOK_WORD_COUNTS)) {
      const book = booksById.get(bookId)!;
      let bookCount = 0;
      for (const lesson of book.lessons) {
        for (const [index, row] of lesson.words.entries()) {
          const expectedId = webTextbookWordId(bookId, lesson.order, row, index);
          const packed = wordsById.get(expectedId);
          expect(packed).toBeDefined();
          expect(packed?.id).toBe(expectedId);
          expect(packed).not.toHaveProperty('sourceId');
          expect(packed?.order).toBeGreaterThan(9_117);
          expect(packed?.audioTerm).toBe(row.audioTerm);
          expect(packed?.rawTerm).toBe(row.rawTerm);
          expect(packed?.example).toBe(row.example);
          bookCount++;
        }
      }
      expect(bookCount).toBe(expectedCount);
      jlptCount += bookCount;
    }
    expect(jlptCount).toBe(7_809);
    expect(catalog).toHaveLength(16_926);
  });

  it('rejects missing or malformed JLPT source IDs and unapproved catalog books', () => {
    expect(() => textbookCatalogWordId('jlpt-n5', 1, { term: '語' }, 0)).toThrow(/sourceId/);
    expect(() => textbookCatalogWordId('jlpt-n5', 1, { sourceId: '../x' }, 0)).toThrow(/sourceId/);
    expect(() => createCatalog([...bookIndex.books, { id: 'minna-beginner' } as TextbookBookMetadata], booksById)).toThrow(/six existing textbooks/);
    expect(bookIndex.books.some(book => /minna/i.test(book.id))).toBe(false);
  });

  it('rates an N5 catalog word through the repository and reloads the stable ID', async () => {
    const n5Word = wordsById.get('jlpt-n5-w-ada066edfd')!;
    expect(n5Word).toBeDefined();
    expect(Object.keys(n5Word)).not.toContain('sourceId');

    const repo = new ExtensionRepository('extension-n5-catalog-' + Math.random().toString(36).slice(2));
    const rated = await repo.rateLearning(n5Word, 3, 'n5-catalog-rate', 0, 'new', 1_200);
    expect(rated.learning.states).toHaveLength(1);
    expect(rated.learning.states[0]).toMatchObject({ wordId: 'jlpt-n5-w-ada066edfd', reviewCount: 1 });

    const reloaded = await repo.read();
    expect(reloaded.learning.states[0]).toMatchObject({ wordId: 'jlpt-n5-w-ada066edfd', reviewCount: 1 });
    expect(reloaded.learning.logs[0].wordId).toBe('jlpt-n5-w-ada066edfd');
  });

  it('provides full book names and stable local cover scenes without changing persisted titles', () => {
    expect(COVER_SCENES).toEqual(['town', 'train', 'cafe', 'bridge', 'table', 'museum', 'garden']);
    expect(bookCategory({ id: 'biaori-beginner-upper' })).toBe('textbook');
    expect(bookCategory({ id: 'jlpt-n5' })).toBe('jlpt');
    expect(fullBookTitle({ id: 'biaori-beginner-upper', title: '标日初级上' })).toBe('新版标准日本语初级上册');
    expect(fullBookTitle({ id: 'jlpt-n5', title: 'JLPT N5 备考词汇' })).toBe('JLPT N5 备考词汇');
    expect(bookPresentation({ id: 'jlpt-n5', title: 'JLPT N5 备考词汇', description: '' })).toMatchObject({
      scene: 'garden',
      title: 'JLPT N5 备考词汇',
      series: 'JLPT / 备考词汇',
      exam: true,
    });
    expect(bookPresentation({ id: 'custom-book', title: '我的词书', description: '' }).title).toBe('我的词书');
  });
});
