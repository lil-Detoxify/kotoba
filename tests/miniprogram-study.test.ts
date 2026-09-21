import { describe, expect, it } from "vitest";
import { createEmptyCard, Rating } from "ts-fsrs";
import type { Data, WordState } from "@jp/models";
import { evaluate, initialState } from "@jp/core";
import { MiniProgramRepository, type StorageAdapter } from "../apps/miniprogram/src/adapters/storage";
import { applyStudyRating, getStudyQueue } from "../apps/miniprogram/src/pages/study/study-session";

const word = (id: string, lessonId = "l1") => ({ id, lessonId, term: id, reading: id, meaning: id, order: 1 });

function makeData(): Data {
  return {
    books: [
      { id: "b1", title: "Book 1", description: "", language: "ja", createdAt: "", updatedAt: "" },
      { id: "b2", title: "Book 2", description: "", language: "ja", createdAt: "", updatedAt: "" },
    ],
    lessons: [
      { id: "l1", bookId: "b1", title: "Lesson 1", order: 1 },
      { id: "l2", bookId: "b2", title: "Lesson 2", order: 2 },
    ],
    words: [word("w1"), word("w2", "l2"), word("w3"), word("w4")],
    states: [],
    logs: [],
    currentBookId: "b1",
    seeded: true,
  };
}

function state(wordId: string, changes: Partial<WordState> = {}): WordState {
  return { ...initialState(wordId), ...changes };
}

describe("mini program study session", () => {
  it("scopes new words by current book, keeps explicit lessons cross-book, and rejects invalid lessons", () => {
    const source = makeData();
    expect(getStudyQueue(source, "new").map((item) => item.id)).toEqual(["w1", "w3", "w4"]);
    expect(getStudyQueue(source, "new", "l2").map((item) => item.id)).toEqual(["w2"]);
    expect(getStudyQueue(source, "new", "missing")).toEqual([]);
  });

  it("filters review and difficult queues across books while excluding ignored cards", () => {
    const source = makeData();
    const due = new Date(Date.now() - 60_000).toISOString();
    source.states = [
      state("w1", { nextReviewAt: due }),
      state("w2", { nextReviewAt: due }),
      state("w3", { isDifficult: true }),
      state("w4", { isDifficult: true, isIgnored: true, nextReviewAt: due }),
    ];
    expect(getStudyQueue(source, "review").map((item) => item.id)).toEqual(["w1", "w2"]);
    expect(getStudyQueue(source, "difficult").map((item) => item.id)).toEqual(["w3"]);
  });

  it("matches real FSRS output for each of the four ratings", () => {
    for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
      const source = makeData();
      source.states.push(state("w1"));
      const now = new Date("2026-01-01T00:00:00.000Z");
      const expected = evaluate(source.states[0], rating as any, "new", now, "expected", 321);
      const actual = applyStudyRating(source, source.words[0], rating as any, "new", now, "actual", 321);
      expect(actual.state.card).toEqual(expected.state.card);
      expect(actual.state.reviewCount).toBe(1);
      expect(actual.log.rating).toBe(rating);
      expect(actual.log.responseTime).toBe(321);
      expect(actual.log.userId).toBe("local");
      expect(actual.state.bookId).toBe("b1");
      expect(actual.state.lessonId).toBe("l1");
    }
  });

  it("always rates the latest persisted state instead of a stale card snapshot", () => {
    const source = makeData();
    source.states.push(state("w1"));
    const first = applyStudyRating(source, source.words[0], Rating.Again, "new", new Date("2026-01-01"), "first");
    const second = applyStudyRating(source, source.words[0], Rating.Good, "review", new Date("2026-01-02"), "second");
    expect(first.state.reviewCount).toBe(1);
    expect(second.state.reviewCount).toBe(2);
    expect(source.states).toHaveLength(1);
    expect(source.logs.map((log) => log.id)).toEqual(["first", "second"]);
    expect(second.log.previousState.reviewCount).toBe(1);
  });

  it("restores persisted card dates so the next FSRS rating remains executable", async () => {
    let raw = "";
    const storage: StorageAdapter = {
      async getItem() { return raw || null; },
      async setItem(_key, value) { raw = value; },
      async removeItem() { raw = ""; },
    };
    const source = makeData();
    source.states.push(state("w1", { card: createEmptyCard(new Date("2026-01-01")) }));
    const repository = new MiniProgramRepository(storage);
    await repository.transact((data) => Object.assign(data, source));
    const restored = await repository.read();
    expect(restored.states[0].card.due).toBeInstanceOf(Date);
    expect(() => applyStudyRating(restored, restored.words[0], Rating.Good, "review")).not.toThrow();
  });
});
