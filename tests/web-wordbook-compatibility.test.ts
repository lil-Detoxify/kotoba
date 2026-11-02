import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { toRaw } from 'vue';
import { stateFor } from '@jp/core';
import { emptyData, type Data, type ReviewLog, type Word, type WordState } from '@jp/models';
import legacyPayload from '../apps/web/src/textbooks.json';
import corrections from '../apps/web/src/textbook-corrections.json';
import jlptPayload from '../data/wordbooks/jlpt-textbooks.json';
import {
  LEGACY_TEXTBOOK_IDS,
  webTextbookWordId,
} from '../apps/web/src/services/textbook-catalog';

const repositoryHarness = vi.hoisted(() => ({ repository: null as any, auth: null as any, sync: null as any }));

vi.mock('@jp/storage', () => {
  const clone = <T>(value: T): T => structuredClone(value);
  const freshData = (): Data => ({ books: [], lessons: [], words: [], states: [], logs: [], seeded: true });
  const repository: any = {
    activeKey: 'data_guest',
    values: new Map<string, Data>(),
    transactCalls: [] as Array<{ key: string }>,
    enqueueCalls: [] as any[],
    getActiveKey() { return this.activeKey; },
    switchUser(userId: string | null) { this.activeKey = userId ? `data_user_${userId.trim()}` : 'data_guest'; },
    async read(key?: string) { return clone(this.values.get(key ?? this.activeKey) ?? freshData()); },
    async transact(change: (data: Data) => void, key?: string) {
      const target = key ?? this.activeKey;
      this.transactCalls.push({ key: target });
      const draft = clone(this.values.get(target) ?? freshData());
      change(draft);
      this.values.set(target, clone(draft));
      return clone(draft);
    },
    async enqueue(items: any[], expectedActiveKey?: string) {
      this.enqueueCalls.push({ items: clone(items), expectedActiveKey });
      if (expectedActiveKey !== undefined && this.activeKey !== expectedActiveKey) throw new Error('账号已切换');
    },
    async dequeue() {},
    async getQueue() { return []; },
    async close() {},
    async open() {},
  };
  repositoryHarness.repository = repository;
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
    acceptSession() {},
  };
  const sync: any = {
    pull: vi.fn(async () => ({ progress: [], events: [] })),
    push: vi.fn(async () => ({ success: true })),
  };
  repositoryHarness.auth = auth;
  repositoryHarness.sync = sync;
  class CloudBaseAuthClient { constructor() { return auth; } }
  class MockAuthClient extends CloudBaseAuthClient {}
  class WorkerSyncClient { constructor() { return sync; } }
  return { CloudBaseAuthClient, MockAuthClient, WorkerSyncClient };
});

import { ensureSystemTextbooks, metaBooks, useApp } from '../apps/web/src/store';

const legacyBaseline: Record<string, { words: number; wordIdsSha256: string }> = {
  'biaori-beginner-upper': { words: 1077, wordIdsSha256: '0924d616fb1894b1a7c6cb292d2fe6ee5325b794bd5ca40133570160c3bed57a' },
  'biaori-beginner-lower': { words: 1073, wordIdsSha256: '42e8ed42f9f06718a663fb73ce4a6cce734e80e4b2f5ad41483f86eeec04bd80' },
  'biaori-intermediate-upper': { words: 1748, wordIdsSha256: '100d22bfcffc2ce20baf68e361c347289881205e4204b37f89369206afa954de' },
  'biaori-intermediate-lower': { words: 1907, wordIdsSha256: '857d8e9f6068111ab5451272c3e7903e33c4babd03d8676f45ce37b2952c6f34' },
  'biaori-advanced-upper': { words: 1806, wordIdsSha256: 'a01affc40cb16b8af14e9cd9293c29b53fc58709d8def726a84b2fea44b61c32' },
  'biaori-advanced-lower': { words: 1506, wordIdsSha256: '64d93f9c8d5ae73154503389859d6c18b49f7fa73a7b19ca19a48dae8c697c4b' },
};

const jlptBookIds = ['jlpt-n1', 'jlpt-n2', 'jlpt-n3', 'jlpt-n4', 'jlpt-n5'];
const syntheticUser = { id: 'synthetic-wordbook-user', email: 'wordbook@example.test', provider: 'test' };
const fixedTime = '2026-10-05T12:00:00.000Z';

function legacyWords(): Word[] {
  const result: Word[] = [];
  for (const book of legacyPayload.books.filter(item => LEGACY_TEXTBOOK_IDS.includes(item.id as never))) {
    for (const lesson of book.lessons) {
      for (const [index, row] of lesson.words.entries()) {
        result.push({
          id: webTextbookWordId(book.id, lesson.order, row, index),
          lessonId: `${book.id}-l-${lesson.order}`,
          term: row.term,
          reading: row.reading,
          meaning: row.meaning,
          order: result.length + 1,
          ...(row.partOfSpeech ? { partOfSpeech: row.partOfSpeech } : {}),
          ...(row.rawTerm ? { rawTerm: row.rawTerm } : {}),
        });
      }
    }
  }
  return result;
}

function makeState(userId: string, word: Word): WordState {
  return {
    userId,
    wordId: word.id,
    status: 'review',
    isIgnored: false,
    isDifficult: true,
    firstSeenAt: fixedTime,
    lastReviewedAt: fixedTime,
    nextReviewAt: '2026-10-06T12:00:00.000Z',
    reviewCount: 4,
    lapseCount: 1,
    card: {} as never,
    bookId: word.lessonId.slice(0, word.lessonId.lastIndexOf('-l-')),
    lessonId: word.lessonId,
    updatedAt: fixedTime,
  };
}

function makeLog(userId: string, state: WordState): ReviewLog {
  return {
    id: `review-${userId}-${state.wordId}`,
    userId,
    wordId: state.wordId,
    reviewedAt: fixedTime,
    rating: 3 as never,
    responseTime: 900,
    previousState: state,
    newState: state,
    studyMode: 'review',
  };
}

function seedLegacySnapshot(userId: string): Data {
  const data = emptyData();
  const legacyMeta = metaBooks.filter(book => LEGACY_TEXTBOOK_IDS.includes(book.id as never));
  const createdAt = '2025-01-01T00:00:00.000Z';
  data.books = legacyMeta.map(book => ({
    id: book.id,
    title: book.title,
    description: book.description,
    language: 'ja',
    createdAt,
    updatedAt: createdAt,
  }));
  data.lessons = legacyMeta.flatMap(book => book.lessons.map(lesson => ({
    id: lesson.id,
    bookId: book.id,
    title: lesson.title,
    order: lesson.order,
  })));
  data.words = legacyWords();

  data.books.push({
    id: 'custom-review-book',
    title: '自定义练习册',
    description: '保留用户创建的词书',
    language: 'ja',
    createdAt,
    updatedAt: createdAt,
  });
  data.lessons.push({ id: 'custom-review-lesson', bookId: 'custom-review-book', title: '自定义课', order: 1 });
  data.words.push({
    id: 'custom-review-word', lessonId: 'custom-review-lesson', term: '木漏れ日',
    reading: 'こもれび', meaning: '树叶间洒落的阳光', order: data.words.length + 1,
  });

  const priorState = makeState(userId, data.words[0]);
  data.states = [priorState];
  data.logs = [makeLog(userId, priorState)];
  data.currentBookId = 'custom-review-book';
  data.currentBookIdSource = 'user';
  data.currentBookIdUpdatedAt = fixedTime;
  data.textbooksVersion = 'biaori-v2';
  data.textbooksWordsVersion = '20260917-v2';
  data.seeded = true;
  return data;
}

function jlptMeta(bookId = 'jlpt-n5') {
  const book = metaBooks.find(item => item.id === bookId);
  if (!book) throw new Error(`Missing expected system book metadata: ${bookId}`);
  return book;
}

function validJlptResponse(bookId = 'jlpt-n5', duplicate?: Pick<Word, 'term' | 'reading' | 'meaning'>): any {
  const book = jlptMeta(bookId);
  let sourceNumber = 1;
  let duplicateUsed = false;
  return {
    id: book.id,
    title: book.title,
    description: book.description,
    wordCount: book.wordCount,
    lessons: book.lessons.map(lesson => ({
      title: lesson.title,
      order: lesson.order,
      words: Array.from({ length: lesson.wordCount }, () => {
        const current = sourceNumber++;
        const useDuplicate = !!duplicate && !duplicateUsed;
        if (useDuplicate) duplicateUsed = true;
        return {
          sourceId: current.toString(16).padStart(10, '0'),
          term: useDuplicate ? duplicate!.term : `JLPT测试词${current}`,
          reading: useDuplicate ? duplicate!.reading : `てすと${current}`,
          meaning: useDuplicate ? duplicate!.meaning : `测试释义${current}`,
        };
      }),
    })),
  };
}

function useSyntheticAccount(app: ReturnType<typeof useApp>) {
  repositoryHarness.auth.user = syntheticUser;
  repositoryHarness.repository.switchUser(syntheticUser.id);
  app.currentUser = syntheticUser;
}

function fakeJsonResponse(value: unknown) {
  return { ok: true, json: async () => structuredClone(value) };
}

beforeEach(() => {
  setActivePinia(createPinia());
  repositoryHarness.repository.activeKey = 'data_guest';
  repositoryHarness.repository.values.clear();
  repositoryHarness.repository.transactCalls = [];
  repositoryHarness.repository.enqueueCalls = [];
  repositoryHarness.auth.user = null;
  repositoryHarness.sync.pull.mockReset();
  repositoryHarness.sync.pull.mockImplementation(async () => ({ progress: [], events: [] }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Web system textbook compatibility', () => {
  it('corrects cached system wording across reads and saves without changing word IDs or learning history',async()=>{
    const snapshot=seedLegacySnapshot('local');
    const book=jlptPayload.books.find(book=>book.id==='jlpt-n1')!;
    const now='2025-01-01T00:00:00.000Z';
    snapshot.books.push({id:book.id,title:book.title,language:'ja',createdAt:now,updatedAt:now});
    for(const entry of corrections.entries.filter(entry=>entry.bookId===book.id)){
      const lesson=book.lessons.find(lesson=>lesson.order===entry.lessonOrder)!;
      const lessonId=`${book.id}-l-${lesson.order}`;
      if(!snapshot.lessons.some(item=>item.id===lessonId))snapshot.lessons.push({id:lessonId,bookId:book.id,title:lesson.title,order:lesson.order});
      const source=lesson.words[entry.sourceIndex];
      const cached={...source,id:entry.wordId,lessonId,order:snapshot.words.length+1,note:'自己的笔记'};
      snapshot.words.push(cached);
      const cachedState=makeState('local',cached);
      snapshot.states.push(cachedState);snapshot.logs.push(makeLog('local',cachedState));
    }
    snapshot.words.push({id:'custom-kihin',lessonId:'custom-review-lesson',term:'気品',reading:'きひん',meaning:'自己的解释',order:snapshot.words.length+1});
    const target=corrections.entries.find(entry=>entry.previous.term==='販売促進会')!;
    const word=snapshot.words.find(word=>word.id===target.wordId)!;
    const state=makeState('local',word);
    snapshot.states.push(state);snapshot.logs.push(makeLog('local',state));
    snapshot.textbooksWordsVersion='20260917-v2';
    const saved=structuredClone(snapshot);
    repositoryHarness.repository.values.set('data_guest',snapshot);
    const app=useApp();await app.refresh();
    for(const entry of corrections.entries){
      const corrected=app.data.words.find(word=>word.id===entry.wordId)!;
      expect({term:corrected.term,reading:corrected.reading,meaning:corrected.meaning,partOfSpeech:corrected.partOfSpeech}).toEqual(entry.corrected);
    }
    expect(app.data.words.map(word=>word.id)).toEqual(saved.words.map(word=>word.id));
    expect(app.data.states).toEqual(saved.states);expect(app.data.logs).toEqual(saved.logs);
    expect(app.data.words.find(word=>word.id==='custom-review-word')).toEqual(saved.words.find(word=>word.id==='custom-review-word'));
    expect(app.data.words.find(word=>word.id==='custom-kihin')).toEqual(saved.words.find(word=>word.id==='custom-kihin'));
    expect(app.data.words.find(word=>word.id==='jlpt-n1-w-e05bb17edd')?.note).toBe('自己的笔记');
    await app.editBook('custom-review-book','新标题','简介');
    expect(app.data.words.find(word=>word.id===target.wordId)?.term).toBe('販売促進');
    expect(app.data.states).toEqual(saved.states);expect(app.data.logs).toEqual(saved.logs);
    expect(repositoryHarness.repository.values.get('data_guest').words.find((word:Word)=>word.id===target.wordId).term).toBe('販売促進会');
  });

  it('keeps every legacy word ID at the fixed six-book baseline', () => {
    let total = 0;
    for (const bookId of LEGACY_TEXTBOOK_IDS) {
      const book = legacyPayload.books.find(item => item.id === bookId);
      expect(book, `missing legacy book ${bookId}`).toBeDefined();
      const ids = book!.lessons.flatMap(lesson => lesson.words.map((row, index) =>
        webTextbookWordId(bookId, lesson.order, row, index)));
      expect(ids).toHaveLength(legacyBaseline[bookId].words);
      expect(createHash('sha256').update(JSON.stringify(ids)).digest('hex'))
        .toBe(legacyBaseline[bookId].wordIdsSha256);
      total += ids.length;
    }
    expect(total).toBe(9117);
  });

  it('uses sourceId alone for new JLPT IDs, independent of lesson and row position', () => {
    const sourceId = '0123456789';
    expect(webTextbookWordId('jlpt-n5', 1, { sourceId }, 0)).toBe('jlpt-n5-w-0123456789');
    expect(webTextbookWordId('jlpt-n5', 48, { sourceId }, 999)).toBe('jlpt-n5-w-0123456789');
    expect(() => webTextbookWordId('jlpt-n5', 1, {}, 0)).toThrow(/缺少稳定的来源编号/);
  });

  it('only appends system catalog entries and preserves both guest and signed-in learning snapshots', () => {
    const newIds = metaBooks.filter(book => !LEGACY_TEXTBOOK_IDS.includes(book.id as never)).map(book => book.id);
    expect(new Set(newIds)).toEqual(new Set(jlptBookIds));
    const snapshots = [seedLegacySnapshot('local'), seedLegacySnapshot(syntheticUser.id)];

    for (const data of snapshots) {
      const before = structuredClone({
        words: data.words,
        states: data.states,
        logs: data.logs,
        currentBookId: data.currentBookId,
        currentBookIdSource: data.currentBookIdSource,
        currentBookIdUpdatedAt: data.currentBookIdUpdatedAt,
        textbooksVersion: data.textbooksVersion,
        textbooksWordsVersion: data.textbooksWordsVersion,
      });
      const priorBookIds = data.books.map(book => book.id);
      const expectedLessonIds = [
        ...data.lessons.map(lesson => lesson.id),
        ...metaBooks.filter(book => newIds.includes(book.id)).flatMap(book => book.lessons.map(lesson => lesson.id)),
      ];

      ensureSystemTextbooks(data);
      ensureSystemTextbooks(data); // Repeated hydration/install must be idempotent.

      expect(data.books.map(book => book.id)).toEqual([...priorBookIds, ...newIds]);
      expect(new Set(data.books.map(book => book.id)).size).toBe(data.books.length);
      expect(new Set(data.lessons.map(lesson => lesson.id)).size).toBe(data.lessons.length);
      expect(data.lessons.map(lesson => lesson.id)).toEqual(expectedLessonIds);
      expect({
        words: data.words,
        states: data.states,
        logs: data.logs,
        currentBookId: data.currentBookId,
        currentBookIdSource: data.currentBookIdSource,
        currentBookIdUpdatedAt: data.currentBookIdUpdatedAt,
        textbooksVersion: data.textbooksVersion,
        textbooksWordsVersion: data.textbooksWordsVersion,
      }).toEqual(before);
      expect(data.books.some(book => book.id === 'custom-review-book')).toBe(true);
      expect(data.words.some(word => word.id === 'custom-review-word')).toBe(true);
    }
  });

  it('loads a same-spelling JLPT word as a distinct item with independent learning state', async () => {
    const app = useApp();
    useSyntheticAccount(app);
    const initial = seedLegacySnapshot(syntheticUser.id);
    const oldWord = initial.words[0];
    const oldState = initial.states[0];
    const oldLog = initial.logs[0];
    repositoryHarness.repository.values.set(repositoryHarness.repository.activeKey, structuredClone(initial));
    await app.refresh();

    const response = validJlptResponse('jlpt-n5', oldWord);
    vi.stubGlobal('fetch', vi.fn(async () => fakeJsonResponse(response)));
    await expect(app.ensureBookLoaded('jlpt-n5', false, syntheticUser.id)).resolves.toBe(true);

    const newWordId = webTextbookWordId('jlpt-n5', response.lessons[0].order, response.lessons[0].words[0], 0);
    const loadedWord = app.data.words.find(word => word.id === newWordId);
    expect(loadedWord).toMatchObject({ term: oldWord.term, reading: oldWord.reading, meaning: oldWord.meaning });
    expect(newWordId).not.toBe(oldWord.id);
    expect(stateFor(app.data, oldWord.id, syntheticUser.id)).toEqual(oldState);
    expect(stateFor(app.data, newWordId, syntheticUser.id)).toBeUndefined();
    expect(app.data.logs).toEqual([oldLog]);
    expect(repositoryHarness.repository.values.get(repositoryHarness.repository.activeKey)?.words).toContainEqual(loadedWord);
    expect(repositoryHarness.repository.enqueueCalls).toHaveLength(0);
  });

  it('keeps an explicitly selected zero-progress JLPT book through cloud reconciliation', async () => {
    const app = useApp();
    useSyntheticAccount(app);
    const initial = seedLegacySnapshot(syntheticUser.id);
    repositoryHarness.repository.values.set(repositoryHarness.repository.activeKey, structuredClone(initial));
    await app.refresh();

    vi.stubGlobal('fetch', vi.fn(async () => fakeJsonResponse(validJlptResponse('jlpt-n5'))));
    await app.setCurrentBook('jlpt-n5');
    expect(app.data.currentBookId).toBe('jlpt-n5');
    expect(app.data.currentBookIdSource).toBe('user');

    repositoryHarness.sync.pull.mockResolvedValue({
      userId: syntheticUser.id,
      progress: [],
      events: [],
      settings: {
        currentBookId: 'biaori-beginner-upper',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    });
    await app.reconcileWithCloud(syntheticUser, 'synthetic-token');

    expect(repositoryHarness.sync.pull).toHaveBeenCalledWith('synthetic-token');
    expect(app.data.currentBookId).toBe('jlpt-n5');
    expect(app.data.currentBookIdSource).toBe('user');
    expect(app.data.words.some(word => word.id.startsWith('jlpt-n5-w-'))).toBe(true);
    expect(stateFor(app.data, initial.words[0].id, syntheticUser.id)).toMatchObject({
      wordId: initial.words[0].id,
      bookId: initial.states[0].bookId,
      isDifficult: true,
    });
    expect(app.data.logs.some(log => log.id === initial.logs[0].id)).toBe(true);
  });

  it.each([
    ['malformed word fields', (value: any) => { value.lessons[0].words[0].reading = ''; }],
    ['book identity mismatch', (value: any) => { value.id = 'jlpt-n4'; }],
    ['missing stable source ID', (value: any) => { delete value.lessons[0].words[0].sourceId; }],
  ])('rejects %s before opening a transaction and leaves the snapshot intact', async (_name, corrupt) => {
    const app = useApp();
    useSyntheticAccount(app);
    const initial = seedLegacySnapshot(syntheticUser.id);
    const key = repositoryHarness.repository.activeKey;
    repositoryHarness.repository.values.set(key, structuredClone(initial));
    await app.refresh();
    const beforeLocal = structuredClone(toRaw(app.data));
    const beforePersisted = structuredClone(repositoryHarness.repository.values.get(key));
    const response = validJlptResponse();
    corrupt(response);
    vi.stubGlobal('fetch', vi.fn(async () => fakeJsonResponse(response)));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(app.ensureBookLoaded('jlpt-n5', false, syntheticUser.id)).resolves.toBe(false);

    expect(repositoryHarness.repository.transactCalls).toHaveLength(0);
    expect(repositoryHarness.repository.values.get(key)).toEqual(beforePersisted);
    expect(app.data).toEqual(beforeLocal);
  });
});
