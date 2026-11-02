import { normalizeVocabularySearchText, rankVocabularyMatches, type SearchableVocabularyEntry } from '@jp/shared';
import type { Word, WordState } from '@jp/models';
import { createVocabularyInflectionMatcher, type VocabularyInflectionMatch } from './japanese-inflection';
import { fullBookTitle } from './book-presentation';
import {
  LEGACY_TEXTBOOK_IDS,
  SYSTEM_CATALOG_VERSION,
  validateWebTextbookDefinition,
  webTextbookWordId,
} from './textbook-catalog';

export type VocabularySource = 'textbook' | 'custom';

export interface VocabularySearchEntry extends Word, SearchableVocabularyEntry {
  bookId: string;
  bookTitle: string;
  lessonTitle: string;
  source: VocabularySource;
}

export interface VocabularySearchResult extends VocabularySearchEntry {
  inflection?: VocabularyInflectionMatch;
}

interface IndexLesson {
  title: string;
  order: number;
  wordCount?: number;
}

interface IndexBook {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  lessons: IndexLesson[];
}

export interface TextbookSearchLoad {
  entries: VocabularySearchEntry[];
  failedBookIds: string[];
  cachedBookIds: string[];
  indexError: string;
}

export type SearchFavoriteStatus = 'saved' | 'ignored' | 'stale' | 'unavailable';

/** Load a result into the app only after an explicit favorite action, fencing each async step by account identity. */
export async function saveSearchEntryToDifficult(
  entry: VocabularySearchEntry,
  options: {
    expectedUserId: string | null;
    restoreIgnored: boolean;
    isCurrent: () => boolean;
    ensureBookLoaded: (bookId: string, expectedUserId: string | null) => Promise<boolean>;
    findWord: (wordId: string) => Word | undefined;
    getState: (wordId: string, userId: string | null) => Pick<WordState, 'isDifficult' | 'isIgnored'> | undefined;
    flag: (wordId: string, key: 'isDifficult' | 'isIgnored', value: boolean, expectedUserId: string | null) => Promise<unknown>;
  },
): Promise<SearchFavoriteStatus> {
  if (!options.isCurrent()) return 'stale';
  const loaded = await options.ensureBookLoaded(entry.bookId, options.expectedUserId);
  if (!options.isCurrent()) return 'stale';
  if (!loaded) return 'unavailable';
  if (!options.findWord(entry.id)) return 'unavailable';

  let state = options.getState(entry.id, options.expectedUserId);
  if (state?.isIgnored) {
    if (!options.restoreIgnored) return 'ignored';
    await options.flag(entry.id, 'isIgnored', false, options.expectedUserId);
    if (!options.isCurrent()) return 'stale';
    state = options.getState(entry.id, options.expectedUserId);
    if (state?.isIgnored) return 'unavailable';
  }

  if (!state?.isDifficult) {
    await options.flag(entry.id, 'isDifficult', true, options.expectedUserId);
    if (!options.isCurrent()) return 'stale';
  }
  const saved = options.getState(entry.id, options.expectedUserId);
  if (saved?.isIgnored) return 'ignored';
  return saved?.isDifficult ? 'saved' : 'unavailable';
}

let cachedIndex: IndexBook[] = [];
const cachedBooks = new Map<string, VocabularySearchEntry[]>();
let latestRequestGeneration = 0;
const MAX_CONCURRENT_BOOK_REQUESTS = 3;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveOrder(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isSystemBookId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function parseIndex(value: unknown): { books: IndexBook[]; issue: string } {
  if (!isObject(value) || !Array.isArray(value.books)) throw new Error('教材目录格式不正确。');
  const books: IndexBook[] = [];
  const seen = new Set<string>();
  const invalidBookIds = new Set<string>();
  let invalid = 0;

  for (const rawBook of value.books) {
    if (!isObject(rawBook) || !isSystemBookId(rawBook.id)) {
      invalid++;
      continue;
    }
    const id = rawBook.id;
    if (seen.has(id)) {
      invalid++;
      invalidBookIds.add(id);
      continue;
    }
    seen.add(id);

    if (!nonEmptyText(rawBook.title) || !Number.isSafeInteger(rawBook.wordCount)
      || (rawBook.wordCount as number) < 0 || (rawBook.wordCount as number) > 10_000
      || !Array.isArray(rawBook.lessons)) {
      invalid++;
      invalidBookIds.add(id);
      continue;
    }
    const lessons: IndexLesson[] = [];
    let valid = true;
    const seenOrders = new Set<number>();
    for (const rawLesson of rawBook.lessons) {
      if (!isObject(rawLesson) || !nonEmptyText(rawLesson.title) || !isPositiveOrder(rawLesson.order)
        || seenOrders.has(rawLesson.order as number)
        || (rawLesson.wordCount !== undefined && (!Number.isSafeInteger(rawLesson.wordCount)
          || (rawLesson.wordCount as number) < 0 || (rawLesson.wordCount as number) > 10_000))) {
        valid = false;
        break;
      }
      seenOrders.add(rawLesson.order as number);
      lessons.push({
        title: rawLesson.title.trim(),
        order: rawLesson.order as number,
        ...(rawLesson.wordCount === undefined ? {} : { wordCount: rawLesson.wordCount as number }),
      });
    }
    if (!valid) {
      invalid++;
      invalidBookIds.add(id);
      continue;
    }
    books.push({
      id,
      title: rawBook.title.trim(),
      description: typeof rawBook.description === 'string' ? rawBook.description : '',
      wordCount: rawBook.wordCount as number,
      lessons,
    });
  }

  const validBooks = books.filter(book => !invalidBookIds.has(book.id));
  const validIds = new Set(validBooks.map(book => book.id));
  const missingLegacy = LEGACY_TEXTBOOK_IDS.filter(id => !validIds.has(id));
  if (missingLegacy.length) {
    throw new Error(`教材目录无效：原有词书缺少或损坏 ${missingLegacy.length} 册。`);
  }

  const issue = invalid
    ? `教材目录部分无效：已跳过 ${invalid} 条无效记录。`
    : '';
  return { books: validBooks, issue };
}

function parseBook(value: unknown, meta: IndexBook, bookOrder: number): VocabularySearchEntry[] {
  const definition = validateWebTextbookDefinition(value, meta);
  const entries: VocabularySearchEntry[] = [];

  for (const lesson of definition.lessons) {
    lesson.words.forEach((rawWord, index) => {
      const id = webTextbookWordId(meta.id, lesson.order, rawWord, index);
      const entry: VocabularySearchEntry = {
        id,
        lessonId: `${meta.id}-l-${lesson.order}`,
        term: rawWord.term.trim(),
        reading: rawWord.reading.trim(),
        meaning: rawWord.meaning.trim(),
        order: bookOrder + entries.length,
        bookId: meta.id,
        bookTitle: fullBookTitle(meta),
        lessonTitle: lesson.title,
        source: 'textbook',
      };
      if (typeof rawWord.rawTerm === 'string' && rawWord.rawTerm.trim()) entry.rawTerm = rawWord.rawTerm.trim();
      if (typeof rawWord.partOfSpeech === 'string' && rawWord.partOfSpeech.trim()) entry.partOfSpeech = rawWord.partOfSpeech.trim();
      entries.push(entry);
    });
  }

  return entries;
}

function flattenCache(): VocabularySearchEntry[] {
  const order = new Map(cachedIndex.map((book, index) => [book.id, index]));
  return [...cachedBooks.entries()]
    .filter(([bookId]) => order.has(bookId))
    .sort(([left], [right]) => (order.get(left) ?? 0) - (order.get(right) ?? 0))
    .flatMap(([, entries]) => entries);
}

async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  operation: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await operation(items[index], index);
    }
  }));
}

/** Load only the system textbook search catalog. Results stay in memory and never enter app.data. */
export async function loadTextbookSearchCatalog(options: {
  fetcher?: typeof fetch;
  retry?: boolean;
} = {}): Promise<TextbookSearchLoad> {
  const fetcher = options.fetcher ?? fetch;
  const retry = options.retry ?? false;
  const requestGeneration = ++latestRequestGeneration;
  let indexError = '';

  try {
    const response = await fetcher(`/data/books/index.json?v=${SYSTEM_CATALOG_VERSION}`, { cache: retry ? 'reload' : 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = parseIndex(await response.json());
    if (requestGeneration === latestRequestGeneration) {
      cachedIndex = parsed.books;
      indexError = parsed.issue;
    }
  } catch (error) {
    indexError = error instanceof Error ? error.message : '教材目录暂时无法读取。';
  }

  if (!cachedIndex.length) {
    return { entries: flattenCache(), failedBookIds: [], cachedBookIds: [], indexError: indexError || '教材目录暂时无法读取。' };
  }

  const failedBookIds: string[] = [];
  const cachedBookIds: string[] = [];
  const failedByIndex: Array<string | undefined> = [];
  const cachedByIndex: Array<string | undefined> = [];
  const booksForRequest = cachedIndex;
  await forEachWithConcurrency(booksForRequest, MAX_CONCURRENT_BOOK_REQUESTS, async (book, index) => {
    if (cachedBooks.has(book.id) && !retry) return;
    try {
      const response = await fetcher(`/data/books/${encodeURIComponent(book.id)}.json?v=${SYSTEM_CATALOG_VERSION}`, { cache: retry ? 'reload' : 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const entries = parseBook(await response.json(), book, index * 10_000);
      const currentBook = cachedIndex.find(current => current.id === book.id);
      if (requestGeneration === latestRequestGeneration && currentBook
        && JSON.stringify(currentBook) === JSON.stringify(book)) {
        cachedBooks.set(book.id, entries);
      }
    } catch {
      if (cachedBooks.has(book.id)) cachedByIndex[index] = book.id;
      else failedByIndex[index] = book.id;
    }
  });
  failedBookIds.push(...failedByIndex.filter((id): id is string => id !== undefined));
  cachedBookIds.push(...cachedByIndex.filter((id): id is string => id !== undefined));

  return {
    entries: flattenCache(),
    failedBookIds,
    cachedBookIds,
    indexError,
  };
}

export function searchVocabularyEntries(
  entries: readonly VocabularySearchEntry[],
  query: string,
  limit = 40,
): VocabularySearchResult[] {
  const take = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.trunc(limit))) : 30;
  return take ? searchVocabularyCandidates(entries, query).slice(0, take) : [];
}

/** Preserve all matching sources until the page groups equivalent words and limits visible cards. */
export function searchVocabularyCandidates(
  entries: readonly VocabularySearchEntry[],
  query: string,
): VocabularySearchResult[] {
  if (typeof query !== 'string' || query.length > 80) return [];
  const normalized = normalizeVocabularySearchText(query);
  if (!normalized) return [];
  const direct = rankVocabularyMatches(entries, query);
  const exact = direct.filter(entry => [entry.term, entry.rawTerm ?? '', entry.reading, entry.meaning]
    .some(value => normalizeVocabularySearchText(value) === normalized));
  const exactIds = new Set(exact.map(entry => entry.id));
  const matchInflection = createVocabularyInflectionMatcher(entries, query);
  if (!matchInflection) return direct;
  const derived: VocabularySearchResult[] = [];
  const derivedIds = new Set<string>();
  for (const entry of entries) {
    if (exactIds.has(entry.id) || derivedIds.has(entry.id)) continue;
    const inflection = matchInflection(entry);
    if (inflection) {
      derived.push({ ...entry, inflection });
      derivedIds.add(entry.id);
    }
  }
  derived.sort((left, right) => left.order - right.order);
  return [...exact, ...derived, ...direct.filter(entry => !exactIds.has(entry.id) && !derivedIds.has(entry.id))];
}

/** Prefer fetched textbook entries for matching stable IDs; add account-local words not in the catalog. */
export function mergeVocabularyEntries(
  textbookEntries: readonly VocabularySearchEntry[],
  localEntries: readonly VocabularySearchEntry[],
): VocabularySearchEntry[] {
  const byId = new Map<string, VocabularySearchEntry>();
  for (const entry of textbookEntries) byId.set(entry.id, entry);
  for (const entry of localEntries) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return [...byId.values()];
}

/** Test helper; production callers should keep the search-only cache for the page lifetime. */
export function resetTextbookSearchCacheForTests(): void {
  latestRequestGeneration++;
  cachedIndex = [];
  cachedBooks.clear();
}
