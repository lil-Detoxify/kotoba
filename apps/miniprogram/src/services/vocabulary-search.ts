import { searchVocabulary, type SearchableVocabularyEntry } from "@jp/shared";
import type { Data, Word, WordState } from "@jp/models";
import { defaultTextbookNetwork } from "../adapters";
import type { NetworkAdapter } from "../adapters/types";
import { parseTextbook, textbookCatalog, textbookVersion } from "./textbooks";

type CatalogBook = (typeof textbookCatalog)[number];

export interface VocabularySearchHit extends SearchableVocabularyEntry {
  word: Word;
  bookId: string;
  bookTitle: string;
  lessonId: string;
  lessonTitle: string;
  source: "textbook" | "custom";
  state?: WordState;
}

export interface VocabularySearchProgress {
  total: number;
  completed: number;
  failedBookIds: string[];
}

export interface VocabularySearchResponse {
  results: VocabularySearchHit[];
  status: "ready" | "partial" | "local-only";
  /** True when remote textbook requests were intentionally skipped by the privacy gate. */
  networkSkipped: boolean;
  loadedBookIds: string[];
  failedBookIds: string[];
  totalBooks: number;
}

export interface VocabularySearchOptions {
  catalog?: readonly CatalogBook[];
  network?: NetworkAdapter;
  parse?: (payload: unknown, bookId: string) => Word[];
  version?: string;
  limit?: number;
}

export interface VocabularySearchHitLoader {
  repository: {
    getActiveKey(): string;
    read(key?: string): Promise<Data>;
  };
  textbooks: {
    ensureBookLoaded(bookId: string, key?: string): Promise<Data>;
  };
}

/** Load a selected result without treating local custom books as built-in教材. */
export async function loadVocabularySearchHit(
  hit: VocabularySearchHit,
  expectedKey: string,
  loader: VocabularySearchHitLoader
): Promise<Data> {
  if (loader.repository.getActiveKey() !== expectedKey) throw new Error("账号已切换，请重新搜索");
  const data = hit.source === "textbook"
    ? await loader.textbooks.ensureBookLoaded(hit.bookId, expectedKey)
    : await loader.repository.read(expectedKey);
  if (loader.repository.getActiveKey() !== expectedKey) throw new Error("账号已切换，请重新搜索");
  if (!data.words.some(word => word.id === hit.id)) throw new Error("词条尚未下载，请重新搜索");
  return data;
}

const MAX_QUERY_LENGTH = 80;

function localWordHits(data: Data, catalog: readonly CatalogBook[]): VocabularySearchHit[] {
  const lessons = new Map(data.lessons.map(lesson => [lesson.id, lesson]));
  const books = new Map(data.books.map(book => [book.id, book]));
  const states = new Map(data.states.map(state => [state.wordId, state]));
  const catalogLessons = new Map(catalog.flatMap(book => book.lessons.map(lesson => [lesson.id, { book, lesson }] as const)));
  return data.words.flatMap(word => {
    const lesson = lessons.get(word.lessonId);
    const builtIn = catalogLessons.get(word.lessonId);
    const source = builtIn ? "textbook" as const : "custom" as const;
    const bookId = builtIn?.book.id ?? lesson?.bookId ?? "custom";
    const book = books.get(bookId);
    return [{
      ...word,
      word,
      bookId,
      bookTitle: builtIn?.book.title ?? book?.title ?? "自定义词书",
      lessonId: word.lessonId,
      lessonTitle: builtIn?.lesson.title ?? lesson?.title ?? "自定义词条",
      source,
      state: states.get(word.id)
    }];
  });
}

/** Search full textbook JSON lazily and keep it only in this page-session cache. */
export class VocabularySearchService {
  private readonly catalog: readonly CatalogBook[];
  private readonly network: NetworkAdapter;
  private readonly parse: (payload: unknown, bookId: string) => Word[];
  private readonly version: string;
  private readonly limit: number;
  private readonly cache = new Map<string, Word[]>();
  private readonly pending = new Map<string, Promise<Word[]>>();

  constructor(options: VocabularySearchOptions = {}) {
    this.catalog = options.catalog ?? textbookCatalog;
    this.network = options.network ?? defaultTextbookNetwork;
    this.parse = options.parse ?? parseTextbook;
    this.version = options.version ?? textbookVersion;
    this.limit = options.limit ?? 30;
  }

  getCachedBookIds(): string[] {
    return [...this.cache.keys()];
  }

  private loadBook(book: CatalogBook): Promise<Word[]> {
    const cached = this.cache.get(book.id);
    if (cached) return Promise.resolve(cached);
    const existing = this.pending.get(book.id);
    if (existing) return existing;
    const request = this.network.request<unknown>(`/data/books/${book.id}.json?v=${this.version}`)
      .then(payload => {
        const words = this.parse(payload, book.id);
        this.cache.set(book.id, words);
        return words;
      })
      .finally(() => this.pending.delete(book.id));
    this.pending.set(book.id, request);
    return request;
  }

  async search(
    rawQuery: string,
    data: Data,
    onProgress?: (progress: VocabularySearchProgress) => void,
    networkAllowed = true
  ): Promise<VocabularySearchResponse> {
    if (typeof rawQuery !== "string" || rawQuery.length > MAX_QUERY_LENGTH) {
      throw new RangeError(`查词内容最多 ${MAX_QUERY_LENGTH} 个字符。`);
    }
    const query = rawQuery.trim();
    if (!query) return { results: [], status: "ready", networkSkipped: !networkAllowed, loadedBookIds: this.getCachedBookIds(), failedBookIds: [], totalBooks: this.catalog.length };

    const missed = networkAllowed ? this.catalog.filter(book => !this.cache.has(book.id)) : [];
    const failedBookIds: string[] = [];
    let completed = this.catalog.length - missed.length;
    onProgress?.({ total: this.catalog.length, completed, failedBookIds: [...failedBookIds] });
    await Promise.all(missed.map(async book => {
      try {
        await this.loadBook(book);
      } catch {
        failedBookIds.push(book.id);
      } finally {
        completed++;
        onProgress?.({ total: this.catalog.length, completed, failedBookIds: [...failedBookIds] });
      }
    }));

    const lessonById = new Map(this.catalog.flatMap(book => book.lessons.map(lesson => [lesson.id, { book, lesson }] as const)));
    const states = new Map(data.states.map(state => [state.wordId, state]));
    const textbookHits: VocabularySearchHit[] = [];
    for (const book of this.catalog) {
      for (const word of this.cache.get(book.id) ?? []) {
        const lesson = lessonById.get(word.lessonId)?.lesson;
        textbookHits.push({
          ...word,
          word,
          bookId: book.id,
          bookTitle: book.title,
          lessonId: word.lessonId,
          lessonTitle: lesson?.title ?? word.lessonId,
          source: "textbook",
          state: states.get(word.id)
        });
      }
    }
    // The request cache is preferred, while persisted words remain searchable
    // offline and custom words remain local-only. searchVocabulary de-duplicates
    // IDs in input order so network entries win over their local fallback.
    const localHits = localWordHits(data, this.catalog);
    const results = searchVocabulary([...textbookHits, ...localHits], query, this.limit);
    const loadedBookIds = this.getCachedBookIds();
    const orderedFailures = this.catalog.filter(book => failedBookIds.includes(book.id)).map(book => book.id);
    return {
      results,
      status: orderedFailures.length ? loadedBookIds.length ? "partial" : "local-only" : "ready",
      networkSkipped: !networkAllowed,
      loadedBookIds,
      failedBookIds: orderedFailures,
      totalBooks: this.catalog.length
    };
  }
}

export const defaultVocabularySearch = new VocabularySearchService();
