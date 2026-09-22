import type { Data, SyncQueueItem } from "@jp/models";

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear?(): Promise<void>;
}

export interface AudioPlayOptions {
  slow?: boolean;
  onEnded?: () => void;
  onError?: (err: any) => void;
  onInterrupted?: () => void;
}

export interface AudioAdapter {
  play(url: string, options?: AudioPlayOptions): Promise<boolean>;
  stop(): void;
  isSpeaking?(): boolean;
}

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  data?: any;
  timeout?: number;
}

export interface NetworkAdapter {
  request<T>(url: string, options?: HttpRequestOptions): Promise<T>;
}

export interface AuthSession {
  userId: string;
  token: string;
  refreshToken?: string;
  email?: string;
  provider?: string;
}

export interface AuthAdapter {
  getSession(): Promise<AuthSession | null>;
  setSession(session: AuthSession): Promise<void>;
  clearSession(): Promise<void>;
}

export interface MiniProgramRepositoryContract {
  read(key?: string): Promise<Data>;
  transact(change: (data: Data) => void, key?: string): Promise<Data>;
  switchUser(userId: string | null): void;
  getActiveKey(): string;
  getQueue(owner?: string): Promise<SyncQueueItem[]>;
  enqueue(items: SyncQueueItem[]): Promise<void>;
  dequeue(itemIds: string[]): Promise<void>;
  transactAndEnqueue?(
    change: (data: Data) => void,
    itemsFactory: (data: Data) => SyncQueueItem[] | Promise<SyncQueueItem[]>,
    key?: string,
  ): Promise<Data>;
  dequeueConfirmed?(items: Array<string | { id: string; owner: string; identity: string }>, expectedOwner?: string): Promise<number>;
  claimGuestLearning?(userId: string): Promise<boolean>;
  releaseGuestLearning?(userId: string): Promise<void>;
  clearQueue?(owner?: string): Promise<void>;
}
