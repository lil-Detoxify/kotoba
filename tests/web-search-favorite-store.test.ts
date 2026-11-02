import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { stateFor } from '@jp/core';
import type { Word } from '@jp/models';

const harness = vi.hoisted(() => ({ repository: null as any, auth: null as any }));

vi.mock('@jp/storage', () => {
  const clone = <T>(value: T): T => structuredClone(value);
  const repository: any = {
    activeKey: 'data_guest',
    values: new Map<string, any>(),
    enqueueCalls: [] as any[],
    getActiveKey() { return this.activeKey; },
    switchUser(userId: string | null) { this.activeKey = userId ? `data_user_${userId.trim()}` : 'data_guest'; },
    async transact(change: (data: any) => void, key?: string) {
      const targetKey = key ?? this.activeKey;
      const draft = clone(this.values.get(targetKey) ?? { books: [], lessons: [], words: [], states: [], logs: [], seeded: true });
      change(draft);
      this.values.set(targetKey, clone(draft));
      return clone(draft);
    },
    async enqueue(items: any[], expectedActiveKey?: string) {
      this.enqueueCalls.push({ items: clone(items), expectedActiveKey });
      if (expectedActiveKey !== undefined && this.activeKey !== expectedActiveKey) throw new Error('账号已切换');
    },
    async dequeue() {},
    async read(key?: string) { return clone(this.values.get(key ?? this.activeKey) ?? { books: [], lessons: [], words: [], states: [], logs: [], seeded: true }); },
    async getQueue() { return []; },
    async close() {},
    async open() {},
  };
  harness.repository = repository;
  return { IndexedDbRepository: class { constructor() { return repository; } }, deleteBook: vi.fn() };
});

vi.mock('@jp/sync', () => {
  const auth: any = {
    user: null,
    getCurrentUser() { return this.user; },
    async getAccessToken() { return null; },
    async init() {},
    async signOut() { this.user = null; },
    onAuthStateChange() { return () => {}; },
  };
  harness.auth = auth;
  class CloudBaseAuthClient { constructor() { return auth; } }
  class MockAuthClient extends CloudBaseAuthClient {}
  class WorkerSyncClient { constructor() { return {}; } }
  return { CloudBaseAuthClient, MockAuthClient, WorkerSyncClient };
});

import { useApp, TEXTBOOKS_DATA_VERSION } from '../apps/web/src/store';
import { sceneFor } from '../apps/web/src/services/learning-scenes';
import { saveSearchEntryToDifficult, type VocabularySearchEntry } from '../apps/web/src/services/vocabulary-search';

const guestWord: Word = {
  id: 'guest-search-word',
  lessonId: 'custom-book-l-1',
  term: '木漏れ日',
  reading: 'こもれび',
  meaning: '树叶间洒落的阳光',
  order: 1,
};
const searchEntry: VocabularySearchEntry = {
  ...guestWord,
  bookId: 'custom-book',
  bookTitle: '我的词书',
  lessonTitle: '第1课',
  source: 'custom',
};

describe('search favorite against the real guest store flag path', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    harness.auth.user = null;
    harness.repository.activeKey = 'data_guest';
    harness.repository.enqueueCalls = [];
    harness.repository.values.clear();
    harness.repository.values.set('data_guest', {
      books: [{ id: 'custom-book', title: '我的词书' }],
      lessons: [{ id: guestWord.lessonId, bookId: 'custom-book', title: '第1课', order: 1 }],
      words: [guestWord],
      states: [],
      logs: [],
      seeded: true,
    });
  });

  it('adds a guest result through ensureBookLoaded and app.flag without cloud queue writes', async () => {
    const app = useApp();
    app.data.words.push(guestWord);

    const status = await saveSearchEntryToDifficult(searchEntry, {
      expectedUserId: null,
      restoreIgnored: false,
      isCurrent: () => app.currentUser === null,
      ensureBookLoaded: (bookId, expectedUserId) => app.ensureBookLoaded(bookId, false, expectedUserId),
      findWord: wordId => app.data.words.find(word => word.id === wordId),
      getState: (wordId, userId) => stateFor(app.data, wordId, userId ?? 'local'),
      flag: (wordId, key, value, expectedUserId) => app.flag(wordId, key, value, expectedUserId),
    });

    expect(status).toBe('saved');
    expect(app.data.states).toHaveLength(1);
    expect(app.data.states[0]).toMatchObject({ wordId: guestWord.id, userId: 'local', isDifficult: true });
    expect(harness.repository.values.get('data_guest').states[0]).toMatchObject({ wordId: guestWord.id, isDifficult: true });
    expect(harness.repository.enqueueCalls).toEqual([]);
  });

  it('collects a reading sentence and the source word atomically without changing curated content or review logs', async () => {
    const stored = harness.repository.values.get('data_guest');
    stored.words[0].example = '木漏れ日がきれいです。';
    stored.words[0].note = '已有笔记';
    const app = useApp();
    await app.refresh();
    const result = await app.saveReadingContext(guestWord.id, { sentence: '木漏れ日を見ました。', translation: '看到了树叶间洒落的阳光。', matchedText: '木漏れ日' }, { collectToDifficult: true, expectedUserId: null });
    expect(result?.created).toBe(true);
    expect(app.data.words[0]).toMatchObject({ id: guestWord.id, example: '木漏れ日がきれいです。', note: '已有笔记' });
    expect(app.readingContextsForWord(guestWord.id)[0]).toMatchObject({ sentence: '木漏れ日を見ました。', matchedText: '木漏れ日' });
    expect(stateFor(app.data, guestWord.id, 'local')?.isDifficult).toBe(true);
    expect(app.data.logs).toEqual([]);
    expect(harness.repository.values.get('data_guest').words[0].readingContexts).toHaveLength(1);
    expect(harness.repository.enqueueCalls).toEqual([]);
  });

  it('refreshes, edits and removes a personal sentence without changing an existing learning state', async () => {
    const app = useApp();
    await app.refresh();
    const saved = await app.saveReadingContext(guestWord.id, { sentence: '木漏れ日を見ました。' }, { collectToDifficult: true });
    const state = JSON.stringify(app.data.states);
    await app.refresh();
    const before = app.readingContextsForWord(guestWord.id)[0];
    expect(before.id).toBe(saved?.id);
    await app.saveReadingContext(guestWord.id, { sentence: '木漏れ日が好きです。', translation: '喜欢树叶间的阳光。' }, { contextId: saved!.id });
    expect(app.readingContextsForWord(guestWord.id)[0]).toMatchObject({ id: saved!.id, createdAt: before.createdAt, sentence: '木漏れ日が好きです。' });
    expect(JSON.stringify(app.data.states)).toBe(state);
    expect(await app.removeReadingContext(guestWord.id, saved!.id)).toBe(true);
    expect(app.readingContextsForWord(guestWord.id)).toEqual([]);
    expect(JSON.stringify(app.data.states)).toBe(state);
  });

  it('does not partially collect a word when the submitted original sentence is invalid', async () => {
    const app = useApp();
    await app.refresh();
    const before = JSON.stringify(harness.repository.values.get('data_guest'));
    expect(await app.saveReadingContext(guestWord.id, { sentence: '' }, { collectToDifficult: true })).toBeUndefined();
    expect(JSON.stringify(harness.repository.values.get('data_guest'))).toBe(before);
    expect(app.error).toContain('请填写');
  });

  it('keeps reading context views bound to the hydrated account', async () => {
    const app = useApp();
    await app.refresh();
    await app.saveReadingContext(guestWord.id, { sentence: '木漏れ日を見ました。' });
    expect(app.readingContextsForWord(guestWord.id)).toHaveLength(1);
    app.currentUser = { id: 'next-user', email: 'next@example.test' } as any;
    expect(app.readingContextsForWord(guestWord.id)).toEqual([]);
    expect(await app.saveReadingContext(guestWord.id, { sentence: '另一个句子' }, { expectedUserId: null })).toBeUndefined();
    expect(harness.repository.values.get('data_guest').words[0].readingContexts).toHaveLength(1);
  });

  it('starts and restores a scene using original word IDs, skipping ignored words without changing the current book', async () => {
    const scene = sceneFor('shopping')!;
    const stored = harness.repository.values.get('data_guest');
    stored.currentBookId = 'custom-book';
    stored.textbooksWordsVersion = TEXTBOOKS_DATA_VERSION;
    for (const bookId of new Set(scene.items.map(item => item.bookId))) {
      stored.books.push({ id: bookId, title: bookId });
      stored.lessons.push({ id: `${bookId}-l-1`, bookId, title: '第1课', order: 1 });
    }
    scene.items.forEach((item, index) => stored.words.push({ id: `source-word-${index}`, lessonId: `${item.bookId}-l-1`, term: item.term, reading: item.reading, meaning: '原书释义', order: index + 10 }));
    const app = useApp();
    await app.refresh();
    await app.flag('source-word-0', 'isIgnored', true);
    const wordsBefore = JSON.stringify(app.data.words);
    expect(await app.startScenePractice('shopping', 'sentence-cloze')).toBe(true);
    expect(app.queue.map(word => word.id)).toEqual(scene.items.slice(1).map((_, index) => `source-word-${index + 1}`));
    expect(app.studySession?.sceneId).toBe('shopping');
    expect(app.data.currentBookId).toBe('custom-book');
    expect(JSON.stringify(app.data.words)).toBe(wordsBefore);
    expect(app.data.states.some(state => state.isDifficult)).toBe(false);
    await app.rate(3, 20);
    const nextId = app.queue[app.index].id;
    expect(app.data.logs).toHaveLength(1);
    expect(await app.continueLearning()).toBe(true);
    expect(app.studySession?.sceneId).toBe('shopping');
    expect(app.queue[app.index].id).toBe(nextId);
    expect(app.data.logs).toHaveLength(1);
    expect(stateFor(app.data, 'source-word-0', 'local')?.isIgnored).toBe(true);
    expect(await app.startScenePractice('missing')).toBe(false);
  });
});
