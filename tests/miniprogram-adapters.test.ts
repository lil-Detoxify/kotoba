import { describe, it, expect, beforeEach } from "vitest";
import { MiniProgramRepository, type StorageAdapter } from "../apps/miniprogram/src/adapters/storage";
import { evaluate, initialState, statistics, getDueWords } from "@jp/core";
import { Rating } from "ts-fsrs";
import seedData from "../apps/miniprogram/src/seed.json";

class MockMemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe("Mini Program Runtime Adapter & FSRS Integration", () => {
  let storage: MockMemoryStorage;
  let repo: MiniProgramRepository;

  beforeEach(() => {
    storage = new MockMemoryStorage();
    repo = new MiniProgramRepository(storage);
  });

  it("seeds initial data and reads via MiniProgramRepository without window/document", async () => {
    const initial = await repo.read();
    expect(initial.books.length).toBe(0);

    const seeded = await repo.transact((d) => {
      d.books = seedData.books as any;
      d.lessons = seedData.lessons as any;
      d.words = seedData.words as any;
      d.currentBookId = seedData.books[0]?.id;
      d.seeded = true;
    });

    expect(seeded.books.length).toBe(1);
    expect(seeded.books[0].title).toBe("日语测试词书");
    expect(seeded.words.length).toBe(48);

    const stats = statistics(seeded, new Date());
    expect(stats.total).toBe(48);
    expect(stats.learned).toBe(0);
    expect(stats.due).toBe(0);
  });

  it("updates WordState with FSRS evaluate() and persists to storage adapter", async () => {
    await repo.transact((d) => {
      d.books = seedData.books as any;
      d.lessons = seedData.lessons as any;
      d.words = seedData.words as any;
      d.seeded = true;
    });

    const firstWord = seedData.words[0];
    const prev = initialState(firstWord.id);
    const now = new Date();
    const evalResult = evaluate(prev, Rating.Good, "new", now, "log_test_1");

    expect(evalResult.state.status).toBe("learning");
    expect(evalResult.state.reviewCount).toBe(1);
    expect(evalResult.state.nextReviewAt).toBeDefined();

    await repo.transact((d) => {
      d.states.push(evalResult.state);
      d.logs.push(evalResult.log);
    });

    const refreshed = await repo.read();
    expect(refreshed.states.length).toBe(1);
    expect(refreshed.states[0].wordId).toBe(firstWord.id);
    expect(refreshed.states[0].reviewCount).toBe(1);

    const stats = statistics(refreshed, now);
    expect(stats.learned).toBe(1);
  });

  it("manages offline sync queue correctly", async () => {
    expect(await repo.getQueue()).toEqual([]);

    await repo.enqueue([
      {
        id: "q_1",
        type: "review_event",
        payload: { wordId: "w1", rating: 3 },
        createdAt: new Date().toISOString(),
        retries: 0
      }
    ]);

    let queue = await repo.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe("q_1");

    await repo.dequeue(["q_1"]);
    queue = await repo.getQueue();
    expect(queue.length).toBe(0);
  });
});
