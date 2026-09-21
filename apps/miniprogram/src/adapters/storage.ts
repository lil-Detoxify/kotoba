import type { Data, SyncQueueItem, WordState } from "@jp/models";
import { emptyData } from "@jp/models";
import type { StorageAdapter, MiniProgramRepositoryContract } from "./types";
export type { StorageAdapter, MiniProgramRepositoryContract };

export class UniStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    if (typeof uni === "undefined" || !uni.getStorageSync) throw new Error("Storage unavailable");
    const val = uni.getStorageSync(key);
    return val === "" || val == null ? null : String(val);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (typeof uni === "undefined" || !uni.setStorageSync) throw new Error("Storage unavailable");
    uni.setStorageSync(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (typeof uni === "undefined" || !uni.removeStorageSync) throw new Error("Storage unavailable");
    uni.removeStorageSync(key);
  }
}

export class MiniProgramRepository implements MiniProgramRepositoryContract {
  private activeKey = "data_guest";
  private storage: StorageAdapter;
  private queueKey = "sync_queue";
  private pendingWrite: Promise<unknown> = Promise.resolve();

  constructor(storage?: StorageAdapter) {
    this.storage = storage || new UniStorageAdapter();
  }

  getActiveKey(): string {
    return this.activeKey;
  }

  switchUser(userId: string | null): void {
    if (userId && userId.trim().length > 0) {
      this.activeKey = `data_user_${userId.trim()}`;
    } else {
      this.activeKey = "data_guest";
    }
  }

  async read(key = this.activeKey): Promise<Data> {
    const raw = await this.storage.getItem(key);
    if (raw === null) return emptyData();
    const data = JSON.parse(raw) as Data;
    if (!data || ![data.books, data.lessons, data.words, data.states, data.logs].every(Array.isArray)) {
      throw new Error("Invalid learning data; preserved for recovery");
    }
    // JSON snapshots lose Date instances; restore the FSRS Card contract at this boundary.
    const restoreCard = (state: WordState) => {
      if (!state?.card) throw new Error("Invalid study card; preserved for recovery");
      state.card.due = new Date(state.card.due);
      if (!Number.isFinite(state.card.due.getTime())) throw new Error("Invalid card date");
      if (state.card.last_review != null) {
        state.card.last_review = new Date(state.card.last_review);
        if (!Number.isFinite(state.card.last_review.getTime())) throw new Error("Invalid review date");
      }
    };
    data.states.forEach(restoreCard);
    data.logs.forEach((log) => {
      restoreCard(log.previousState);
      restoreCard(log.newState);
    });
    return data;
  }

  async transact(change: (data: Data) => void, key = this.activeKey): Promise<Data> {
    const operation = this.pendingWrite.then(async () => {
      const current = await this.read(key);
      change(current);
      await this.storage.setItem(key, JSON.stringify(current));
      return current;
    });
    // A failed write must not poison later retries. Capture the partition before waiting.
    this.pendingWrite = operation.catch(() => undefined);
    return operation;
  }

  async getQueue(): Promise<SyncQueueItem[]> {
    try {
      const raw = await this.storage.getItem(this.queueKey);
      if (!raw) return [];
      return JSON.parse(raw) as SyncQueueItem[];
    } catch {
      return [];
    }
  }

  async enqueue(items: SyncQueueItem[]): Promise<void> {
    const queue = await this.getQueue();
    queue.push(...items);
    await this.storage.setItem(this.queueKey, JSON.stringify(queue));
  }

  async dequeue(itemIds: string[]): Promise<void> {
    const idSet = new Set(itemIds);
    const queue = await this.getQueue();
    const remaining = queue.filter(item => !idSet.has(item.id));
    await this.storage.setItem(this.queueKey, JSON.stringify(remaining));
  }
}
