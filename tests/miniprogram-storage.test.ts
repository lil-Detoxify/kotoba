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

  it("isolates outbound queues by guest/account partition and stamps owner identity", async () => {
    const { values, adapter } = memory();
    const repository = new MiniProgramRepository(adapter);
    await repository.enqueue([{ id: "guest-event", type: "review_event", payload: { wordId: "w1" }, createdAt: "2026-09-22T01:00:00.000Z", retries: 0 }]);
    repository.switchUser("alice");
    expect(await repository.getQueue()).toEqual([]);
    await repository.enqueue([{ id: "alice-event", type: "review_event", payload: { wordId: "w2" }, createdAt: "2026-09-22T01:01:00.000Z", retries: 0 }]);
    expect((await repository.getQueue())[0]).toMatchObject({ id: "alice-event", owner: "data_user_alice", identity: "alice" });
    repository.switchUser(null);
    expect((await repository.getQueue())[0]).toMatchObject({ id: "guest-event", owner: "data_guest", identity: "guest" });
    expect(values.has("sync_queue")).toBe(false);
    expect(values.has("sync_queue:data_guest")).toBe(true);
    expect(values.has("sync_queue:data_user_alice")).toBe(true);
  });

  it("fails explicitly when a persisted queue is damaged", async () => {
    const { values, adapter } = memory();
    values.set("sync_queue:data_guest", "{broken");
    const repository = new MiniProgramRepository(adapter);
    await expect(repository.getQueue()).rejects.toThrow("Invalid persisted sync queue for data_guest");
  });

  it("migrates the legacy global queue only into safe owner partitions", async () => {
    const { values, adapter } = memory();
    values.set("sync_queue", JSON.stringify([
      { id: "old-guest", type: "progress", payload: {}, createdAt: "2026-09-22T01:00:00.000Z", retries: 0 },
      { id: "old-alice", type: "progress", payload: {}, createdAt: "2026-09-22T01:01:00.000Z", retries: 0, identity: "alice" },
      { id: "unknown-owner", type: "progress", payload: {}, createdAt: "2026-09-22T01:02:00.000Z", retries: 0, identity: "alice:attacker" },
    ]));
    const repository = new MiniProgramRepository(adapter);
    expect((await repository.getQueue()).map((item) => item.id)).toEqual(["old-guest"]);
    repository.switchUser("alice");
    expect((await repository.getQueue()).map((item) => item.id)).toEqual(["old-alice"]);
    expect(values.has("sync_queue")).toBe(false);
  });

  it("rejects acknowledgements from another active partition without deleting them", async () => {
    const { adapter } = memory();
    const repository = new MiniProgramRepository(adapter);
    await repository.enqueue([{ id: "guest-event", type: "review_event", payload: {}, createdAt: "2026-09-22T01:00:00.000Z", retries: 0 }]);
    const guestQueue = await repository.getQueue();
    repository.switchUser("alice");
    await expect(repository.dequeueConfirmed(guestQueue, "data_guest")).rejects.toThrow("active owner changed");
    repository.switchUser(null);
    expect(await repository.getQueue()).toHaveLength(1);
    expect(await repository.dequeueConfirmed(guestQueue)).toBe(1);
    expect(await repository.getQueue()).toEqual([]);
  });

  it("persists the learning snapshot before queue and supports idempotent queue retry", async () => {
    const base = memory();
    const originalSet = base.adapter.setItem;
    let queueWriteFailed = true;
    base.adapter.setItem = vi.fn(async (key, value) => {
      if (key === "sync_queue:data_guest" && queueWriteFailed) {
        queueWriteFailed = false;
        throw new Error("queue disk full");
      }
      await originalSet(key, value);
    });
    const repository = new MiniProgramRepository(base.adapter);
    await expect(repository.transactAndEnqueue(
      (data) => { data.seeded = true; },
      () => [{ id: "stable-event", type: "progress", payload: { wordId: "w1" }, createdAt: "2026-09-22T01:00:00.000Z", retries: 0 }],
    )).rejects.toThrow("queue disk full");
    expect((await repository.read()).seeded).toBe(true);
    await repository.enqueue([{ id: "stable-event", type: "progress", payload: { wordId: "w1" }, createdAt: "2026-09-22T01:00:00.000Z", retries: 0 }]);
    expect(await repository.getQueue()).toHaveLength(1);
  });

  it("allows only one canonical account to claim pending guest learning", async () => {
    const { adapter } = memory();
    const repository = new MiniProgramRepository(adapter);
    const [alice, bob] = await Promise.all([
      repository.claimGuestLearning("alice"),
      repository.claimGuestLearning("bob"),
    ]);
    expect([alice, bob].filter(Boolean)).toHaveLength(1);
    const owner = alice ? "alice" : "bob";
    const other = alice ? "bob" : "alice";
    expect(await repository.claimGuestLearning(owner)).toBe(true);
    expect(await repository.claimGuestLearning(other)).toBe(false);
    await repository.releaseGuestLearning(owner);
    expect(await repository.claimGuestLearning(other)).toBe(true);
  });
});
