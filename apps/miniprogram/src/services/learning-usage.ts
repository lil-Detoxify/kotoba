import type { Word } from "@jp/models";
import { normalizeVocabularySearchText } from "@jp/shared";
import type { NetworkAdapter, StorageAdapter } from "../adapters/types";
import { UniContentNetworkAdapter } from "../adapters/network";
import { UniStorageAdapter } from "../adapters/storage";
import { defaultPrivacyConsent, type PrivacyConsentGate } from "./privacy-consent";
import { MINIPROGRAM_DICTIONARY_BASE_URL } from "./dictionary-comparison";
import catalog from "./textbooks-catalog.json";
import usage from "../../../web/src/learning-usage.json";
import foundation from "../../../web/src/learning-usage-foundation.json";
import everyday from "../../../web/src/learning-usage-everyday.json";
import meanings from "../../../web/src/learning-usage-meanings.json";
import { correctedLearningContentFor } from "../../../web/src/services/learning-content-corrections";
import { refinementFor } from "../../../web/src/services/learning-refinement";
import type { LearningUsage, LearningUsageRecord } from "../../../web/src/services/learning-usage";

export type { LearningUsage, LearningUsageRecord };

export const MINI_PROGRAM_LEARNING_USAGE_STORAGE_PREFIX = "kotobud.miniprogram.learning-usage.v1:";

export interface MiniLearningUsageRecord extends LearningUsageRecord {
  meaningKeywords: string[];
  sourceMeanings?: string[];
}

interface UsageManifestBook {
  id: string;
  sha256?: string;
}

interface UsageManifest {
  version: string;
  books: UsageManifestBook[];
}

interface CachedUsageBook {
  sha256?: string;
  records: MiniLearningUsageRecord[];
}

type UsageWord = Pick<Word, "term" | "reading"> & Partial<Pick<Word, "meaning" | "lessonId">>;

export interface MiniProgramLearningUsageOptions {
  network?: NetworkAdapter;
  privacy?: Pick<PrivacyConsentGate, "isConsented">;
  storage?: Pick<StorageAdapter, "getItem" | "setItem">;
}

const supportedBookIds = new Set(catalog.books.map(book => book.id));
const keyFor = (term: string, reading: string) => JSON.stringify([
  term.normalize("NFKC").trim(), normalizeVocabularySearchText(reading),
]);

const legacyMeanings = meanings as Record<string, string[]>;
const staticRecords = [...usage, ...foundation, ...everyday] as LearningUsageRecord[];
const staticByForm = new Map<string, LearningUsageRecord>();
for (const entry of staticRecords) {
  for (const form of entry.forms) staticByForm.set(keyFor(form.term, form.reading), entry);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maxLength = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`用法资料字段无效：${field}`);
  }
  return value;
}

function parsePhrase(value: unknown, field: string): { ja: string; reading: string; zh: string } {
  if (!isRecord(value)) throw new Error(`用法资料格式不正确：${field}`);
  return {
    ja: requiredText(value.ja, `${field}.ja`),
    reading: requiredText(value.reading, `${field}.reading`),
    zh: requiredText(value.zh, `${field}.zh`),
  };
}

function parseUsageRecord(value: unknown): MiniLearningUsageRecord {
  if (!isRecord(value) || !Array.isArray(value.forms) || !Array.isArray(value.meaningKeywords)
      || !Array.isArray(value.sourceMeanings)) throw new Error("用法资料词条格式不正确");
  const forms = value.forms.map((form: unknown) => {
    if (!isRecord(form)) throw new Error("用法资料词形格式不正确");
    return { term: requiredText(form.term, "forms.term", 300), reading: requiredText(form.reading, "forms.reading", 300) };
  });
  if (!forms.length || forms.length > 500) throw new Error("用法资料词形数量无效");
  const record: MiniLearningUsageRecord = {
    id: requiredText(value.id, "id", 200),
    forms,
    meaningKeywords: value.meaningKeywords.map((keyword: unknown) => requiredText(keyword, "meaningKeywords", 300)),
    sourceMeanings: value.sourceMeanings.map((meaning: unknown) => requiredText(meaning, "sourceMeanings", 1000)),
    collocation: parsePhrase(value.collocation, "collocation"),
  };
  if (value.tip !== undefined) record.tip = requiredText(value.tip, "tip", 1000);
  if (value.contrast !== undefined) {
    if (!isRecord(value.contrast)) throw new Error("用法资料易混对照格式不正确");
    record.contrast = {
      term: requiredText(value.contrast.term, "contrast.term", 300),
      reading: requiredText(value.contrast.reading, "contrast.reading", 300),
      collocation: parsePhrase(value.contrast.collocation, "contrast.collocation"),
      note: requiredText(value.contrast.note, "contrast.note", 1000),
    };
  }
  return record;
}

function parseUsageRecords(value: unknown): MiniLearningUsageRecord[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error("用法资料词书格式不正确");
  return value.map(parseUsageRecord);
}

function parseManifest(value: unknown): UsageManifest {
  if (!isRecord(value) || value.version !== "v1" || !Array.isArray(value.books) || value.books.length > 100) {
    throw new Error("用法资料目录格式不正确");
  }
  const seen = new Set<string>();
  const books = value.books.map((row: unknown) => {
    if (!isRecord(row)) throw new Error("用法资料目录词书格式不正确");
    const id = requiredText(row.id, "books.id", 100);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) || seen.has(id)) throw new Error("用法资料目录词书编号无效");
    seen.add(id);
    const sha256 = typeof row.sha256 === "string" && /^[a-f0-9]{64}$/i.test(row.sha256) ? row.sha256.toLowerCase() : undefined;
    return { id, sha256 };
  });
  return { version: value.version, books };
}

function parseCachedBook(value: unknown): CachedUsageBook {
  if (isRecord(value) && Array.isArray(value.records)) {
    return {
      sha256: typeof value.sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.sha256) ? value.sha256.toLowerCase() : undefined,
      records: parseUsageRecords(value.records),
    };
  }
  // Accept a raw v1 array so an older cache can still be used offline.
  return { records: parseUsageRecords(value) };
}

function bookIdForLesson(lessonId?: string): string | undefined {
  if (!lessonId) return undefined;
  const divider = lessonId.lastIndexOf("-l-");
  if (divider <= 0 || !/^\d+$/.test(lessonId.slice(divider + 3))) return undefined;
  const bookId = lessonId.slice(0, divider);
  return supportedBookIds.has(bookId) ? bookId : undefined;
}

export class MiniProgramLearningUsage {
  private readonly network: NetworkAdapter;
  private readonly privacy: Pick<PrivacyConsentGate, "isConsented">;
  private readonly storage: Pick<StorageAdapter, "getItem" | "setItem">;
  private readonly books = new Map<string, MiniLearningUsageRecord[]>();
  private readonly pending = new Map<string, Promise<boolean>>();
  private readonly checkedBooks = new Set<string>();
  private manifestRequest?: Promise<UsageManifest>;

  constructor(options: MiniProgramLearningUsageOptions = {}) {
    this.network = options.network ?? new UniContentNetworkAdapter(MINIPROGRAM_DICTIONARY_BASE_URL);
    this.privacy = options.privacy ?? defaultPrivacyConsent;
    this.storage = options.storage ?? new UniStorageAdapter();
  }

  async loadBookUsage(bookId: string): Promise<boolean> {
    if (!supportedBookIds.has(bookId)) return false;
    if (this.books.has(bookId) && this.checkedBooks.has(bookId)) return true;
    const running = this.pending.get(bookId);
    if (running) return running;
    const request = this.loadBook(bookId).finally(() => {
      if (this.pending.get(bookId) === request) this.pending.delete(bookId);
    });
    this.pending.set(bookId, request);
    return request;
  }

  usageFor(word: UsageWord, bookId?: string): LearningUsage | undefined {
    const resolvedBookId = bookId ?? bookIdForLesson(word.lessonId);
    if (!resolvedBookId) return undefined;
    const meaning = word.meaning ? normalizeVocabularySearchText(word.meaning) : "";
    if (!meaning) return undefined;
    const matching = this.books.get(resolvedBookId)?.filter(record =>
      record.forms.some(form => keyFor(form.term, form.reading) === keyFor(word.term, word.reading))
      && record.sourceMeanings?.some(source => normalizeVocabularySearchText(source) === meaning)
      && record.meaningKeywords.some(keyword => meaning.includes(normalizeVocabularySearchText(keyword))),
    ) ?? [];
    matching.sort((left, right) => {
      const score = (record: MiniLearningUsageRecord) => Math.max(...record.meaningKeywords
        .map(keyword => normalizeVocabularySearchText(keyword))
        .filter(keyword => keyword && meaning.includes(keyword))
        .map(keyword => keyword.length));
      return score(right) - score(left) || left.id.localeCompare(right.id);
    });
    return matching[0];
  }

  private async loadBook(bookId: string): Promise<boolean> {
    const cacheKey = `${MINI_PROGRAM_LEARNING_USAGE_STORAGE_PREFIX}${bookId}`;
    let cached: CachedUsageBook | undefined;
    try {
      const raw = await this.storage.getItem(cacheKey);
      if (raw) {
        cached = parseCachedBook(JSON.parse(raw));
        this.books.set(bookId, cached.records);
      }
    } catch {
      // A damaged cache can be replaced by a valid network response.
    }

    let consented = false;
    try { consented = await this.privacy.isConsented(); } catch { /* remain offline */ }
    if (!consented) {
      if (cached) this.checkedBooks.add(bookId);
      return !!cached;
    }

    try {
      const manifest = await this.loadManifest();
      const manifestBook = manifest.books.find(book => book.id === bookId);
      if (!manifestBook) throw new Error("用法资料目录中找不到这本词书");
      if (cached && manifestBook.sha256 && cached.sha256 === manifestBook.sha256) {
        this.checkedBooks.add(bookId);
        return true;
      }

      const payload = await this.network.request<unknown>(`/data/usage/v1/${bookId}.json`, { timeout: 12000 });
      const records = parseUsageRecords(payload);
      this.books.set(bookId, records);
      this.checkedBooks.add(bookId);
      try {
        await this.storage.setItem(cacheKey, JSON.stringify({ sha256: manifestBook.sha256, records } satisfies CachedUsageBook));
      } catch {
        // Keep the network copy available in memory if local storage is full.
      }
      return true;
    } catch (error) {
      if (cached) return true;
      throw error;
    }
  }

  private loadManifest(): Promise<UsageManifest> {
    if (this.manifestRequest) return this.manifestRequest;
    const request = this.network.request<unknown>("/data/usage/v1/manifest.json", { timeout: 12000 })
      .then(parseManifest)
      .catch(error => {
        if (this.manifestRequest === request) this.manifestRequest = undefined;
        throw error;
      });
    this.manifestRequest = request;
    return request;
  }
}

export function createMiniProgramLearningUsage(options: MiniProgramLearningUsageOptions = {}): MiniProgramLearningUsage {
  return new MiniProgramLearningUsage(options);
}

export const miniProgramLearningUsage = createMiniProgramLearningUsage();

/** Loads only the selected textbook's published notes after its word appears. */
export function loadBookLearningUsage(bookId: string): Promise<boolean> {
  return miniProgramLearningUsage.loadBookUsage(bookId);
}

/** Preserve Web's correction, refinement, authored-note, then static-note priority. */
export function usageFor(word: UsageWord, bookId?: string): LearningUsage | undefined {
  const specific = correctedLearningContentFor(word)?.usage ?? refinementFor(word)?.usage;
  if (specific) return specific;

  const remote = miniProgramLearningUsage.usageFor(word, bookId);
  if (remote) return remote;

  const legacy = staticByForm.get(keyFor(word.term, word.reading));
  if (!legacy || !word.meaning) return legacy;
  const meaning = normalizeVocabularySearchText(word.meaning);
  return legacyMeanings[legacy.id]?.some(keyword => keyword
    && meaning.includes(normalizeVocabularySearchText(keyword))) ? legacy : undefined;
}

export function lessonBookId(lessonId?: string): string | undefined {
  return bookIdForLesson(lessonId);
}
