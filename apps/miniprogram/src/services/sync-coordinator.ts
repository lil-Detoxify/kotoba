import { reactive } from "vue";
import type { Data, ReviewEvent } from "@jp/models";
import type { AuthSession, MiniProgramRepositoryContract } from "../adapters/types";
import type { MiniProgramSyncPushPayload, MiniProgramWorkerClient } from "../adapters/worker-client";
import type { MiniProgramAuthService } from "./auth-service";
import { eventPayload, progressPayload, settingsFromData } from "./sync-outbox";
import { reconcileMiniProgramData, validateSyncPull } from "./sync-reconciliation";

export type SyncPhase = "idle" | "local_hydrating" | "auth_restoring" | "pulling" | "reconciling" | "ready" | "signed_out" | "error";

export interface MiniSyncState {
  phase: SyncPhase;
  isSyncReady: boolean;
  userId?: string;
  email?: string;
  provider?: string;
  activeKey: string;
  generation: number;
  lastSyncedAt?: string;
  error?: string;
}

type SyncClient = Pick<MiniProgramWorkerClient, "pull" | "push">;

class StaleSyncGeneration extends Error {}

export class MiniSyncCoordinator {
  readonly state = reactive<MiniSyncState>({
    phase: "idle",
    isSyncReady: false,
    activeKey: "data_guest",
    generation: 0,
  });
  private session: AuthSession | null = null;
  private initializeTask: Promise<void> | null = null;
  private flushTask: Promise<boolean> | null = null;

  constructor(
    private readonly repository: MiniProgramRepositoryContract,
    private readonly auth: MiniProgramAuthService,
    private readonly client: SyncClient,
  ) {}

  init(): Promise<void> {
    if (this.initializeTask) return this.initializeTask;
    const task = this.initialize(undefined).finally(() => {
      if (this.initializeTask === task) this.initializeTask = null;
    });
    this.initializeTask = task;
    return task;
  }

  activateSession(session: AuthSession): Promise<void> {
    return this.initialize(session);
  }

  private assertCurrent(ticket: number, userId?: string, activeKey?: string): void {
    if (ticket !== this.state.generation || (userId && this.session?.userId !== userId) ||
        (activeKey && this.repository.getActiveKey() !== activeKey)) throw new StaleSyncGeneration();
  }

  private async initialize(provided: AuthSession | undefined): Promise<void> {
    const ticket = ++this.state.generation;
    this.state.isSyncReady = false;
    this.state.error = undefined;
    this.state.userId = undefined;
    this.state.email = undefined;
    this.state.provider = undefined;
    this.state.phase = "local_hydrating";
    this.repository.switchUser(null);
    this.state.activeKey = this.repository.getActiveKey();
    try {
      const guest = await this.repository.read();
      this.assertCurrent(ticket);
      this.state.phase = "auth_restoring";
      const session = provided ?? await this.auth.restore();
      this.assertCurrent(ticket);
      if (!session) {
        this.session = null;
        this.state.phase = "signed_out";
        return;
      }
      this.session = session;
      const candidateGuestQueue = await this.repository.getQueue("data_guest");
      const guestHasLearning = guest.states.length > 0 || guest.logs.length > 0 || !!guest.userSettings ||
        guest.currentBookIdSource === "user" || candidateGuestQueue.length > 0;
      if (!guestHasLearning && this.repository.releaseGuestLearning) await this.repository.releaseGuestLearning(session.userId);
      const guestClaimed = guestHasLearning && this.repository.claimGuestLearning
        ? await this.repository.claimGuestLearning(session.userId)
        : guestHasLearning;
      this.assertCurrent(ticket, session.userId);
      this.repository.switchUser(session.userId);
      const activeKey = this.repository.getActiveKey();
      this.state.activeKey = activeKey;
      this.state.userId = session.userId;
      this.state.email = session.email;
      this.state.provider = session.provider;
      const accountLocal = await this.repository.read(activeKey);
      const local = guestClaimed ? mergeLocalPartitions(accountLocal, guest) : accountLocal;
      const queued = await this.repository.getQueue(activeKey);
      const guestQueue = guestClaimed ? candidateGuestQueue : [];
      this.assertCurrent(ticket, session.userId, activeKey);
      this.state.phase = "pulling";
      const pulled = await this.client.pull(session.token);
      this.assertCurrent(ticket, session.userId, activeKey);
      const validated = validateSyncPull(pulled, session.userId);
      this.state.phase = "reconciling";
      const reconciled = reconcileMiniProgramData(local, validated, [...guestQueue, ...queued]);
      this.assertCurrent(ticket, session.userId, activeKey);
      await this.repository.transact((draft) => replaceData(draft, reconciled), activeKey);
      this.assertCurrent(ticket, session.userId, activeKey);
      if (guestClaimed) {
        await this.repository.transact(clearGuestLearning, "data_guest");
        if (this.repository.clearQueue) await this.repository.clearQueue("data_guest");
        if (this.repository.releaseGuestLearning) await this.repository.releaseGuestLearning(session.userId);
        this.assertCurrent(ticket, session.userId, activeKey);
      }
      await this.repository.read(activeKey);
      this.assertCurrent(ticket, session.userId, activeKey);
      this.state.lastSyncedAt = validated.serverTime;
      this.state.isSyncReady = true;
      this.state.phase = "ready";
    } catch (error) {
      if (error instanceof StaleSyncGeneration) return;
      if (ticket === this.state.generation) {
        this.state.isSyncReady = false;
        this.state.phase = "error";
        this.state.error = error instanceof Error ? error.message : "同步初始化失败";
      }
    }
  }

  flush(_reason: "manual" | "timer" | "onShow" | "onHide" = "manual"): Promise<boolean> {
    if (!this.state.isSyncReady || this.state.phase !== "ready" || !this.session) return Promise.resolve(false);
    if (this.flushTask) return this.flushTask;
    const task = this.performFlush().finally(() => {
      if (this.flushTask === task) this.flushTask = null;
    });
    this.flushTask = task;
    return task;
  }

  private async performFlush(): Promise<boolean> {
    const ticket = this.state.generation;
    const session = this.session!;
    const activeKey = this.repository.getActiveKey();
    try {
      const queue = await this.repository.getQueue();
      const data = await this.repository.read(activeKey);
      this.assertCurrent(ticket, session.userId, activeKey);
      const payload = buildPushPayload(data, session.userId);
      if (payload.events.length === 0 && payload.progress.length === 0 && !payload.settings && queue.length === 0) return true;
      const response = await this.client.push(session.token, payload);
      this.assertCurrent(ticket, session.userId, activeKey);
      if (this.repository.dequeueConfirmed) await this.repository.dequeueConfirmed(queue as any, activeKey);
      else await this.repository.dequeue(queue.map((item) => item.id));
      this.assertCurrent(ticket, session.userId, activeKey);
      this.state.lastSyncedAt = response.serverTime;
      this.state.error = undefined;
      return true;
    } catch (error) {
      if (error instanceof StaleSyncGeneration) return false;
      if (ticket === this.state.generation) {
        this.state.isSyncReady = false;
        this.state.phase = "error";
        this.state.error = error instanceof Error ? error.message : "同步上传失败";
      }
      return false;
    }
  }

  signOutToGuest(): void {
    ++this.state.generation;
    this.session = null;
    this.repository.switchUser(null);
    this.state.phase = "signed_out";
    this.state.isSyncReady = false;
    this.state.userId = undefined;
    this.state.email = undefined;
    this.state.provider = undefined;
    this.state.activeKey = this.repository.getActiveKey();
    this.state.error = undefined;
  }
}

function replaceData(target: Data, source: Data): void {
  for (const key of Object.keys(target) as Array<keyof Data>) delete (target as any)[key];
  Object.assign(target, source);
}

function clearGuestLearning(data: Data): void {
  data.states = [];
  data.logs = [];
  delete data.userSettings;
  delete data.currentBookId;
  delete data.currentBookIdUpdatedAt;
  delete data.currentBookIdSource;
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const values = new Map<string, T>();
  for (const item of secondary) values.set(item.id, item);
  for (const item of primary) values.set(item.id, item);
  return [...values.values()];
}

/** Account-local fields win metadata ties; reconciliation resolves state/log conflicts. */
export function mergeLocalPartitions(account: Data, guest: Data): Data {
  const accountHasBookChoice = account.currentBookIdSource === "user";
  return {
    ...guest,
    ...account,
    books: mergeById(account.books, guest.books),
    lessons: mergeById(account.lessons, guest.lessons),
    words: mergeById(account.words, guest.words),
    states: [...guest.states, ...account.states],
    logs: mergeById(account.logs, guest.logs),
    currentBookId: accountHasBookChoice ? account.currentBookId : account.currentBookId ?? guest.currentBookId,
    currentBookIdSource: accountHasBookChoice ? "user" : account.currentBookIdSource ?? guest.currentBookIdSource,
    currentBookIdUpdatedAt: accountHasBookChoice ? account.currentBookIdUpdatedAt : account.currentBookIdUpdatedAt ?? guest.currentBookIdUpdatedAt,
    seeded: account.seeded || guest.seeded,
    userSettings: account.userSettings ?? guest.userSettings,
  };
}

export function buildPushPayload(data: Data, userId: string): MiniProgramSyncPushPayload {
  const events: ReviewEvent[] = data.logs.map((log) => ({ ...eventPayload(log), userId }));
  const progress = data.states.map((state) => ({ ...progressPayload({ ...state, userId }), userId, version: 1 })) as MiniProgramSyncPushPayload["progress"];
  const settings = settingsFromData(data, userId);
  return { events, progress, ...(settings ? { settings } : {}) };
}
