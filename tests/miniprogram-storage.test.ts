import { afterEach, describe, expect, it, vi } from "vitest";
import { MiniProgramRepository, UniStorageAdapter, type StorageAdapter } from "../apps/miniprogram/src/adapters/storage";

afterEach(() => vi.unstubAllGlobals());

function memory() {
  const values = new Map<string, string>();
  const adapter: StorageAdapter = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  return { values, adapter };
}

describe("mini program durable learning storage", () => {
  it("surfaces unavailable runtime and quota errors instead of reporting success", async () => {
    vi.stubGlobal("uni", undefined);
    const storage = new UniStorageAdapter();
    await expect(storage.setItem("data_guest", "{}")).rejects.toThrow("unavailable");
    vi.stubGlobal("uni", { setStorageSync: () => { throw new Error("quota exceeded"); } });
    await expect(storage.setItem("data_guest", "{}")).rejects.toThrow("quota exceeded");
  });

  it("preserves unreadable data and never replaces it with an empty snapshot", async () => {
    const { values, adapter } = memory();
    const repository = new MiniProgramRepository(adapter);
    for (const raw of ["{broken", '{"words":[]}']) {
      values.set("data_guest", raw);
      await expect(repository.transact((data) => { data.seeded = true; })).rejects.toThrow();
      expect(values.get("data_guest")).toBe(raw);
    }
  });

  it("does not overwrite a snapshot after a platform read failure", async () => {
    const write = vi.fn();
    vi.stubGlobal("uni", {
      getStorageSync: () => { throw new Error("read failed"); },
      setStorageSync: write,
    });
    const repository = new MiniProgramRepository(new UniStorageAdapter());
    await expect(repository.transact((data) => { data.seeded = true; })).rejects.toThrow("read failed");
    expect(write).not.toHaveBeenCalled();
  });

  it("serializes overlapping updates without dropping either change", async () => {
    const { adapter } = memory();
    const repository = new MiniProgramRepository(adapter);
    await Promise.all([
      repository.transact((data) => { data.currentBookId = "book-a"; }),
      repository.transact((data) => { data.seeded = true; }),
    ]);
    expect(await repository.read()).toMatchObject({ currentBookId: "book-a", seeded: true });
  });

  it("keeps pending writes in their original user partition", async () => {
    const { adapter } = memory();
    const repository = new MiniProgramRepository(adapter);
    const guestWrite = repository.transact((data) => { data.currentBookId = "guest-book"; });
    repository.switchUser("alice");
    const userWrite = repository.transact((data) => { data.currentBookId = "alice-book"; });
    await Promise.all([guestWrite, userWrite]);
    expect((await repository.read()).currentBookId).toBe("alice-book");
    expect((await repository.read("data_guest")).currentBookId).toBe("guest-book");
  });

  it("permits a retry after failed persistence without carrying unsaved mutations", async () => {
    const { adapter } = memory();
    const write = adapter.setItem;
    adapter.setItem = vi.fn().mockRejectedValueOnce(new Error("full")).mockImplementation(write);
    const repository = new MiniProgramRepository(adapter);
    await expect(repository.transact((data) => { data.currentBookId = "unsaved"; })).rejects.toThrow("full");
    await repository.transact((data) => { data.seeded = true; });
    expect(await repository.read()).toMatchObject({ seeded: true });
    expect((await repository.read()).currentBookId).toBeUndefined();
  });
});
