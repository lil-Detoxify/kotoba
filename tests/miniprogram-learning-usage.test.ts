import { describe, expect, it, vi } from "vitest";
import type { NetworkAdapter } from "../apps/miniprogram/src/adapters/types";
import {
  MINI_PROGRAM_LEARNING_USAGE_STORAGE_PREFIX,
  createMiniProgramLearningUsage,
  lessonBookId,
  usageFor,
} from "../apps/miniprogram/src/services/learning-usage";

class MemoryStorage {
  values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

const bookId = "jlpt-n5";
const word = { term: "合流する", reading: "ごうりゅうする", meaning: "汇合", lessonId: "jlpt-n5-l-1" };
const record = (zh: string) => ({
  id: "test-usage-record",
  forms: [{ term: word.term, reading: word.reading }],
  meaningKeywords: ["汇合"],
  collocation: { ja: "二つの道が合流する。", reading: "ふたつのみちがごうりゅうする。", zh },
  sourceMeanings: ["汇合"],
});
const manifest = (sha256: string) => ({ version: "v1", books: [{ id: bookId, sha256 }] });

describe("Mini Program learning usage", () => {
  it("loads the selected book's published notes and matches the taught sense", async () => {
    const urls: string[] = [];
    const network: NetworkAdapter = {
      async request<T>(url: string) {
        urls.push(url);
        if (url.endsWith("manifest.json")) return manifest("a".repeat(64)) as T;
        return [record("人群在车站汇合。 ")] as T;
      },
    };
    const service = createMiniProgramLearningUsage({
      network,
      storage: new MemoryStorage(),
      privacy: { isConsented: async () => true },
    });

    expect(lessonBookId(word.lessonId)).toBe(bookId);
    expect(await service.loadBookUsage(bookId)).toBe(true);
    expect(service.usageFor(word)?.collocation.zh).toBe("人群在车站汇合。 ");
    expect(service.usageFor({ ...word, meaning: "汇聚" })).toBeUndefined();
    expect(urls).toEqual(["/data/usage/v1/manifest.json", `/data/usage/v1/${bookId}.json`]);
  });

  it("uses the manifest hash as the cached version and refreshes changed books", async () => {
    const storage = new MemoryStorage();
    const cacheKey = `${MINI_PROGRAM_LEARNING_USAGE_STORAGE_PREFIX}${bookId}`;
    storage.values.set(cacheKey, JSON.stringify({ sha256: "a".repeat(64), records: [record("旧用法。 ")] }));
    const urls: string[] = [];
    const service = createMiniProgramLearningUsage({
      storage,
      network: { async request<T>(url: string) {
        urls.push(url);
        if (url.endsWith("manifest.json")) return manifest("b".repeat(64)) as T;
        return [record("更新后的用法。 ")] as T;
      } },
      privacy: { isConsented: async () => true },
    });

    expect(await service.loadBookUsage(bookId)).toBe(true);
    expect(service.usageFor(word)?.collocation.zh).toBe("更新后的用法。 ");
    expect(JSON.parse(storage.values.get(cacheKey)!)).toMatchObject({ sha256: "b".repeat(64) });
    expect(urls).toEqual(["/data/usage/v1/manifest.json", `/data/usage/v1/${bookId}.json`]);

    const checkedUrls: string[] = [];
    const reopened = createMiniProgramLearningUsage({
      storage,
      network: { async request<T>(url: string) {
        checkedUrls.push(url);
        if (url.endsWith("manifest.json")) return manifest("b".repeat(64)) as T;
        throw new Error("matching cache should be reused");
      } },
      privacy: { isConsented: async () => true },
    });
    expect(await reopened.loadBookUsage(bookId)).toBe(true);
    expect(reopened.usageFor(word)?.collocation.zh).toBe("更新后的用法。 ");
    expect(checkedUrls).toEqual(["/data/usage/v1/manifest.json"]);
  });

  it("keeps structurally valid old notes available when the manifest cannot be reached", async () => {
    const storage = new MemoryStorage();
    storage.values.set(`${MINI_PROGRAM_LEARNING_USAGE_STORAGE_PREFIX}${bookId}`, JSON.stringify([record("离线用法。 ")]));
    const request = vi.fn(async () => { throw new Error("offline"); });
    const service = createMiniProgramLearningUsage({
      storage,
      network: { async request<T>(url: string) { return request(url) as T; } },
      privacy: { isConsented: async () => true },
    });

    expect(await service.loadBookUsage(bookId)).toBe(true);
    expect(service.usageFor(word)?.collocation.zh).toBe("离线用法。 ");
    expect(request).toHaveBeenCalledWith("/data/usage/v1/manifest.json");
  });

  it("keeps the existing static usage notes available before any remote book is loaded", () => {
    expect(usageFor({ term: "借ります", reading: "かります" })?.collocation.ja).toBeTruthy();
  });
});
