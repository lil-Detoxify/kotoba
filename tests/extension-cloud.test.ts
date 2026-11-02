import { describe, expect, it, vi } from 'vitest';
import { ExtensionCloudCoordinator, type AccountSyncRepository } from '../apps/extension/src/cloud';
import type { ExtensionAuthSession } from '../apps/extension/src/cloud-client';
import type { SyncQueueItem } from '../packages/models/src';
import type { SyncClient } from '../packages/sync/src';

const serverTime = '2026-10-02T00:00:00.000Z';
const account: ExtensionAuthSession = {
  user: { id: 'user-1', email: 'learner@example.test', provider: 'kotobud' },
  token: 'secret-access-token',
  refreshToken: 'secret-refresh-token',
};

function emptySnapshot(): any {
  return {
    schema: 1,
    words: [],
    logs: [],
    preferences: { motion: 'standard', dailyGoal: 20, voice: 'female', exerciseType: 'card', selectedBookIds: [] },
    learning: { books: [], words: [], states: [], logs: [], quizAttempts: [] },
    syncQueue: [],
  };
}

function eventQueue(id = 'event-1'): SyncQueueItem {
  const event = {
    _id: id,
    userId: 'user-1',
    wordId: 'textbook-word-1',
    reviewedAt: serverTime,
    rating: 3,
    responseTime: 900,
    studyMode: 'review',
    clientCreatedAt: serverTime,
  };
  return { id, type: 'review_event', payload: event, createdAt: serverTime, retries: 0 };
}

class FakeRepository implements AccountSyncRepository {
  readonly mergeCloud = vi.fn(async (_pulled: unknown, _userId: string) => emptySnapshot());
  readonly mergeGuest = vi.fn(async (_userId: string) => emptySnapshot());
  readonly clearGuestAfterMerge = vi.fn(async (_userId: string) => {});
  readonly dequeueSync = vi.fn(async (ids: string[]) => {
    this.queue = this.queue.filter(item => !ids.includes(item.id));
  });
  readonly read = vi.fn(async () => emptySnapshot());

  constructor(readonly partitionKey: string, public queue: SyncQueueItem[] = []) {}
  async getSyncQueue(): Promise<SyncQueueItem[]> { return structuredClone(this.queue); }
}

function createHarness(options: { queue?: SyncQueueItem[]; pull?: unknown; pullError?: Error } = {}) {
  let currentSession: ExtensionAuthSession | null = null;
  let activeKey: 'current' | `account:${string}` = 'current';
  const guestRepo = new FakeRepository('current');
  const userRepo = new FakeRepository('account:user-1', options.queue ?? []);
  const otherRepo = new FakeRepository('account:user-2');
  const repos = new Map([
    ['current', guestRepo],
    ['account:user-1', userRepo],
    ['account:user-2', otherRepo],
  ]);
  const auth = {
    checkAccount: vi.fn(async () => ({ exists: true, hasPassword: true, flow: 'password' as const })),
    sendEmailCode: vi.fn(async () => ({ success: true, verificationId: 'verify-1' })),
    loginCandidate: vi.fn(async () => ({ success: true, session: account })),
    registerCandidate: vi.fn(async () => ({ success: true, session: account })),
    getSession: vi.fn(async () => currentSession),
    saveSession: vi.fn(async (session: ExtensionAuthSession) => { currentSession = structuredClone(session); }),
    refreshCandidate: vi.fn(async () => ({ success: false, error: 'expired' })),
    logoutRemote: vi.fn(async () => {}),
    clearSession: vi.fn(async () => { currentSession = null; }),
  };
  const sync = {
    bootstrap: vi.fn(async () => ({ userId: 'user-1', hasCloudData: true, progressCount: 0, eventCount: 0 })),
    pull: vi.fn(async () => {
      if (options.pullError) throw options.pullError;
      return options.pull ?? { userId: 'user-1', progress: [], events: [], serverTime };
    }),
    push: vi.fn<SyncClient['push']>(async (_token, _payload) => ({ success: true, acceptedEvents: 1, updatedProgress: 0, serverTime })),
  };
  const coordinator = new ExtensionCloudCoordinator({
    auth: auth as any,
    sync: sync as any,
    getActiveRepository: () => repos.get(activeKey)!,
    getRepository: key => repos.get(key)!,
    activatePartition: key => { activeKey = key; },
  });
  return {
    coordinator,
    auth,
    sync,
    guestRepo,
    userRepo,
    otherRepo,
    activeKey: () => activeKey,
    setActiveKey: (key: 'current' | `account:${string}`) => { activeKey = key; },
    setSession: (session: ExtensionAuthSession | null) => { currentSession = session; },
  };
}

describe('extension cloud sync barrier and retry', () => {
  it('does not reconcile or push when the pull fails, and keeps the outbox intact', async () => {
    const harness = createHarness({ queue: [eventQueue()], pullError: new Error('offline') });

    const result = await harness.coordinator.login('learner@example.test', 'never-persist-this-password');

    expect(result.authenticated).toBe(true);
    expect(result.ready).toBe(false);
    expect(harness.userRepo.mergeCloud).not.toHaveBeenCalled();
    expect(harness.sync.push).not.toHaveBeenCalled();
    expect(harness.userRepo.queue).toHaveLength(1);
    expect(harness.userRepo.dequeueSync).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('secret-access-token');
    expect(JSON.stringify(result)).not.toContain('secret-refresh-token');
    expect(harness.auth.saveSession.mock.calls[0][0]).not.toHaveProperty('password');
  });

  it('rejects a pull for another account before repository merge or push', async () => {
    const harness = createHarness({ queue: [eventQueue()], pull: { userId: 'user-2', progress: [], events: [], serverTime } });

    const result = await harness.coordinator.login('learner@example.test', 'password');

    expect(result.ready).toBe(false);
    expect(harness.userRepo.mergeCloud).not.toHaveBeenCalled();
    expect(harness.sync.push).not.toHaveBeenCalled();
    expect(harness.userRepo.queue).toHaveLength(1);
  });

  it('merges guest data only after an explicit request and retains it until push succeeds', async () => {
    const harness = createHarness();
    await harness.coordinator.login('learner@example.test', 'password');
    expect(harness.userRepo.mergeGuest).not.toHaveBeenCalled();

    harness.userRepo.queue = [eventQueue('stable-review-event')];
    harness.sync.push.mockRejectedValueOnce(new Error('temporary network failure'));
    const options = { expectedPartitionKey: 'account:user-1', mergeGuest: true };

    const first = await harness.coordinator.sync(options);
    expect(first.success).toBe(false);
    expect(harness.userRepo.mergeGuest).toHaveBeenCalledTimes(1);
    expect(harness.guestRepo.clearGuestAfterMerge).not.toHaveBeenCalled();
    expect(harness.userRepo.queue.map(item => item.id)).toEqual(['stable-review-event']);
    expect(harness.sync.push.mock.calls[0][1].events.map(event => event._id)).toEqual(['stable-review-event']);

    const retry = await harness.coordinator.sync(options);
    expect(retry.success).toBe(true);
    expect(harness.sync.push).toHaveBeenCalledTimes(2);
    expect(harness.sync.push.mock.calls[1][1].events.map(event => event._id)).toEqual(['stable-review-event']);
    expect(harness.userRepo.dequeueSync).toHaveBeenCalledWith(['stable-review-event']);
    expect(harness.guestRepo.clearGuestAfterMerge).toHaveBeenCalledTimes(1);
  });

  it('does not push a pull result if the active account changes while the pull is pending', async () => {
    const harness = createHarness();
    await harness.coordinator.login('learner@example.test', 'password');
    harness.userRepo.mergeCloud.mockClear();
    let finishPull!: (value: unknown) => void;
    harness.sync.pull.mockImplementationOnce(() => new Promise(resolve => { finishPull = resolve; }) as any);

    const pending = harness.coordinator.sync({ expectedPartitionKey: 'account:user-1' });
    await vi.waitFor(() => expect(harness.sync.pull).toHaveBeenCalledTimes(2));
    harness.setActiveKey('account:user-2');
    harness.setSession({ ...account, user: { ...account.user, id: 'user-2' } });
    finishPull({ userId: 'user-1', progress: [], events: [], serverTime });

    const result = await pending;
    expect(result.success).toBe(false);
    expect(harness.userRepo.mergeCloud).not.toHaveBeenCalled();
    expect(harness.sync.push).not.toHaveBeenCalled();
  });

  it('serializes same-account sync requests without invalidating the one already in progress', async () => {
    const harness = createHarness();
    await harness.coordinator.login('learner@example.test', 'password');
    harness.sync.pull.mockClear();
    let finishFirst!: (value: unknown) => void;
    harness.sync.pull.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }) as any);

    const first = harness.coordinator.sync({ expectedPartitionKey: 'account:user-1' });
    await vi.waitFor(() => expect(harness.sync.pull).toHaveBeenCalledTimes(1));
    const second = harness.coordinator.sync({ expectedPartitionKey: 'account:user-1' });
    await Promise.resolve();
    expect(harness.sync.pull).toHaveBeenCalledTimes(1);

    finishFirst({ userId: 'user-1', progress: [], events: [], serverTime });
    const results = await Promise.all([first, second]);
    expect(results.every(result => result.success)).toBe(true);
    expect(harness.sync.pull).toHaveBeenCalledTimes(2);
  });

  it('lets logout finish while an old pull is pending and fences its later response', async () => {
    const harness = createHarness();
    await harness.coordinator.login('learner@example.test', 'password');
    harness.userRepo.mergeCloud.mockClear();
    harness.sync.pull.mockClear();
    let finishPull!: (value: unknown) => void;
    harness.sync.pull.mockImplementationOnce(() => new Promise(resolve => { finishPull = resolve; }) as any);
    const pendingSync = harness.coordinator.sync({ expectedPartitionKey: 'account:user-1' });
    await vi.waitFor(() => expect(harness.sync.pull).toHaveBeenCalledTimes(1));

    const loggedOut = await harness.coordinator.logout();
    expect(loggedOut.activePartitionKey).toBe('current');
    expect(loggedOut.user).toBeNull();
    expect(harness.auth.clearSession).toHaveBeenCalledTimes(1);

    finishPull({ userId: 'user-1', progress: [], events: [], serverTime });
    expect((await pendingSync).success).toBe(false);
    expect(harness.userRepo.mergeCloud).not.toHaveBeenCalled();
    expect(harness.sync.push).not.toHaveBeenCalled();
  });

  it('does not leave a stale login token behind when logout races its credential save', async () => {
    const harness = createHarness();
    const candidate = { ...account, token: 'candidate-token' };
    harness.auth.loginCandidate.mockResolvedValue({ success: true, session: candidate });
    let saveStarted!: () => void;
    let releaseSave!: () => void;
    const started = new Promise<void>(resolve => { saveStarted = resolve; });
    const blocked = new Promise<void>(resolve => { releaseSave = resolve; });
    harness.auth.saveSession.mockImplementation(async session => {
      if (session.token === 'candidate-token') {
        saveStarted();
        await blocked;
      }
      harness.setSession(session);
    });

    const loginAttempt = harness.coordinator.login('learner@example.test', 'password');
    await started;
    const logoutAttempt = harness.coordinator.logout();
    releaseSave();
    await Promise.all([loginAttempt, logoutAttempt]);

    expect(harness.auth.clearSession).toHaveBeenCalled();
    expect(harness.activeKey()).toBe('current');
    expect(await harness.auth.getSession()).toBeNull();
  });

  it('does not let a logout with a delayed session read clear a newer login', async () => {
    const harness = createHarness();
    await harness.coordinator.login('learner@example.test', 'password');
    harness.auth.logoutRemote.mockClear();

    let releaseRead!: (session: ExtensionAuthSession | null) => void;
    let readStarted!: () => void;
    const started = new Promise<void>(resolve => { readStarted = resolve; });
    const delayedRead = new Promise<ExtensionAuthSession | null>(resolve => { releaseRead = resolve; });
    const getSession = harness.auth.getSession.getMockImplementation()!;
    let holdNextRead = true;
    harness.auth.getSession.mockImplementation(() => {
      if (holdNextRead) {
        holdNextRead = false;
        readStarted();
        return delayedRead;
      }
      return getSession();
    });

    const logout = harness.coordinator.logout();
    await started;
    const replacement: ExtensionAuthSession = {
      ...account,
      user: { ...account.user, id: 'user-2', email: 'new@example.test' },
      token: 'new-account-token',
    };
    harness.auth.loginCandidate.mockResolvedValue({ success: true, session: replacement });
    harness.sync.pull.mockResolvedValue({ userId: 'user-2', progress: [], events: [], serverTime });
    const login = await harness.coordinator.login('new@example.test', 'password');
    expect(login.authenticated).toBe(true);

    releaseRead(account);
    const logoutStatus = await logout;

    expect(logoutStatus.user?.id).toBe('user-2');
    expect(logoutStatus.activePartitionKey).toBe('account:user-2');
    expect(harness.auth.logoutRemote).not.toHaveBeenCalled();
    expect(harness.auth.clearSession).not.toHaveBeenCalled();
    expect(harness.activeKey()).toBe('account:user-2');
    expect((await harness.auth.getSession())?.user.id).toBe('user-2');
  });

  it('coalesces older progress rows per word while retaining every stable review event id', async () => {
    const older: SyncQueueItem = {
      id: 'progress-old', type: 'progress', createdAt: '2026-10-01T00:00:00.000Z', retries: 0,
      payload: { _id: 'user-1:textbook-word-1', userId: 'user-1', wordId: 'textbook-word-1', updatedAt: '2026-10-01T00:00:00.000Z' },
    };
    const newer: SyncQueueItem = {
      id: 'progress-new', type: 'progress', createdAt: serverTime, retries: 0,
      payload: { _id: 'user-1:textbook-word-1', userId: 'user-1', wordId: 'textbook-word-1', updatedAt: serverTime },
    };
    const harness = createHarness({ queue: [older, eventQueue('event-stable'), newer] });

    const result = await harness.coordinator.login('learner@example.test', 'password');

    expect(result.success).toBe(true);
    expect(harness.sync.push.mock.calls[0][1].events.map(event => event._id)).toEqual(['event-stable']);
    expect(harness.sync.push.mock.calls[0][1].progress).toHaveLength(1);
    expect(harness.sync.push.mock.calls[0][1].progress[0].updatedAt).toBe(serverTime);
    expect(harness.userRepo.dequeueSync).toHaveBeenCalledWith(['progress-old', 'event-stable', 'progress-new']);
  });
});
