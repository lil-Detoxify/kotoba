import { afterEach, describe, expect, it, vi } from "vitest";
import { MiniProgramRepository, UniStorageAdapter } from "../apps/miniprogram/src/adapters/storage";
import { UniFileStorage, type FileStorageDriver, type FileStoragePointerStore } from "../apps/miniprogram/src/adapters/file-storage";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const files = new Map<string, string>();
  const pointers = new Map<string, string>();
  const inline = new Map<string, string>();
  const driver: FileStorageDriver = {
    readFile: vi.fn(async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error("file missing");
      return value;
    }),
    writeFile: vi.fn(async (path, value) => { files.set(path, value); }),
    rename: vi.fn(async (from, to) => {
      const value = files.get(from);
      if (value === undefined) throw new Error("temp missing");
      files.set(to, value);
      files.delete(from);
    }),
    unlink: vi.fn(async (path) => { files.delete(path); }),
  };
  const pointerStore: FileStoragePointerStore = {
    get: (key) => pointers.get(key) ?? null,
    set: (key, value) => { pointers.set(key, value); },
    remove: (key) => { pointers.delete(key); },
  };
  const fileStorage = new UniFileStorage(driver, pointerStore, "/user-data");
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => inline.get(key) ?? "",
    setStorageSync: (key: string, value: string) => { inline.set(key, value); },
    removeStorageSync: (key: string) => { inline.delete(key); },
  });
  return { files, pointers, inline, driver, fileStorage, storage: new UniStorageAdapter(fileStorage) };
}

describe("mini-program file-backed storage", () => {
  it("writes data_* through temp file plus rename and reads the file pointer", async () => {
    const { driver, inline, files, pointers, storage } = setup();
    inline.set("data_guest", "old snapshot");
    await storage.setItem("data_guest", "new snapshot");

    expect(driver.writeFile).toHaveBeenCalledOnce();
    expect(driver.rename).toHaveBeenCalledOnce();
    expect(inline.get("data_guest")).toBe("old snapshot");
    expect(pointers.get("__kotobud_file_pointer__data_guest")).toMatch(/\.json$/);
    expect([...files.values()]).toEqual(["new snapshot"]);
    expect(await storage.getItem("data_guest")).toBe("new snapshot");
  });

  it("keeps the old inline snapshot when atomic rename fails", async () => {
    const setupResult = setup();
    setupResult.inline.set("data_guest", "recoverable");
    setupResult.driver.rename = vi.fn(async () => { throw new Error("disk full"); });

    await expect(setupResult.storage.setItem("data_guest", "new")).rejects.toThrow("disk full");
    expect(setupResult.inline.get("data_guest")).toBe("recoverable");
    expect(setupResult.pointers.size).toBe(0);
    expect(setupResult.files.size).toBe(0);
    expect(setupResult.driver.unlink).toHaveBeenCalledOnce();
  });

  it("fails closed when a pointed file cannot be read", async () => {
    const { inline, pointers, storage } = setup();
    inline.set("data_guest", "old value");
    pointers.set("__kotobud_file_pointer__data_guest", "kotobud-data_guest-1.json");
    await expect(storage.getItem("data_guest")).rejects.toThrow("file missing");
  });

  it("classifies a dangling WeChat snapshot pointer without writing or removing anything", async () => {
    const { driver, files, inline, pointers, storage } = setup();
    const key = "data_guest";
    const pointer = "kotobud-data_guest-1790664281754-0-0.json";
    pointers.set("__kotobud_file_pointer__data_guest", pointer);
    driver.readFile = vi.fn(async (path) => {
      throw { errMsg: `readFile:fail ${path} not found` };
    });
    const repository = new MiniProgramRepository(storage);

    await expect(repository.transact(data => { data.seeded = true; })).rejects.toMatchObject({
      code: "SNAPSHOT_MISSING",
      key,
      pointer,
    });

    expect(pointers.get("__kotobud_file_pointer__data_guest")).toBe(pointer);
    expect(inline.has(key)).toBe(false);
    expect(files.size).toBe(0);
    expect(driver.writeFile).not.toHaveBeenCalled();
  });

  it("archives and restores only a valid inline guest copy after explicit repository recovery", async () => {
    const { driver, files, inline, pointers, storage } = setup();
    const key = "data_guest";
    const pointer = "kotobud-data_guest-1790664281754-0-0.json";
    const pointerKey = "__kotobud_file_pointer__data_guest";
    const raw = JSON.stringify({ books: [], lessons: [], words: [], states: [], logs: [], seeded: true });
    inline.set(key, raw);
    pointers.set(pointerKey, pointer);
    driver.readFile = vi.fn(async (path) => {
      const value = files.get(path);
      if (value !== undefined) return value;
      throw { errMsg: `readFile:fail ${path} not found` };
    });
    const repository = new MiniProgramRepository(storage);

    await expect(repository.read(key)).rejects.toMatchObject({ code: "SNAPSHOT_MISSING", pointer });
    const restored = await repository.recoverMissingSnapshot(pointer, key);

    expect(restored.seeded).toBe(true);
    const replacementPointer = pointers.get(pointerKey)!;
    expect(replacementPointer).not.toBe(pointer);
    expect(files.get(`/user-data/${replacementPointer}`)).toBe(raw);
    const recoveryKey = [...pointers.keys()].find((candidate) => candidate.startsWith("__kotobud_file_recovery__data_guest:"));
    expect(recoveryKey).toBeTruthy();
    const archiveFile = pointers.get(recoveryKey!)!;
    expect(JSON.parse(files.get(`/user-data/${archiveFile}`)!)).toMatchObject({ key, pointer, inlineValue: raw });
    expect(driver.unlink).not.toHaveBeenCalled();
    expect(pointers.get(pointerKey)).toBe(replacementPointer);
  });

  it("does not restore JSON-only inline content that fails repository Data validation", async () => {
    const { driver, inline, pointers, storage } = setup();
    const key = "data_guest";
    const pointer = "kotobud-data_guest-missing.json";
    const pointerKey = "__kotobud_file_pointer__data_guest";
    inline.set(key, "{}");
    pointers.set(pointerKey, pointer);
    driver.readFile = vi.fn(async (path) => { throw { errMsg: `readFile:fail ${path} not found` }; });
    const repository = new MiniProgramRepository(storage);

    await expect(repository.recoverMissingSnapshot(pointer, key)).rejects.toThrow("Invalid learning data");
    expect(pointers.get(pointerKey)).toBe(pointer);
    expect([...pointers.keys()].some((candidate) => candidate.startsWith("__kotobud_file_recovery__"))).toBe(false);
    expect(driver.writeFile).not.toHaveBeenCalled();
  });

  it("keeps a recoverable pointer unchanged if the active partition changes before commit", async () => {
    const setupResult = setup();
    const key = "data_guest";
    const pointer = "kotobud-data_guest-missing.json";
    const pointerKey = "__kotobud_file_pointer__data_guest";
    const raw = JSON.stringify({ books: [], lessons: [], words: [], states: [], logs: [] });
    setupResult.inline.set(key, raw);
    setupResult.pointers.set(pointerKey, pointer);
    setupResult.driver.readFile = vi.fn(async (path) => {
      const value = setupResult.files.get(path);
      if (value !== undefined) return value;
      throw { errMsg: `readFile:fail ${path} not found` };
    });
    const repository = new MiniProgramRepository(setupResult.storage);
    const originalWrite = setupResult.driver.writeFile;
    setupResult.driver.writeFile = vi.fn(async (path, value) => {
      await originalWrite(path, value);
      if (path.includes("-recovery-")) repository.switchUser("alice");
    });

    await expect(repository.recoverMissingSnapshot(pointer, key)).rejects.toThrow("Active learning partition changed during recovery");
    expect(setupResult.pointers.get(pointerKey)).toBe(pointer);
    expect([...setupResult.pointers.keys()].some((candidate) => candidate.startsWith("__kotobud_file_recovery__"))).toBe(true);
  });

  it("does not classify file permission failures as missing snapshots", async () => {
    const { driver, pointers, storage } = setup();
    const pointer = "kotobud-data_guest-1.json";
    pointers.set("__kotobud_file_pointer__data_guest", pointer);
    driver.readFile = vi.fn(async () => { throw { errMsg: "readFile:fail permission denied" }; });

    await expect(storage.getItem("data_guest")).rejects.toMatchObject({ errMsg: "readFile:fail permission denied" });
    expect(pointers.get("__kotobud_file_pointer__data_guest")).toBe(pointer);
    expect(driver.writeFile).not.toHaveBeenCalled();
  });

  it("preserves the previous revision when pointer commit fails", async () => {
    const setupResult = setup();
    await setupResult.storage.setItem("data_guest", "revision one");
    const previousPointer = setupResult.pointers.get("__kotobud_file_pointer__data_guest");
    const previousFiles = new Map(setupResult.files);
    const pointerSet = setupResult.pointers.set;
    setupResult.pointers.set = (key, value) => {
      if (key === "__kotobud_file_pointer__data_guest") throw new Error("pointer unavailable");
      return pointerSet(key, value);
    };

    await expect(setupResult.storage.setItem("data_guest", "revision two")).rejects.toThrow("pointer unavailable");
    expect(setupResult.pointers.get("__kotobud_file_pointer__data_guest")).toBe(previousPointer);
    expect(setupResult.files).toEqual(previousFiles);
    await expect(setupResult.storage.getItem("data_guest")).resolves.toBe("revision one");
  });

  it("cleans the previous revision only after a successful pointer commit", async () => {
    const setupResult = setup();
    await setupResult.storage.setItem("data_guest", "revision one");
    const previousPointer = setupResult.pointers.get("__kotobud_file_pointer__data_guest")!;
    await setupResult.storage.setItem("data_guest", "revision two");
    const currentPointer = setupResult.pointers.get("__kotobud_file_pointer__data_guest")!;

    expect(currentPointer).not.toBe(previousPointer);
    expect(setupResult.files.has(`/user-data/${previousPointer}`)).toBe(false);
    expect(setupResult.files.get(`/user-data/${currentPointer}`)).toBe("revision two");
  });

  it("retries once when a concurrent pointer advances during file read", async () => {
    const setupResult = setup();
    await setupResult.storage.setItem("data_guest", "revision one");
    const firstPointer = setupResult.pointers.get("__kotobud_file_pointer__data_guest")!;
    await setupResult.storage.setItem("data_guest", "revision two");
    const secondPointer = setupResult.pointers.get("__kotobud_file_pointer__data_guest")!;
    // Recreate the old revision to model a concurrent reader that observed
    // the old pointer before the writer committed the new one.
    setupResult.files.set(`/user-data/${firstPointer}`, "revision one");
    setupResult.pointers.set("__kotobud_file_pointer__data_guest", firstPointer);
    const nativeRead = setupResult.driver.readFile;
    let reads = 0;
    setupResult.driver.readFile = vi.fn(async (path) => {
      reads += 1;
      if (reads === 1) {
        setupResult.pointers.set("__kotobud_file_pointer__data_guest", secondPointer);
        setupResult.files.delete(path);
      }
      return nativeRead(path);
    });
    await expect(setupResult.storage.getItem("data_guest")).resolves.toBe("revision two");
    expect(reads).toBe(2);
    expect(secondPointer).not.toBe(firstPointer);
  });

  it("reports the pointer used by a failed retry as a missing snapshot", async () => {
    const setupResult = setup();
    const firstPointer = "kotobud-data_guest-old.json";
    const secondPointer = "kotobud-data_guest-current.json";
    setupResult.pointers.set("__kotobud_file_pointer__data_guest", firstPointer);
    setupResult.driver.readFile = vi.fn(async (path) => {
      if (path.endsWith(firstPointer)) {
        setupResult.pointers.set("__kotobud_file_pointer__data_guest", secondPointer);
      }
      throw { errMsg: `readFile:fail ${path} not found` };
    });

    await expect(setupResult.storage.getItem("data_guest")).rejects.toMatchObject({
      code: "SNAPSHOT_MISSING",
      key: "data_guest",
      pointer: secondPointer,
    });
  });

  it("leaves the missing pointer in place when the replacement pointer commit fails", async () => {
    const setupResult = setup();
    const key = "data_guest";
    const pointer = "kotobud-data_guest-missing.json";
    const pointerKey = "__kotobud_file_pointer__data_guest";
    const raw = JSON.stringify({ books: [], lessons: [], words: [], states: [], logs: [] });
    setupResult.inline.set(key, raw);
    setupResult.pointers.set(pointerKey, pointer);
    setupResult.driver.readFile = vi.fn(async (path) => {
      const value = setupResult.files.get(path);
      if (value !== undefined) return value;
      throw { errMsg: `readFile:fail ${path} not found` };
    });
    const originalSet = setupResult.pointers.set;
    setupResult.pointers.set = (storageKey, value) => {
      if (storageKey === pointerKey && value !== pointer) throw new Error("pointer unavailable");
      return originalSet.call(setupResult.pointers, storageKey, value);
    };
    const repository = new MiniProgramRepository(setupResult.storage);

    await expect(repository.recoverMissingSnapshot(pointer, key)).rejects.toThrow("pointer unavailable");
    expect(setupResult.pointers.get(pointerKey)).toBe(pointer);
    expect([...setupResult.pointers.keys()].some((candidate) => candidate.startsWith("__kotobud_file_recovery__"))).toBe(true);
  });

  it("handles snapshots above the uni Storage key limit", async () => {
    const { storage } = setup();
    const snapshot = "日".repeat(700_000);
    await storage.setItem("data_user_large", snapshot);
    await expect(storage.getItem("data_user_large")).resolves.toBe(snapshot);
  });

  it("keeps small auth/settings values in uni storage", async () => {
    const { driver, inline, storage } = setup();
    await storage.setItem("auth_session", "token");
    expect(inline.get("auth_session")).toBe("token");
    expect(driver.writeFile).not.toHaveBeenCalled();
    expect(await storage.getItem("auth_session")).toBe("token");
  });

  it("does not resurrect inline data when old file cleanup fails", async () => {
    const setupResult = setup();
    setupResult.inline.set("data_guest", "legacy copy");
    await setupResult.storage.setItem("data_guest", "file snapshot");
    setupResult.driver.unlink = vi.fn(async () => { throw new Error("unlink failed"); });

    await expect(setupResult.storage.removeItem("data_guest")).rejects.toThrow("unlink failed");
    expect(setupResult.inline.has("data_guest")).toBe(false);
    expect(setupResult.pointers.has("__kotobud_file_pointer__data_guest")).toBe(false);
    await expect(setupResult.storage.getItem("data_guest")).resolves.toBeNull();
  });
});
