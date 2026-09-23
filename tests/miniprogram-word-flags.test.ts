import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initialState } from "@jp/core";
import { emptyData } from "@jp/models";
import { MiniProgramRepository, type StorageAdapter } from "../apps/miniprogram/src/adapters/storage";
import { setDifficult, setIgnored } from "../apps/miniprogram/src/services/word-flags";

function setup() {
  const values = new Map<string, string>();
  const storage: StorageAdapter = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  return { storage, repository: new MiniProgramRepository(storage) };
}

describe("mini-program ignored-word list", () => {
  it("persists ignore and restore changes with progress outbox records", async () => {
    const { storage, repository } = setup();
    const data = emptyData();
    data.books.push({ id: "book", title: "Book", description: "", language: "ja", createdAt: "2026-01-01", updatedAt: "2026-01-01" });
    data.lessons.push({ id: "lesson", bookId: "book", title: "Lesson", order: 1 });
    data.words.push({ id: "word", lessonId: "lesson", term: "言葉", reading: "ことば", meaning: "词语", order: 1 });
    data.states.push({ ...initialState("word"), isDifficult: true, reviewCount: 3 });
    await repository.transact((current) => Object.assign(current, data));

    const ignored = await setIgnored("word", true, repository);
    expect(ignored.states[0]).toMatchObject({ isIgnored: true, isDifficult: true, reviewCount: 3, bookId: "book", lessonId: "lesson" });
    expect(ignored.states[0].ignoredUpdatedAt).toBeTruthy();
    expect(ignored.states[0].updatedAt).toBe(ignored.states[0].ignoredUpdatedAt);
    expect((await repository.getQueue()).at(-1)).toMatchObject({ type: "progress", payload: { wordId: "word", isIgnored: true } });

    // Re-open through a new repository instance to verify both local state and
    // its pending sync item survive application reconstruction.
    const reopened = new MiniProgramRepository(storage);
    expect((await reopened.read()).states[0].isIgnored).toBe(true);
    expect((await reopened.getQueue()).some((item) => item.type === "progress" && item.payload.isIgnored)).toBe(true);

    const restored = await setIgnored("word", false, reopened);
    expect(restored.states[0]).toMatchObject({ isIgnored: false, isDifficult: true, reviewCount: 3 });
    expect(restored.states[0].ignoredUpdatedAt).toBeTruthy();
    expect((await reopened.getQueue()).at(-1)).toMatchObject({ type: "progress", payload: { wordId: "word", isIgnored: false } });
  });

  it("keeps separate difficult-word removal behavior and exposes both list modes", async () => {
    const { repository } = setup();
    await repository.transact((data) => {
      data.words.push({ id: "word", lessonId: "lesson", term: "言葉", reading: "ことば", meaning: "词语", order: 1 });
      data.lessons.push({ id: "lesson", bookId: "book", title: "Lesson", order: 1 });
      data.states.push({ ...initialState("word"), isDifficult: true, isIgnored: true });
    });
    const changed = await setDifficult("word", false, repository);
    expect(changed.states[0]).toMatchObject({ isDifficult: false, isIgnored: true });

    const source = readFileSync(new URL("../apps/miniprogram/src/pages/lists/lists.vue", import.meta.url), "utf8");
    expect(source).toContain("已忽略");
    expect(source).toContain("恢复学习");
    expect(source).toContain("setIgnored(wordId, false)");
    expect(source).toContain("state.isDifficult && !state.isIgnored");
  });
});
