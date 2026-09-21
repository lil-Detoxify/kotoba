export interface FileStorageDriver {
  readFile(path: string): Promise<string>;
  writeFile(path: string, value: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface FileStoragePointerStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

type UniRuntime = {
  env?: { USER_DATA_PATH?: string };
  getFileSystemManager?: () => any;
};

export const POINTER_PREFIX = "__kotobud_file_pointer__";
let revisionNonce = 0;

export function filePointerKey(key: string): string {
  return `${POINTER_PREFIX}${key}`;
}

/** Atomic file snapshots for data_* keys, backed by the mini-program sandbox. */
export class UniFileStorage {
  private sequence = 0;

  constructor(
    private readonly driver: FileStorageDriver,
    private readonly pointerStore: FileStoragePointerStore,
    private readonly userDataPath: string,
  ) {}

  static fromUni(): UniFileStorage | undefined {
    const runtime = (typeof uni === "undefined" ? undefined : uni) as unknown as UniRuntime | undefined;
    if (!runtime?.getFileSystemManager || !runtime.env?.USER_DATA_PATH) return undefined;
    const manager = runtime.getFileSystemManager();
    return new UniFileStorage(createUniDriver(manager), createUniPointerStore(), runtime.env.USER_DATA_PATH);
  }

  async getItem(key: string, inlineValue: string | null): Promise<string | null> {
    const pointer = this.pointerStore.get(filePointerKey(key));
    if (!pointer) return inlineValue;
    if (!this.isSafeRevision(key, pointer)) throw new Error("Invalid storage file pointer");
    try {
      return await this.driver.readFile(this.path(pointer));
    } catch (error) {
      // A concurrent writer may have committed a newer pointer between the
      // pointer read and file read. Retry once against that new revision.
      const retryPointer = this.pointerStore.get(filePointerKey(key));
      if (retryPointer && retryPointer !== pointer) {
        if (!this.isSafeRevision(key, retryPointer)) throw new Error("Invalid storage file pointer");
        return this.driver.readFile(this.path(retryPointer));
      }
      throw error;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const revision = `${safeFileName(key)}-${Date.now()}-${revisionNonce++}-${this.sequence++}.json`;
    const temp = `${revision}.tmp`;
    const previousPointer = this.pointerStore.get(filePointerKey(key));
    // Neither the old inline value nor the active pointer is changed until
    // the complete temporary file has been renamed into place.
    try {
      await this.driver.writeFile(this.path(temp), value);
    } catch (error) {
      await this.driver.unlink(this.path(temp)).catch(() => undefined);
      throw error;
    }
    try {
      await this.driver.rename(this.path(temp), this.path(revision));
    } catch (error) {
      await this.driver.unlink(this.path(temp)).catch(() => undefined);
      throw error;
    }
    try {
      this.pointerStore.set(filePointerKey(key), revision);
    } catch (error) {
      await this.driver.unlink(this.path(revision)).catch(() => undefined);
      throw error;
    }
    // Old revisions are disposable only after the pointer commit succeeds.
    // Cleanup is best effort: the new snapshot is already durable.
    if (previousPointer && previousPointer !== revision && this.isSafeRevision(key, previousPointer)) {
      await this.driver.unlink(this.path(previousPointer)).catch(() => undefined);
    }
  }

  async removeItem(key: string): Promise<void> {
    const pointer = this.pointerStore.get(filePointerKey(key));
    if (pointer && !this.isSafeRevision(key, pointer)) throw new Error("Invalid storage file pointer");
    this.pointerStore.remove(filePointerKey(key));
    if (pointer) await this.driver.unlink(this.path(pointer));
  }

  private path(file: string): string {
    return `${this.userDataPath.replace(/[\\/]$/, "")}/${file}`;
  }

  private isSafeRevision(key: string, file: string): boolean {
    return file.startsWith(`${safeFileName(key)}-`) && file.endsWith(".json") && !file.includes("/") && !file.includes("\\");
  }
}

export function isFileStorageKey(key: string): boolean {
  return key.startsWith("data_");
}

function safeFileName(key: string): string {
  return `kotobud-${encodeURIComponent(key)}`;
}

function createUniPointerStore(): FileStoragePointerStore {
  return {
    get: (key) => {
      // @ts-ignore uni global supplied by uni-app at runtime
      const value = uni.getStorageSync(key);
      return value == null || value === "" ? null : String(value);
    },
    set: (key, value) => {
      // @ts-ignore uni global supplied by uni-app at runtime
      uni.setStorageSync(key, value);
    },
    remove: (key) => {
      // @ts-ignore uni global supplied by uni-app at runtime
      uni.removeStorageSync(key);
    },
  };
}

function createUniDriver(manager: any): FileStorageDriver {
  return {
    readFile: (filePath) => new Promise((resolve, reject) => manager.readFile({ filePath, encoding: "utf8", success: (result: any) => resolve(String(result?.data ?? "")), fail: reject })),
    writeFile: (filePath, value) => new Promise((resolve, reject) => manager.writeFile({ filePath, data: value, encoding: "utf8", success: resolve, fail: reject })),
    rename: (oldPath, newPath) => new Promise((resolve, reject) => manager.rename({ oldPath, newPath, success: resolve, fail: reject })),
    unlink: (filePath) => new Promise((resolve, reject) => manager.unlink({ filePath, success: resolve, fail: reject })),
  };
}
