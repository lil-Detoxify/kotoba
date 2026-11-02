import { describe, expect, it, vi } from "vitest";
import { emptyData, type Word } from "@jp/models";
import type { NetworkAdapter } from "../apps/miniprogram/src/adapters/types";
import { textbookCatalog } from "../apps/miniprogram/src/services/textbooks";
import { loadVocabularySearchHit, VocabularySearchService } from "../apps/miniprogram/src/services/vocabulary-search";

function word(id: string, lessonId: string, order: number, term = "日本", reading = "にほん", meaning = "Japan"): Word {
  return { id, lessonId, order, term, reading, meaning };
}

function mockNetwork(implementation: (path: string) => Promise<unknown>) {
  const requestSpy = vi.fn(implementation);
  const network: NetworkAdapter = {
    request<T>(path: string): Promise<T> {
      return requestSpy(path) as Promise<T>;
    }
  };
  return { network, requestSpy };
}

describe("mini-program vocabulary search", () => {
  it("loads textbook JSON lazily, caches successful books in memory, and merges local custom words", async () => {
    const books = textbookCatalog.slice(0, 2);
    const textbookWords = new Map(books.map((book, index) => [
      book.id,
      [word(`${book.id}-word`, book.lessons[0].id, index + 1, index ? "学生" : "日本", index ? "がくせい" : "にほん", index ? "student" : "Japan")]
    ]));
    const { network, requestSpy: request } = mockNetwork(async (path: string) => ({ bookId: books.find(book => path.includes(book.id))?.id }));
    const parse = vi.fn((_payload: unknown, bookId: string) => textbookWords.get(bookId) ?? []);
    const service = new VocabularySearchService({ catalog: books, network, parse, version: "test-version" });
    const data = emptyData();
    data.books.push({ id: "custom-book", title: "我的词书", description: "", language: "ja", createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" });
    data.lessons.push({ id: "custom-book-l-1", bookId: "custom-book", title: "自定义课", order: 1 });
    data.words.push(word("custom-1", "custom-book-l-1", 3, "学生", "がくせい", "my custom student"));
    const before = structuredClone(data);

    const first = await service.search("がくせい", data);
    const second = await service.search("学生", data);

    expect(first.results.map(hit => hit.source)).toEqual(["textbook", "custom"]);
    expect(first.results.map(hit => hit.bookTitle)).toEqual([books[1].title, "我的词书"]);
    expect(first.status).toBe("ready");
    expect(second.results.map(hit => hit.id)).toEqual([`${books[1].id}-word`, "custom-1"]);
    expect(request).toHaveBeenCalledTimes(books.length);
    expect(request).toHaveBeenCalledWith(`/data/books/${books[0].id}.json?v=test-version`);
    expect(service.getCachedBookIds()).toEqual(books.map(book => book.id));
    expect(data).toEqual(before);
  });

  it("keeps partial results, retries only failed books, and reports local-only on full network failure", async () => {
    const books = textbookCatalog.slice(0, 2);
    const tries = new Map<string, number>();
    const { network } = mockNetwork(async (path: string) => {
        const book = books.find(entry => path.includes(entry.id))!;
        const count = (tries.get(book.id) ?? 0) + 1;
        tries.set(book.id, count);
        if (book.id === books[1].id && count === 1) throw new Error("temporary network error");
        return { id: book.id };
      });
    const parse = (_payload: unknown, bookId: string) => {
      const book = books.find(entry => entry.id === bookId)!;
      return [word(`${bookId}-word`, book.lessons[0].id, 1)];
    };
    const service = new VocabularySearchService({ catalog: books, network, parse });
    const first = await service.search("日本", emptyData());
    expect(first.status).toBe("partial");
    expect(first.failedBookIds).toEqual([books[1].id]);
    expect(first.results.map(hit => hit.id)).toEqual([`${books[0].id}-word`]);

    const retried = await service.search("日本", emptyData());
    expect(retried.status).toBe("ready");
    expect(retried.failedBookIds).toEqual([]);
    expect(tries.get(books[0].id)).toBe(1);
    expect(tries.get(books[1].id)).toBe(2);

    const { network: offlineNetwork } = mockNetwork(async () => { throw new Error("offline"); });
    const offlineService = new VocabularySearchService({ catalog: books, network: offlineNetwork, parse });
    const localOnly = await offlineService.search("日本", emptyData());
    expect(localOnly.status).toBe("local-only");
    expect(localOnly.results).toEqual([]);
    expect(localOnly.failedBookIds).toHaveLength(books.length);
  });

  it("finds a previously downloaded textbook entry offline without duplicating its network fallback", async () => {
    const book = textbookCatalog[0];
    const lesson = book.lessons[0];
    const cachedWord = word(`${book.id}-w-offline`, lesson.id, 1, "学生", "がくせい", "student");
    const { network, requestSpy } = mockNetwork(async () => { throw new Error("offline"); });
    const service = new VocabularySearchService({ catalog: [book], network, parse: () => [] });
    const data = emptyData();
    data.books.push({ id: book.id, title: book.title, description: "", language: "ja", createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" });
    data.lessons.push({ id: lesson.id, bookId: book.id, title: lesson.title, order: lesson.order });
    data.words.push(cachedWord);

    const result = await service.search("がくせい", data);

    expect(result.status).toBe("local-only");
    expect(result.results).toMatchObject([{ id: cachedWord.id, source: "textbook", bookTitle: book.title, lessonTitle: lesson.title }]);
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it("obeys the privacy gate by searching local data without issuing remote requests", async () => {
    const book = textbookCatalog[0];
    const lesson = book.lessons[0];
    const cachedWord = word(`${book.id}-w-consented-cache`, lesson.id, 1, "学生", "がくせい", "student");
    const { network, requestSpy } = mockNetwork(async () => { throw new Error("must not request without consent"); });
    const service = new VocabularySearchService({ catalog: [book], network, parse: () => [] });
    const data = emptyData();
    data.words.push(cachedWord);

    const result = await service.search("がくせい", data, undefined, false);

    expect(result.networkSkipped).toBe(true);
    expect(result.results).toMatchObject([{ id: cachedWord.id, source: "textbook" }]);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("loads a local custom search hit from the repository instead of textbook download", async () => {
    const data = emptyData();
    data.books.push({ id: "custom-book", title: "自定义词书", description: "", language: "ja", createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" });
    data.lessons.push({ id: "custom-book-l-1", bookId: "custom-book", title: "自定义课", order: 1 });
    data.words.push(word("custom-word", "custom-book-l-1", 1, "日本人", "にほんじん", "Japanese person"));
    const { network } = mockNetwork(async () => ({}));
    const service = new VocabularySearchService({ catalog: [], network });
    const result = await service.search("日本人", data, undefined, false);
    const hit = result.results[0];
    const repository = { getActiveKey: () => "current", read: vi.fn(async () => data) };
    const textbooks = { ensureBookLoaded: vi.fn(async () => data) };

    const loaded = await loadVocabularySearchHit(hit, "current", { repository, textbooks });

    expect(loaded.words.map(entry => entry.id)).toContain("custom-word");
    expect(repository.read).toHaveBeenCalledWith("current");
    expect(textbooks.ensureBookLoaded).not.toHaveBeenCalled();
  });

  it("rejects queries above 80 characters before making network requests", async () => {
    const book = textbookCatalog[0];
    const { network, requestSpy } = mockNetwork(async () => ({}));
    const service = new VocabularySearchService({ catalog: [book], network, parse: () => [] });
    await expect(service.search("日".repeat(81), emptyData())).rejects.toThrow(/80/);
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
