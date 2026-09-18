import {openDB,type DBSchema,type IDBPDatabase} from 'idb';
import {emptyData,type Data,type SyncQueueItem} from '@jp/models';

export interface Repository {
  read(key?: string): Promise<Data>;
  transact(change: (data: Data) => void, key?: string): Promise<Data>;
  switchUser(userId: string | null): void;
  createPreLoginSnapshot(): Promise<void>;
  hasPreLoginSnapshot(): Promise<boolean>;
  restorePreLoginSnapshot(): Promise<boolean>;
  getQueue(): Promise<SyncQueueItem[]>;
  enqueue(items: SyncQueueItem[]): Promise<void>;
  dequeue(itemIds: string[]): Promise<void>;
  getActiveKey(): string;
  hasLegacyData(): Promise<boolean>;
  getLegacyData(): Promise<Data | null>;
  close(): Promise<void>;
  open(): Promise<void>;
}

interface Schema extends DBSchema {
  app: {
    key: string;
    value: any;
  };
}

export class IndexedDbRepository implements Repository {
  private name: string;
  private dbPromise: Promise<IDBPDatabase<Schema>> | null = null;
  private dbInstance: IDBPDatabase<Schema> | null = null;
  private activeKey = 'data_guest';
  private bootstrapped = false;
  private bootstrapPromise: Promise<void> | null = null;

  constructor(name = 'kotoba-v1') {
    this.name = name;
  }

  getActiveKey(): string {
    return this.activeKey;
  }

  switchUser(userId: string | null): void {
    if (userId && userId.trim().length > 0) {
      this.activeKey = `data_user_${userId.trim()}`;
    } else {
      this.activeKey = 'data_guest';
    }
  }

  async close(): Promise<void> {
    if (this.dbInstance) {
      try {
        this.dbInstance.close();
      } catch {}
      this.dbInstance = null;
    }
    this.dbPromise = null;
    this.bootstrapped = false;
    this.bootstrapPromise = null;
  }

  async open(): Promise<void> {
    await this.getDb(true);
  }

  private async getDb(forceNew = false): Promise<IDBPDatabase<Schema>> {
    if (forceNew || !this.dbPromise || !this.dbInstance) {
      if (this.dbInstance) {
        try { this.dbInstance.close(); } catch {}
        this.dbInstance = null;
      }
      this.dbPromise = this.openDatabase();
    }
    return this.dbPromise;
  }

  private async openDatabase(): Promise<IDBPDatabase<Schema>> {
    const db = await openDB<Schema>(this.name, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('app')) {
          db.createObjectStore('app');
        }
      },
      blocked: () => {
        console.warn(`[IndexedDbRepository] Database ${this.name} blocked by another open connection`);
      },
      blocking: (_currentVersion, _blockedVersion, event) => {
        console.warn(`[IndexedDbRepository] Database ${this.name} blocking version change, closing connection`);
        try {
          (event.target as any)?.result?.close?.();
        } catch {}
      },
      terminated: () => {
        console.warn(`[IndexedDbRepository] Database ${this.name} connection terminated by browser`);
        this.dbInstance = null;
        this.dbPromise = null;
      }
    });

    this.dbInstance = db;

    db.addEventListener('close', () => {
      if (this.dbInstance === db) {
        this.dbInstance = null;
        this.dbPromise = null;
      }
    });

    db.addEventListener('versionchange', () => {
      try { db.close(); } catch {}
      if (this.dbInstance === db) {
        this.dbInstance = null;
        this.dbPromise = null;
      }
    });

    return db;
  }

  private isClosingOrClosedError(err: unknown): boolean {
    if (!err) return false;
    const msg = String((err as any)?.message || err);
    const name = (err as any)?.name;
    return (
      msg.includes('connection is closing') ||
      msg.includes('connection is closed') ||
      msg.includes('The database connection is closing') ||
      msg.includes('The database connection is closed') ||
      name === 'InvalidStateError'
    );
  }

  private async withConnection<T>(fn: (db: IDBPDatabase<Schema>) => Promise<T>): Promise<T> {
    let db = await this.getDb();
    try {
      return await fn(db);
    } catch (err: any) {
      if (this.isClosingOrClosedError(err)) {
        console.warn('[IndexedDbRepository] Detected closing or closed IndexedDB connection, reconnecting and retrying once...', err);
        await this.close();
        db = await this.getDb(true);
        return await fn(db);
      }
      throw err;
    }
  }

  private async bootstrap(db: IDBPDatabase<Schema>): Promise<void> {
    if (this.bootstrapped) return;
    if (this.bootstrapPromise) return this.bootstrapPromise;

    this.bootstrapPromise = (async () => {
      try {
        const guestData = await db.get('app', 'data_guest');
        const legacyData = await db.get('app', 'data');
        if (!guestData && legacyData) {
          await db.put('app', structuredClone(legacyData), 'data_guest');
        }
        this.bootstrapped = true;
      } catch (e) {
        console.warn('Storage bootstrap check failed:', e);
      } finally {
        this.bootstrapPromise = null;
      }
    })();

    return this.bootstrapPromise;
  }

  async read(targetKey?: string): Promise<Data> {
    return this.withConnection(async db => {
      await this.bootstrap(db);
      const key = targetKey ?? this.activeKey;
      const data = await db.get('app', key);
      return data ?? emptyData();
    });
  }

  async transact(change: (data: Data) => void, targetKey?: string): Promise<Data> {
    return this.withConnection(async db => {
      await this.bootstrap(db);
      const key = targetKey ?? this.activeKey;
      const tx = db.transaction('app', 'readwrite');
      try {
        const data = (await tx.store.get(key)) ?? emptyData();
        change(data);
        await tx.store.put(data, key);
        await tx.done;
        return data;
      } catch (error) {
        try { tx.abort(); } catch {}
        await tx.done.catch(() => {});
        throw error;
      }
    });
  }

  async createPreLoginSnapshot(): Promise<void> {
    return this.withConnection(async db => {
      await this.bootstrap(db);
      const current = (await db.get('app', this.activeKey)) ?? (await db.get('app', 'data_guest')) ?? (await db.get('app', 'data'));
      if (current) {
        await db.put('app', structuredClone(current), 'data_backup_pre_login');
      }
    });
  }

  async hasPreLoginSnapshot(): Promise<boolean> {
    return this.withConnection(async db => {
      const backup = await db.get('app', 'data_backup_pre_login');
      return !!backup;
    });
  }

  async restorePreLoginSnapshot(): Promise<boolean> {
    return this.withConnection(async db => {
      const backup = await db.get('app', 'data_backup_pre_login');
      if (!backup) return false;
      const tx = db.transaction('app', 'readwrite');
      try {
        await tx.store.put(structuredClone(backup), 'data_guest');
        await tx.done;
        return true;
      } catch (err) {
        try { tx.abort(); } catch {}
        await tx.done.catch(() => {});
        throw err;
      }
    });
  }

  async hasLegacyData(): Promise<boolean> {
    return this.withConnection(async db => {
      const legacy = await db.get('app', 'data');
      return !!legacy && (legacy.states?.length > 0 || legacy.logs?.length > 0);
    });
  }

  async getLegacyData(): Promise<Data | null> {
    return this.withConnection(async db => {
      return (await db.get('app', 'data')) ?? null;
    });
  }

  async getQueue(): Promise<SyncQueueItem[]> {
    return this.withConnection(async db => {
      const queue = await db.get('app', 'sync_queue');
      return Array.isArray(queue) ? queue : [];
    });
  }

  async enqueue(items: SyncQueueItem[]): Promise<void> {
    if (!items.length) return;
    return this.withConnection(async db => {
      const tx = db.transaction('app', 'readwrite');
      try {
        const existing: SyncQueueItem[] = (await tx.store.get('sync_queue')) ?? [];
        const itemMap = new Map<string, SyncQueueItem>(existing.map(it => [it.id, it]));
        for (const item of items) {
          itemMap.set(item.id, item);
        }
        await tx.store.put(Array.from(itemMap.values()), 'sync_queue');
        await tx.done;
      } catch (err) {
        try { tx.abort(); } catch {}
        await tx.done.catch(() => {});
        throw err;
      }
    });
  }

  async dequeue(itemIds: string[]): Promise<void> {
    if (!itemIds.length) return;
    return this.withConnection(async db => {
      const tx = db.transaction('app', 'readwrite');
      try {
        const idSet = new Set(itemIds);
        const existing: SyncQueueItem[] = (await tx.store.get('sync_queue')) ?? [];
        const filtered = existing.filter(it => !idSet.has(it.id));
        await tx.store.put(filtered, 'sync_queue');
        await tx.done;
      } catch (err) {
        try { tx.abort(); } catch {}
        await tx.done.catch(() => {});
        throw err;
      }
    });
  }
}

export function deleteBook(data:Data,id:string){const lessonIds=new Set(data.lessons.filter(l=>l.bookId===id).map(l=>l.id));const wordIds=new Set(data.words.filter(w=>lessonIds.has(w.lessonId)).map(w=>w.id));data.books=data.books.filter(b=>b.id!==id);data.lessons=data.lessons.filter(l=>!lessonIds.has(l.id));data.words=data.words.filter(w=>!wordIds.has(w.id));data.states=data.states.filter(s=>!wordIds.has(s.wordId));data.logs=data.logs.filter(l=>!wordIds.has(l.wordId));if(data.currentBookId===id)data.currentBookId=data.books[0]?.id}
