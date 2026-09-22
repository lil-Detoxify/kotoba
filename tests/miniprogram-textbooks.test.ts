import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { initialState } from "@jp/core";
import { MiniProgramRepository, type StorageAdapter } from "../apps/miniprogram/src/adapters/storage";
import { TextbookService, isBookLoaded, parseTextbook, textbookCatalog } from "../apps/miniprogram/src/services/textbooks";
import { setDifficult } from "../apps/miniprogram/src/services/word-flags";
import { textbookWordId } from "../packages/importers/src/textbooks";
import seed from "../apps/miniprogram/src/seed.json";

const bookId = textbookCatalog[0].id;
function payload(id = bookId) {
  return JSON.parse(readFileSync(new URL(`../apps/web/public/data/books/${id}.json`, import.meta.url), "utf8"));
}
function setup() {
  const values = new Map<string, string>();
  const storage: StorageAdapter = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  const repository = new MiniProgramRepository(storage);
  const request = vi.fn(async (url: string) => payload(url.split("/").pop()!.split(".json")[0]));
  const service = new TextbookService(repository, { request });
  return { service, repository, request, values };
}

describe("complete mini-program textbooks", () => {
  it("validates all six real artifacts and preserves stable IDs and rawTerm", () => {
    let total = 0;
    for (const book of textbookCatalog) {
      const source = payload(book.id);
      const words = parseTextbook(source, book.id);
      expect(words).toHaveLength(book.wordCount);
      const expected = source.lessons.flatMap((lesson: any) => lesson.words.map((word: any) =>
        textbookWordId(book.id, lesson.order, word.sourceIndex)));
      expect(words.map((word) => word.id)).toEqual(expected);
      for (const lesson of source.lessons) for (const word of lesson.words) {
        if (word.rawTerm) expect(words.find((entry) => entry.id === textbookWordId(book.id, lesson.order, word.sourceIndex))?.rawTerm).toBe(word.rawTerm);
      }
      total += words.length;
    }
    expect(total).toBe(9117);
  });

  it("rejects truncated, duplicate, mismatched and malformed remote books", () => {
    const malformed = [null, "html error", { ...payload(), id: "other" }];
    for (const value of malformed) expect(() => parseTextbook(value, bookId)).toThrow();
    const short = payload(); short.lessons[0].words.pop();
    expect(() => parseTextbook(short, bookId)).toThrow();
    const duplicate = payload(); duplicate.lessons[0].words[1].sourceIndex = 0;
    expect(() => parseTextbook(duplicate, bookId)).toThrow();
    const badWord = payload(); badWord.lessons[0].words[0].meaning = 42;
    expect(() => parseTextbook(badWord, bookId)).toThrow();
  });

  it("hydrates a lightweight directory without downloading or marking words cached", async () => {
    const { service, request } = setup();
    const data = await service.hydrate();
    expect(data.books).toHaveLength(6);
    expect(data.lessons).toHaveLength(104);
    expect(data.words).toEqual([]);
    expect(data.currentBookIdSource).toBe("default");
    expect(isBookLoaded(data, bookId)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves demo words and learned progress when adding the official directory", async () => {
    const { service, repository } = setup();
    await repository.transact((data) => {
      Object.assign(data, JSON.parse(JSON.stringify(seed)), { seeded: true, currentBookId: "demo-jp" });
      data.states.push({ ...initialState(seed.words[0].id), isDifficult: true });
    });
    const data = await service.hydrate();
    expect(data.words).toHaveLength(48);
    expect(data.states[0].isDifficult).toBe(true);
    expect(data.currentBookId).toBe(bookId);
  });

  it("deduplicates concurrent book requests and reopens cached books completely offline", async () => {
    const { service, repository, request } = setup();
    const [first, second] = await Promise.all([service.ensureBookLoaded(bookId), service.ensureBookLoaded(bookId)]);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(`/data/books/${bookId}.json?v=biaori-v2`);
    expect(first.words).toHaveLength(1077);
    expect(second.words).toEqual(first.words);
    request.mockRejectedValue(new Error("offline"));
    const reopened = new TextbookService(repository, { request });
    expect(isBookLoaded(await reopened.prepareStudy(textbookCatalog[0].lessons[0].id), bookId)).toBe(true);
    expect(request).toHaveBeenCalledOnce();
  });

  it("loads all six books concurrently without losing any other book or progress", async () => {
    const { service, repository } = setup();
    await repository.transact((data) => { data.states.push(initialState("kept")); });
    await Promise.all(textbookCatalog.map((book) => service.ensureBookLoaded(book.id)));
    const all = await repository.read();
    expect(all.words).toHaveLength(9117);
    expect(all.states[0].wordId).toBe("kept");
    expect(textbookCatalog.every((book) => isBookLoaded(all, book.id))).toBe(true);
    expect(all.currentBookIdSource).toBe("default");
  });

  it("does not change selected book or replace words after failed/invalid download", async () => {
    const { service, repository, request } = setup();
    const original = await service.selectBook(bookId);
    request.mockResolvedValue({ unexpected: "response" });
    await expect(service.selectBook(textbookCatalog[1].id)).rejects.toThrow();
    const result = await repository.read();
    expect(result.words).toEqual(original.words);
    expect(result.currentBookId).toBe(bookId);
    expect(result.currentBookIdSource).toBe("user");
  });

  it("keeps explicit selection and stored settings intact during catalog hydrate", async () => {
    const { service, repository } = setup();
    await repository.transact((data) => {
      data.currentBookId = textbookCatalog[3].id;
      data.currentBookIdSource = "user";
      data.currentBookIdUpdatedAt = "2026-01-01T00:00:00Z";
    });
    expect((await service.hydrate()).currentBookId).toBe(textbookCatalog[3].id);
    expect((await repository.read()).currentBookIdUpdatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("captures the user partition across an in-flight download", async () => {
    const { service, repository, request } = setup();
    let resolve!: (value: unknown) => void;
    request.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const downloading = service.selectBook(bookId);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    repository.switchUser("alice");
    resolve(payload());
    await expect(downloading).rejects.toThrow("失效");
    expect((await repository.read()).words).toHaveLength(0);
    expect((await repository.read("data_guest")).words).toHaveLength(1077);
  });

  it("hydrates referenced difficult-book words and persists difficulty timestamps", async () => {
    const { service, repository } = setup();
    const wordId = `${textbookCatalog[1].id}-w-25-1077`;
    await repository.transact((data) => { data.states.push({ ...initialState(wordId), bookId: textbookCatalog[1].id, isDifficult: true }); });
    const data = await service.prepareStudy(undefined, "difficult");
    const word = data.words.find((entry) => entry.id === wordId)!;
    expect(word).toBeDefined();
    const removed = await setDifficult(word.id, false, repository);
    expect(removed.states[0].isDifficult).toBe(false);
    expect(removed.states[0].difficultUpdatedAt).toBeTruthy();
    expect(removed.logs).toEqual([]);
  });
});
