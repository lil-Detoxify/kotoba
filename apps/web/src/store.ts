import {defineStore} from 'pinia';
import {ref,computed} from 'vue';
import {emptyData,type Data,type StudyMode,type Word,type QuizAttempt} from '@jp/models';
import {IndexedDbRepository,deleteBook} from '@jp/storage';
import {createStudyQueue,evaluate,initialState,stateFor,statistics} from '@jp/core';
import {importBook,type ImportRow,type TextbookDefinition,textbookWordId} from '@jp/importers';
import type {Grade} from 'ts-fsrs';
import seed from './seed.json';
import textbookMetaPayload from './textbooks-metadata.json';

export interface TextbookMetaBook {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  lessons: Array<{ id: string; bookId: string; title: string; order: number; wordCount: number }>;
}

export const metaBooks = (textbookMetaPayload as { books: TextbookMetaBook[] }).books;
const repository = new IndexedDbRepository();
const loadingBooks = new Set<string>();

export const useApp = defineStore('app', () => {
  const data = ref<Data>(emptyData());
  const ready = ref(false);
  const error = ref('');
  const busy = ref(false);
  const now = ref(new Date());
  const queue = ref<Word[]>([]);
  const index = ref(0);
  const mode = ref<StudyMode>('new');
  const sessionSize = ref(0);
  const stats = computed(() => statistics(data.value, now.value));

  async function refresh() {
    try {
      data.value = await repository.read();
      now.value = new Date();
    } catch (e) {
      error.value = `无法读取本地数据：${String(e)}`;
    }
  }

  async function mutate(change: (d: Data) => void) {
    if (busy.value) return false;
    busy.value = true;
    error.value = '';
    try {
      data.value = await repository.transact(change);
      now.value = new Date();
      return true;
    } catch (e) {
      error.value = `保存失败，操作未完成：${e instanceof Error ? e.message : String(e)}`;
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function init() {
    await mutate(d => {
      const existing = d.books.length > 0 || d.seeded;
      if (!d.seeded) {
        importBook(d, seed, '日语测试词书', () => crypto.randomUUID(), new Date(), '从初次见面到日常生活，48 个常用词。');
        d.seeded = true;
      }
      if (d.textbooksVersion !== 'biaori-v1') {
        const createTime = new Date().toISOString();
        for (const b of metaBooks) {
          if (!d.books.some(book => book.id === b.id)) {
            d.books.push({
              id: b.id,
              title: b.title,
              description: b.description,
              language: 'ja',
              createdAt: createTime,
              updatedAt: createTime
            });
          }
          for (const l of b.lessons) {
            if (!d.lessons.some(lesson => lesson.id === l.id)) {
              d.lessons.push({
                id: l.id,
                bookId: b.id,
                title: l.title,
                order: l.order
              });
            }
          }
        }
        d.textbooksVersion = 'biaori-v1';
        if (!existing && metaBooks[0]) d.currentBookId = metaBooks[0].id;
      }
    });
    ready.value = true;
  }

  async function ensureBookLoaded(bookId: string): Promise<boolean> {
    if (data.value.words.some(w => w.lessonId.startsWith(`${bookId}-l-`))) {
      return true;
    }
    if (!metaBooks.some(b => b.id === bookId)) {
      return true;
    }
    if (loadingBooks.has(bookId)) return false;
    loadingBooks.add(bookId);
    try {
      const res = await fetch(`/data/books/${bookId}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bookDef = await res.json() as TextbookDefinition;
      await mutate(d => {
        const newWords: Word[] = [];
        for (const lesson of bookDef.lessons) {
          const lessonId = `${bookDef.id}-l-${lesson.order}`;
          for (const [idx, row] of lesson.words.entries()) {
            newWords.push({
              id: textbookWordId(bookDef.id, lesson.order, row.sourceIndex ?? idx),
              lessonId,
              term: row.term,
              reading: row.reading,
              meaning: row.meaning,
              partOfSpeech: row.partOfSpeech,
              order: newWords.length + 1
            });
          }
        }
        const existingWordIds = new Set(d.words.map(w => w.id));
        const toAdd = newWords.filter(w => !existingWordIds.has(w.id));
        d.words.push(...toAdd);
      });
      return true;
    } catch (err) {
      console.error(`Failed to load textbook ${bookId}:`, err);
      return false;
    } finally {
      loadingBooks.delete(bookId);
    }
  }

  async function addBook(rows: ImportRow[], title: string, description = '') {
    let id = '';
    const ok = await mutate(d => {
      id = importBook(d, rows, title, () => crypto.randomUUID(), new Date(), description);
    });
    return ok ? id : undefined;
  }

  async function removeBook(id: string) {
    return mutate(d => deleteBook(d, id));
  }

  async function editBook(id: string, title: string, description: string) {
    return mutate(d => {
      const b = d.books.find(book => book.id === id);
      if (b) {
        b.title = title.trim();
        b.description = description;
        b.updatedAt = new Date().toISOString();
      }
    });
  }

  async function start(studyMode: StudyMode, lessons?: string[], bookId?: string) {
    const targetBookId = bookId || data.value.currentBookId || data.value.books[0]?.id;
    if (targetBookId) {
      await ensureBookLoaded(targetBookId);
    }
    await refresh();
    queue.value = createStudyQueue(data.value, studyMode, lessons);
    index.value = 0;
    mode.value = studyMode;
    sessionSize.value = queue.value.length;
    if (bookId) await mutate(d => { d.currentBookId = bookId });
  }

  async function rate(rating: Grade, responseTime: number, attempt?: QuizAttempt) {
    const word = queue.value[index.value];
    if (!word || busy.value) return;
    const ok = await mutate(d => {
      const previous = stateFor(d, word.id) ?? initialState(word.id);
      if (previous.isIgnored) return;
      const result = evaluate(previous, rating, mode.value, new Date(), crypto.randomUUID(), responseTime);
      d.states = d.states.filter(s => !(s.wordId === word.id && s.userId === 'local'));
      d.states.push(result.state);
      if (attempt) result.log.quiz = { ...attempt, options: [...attempt.options] };
      d.logs.push(result.log);
    });
    if (ok) index.value++;
  }

  async function flag(wordId: string, key: 'isDifficult' | 'isIgnored', value: boolean) {
    return mutate(d => {
      let state = stateFor(d, wordId);
      if (!state) {
        state = initialState(wordId);
        d.states.push(state);
      }
      state[key] = value;
    });
  }

  return {
    data,
    ready,
    error,
    busy,
    now,
    stats,
    queue,
    index,
    mode,
    sessionSize,
    metaBooks,
    init,
    refresh,
    mutate,
    addBook,
    removeBook,
    editBook,
    start,
    rate,
    flag,
    ensureBookLoaded
  };
});
