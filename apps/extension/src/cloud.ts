import type { AuthUser, CheckAccountResult, SyncClient, SyncPushResult } from '@jp/sync';
import type { CloudProgressDoc, ReviewEvent, SyncQueueItem, UserSettings } from '@jp/models';
import type { ExtensionSnapshot, ExtensionWord } from './model';
import {
  ExtensionAuthHttpClient,
  type ExtensionAuthSession,
  type SendCodeResult,
} from './cloud-client';

export type ExtensionPartitionKey = 'current' | `account:${string}`;
export type CloudPhase = 'signed_out' | 'restoring' | 'pulling' | 'pushing' | 'ready' | 'error';

export interface SafeAuthUser {
  id: string;
  email?: string;
  provider: string;
}

export interface CloudAuthStatus {
  user: SafeAuthUser | null;
  activePartitionKey: string;
  phase: CloudPhase;
  ready: boolean;
  lastSyncedAt?: string;
  error?: string;
}

export interface CloudOperationResult {
  success: boolean;
  authenticated: boolean;
  user: SafeAuthUser | null;
  ready: boolean;
  error?: string;
  phase: CloudPhase;
  mergedGuest?: boolean;
  pushedEvents?: number;
  pushedProgress?: number;
}

export interface AccountSyncRepository {
  readonly partitionKey: string;
  read(): Promise<ExtensionSnapshot>;
  getSyncQueue(): Promise<SyncQueueItem[]>;
  dequeueSync(ids: string[]): Promise<unknown>;
  mergeCloud(pulled: unknown, expectedUserId: string, catalogWords?: ExtensionWord[]): Promise<ExtensionSnapshot>;
  mergeGuest(expectedUserId: string, catalogWords?: ExtensionWord[]): Promise<ExtensionSnapshot>;
  clearGuestAfterMerge(expectedUserId: string): Promise<void>;
}

export interface ExtensionCloudCoordinatorOptions {
  auth: ExtensionAuthHttpClient;
  sync: SyncClient;
  getActiveRepository(): AccountSyncRepository;
  getRepository(partitionKey: ExtensionPartitionKey): AccountSyncRepository;
  activatePartition(partitionKey: ExtensionPartitionKey): Promise<void> | void;
  loadCatalog?(): Promise<ExtensionWord[]>;
}

export interface ExtensionSyncOptions {
  expectedPartitionKey: string;
  /** Set only from the explicit guest-merge action in AccountPanel. */
  mergeGuest?: boolean;
}

class StaleCloudOperation extends Error {
  constructor() { super('账号已切换，此次同步已取消。'); }
}

class SyncStageError extends Error {
  constructor(readonly stage: 'pull' | 'merge' | 'push', message: string) { super(message); }
}

function accountPartition(userId: string): ExtensionPartitionKey {
  if (!userId || userId.length > 200 || /[\u0000-\u001f\u007f]/.test(userId)) throw new Error('账号标识无效。');
  return `account:${userId}`;
}

function safeUser(user: AuthUser | null | undefined): SafeAuthUser | null {
  if (!user) return null;
  return { id: user.id, ...(user.email ? { email: user.email } : {}), provider: user.provider };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unauthorized(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:\b401\b|unauthori[sz]ed|token.{0,30}(?:expired|invalid)|(?:expired|invalid).{0,30}token|令牌.{0,12}(?:无效|过期)|(?:无效|过期).{0,12}令牌)/i.test(message);
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NEGATIVE_INFINITY;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : Number.NEGATIVE_INFINITY;
}

interface PushBatch {
  payload: { events: ReviewEvent[]; progress: CloudProgressDoc[]; settings?: UserSettings };
  queueIds: string[];
}

function makePushBatch(queue: SyncQueueItem[], userId: string): PushBatch {
  const events = new Map<string, ReviewEvent>();
  const progress = new Map<string, { item: SyncQueueItem; payload: CloudProgressDoc; order: number }>();
  const settings = new Map<string, { item: SyncQueueItem; payload: UserSettings; order: number }>();
  queue.forEach((item, order) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || !isRecord(item.payload)) {
      throw new SyncStageError('push', '本地同步队列格式不正确，队列已保留。');
    }
    if (item.type === 'review_event') {
      const value = item.payload;
      if (typeof value._id !== 'string' || !value._id || value.userId !== userId || typeof value.wordId !== 'string') {
        throw new SyncStageError('push', '复习记录的账号信息不一致，队列已保留。');
      }
      const previous = events.get(value._id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(value)) {
        throw new SyncStageError('push', '复习记录编号冲突，队列已保留。');
      }
      events.set(value._id, value as unknown as ReviewEvent);
      return;
    }
    if (item.type === 'progress') {
      const value = item.payload;
      if (typeof value.wordId !== 'string' || value.userId !== userId || typeof value._id !== 'string' || !value._id) {
        throw new SyncStageError('push', '学习进度的账号信息不一致，队列已保留。');
      }
      const prior = progress.get(value.wordId);
      const next = { item, payload: value as unknown as CloudProgressDoc, order };
      if (!prior || timestamp(value.updatedAt) > timestamp(prior.payload.updatedAt) ||
          (timestamp(value.updatedAt) === timestamp(prior.payload.updatedAt) && order > prior.order)) {
        progress.set(value.wordId, next);
      }
      return;
    }
    if (item.type === 'settings') {
      const value = item.payload;
      if (value.userId !== userId || typeof value.updatedAt !== 'string') {
        throw new SyncStageError('push', '账号设置的用户信息不一致，队列已保留。');
      }
      const prior = settings.get(userId);
      const next = { item, payload: value as unknown as UserSettings, order };
      if (!prior || timestamp(value.updatedAt) > timestamp(prior.payload.updatedAt) ||
          (timestamp(value.updatedAt) === timestamp(prior.payload.updatedAt) && order > prior.order)) {
        settings.set(userId, next);
      }
      return;
    }
    throw new SyncStageError('push', '本地同步队列包含不支持的项目，队列已保留。');
  });

  const includedQueueIds = queue.map(item => item.id);
  return {
    payload: {
      events: [...events.values()],
      progress: [...progress.values()].map(value => value.payload),
      ...(settings.size ? { settings: [...settings.values()][0].payload } : {}),
    },
    queueIds: includedQueueIds,
  };
}

/** Coordinates auth, fixed account partitions, validated pull-before-push, and durable outbox retry. */
export class ExtensionCloudCoordinator {
  private generation = 0;
  private restorePromise: Promise<CloudAuthStatus> | undefined;
  private readonly syncTails = new Map<string, Promise<void>>();
  private authTransitionTail: Promise<void> = Promise.resolve();
  private status: CloudAuthStatus = { user: null, activePartitionKey: 'current', phase: 'restoring', ready: false };

  constructor(private readonly options: ExtensionCloudCoordinatorOptions) {}

  restore(): Promise<CloudAuthStatus> {
    if (this.restorePromise) return this.restorePromise;
    this.restorePromise = this.restoreOnce();
    return this.restorePromise;
  }

  private async restoreOnce(): Promise<CloudAuthStatus> {
    const ticket = ++this.generation;
    this.status = { ...this.status, phase: 'restoring', ready: false, error: undefined };
    try {
      const session = await this.options.auth.getSession();
      if (ticket !== this.generation) return this.currentStatus();
      if (!session) {
        await this.options.activatePartition('current');
        this.status = { user: null, activePartitionKey: 'current', phase: 'signed_out', ready: false };
        return this.currentStatus();
      }
      const key = accountPartition(session.user.id);
      await this.options.activatePartition(key);
      if (ticket !== this.generation) return this.currentStatus();
      this.status = { user: safeUser(session.user), activePartitionKey: key, phase: 'pulling', ready: false };
      void this.serializeSync(ticket, key, () => this.performSync(ticket, session, { expectedPartitionKey: key })).catch(() => undefined);
      return this.currentStatus();
    } catch (error) {
      if (ticket === this.generation) this.fail(error, false);
      return this.currentStatus();
    }
  }

  async authStatus(): Promise<CloudAuthStatus> {
    await this.restore();
    const session = await this.options.auth.getSession();
    const active = this.options.getActiveRepository().partitionKey;
    const user = safeUser(session?.user);
    if (active !== this.status.activePartitionKey || user?.id !== this.status.user?.id) {
      return { ...this.currentStatus(), user, activePartitionKey: active, ready: false, phase: 'error', error: '账号正在切换，请重新载入。' };
    }
    return this.currentStatus();
  }

  checkAccount(email: string): Promise<CheckAccountResult> {
    return this.options.auth.checkAccount(email);
  }

  sendCode(email: string): Promise<SendCodeResult> {
    return this.options.auth.sendEmailCode(email);
  }

  async login(email: string, password: string): Promise<CloudOperationResult> {
    await this.restore();
    const ticket = ++this.generation;
    const previousStatus = this.currentStatus();
    this.status = { ...this.status, phase: 'restoring', ready: false, error: undefined };
    let candidate;
    try { candidate = await this.options.auth.loginCandidate(email, password); }
    catch { candidate = { success: false, error: '登录请求失败，请重试。' }; }
    if (ticket !== this.generation) return this.operationResult(false, false, '此次登录已被更新操作取消。');
    if (!candidate.success || !candidate.session) {
      if (ticket === this.generation) this.status = previousStatus;
      return this.operationResult(false, false, candidate.error ?? '登录失败。');
    }
    return this.activateAndSync(ticket, candidate.session);
  }

  async register(
    email: string,
    password: string,
    code: string,
    verificationId: string | undefined,
    flow: 'register' | 'legacy_upgrade' = 'register',
  ): Promise<CloudOperationResult> {
    await this.restore();
    const ticket = ++this.generation;
    const previousStatus = this.currentStatus();
    this.status = { ...this.status, phase: 'restoring', ready: false, error: undefined };
    if (!verificationId) {
      if (ticket === this.generation) this.status = previousStatus;
      return this.operationResult(false, false, '请先获取验证码。');
    }
    let candidate;
    try { candidate = await this.options.auth.registerCandidate(email, password, code, verificationId, flow); }
    catch { candidate = { success: false, error: '注册请求失败，请重试。' }; }
    if (ticket !== this.generation) return this.operationResult(false, false, '此次注册已被更新操作取消。');
    if (!candidate.success || !candidate.session) {
      if (ticket === this.generation) this.status = previousStatus;
      return this.operationResult(false, false, candidate.error ?? '注册失败。');
    }
    return this.activateAndSync(ticket, candidate.session);
  }

  private async activateAndSync(ticket: number, session: ExtensionAuthSession): Promise<CloudOperationResult> {
    const key = accountPartition(session.user.id);
    try {
      const activated = await this.serializeAuthTransition(async () => {
        if (ticket !== this.generation) return false;
        const previousSession = await this.options.auth.getSession();
        const previousKey = this.options.getActiveRepository().partitionKey as ExtensionPartitionKey;
        await this.options.auth.saveSession(session);
        if (ticket !== this.generation) {
          if (previousSession) await this.options.auth.saveSession(previousSession);
          else await this.options.auth.clearSession();
          return false;
        }
        await this.options.activatePartition(key);
        if (ticket !== this.generation) {
          if (previousSession) await this.options.auth.saveSession(previousSession);
          else await this.options.auth.clearSession();
          await this.options.activatePartition(previousKey);
          return false;
        }
        this.status = { user: safeUser(session.user), activePartitionKey: key, phase: 'pulling', ready: false };
        return true;
      });
      if (!activated) return this.operationResult(false, false, '账号已切换，此次登录已取消。');
      this.status = { user: safeUser(session.user), activePartitionKey: key, phase: 'pulling', ready: false };
      return await this.serializeSync(ticket, key, () => this.performSync(ticket, session, { expectedPartitionKey: key }));
    } catch (error) {
      if (ticket === this.generation) this.fail(error, false);
      return this.operationResult(false, true, error instanceof Error ? error.message : '账号初始化失败。');
    }
  }

  async logout(): Promise<CloudAuthStatus> {
    await this.restore();
    const ticket = ++this.generation;
    const session = await this.options.auth.getSession();
    if (ticket !== this.generation) return this.currentStatus();
    void this.options.auth.logoutRemote(session).catch(() => undefined);
    await this.serializeAuthTransition(async () => {
      if (ticket !== this.generation) return;
      await this.options.auth.clearSession();
      if (ticket !== this.generation) return;
      await this.options.activatePartition('current');
      if (ticket !== this.generation) return;
      this.status = { user: null, activePartitionKey: 'current', phase: 'signed_out', ready: false };
    });
    return this.currentStatus();
  }

  async sync(syncOptions: ExtensionSyncOptions): Promise<CloudOperationResult> {
    await this.restore();
    const ticket = this.generation;
    const session = await this.options.auth.getSession();
    if (!session) return this.operationResult(false, false, '请先登录 KotoBud 账号。');
    const key = accountPartition(session.user.id);
    return this.serializeSync(ticket, key, async () => {
      const session = await this.options.auth.getSession();
      if (!session) return this.operationResult(false, false, '请先登录 KotoBud 账号。');
      if (syncOptions.expectedPartitionKey !== accountPartition(session.user.id)) {
        return this.operationResult(false, true, '账号已切换，请刷新后重试。');
      }
      return this.performSync(ticket, session, syncOptions);
    });
  }

  private serializeSync<T>(ticket: number, partitionKey: string, operation: () => Promise<T>): Promise<T> {
    const slot = `${partitionKey}@${ticket}`;
    const previous = this.syncTails.get(slot) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(() => undefined, () => undefined);
    this.syncTails.set(slot, settled);
    void settled.then(() => {
      if (this.syncTails.get(slot) === settled) this.syncTails.delete(slot);
    });
    return result;
  }

  private serializeAuthTransition<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.authTransitionTail.then(operation, operation);
    this.authTransitionTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async performSync(
    ticket: number,
    initialSession: ExtensionAuthSession,
    syncOptions: ExtensionSyncOptions,
  ): Promise<CloudOperationResult> {
    let session = initialSession;
    let pullMerged = false;
    const expectedKey = accountPartition(session.user.id);
    if (syncOptions.expectedPartitionKey !== expectedKey) {
      return this.operationResult(false, true, '账号已切换，请刷新后重试。');
    }
    this.status = { ...this.status, user: safeUser(session.user), activePartitionKey: expectedKey, phase: 'pulling', ready: false, error: undefined };
    try {
      const repository = this.options.getActiveRepository();
      this.assertRepository(repository, expectedKey);
      await this.assertCurrent(ticket, session.user.id, expectedKey);
      const pull = await this.syncRequest(ticket, session, expectedKey, token => this.options.sync.pull(token));
      session = pull.session;
      this.assertPullIdentity(pull.value, session.user.id);
      const serverTime = isRecord(pull.value) && typeof pull.value.serverTime === 'string' && Number.isFinite(Date.parse(pull.value.serverTime))
        ? pull.value.serverTime
        : new Date().toISOString();
      await this.assertCurrent(ticket, session.user.id, expectedKey);
      let catalog: ExtensionWord[] | undefined;
      try { catalog = await this.options.loadCatalog?.(); }
      catch { catalog = undefined; }
      await this.assertCurrent(ticket, session.user.id, expectedKey);
      await repository.mergeCloud(pull.value, session.user.id, catalog);
      await this.assertCurrent(ticket, session.user.id, expectedKey);
      pullMerged = true;
      this.status = { ...this.status, phase: 'ready', ready: true, lastSyncedAt: serverTime, error: undefined };

      if (syncOptions.mergeGuest === true) {
        await repository.mergeGuest(session.user.id, catalog);
        await this.assertCurrent(ticket, session.user.id, expectedKey);
      }

      const queue = await repository.getSyncQueue();
      await this.assertCurrent(ticket, session.user.id, expectedKey);
      const batch = makePushBatch(queue, session.user.id);
      const hasChanges = batch.payload.events.length > 0 || batch.payload.progress.length > 0 || !!batch.payload.settings;
      if (hasChanges) {
        this.status = { ...this.status, phase: 'pushing', ready: true };
        await this.assertCurrent(ticket, session.user.id, expectedKey);
        const pushed = await this.syncRequest(ticket, session, expectedKey, token => this.options.sync.push(token, batch.payload));
        session = pushed.session;
        const response = pushed.value as SyncPushResult;
        if (!response || response.success !== true) throw new SyncStageError('push', '云端未确认全部同步数据，本地队列已保留，可稍后重试。');
        await this.assertCurrent(ticket, session.user.id, expectedKey);
        await repository.dequeueSync(batch.queueIds);
        await this.assertCurrent(ticket, session.user.id, expectedKey);
      }

      if (syncOptions.mergeGuest === true) {
        await this.assertCurrent(ticket, session.user.id, expectedKey);
        const guest = this.options.getRepository('current');
        this.assertRepository(guest, 'current');
        await guest.clearGuestAfterMerge(session.user.id);
      }
      this.status = { ...this.status, phase: 'ready', ready: true, lastSyncedAt: serverTime, error: undefined };
      return this.operationResult(true, true, undefined, {
        mergedGuest: syncOptions.mergeGuest === true,
        pushedEvents: batch.payload.events.length,
        pushedProgress: batch.payload.progress.length,
      });
    } catch (error) {
      if (error instanceof StaleCloudOperation) return this.operationResult(false, true, error.message);
      if (ticket === this.generation) {
        const ready = pullMerged && !(error instanceof SyncStageError && error.stage !== 'push');
        this.fail(error, ready);
      }
      return this.operationResult(false, true, error instanceof Error ? error.message : '同步失败，请重试。');
    }
  }

  private async syncRequest<T>(
    ticket: number,
    current: ExtensionAuthSession,
    partitionKey: string,
    request: (token: string) => Promise<T>,
  ): Promise<{ value: T; session: ExtensionAuthSession }> {
    try {
      const value = await request(current.token);
      await this.assertCurrent(ticket, current.user.id, partitionKey);
      return { value, session: current };
    } catch (error) {
      if (!unauthorized(error)) throw error;
      await this.assertCurrent(ticket, current.user.id, partitionKey);
      const refresh = await this.options.auth.refreshCandidate(current);
      if (!refresh.success || !refresh.session) throw new Error(refresh.error ?? '登录状态已过期，请重新登录。');
      const committed = await this.serializeAuthTransition(async () => {
        await this.assertCurrent(ticket, current.user.id, partitionKey);
        const previous = await this.options.auth.getSession();
        if (ticket !== this.generation) throw new StaleCloudOperation();
        await this.options.auth.saveSession(refresh.session!);
        if (ticket !== this.generation) {
          if (previous) await this.options.auth.saveSession(previous);
          else await this.options.auth.clearSession();
          throw new StaleCloudOperation();
        }
        return true;
      });
      if (!committed) throw new StaleCloudOperation();
      await this.assertCurrent(ticket, current.user.id, partitionKey);
      const value = await request(refresh.session.token);
      await this.assertCurrent(ticket, current.user.id, partitionKey);
      return { value, session: refresh.session };
    }
  }

  private assertPullIdentity(pulled: unknown, expectedUserId: string): void {
    if (!isRecord(pulled) || pulled.userId !== expectedUserId) {
      throw new SyncStageError('pull', '云端返回了其他账号的数据，同步已停止。');
    }
  }

  private assertRepository(repository: AccountSyncRepository, expectedKey: string): void {
    if (repository.partitionKey !== expectedKey) throw new StaleCloudOperation();
  }

  private async assertCurrent(ticket: number, userId: string, partitionKey: string): Promise<void> {
    if (ticket !== this.generation) throw new StaleCloudOperation();
    this.assertRepository(this.options.getActiveRepository(), partitionKey);
    const current = await this.options.auth.getSession();
    if (ticket !== this.generation || current?.user.id !== userId) throw new StaleCloudOperation();
    this.assertRepository(this.options.getActiveRepository(), partitionKey);
  }

  private fail(error: unknown, ready: boolean): void {
    this.status = {
      ...this.status,
      phase: 'error',
      ready,
      error: error instanceof Error ? error.message : '同步失败，请重试。',
    };
  }

  private currentStatus(): CloudAuthStatus {
    return { ...this.status, user: this.status.user ? { ...this.status.user } : null };
  }

  private operationResult(
    success: boolean,
    authenticated: boolean,
    error?: string,
    counts?: Pick<CloudOperationResult, 'mergedGuest' | 'pushedEvents' | 'pushedProgress'>,
  ): CloudOperationResult {
    return {
      success,
      authenticated,
      user: this.status.user ? { ...this.status.user } : null,
      ready: this.status.ready,
      phase: this.status.phase,
      ...(error ? { error } : this.status.error ? { error: this.status.error } : {}),
      ...counts,
    };
  }
}
