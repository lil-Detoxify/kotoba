import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const harness = vi.hoisted(() => ({
  repository: null as any,
  auth: null as any,
  sync: null as any,
}));

vi.mock('@jp/storage', () => {
  const freshData = () => ({
    books: [], lessons: [], words: [], states: [], logs: [], seeded: true,
  });
  const clone = <T>(value: T): T => structuredClone(value);
  const repository: any = {
    activeKey: 'data_guest',
    values: new Map<string, any>(),
    queue: [] as any[],
    transactCalls: [] as any[],
    nextTransact: null as any,
    nextEnqueue: null as any,
    enqueueError: null as Error | null,
    enqueueCalls: [] as any[],
    dequeueCalls: [] as any[],
    getActiveKey() { return this.activeKey; },
    switchUser(userId: string | null) { this.activeKey = userId ? `data_user_${userId.trim()}` : 'data_guest'; },
    async read(key?: string) { return clone(this.values.get(key ?? this.activeKey) ?? freshData()); },
    async transact(change: (data: any) => void, key?: string) {
      const targetKey = key ?? this.activeKey;
      this.transactCalls.push({ targetKey });
      const draft = clone(this.values.get(targetKey) ?? freshData());
      const gate = this.nextTransact;
      this.nextTransact = null;
      if (gate?.stage === 'before') { gate.started(); await gate.blocked; }
      change(draft);
      if (gate?.stage === 'after') { gate.started(); await gate.blocked; }
      if (gate?.stage === 'afterCommit') {
        this.values.set(targetKey, clone(draft));
        gate.started();
        await gate.blocked;
        return clone(draft);
      }
      this.values.set(targetKey, clone(draft));
      return clone(draft);
    },
    async enqueue(items: any[], expectedActiveKey?: string) {
      this.enqueueCalls.push({ items: clone(items), expectedActiveKey });
      const gate = this.nextEnqueue;
      this.nextEnqueue = null;
      if (gate) { gate.started(); await gate.blocked; }
      if (expectedActiveKey !== undefined && this.activeKey !== expectedActiveKey) throw new Error('账号已切换，同步队列没有更新。');
      if (this.enqueueError) throw this.enqueueError;
      const byId = new Map(this.queue.map((item: any) => [item.id, item]));
      for (const item of items) byId.set(item.id, clone(item));
      this.queue = [...byId.values()];
    },
    async dequeue(ids: string[], expectedActiveKey?: string) {
      this.dequeueCalls.push({ ids: [...ids], expectedActiveKey });
      if (expectedActiveKey !== undefined && this.activeKey !== expectedActiveKey) throw new Error('账号已切换，同步队列没有更新。');
      const remove = new Set(ids);
      this.queue = this.queue.filter((item: any) => !remove.has(item.id));
    },
    async getQueue() { return clone(this.queue); },
    async createPreLoginSnapshot() {},
    async hasPreLoginSnapshot() { return false; },
    async restorePreLoginSnapshot() { return false; },
    async hasLegacyData() { return false; },
    async getLegacyData() { return null; },
    async close() {},
    async open() {},
  };
  harness.repository = repository;
  return { IndexedDbRepository: class { constructor() { return repository; } }, deleteBook: vi.fn() };
});

vi.mock('@jp/sync', () => {
  const auth: any = {
    user: null,
    token: null,
    getCurrentUser() { return this.user; },
    async getAccessToken() { return this.token; },
    async init() {},
    async checkAccount() { return { exists: false, hasPassword: false, flow: 'register' }; },
    async sendEmailCode() { return { success: true, verificationId: 'mock-verification' }; },
    async loginWithPassword() { return { success: false }; },
    async registerWithPassword() { return { success: false }; },
    async upgradeLegacyPassword() { return { success: false }; },
    async resetPassword() { return { success: false }; },
    async refreshToken() { return { success: false }; },
    async signInWithEmailCode() { return { success: false }; },
    async signOut() { this.user = null; this.token = null; },
    onAuthStateChange() { return () => {}; },
    acceptSession() {},
  };
  const sync: any = {
    bootstrap: vi.fn(async () => ({ userId: 'user-a', hasCloudData: false, progressCount: 0, eventCount: 0 })),
    pull: vi.fn(async () => ({ userId: 'user-a', progress: [], events: [], serverTime: new Date().toISOString() })),
    push: vi.fn(async () => ({ success: true, acceptedEvents: 0, updatedProgress: 0, serverTime: new Date().toISOString() })),
  };
  harness.auth = auth;
  harness.sync = sync;
  class CloudBaseAuthClient { constructor() { return auth; } }
  class MockAuthClient extends CloudBaseAuthClient {}
  class WorkerSyncClient { constructor() { return sync; } }
  return { CloudBaseAuthClient, MockAuthClient, WorkerSyncClient };
});

import { useApp } from '../apps/web/src/store';

const userA = { id: 'user-a', email: 'a@example.test', provider: 'kotobud' };
const userB = { id: 'user-b', email: 'b@example.test', provider: 'kotobud' };
const serverTime = '2026-10-02T00:00:00.000Z';

function useAccount(app: ReturnType<typeof useApp>, user: typeof userA) {
  harness.auth.user = user;
  harness.auth.token = `token-${user.id}`;
  harness.repository.switchUser(user.id);
  app.currentUser = user;
}

function progressItem(id: string, userId: string, wordId: string) {
  return {
    id,
    type: 'progress',
    payload: { userId, wordId, reviewCount: 0 },
    createdAt: serverTime,
    retries: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let started!: () => void;
  const blocked = new Promise<T>(done => { resolve = done; });
  const began = new Promise<void>(done => { started = done; });
  return { blocked, resolve, started, began };
}

describe('web account-fenced flags and sync queue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    harness.repository.activeKey = 'data_guest';
    harness.repository.values.clear();
    harness.repository.queue = [];
    harness.repository.transactCalls = [];
    harness.repository.nextTransact = null;
    harness.repository.nextEnqueue = null;
    harness.repository.enqueueError = null;
    harness.repository.enqueueCalls = [];
    harness.repository.dequeueCalls = [];
    harness.auth.user = null;
    harness.auth.token = null;
    harness.sync.push.mockReset();
    harness.sync.push.mockImplementation(async () => ({ success: true, acceptedEvents: 0, updatedProgress: 0, serverTime: serverTime }));
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('rejects a flag carrying an old captured user after the active account changes', async () => {
    const app = useApp();
    useAccount(app, userA);
    harness.repository.switchUser(userB.id);
    harness.auth.user = userB;
    app.currentUser = userB;

    await expect(app.flag('book-word-1', 'isDifficult', true, userA.id)).resolves.toBe(false);
    expect(harness.repository.values.get('data_user_user-b')?.states ?? []).toHaveLength(0);
    expect(harness.repository.enqueueCalls).toHaveLength(0);
    expect(app.error).toBe('');
  });

  it('writes a guest flag to the guest partition when the captured identity is null', async () => {
    const app = useApp();

    await expect(app.flag('guest-word-1', 'isDifficult', true, null)).resolves.toBe(true);

    expect(harness.repository.values.get('data_guest')?.states[0]).toMatchObject({
      userId: 'local', wordId: 'guest-word-1', isDifficult: true,
    });
    expect(harness.repository.enqueueCalls).toHaveLength(0);
  });

  it('rejects a delayed guest flag after login switches the active account', async () => {
    const app = useApp();
    const gate = deferred<void>();
    harness.repository.nextTransact = { stage: 'before', started: gate.started, blocked: gate.blocked };

    const pending = app.flag('guest-word-2', 'isIgnored', true, null);
    await gate.began;
    useAccount(app, userA);
    gate.resolve(undefined);

    await expect(pending).resolves.toBe(false);
    expect(harness.repository.values.get('data_guest')?.states ?? []).toHaveLength(0);
    expect(harness.repository.values.get('data_user_user-a')?.states ?? []).toHaveLength(0);
    expect(harness.repository.enqueueCalls).toHaveLength(0);
  });

  it('rechecks account identity inside a delayed transaction before it mutates either partition', async () => {
    const app = useApp();
    useAccount(app, userA);
    const gate = deferred<void>();
    harness.repository.nextTransact = { stage: 'before', started: gate.started, blocked: gate.blocked };

    const pending = app.flag('book-word-2', 'isIgnored', true, userA.id);
    await gate.began;
    useAccount(app, userB);
    gate.resolve(undefined);

    await expect(pending).resolves.toBe(false);
    expect(harness.repository.values.get('data_user_user-a')?.states ?? []).toHaveLength(0);
    expect(harness.repository.values.get('data_user_user-b')?.states ?? []).toHaveLength(0);
    expect(harness.repository.enqueueCalls).toHaveLength(0);
  });

  it('keeps an in-flight rating in its captured partition and does not advance the new account UI', async () => {
    const app = useApp();
    useAccount(app, userA);
    app.queue = [{ id: 'book-word-rate', lessonId: 'lesson-1', term: '日本語', reading: 'にほんご', meaning: '日语', order: 1 }];
    app.index = 0;
    const gate = deferred<void>();
    harness.repository.nextTransact = { stage: 'before', started: gate.started, blocked: gate.blocked };

    const pending = app.rate(3 as any, 250);
    await gate.began;
    useAccount(app, userB);
    gate.resolve(undefined);

    await expect(pending).resolves.toBeUndefined();
    expect(harness.repository.transactCalls.at(-1)?.targetKey).toBe('data_user_user-a');
    expect(harness.repository.values.get('data_user_user-a')?.logs ?? []).toHaveLength(0);
    expect(harness.repository.values.get('data_user_user-b')?.logs ?? []).toHaveLength(0);
    expect(app.index).toBe(0);
    expect(app.data.logs).toHaveLength(0);
    expect(harness.repository.enqueueCalls).toHaveLength(0);
    expect(app.error).toBe('');
  });

  it('does not advance a replacement learning queue when an old same-account rating completes', async () => {
    const app = useApp();
    useAccount(app, userA);
    app.queue = [{ id: 'old-word', lessonId: 'lesson-1', term: '本', reading: 'ほん', meaning: '书', order: 1 }];
    app.index = 0;
    app.mode = 'new';
    const gate = deferred<void>();
    harness.repository.nextTransact = { stage: 'before', started: gate.started, blocked: gate.blocked };
    const pending = app.rate(3 as any, 250);
    await gate.began;
    app.queue = [{ id: 'new-word', lessonId: 'lesson-2', term: '机', reading: 'つくえ', meaning: '桌子', order: 1 }];
    app.mode = 'review';
    gate.resolve(undefined);
    await pending;
    expect(app.index).toBe(0);
    expect(app.queue[0].id).toBe('new-word');
    const committed = harness.repository.values.get('data_user_user-a').logs;
    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({ wordId: 'old-word', studyMode: 'new' });
  });

  it('discards textbook data fetched for an old account after the active account changes', async () => {
    const app = useApp();
    useAccount(app, userA);
    let resolveFetch!: (response: any) => void;
    const response = new Promise<any>(resolve => { resolveFetch = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => response));

    const pending = app.ensureBookLoaded('biaori-beginner-upper', false, userA.id);
    useAccount(app, userB);
    resolveFetch({
      ok: true,
      json: async () => ({
        id: 'biaori-beginner-upper',
        lessons: [{ order: 1, words: [{ term: '学生', reading: 'がくせい', meaning: '学生' }] }],
      }),
    });

    await expect(pending).resolves.toBe(false);
    expect(harness.repository.transactCalls).toHaveLength(0);
    expect(harness.repository.values.get('data_user_user-b')?.words ?? []).toHaveLength(0);
    expect(app.data.words).toHaveLength(0);
  });

  it('keeps a stale flag and its tagged outbox in A after switching to B before commit returns', async () => {
    const app = useApp();
    useAccount(app, userA);
    const gate = deferred<void>();
    harness.repository.nextTransact = { stage: 'after', started: gate.started, blocked: gate.blocked };

    const pending = app.flag('book-word-3', 'isDifficult', true, userA.id);
    await gate.began;
    useAccount(app, userB);
    gate.resolve(undefined);

    await expect(pending).resolves.toBe(false);
    expect(harness.repository.values.get('data_user_user-a')?.states[0]).toMatchObject({ userId: userA.id, isDifficult: true });
    expect(harness.repository.values.get('data_user_user-b')?.states ?? []).toHaveLength(0);
    expect(harness.repository.queue).toHaveLength(1);
    expect(harness.repository.queue[0]).toMatchObject({ type: 'progress', payload: { userId: userA.id, wordId: 'book-word-3' } });
    expect(harness.repository.enqueueCalls[0].expectedActiveKey).toBeUndefined();
    expect(app.data.states).toHaveLength(0);
  });

  it('writes a committed stale rating only to A outbox and never pushes it as B', async () => {
    const app = useApp();
    useAccount(app, userA);
    app.queue = [{ id: 'book-word-committed-rate', lessonId: 'lesson-1', term: '日本語', reading: 'にほんご', meaning: '日语', order: 1 }];
    app.index = 0;
    const gate = deferred<void>();
    harness.repository.nextTransact = { stage: 'afterCommit', started: gate.started, blocked: gate.blocked };

    const pending = app.rate(3 as any, 250);
    await gate.began;
    expect(harness.repository.values.get('data_user_user-a')?.logs).toHaveLength(1);
    useAccount(app, userB);
    gate.resolve(undefined);

    await expect(pending).resolves.toBeUndefined();
    expect(harness.repository.queue).toHaveLength(2);
    expect(harness.repository.queue.every((item: any) => item.payload.userId === userA.id)).toBe(true);
    expect(app.index).toBe(0);
    expect(app.data.logs).toHaveLength(0);

    app.isSyncReady = true;
    await app.flushSyncQueue();
    expect(harness.sync.push).toHaveBeenCalledTimes(1);
    expect(harness.sync.push.mock.calls[0][1].events).toEqual([]);
    expect(harness.sync.push.mock.calls[0][1].progress).toEqual([]);
  });

  it('writes a committed stale flag only to A outbox and never pushes it as B', async () => {
    const app = useApp();
    useAccount(app, userA);
    const gate = deferred<void>();
    harness.repository.nextTransact = { stage: 'afterCommit', started: gate.started, blocked: gate.blocked };

    const pending = app.flag('book-word-committed-flag', 'isIgnored', true, userA.id);
    await gate.began;
    expect(harness.repository.values.get('data_user_user-a')?.states[0]).toMatchObject({ isIgnored: true });
    useAccount(app, userB);
    gate.resolve(undefined);

    await expect(pending).resolves.toBe(false);
    expect(harness.repository.queue).toHaveLength(1);
    expect(harness.repository.queue[0]).toMatchObject({ type: 'progress', payload: { userId: userA.id, wordId: 'book-word-committed-flag' } });
    expect(harness.repository.enqueueCalls[0].expectedActiveKey).toBeUndefined();
    expect(app.data.states).toHaveLength(0);

    app.isSyncReady = true;
    await app.flushSyncQueue();
    expect(harness.sync.push).toHaveBeenCalledTimes(1);
    expect(harness.sync.push.mock.calls[0][1].events).toEqual([]);
    expect(harness.sync.push.mock.calls[0][1].progress).toEqual([]);
  });

  it('preserves A outbox when the account changes during its post-commit enqueue', async () => {
    const app = useApp();
    useAccount(app, userA);
    const gate = deferred<void>();
    harness.repository.nextEnqueue = { started: gate.started, blocked: gate.blocked };

    const pending = app.flag('book-word-enqueue-race', 'isDifficult', true, userA.id);
    await gate.began;
    useAccount(app, userB);
    gate.resolve(undefined);

    await expect(pending).resolves.toBe(false);
    expect(harness.repository.queue).toHaveLength(1);
    expect(harness.repository.queue[0].payload.userId).toBe(userA.id);
    expect(harness.repository.values.get('data_user_user-b')?.states ?? []).toHaveLength(0);
    expect(app.data.states).toHaveLength(0);
    app.isSyncReady = true;
    await app.flushSyncQueue();
    const sent = harness.sync.push.mock.calls.flatMap((call: any) => call[1].progress);
    expect(sent).toEqual([]);
    expect(harness.repository.queue).toHaveLength(1);
  });

  it('uses fresh progress queue IDs for repeated flags on the same word', async () => {
    const app = useApp();
    useAccount(app, userA);
    await expect(app.flag('book-word-4', 'isDifficult', true, userA.id)).resolves.toBe(true);
    await expect(app.flag('book-word-4', 'isDifficult', false, userA.id)).resolves.toBe(true);

    expect(harness.repository.queue).toHaveLength(2);
    expect(new Set(harness.repository.queue.map((item: any) => item.id)).size).toBe(2);
    expect(harness.repository.queue.every((item: any) => item.payload.userId === userA.id)).toBe(true);
    expect(harness.repository.enqueueCalls.every((call: any) => call.expectedActiveKey === undefined)).toBe(true);
  });

  it('surfaces an outbox write failure after preserving the committed local flag', async () => {
    const app = useApp();
    useAccount(app, userA);
    harness.repository.enqueueError = new Error('disk full');

    await expect(app.flag('book-word-outbox-failure', 'isDifficult', true, userA.id))
      .rejects.toThrow('本地数据已保存，但同步队列写入失败：disk full');

    expect(harness.repository.values.get('data_user_user-a')?.states[0]).toMatchObject({ isDifficult: true });
    expect(harness.repository.queue).toHaveLength(0);
    expect(app.error).toContain('同步队列写入失败');
  });

  it('pushes only the captured user queue and leaves it intact if the account changes during push', async () => {
    const app = useApp();
    useAccount(app, userA);
    app.isSyncReady = true;
    harness.repository.queue = [
      progressItem('a-progress', userA.id, 'word-a'),
      progressItem('b-progress', userB.id, 'word-b'),
    ];
    const gate = deferred<any>();
    harness.sync.push.mockImplementationOnce(async () => { gate.started(); return gate.blocked; });

    const pending = app.flushSyncQueue();
    await gate.began;
    expect(harness.sync.push.mock.calls[0][1].progress.map((item: any) => item.wordId)).toEqual(['word-a']);
    expect(harness.sync.push.mock.calls[0][1].settings.userId).toBe(userA.id);
    useAccount(app, userB);
    gate.resolve({ success: true, acceptedEvents: 0, updatedProgress: 1, serverTime });
    await pending;

    expect(harness.repository.queue.map((item: any) => item.id)).toEqual(['a-progress', 'b-progress']);
    expect(harness.repository.dequeueCalls).toHaveLength(0);

    app.isSyncReady = true;
    await app.flushSyncQueue();
    expect(harness.sync.push.mock.calls[1][1].progress.map((item: any) => item.wordId)).toEqual(['word-b']);
    expect(harness.repository.queue.map((item: any) => item.id)).toEqual(['a-progress']);
    expect(harness.repository.dequeueCalls).toEqual([{ ids: ['b-progress'], expectedActiveKey: 'data_user_user-b' }]);
  });

  it('aborts a guarded IndexedDB enqueue when the active namespace changes while opening storage', async () => {
    const storage = await vi.importActual<typeof import('../packages/storage/src/index')>('../packages/storage/src/index');
    const databaseName = `web-flag-guard-${crypto.randomUUID()}`;
    const repository = new storage.IndexedDbRepository(databaseName);
    repository.switchUser(userA.id);
    const enqueue = repository.enqueue([progressItem('guarded', userA.id, 'word-a') as any], `data_user_${userA.id}`);
    repository.switchUser(userB.id);

    await expect(enqueue).rejects.toThrow('账号已切换');
    expect(await repository.getQueue()).toEqual([]);
    await repository.close();
  });
});
