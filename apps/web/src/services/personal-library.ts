import type { Book, Data, Lesson, ReadingContext, Word, WordSense } from '@jp/models';
import { cleanReadingContext, wordReadingContexts } from './reading-context';

export interface PersonalLibrary {
  kind: 'kotobud-personal-library';
  version: 1;
  exportedAt: string;
  books: Book[];
  lessons: Lesson[];
  words: Word[];
  builtinContexts: Array<{ bookId: string; wordId: string; contexts: ReadingContext[] }>;
}

export type ExistingContentPolicy = 'keep-local' | 'use-package';
export interface PersonalLibrarySummary {
  bookCount: number;
  lessonCount: number;
  wordCount: number;
  contextCount: number;
}
export interface PersonalLibraryPreview {
  newBooks: number;
  newLessons: number;
  newWords: number;
  existingWords: number;
  newContexts: number;
  existingContexts: number;
}
export interface PersonalLibraryMergeResult extends PersonalLibraryPreview { bookIds: string[] }

const wordTextFields = ['partOfSpeech', 'accent', 'example', 'exampleTranslation', 'audioUrl', 'audioTerm', 'rawTerm', 'note', 'definitionJa', 'definitionZh', 'exampleReading'] as const;
const senseTextFields = ['definitionJa', 'partOfSpeech', 'example', 'exampleReading', 'exampleTranslation'] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式不正确。`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`${label}缺少有效文本。`);
  return value;
}
function date(value: unknown, label: string): string {
  const text = string(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label}不是有效日期。`);
  return text;
}
function order(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label}不是有效顺序。`);
  return value;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label}应为列表。`);
  return value;
}
function optionalTexts<T extends string>(source: Record<string, unknown>, keys: readonly T[], label: string): Partial<Record<T, string>> {
  const fields: Partial<Record<T, string>> = {};
  for (const key of keys) if (source[key] !== undefined) fields[key] = string(source[key], `${label}的 ${key}`, true);
  return fields;
}
function contexts(value: unknown, label: string): ReadingContext[] {
  return array(value, label).map((item, index) => {
    const r = record(item, `${label}第 ${index + 1} 条`);
    const draft = cleanReadingContext({
      sentence: string(r.sentence, '原句'),
      ...optionalTexts(r, ['translation', 'sourceTitle', 'sourceUrl', 'matchedText'] as const, '原句'),
    });
    return { ...draft, id: string(r.id, '原句 ID'), createdAt: date(r.createdAt, '原句创建时间'), updatedAt: date(r.updatedAt, '原句修改时间') };
  });
}
function uniqueIds(items: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${label}中出现了重复 ID。`);
    ids.add(item.id);
  }
}

export function validatePersonalLibrary(value: unknown): PersonalLibrary {
  const r = record(value, '词库包');
  if (r.kind !== 'kotobud-personal-library') throw new Error('请选择 KotoBud 导出的个人词库包。');
  if (r.version !== 1) throw new Error('暂不支持此词库包版本，请使用当前版本重新导出。');
  const books = array(r.books, '词书').map((value): Book => {
    const b = record(value, '词书');
    return {
      id: string(b.id, '词书 ID'), title: string(b.title, '词书名称'), description: string(b.description, '词书简介', true),
      language: string(b.language, '词书语言'), createdAt: date(b.createdAt, '词书创建时间'), updatedAt: date(b.updatedAt, '词书修改时间'),
      ...optionalTexts(b, ['cover'] as const, '词书'),
    };
  });
  const lessons = array(r.lessons, '课次').map((value): Lesson => {
    const l = record(value, '课次');
    return { id: string(l.id, '课次 ID'), bookId: string(l.bookId, '课次所属词书'), title: string(l.title, '课次名称'), order: order(l.order, '课次顺序') };
  });
  const words = array(r.words, '词条').map((value): Word => {
    const w = record(value, '词条');
    const word: Word = {
      id: string(w.id, '词条 ID'), lessonId: string(w.lessonId, '词条所属课次'), term: string(w.term, '词形'),
      reading: string(w.reading, '读音', true), meaning: string(w.meaning, '释义', true), order: order(w.order, '词条顺序'),
      ...optionalTexts(w, wordTextFields, '词条'),
    };
    if (w.senses !== undefined) word.senses = array(w.senses, '义项').map((value): WordSense => {
      const sense = record(value, '义项');
      return { meaning: string(sense.meaning, '义项释义', true), ...optionalTexts(sense, senseTextFields, '义项') };
    });
    if (w.readingContexts !== undefined) word.readingContexts = contexts(w.readingContexts, '收藏原句');
    return word;
  });
  const builtinContexts = array(r.builtinContexts, '内置词条原句').map(value => {
    const entry = record(value, '内置词条原句');
    return { bookId: string(entry.bookId, '原句所属词书'), wordId: string(entry.wordId, '原句所属词条'), contexts: contexts(entry.contexts, '收藏原句') };
  });
  uniqueIds(books, '词书'); uniqueIds(lessons, '课次'); uniqueIds(words, '词条');
  uniqueIds(builtinContexts.map(entry => ({ id: entry.wordId })), '内置词条原句');
  const bookIds = new Set(books.map(book => book.id));
  const lessonIds = new Set(lessons.map(lesson => lesson.id));
  for (const lesson of lessons) if (!bookIds.has(lesson.bookId)) throw new Error('课次所属词书不在包内，请重新导出。');
  for (const word of words) {
    if (!lessonIds.has(word.lessonId)) throw new Error('词条所属课次不在包内，请重新导出。');
    uniqueIds(word.readingContexts ?? [], '词条原句');
  }
  for (const entry of builtinContexts) {
    if (bookIds.has(entry.bookId) || words.some(word => word.id === entry.wordId)) throw new Error('词库包的原句关联重复，请重新导出。');
    uniqueIds(entry.contexts, '词条原句');
  }
  return { kind: 'kotobud-personal-library', version: 1, exportedAt: date(r.exportedAt, '导出时间'), books, lessons, words, builtinContexts };
}

/** Ordinary word-list JSON is handled by the existing importer. */
export function parsePersonalLibrary(text: string): PersonalLibrary | null {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/u, '')); }
  catch { throw new Error('JSON 格式错误，请检查括号和引号。'); }
  if (!value || typeof value !== 'object' || (value as { kind?: unknown }).kind !== 'kotobud-personal-library') return null;
  return validatePersonalLibrary(value);
}

function personalContent(data: Data, builtinBookIds: readonly string[]) {
  const builtin = new Set(builtinBookIds);
  const books = data.books.filter(book => !builtin.has(book.id));
  const personalIds = new Set(books.map(book => book.id));
  const lessons = data.lessons.filter(lesson => personalIds.has(lesson.bookId));
  const lessonIds = new Set(lessons.map(lesson => lesson.id));
  const words = data.words.filter(word => lessonIds.has(word.lessonId));
  const lessonBooks = new Map(data.lessons.map(lesson => [lesson.id, lesson.bookId]));
  const builtinContexts = data.words.flatMap(word => {
    const bookId = lessonBooks.get(word.lessonId);
    const saved = wordReadingContexts(word);
    return bookId && builtin.has(bookId) && saved.length ? [{ bookId, wordId: word.id, contexts: saved }] : [];
  });
  return { books, lessons, words, builtinContexts };
}

export function getPersonalLibrarySummary(data: Data, builtinBookIds: readonly string[]): PersonalLibrarySummary {
  return summarizePersonalLibrary(personalContent(data, builtinBookIds));
}
export function summarizePersonalLibrary(library: Pick<PersonalLibrary, 'books' | 'lessons' | 'words' | 'builtinContexts'>): PersonalLibrarySummary {
  return {
    bookCount: library.books.length, lessonCount: library.lessons.length, wordCount: library.words.length,
    contextCount: library.words.reduce((total, word) => total + wordReadingContexts(word).length, 0)
      + library.builtinContexts.reduce((total, entry) => total + entry.contexts.length, 0),
  };
}
export function createPersonalLibrary(data: Data, builtinBookIds: readonly string[], now = new Date()): PersonalLibrary {
  // Validate and copy content only, so account settings and learning records never enter the file.
  return validatePersonalLibrary({ kind: 'kotobud-personal-library', version: 1, exportedAt: now.toISOString(), ...personalContent(data, builtinBookIds) });
}

function inspectMerge(data: Data, library: PersonalLibrary, builtinBookIds: readonly string[], requireLoaded: boolean) {
  const builtin = new Set(builtinBookIds);
  const localBooks = new Map(data.books.map(book => [book.id, book]));
  const localLessons = new Map(data.lessons.map(lesson => [lesson.id, lesson]));
  const localWords = new Map(data.words.map(word => [word.id, word]));
  const preview: PersonalLibraryPreview = { newBooks: 0, newLessons: 0, newWords: 0, existingWords: 0, newContexts: 0, existingContexts: 0 };
  for (const book of library.books) {
    if (builtin.has(book.id)) throw new Error('包内词书与内置词书冲突，请重新导出。');
    if (!localBooks.has(book.id)) preview.newBooks++;
  }
  for (const lesson of library.lessons) {
    const existing = localLessons.get(lesson.id);
    if (existing && existing.bookId !== lesson.bookId) throw new Error('课次 ID 对应了不同词书，本次未合并。');
    if (!existing) preview.newLessons++;
  }
  function countContexts(word: Word | undefined, incoming: ReadingContext[]) {
    const ids = new Set(wordReadingContexts(word).map(context => context.id));
    for (const context of incoming) if (ids.has(context.id)) preview.existingContexts++; else preview.newContexts++;
  }
  for (const word of library.words) {
    const existing = localWords.get(word.id);
    if (existing && existing.lessonId !== word.lessonId) throw new Error('词条 ID 对应了不同课次，本次未合并。');
    if (existing) preview.existingWords++; else preview.newWords++;
    countContexts(existing, word.readingContexts ?? []);
  }
  for (const entry of library.builtinContexts) {
    if (!builtin.has(entry.bookId)) throw new Error('原句所属的内置词书暂不可用，本次未合并。');
    const word = localWords.get(entry.wordId);
    if (word && localLessons.get(word.lessonId)?.bookId !== entry.bookId) throw new Error('原句与内置词条的关联不正确，本次未合并。');
    if (!word && requireLoaded) throw new Error('原句对应的内置词条未找到，请检查词库包后重试。');
    countContexts(word, entry.contexts);
  }
  return { preview, localBooks, localLessons, localWords };
}

export function previewPersonalLibraryMerge(data: Data, library: PersonalLibrary, builtinBookIds: readonly string[]): PersonalLibraryPreview {
  return inspectMerge(data, validatePersonalLibrary(library), builtinBookIds, false).preview;
}

function mergeContexts(local: ReadingContext[], incoming: ReadingContext[], policy: ExistingContentPolicy): ReadingContext[] {
  const result = new Map(local.map(context => [context.id, context]));
  for (const context of incoming) if (!result.has(context.id) || policy === 'use-package') result.set(context.id, structuredClone(context));
  return [...result.values()];
}

/** Merge by stable IDs; all associations are checked before changing any content. */
export function mergePersonalLibrary(data: Data, value: PersonalLibrary, builtinBookIds: readonly string[], policy: ExistingContentPolicy = 'keep-local'): PersonalLibraryMergeResult {
  const library = validatePersonalLibrary(value);
  const { preview, localBooks, localLessons, localWords } = inspectMerge(data, library, builtinBookIds, true);
  for (const book of library.books) {
    const existing = localBooks.get(book.id);
    if (!existing) data.books.push(structuredClone(book));
    else if (policy === 'use-package') Object.assign(existing, book);
  }
  for (const lesson of library.lessons) {
    const existing = localLessons.get(lesson.id);
    if (!existing) data.lessons.push(structuredClone(lesson));
    else if (policy === 'use-package') Object.assign(existing, lesson);
  }
  for (const word of library.words) {
    const existing = localWords.get(word.id);
    if (!existing) data.words.push(structuredClone(word));
    else {
      const saved = mergeContexts(wordReadingContexts(existing), word.readingContexts ?? [], policy);
      if (policy === 'use-package') {
        for (const key of wordTextFields) delete existing[key];
        delete existing.senses;
        Object.assign(existing, structuredClone(word));
      }
      if (saved.length || existing.readingContexts) existing.readingContexts = saved;
    }
  }
  for (const entry of library.builtinContexts) {
    const word = localWords.get(entry.wordId)!;
    word.readingContexts = mergeContexts(wordReadingContexts(word), entry.contexts, policy);
  }
  return { ...preview, bookIds: library.books.map(book => book.id) };
}
