import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { initialState } from "@jp/core";
import type { Data, ReviewLog } from "@jp/models";
import { MiniProgramRepository, type StorageAdapter } from "../apps/miniprogram/src/adapters/storage";
import { TextbookService, parseTextbook, textbookCatalog, textbookVersion } from "../apps/miniprogram/src/services/textbooks";
import { bookPresentation, fullBookTitle } from "../apps/miniprogram/src/services/book-presentation";

const webBooks = JSON.parse(readFileSync(new URL("../apps/web/public/data/books/index.json", import.meta.url), "utf8"))
  .books as Array<{ id: string; title: string; description: string; wordCount: number; lessons: Array<{ id: string; title: string; order: number; wordCount: number }> }>;
const readBook = (id: string) => JSON.parse(readFileSync(new URL(`../apps/web/public/data/books/${id}.json`, import.meta.url), "utf8"));
const jlptBooks = textbookCatalog.filter((book) => book.id.startsWith("jlpt-"));

function setup() {
  const values = new Map<string, string>();
  const storage: StorageAdapter = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  const repository = new MiniProgramRepository(storage);
  const request = vi.fn(async () => { throw new Error("unexpected network request"); });
  return { repository, request, service: new TextbookService(repository, { request }) };
}

describe("mini-program JLPT textbook data", () => {
  it("uses the published 11-book directory and excludes non-built-in test books", () => {
    expect(textbookCatalog.map((book) => book.id)).toEqual(webBooks.map((book) => book.id));
    expect(textbookCatalog).toEqual(webBooks);
    expect(textbookCatalog).toHaveLength(11);
    expect(textbookVersion).toBe("biaori-v2");
    expect(textbookCatalog.some((book) => /test|测试/i.test(`${book.id} ${book.title}`))).toBe(false);
    for (const id of textbookCatalog.slice(0, 6).map((book) => book.id)) {
      const local = textbookCatalog.find((book) => book.id === id)!;
      const published = webBooks.find((book) => book.id === id)!;
      expect(local.lessons.map((lesson) => [lesson.id, lesson.order, lesson.wordCount]))
        .toEqual(published.lessons.map((lesson) => [lesson.id, lesson.order, lesson.wordCount]));
    }
  });

  it("parses all five JLPT books with the same stable source IDs as Web", () => {
    expect(jlptBooks.map((book) => book.id)).toEqual(["jlpt-n5", "jlpt-n4", "jlpt-n3", "jlpt-n2", "jlpt-n1"]);
    const allIds = new Set<string>();
    const allSources = new Set<string>();
    let total = 0;
    for (const book of jlptBooks) {
      const source = readBook(book.id);
      const words = parseTextbook(source, book.id);
      const sourceIds = source.lessons.flatMap((lesson: any) => lesson.words.map((word: any) => word.sourceId));
      expect(words).toHaveLength(book.wordCount);
      expect(words.map((word) => word.id)).toEqual(sourceIds.map((sourceId: string) => `${book.id}-w-${sourceId}`));
      expect(words.every((word) => word.lessonId.startsWith(`${book.id}-l-`))).toBe(true);
      for (const sourceId of sourceIds) {
        expect(sourceId).toMatch(/^[a-f0-9]{10}$/);
        expect(allSources.has(sourceId)).toBe(false);
        allSources.add(sourceId);
      }
      for (const word of words) {
        expect(allIds.has(word.id)).toBe(false);
        allIds.add(word.id);
      }
      total += words.length;
    }
    expect(total).toBe(7_809);
    expect(allSources).toHaveLength(7_809);
  });

  it("rejects missing, malformed, repeated, or legacy numeric JLPT source IDs", () => {
    const missing = structuredClone(readBook("jlpt-n5"));
    delete missing.lessons[0].words[0].sourceId;
    expect(() => parseTextbook(missing, "jlpt-n5")).toThrow();

    const malformed = structuredClone(readBook("jlpt-n5"));
    malformed.lessons[0].words[0].sourceId = "../wrong-id";
    expect(() => parseTextbook(malformed, "jlpt-n5")).toThrow();

    const repeated = structuredClone(readBook("jlpt-n5"));
    repeated.lessons[0].words[1].sourceId = repeated.lessons[0].words[0].sourceId;
    expect(() => parseTextbook(repeated, "jlpt-n5")).toThrow();

    const legacy = structuredClone(readBook("jlpt-n5"));
    legacy.lessons[0].words[0].sourceIndex = 0;
    expect(() => parseTextbook(legacy, "jlpt-n5")).toThrow();
  });

  it("hydrates the five new directory entries without changing downloaded words or progress", async () => {
    const { repository, request, service } = setup();
    const legacyCatalog = textbookCatalog.filter((book) => book.id.startsWith("biaori-"));
    const firstBook = legacyCatalog[0];
    const loadedWords = parseTextbook(readBook(firstBook.id), firstBook.id);
    const word = loadedWords[0];
    const previousState = initialState(word.id);
    const learnedState = {
      ...previousState,
      bookId: firstBook.id,
      lessonId: word.lessonId,
      firstSeenAt: "2026-10-01T00:00:00.000Z",
      reviewCount: 1,
      isDifficult: true,
    };
    const log: ReviewLog = {
      id: "preserved-log",
      userId: "local",
      wordId: word.id,
      reviewedAt: "2026-10-01T00:00:00.000Z",
      rating: 3,
      responseTime: 900,
      previousState,
      newState: learnedState,
      studyMode: "new",
    };
    const baseline: Data = {
      books: legacyCatalog.map((book) => ({ id: book.id, title: book.title, description: book.description, language: "ja", createdAt: "2026-01-01", updatedAt: "2026-01-01" })),
      lessons: legacyCatalog.flatMap((book) => book.lessons.map((lesson) => ({ id: lesson.id, bookId: book.id, title: lesson.title, order: lesson.order }))),
      words: loadedWords,
      states: [learnedState],
      logs: [log],
      currentBookId: legacyCatalog[3].id,
      currentBookIdSource: "user",
      currentBookIdUpdatedAt: "2026-09-30T00:00:00.000Z",
      seeded: true,
      textbooksVersion: "biaori-v2",
      textbooksWordsVersion: "biaori-v2",
      userSettings: { userId: "local", currentBookId: legacyCatalog[3].id, currentBookIdSource: "user", updatedAt: "2026-09-30T00:00:00.000Z" },
    };
    await repository.transact((data) => { Object.assign(data, structuredClone(baseline)); });
    const queueBefore = await repository.getQueue();

    const result = await service.hydrate();

    expect(request).not.toHaveBeenCalled();
    expect(result.books).toHaveLength(11);
    expect(result.lessons).toHaveLength(263);
    expect(result.words).toEqual(loadedWords);
    expect(result.states).toEqual([learnedState]);
    expect(result.logs).toEqual([log]);
    expect(result.currentBookId).toBe(legacyCatalog[3].id);
    expect(result.currentBookIdSource).toBe("user");
    expect(result.userSettings).toEqual(baseline.userSettings);
    expect(result.textbooksVersion).toBe("biaori-v2");
    expect(result.textbooksWordsVersion).toBe("biaori-v2");
    expect(await repository.getQueue()).toEqual(queueBefore);
    expect(result.books[0].title).toBe(firstBook.title);
    expect(fullBookTitle(result.books[0])).toBe("新版标准日本语初级上册");
    expect(bookPresentation({ id: "jlpt-n5", title: "JLPT N5 备考词汇", description: "" })).toMatchObject({ volume: "N5", scene: "garden", exam: true });
  });
});
