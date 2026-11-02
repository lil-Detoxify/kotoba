import { beforeEach, describe, expect, it, vi } from 'vitest';
import { textbookWordId } from '@jp/importers';
import { LEGACY_TEXTBOOK_IDS, SYSTEM_CATALOG_VERSION, webTextbookWordId } from '../apps/web/src/services/textbook-catalog';
import {
  loadTextbookSearchCatalog,
  mergeVocabularyEntries,
  resetTextbookSearchCacheForTests,
  saveSearchEntryToDifficult,
  searchVocabularyEntries,
  searchVocabularyCandidates,
  type VocabularySearchEntry,
} from '../apps/web/src/services/vocabulary-search';
import { groupVocabularySearchResults } from '../apps/web/src/services/vocabulary-search-groups';

const bookIds: string[] = [...LEGACY_TEXTBOOK_IDS];
const jlptBookId: string = 'jlpt-n5';

function makeIndex() {
  return {
    books: bookIds.map((id, index) => ({
      id,
      title: `教材 ${index + 1}`,
      description: '词汇来源',
      wordCount: index === 0 ? 2 : 0,
      lessons: [{ id: `${id}-l-1`, bookId: id, title: '第1课', order: 1, wordCount: index === 0 ? 2 : 0 }],
    })),
  };
}

function makeBook(id = bookIds[0]) {
  return {
    id,
    title: '教材 1',
    description: '词汇来源',
    wordCount: 2,
    lessons: [{
      title: '第1课',
      order: 1,
      words: [
        { term: '日本', reading: 'にほん', meaning: '日本', sourceIndex: 5 },
        { term: '日本人', reading: 'にほんじん', meaning: '日本人', sourceIndex: 9 },
      ],
    }],
  };
}

function entry(overrides: Partial<VocabularySearchEntry> = {}): VocabularySearchEntry {
  return {
    id: 'custom-1',
    lessonId: 'custom-lesson-1',
    term: '日本',
    reading: 'にほん',
    meaning: '日本',
    order: 1,
    bookId: 'custom-book',
    bookTitle: '我的词书',
    lessonTitle: '第1课',
    source: 'custom',
    ...overrides,
  };
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => resetTextbookSearchCacheForTests());

describe('Web vocabulary search', () => {
  it('groups all duplicate sources before limiting cards so they cannot crowd out other words', () => {
    const duplicates = Array.from({length:120}, (_, index) => entry({id:'duplicate-'+index, bookId:'book-'+index}));
    const candidates = searchVocabularyCandidates([
      ...duplicates,
      entry({id:'person', term:'日本人', reading:'にほんじん', meaning:'日本人'}),
      entry({id:'language', term:'日本語', reading:'にほんご', meaning:'日语'}),
    ], '日本');
    const groups = groupVocabularySearchResults(candidates, 'book-119');
    expect(groups).toHaveLength(3);
    expect(groups[0].entries).toHaveLength(120);
    expect(groups[0].preferred.id).toBe('duplicate-119');
    expect(groups.slice(1).map(group => group.preferred.id)).toEqual(['person','language']);
  });

  it('validates textbook payloads and derives stable textbook IDs', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/index.json')) return response(makeIndex());
      if (url.includes(`${bookIds[0]}.json`)) return response(makeBook());
      return response({ error: 'offline' }, 503);
    }) as unknown as typeof fetch;

    const result = await loadTextbookSearchCatalog({ fetcher });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      id: textbookWordId(bookIds[0], 1, 5),
      lessonId: `${bookIds[0]}-l-1`,
      term: '日本',
      bookTitle: '新版标准日本语初级上册',
      lessonTitle: '第1课',
      source: 'textbook',
    });
    expect(result.failedBookIds).toEqual(bookIds.slice(1));
    expect(fetcher).toHaveBeenCalledWith(`/data/books/index.json?v=${SYSTEM_CATALOG_VERSION}`, { cache: 'force-cache' });
    expect(fetcher).toHaveBeenCalledWith(`/data/books/${bookIds[0]}.json?v=${SYSTEM_CATALOG_VERSION}`, { cache: 'force-cache' });
  });

  it('keeps query-only cache results when a retry cannot reach the book resources', async () => {
    const firstFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/index.json')) return response(makeIndex());
      if (url.includes(`${bookIds[0]}.json`)) return response(makeBook());
      return response({}, 503);
    }) as unknown as typeof fetch;
    await loadTextbookSearchCatalog({ fetcher: firstFetch });

    const offlineFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('/index.json') ? response(makeIndex()) : response({}, 503);
    }) as unknown as typeof fetch;
    const retried = await loadTextbookSearchCatalog({ fetcher: offlineFetch, retry: true });

    expect(retried.entries).toHaveLength(2);
    expect(retried.cachedBookIds).toEqual([bookIds[0]]);
    expect(retried.failedBookIds).toEqual(bookIds.slice(1));
    expect(offlineFetch).toHaveBeenCalledWith(`/data/books/${bookIds[0]}.json?v=${SYSTEM_CATALOG_VERSION}`, { cache: 'reload' });
  });

  it('searches all legacy books and a new JLPT book from the validated dynamic directory', async () => {
    const sourceId = '0123abcdef';
    const specs = [
      ...bookIds.map((id, index) => ({
        id,
        title: `旧教材 ${index + 1}`,
        description: '原有系统词书',
        wordCount: 1,
        lessons: [{ title: '第1课', order: 1, wordCount: 1 }],
      })),
      {
        id: jlptBookId,
        title: 'JLPT N5',
        description: 'JLPT 五级词汇',
        wordCount: 1,
        lessons: [{ title: 'N5 单词', order: 1, wordCount: 1 }],
      },
    ];
    const payloads = new Map<string, unknown>([
      ...bookIds.map((id, index) => [id, {
        id,
        title: `旧教材 ${index + 1}`,
        wordCount: 1,
        lessons: [{ title: '第1课', order: 1, words: [{ term: '日本', reading: 'にほん', meaning: '日本', sourceIndex: 0 }] }],
      }] as [string, unknown]),
      [jlptBookId, {
        id: jlptBookId,
        title: 'JLPT N5',
        wordCount: 1,
        lessons: [{ title: 'N5 单词', order: 1, words: [{ term: '試験専用語彙', reading: 'しけんせんようごい', meaning: 'N5 测试词', sourceId }] }],
      }],
    ]);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/index.json')) return response({ books: specs });
      const id = url.match(/\/data\/books\/([^.?]+)/)?.[1];
      return id && payloads.has(id) ? response(payloads.get(id)) : response({}, 503);
    }) as unknown as typeof fetch;

    const result = await loadTextbookSearchCatalog({ fetcher });
    const legacyResults = searchVocabularyEntries(result.entries, '日本');
    const jlptResults = searchVocabularyEntries(result.entries, '試験専用語彙');

    expect(legacyResults).toHaveLength(6);
    expect(legacyResults.map(item => item.bookId)).toEqual(bookIds);
    expect(jlptResults).toHaveLength(1);
    expect(jlptResults[0]).toMatchObject({
      id: `${jlptBookId}-w-${sourceId}`,
      bookId: jlptBookId,
      bookTitle: 'JLPT N5 备考词汇',
      source: 'textbook',
    });
    expect(webTextbookWordId(jlptBookId, 9, { sourceId }, 500)).toBe(jlptResults[0].id);
    expect(result.failedBookIds).toEqual([]);
  });

  it('skips a damaged added directory row and reports a partial catalog error', async () => {
    const index = makeIndex();
    index.books.push({
      id: jlptBookId,
      title: '',
      description: 'malformed addition',
      wordCount: 1,
      lessons: [{ id: `${jlptBookId}-l-1`, bookId: jlptBookId, title: 'N5 单词', order: 1, wordCount: 1 }],
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/index.json')) return response(index);
      if (url.includes(`${bookIds[0]}.json`)) return response(makeBook());
      return response({}, 503);
    }) as unknown as typeof fetch;

    const result = await loadTextbookSearchCatalog({ fetcher });

    expect(result.entries).toHaveLength(2);
    expect(result.failedBookIds).toEqual(bookIds.slice(1));
    expect(result.indexError).toContain('部分无效');
    expect(fetcher).not.toHaveBeenCalledWith(`/data/books/${jlptBookId}.json?v=${SYSTEM_CATALOG_VERSION}`, expect.anything());
  });

  it('keeps all prior book data when a later directory is missing a required legacy book', async () => {
    const specs = bookIds.map((id, index) => ({
      id,
      title: `旧教材 ${index + 1}`,
      description: '原有系统词书',
      wordCount: 1,
      lessons: [{ title: '第1课', order: 1, wordCount: 1 }],
    }));
    const payloads = new Map(specs.map((book, index) => [book.id, {
      id: book.id,
      title: book.title,
      wordCount: 1,
      lessons: [{ title: '第1课', order: 1, words: [{ term: `旧词${index}`, reading: 'ふるいご', meaning: '旧词', sourceIndex: 0 }] }],
    }]));
    const initialFetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/index.json')) return response({ books: specs });
      const id = url.match(/\/data\/books\/([^.?]+)/)?.[1];
      return id && payloads.has(id) ? response(payloads.get(id)) : response({}, 503);
    }) as unknown as typeof fetch;
    const initial = await loadTextbookSearchCatalog({ fetcher: initialFetcher });

    const incompleteDirectory = { books: specs.slice(0, -1) };
    const offlineFetcher = vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes('/index.json') ? response(incompleteDirectory) : response({}, 503)
    )) as unknown as typeof fetch;
    const retried = await loadTextbookSearchCatalog({ fetcher: offlineFetcher, retry: true });

    expect(initial.entries).toHaveLength(6);
    expect(retried.entries.map(item => item.id)).toEqual(initial.entries.map(item => item.id));
    expect(retried.cachedBookIds).toEqual(bookIds);
    expect(retried.indexError).toContain('原有词书缺少或损坏');
  });

  it('does not let a slower earlier directory response replace the latest accepted catalog', async () => {
    let resolveOldIndex!: (response: Response) => void;
    const oldIndex = new Promise<Response>(resolve => { resolveOldIndex = resolve; });
    const oldFetcher = vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes('/index.json') ? oldIndex : response({}, 503)
    )) as unknown as typeof fetch;
    const slowLoad = loadTextbookSearchCatalog({ fetcher: oldFetcher });

    const currentSpecs = [
      ...bookIds.map((id, index) => ({
        id,
        title: `旧教材 ${index + 1}`,
        description: '原有系统词书',
        wordCount: 0,
        lessons: [{ title: '第1课', order: 1, wordCount: 0 }],
      })),
      { id: jlptBookId, title: 'JLPT N5', description: '', wordCount: 1, lessons: [{ title: 'N5 单词', order: 1, wordCount: 1 }] },
    ];
    const currentFetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/index.json')) return response({ books: currentSpecs });
      const id = url.match(/\/data\/books\/([^.?]+)/)?.[1];
      if (id === jlptBookId) return response({
        id,
        title: 'JLPT N5',
        wordCount: 1,
        lessons: [{ title: 'N5 单词', order: 1, words: [{ term: '最新目录词', reading: 'さいしん', meaning: '最新', sourceId: 'abcdef0123' }] }],
      });
      const spec = currentSpecs.find(book => book.id === id);
      return spec ? response({ id, title: spec.title, wordCount: 0, lessons: [{ title: '第1课', order: 1, words: [] }] }) : response({}, 503);
    }) as unknown as typeof fetch;
    await loadTextbookSearchCatalog({ fetcher: currentFetcher });

    resolveOldIndex(response(makeIndex()));
    const slowResult = await slowLoad;

    expect(searchVocabularyEntries(slowResult.entries, '最新目录词')).toHaveLength(1);
  });

  it('loads an eleven-book catalog with at most three simultaneous book requests', async () => {
    const jlptBookIds = ['jlpt-n5', 'jlpt-n4', 'jlpt-n3', 'jlpt-n2', 'jlpt-n1'];
    const specs = [
      ...bookIds.map((id, index) => ({
        id,
        title: `旧教材 ${index + 1}`,
        description: '原有系统词书',
        wordCount: 1,
        lessons: [{ title: '第1课', order: 1, wordCount: 1 }],
      })),
      ...jlptBookIds.map((id, index) => ({
        id,
        title: `JLPT ${id.slice(-2).toUpperCase()}`,
        description: 'JLPT 系统词书',
        wordCount: 1,
        lessons: [{ title: `${id.slice(-2).toUpperCase()} 单词`, order: 1, wordCount: 1 }],
      })),
    ];
    const payloads = new Map<string, unknown>(specs.map((book, index) => [book.id, {
      id: book.id,
      title: book.title,
      wordCount: 1,
      lessons: [{
        title: book.lessons[0].title,
        order: 1,
        words: [{
          term: '并发目录检索词',
          reading: 'へいこうもくろくけんさくご',
          meaning: '并发控制测试',
          ...(book.id.startsWith('jlpt-')
            ? { sourceId: index.toString(16).padStart(10, '0') }
            : { sourceIndex: 0 }),
        }],
      }],
    }]));
    let activeBookRequests = 0;
    let peakBookRequests = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/index.json')) return response({ books: specs });
      const id = url.match(/\/data\/books\/([^.?]+)/)?.[1];
      if (!id || !payloads.has(id)) return response({}, 503);
      activeBookRequests++;
      peakBookRequests = Math.max(peakBookRequests, activeBookRequests);
      await new Promise<void>(resolve => setTimeout(resolve, 15));
      activeBookRequests--;
      return response(payloads.get(id));
    }) as unknown as typeof fetch;

    const result = await loadTextbookSearchCatalog({ fetcher });

    expect(peakBookRequests).toBe(3);
    expect(result.failedBookIds).toEqual([]);
    expect(searchVocabularyEntries(result.entries, '并发目录检索词')).toHaveLength(11);
    expect(new Set(result.entries.map(item => item.bookId)).size).toBe(11);
  });

  it('merges account-local words and orders normalized exact, prefix, then substring matches', () => {
    const exact = entry({ id: 'exact', term: '日本', reading: 'にほん', meaning: '日本', order: 10 });
    const prefix = entry({ id: 'prefix', term: '日本人', reading: 'にほんじん', meaning: '日本人', order: 1 });
    const substring = entry({ id: 'substring', term: '大日本', reading: 'だいにほん', meaning: '大日本', order: 2 });
    const textbook = [exact, prefix];
    const local = [entry({ id: 'local-word', term: '日本語', reading: 'にほんご', meaning: '日本語', order: 3 })];

    const merged = mergeVocabularyEntries(textbook, local);
    const result = searchVocabularyEntries([...merged, substring], 'ニホン');

    expect(result.map(item => item.id)).toEqual(['exact', 'prefix', 'local-word', 'substring']);
    expect(searchVocabularyEntries(merged, '  ')).toEqual([]);
    expect(searchVocabularyEntries(merged, '日'.repeat(81))).toEqual([]);
  });

  it('requires an explicit restore before an ignored word can be saved', async () => {
    const flags = { isIgnored: true, isDifficult: false };
    const flag = vi.fn(async (_id: string, key: 'isIgnored' | 'isDifficult', value: boolean) => { flags[key] = value; });
    const status = await saveSearchEntryToDifficult(entry(), {
      expectedUserId: 'user-7',
      restoreIgnored: false,
      isCurrent: () => true,
      ensureBookLoaded: vi.fn(async () => true),
      findWord: vi.fn(() => ({ id: 'custom-1' } as any)),
      getState: () => flags,
      flag,
    });

    expect(status).toBe('ignored');
    expect(flag).not.toHaveBeenCalled();
  });

  it('restores an ignored word before saving with the captured account ID', async () => {
    const flags = { isIgnored: true, isDifficult: false };
    const flag = vi.fn(async (_id: string, key: 'isIgnored' | 'isDifficult', value: boolean, _userId: string | null) => { flags[key] = value; });
    const status = await saveSearchEntryToDifficult(entry(), {
      expectedUserId: 'user-7',
      restoreIgnored: true,
      isCurrent: () => true,
      ensureBookLoaded: vi.fn(async () => true),
      findWord: vi.fn(() => ({ id: 'custom-1' } as any)),
      getState: () => flags,
      flag,
    });

    expect(status).toBe('saved');
    expect(flag.mock.calls).toEqual([
      ['custom-1', 'isIgnored', false, 'user-7'],
      ['custom-1', 'isDifficult', true, 'user-7'],
    ]);
  });

  it('does not start a favorite write if the account changes while the book is loading', async () => {
    let currentUser = true;
    const flag = vi.fn(async () => {});
    const status = await saveSearchEntryToDifficult(entry(), {
      expectedUserId: 'user-before-switch',
      restoreIgnored: false,
      isCurrent: () => currentUser,
      ensureBookLoaded: async () => { currentUser = false; return true; },
      findWord: vi.fn(() => ({ id: 'custom-1' } as any)),
      getState: () => undefined,
      flag,
    });

    expect(status).toBe('stale');
    expect(flag).not.toHaveBeenCalled();
  });
});
