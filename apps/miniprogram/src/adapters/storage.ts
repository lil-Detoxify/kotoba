import type { Data, SyncQueueItem } from "@jp/models";
import { emptyData } from "@jp/models";
import type { StorageAdapter, MiniProgramRepositoryContract } from "./types";
export type { StorageAdapter, MiniProgramRepositoryContract };

export class UniStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    try {
      // @ts-ignore uni is global in uni-app
      if (typeof uni !== "undefined" && uni.getStorageSync) {
        const val = uni.getStorageSync(key);
        return val ? String(val) : null;
      }
    } catch {}
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      // @ts-ignore uni is global in uni-app
      if (typeof uni !== "undefined" && uni.setStorageSync) {
        uni.setStorageSync(key, value);
      }
    } catch (e) {
      console.error("[UniStorageAdapter] setItem error:", e);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      // @ts-ignore uni is global in uni-app
      if (typeof uni !== "undefined" && uni.removeStorageSync) {
        uni.removeStorageSync(key);
      }
    } catch {}
  }
}

export class WebStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  }

  async removeItem(key: string): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  }
}

export class MiniProgramRepository implements MiniProgramRepositoryContract {
  private activeKey = "data_guest";
  private storage: StorageAdapter;
  private queueKey = "sync_queue";

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
    try {
      const raw = await this.storage.getItem(key);
      if (!raw) return emptyData();
      return JSON.parse(raw) as Data;
    } catch (err) {
      console.warn("[MiniProgramRepository] read error, returning emptyData:", err);
      return emptyData();
    }
  }

  async transact(change: (data: Data) => void, key = this.activeKey): Promise<Data> {
    const current = await this.read(key);
    change(current);
    await this.storage.setItem(key, JSON.stringify(current));
    return current;
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
