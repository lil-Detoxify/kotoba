import { emptyData, type Book, type Data, type Lesson, type ReadingContext, type Word } from '@jp/models';
import { toRaw } from 'vue';
import {
  createPersonalLibrary,
  mergePersonalLibrary,
  type ExistingContentPolicy,
  type PersonalLibrary,
} from '../../web/src/services/personal-library';
import { cleanReadingContext, upsertReadingContext, wordReadingContexts, type ReadingContextDraft } from '../../web/src/services/reading-context';
import { bookIdForWord } from './learning';
import type { ExtensionBook, ExtensionSnapshot, ExtensionWord } from './model';

export type PersonalLibraryMutation =
  | { type: 'create-book'; title: string; description?: string }
  | { type: 'update-book'; bookId: string; title: string; description?: string }
  | { type: 'delete-book'; bookId: string }
  | { type: 'create-lesson'; bookId: string; title: string }
  | { type: 'update-lesson'; lessonId: string; title: string }
  | { type: 'delete-lesson'; lessonId: string }
  | { type: 'save-word'; wordId?: string; lessonId: string; term: string; reading: string; meaning: string; partOfSpeech?: string; example?: string; exampleTranslation?: string }
  | { type: 'delete-word'; wordId: string }
  | { type: 'save-context'; wordId: string; contextId?: string; draft: ReadingContextDraft }
  | { type: 'delete-context'; wordId: string; contextId: string }
  | { type: 'merge-package'; library: PersonalLibrary; policy: ExistingContentPolicy };

const epoch = '1970-01-01T00:00:00.000Z';
const wordTextFields = ['partOfSpeech', 'accent', 'example', 'exampleTranslation', 'audioUrl', 'audioTerm', 'rawTerm', 'note', 'definitionJa', 'definitionZh', 'exampleReading'] as const;

function unwrapVueProxies(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (!value || typeof value !== 'object') return value;
  const raw = toRaw(value);
  if (raw instanceof Date || raw instanceof RegExp || raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) return raw;
  const existing = seen.get(raw);
  if (existing) return existing;
  if (Array.isArray(raw)) {
    const result: unknown[] = [];
    seen.set(raw, result);
    for (const item of raw) result.push(unwrapVueProxies(item, seen));
    return result;
  }
  if (raw instanceof Map) {
    const result = new Map();
    seen.set(raw, result);
    for (const [key, item] of raw) result.set(unwrapVueProxies(key, seen), unwrapVueProxies(item, seen));
    return result;
  }
  if (raw instanceof Set) {
    const result = new Set();
    seen.set(raw, result);
    for (const item of raw) result.add(unwrapVueProxies(item, seen));
    return result;
  }
  const result = Object.create(Object.getPrototypeOf(raw) === null ? null : Object.prototype) as Record<PropertyKey, unknown>;
  seen.set(raw, result);
  for (const key of Reflect.ownKeys(raw)) result[key] = unwrapVueProxies((raw as Record<PropertyKey, unknown>)[key], seen);
  return result;
}

function clone<T>(value: T): T {
  return structuredClone(unwrapVueProxies(value)) as T;
}

function uniqueWords(words: readonly ExtensionWord[]): ExtensionWord[] {
  const result = new Map<string, ExtensionWord>();
  for (const word of words) if (!result.has(word.id)) result.set(word.id, clone(word));
  return [...result.values()];
}

function builtinContextMap(snapshot: ExtensionSnapshot): Map<string, { bookId: string; contexts: ReadingContext[] }> {
  const result = new Map<string, { bookId: string; contexts: ReadingContext[] }>();
  for (const entry of snapshot.learning.builtinContexts ?? []) {
    result.set(entry.wordId, { bookId: entry.bookId, contexts: clone(entry.contexts) });
  }
  return result;
}

/** Catalog entries come first so saved favorites never replace canonical textbook content. */
export function extensionContentWords(snapshot: ExtensionSnapshot, catalog: ExtensionWord[]): ExtensionWord[] {
  const words = uniqueWords([
    ...catalog,
    ...snapshot.learning.words,
    ...snapshot.words.map(saved => saved.word),
  ]);
  const catalogWordIds = new Set(catalog.map(word => word.id));
  const contexts = builtinContextMap(snapshot);
  return words.map(word => {
    if (!catalogWordIds.has(word.id)) return word;
    const saved = contexts.get(word.id);
    if (!saved || saved.bookId !== bookIdForWord(word)) return word;
    return { ...word, readingContexts: clone(saved.contexts) };
  });
}

export function extensionBuiltinBookIds(catalog: ExtensionWord[]): string[] {
  return [...new Set(catalog.filter(word => word.source === 'textbook').map(bookIdForWord))];
}

function bookDate(book: ExtensionBook, field: 'createdAt' | 'updatedAt'): string {
  if (field === 'createdAt') return book.createdAt ?? book.updatedAt ?? epoch;
  return book.updatedAt ?? book.createdAt ?? epoch;
}

function extensionBookToBook(book: ExtensionBook): Book {
  return {
    id: book.id,
    title: book.title,
    description: book.description,
    language: 'ja',
    createdAt: bookDate(book, 'createdAt'),
    updatedAt: bookDate(book, 'updatedAt'),
    ...(book.cover === undefined ? {} : { cover: book.cover }),
  };
}

function toPlainWord(word: ExtensionWord): Word {
  const { source: _source, bookId: _bookId, bookTitle: _bookTitle, lessonTitle: _lessonTitle, ...plain } = clone(word);
  return plain;
}

function mergeUnique<T extends { id: string }>(primary: readonly T[], secondary: readonly T[]): T[] {
  const values = new Map<string, T>();
  for (const item of [...primary, ...secondary]) if (!values.has(item.id)) values.set(item.id, clone(item));
  return [...values.values()];
}

/** Convert extension-owned content to the shared Web Data shape used by import/preview helpers. */
export function personalLibraryData(snapshot: ExtensionSnapshot, catalog: ExtensionWord[]): Data {
  const data = emptyData();
  const words = extensionContentWords(snapshot, catalog);
  const inferredBooks = new Map<string, ExtensionBook>();
  for (const word of words) {
    const id = bookIdForWord(word);
    if (inferredBooks.has(id)) continue;
    inferredBooks.set(id, {
      id,
      title: word.bookTitle || id,
      description: '',
      wordCount: 0,
      source: word.source,
    });
  }
  for (const book of snapshot.learning.books) inferredBooks.set(book.id, clone(book));
  const allBooks = [...inferredBooks.values()];
  const bookIds = new Set(allBooks.map(book => book.id));
  const createdFallback = snapshot.learning.userSettings?.updatedAt ?? epoch;
  data.books = allBooks.map(book => ({
    ...extensionBookToBook(book),
    createdAt: book.createdAt ?? createdFallback,
    updatedAt: book.updatedAt ?? book.createdAt ?? createdFallback,
  }));

  const lessons = new Map<string, Lesson>();
  for (const word of words) {
    const bookId = bookIdForWord(word);
    if (!bookIds.has(bookId)) continue;
    const current = lessons.get(word.lessonId);
    if (!current) lessons.set(word.lessonId, { id: word.lessonId, bookId, title: word.lessonTitle || word.lessonId, order: word.order });
    else if (current.bookId === bookId) current.order = Math.min(current.order, word.order);
  }
  for (const lesson of snapshot.learning.lessons ?? []) lessons.set(lesson.id, clone(lesson));
  data.lessons = [...lessons.values()];
  const bookForLesson = new Map(data.lessons.map(lesson => [lesson.id, lesson.bookId]));
  data.words = words.map(toPlainWord).filter(word => bookForLesson.has(word.lessonId));

  const builtinIds = new Set(extensionBuiltinBookIds(catalog));
  const builtinContexts = builtinContextMap(snapshot);
  for (const word of data.words) {
    const bookId = bookForLesson.get(word.lessonId);
    const contexts = builtinContexts.get(word.id);
    if (bookId && builtinIds.has(bookId) && contexts?.bookId === bookId) word.readingContexts = clone(contexts.contexts);
  }

  const states = new Map(snapshot.learning.states.map(state => [state.wordId, clone(state)]));
  for (const saved of snapshot.words) if (!states.has(saved.word.id)) states.set(saved.word.id, clone(saved.state));
  data.states = [...states.values()];
  data.logs = mergeUnique(snapshot.learning.logs, snapshot.logs);
  if (snapshot.learning.userSettings) {
    data.userSettings = clone(snapshot.learning.userSettings);
    if (data.userSettings.currentBookId) data.currentBookId = data.userSettings.currentBookId;
    data.currentBookIdSource = data.userSettings.currentBookIdSource;
    data.currentBookIdUpdatedAt = data.userSettings.updatedAt;
  }
  data.seeded = true;
  return data;
}

export function exportExtensionPersonalLibrary(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], now: Date | string = new Date()): PersonalLibrary {
  const exportedAt = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(exportedAt.getTime())) throw new Error('导出时间无效。');
  return createPersonalLibrary(personalLibraryData(snapshot, catalog), extensionBuiltinBookIds(catalog), exportedAt);
}

function timestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('修改时间无效。');
  return parsed.toISOString();
}

function requiredText(value: string, label: string, maximum: number): string {
  const clean = value.trim();
  if (!clean) throw new Error(`请填写${label}。`);
  if (clean.length > maximum) throw new Error(`${label}最多 ${maximum} 个字符。`);
  return clean;
}

function optionalText(value: string | undefined, label: string, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  const clean = value.trim();
  if (clean.length > maximum) throw new Error(`${label}最多 ${maximum} 个字符。`);
  return clean || undefined;
}

function nextId(createId: () => string, used: Set<string>, label: string): string {
  const id = createId();
  if (typeof id !== 'string' || !id.trim() || used.has(id)) throw new Error(`${label}编号冲突，请重试。`);
  return id;
}

function contentBook(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], bookId: string): Book {
  const builtin = new Set(extensionBuiltinBookIds(catalog));
  if (builtin.has(bookId)) throw new Error('教材词书不能在个人词库中修改。');
  const book = personalLibraryData(snapshot, catalog).books.find(entry => entry.id === bookId);
  if (!book) throw new Error('找不到这本个人词书，请刷新后重试。');
  const stored = snapshot.learning.books.find(entry => entry.id === bookId);
  if (stored?.source === 'textbook') throw new Error('教材词书不能在个人词库中修改。');
  return book;
}

function contentLesson(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], lessonId: string): Lesson {
  const lesson = personalLibraryData(snapshot, catalog).lessons.find(entry => entry.id === lessonId);
  if (!lesson) throw new Error('找不到这节课，请刷新后重试。');
  contentBook(snapshot, catalog, lesson.bookId);
  return lesson;
}

function personalWord(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], wordId: string): ExtensionWord {
  const word = extensionContentWords(snapshot, catalog).find(entry => entry.id === wordId);
  if (!word || word.source !== 'manual' || extensionBuiltinBookIds(catalog).includes(bookIdForWord(word))) {
    throw new Error('找不到这条个人词条，请刷新后重试。');
  }
  return word;
}

function writeBuiltinContexts(snapshot: ExtensionSnapshot, word: ExtensionWord, contexts: ReadingContext[]): void {
  const entries = snapshot.learning.builtinContexts ?? (snapshot.learning.builtinContexts = []);
  snapshot.learning.builtinContexts = entries.filter(entry => entry.wordId !== word.id);
  if (contexts.length) snapshot.learning.builtinContexts.push({ bookId: bookIdForWord(word), wordId: word.id, contexts: clone(contexts) });
}

function writePersonalContexts(snapshot: ExtensionSnapshot, wordId: string, contexts: ReadingContext[]): void {
  const primary = snapshot.learning.words.find(word => word.id === wordId);
  const saved = snapshot.words.find(entry => entry.word.id === wordId);
  if (primary) primary.readingContexts = clone(contexts);
  if (saved) saved.word.readingContexts = clone(contexts);
  if (!primary && !saved) throw new Error('找不到这条个人词条，请刷新后重试。');
}

function writePersonalWord(snapshot: ExtensionSnapshot, word: ExtensionWord): void {
  const index = snapshot.learning.words.findIndex(entry => entry.id === word.id);
  if (index < 0) snapshot.learning.words.push(clone(word));
  else snapshot.learning.words[index] = clone(word);
  const saved = snapshot.words.find(entry => entry.word.id === word.id);
  if (saved) saved.word = clone(word);
}

/** Keep denormalized display metadata and custom-book counts aligned with content, without touching FSRS state. */
function refreshPersonalMetadata(snapshot: ExtensionSnapshot, catalog: ExtensionWord[]): void {
  const builtinWordIds = new Set(catalog.filter(word => word.source === 'textbook').map(word => word.id));
  const books = new Map(snapshot.learning.books.map(book => [book.id, book]));
  const lessons = new Map((snapshot.learning.lessons ?? []).map(lesson => [lesson.id, lesson]));
  const refreshWord = (word: ExtensionWord) => {
    if (word.source !== 'manual' || builtinWordIds.has(word.id)) return;
    const book = books.get(bookIdForWord(word));
    if (book) word.bookTitle = book.title;
    const lesson = lessons.get(word.lessonId);
    if (lesson) word.lessonTitle = lesson.title;
  };
  for (const word of snapshot.learning.words) refreshWord(word);
  for (const saved of snapshot.words) refreshWord(saved.word);

  const counts = new Map<string, number>();
  for (const word of extensionContentWords(snapshot, catalog)) {
    if (word.source !== 'manual' || builtinWordIds.has(word.id)) continue;
    const bookId = bookIdForWord(word);
    counts.set(bookId, (counts.get(bookId) ?? 0) + 1);
  }
  for (const book of snapshot.learning.books) book.wordCount = counts.get(book.id) ?? 0;
}

function cleanDeletedWordProgress(snapshot: ExtensionSnapshot, wordIds: Set<string>): void {
  if (!wordIds.size) return;
  snapshot.learning.states = snapshot.learning.states.filter(state => !wordIds.has(state.wordId));
  snapshot.learning.logs = snapshot.learning.logs.filter(log => !wordIds.has(log.wordId));
  snapshot.logs = snapshot.logs.filter(log => !wordIds.has(log.wordId));
  snapshot.learning.quizAttempts = snapshot.learning.quizAttempts.filter(attempt => !wordIds.has(attempt.wordId));
  snapshot.words = snapshot.words.filter(saved => !wordIds.has(saved.word.id));
  snapshot.learning.builtinContexts = (snapshot.learning.builtinContexts ?? []).filter(entry => !wordIds.has(entry.wordId));
  snapshot.syncQueue = snapshot.syncQueue.filter(item => {
    const payload = item.payload as { wordId?: unknown } | undefined;
    return typeof payload?.wordId !== 'string' || !wordIds.has(payload.wordId);
  });
  const position = snapshot.learning.userSettings?.lastStudiedPosition;
  if (position && wordIds.has(position.wordId)) delete snapshot.learning.userSettings!.lastStudiedPosition;
}

function reconcileSelection(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], removedBookIds: Set<string>, now: string): void {
  if (removedBookIds.size) snapshot.preferences.selectedBookIds = snapshot.preferences.selectedBookIds.filter(id => !removedBookIds.has(id));
  const settings = snapshot.learning.userSettings;
  if (settings?.currentBookId && removedBookIds.has(settings.currentBookId)) {
    const replacement = snapshot.preferences.selectedBookIds[0];
    if (replacement) settings.currentBookId = replacement;
    else delete settings.currentBookId;
    settings.updatedAt = now;
  }
  const position = settings?.lastStudiedPosition;
  if (position && (removedBookIds.has(position.bookId) || removedBookIds.has(position.lessonId))) delete settings!.lastStudiedPosition;

  const validBooks = new Set([
    ...extensionBuiltinBookIds(catalog),
    ...personalLibraryData(snapshot, catalog).books.map(book => book.id),
  ]);
  snapshot.preferences.selectedBookIds = snapshot.preferences.selectedBookIds.filter(id => validBooks.has(id));
}

function deletePersonalWords(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], predicate: (word: ExtensionWord) => boolean): Set<string> {
  const builtinWords = new Set(catalog.filter(word => word.source === 'textbook').map(word => word.id));
  const deleted = new Set(extensionContentWords(snapshot, catalog)
    .filter(word => word.source === 'manual' && !builtinWords.has(word.id) && predicate(word))
    .map(word => word.id));
  snapshot.learning.words = snapshot.learning.words.filter(word => !deleted.has(word.id));
  cleanDeletedWordProgress(snapshot, deleted);
  return deleted;
}

function applyMerge(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], library: PersonalLibrary, policy: ExistingContentPolicy): void {
  const builtinIds = extensionBuiltinBookIds(catalog);
  const data = personalLibraryData(snapshot, catalog);
  mergePersonalLibrary(data, library, builtinIds, policy);
  const bookById = new Map(data.books.map(book => [book.id, book]));
  const lessonById = new Map(data.lessons.map(lesson => [lesson.id, lesson]));
  const incomingBookIds = new Set(library.books.map(book => book.id));
  const incomingLessonIds = new Set(library.lessons.map(lesson => lesson.id));
  const incomingWordIds = new Set(library.words.map(word => word.id));

  for (const bookId of incomingBookIds) {
    const book = bookById.get(bookId);
    if (!book) continue;
    const count = data.words.filter(word => lessonById.get(word.lessonId)?.bookId === bookId).length;
    const extensionBook: ExtensionBook = {
      id: book.id,
      title: book.title,
      description: book.description,
      wordCount: count,
      source: 'manual',
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      ...(book.cover === undefined ? {} : { cover: book.cover }),
    };
    const index = snapshot.learning.books.findIndex(entry => entry.id === bookId);
    if (index < 0) snapshot.learning.books.push(extensionBook);
    else snapshot.learning.books[index] = extensionBook;
  }

  const lessons = new Map((snapshot.learning.lessons ?? []).map(lesson => [lesson.id, lesson]));
  for (const lessonId of incomingLessonIds) {
    const lesson = lessonById.get(lessonId);
    if (lesson) lessons.set(lessonId, clone(lesson));
  }
  snapshot.learning.lessons = [...lessons.values()];

  const dataWordById = new Map(data.words.map(word => [word.id, word]));
  for (const wordId of incomingWordIds) {
    const plain = dataWordById.get(wordId);
    if (!plain) continue;
    const lesson = lessonById.get(plain.lessonId);
    const book = lesson && bookById.get(lesson.bookId);
    if (!lesson || !book) continue;
    const extensionWord: ExtensionWord = {
      ...clone(plain),
      bookId: book.id,
      bookTitle: book.title,
      lessonTitle: lesson.title,
      source: 'manual',
    };
    writePersonalWord(snapshot, extensionWord);
  }

  const builtinBookSet = new Set(builtinIds);
  const builtinWordIdSet = new Set(catalog.filter(word => builtinBookSet.has(bookIdForWord(word))).map(word => word.id));
  const builtinWordById = new Map(extensionContentWords(snapshot, catalog).filter(word => builtinWordIdSet.has(word.id)).map(word => [word.id, word]));
  const contextByWord = new Map<string, { bookId: string; contexts: ReadingContext[] }>();
  for (const word of data.words) {
    const lesson = lessonById.get(word.lessonId);
    if (!lesson || !builtinBookSet.has(lesson.bookId)) continue;
    const contexts = wordReadingContexts(word);
    if (contexts.length) contextByWord.set(word.id, { bookId: lesson.bookId, contexts });
  }
  for (const entry of library.builtinContexts) {
    const word = builtinWordById.get(entry.wordId);
    if (word && !contextByWord.has(entry.wordId)) {
      const contexts = wordReadingContexts(dataWordById.get(entry.wordId));
      if (contexts.length) contextByWord.set(entry.wordId, { bookId: entry.bookId, contexts });
    }
  }
  snapshot.learning.builtinContexts = [...contextByWord].map(([wordId, entry]) => ({ wordId, ...clone(entry) }));
  refreshPersonalMetadata(snapshot, catalog);
}

export function applyPersonalLibraryMutation(
  snapshot: ExtensionSnapshot,
  catalog: ExtensionWord[],
  action: PersonalLibraryMutation,
  options: { now: string; createId: () => string },
): void {
  const now = timestamp(options.now);
  switch (action.type) {
    case 'create-book': {
      const title = requiredText(action.title, '词书名称', 200);
      const description = optionalText(action.description, '词书简介', 2_000) ?? '';
      const used = new Set(personalLibraryData(snapshot, catalog).books.map(book => book.id));
      const id = nextId(options.createId, used, '词书');
      snapshot.learning.books.push({ id, title, description, wordCount: 0, source: 'manual', createdAt: now, updatedAt: now });
      return;
    }
    case 'update-book': {
      const existing = contentBook(snapshot, catalog, action.bookId);
      const title = requiredText(action.title, '词书名称', 200);
      const description = action.description === undefined ? existing.description : optionalText(action.description, '词书简介', 2_000) ?? '';
      const stored = snapshot.learning.books.find(book => book.id === action.bookId);
      if (stored) Object.assign(stored, { title, description, updatedAt: now });
      else snapshot.learning.books.push({ id: existing.id, title, description, wordCount: 0, source: 'manual', createdAt: existing.createdAt, updatedAt: now, ...(existing.cover === undefined ? {} : { cover: existing.cover }) });
      refreshPersonalMetadata(snapshot, catalog);
      return;
    }
    case 'delete-book': {
      contentBook(snapshot, catalog, action.bookId);
      deletePersonalWords(snapshot, catalog, word => bookIdForWord(word) === action.bookId);
      snapshot.learning.books = snapshot.learning.books.filter(book => book.id !== action.bookId);
      snapshot.learning.lessons = (snapshot.learning.lessons ?? []).filter(lesson => lesson.bookId !== action.bookId);
      refreshPersonalMetadata(snapshot, catalog);
      const settings = snapshot.learning.userSettings;
      if (settings?.lastStudiedPosition?.bookId === action.bookId) delete settings.lastStudiedPosition;
      reconcileSelection(snapshot, catalog, new Set([action.bookId]), now);
      return;
    }
    case 'create-lesson': {
      const book = contentBook(snapshot, catalog, action.bookId);
      const title = requiredText(action.title, '课次名称', 200);
      const data = personalLibraryData(snapshot, catalog);
      const lessons = data.lessons.filter(lesson => lesson.bookId === book.id);
      const used = new Set([...data.lessons.map(lesson => lesson.id), ...data.books.map(entry => entry.id)]);
      const id = nextId(options.createId, used, '课次');
      snapshot.learning.lessons = [...(snapshot.learning.lessons ?? []), { id, bookId: book.id, title, order: lessons.reduce((max, lesson) => Math.max(max, lesson.order), -1) + 1 }];
      return;
    }
    case 'update-lesson': {
      const lesson = contentLesson(snapshot, catalog, action.lessonId);
      const title = requiredText(action.title, '课次名称', 200);
      const updated = { ...lesson, title };
      const current = snapshot.learning.lessons ?? [];
      const index = current.findIndex(entry => entry.id === lesson.id);
      if (index < 0) snapshot.learning.lessons = [...current, updated];
      else snapshot.learning.lessons = current.map(entry => entry.id === lesson.id ? updated : entry);
      refreshPersonalMetadata(snapshot, catalog);
      return;
    }
    case 'delete-lesson': {
      const lesson = contentLesson(snapshot, catalog, action.lessonId);
      const deletedWordIds = deletePersonalWords(snapshot, catalog, word => word.lessonId === lesson.id);
      snapshot.learning.lessons = (snapshot.learning.lessons ?? []).filter(entry => entry.id !== lesson.id);
      refreshPersonalMetadata(snapshot, catalog);
      const position = snapshot.learning.userSettings?.lastStudiedPosition;
      if (position && (position.lessonId === lesson.id || deletedWordIds.has(position.wordId))) delete snapshot.learning.userSettings!.lastStudiedPosition;
      reconcileSelection(snapshot, catalog, new Set(), now);
      return;
    }
    case 'save-word': {
      const lesson = contentLesson(snapshot, catalog, action.lessonId);
      const book = contentBook(snapshot, catalog, lesson.bookId);
      const term = requiredText(action.term, '词形', 200);
      const reading = requiredText(action.reading, '读音', 200);
      const meaning = requiredText(action.meaning, '释义', 2_000);
      const partOfSpeech = optionalText(action.partOfSpeech, '词性', 200);
      const example = optionalText(action.example, '例句', 2_000);
      const exampleTranslation = optionalText(action.exampleTranslation, '例句翻译', 2_000);
      const words = extensionContentWords(snapshot, catalog);
      const previous = action.wordId ? personalWord(snapshot, catalog, action.wordId) : undefined;
      const used = new Set(words.map(word => word.id));
      const id = previous?.id ?? nextId(options.createId, used, '词条');
      const sameLessonWords = words.filter(word => word.lessonId === lesson.id && word.id !== id);
      const order = previous?.lessonId === lesson.id ? previous.order : sameLessonWords.reduce((max, word) => Math.max(max, word.order), -1) + 1;
      const next: ExtensionWord = {
        ...(previous ? clone(previous) : {} as ExtensionWord),
        id,
        lessonId: lesson.id,
        bookId: book.id,
        order,
        term,
        reading,
        meaning,
        bookTitle: book.title,
        lessonTitle: lesson.title,
        source: 'manual',
      };
      for (const field of wordTextFields) {
        if (field === 'partOfSpeech' || field === 'example' || field === 'exampleTranslation') continue;
        if (!previous) delete (next as unknown as Record<string, unknown>)[field];
      }
      for (const [field, value] of [['partOfSpeech', partOfSpeech], ['example', example], ['exampleTranslation', exampleTranslation]] as const) {
        if (value === undefined) delete (next as unknown as Record<string, unknown>)[field];
        else (next as unknown as Record<string, unknown>)[field] = value;
      }
      writePersonalWord(snapshot, next);
      refreshPersonalMetadata(snapshot, catalog);
      return;
    }
    case 'delete-word': {
      const word = personalWord(snapshot, catalog, action.wordId);
      const deleted = new Set([word.id]);
      snapshot.learning.words = snapshot.learning.words.filter(entry => entry.id !== word.id);
      cleanDeletedWordProgress(snapshot, deleted);
      refreshPersonalMetadata(snapshot, catalog);
      reconcileSelection(snapshot, catalog, new Set(), now);
      return;
    }
    case 'save-context': {
      const builtinIds = new Set(extensionBuiltinBookIds(catalog));
      const word = extensionContentWords(snapshot, catalog).find(entry => entry.id === action.wordId);
      if (!word) throw new Error('找不到这条词条，请刷新后重试。');
      const builtin = word.source === 'textbook' && builtinIds.has(bookIdForWord(word));
      if (!builtin) personalWord(snapshot, catalog, word.id);
      const current = builtin
        ? snapshot.learning.builtinContexts?.find(entry => entry.wordId === word.id)?.contexts ?? []
        : wordReadingContexts(snapshot.learning.words.find(entry => entry.id === word.id) ?? snapshot.words.find(entry => entry.word.id === word.id)?.word);
      const saved = upsertReadingContext(current, cleanReadingContext(action.draft), {
        contextId: action.contextId,
        now: new Date(now),
        createId: () => {
          const id = options.createId();
          if (!id || current.some(context => context.id === id)) throw new Error('原句编号冲突，请重试。');
          return id;
        },
      });
      if (builtin) writeBuiltinContexts(snapshot, word, saved.contexts);
      else writePersonalContexts(snapshot, word.id, saved.contexts);
      return;
    }
    case 'delete-context': {
      const builtinIds = new Set(extensionBuiltinBookIds(catalog));
      const word = extensionContentWords(snapshot, catalog).find(entry => entry.id === action.wordId);
      if (!word) throw new Error('找不到这条词条，请刷新后重试。');
      const builtin = word.source === 'textbook' && builtinIds.has(bookIdForWord(word));
      if (!builtin) personalWord(snapshot, catalog, word.id);
      const contexts = builtin
        ? snapshot.learning.builtinContexts?.find(entry => entry.wordId === word.id)?.contexts ?? []
        : wordReadingContexts(snapshot.learning.words.find(entry => entry.id === word.id) ?? snapshot.words.find(entry => entry.word.id === word.id)?.word);
      if (!contexts.some(context => context.id === action.contextId)) throw new Error('这条原句已不在词条中，请刷新后重试。');
      const next = contexts.filter(context => context.id !== action.contextId);
      if (builtin) writeBuiltinContexts(snapshot, word, next);
      else writePersonalContexts(snapshot, word.id, next);
      return;
    }
    case 'merge-package': {
      applyMerge(snapshot, catalog, action.library, action.policy);
    }
  }
}
