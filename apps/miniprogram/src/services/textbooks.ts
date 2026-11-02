import type { Data, StudyMode, Word } from "@jp/models";
import type { MiniProgramRepositoryContract, NetworkAdapter } from "../adapters/types";
import { settingsQueueItem } from "./sync-outbox";
import { defaultRepository, defaultTextbookNetwork } from "../adapters";
import catalog from "./textbooks-catalog.json";
import { correctMiniTextbookWords, knownTextbookCorrectionIds } from "./textbook-corrections-mini";

// Only the lightweight book directory is bundled. Vocabulary stays on the existing CDN.
export const textbookCatalog = catalog.books;
export const textbookVersion = "biaori-v2";
const defaultBook = textbookCatalog[0].id;
const builtin = (id: string) => textbookCatalog.find((book) => book.id === id);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("教材格式不正确");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("教材字段不完整");
  return value;
}

/** Validate the complete book before any local mutation; IDs match Web/Windows. */
export function parseTextbook(payload: unknown, bookId: string): Word[] {
  const expected = builtin(bookId);
  if (!expected) throw new Error("未知教材");
  const source = record(payload);
  if (source.id !== bookId || source.wordCount !== expected.wordCount || !Array.isArray(source.lessons)
      || source.lessons.length !== expected.lessons.length
      || (bookId.startsWith("jlpt-") && source.title !== expected.title)) throw new Error("教材目录与下载内容不一致");
  const seenLessons = new Set<number>();
  const seenSources = new Set<number>();
  const seenSourceIds = new Set<string>();
  const sourceStart = textbookCatalog.slice(0, textbookCatalog.indexOf(expected)).reduce((sum, book) => sum + book.wordCount, 0);
  const words: Word[] = [];
  for (const rawLesson of source.lessons) {
    const lesson = record(rawLesson);
    const definition = expected.lessons.find((entry) => entry.order === lesson.order);
    if (!definition || seenLessons.has(definition.order) || !Array.isArray(lesson.words)
        || lesson.words.length !== definition.wordCount
        || (bookId.startsWith("jlpt-") && lesson.title !== definition.title)) throw new Error("教材课次不完整");
    seenLessons.add(definition.order);
    for (const rawWord of lesson.words) {
      const row = record(rawWord);
      let wordId: string;
      let order: number;
      if (bookId.startsWith("jlpt-")) {
        const sourceId = row.sourceId;
        if (typeof sourceId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(sourceId)
            || row.sourceIndex !== undefined || seenSourceIds.has(sourceId)) throw new Error("教材来源编号重复或无效");
        seenSourceIds.add(sourceId);
        wordId = `${bookId}-w-${sourceId}`;
        order = sourceStart + words.length + 1;
      } else {
        const sourceIndex = row.sourceIndex;
        if (row.sourceId !== undefined || typeof sourceIndex !== "number" || !Number.isSafeInteger(sourceIndex) || sourceIndex < 0
            || sourceIndex < sourceStart || sourceIndex >= sourceStart + expected.wordCount
            || seenSources.has(sourceIndex)) throw new Error("教材词条标识重复或缺失");
        seenSources.add(sourceIndex);
        wordId = `${bookId}-w-${definition.order}-${sourceIndex}`;
        order = sourceIndex + 1;
      }
      const optional = (name: string) => row[name] === undefined ? undefined : text(row[name]);
      words.push({
        id: wordId,
        lessonId: definition.id,
        order,
        term: text(row.term), reading: text(row.reading), meaning: text(row.meaning),
        partOfSpeech: optional("partOfSpeech"), rawTerm: optional("rawTerm"),
        audioTerm: optional("audioTerm"), example: optional("example"),
        exampleTranslation: optional("exampleTranslation"),
      });
    }
  }
  if (words.length !== expected.wordCount) throw new Error("教材词数不完整");
  correctMiniTextbookWords(words);
  return words.sort((a, b) => a.order - b.order);
}

const correctedFields: Array<keyof Pick<Word, "term" | "reading" | "meaning" | "partOfSpeech" | "rawTerm" | "audioTerm">> = [
  "term", "reading", "meaning", "partOfSpeech", "rawTerm", "audioTerm",
];

function hasWordCorrection(before: Word, after: Word): boolean {
  return correctedFields.some(field => before[field] !== after[field]);
}

export function isBookLoaded(data: Data, bookId: string): boolean {
  const expected = builtin(bookId);
  if (!expected) return data.words.some((word) => data.lessons.some((lesson) => lesson.id === word.lessonId && lesson.bookId === bookId));
  return expected.lessons.every((lesson) => data.words.filter((word) => word.lessonId === lesson.id).length === lesson.wordCount);
}

function needsCatalog(data: Data): boolean {
  return !data.currentBookId || (data.currentBookId === "demo-jp" && data.currentBookIdSource !== "user")
    || textbookCatalog.some((book) => !data.books.some((entry) => entry.id === book.id)
      || book.lessons.some((lesson) => !data.lessons.some((entry) => entry.id === lesson.id)));
}

export class TextbookService {
  private pending = new Map<string, Promise<Data>>();
  private selection = 0;
  constructor(private repository: MiniProgramRepositoryContract, private network: NetworkAdapter) {}

  async hydrate(key = this.repository.getActiveKey()): Promise<Data> {
    const existing = await this.repository.read(key);
    if (!needsCatalog(existing)) return this.correctLoadedBook(existing, undefined, key);
    const hydrated = await this.repository.transact((data) => {
      const now = new Date().toISOString();
      for (const book of textbookCatalog) {
        if (!data.books.some((entry) => entry.id === book.id)) {
          data.books.push({ id: book.id, title: book.title, description: book.description,
            language: "ja", createdAt: now, updatedAt: now });
        }
        for (const lesson of book.lessons) {
          if (!data.lessons.some((entry) => entry.id === lesson.id)) {
            data.lessons.push({ id: lesson.id, bookId: book.id, title: lesson.title, order: lesson.order });
          }
        }
      }
      if (!data.currentBookId || (data.currentBookId === "demo-jp" && data.currentBookIdSource !== "user")) {
        data.currentBookId = defaultBook;
        data.currentBookIdSource = "default";
      }
      data.seeded = true;
      data.textbooksVersion = textbookVersion;
    }, key);
    return this.correctLoadedBook(hydrated, undefined, key);
  }

  ensureBookLoaded(bookId: string, key = this.repository.getActiveKey()): Promise<Data> {
    const ticket = `${key}:${bookId}`;
    const pending = this.pending.get(ticket);
    if (pending) return pending;
    const operation = this.loadBook(bookId, key).finally(() => this.pending.delete(ticket));
    this.pending.set(ticket, operation);
    return operation;
  }

  private async loadBook(bookId: string, key: string): Promise<Data> {
    const data = await this.hydrate(key);
    if (!builtin(bookId)) {
      if (!data.books.some((book) => book.id === bookId)) throw new Error("词书不存在");
      return data;
    }
    if (isBookLoaded(data, bookId)) return this.correctLoadedBook(data, bookId, key);
    const payload = await this.network.request<unknown>(`/data/books/${bookId}.json?v=${textbookVersion}`);
    const words = parseTextbook(payload, bookId);
    return this.repository.transact((draft) => {
      const lessonIds = new Set(builtin(bookId)!.lessons.map((lesson) => lesson.id));
      draft.words = [...draft.words.filter((word) => !lessonIds.has(word.lessonId)), ...words];
      // Learning states/logs and selected book are deliberately untouched.
      draft.textbooksWordsVersion = textbookVersion;
    }, key);
  }

  private async correctLoadedBook(data: Data, bookId: string | undefined, key: string): Promise<Data> {
    const lessonIds = bookId ? new Set(builtin(bookId)!.lessons.map(lesson => lesson.id)) : undefined;
    const currentWords = data.words.filter(word => knownTextbookCorrectionIds.has(word.id) && (!lessonIds || lessonIds.has(word.lessonId)));
    if (!currentWords.length) return data;
    const correctedWords = currentWords.map(word => ({ ...word }));
    correctMiniTextbookWords(correctedWords);
    const changes = correctedWords.filter((word, index) => hasWordCorrection(currentWords[index], word));
    if (!changes.length) return data;
    const byId = new Map(changes.map(word => [word.id, word]));
    return this.repository.transact((draft) => {
      for (const word of draft.words) {
        const corrected = byId.get(word.id);
        if (!corrected || corrected.lessonId !== word.lessonId) continue;
        Object.assign(word, {
          term: corrected.term,
          reading: corrected.reading,
          meaning: corrected.meaning,
          partOfSpeech: corrected.partOfSpeech,
          rawTerm: corrected.rawTerm,
          audioTerm: corrected.audioTerm,
        });
      }
    }, key);
  }

  async selectBook(bookId: string): Promise<Data> {
    const request = ++this.selection;
    const key = this.repository.getActiveKey();
    await this.ensureBookLoaded(bookId, key);
    if (request !== this.selection || key !== this.repository.getActiveKey()) throw new Error("选书操作已失效，请重试");
    const change = (data: Data) => {
      data.currentBookId = bookId;
      data.currentBookIdSource = "user";
      data.currentBookIdUpdatedAt = new Date().toISOString();
      data.userSettings = {
        ...(data.userSettings ?? { userId: "local" }),
        currentBookId: bookId,
        currentBookIdSource: "user",
        updatedAt: data.currentBookIdUpdatedAt,
      };
    };
    if (this.repository.transactAndEnqueue) {
      return this.repository.transactAndEnqueue(change, (data) => data.userSettings ? [settingsQueueItem(data.userSettings)] : [], key);
    }
    return this.repository.transact(change, key);
  }

  async prepareStudy(lessonId?: string, mode: StudyMode = "new"): Promise<Data> {
    const key = this.repository.getActiveKey();
    let data = await this.hydrate(key);
    if (lessonId) {
      const lesson = data.lessons.find((entry) => entry.id === lessonId);
      if (!lesson) throw new Error("课次不存在，请返回词书页重新选择");
      return this.ensureBookLoaded(lesson.bookId, key);
    }
    if (mode === "new") return this.ensureBookLoaded(data.currentBookId || defaultBook, key);
    const now = Date.now();
    const bookIds = new Set(data.states.filter((state) => !state.isIgnored && (mode === "difficult"
      ? state.isDifficult : state.nextReviewAt && new Date(state.nextReviewAt).getTime() <= now))
      .map((state) => state.bookId || textbookCatalog.find((book) => state.wordId.startsWith(`${book.id}-w-`))?.id)
      .filter((id): id is string => !!id));
    for (const bookId of bookIds) data = await this.ensureBookLoaded(bookId, key);
    return data;
  }
}

export const defaultTextbooks = new TextbookService(defaultRepository, defaultTextbookNetwork);
