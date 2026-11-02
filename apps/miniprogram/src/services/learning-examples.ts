import type { Word } from "@jp/models";
import { UniContentNetworkAdapter } from "../adapters/network";
import { UniStorageAdapter } from "../adapters/storage";
import type { NetworkAdapter, StorageAdapter } from "../adapters/types";
import { defaultPrivacyConsent, type PrivacyConsentGate } from "./privacy-consent";
import { MINIPROGRAM_DICTIONARY_BASE_URL } from "./dictionary-comparison";
import catalog from "./textbooks-catalog.json";

export interface LearningExample {
  ja: string;
  reading: string;
  zh: string;
  cloze?: { answer: string; reading: string };
  collocation?: { ja: string; reading: string; zh: string };
  tip?: string;
}

export interface ClozeQuestion {
  before: string;
  after: string;
  answer: string;
  reading: string;
  ja: string;
  zh: string;
  sentenceReading: string;
}

export type LearningExampleWord = Pick<Word, "term" | "reading">
  & Partial<Pick<Word, "example" | "exampleReading" | "exampleTranslation">>;

export const MINI_PROGRAM_LEARNING_EXAMPLES_STORAGE_PREFIX = "kotobud.miniprogram.learning-examples.v1:";

/** Match the Web's Japanese reading normalization for answer comparisons and pair keys. */
export function normalizeExampleAnswer(value: string): string {
  return value.normalize("NFKC")
    .replace(/[ァ-ヶ]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .replace(/\s/gu, "");
}

function exampleKey(term: string, reading: string): string {
  return `${term.normalize("NFKC").trim()}|${normalizeExampleAnswer(reading)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maxLength = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`例句数据字段无效：${field}`);
  }
  return value;
}

function parseLearningExample(raw: unknown): LearningExample {
  if (!isRecord(raw)) throw new Error("例句数据格式不正确");
  const example: LearningExample = {
    ja: requiredText(raw.ja, "ja"),
    reading: requiredText(raw.reading, "reading"),
    zh: requiredText(raw.zh, "zh"),
  };
  if (raw.cloze !== undefined) {
    if (!isRecord(raw.cloze)) throw new Error("例句填空数据格式不正确");
    example.cloze = {
      answer: requiredText(raw.cloze.answer, "cloze.answer", 300),
      reading: requiredText(raw.cloze.reading, "cloze.reading", 300),
    };
  }
  if (raw.collocation !== undefined) {
    if (!isRecord(raw.collocation)) throw new Error("搭配数据格式不正确");
    example.collocation = {
      ja: requiredText(raw.collocation.ja, "collocation.ja"),
      reading: requiredText(raw.collocation.reading, "collocation.reading"),
      zh: requiredText(raw.collocation.zh, "collocation.zh"),
    };
  }
  if (raw.tip !== undefined) example.tip = requiredText(raw.tip, "tip", 1000);
  return example;
}

function parseBookExamples(raw: unknown): Map<string, LearningExample> {
  if (!isRecord(raw)) throw new Error("例句词书数据格式不正确");
  const rows = Object.entries(raw);
  if (rows.length > 5000) throw new Error("例句词书数据不完整");
  const examples = new Map<string, LearningExample>();
  for (const [rawKey, rawExample] of rows) {
    const divider = rawKey.indexOf("|");
    if (divider <= 0 || divider !== rawKey.lastIndexOf("|") || rawKey.length > 300) {
      throw new Error("例句词条编号无效");
    }
    const key = exampleKey(rawKey.slice(0, divider), rawKey.slice(divider + 1));
    if (!key || key.startsWith("|") || key.endsWith("|") || examples.has(key)) {
      throw new Error("例句词条编号重复或无效");
    }
    examples.set(key, parseLearningExample(rawExample));
  }
  return examples;
}

function toStorageRecord(examples: Map<string, LearningExample>): Record<string, LearningExample> {
  const result = Object.create(null) as Record<string, LearningExample>;
  for (const [key, example] of examples) result[key] = example;
  return result;
}

function localWordExample(word: LearningExampleWord): LearningExample | undefined {
  if (typeof word.example !== "string" || !word.example.trim()
    || typeof word.exampleReading !== "string" || !word.exampleReading.trim()
    || typeof word.exampleTranslation !== "string" || !word.exampleTranslation.trim()
    || !normalizeExampleAnswer(word.reading)
    || !normalizeExampleAnswer(word.exampleReading).includes(normalizeExampleAnswer(word.reading))
    || exactTermPosition(word.example, word.term) < 0) return undefined;
  return {
    ja: word.example,
    reading: word.exampleReading,
    zh: word.exampleTranslation,
  };
}

function exactTermPosition(sentence: string, term: string): number {
  return term ? sentence.indexOf(term) : -1;
}

function makeSentenceCloze(
  word: LearningExampleWord,
  override: LearningExample | undefined,
  bookId: string | undefined,
  lookup: (word: LearningExampleWord, bookId?: string) => LearningExample | undefined,
): ClozeQuestion | null {
  // Preserve a learner's own complete example when it contains this exact word and reading.
  if (!override) {
    const local = localWordExample(word);
    const position = local ? exactTermPosition(local.ja, word.term) : -1;
    if (local && position >= 0) {
      return {
        before: local.ja.slice(0, position),
        after: local.ja.slice(position + word.term.length),
        answer: word.term,
        reading: word.reading,
        ja: local.ja,
        zh: local.zh,
        sentenceReading: local.reading,
      };
    }
  }

  const context = override ?? lookup(word, bookId);
  const answer = context?.cloze?.answer;
  if (!context || !answer) return null;
  const position = exactTermPosition(context.ja, answer);
  if (position < 0) return null;
  return {
    before: context.ja.slice(0, position),
    after: context.ja.slice(position + answer.length),
    answer,
    reading: context.cloze!.reading,
    ja: context.ja,
    zh: context.zh,
    sentenceReading: context.reading,
  };
}

/** Compare an answer with the example's written form or its reading. */
export function matchesClozeExample(question: ClozeQuestion, value: string): boolean {
  const answer = normalizeExampleAnswer(value);
  return !!answer && (answer === normalizeExampleAnswer(question.answer)
    || answer === normalizeExampleAnswer(question.reading));
}

export interface MiniProgramLearningExamplesOptions {
  network?: NetworkAdapter;
  privacy?: Pick<PrivacyConsentGate, "isConsented">;
  storage?: Pick<StorageAdapter, "getItem" | "setItem">;
}

interface ExamplesManifestBook {
  id: string;
  sha256?: string;
}

interface ExamplesManifest {
  version: string;
  books: ExamplesManifestBook[];
}

interface CachedExamplesBook {
  sha256?: string;
  examples: Map<string, LearningExample>;
}

const SUPPORTED_BOOK_IDS = new Set(catalog.books.map(book => book.id));
const MAX_MEMORY_BOOKS = 3;

function parseExamplesManifest(value: unknown): ExamplesManifest {
  if (!isRecord(value) || value.version !== "v1" || !Array.isArray(value.books) || value.books.length > 100) {
    throw new Error("例句资料目录格式不正确");
  }
  const seen = new Set<string>();
  const books = value.books.map((row: unknown) => {
    if (!isRecord(row) || typeof row.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(row.id) || seen.has(row.id)) {
      throw new Error("例句资料目录词书无效");
    }
    seen.add(row.id);
    const sha256 = typeof row.sha256 === "string" && /^[a-f0-9]{64}$/i.test(row.sha256) ? row.sha256.toLowerCase() : undefined;
    return { id: row.id, sha256 };
  });
  return { version: value.version, books };
}

function parseCachedExamples(raw: string): CachedExamplesBook {
  const value: unknown = JSON.parse(raw);
  if (isRecord(value) && isRecord(value.examples)) {
    return {
      sha256: typeof value.sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.sha256) ? value.sha256.toLowerCase() : undefined,
      examples: parseBookExamples(value.examples),
    };
  }
  // Existing v1 caches store only the book record; keep them usable offline.
  return { examples: parseBookExamples(value) };
}

/** Loads one verified textbook example record at a time; the corpus stays outside the mini-program bundle. */
export class MiniProgramLearningExamples {
  private readonly network: NetworkAdapter;
  private readonly privacy: Pick<PrivacyConsentGate, "isConsented">;
  private readonly storage: Pick<StorageAdapter, "getItem" | "setItem">;
  private readonly books = new Map<string, Map<string, LearningExample>>();
  private readonly pending = new Map<string, Promise<boolean>>();
  private readonly checkedBooks = new Set<string>();
  private manifestRequest?: Promise<ExamplesManifest>;

  constructor(options: MiniProgramLearningExamplesOptions = {}) {
    this.network = options.network ?? new UniContentNetworkAdapter(MINIPROGRAM_DICTIONARY_BASE_URL);
    this.privacy = options.privacy ?? defaultPrivacyConsent;
    this.storage = options.storage ?? new UniStorageAdapter();
  }

  hasBookLearningExamples(bookId: string): boolean {
    if (!SUPPORTED_BOOK_IDS.has(bookId)) return false;
    return this.books.has(bookId);
  }

  async loadBookLearningExamples(bookId: string): Promise<boolean> {
    if (!SUPPORTED_BOOK_IDS.has(bookId)) return false;
    if (this.books.has(bookId) && this.checkedBooks.has(bookId)) {
      this.touchBook(bookId);
      return true;
    }
    const existing = this.pending.get(bookId);
    if (existing) return existing;
    const request = this.loadBook(bookId).finally(() => {
      if (this.pending.get(bookId) === request) this.pending.delete(bookId);
    });
    this.pending.set(bookId, request);
    return request;
  }

  learningExampleFor(word: LearningExampleWord, bookId?: string): LearningExample | undefined {
    const local = localWordExample(word);
    if (local) return local;
    const key = exampleKey(word.term, word.reading);
    if (bookId !== undefined) return this.getBookExamples(bookId)?.get(key);

    // Without source-book context, only return a match when it is unambiguous.
    let match: LearningExample | undefined;
    for (const examples of this.books.values()) {
      const candidate = examples.get(key);
      if (!candidate) continue;
      if (match) return undefined;
      match = candidate;
    }
    return match;
  }

  createSentenceCloze(word: LearningExampleWord, override?: LearningExample, bookId?: string): ClozeQuestion | null {
    return makeSentenceCloze(word, override, bookId, (candidate, sourceBook) => this.learningExampleFor(candidate, sourceBook));
  }

  private async loadBook(bookId: string): Promise<boolean> {
    const cacheKey = `${MINI_PROGRAM_LEARNING_EXAMPLES_STORAGE_PREFIX}${bookId}`;
    let cached: CachedExamplesBook | undefined;
    try {
      const raw = await this.storage.getItem(cacheKey);
      if (raw) {
        cached = parseCachedExamples(raw);
        this.rememberBook(bookId, cached.examples);
      }
    } catch {
      // A damaged or unavailable cache can be recovered from the verified source after consent.
    }

    if (!await this.privacy.isConsented()) return !!cached;
    try {
      const manifest = await this.loadManifest();
      const manifestBook = manifest.books.find(book => book.id === bookId);
      if (!manifestBook) throw new Error("例句资料目录中找不到这本词书");
      if (cached && manifestBook.sha256 && cached.sha256 === manifestBook.sha256) {
        this.checkedBooks.add(bookId);
        return true;
      }

      const payload = await this.network.request<unknown>(`/data/examples/v1/${bookId}.json`, { timeout: 12000 });
      const examples = parseBookExamples(payload);
      this.rememberBook(bookId, examples);
      this.checkedBooks.add(bookId);
      try {
        await this.storage.setItem(cacheKey, JSON.stringify({
          sha256: manifestBook.sha256,
          examples: toStorageRecord(examples),
        }));
      } catch {
        // Keep the successful in-memory copy available if storage is full or offline.
      }
      return true;
    } catch (error) {
      // A validated old book remains available when the manifest or refreshed file is offline.
      if (cached) return true;
      throw error;
    }
  }

  private loadManifest(): Promise<ExamplesManifest> {
    if (this.manifestRequest) return this.manifestRequest;
    const request = this.network.request<unknown>("/data/examples/v1/manifest.json", { timeout: 12000 })
      .then(parseExamplesManifest)
      .catch(error => {
        if (this.manifestRequest === request) this.manifestRequest = undefined;
        throw error;
      });
    this.manifestRequest = request;
    return request;
  }

  private getBookExamples(bookId: string): Map<string, LearningExample> | undefined {
    if (!SUPPORTED_BOOK_IDS.has(bookId)) return undefined;
    const examples = this.books.get(bookId);
    if (examples) this.touchBook(bookId);
    return examples;
  }

  private rememberBook(bookId: string, examples: Map<string, LearningExample>): void {
    this.books.delete(bookId);
    while (this.books.size >= MAX_MEMORY_BOOKS) {
      const oldest = this.books.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.books.delete(oldest);
    }
    this.books.set(bookId, examples);
  }

  private touchBook(bookId: string): void {
    const examples = this.books.get(bookId);
    if (!examples) return;
    this.books.delete(bookId);
    this.books.set(bookId, examples);
  }
}

export function createMiniProgramLearningExamples(options: MiniProgramLearningExamplesOptions = {}): MiniProgramLearningExamples {
  return new MiniProgramLearningExamples(options);
}

export const miniProgramLearningExamples = createMiniProgramLearningExamples();

export function loadBookLearningExamples(bookId: string): Promise<boolean> {
  return miniProgramLearningExamples.loadBookLearningExamples(bookId);
}

export function hasBookLearningExamples(bookId: string): boolean {
  return miniProgramLearningExamples.hasBookLearningExamples(bookId);
}

export function learningExampleFor(word: LearningExampleWord, bookId?: string): LearningExample | undefined {
  return miniProgramLearningExamples.learningExampleFor(word, bookId);
}

export function createSentenceCloze(word: LearningExampleWord, override?: LearningExample, bookId?: string): ClozeQuestion | null {
  return miniProgramLearningExamples.createSentenceCloze(word, override, bookId);
}
