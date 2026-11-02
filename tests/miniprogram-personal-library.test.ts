import { describe, expect, it, vi } from "vitest";
import { emptyData, type Data, type ReadingContext } from "@jp/models";
import { initialState } from "@jp/core";
import type { MiniProgramRepositoryContract } from "../apps/miniprogram/src/adapters/types";
import {
  MINI_BUILTIN_BOOK_IDS,
  createMiniPersonalLibraryService,
} from "../apps/miniprogram/src/services/personal-library";
import type { PersonalLibrary } from "../apps/miniprogram/src/services/personal-library";

const stamp = "2026-10-14T00:00:00.000Z";

class MemoryRepository {
  activeKey = "account-a";
  snapshots = new Map<string, Data>();
  transact = vi.fn(async (change: (data: Data) => void, key = this.activeKey) => {
    const data = this.snapshot(key);
    change(data);
    this.snapshots.set(key, data);
    return structuredClone(data);
  });
  read = vi.fn(async (key = this.activeKey) => structuredClone(this.snapshot(key)));
  getActiveKey = vi.fn(() => this.activeKey);

  snapshot(key: string): Data {
    return this.snapshots.get(key) ?? emptyData();
  }
}

function makeService(seed: (data: Data) => void = () => {}, options: { switchOnEnsure?: string } = {}) {
  const repository = new MemoryRepository();
  const initial = emptyData();
  seed(initial);
  repository.snapshots.set("account-a", initial);
  repository.snapshots.set("account-b", emptyData());
  const books = {
    hydrate: vi.fn(async (key: string) => repository.read(key)),
    ensureBookLoaded: vi.fn(async (bookId: string, key = repository.activeKey) => {
      if (!repository.snapshot(key).books.some((book) => book.id === bookId)) {
        await repository.transact((data) => {
          const book = { id: bookId, title: "Demo", description: "", language: "ja", createdAt: stamp, updatedAt: stamp };
          const lesson = { id: `${bookId}-lesson-1`, bookId, title: "第 1 课", order: 1 };
          data.books.push(book);
          data.lessons.push(lesson);
          data.words.push({ id: `${bookId}-w-1`, lessonId: lesson.id, order: 1, term: "駅", reading: "えき", meaning: "车站" });
        }, key);
      }
      if (options.switchOnEnsure) repository.activeKey = options.switchOnEnsure;
      return repository.read(key);
    }),
  };
  let serial = 0;
  const service = createMiniPersonalLibraryService({
    repository: repository as unknown as Pick<MiniProgramRepositoryContract, "getActiveKey" | "read" | "transact">,
    textbooks: books,
    createId: (kind) => `created-${kind}-${++serial}`,
    now: () => new Date(stamp),
  });
  return { service, repository, books };
}

function context(id = "context-a", sentence = "駅で切符を買います。", sourceUrl?: string): ReadingContext {
  return {
    id, sentence, sourceUrl, createdAt: stamp, updatedAt: stamp,
  };
}

function packageWithBuiltinContext(): PersonalLibrary {
  return {
    kind: "kotobud-personal-library",
    version: 1,
    exportedAt: stamp,
    books: [{ id: "personal-book-1", title: "旅の言葉", description: "旅行", language: "ja", createdAt: stamp, updatedAt: stamp }],
    lessons: [{ id: "personal-lesson-1", bookId: "personal-book-1", title: "移動", order: 1 }],
    words: [{ id: "personal-word-1", lessonId: "personal-lesson-1", term: "切符", reading: "きっぷ", meaning: "车票", order: 1 }],
    builtinContexts: [{ bookId: "demo-jp", wordId: "demo-jp-w-1", contexts: [context()] }],
  };
}

describe("Mini personal library service", () => {
  it("shares the eleven catalog books plus demo as builtin IDs", () => {
    expect(MINI_BUILTIN_BOOK_IDS).toHaveLength(12);
    expect(MINI_BUILTIN_BOOK_IDS).toContain("demo-jp");
    expect(new Set(MINI_BUILTIN_BOOK_IDS).size).toBe(12);
  });

  it("exports personal books and saved contexts without learning state or account settings", async () => {
    const saved = context("saved-context", "駅前で友だちを待ちます。", "https://example.com/lesson");
    const { service } = makeService((data) => {
      data.books.push(
        { id: "demo-jp", title: "Demo", description: "", language: "ja", createdAt: stamp, updatedAt: stamp },
        { id: "personal-book", title: "我的词书", description: "", language: "ja", createdAt: stamp, updatedAt: stamp },
      );
      data.lessons.push(
        { id: "demo-lesson", bookId: "demo-jp", title: "第 1 课", order: 1 },
        { id: "personal-lesson", bookId: "personal-book", title: "第 1 课", order: 1 },
      );
      data.words.push(
        { id: "demo-jp-w-1", lessonId: "demo-lesson", term: "駅", reading: "えき", meaning: "车站", order: 1, readingContexts: [saved] },
        { id: "personal-word", lessonId: "personal-lesson", term: "切符", reading: "きっぷ", meaning: "车票", order: 1 },
      );
      data.states.push({ ...initialState("personal-word", new Date(stamp), "account-a"), bookId: "personal-book", lessonId: "personal-lesson" });
      data.currentBookId = "personal-book";
      data.userSettings = { userId: "account-a", currentBookId: "personal-book", updatedAt: stamp };
    });

    const library = await service.exportMiniPersonalLibrary("account-a");
    expect(library.books.map((book) => book.id)).toEqual(["personal-book"]);
    expect(library.words.map((word) => word.id)).toEqual(["personal-word"]);
    expect(library.builtinContexts).toEqual([{ bookId: "demo-jp", wordId: "demo-jp-w-1", contexts: [saved] }]);
    expect(JSON.stringify(library)).not.toContain("currentBookId");
    expect(JSON.stringify(library)).not.toContain('"states"');
  });

  it("previews and merges package content while preserving local FSRS records and context", async () => {
    const existingContext = context("context-a", "駅の近くにいます。");
    const state = { ...initialState("demo-jp-w-1", new Date(stamp), "account-a"), reviewCount: 3, bookId: "demo-jp", lessonId: "demo-jp-lesson-1" };
    const { service, repository, books } = makeService((data) => {
      data.currentBookId = "demo-jp";
      data.states.push(state);
      data.words.push({ id: "demo-jp-w-1", lessonId: "demo-jp-lesson-1", term: "駅", reading: "えき", meaning: "车站", order: 1, readingContexts: [existingContext] });
      data.books.push({ id: "demo-jp", title: "Demo", description: "", language: "ja", createdAt: stamp, updatedAt: stamp });
      data.lessons.push({ id: "demo-jp-lesson-1", bookId: "demo-jp", title: "第 1 课", order: 1 });
    });
    const library = packageWithBuiltinContext();

    const preview = await service.previewMiniPersonalLibrary(library, "account-a");
    expect(preview).toMatchObject({ newBooks: 1, newLessons: 1, newWords: 1, existingContexts: 1 });
    const merged = await service.mergeMiniPersonalLibrary(library, "keep-local", "account-a");
    const after = repository.snapshot("account-a");
    expect(merged.bookIds).toEqual(["personal-book-1"]);
    expect(after.currentBookId).toBe("demo-jp");
    expect(after.states).toEqual([state]);
    expect(after.words.find((word) => word.id === "demo-jp-w-1")?.readingContexts).toEqual([existingContext]);
    expect(after.words.some((word) => word.id === "personal-word-1")).toBe(true);
    expect(books.ensureBookLoaded).toHaveBeenCalledWith("demo-jp", "account-a");
    expect(repository.transact).toHaveBeenCalledTimes(1);
  });

  it("keeps the captured account key when loading a builtin context switches the active account", async () => {
    const { service, repository, books } = makeService(undefined, { switchOnEnsure: "account-b" });
    const library = packageWithBuiltinContext();
    await service.mergeMiniPersonalLibrary(library, "keep-local", "account-a");

    expect(repository.activeKey).toBe("account-b");
    expect(books.ensureBookLoaded).toHaveBeenCalledWith("demo-jp", "account-a");
    expect(repository.snapshot("account-a").books.some((book) => book.id === "personal-book-1")).toBe(true);
    expect(repository.snapshot("account-b").books).toEqual([]);
    expect(repository.transact).toHaveBeenLastCalledWith(expect.any(Function), "account-a");
  });

  it("creates, deduplicates, and edits words without changing IDs or existing learning records", async () => {
    const state = { ...initialState("created-word-3", new Date(stamp), "account-a"), reviewCount: 2 };
    const { service, repository } = makeService((data) => { data.states.push(state); });
    const created = await service.createMiniPersonalBook("旅行词汇", "旅途中会用到");
    const first = await service.addMiniPersonalWords(created.bookId, [
      { term: "切符", reading: "キップ", meaning: "车票" },
      { term: "切符", reading: "きっぷ", meaning: "车票" },
    ], { lessonId: created.lessonId });
    expect(first).toMatchObject({ added: 1, skipped: 1, lessonId: created.lessonId });
    const word = repository.snapshot("account-a").words.find((item) => item.term === "切符")!;
    await service.updateMiniPersonalWord(word.id, { term: "乗車券", reading: "じょうしゃけん", meaning: "乘车券" });
    const after = repository.snapshot("account-a");
    expect(after.words.filter((item) => item.id === word.id)).toHaveLength(1);
    expect(after.words.find((item) => item.id === word.id)).toMatchObject({ term: "乗車券", reading: "じょうしゃけん", meaning: "乘车券" });
    expect(after.states).toEqual([state]);
  });

  it("requires explicit confirmation and deletes only the selected book with its records", async () => {
    const { service, repository } = makeService((data) => {
      data.books.push(
        { id: "one", title: "One", description: "", language: "ja", createdAt: stamp, updatedAt: stamp },
        { id: "two", title: "Two", description: "", language: "ja", createdAt: stamp, updatedAt: stamp },
      );
      data.lessons.push(
        { id: "one-lesson", bookId: "one", title: "第 1 课", order: 1 },
        { id: "two-lesson", bookId: "two", title: "第 1 课", order: 1 },
      );
      data.words.push(
        { id: "one-word", lessonId: "one-lesson", term: "一", reading: "いち", meaning: "一", order: 1 },
        { id: "two-word", lessonId: "two-lesson", term: "二", reading: "に", meaning: "二", order: 1 },
      );
      data.states.push({ ...initialState("one-word", new Date(stamp), "account-a") });
      data.currentBookId = "one";
    });
    await expect(service.deleteMiniPersonalBook("one")).rejects.toThrow("再次确认");
    const deleted = await service.deleteMiniPersonalBook("one", true);
    const after = repository.snapshot("account-a");
    expect(deleted).toMatchObject({ wordCount: 1, learningRecordCount: 1 });
    expect(after.books.map((book) => book.id)).toEqual(["two"]);
    expect(after.words.map((word) => word.id)).toEqual(["two-word"]);
    expect(after.states).toEqual([]);
    expect(after.currentBookId).toBeUndefined();
  });

  it("previews pasted tabular and JSON rows with line errors and retains optional examples", () => {
    const { service } = makeService();
    const pasted = service.previewMiniWordImport("词形\t读音\t中文释义\n切符\tきっぷ\t车票\n駅\tえき", "默认分组");
    expect(pasted.rows).toEqual([{ term: "切符", reading: "きっぷ", meaning: "车票", lesson: "默认分组" }]);
    expect(pasted.errors).toEqual([{ row: 3, message: "缺少中文释义。" }]);

    const json = service.previewMiniWordImport(JSON.stringify([
      { lesson: "交通", term: "改札", reading: "かいさつ", meaning: "检票口", example: "改札を通る" },
      { lesson: "交通", term: "不完整", reading: "ふかんぜん", meaning: "" },
    ]), "默认分组");
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0]).toMatchObject({ term: "改札", lesson: "交通", example: "改札を通る" });
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].row).toBe(2);
  });
});
