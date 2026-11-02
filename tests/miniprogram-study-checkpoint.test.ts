import { describe, expect, it } from "vitest";
import { emptyData, type Word } from "@jp/models";
import { initialState } from "@jp/core";
import type { StorageAdapter } from "../apps/miniprogram/src/adapters/types";
import {
  createMiniStudyCheckpoint,
  MINI_STUDY_CHECKPOINT_KEY_PREFIX,
  resolveMiniStudyCheckpoint,
  type MiniStudyCheckpoint,
} from "../apps/miniprogram/src/services/study-checkpoint";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: Pick<StorageAdapter, "getItem" | "setItem" | "removeItem"> = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  return { storage, values };
}

function checkpoint(overrides: Partial<MiniStudyCheckpoint> = {}): MiniStudyCheckpoint {
  return {
    version: 1,
    owner: "user-a",
    bookIds: ["book-a"],
    wordIds: ["word-1", "word-2"],
    mode: "new",
    exercise: "card",
    updatedAt: "2026-10-14T08:00:00.000Z",
    ...overrides,
  };
}

function word(id: string, order: number, lessonId = "lesson-a"): Word {
  return { id, lessonId, term: id, reading: "ことば", meaning: "测试", order };
}

describe("Mini Program study checkpoint", () => {
  it("persists per owner and deduplicates saved IDs", async () => {
    const { storage, values } = memoryStorage();
    const service = createMiniStudyCheckpoint(storage);
    const saved = checkpoint({
      bookIds: ["book-a", "book-b", "book-a"],
      wordIds: ["word-1", "word-2", "word-1"],
      dailyBookId: "book-a",
      lessonId: "lesson-a",
    });

    await service.save(saved);
    const expectedKey = `${MINI_STUDY_CHECKPOINT_KEY_PREFIX}${encodeURIComponent("user-a")}`;
    expect(values.has(expectedKey)).toBe(true);
    expect(await service.load("user-a")).toEqual({
      ...saved,
      bookIds: ["book-a", "book-b"],
      wordIds: ["word-1", "word-2"],
    });
    expect(await service.load("user-b")).toBeNull();
  });

  it("keeps selected original-sentence IDs only for queued words", async () => {
    const { storage } = memoryStorage();
    const service = createMiniStudyCheckpoint(storage);
    const saved = checkpoint({
      readingContextIds: { "word-1": "context-a", "word-2": "context-b" },
    });

    await service.save(saved);
    expect(await service.load("user-a")).toEqual(saved);
    await expect(service.save(checkpoint({ readingContextIds: { "word-3": "context-c" } })))
      .rejects.toThrow("Invalid study checkpoint");
    await expect(service.save(checkpoint({ readingContextIds: { "word-1": "" } })))
      .rejects.toThrow("Invalid study checkpoint");
  });

  it("ignores malformed JSON and invalid fields without touching another account", async () => {
    const userB = checkpoint({ owner: "user-b", wordIds: ["word-b"] });
    const keyA = `${MINI_STUDY_CHECKPOINT_KEY_PREFIX}${encodeURIComponent("user-a")}`;
    const keyB = `${MINI_STUDY_CHECKPOINT_KEY_PREFIX}${encodeURIComponent("user-b")}`;
    const { storage, values } = memoryStorage({ [keyA]: "{bad json", [keyB]: JSON.stringify(userB) });
    const service = createMiniStudyCheckpoint(storage);

    expect(await service.load("user-a")).toBeNull();
    expect(values.get(keyA)).toBe("{bad json");
    expect(await service.load("user-b")).toEqual(userB);
    await expect(service.save(checkpoint({ exercise: "auto" as MiniStudyCheckpoint["exercise"] }))).rejects.toThrow("Invalid study checkpoint");
    expect(values.get(keyB)).toBe(JSON.stringify(userB));
  });

  it("resolves only saved IDs in saved order, skipping missing and ignored words", () => {
    const data = emptyData();
    data.words = [word("word-1", 1), word("word-2", 2), word("word-3", 3), word("unlisted", 4)];
    data.states.push({ ...initialState("word-2"), isIgnored: true });
    const saved = checkpoint({ mode: "difficult", wordIds: ["word-3", "missing", "word-2", "word-1", "unlisted"] });

    const resolved = resolveMiniStudyCheckpoint(data, saved);
    expect(resolved.map((item) => item.id)).toEqual(["word-3", "word-1", "unlisted"]);
    expect(resolved[0]).toBe(data.words[2]);
  });

  it("skips previously seen words only for new mode while keeping learned difficult words", () => {
    const data = emptyData();
    data.words = [word("new", 1), word("seen", 2), word("reviewed", 3), word("difficult", 4)];
    data.states.push(
      { ...initialState("seen"), firstSeenAt: "2026-10-10T00:00:00.000Z" },
      { ...initialState("reviewed"), reviewCount: 1 },
      { ...initialState("difficult"), firstSeenAt: "2026-10-10T00:00:00.000Z", isDifficult: true },
    );
    const ids = ["new", "seen", "reviewed", "difficult"];

    expect(resolveMiniStudyCheckpoint(data, checkpoint({ mode: "new", wordIds: ids })).map((item) => item.id)).toEqual(["new"]);
    expect(resolveMiniStudyCheckpoint(data, checkpoint({ mode: "difficult", sceneId: "scene-a", wordIds: ids })).map((item) => item.id)).toEqual(ids);
  });

  it("clears only the selected owner's checkpoint", async () => {
    const userB = checkpoint({ owner: "user-b", wordIds: ["word-b"] });
    const { storage, values } = memoryStorage();
    const service = createMiniStudyCheckpoint(storage);
    await service.save(checkpoint());
    await service.save(userB);

    await service.clear("user-a");
    expect(await service.load("user-a")).toBeNull();
    expect(await service.load("user-b")).toEqual(userB);
    expect(values.size).toBe(1);
  });
});
