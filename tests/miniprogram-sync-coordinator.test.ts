import { describe, expect, it, vi } from "vitest";
import { MiniProgramRepository, type StorageAdapter } from "../apps/miniprogram/src/adapters/storage";
import { MiniSyncCoordinator } from "../apps/miniprogram/src/services/sync-coordinator";

function memory() {
  const values = new Map<string, string>();
  const storage: StorageAdapter = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  return { values, storage };
}

function pull(userId: string, progress: unknown[] = [], events: unknown[] = []) {
  return { userId, progress, events, serverTime: "2026-09-22T01:00:00.000Z" };
}

function progress(userId: string, wordId: string) {
  return {
    userId, wordId, status: "review", reviewCount: 3, lapseCount: 0,
    card: { due: "2026-10-01T00:00:00.000Z", stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 8, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: "2026-09-21T00:00:00.000Z" },
    isDifficult: false, isIgnored: false, updatedAt: "2026-09-21T00:00:00.000Z", version: 1,
  };
}

function coordinator(saved: any = null) {
  const mem = memory();
  const repository = new MiniProgramRepository(mem.storage);
  const auth = { restore: vi.fn(async () => saved) };
  const client = {
    pull: vi.fn(),
    push: vi.fn(async (_session: unknown, _batch: { progress: unknown[] }) => ({ success: true, acceptedEvents: 0, updatedProgress: 0, settingsConflict: false, serverTime: "2026-09-22T02:00:00.000Z" })),
  };
  return { mem, repository, auth, client, sync: new MiniSyncCoordinator(repository, auth as any, client as any) };
}

describe("mini-program strict sync gate", () => {
  it("hydrates guest data but never contacts sync without a restored session", async () => {
    const h = coordinator(null);
    await h.repository.transact((data) => { data.seeded = true; });
    await h.sync.init();
    expect(h.sync.state).toMatchObject({ phase: "signed_out", isSyncReady: false, activeKey: "data_guest" });
    expect(h.client.pull).not.toHaveBeenCalled();
    await expect(h.sync.flush("onHide")).resolves.toBe(false);
    expect(h.client.push).not.toHaveBeenCalled();
  });

  it("physically blocks push until pull, validation, reconciliation and persistence finish", async () => {
    const h = coordinator({ userId: "kb_1", token: "at" });
    let resolvePull!: (value: any) => void;
    h.client.pull.mockImplementation(() => new Promise((resolve) => { resolvePull = resolve; }));
    const initializing = h.sync.init();
    await vi.waitFor(() => expect(h.client.pull).toHaveBeenCalledTimes(1));
    expect(h.sync.state.isSyncReady).toBe(false);
    await expect(h.sync.flush("onHide")).resolves.toBe(false);
    expect(h.client.push).not.toHaveBeenCalled();
    resolvePull(pull("kb_1", [progress("kb_1", "future-word")]));
    await initializing;
    expect(h.sync.state).toMatchObject({ phase: "ready", isSyncReady: true, userId: "kb_1" });
    expect((await h.repository.read()).states[0]).toMatchObject({ wordId: "future-word", reviewCount: 3 });
  });

  it("completes cloud hydration when a historical listening event has an empty prompt", async () => {
    const h = coordinator({ userId: "kb_1", token: "at" });
    h.client.pull.mockResolvedValue(pull("kb_1", [progress("kb_1", "w1")], [{
      _id: "legacy-listening", userId: "kb_1", wordId: "w1",
      reviewedAt: "2026-09-20T00:00:00.000Z", rating: 3, responseTime: 1200,
      studyMode: "review", clientCreatedAt: "2026-09-20T00:00:00.000Z",
      quiz: { type: "audio-meaning", prompt: "", options: ["猫", "狗"], selected: "猫", correct: "猫", isCorrect: true },
    }]));
    await h.sync.init();
    expect(h.sync.state).toMatchObject({ phase: "ready", isSyncReady: true });
    expect((await h.repository.read()).logs).toEqual([
      expect.objectContaining({ id: "legacy-listening", quiz: expect.objectContaining({ prompt: "听音辨意" }) }),
    ]);
    expect(h.client.push).not.toHaveBeenCalled();
  });

  it("keeps the local snapshot and queue when pull payload is invalid", async () => {
    const h = coordinator({ userId: "kb_1", token: "at" });
    h.repository.switchUser("kb_1");
    await h.repository.transact((data) => { data.currentBookId = "local-book"; });
    await h.repository.enqueue([{ id: "pending", type: "progress", payload: {}, createdAt: "2026-09-22T00:00:00.000Z", retries: 0 }]);
    h.client.pull.mockResolvedValue(pull("someone-else"));
    await h.sync.init();
    expect(h.sync.state).toMatchObject({ phase: "error", isSyncReady: false });
    expect((await h.repository.read()).currentBookId).toBe("local-book");
    expect(await h.repository.getQueue()).toHaveLength(1);
    expect(h.client.push).not.toHaveBeenCalled();
  });

  it("allows a local-first upload only after a successful empty cloud pull", async () => {
    const h = coordinator({ userId: "kb_1", token: "at" });
    h.repository.switchUser("kb_1");
    await h.repository.transact((data) => {
      data.states.push({
        userId: "local", wordId: "w1", status: "learning", isIgnored: false, isDifficult: false,
        reviewCount: 1, lapseCount: 0, firstSeenAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z",
        card: { due: new Date("2026-09-23T00:00:00.000Z"), stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 1, last_review: new Date("2026-09-21T00:00:00.000Z") },
      });
    });
    h.client.pull.mockResolvedValue(pull("kb_1"));
    await h.sync.init();
    expect(h.client.push).not.toHaveBeenCalled();
    await expect(h.sync.flush("manual")).resolves.toBe(true);
    expect(h.client.push).toHaveBeenCalledTimes(1);
    expect(h.client.push.mock.calls[0][1].progress[0]).toMatchObject({ userId: "kb_1", wordId: "w1" });
  });

  it("merges guest learning into the canonical account only after a valid cloud pull", async () => {
    const h = coordinator({ userId: "kb_1", token: "at" });
    await h.repository.transact((data) => {
      data.logs.push({
        id: "guest-log", userId: "local", wordId: "guest-word", reviewedAt: "2026-09-20T00:00:00.000Z", rating: 3,
        responseTime: 10, studyMode: "new", clientCreatedAt: "2026-09-20T00:00:00.000Z",
        previousState: { userId: "local", wordId: "guest-word", status: "new", isIgnored: false, isDifficult: false, reviewCount: 0, lapseCount: 0, card: { due: new Date("2026-09-20T00:00:00.000Z"), stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 } },
        newState: { userId: "local", wordId: "guest-word", status: "learning", isIgnored: false, isDifficult: false, reviewCount: 1, lapseCount: 0, card: { due: new Date("2026-09-21T00:00:00.000Z"), stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 1, last_review: new Date("2026-09-20T00:00:00.000Z") } },
      });
    });
    h.client.pull.mockResolvedValue(pull("kb_1", [progress("kb_1", "cloud-word")]));
    await h.sync.init();
    const account = await h.repository.read();
    expect(account.logs.map((log) => log.id)).toContain("guest-log");
    expect(account.states.map((state) => state.wordId)).toEqual(expect.arrayContaining(["guest-word", "cloud-word"]));
    expect(account.logs[0].userId).toBe("kb_1");
    expect((await h.repository.read("data_guest")).logs).toEqual([]);
  });

  it("never gives the same guest learning to a second account", async () => {
    const h = coordinator();
    await h.repository.transact((data) => {
      data.states.push({
        userId: "local", wordId: "guest-only", status: "learning", isIgnored: false, isDifficult: false,
        reviewCount: 1, lapseCount: 0, updatedAt: "2026-09-21T00:00:00.000Z",
        card: { due: new Date("2026-09-23T00:00:00.000Z"), stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 1 },
      });
    });
    h.client.pull.mockImplementation(async (token: string) => pull(token === "a" ? "kb_a" : "kb_b"));
    await h.sync.activateSession({ userId: "kb_a", token: "a" });
    expect((await h.repository.read("data_user_kb_a")).states.map((state) => state.wordId)).toContain("guest-only");
    await h.sync.activateSession({ userId: "kb_b", token: "b" });
    expect((await h.repository.read("data_user_kb_b")).states.map((state) => state.wordId)).not.toContain("guest-only");
  });

  it("blocks readiness and preserves the outbox when a queue payload is invalid", async () => {
    const h = coordinator({ userId: "kb_1", token: "at" });
    h.repository.switchUser("kb_1");
    await h.repository.enqueue([{ id: "bad", type: "review_event", payload: null, createdAt: "2026-09-22T00:00:00.000Z", retries: 0 }]);
    h.client.pull.mockResolvedValue(pull("kb_1"));
    await h.sync.init();
    expect(h.sync.state).toMatchObject({ phase: "error", isSyncReady: false });
    expect(await h.repository.getQueue()).toHaveLength(1);
    expect(h.client.push).not.toHaveBeenCalled();
  });

  it("discards a late pull after an account generation changes", async () => {
    const h = coordinator();
    let resolveA!: (value: any) => void;
    h.client.pull.mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce(pull("kb_b", [progress("kb_b", "b-word")]));
    const a = h.sync.activateSession({ userId: "kb_a", token: "a" });
    await vi.waitFor(() => expect(h.client.pull).toHaveBeenCalledTimes(1));
    const b = h.sync.activateSession({ userId: "kb_b", token: "b" });
    resolveA(pull("kb_a", [progress("kb_a", "a-word")]));
    await Promise.all([a, b]);
    expect(h.sync.state).toMatchObject({ phase: "ready", userId: "kb_b", activeKey: "data_user_kb_b" });
    expect((await h.repository.read()).states.map((state) => state.wordId)).toEqual(["b-word"]);
    expect((await h.repository.read("data_user_kb_a")).states).toEqual([]);
  });
});
