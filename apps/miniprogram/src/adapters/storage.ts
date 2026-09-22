import type { Data, SyncQueueItem, WordState } from "@jp/models";
import { emptyData } from "@jp/models";
import type { StorageAdapter, MiniProgramRepositoryContract } from "./types";
import { filePointerKey, isFileStorageKey, UniFileStorage } from "./file-storage";
import type { FileStorageDriver, FileStoragePointerStore } from "./file-storage";
export type { StorageAdapter, MiniProgramRepositoryContract };

/** Queue metadata is intentionally kept at the mini-program boundary. The
 * shared model remains backward compatible with Web/Windows queue records. */
export interface MiniProgramQueueItem extends SyncQueueItem {
  owner: string;
  identity: string;
}

type QueueItemInput = SyncQueueItem & { owner?: unknown; identity?: unknown };
export type QueueAcknowledgement = Pick<MiniProgramQueueItem, "id" | "owner" | "identity">;

export class UniStorageAdapter implements StorageAdapter {
  private fileStorage?: UniFileStorage;
  private fileStorageResolved = false;

  constructor(fileStorage?: UniFileStorage | { driver: FileStorageDriver; pointerStore: FileStoragePointerStore; userDataPath: string }) {
    this.fileStorage = fileStorage instanceof UniFileStorage
      ? fileStorage
      : fileStorage
        ? new UniFileStorage(fileStorage.driver, fileStorage.pointerStore, fileStorage.userDataPath)
        : undefined;
    this.fileStorageResolved = !!fileStorage;
  }

  async getItem(key: string): Promise<string | null> {
    if (typeof uni === "undefined" || !uni.getStorageSync) throw new Error("Storage unavailable");
    const val = uni.getStorageSync(key);
    const inline = val === "" || val == null ? null : String(val);
    if (isFileStorageKey(key)) {
      const fileStorage = this.getFileStorage();
      const pointer = typeof uni.getStorageSync === "function" ? uni.getStorageSync(filePointerKey(key)) : "";
      if (pointer && !fileStorage) throw new Error("File storage unavailable");
      if (fileStorage) return fileStorage.getItem(key, inline);
    }
    return inline;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (typeof uni === "undefined" || !uni.setStorageSync) throw new Error("Storage unavailable");
    if (isFileStorageKey(key)) {
      const fileStorage = this.getFileStorage();
      const pointer = typeof uni.getStorageSync === "function" ? uni.getStorageSync(filePointerKey(key)) : "";
      if (pointer && !fileStorage) throw new Error("File storage unavailable");
      if (fileStorage) {
        await fileStorage.setItem(key, value);
        return;
      }
    }
    uni.setStorageSync(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (typeof uni === "undefined" || !uni.removeStorageSync) throw new Error("Storage unavailable");
    if (isFileStorageKey(key)) {
      // Remove the legacy inline copy first. Once a file pointer exists it is
      // the authoritative snapshot; retaining inline data could resurrect a
      // deleted learning partition if file cleanup fails.
      uni.removeStorageSync(key);
      const fileStorage = this.getFileStorage();
      const pointer = typeof uni.getStorageSync === "function" ? uni.getStorageSync(filePointerKey(key)) : "";
      if (pointer && !fileStorage) throw new Error("File storage unavailable");
      if (fileStorage) await fileStorage.removeItem(key);
      return;
    }
    uni.removeStorageSync(key);
  }

  private getFileStorage(): UniFileStorage | undefined {
    if (!this.fileStorageResolved) {
      this.fileStorage = UniFileStorage.fromUni();
      this.fileStorageResolved = true;
    }
    return this.fileStorage;
  }
}

export class MiniProgramRepository implements MiniProgramRepositoryContract {
  private activeKey = "data_guest";
  private storage: StorageAdapter;
  private queueKey = "sync_queue";
  private queueMigrationKey = "sync_queue.migrated.v1";
  private guestLearningOwnerKey = "guest_learning_owner.v1";
  private pendingWrite: Promise<unknown> = Promise.resolve();
  private pendingQueueWrite: Promise<unknown> = Promise.resolve();
  private pendingGuestClaim: Promise<unknown> = Promise.resolve();

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

  private queueStorageKey(owner = this.activeKey): string {
    return `${this.queueKey}:${owner}`;
  }

  private queueIdentity(owner = this.activeKey): string {
    return owner === "data_guest" ? "guest" : owner.startsWith("data_user_") ? owner.slice("data_user_".length) : owner;
  }

  private queueError(owner: string, detail = "invalid format"): Error {
    return new Error(`Invalid persisted sync queue for ${owner}: ${detail}`);
  }

  private stableQueueId(item: QueueItemInput, owner: string): string {
    const supplied = typeof item.id === "string" ? item.id.trim() : "";
    if (supplied) return supplied;
    const source = JSON.stringify({
      owner,
      type: item.type,
      payload: item.payload,
      createdAt: item.createdAt,
    });
    let hash = 2166136261;
    for (const character of source) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `queue_${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  private ownerForIdentity(identity: string): string | undefined {
    if (identity === "guest") return "data_guest";
    if (/^[^\s:]+$/.test(identity)) return `data_user_${identity}`;
    return undefined;
  }

  private normalizeQueueItem(raw: unknown, owner: string, index = 0): MiniProgramQueueItem {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw this.queueError(owner, `item ${index} is not an object`);
    const item = raw as QueueItemInput;
    if (item.type !== "progress" && item.type !== "review_event" && item.type !== "settings") throw this.queueError(owner, `item ${index} has invalid type`);
    if (typeof item.createdAt !== "string" || !item.createdAt.trim()) throw this.queueError(owner, `item ${index} has no createdAt`);
    if (typeof item.retries !== "number" || !Number.isInteger(item.retries) || item.retries < 0) throw this.queueError(owner, `item ${index} has invalid retries`);
    const itemOwner = item.owner === undefined ? owner : item.owner;
    const itemIdentity = item.identity === undefined ? this.queueIdentity(owner) : item.identity;
    if (itemOwner !== owner || typeof itemOwner !== "string") throw this.queueError(owner, `item ${index} belongs to another owner`);
    if (typeof itemIdentity !== "string" || this.ownerForIdentity(itemIdentity) !== owner) throw this.queueError(owner, `item ${index} has a mismatched identity`);
    return {
      id: this.stableQueueId(item, owner),
      type: item.type as SyncQueueItem["type"],
      payload: item.payload,
      createdAt: item.createdAt,
      retries: item.retries,
      owner,
      identity: itemIdentity,
    };
  }

  private async readQueue(owner = this.activeKey): Promise<MiniProgramQueueItem[]> {
    const raw = await this.storage.getItem(this.queueStorageKey(owner));
    if (raw === null || raw === "") return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw this.queueError(owner, "JSON parse failed");
    }
    if (!Array.isArray(parsed)) throw this.queueError(owner, "root must be an array");
    return parsed.map((item, index) => this.normalizeQueueItem(item, owner, index));
  }

  private async migrateLegacyQueue(): Promise<void> {
    if (await this.storage.getItem(this.queueMigrationKey)) return;
    const raw = await this.storage.getItem(this.queueKey);
    if (raw === null || raw === "") {
      await this.storage.setItem(this.queueMigrationKey, "1");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw this.queueError("legacy", "JSON parse failed");
    }
    if (!Array.isArray(parsed)) throw this.queueError("legacy", "root must be an array");

    const partitions = new Map<string, MiniProgramQueueItem[]>();
    for (let index = 0; index < parsed.length; index += 1) {
      const rawItem = parsed[index];
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) throw this.queueError("legacy", `item ${index} is not an object`);
      const item = rawItem as QueueItemInput;
      let owner: string | undefined;
      if (typeof item.owner === "string") {
        if (item.owner === "data_guest") owner = item.owner;
        else if (item.owner.startsWith("data_user_")) {
          const identity = item.owner.slice("data_user_".length);
          owner = this.ownerForIdentity(identity);
        }
      } else if (typeof item.identity === "string") {
        owner = this.ownerForIdentity(item.identity);
      } else {
        // The old global queue had no identity. Its only safe destination is
        // the guest partition; never guess an account from an old record.
        owner = "data_guest";
      }
      if (!owner) continue; // quarantine unknown identity instead of leaking it.
      const normalized = this.normalizeQueueItem({ ...item, owner, identity: this.queueIdentity(owner) }, owner, index);
      const queue = partitions.get(owner) ?? [];
      if (!queue.some((existing) => existing.id === normalized.id)) queue.push(normalized);
      partitions.set(owner, queue);
    }
    for (const [owner, queue] of partitions) {
      const existing = await this.readQueue(owner);
      const merged = [...existing];
      for (const item of queue) if (!merged.some((entry) => entry.id === item.id)) merged.push(item);
      await this.storage.setItem(this.queueStorageKey(owner), JSON.stringify(merged));
    }
    // Remove the global key only after every partition write succeeded. A
    // retry is idempotent because queue item IDs are stable.
    await this.storage.removeItem(this.queueKey);
    await this.storage.setItem(this.queueMigrationKey, "1");
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

  /**
   * Persist a learning snapshot before appending its outbound records. The
   * two storage keys cannot be committed transactionally by uni, so a queue
   * failure is surfaced after the snapshot is durable; retrying the queue is
   * safe because queue IDs are stable and enqueue is idempotent.
   */
  async transactAndEnqueue(
    change: (data: Data) => void,
    itemsFactory: (data: Data) => SyncQueueItem[] | Promise<SyncQueueItem[]>,
    key = this.activeKey,
  ): Promise<Data> {
    const owner = key;
    const operation = this.pendingWrite.then(async () => {
      const current = await this.read(key);
      change(current);
      const items = await itemsFactory(current);
      const persistedItems = items.map((item) => {
        const raw = item as QueueItemInput;
        if (raw.owner !== undefined && raw.owner !== owner) throw this.queueError(owner, "enqueue owner mismatch");
        if (raw.identity !== undefined && raw.identity !== this.queueIdentity(owner)) throw this.queueError(owner, "enqueue identity mismatch");
        return this.normalizeQueueItem({ ...raw, owner, identity: this.queueIdentity(owner) }, owner);
      });
      await this.storage.setItem(key, JSON.stringify(current));

      const queueOperation = this.pendingQueueWrite.then(async () => {
        await this.migrateLegacyQueue();
        const queue = await this.readQueue(owner);
        for (const item of persistedItems) if (!queue.some((entry) => entry.id === item.id)) queue.push(item);
        if (persistedItems.length > 0) await this.storage.setItem(this.queueStorageKey(owner), JSON.stringify(queue));
      });
      this.pendingQueueWrite = queueOperation.catch(() => undefined);
      await queueOperation;
      return current;
    });
    this.pendingWrite = operation.catch(() => undefined);
    return operation;
  }

  async getQueue(owner = this.activeKey): Promise<MiniProgramQueueItem[]> {
    await this.migrateLegacyQueue();
    return this.readQueue(owner);
  }

  async claimGuestLearning(userId: string): Promise<boolean> {
    const identity = userId.trim();
    if (!identity) throw new Error("Guest learning claim requires a user");
    const operation = this.pendingGuestClaim.then(async () => {
      const current = await this.storage.getItem(this.guestLearningOwnerKey);
      if (current && current !== identity) return false;
      if (!current) await this.storage.setItem(this.guestLearningOwnerKey, identity);
      return true;
    });
    this.pendingGuestClaim = operation.catch(() => undefined);
    return operation;
  }

  async releaseGuestLearning(userId: string): Promise<void> {
    const identity = userId.trim();
    const operation = this.pendingGuestClaim.then(async () => {
      const current = await this.storage.getItem(this.guestLearningOwnerKey);
      if (current === identity) await this.storage.removeItem(this.guestLearningOwnerKey);
    });
    this.pendingGuestClaim = operation.catch(() => undefined);
    await operation;
  }

  async clearQueue(owner = this.activeKey): Promise<void> {
    const operation = this.pendingQueueWrite.then(async () => {
      await this.migrateLegacyQueue();
      await this.storage.setItem(this.queueStorageKey(owner), "[]");
    });
    this.pendingQueueWrite = operation.catch(() => undefined);
    await operation;
  }

  async enqueue(items: SyncQueueItem[]): Promise<void> {
    const owner = this.activeKey;
    const operation = this.pendingQueueWrite.then(async () => {
      await this.migrateLegacyQueue();
      const queue = await this.readQueue(owner);
      for (const raw of items as QueueItemInput[]) {
        if (raw.owner !== undefined && raw.owner !== owner) throw this.queueError(owner, "enqueue owner mismatch");
        if (raw.identity !== undefined && raw.identity !== this.queueIdentity(owner)) throw this.queueError(owner, "enqueue identity mismatch");
        const item = this.normalizeQueueItem({ ...raw, owner, identity: this.queueIdentity(owner) }, owner);
        if (!queue.some((entry) => entry.id === item.id)) queue.push(item);
      }
      await this.storage.setItem(this.queueStorageKey(owner), JSON.stringify(queue));
    });
    this.pendingQueueWrite = operation.catch(() => undefined);
    await operation;
  }

  async dequeue(itemIds: string[]): Promise<void> {
    await this.dequeueConfirmed(itemIds);
  }

  /** Remove only items acknowledged for the currently active partition. */
  async dequeueConfirmed(items: Array<string | QueueAcknowledgement>, expectedOwner = this.activeKey): Promise<number> {
    const owner = this.activeKey;
    if (expectedOwner !== owner) throw this.queueError(owner, "active owner changed before acknowledgement");
    const ids = new Set<string>();
    for (const item of items) {
      if (typeof item === "string") ids.add(item);
      else {
        if (item.owner !== owner || item.identity !== this.queueIdentity(owner)) throw this.queueError(owner, "acknowledged item belongs to another owner");
        ids.add(item.id);
      }
    }
    const operation = this.pendingQueueWrite.then(async () => {
      await this.migrateLegacyQueue();
      const queue = await this.readQueue(owner);
      const remaining = queue.filter((item) => !ids.has(item.id));
      if (remaining.length !== queue.length) await this.storage.setItem(this.queueStorageKey(owner), JSON.stringify(remaining));
      return queue.length - remaining.length;
    });
    this.pendingQueueWrite = operation.catch(() => undefined);
    return operation;
  }
}
