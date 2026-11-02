import type { Book, Data, Lesson, Word } from "@jp/models";
import { parseImport } from "../../../../packages/importers/src/index";
import {
  createPersonalLibrary,
  mergePersonalLibrary,
  parsePersonalLibrary,
  previewPersonalLibraryMerge,
  validatePersonalLibrary,
} from "../../../web/src/services/personal-library";
import type {
  ExistingContentPolicy,
  PersonalLibrary,
  PersonalLibraryMergeResult,
  PersonalLibraryPreview,
} from "../../../web/src/services/personal-library";
import { cleanPersonalWord, parsePastedVocabulary, personalWordKey } from "../../../web/src/services/personal-vocabulary";
import type { PersonalWordDraft } from "../../../web/src/services/personal-vocabulary";
import { defaultRepository } from "../adapters";
import type { MiniProgramRepositoryContract } from "../adapters/types";
import { ensureStudyRuntime } from "../adapters/runtime";
import { defaultTextbooks, textbookCatalog } from "./textbooks";
import type { TextbookService } from "./textbooks";

export type {
  ExistingContentPolicy,
  PersonalLibrary,
  PersonalLibraryMergeResult,
  PersonalLibraryPreview,
  PersonalWordDraft,
};

export const MINI_BUILTIN_BOOK_IDS: readonly string[] = Object.freeze([
  ...textbookCatalog.map((book) => book.id),
  "demo-jp",
]);

ensureStudyRuntime();

export interface MiniPersonalLibraryServiceOptions {
  repository: Pick<MiniProgramRepositoryContract, "getActiveKey" | "read" | "transact">;
  textbooks: Pick<TextbookService, "hydrate" | "ensureBookLoaded">;
  builtinBookIds?: readonly string[];
  createId?: (kind: "book" | "lesson" | "word") => string;
  now?: () => Date;
}

export interface MiniPersonalWordImportPreview {
  rows: MiniPersonalWordDraft[];
  errors: Array<{ row: number; message: string }>;
  duplicateCount: number;
}

export type MiniPersonalWordDraft = PersonalWordDraft & Omit<Partial<Word>, "id" | "lessonId" | "order" | "term" | "reading" | "meaning"> & {
  lesson?: string;
};

function makeId(kind: "book" | "lesson" | "word"): string {
  return `personal-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanBookFields(title: string, description: string): { title: string; description: string } {
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (!cleanTitle) throw new Error("请输入词书名称。");
  if (cleanTitle.length > 80) throw new Error("词书名称最多 80 个字符。");
  if (cleanDescription.length > 500) throw new Error("词书简介最多 500 个字符。");
  return { title: cleanTitle, description: cleanDescription };
}

const optionalWordFields = [
  "partOfSpeech", "accent", "example", "exampleTranslation", "audioUrl", "audioTerm", "rawTerm",
  "note", "definitionJa", "definitionZh", "exampleReading",
] as const;

function cleanMiniPersonalWord(draft: MiniPersonalWordDraft): MiniPersonalWordDraft {
  const clean: MiniPersonalWordDraft = {
    ...cleanPersonalWord(draft),
    ...(draft.lesson === undefined ? {} : { lesson: draft.lesson.trim() }),
  };
  for (const key of optionalWordFields) {
    const value = draft[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new Error(`${key} 必须是文本。`);
    clean[key] = value.trim();
  }
  if (draft.senses !== undefined) {
    if (!Array.isArray(draft.senses)) throw new Error("义项格式不正确。");
    clean.senses = structuredClone(draft.senses);
  }
  return clean;
}

export function createMiniPersonalLibraryService(options: MiniPersonalLibraryServiceOptions) {
  const { repository, textbooks } = options;
  const builtinBookIds = options.builtinBookIds ?? MINI_BUILTIN_BOOK_IDS;
  const builtinIds = new Set(builtinBookIds);
  const createId = options.createId ?? makeId;
  const now = options.now ?? (() => new Date());

  function captureKey(key?: string): string {
    return key ?? repository.getActiveKey();
  }

  async function hydrate(key: string): Promise<Data> {
    return textbooks.hydrate(key);
  }

  async function loadForLibrary(library: PersonalLibrary, key: string): Promise<Data> {
    await hydrate(key);
    const bookIds = [...new Set(library.builtinContexts
      .map((entry) => entry.bookId)
      .filter((bookId) => builtinIds.has(bookId)))];
    for (const bookId of bookIds) await textbooks.ensureBookLoaded(bookId, key);
    return repository.read(key);
  }

  function editableBook(data: Data, bookId: string): Book {
    if (builtinIds.has(bookId)) throw new Error("内置词书不能修改，请在自建词书中编辑。");
    const book = data.books.find((item) => item.id === bookId);
    if (!book) throw new Error("这本词书已不存在，请返回词书列表后重试。");
    return book;
  }

  function lessonFor(data: Data, lessonId: string, bookId?: string): Lesson {
    const lesson = data.lessons.find((item) => item.id === lessonId && (!bookId || item.bookId === bookId));
    if (!lesson) throw new Error("这个课次已不存在，请重新选择。");
    return lesson;
  }

  function newLesson(data: Data, bookId: string, title: string): Lesson {
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 80) throw new Error("课次名称不能为空，且最多 80 个字符。");
    if (data.lessons.some((lesson) => lesson.bookId === bookId && lesson.title === cleanTitle)) {
      throw new Error("这本词书已有同名课次。");
    }
    const lessons = data.lessons.filter((lesson) => lesson.bookId === bookId);
    const id = createId("lesson");
    if (data.lessons.some((lesson) => lesson.id === id) || data.books.some((book) => book.id === id)
        || data.words.some((word) => word.id === id)) throw new Error("课次 ID 重复，请重试。");
    const lesson: Lesson = {
      id, bookId, title: cleanTitle,
      order: lessons.reduce((max, item) => Math.max(max, item.order), 0) + 1,
    };
    data.lessons.push(lesson);
    return lesson;
  }

  async function exportMiniPersonalLibrary(key?: string): Promise<PersonalLibrary> {
    const owner = captureKey(key);
    const data = await hydrate(owner);
    return createPersonalLibrary(data, builtinBookIds, now());
  }

  async function previewMiniPersonalLibrary(value: PersonalLibrary, key?: string): Promise<PersonalLibraryPreview> {
    const owner = captureKey(key);
    const library = validatePersonalLibrary(value);
    const data = await loadForLibrary(library, owner);
    return previewPersonalLibraryMerge(data, library, builtinBookIds);
  }

  async function mergeMiniPersonalLibrary(
    value: PersonalLibrary,
    policy: ExistingContentPolicy = "keep-local",
    key?: string,
  ): Promise<PersonalLibraryMergeResult> {
    const owner = captureKey(key);
    const library = validatePersonalLibrary(value);
    await loadForLibrary(library, owner);
    let result: PersonalLibraryMergeResult | undefined;
    await repository.transact((data) => {
      result = mergePersonalLibrary(data, library, builtinBookIds, policy);
    }, owner);
    if (!result) throw new Error("词库包尚未合并，请重试。");
    return result;
  }

  async function listMiniPersonalLibrary(key?: string): Promise<Data> {
    const owner = captureKey(key);
    return hydrate(owner);
  }

  async function createMiniPersonalBook(title: string, description = "", key?: string): Promise<{ bookId: string; lessonId: string }> {
    const owner = captureKey(key);
    const fields = cleanBookFields(title, description);
    let created: { bookId: string; lessonId: string } | undefined;
    await repository.transact((data) => {
      const stamp = now().toISOString();
      const bookId = createId("book");
      if (data.books.some((book) => book.id === bookId)) throw new Error("词书 ID 重复，请重试。");
      const book: Book = { id: bookId, ...fields, language: "ja", createdAt: stamp, updatedAt: stamp };
      data.books.push(book);
      const lesson = newLesson(data, bookId, "默认分组");
      created = { bookId, lessonId: lesson.id };
    }, owner);
    if (!created) throw new Error("词书尚未创建，请重试。");
    return created;
  }

  async function updateMiniPersonalBook(bookId: string, title: string, description = "", key?: string): Promise<void> {
    const owner = captureKey(key);
    const fields = cleanBookFields(title, description);
    await repository.transact((data) => {
      const book = editableBook(data, bookId);
      book.title = fields.title;
      book.description = fields.description;
      book.updatedAt = now().toISOString();
    }, owner);
  }

  async function deleteMiniPersonalBook(bookId: string, confirmed = false, key?: string): Promise<{ wordCount: number; learningRecordCount: number }> {
    const owner = captureKey(key);
    if (!confirmed) throw new Error("删除词书需要再次确认；相关词条、学习记录和复习记录都会移除。");
    let result: { wordCount: number; learningRecordCount: number } | undefined;
    await repository.transact((data) => {
      editableBook(data, bookId);
      const lessonIds = new Set(data.lessons.filter((lesson) => lesson.bookId === bookId).map((lesson) => lesson.id));
      const wordIds = new Set(data.words.filter((word) => lessonIds.has(word.lessonId)).map((word) => word.id));
      const learningRecordCount = data.states.filter((state) => wordIds.has(state.wordId)).length
        + data.logs.filter((log) => wordIds.has(log.wordId)).length;
      data.books = data.books.filter((book) => book.id !== bookId);
      data.lessons = data.lessons.filter((lesson) => lesson.bookId !== bookId);
      data.words = data.words.filter((word) => !wordIds.has(word.id));
      data.states = data.states.filter((state) => !wordIds.has(state.wordId));
      data.logs = data.logs.filter((log) => !wordIds.has(log.wordId));
      if (data.currentBookId === bookId) {
        delete data.currentBookId;
        delete data.currentBookIdSource;
        delete data.currentBookIdUpdatedAt;
        if (data.userSettings?.currentBookId === bookId) {
          delete data.userSettings.currentBookId;
          delete data.userSettings.currentBookIdSource;
          data.userSettings.updatedAt = now().toISOString();
        }
      }
      result = { wordCount: wordIds.size, learningRecordCount };
    }, owner);
    if (!result) throw new Error("词书尚未删除，请重试。");
    return result;
  }

  async function createMiniPersonalLesson(bookId: string, title: string, key?: string): Promise<Lesson> {
    const owner = captureKey(key);
    let result: Lesson | undefined;
    await repository.transact((data) => {
      const book = editableBook(data, bookId);
      result = newLesson(data, bookId, title);
      book.updatedAt = now().toISOString();
    }, owner);
    if (!result) throw new Error("课次尚未创建，请重试。");
    return result;
  }

  async function addMiniPersonalWords(
    bookId: string,
    drafts: MiniPersonalWordDraft[],
    target: { lessonId?: string; lessonTitle?: string } = {},
    key?: string,
  ): Promise<{ added: number; skipped: number; lessonId: string; lessonIds: string[] }> {
    const owner = captureKey(key);
    let result: { added: number; skipped: number; lessonId: string; lessonIds: string[] } | undefined;
    await repository.transact((data) => {
      const book = editableBook(data, bookId);
      if (!drafts.length) throw new Error("先填写一个词条，或粘贴词汇表。");
      const clean = drafts.map(cleanMiniPersonalWord);
      const lessons = data.lessons.filter((lesson) => lesson.bookId === bookId).sort((a, b) => a.order - b.order);
      const chosenLesson = target.lessonId ? lessons.find((item) => item.id === target.lessonId) : undefined;
      if (target.lessonId && !chosenLesson) throw new Error("这个课次已不存在，请重新选择。");
      let defaultLesson = chosenLesson ?? (target.lessonTitle
        ? lessons.find((item) => item.title === target.lessonTitle!.trim())
        : lessons[0]);
      if (!defaultLesson && target.lessonTitle?.trim()) defaultLesson = newLesson(data, bookId, target.lessonTitle);
      if (!defaultLesson && !target.lessonId) defaultLesson = lessons[0] ?? newLesson(data, bookId, "默认分组");
      if (!defaultLesson) throw new Error("请选择课次，或填写新课次名称。");
      const lessonsByTitle = new Map(lessons.map((item) => [item.title, item]));
      lessonsByTitle.set(defaultLesson.title, defaultLesson);
      let order = data.words.reduce((max, word) => Math.max(max, word.order), 0);
      let added = 0;
      let skipped = 0;
      const lessonIds = new Set<string>();
      for (const draft of clean) {
        const desiredTitle = target.lessonId || target.lessonTitle?.trim()
          ? defaultLesson.title
          : draft.lesson?.trim() || defaultLesson.title;
        let lesson = lessonsByTitle.get(desiredTitle);
        if (!lesson) {
          lesson = newLesson(data, bookId, desiredTitle);
          lessonsByTitle.set(desiredTitle, lesson);
        }
        lessonIds.add(lesson.id);
        const existing = new Set(data.words.filter((word) => word.lessonId === lesson!.id)
          .map((word) => personalWordKey(word.term, word.reading)));
        const key = personalWordKey(draft.term, draft.reading);
        if (existing.has(key)) { skipped++; continue; }
        const { lesson: _lesson, ...wordFields } = draft;
        const id = createId("word");
        if (data.words.some((word) => word.id === id) || data.books.some((book) => book.id === id)
            || data.lessons.some((item) => item.id === id)) throw new Error("词条 ID 重复，请重试。");
        data.words.push({ id, lessonId: lesson.id, order: ++order, ...wordFields });
        added++;
      }
      book.updatedAt = now().toISOString();
      const importedLessons = [...lessonIds];
      result = { added, skipped, lessonId: importedLessons[importedLessons.length - 1] ?? defaultLesson.id, lessonIds: importedLessons };
    }, owner);
    if (!result) throw new Error("词条尚未添加，请重试。");
    return result;
  }

  async function updateMiniPersonalWord(wordId: string, draft: MiniPersonalWordDraft, key?: string): Promise<void> {
    const owner = captureKey(key);
    const clean = cleanMiniPersonalWord(draft);
    await repository.transact((data) => {
      const word = data.words.find((item) => item.id === wordId);
      if (!word) throw new Error("这个词条已不存在，请刷新后重试。");
      const lesson = lessonFor(data, word.lessonId);
      const book = editableBook(data, lesson.bookId);
      if (data.words.some((item) => item.id !== wordId && item.lessonId === lesson.id
        && personalWordKey(item.term, item.reading) === personalWordKey(clean.term, clean.reading))) {
        throw new Error("本课已有相同词形和读音，请修改已有词条。");
      }
      if (word.term !== clean.term || word.reading !== clean.reading) {
        delete word.rawTerm;
        delete word.audioTerm;
      }
      const { lesson: _lesson, ...wordFields } = clean;
      Object.assign(word, wordFields);
      if (word.senses?.length) word.senses[0] = { ...word.senses[0], meaning: clean.meaning };
      book.updatedAt = now().toISOString();
    }, owner);
  }

  async function deleteMiniPersonalWord(wordId: string, confirmed = false, key?: string): Promise<{ learningRecordCount: number }> {
    const owner = captureKey(key);
    if (!confirmed) throw new Error("删除词条需要再次确认；相关学习记录和复习记录都会移除。");
    let learningRecordCount = 0;
    await repository.transact((data) => {
      const current = data.words.find((item) => item.id === wordId);
      if (!current) throw new Error("这个词条已不存在，请刷新后重试。");
      const currentLesson = lessonFor(data, current.lessonId);
      const book = editableBook(data, currentLesson.bookId);
      learningRecordCount = data.states.filter((state) => state.wordId === wordId).length
        + data.logs.filter((log) => log.wordId === wordId).length;
      data.words = data.words.filter((item) => item.id !== wordId);
      data.states = data.states.filter((state) => state.wordId !== wordId);
      data.logs = data.logs.filter((log) => log.wordId !== wordId);
      book.updatedAt = now().toISOString();
    }, owner);
    return { learningRecordCount };
  }

  function previewMiniWordImport(text: string, defaultLessonTitle: string): MiniPersonalWordImportPreview {
    const normalized = text.replace(/^\uFEFF/u, "");
    if (!normalized.trim()) return { rows: [], errors: [], duplicateCount: 0 };
    const json = /^\s*[\[{]/u.test(normalized);
    const rows: MiniPersonalWordDraft[] = [];
    const errors: Array<{ row: number; message: string }> = [];
    let duplicateCount = 0;
    if (json) {
      try {
        const library = parsePersonalLibrary(normalized);
        if (library) throw new Error("这是个人词库备份包，请在“词库包”区域预览合并。");
        const parsedValue: unknown = JSON.parse(normalized);
        const rawRows = Array.isArray(parsedValue)
          ? parsedValue
          : parsedValue && typeof parsedValue === "object" && Array.isArray((parsedValue as { words?: unknown }).words)
            ? (parsedValue as { words: unknown[] }).words
            : null;
        if (!rawRows?.length) throw new Error("JSON 中没有词条列表。");
        if (rawRows.length > 10000) throw new Error("每次最多导入 10000 个词。");
        const seen = new Map<string, { row: number; meaning: string }>();
        rawRows.forEach((rawRow, index) => {
          try {
            if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) throw new Error(`第 ${index + 1} 行不是对象。`);
            const source = rawRow as Record<string, unknown>;
            const lessonTitle = typeof source.lesson === "string" && source.lesson.trim()
              ? source.lesson.trim() : (defaultLessonTitle.trim() || "默认分组");
            const imported = parseImport(JSON.stringify([{ ...source, lesson: lessonTitle }]), "json")[0];
            const draft: MiniPersonalWordDraft = cleanMiniPersonalWord({ ...imported, lesson: lessonTitle });
            const unique = `${lessonTitle}\0${personalWordKey(draft.term, draft.reading)}`;
            const previous = seen.get(unique);
            if (previous) {
              if (previous.meaning === draft.meaning) duplicateCount++;
              else errors.push({ row: index + 1, message: `与第${previous.row}行词形和读音相同，但中文释义不同。` });
              return;
            }
            seen.set(unique, { row: index + 1, meaning: draft.meaning });
            rows.push(draft);
          } catch (error) {
            errors.push({ row: index + 1, message: error instanceof Error ? error.message : "词条格式不正确。" });
          }
        });
      } catch (error) {
        errors.push({ row: 1, message: error instanceof Error ? error.message : "JSON 格式错误。" });
      }
    } else if (/(?:^|[,\t])\s*lesson\s*(?:[,\t]|$)/iu.test(normalized.split(/\r?\n/u, 1)[0] ?? "")) {
      try {
        const imported = parseImport(normalized, "csv");
        const seen = new Map<string, { row: number; meaning: string }>();
        imported.forEach((item, index) => {
          const draft = cleanMiniPersonalWord(item);
          const lessonTitle = item.lesson.trim() || defaultLessonTitle.trim() || "默认分组";
          draft.lesson = lessonTitle;
          const unique = `${lessonTitle}\0${personalWordKey(draft.term, draft.reading)}`;
          const previous = seen.get(unique);
          if (previous) {
            if (previous.meaning === draft.meaning) duplicateCount++;
            else errors.push({ row: index + 2, message: `与第${previous.row}行词形和读音相同，但中文释义不同。` });
            return;
          }
          seen.set(unique, { row: index + 2, meaning: draft.meaning });
          rows.push(draft);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "CSV 格式错误。";
        const line = message.match(/第\s*(\d+)\s*行/u)?.[1];
        errors.push({ row: line ? Number(line) : 1, message });
      }
    } else {
      const parsed = parsePastedVocabulary(normalized);
      rows.push(...parsed.words.map((word) => ({ ...word, lesson: defaultLessonTitle.trim() || "默认分组" })));
      errors.push(...parsed.errors);
      duplicateCount = parsed.duplicateCount;
    }
    return { rows, errors, duplicateCount };
  }

  return {
    exportMiniPersonalLibrary,
    previewMiniPersonalLibrary,
    mergeMiniPersonalLibrary,
    listMiniPersonalLibrary,
    createMiniPersonalBook,
    updateMiniPersonalBook,
    deleteMiniPersonalBook,
    createMiniPersonalLesson,
    addMiniPersonalWords,
    updateMiniPersonalWord,
    deleteMiniPersonalWord,
    previewMiniWordImport,
  };
}

const miniPersonalLibrary = createMiniPersonalLibraryService({ repository: defaultRepository, textbooks: defaultTextbooks });

export const exportMiniPersonalLibrary = miniPersonalLibrary.exportMiniPersonalLibrary;
export const previewMiniPersonalLibrary = miniPersonalLibrary.previewMiniPersonalLibrary;
export const mergeMiniPersonalLibrary = miniPersonalLibrary.mergeMiniPersonalLibrary;
export const listMiniPersonalLibrary = miniPersonalLibrary.listMiniPersonalLibrary;
export const createMiniPersonalBook = miniPersonalLibrary.createMiniPersonalBook;
export const updateMiniPersonalBook = miniPersonalLibrary.updateMiniPersonalBook;
export const deleteMiniPersonalBook = miniPersonalLibrary.deleteMiniPersonalBook;
export const createMiniPersonalLesson = miniPersonalLibrary.createMiniPersonalLesson;
export const addMiniPersonalWords = miniPersonalLibrary.addMiniPersonalWords;
export const updateMiniPersonalWord = miniPersonalLibrary.updateMiniPersonalWord;
export const deleteMiniPersonalWord = miniPersonalLibrary.deleteMiniPersonalWord;
export const previewMiniWordImport = miniPersonalLibrary.previewMiniWordImport;
export function parseMiniPersonalLibrary(text: string): PersonalLibrary | null {
  return parsePersonalLibrary(text);
}
