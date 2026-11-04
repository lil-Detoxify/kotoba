import {
  GRAMMAR_BOOK_ID, LOWER_GRAMMAR_BOOK_ID,
  loadGrammarProgress as loadProgress, saveGrammarProgress as saveProgress,
  type GrammarLesson, type GrammarProgress, type GrammarStorage,
} from '@jp/shared/grammar';

export * from '@jp/shared/grammar';

const browserStorage: GrammarStorage = {
  getItem: key => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
};

export function loadGrammarProgress(lesson: GrammarLesson, account: string, storage = browserStorage): GrammarProgress {
  return loadProgress(lesson, account, storage);
}

export function saveGrammarProgress(lesson: GrammarLesson, account: string, progress: GrammarProgress, storage = browserStorage): boolean {
  return saveProgress(lesson, account, progress, storage);
}

export const grammarLessons = Object.values(import.meta.glob<GrammarLesson>(
  '../grammar/biaori-beginner-upper-*.json', { eager: true, import: 'default' },
)).sort((a, b) => a.order - b.order);
export const lowerGrammarLessons = Object.values(import.meta.glob<GrammarLesson>(
  '../grammar/biaori-beginner-lower-*.json', { eager: true, import: 'default' },
)).map(lesson => ({ ...lesson, bookId: LOWER_GRAMMAR_BOOK_ID } as const)).sort((a, b) => a.order - b.order);

const grammarBooks = {
  [GRAMMAR_BOOK_ID]: { id: GRAMMAR_BOOK_ID, label: '初级上', lessons: grammarLessons },
  [LOWER_GRAMMAR_BOOK_ID]: { id: LOWER_GRAMMAR_BOOK_ID, label: '初级下', lessons: lowerGrammarLessons },
};

export function getGrammarBook(id: unknown) {
  if (id === GRAMMAR_BOOK_ID || id === LOWER_GRAMMAR_BOOK_ID) {
    const book = grammarBooks[id];
    if (book.lessons.length) return book;
  }
}
