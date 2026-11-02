import { describe, expect, it, vi } from "vitest";
import type { NetworkAdapter } from "../apps/miniprogram/src/adapters/types";
import {
  MINI_PROGRAM_LEARNING_EXAMPLES_STORAGE_PREFIX,
  createMiniProgramLearningExamples,
  matchesClozeExample,
  normalizeExampleAnswer,
} from "../apps/miniprogram/src/services/learning-examples";

class MemoryStorage {
  values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

const example = (zh: string) => ({
  ja: "学校へ行きます。",
  reading: "がっこうへいきます。",
  zh,
  cloze: { answer: "学校", reading: "がっこう" },
});

const manifest = (bookIds: string[], sha256 = "a".repeat(64)) => ({
  version: "v1",
  books: bookIds.map(id => ({ id, sha256 })),
});

describe("Mini Program learning examples", () => {
  it("normalizes pair keys and creates a cloze while preferring the word's own example", async () => {
    const storage = new MemoryStorage();
    const network: NetworkAdapter = {
      async request<T>(url: string) {
        if (url.endsWith("manifest.json")) return manifest(["biaori-beginner-upper"]) as T;
        return { "ｺﾝﾋﾟｭｰﾀｰ|コンピューター": {
          ja: "コンピューターを使います。",
          reading: "こんぴゅーたーをつかいます。",
          zh: "使用电脑。",
          cloze: { answer: "コンピューター", reading: "こんぴゅーたー" },
        } } as T;
      },
    };
    const service = createMiniProgramLearningExamples({
      storage,
      network,
      privacy: { isConsented: async () => true },
    });
    const word = { term: "コンピューター", reading: "こんぴゅーたー" };

    expect(normalizeExampleAnswer("コンピューター")).toBe("こんぴゅーたー");
    expect(await service.loadBookLearningExamples("biaori-beginner-upper")).toBe(true);
    const question = service.createSentenceCloze(word, undefined, "biaori-beginner-upper");
    expect(question).toMatchObject({
      before: "",
      after: "を使います。",
      answer: "コンピューター",
      reading: "こんぴゅーたー",
      sentenceReading: "こんぴゅーたーをつかいます。",
    });
    expect(matchesClozeExample(question!, "コンピューター")).toBe(true);

    const localWord = {
      ...word,
      example: "コンピューターを学校で使います。",
      exampleReading: "こんぴゅーたーをがっこうでつかいます。",
      exampleTranslation: "在学校使用电脑。",
    };
    expect(service.learningExampleFor(localWord, "biaori-beginner-upper")?.ja).toBe(localWord.example);
    expect(service.createSentenceCloze(localWord, undefined, "biaori-beginner-upper")?.ja).toBe(localWord.example);
  });

  it("uses a persisted book cache without consent or a network request", async () => {
    const storage = new MemoryStorage();
    const cacheKey = `${MINI_PROGRAM_LEARNING_EXAMPLES_STORAGE_PREFIX}biaori-beginner-lower`;
    storage.values.set(cacheKey, JSON.stringify({ "学校|がっこう": example("去学校。") }));
    const isConsented = vi.fn(async () => false);
    const request = vi.fn();
    const network: NetworkAdapter = {
      async request<T>(url: string) { return request(url) as T; },
    };
    const service = createMiniProgramLearningExamples({ storage, network, privacy: { isConsented } });

    expect(await service.loadBookLearningExamples("biaori-beginner-lower")).toBe(true);
    expect(service.hasBookLearningExamples("biaori-beginner-lower")).toBe(true);
    expect(service.learningExampleFor({ term: "学校", reading: "ガッコウ" }, "biaori-beginner-lower")?.zh).toBe("去学校。");
    expect(isConsented).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();

    const uncachedConsent = vi.fn(async () => false);
    const uncachedNetworkRequest = vi.fn();
    const uncachedService = createMiniProgramLearningExamples({
      storage: new MemoryStorage(),
      network: { async request<T>(url: string) { return uncachedNetworkRequest(url) as T; } },
      privacy: { isConsented: uncachedConsent },
    });
    expect(await uncachedService.loadBookLearningExamples("biaori-beginner-upper")).toBe(false);
    expect(uncachedConsent).toHaveBeenCalledOnce();
    expect(uncachedNetworkRequest).not.toHaveBeenCalled();
  });

  it("shares an in-flight request for the same book and persists a valid response", async () => {
    const storage = new MemoryStorage();
    let finishRequest: ((payload: unknown) => void) | undefined;
    let markRequestStarted: (() => void) | undefined;
    const requestStarted = new Promise<void>(resolve => { markRequestStarted = resolve; });
    let requestCount = 0;
    const network: NetworkAdapter = {
      request<T>(url: string) {
        if (url.endsWith("manifest.json")) return Promise.resolve(manifest(["biaori-intermediate-upper"]) as T);
        requestCount++;
        expect(url).toBe("/data/examples/v1/biaori-intermediate-upper.json");
        markRequestStarted!();
        return new Promise<T>(resolve => {
          finishRequest = payload => resolve(payload as T);
        });
      },
    };
    const service = createMiniProgramLearningExamples({
      storage,
      network,
      privacy: { isConsented: async () => true },
    });

    const first = service.loadBookLearningExamples("biaori-intermediate-upper");
    const second = service.loadBookLearningExamples("biaori-intermediate-upper");
    await requestStarted;
    finishRequest!({ "学校|がっこう": example("去学校。") });

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(requestCount).toBe(1);
    expect(storage.values.has(`${MINI_PROGRAM_LEARNING_EXAMPLES_STORAGE_PREFIX}biaori-intermediate-upper`)).toBe(true);
  });

  it("keeps records book-scoped, accepts an empty JLPT record, and rejects unknown paths", async () => {
    const storage = new MemoryStorage();
    const urls: string[] = [];
    const network: NetworkAdapter = {
      async request<T>(url: string) {
        urls.push(url);
        if (url.endsWith("manifest.json")) return manifest([
          "biaori-beginner-upper", "biaori-beginner-lower", "jlpt-n5", "jlpt-n4",
        ]) as T;
        if (url.endsWith("jlpt-n5.json")) return {} as T;
        if (url.endsWith("jlpt-n4.json")) throw new Error("temporary network error");
        return { "学校|がっこう": example(url.includes("beginner-upper") ? "上册。" : "下册。") } as T;
      },
    };
    const service = createMiniProgramLearningExamples({
      storage,
      network,
      privacy: { isConsented: async () => true },
    });
    const word = { term: "学校", reading: "がっこう" };

    await service.loadBookLearningExamples("biaori-beginner-upper");
    await service.loadBookLearningExamples("biaori-beginner-lower");
    await service.loadBookLearningExamples("jlpt-n5");
    expect(service.learningExampleFor(word, "biaori-beginner-upper")?.zh).toBe("上册。");
    expect(service.learningExampleFor(word, "biaori-beginner-lower")?.zh).toBe("下册。");
    expect(service.learningExampleFor(word)).toBeUndefined();
    expect(service.hasBookLearningExamples("jlpt-n5")).toBe(true);
    expect(service.learningExampleFor(word, "jlpt-n5")).toBeUndefined();
    await expect(service.loadBookLearningExamples("jlpt-n4")).rejects.toThrow("temporary network error");
    expect(service.learningExampleFor(word, "biaori-beginner-upper")?.zh).toBe("上册。");

    expect(await service.loadBookLearningExamples("../biaori-beginner-upper")).toBe(false);
    expect(urls).toEqual([
      "/data/examples/v1/manifest.json",
      "/data/examples/v1/biaori-beginner-upper.json",
      "/data/examples/v1/biaori-beginner-lower.json",
      "/data/examples/v1/jlpt-n5.json",
      "/data/examples/v1/jlpt-n4.json",
    ]);
  });

  it("refreshes a valid old cache when the manifest version changes", async () => {
    const storage = new MemoryStorage();
    const bookId = "biaori-beginner-lower";
    const cacheKey = `${MINI_PROGRAM_LEARNING_EXAMPLES_STORAGE_PREFIX}${bookId}`;
    storage.values.set(cacheKey, JSON.stringify({ "学校|がっこう": example("旧译文") }));
    const urls: string[] = [];
    const network: NetworkAdapter = {
      async request<T>(url: string) {
        urls.push(url);
        if (url.endsWith("manifest.json")) return manifest([bookId], "b".repeat(64)) as T;
        return { "学校|がっこう": example("更正后的译文") } as T;
      },
    };
    const service = createMiniProgramLearningExamples({ storage, network, privacy: { isConsented: async () => true } });

    expect(await service.loadBookLearningExamples(bookId)).toBe(true);
    expect(service.learningExampleFor({ term: "学校", reading: "がっこう" }, bookId)?.zh).toBe("更正后的译文");
    expect(urls).toEqual(["/data/examples/v1/manifest.json", `/data/examples/v1/${bookId}.json`]);
    expect(JSON.parse(storage.values.get(cacheKey)!)).toMatchObject({ sha256: "b".repeat(64) });

    const sameVersionUrls: string[] = [];
    const reopened = createMiniProgramLearningExamples({
      storage,
      network: { async request<T>(url: string) {
        sameVersionUrls.push(url);
        if (url.endsWith("manifest.json")) return manifest([bookId], "b".repeat(64)) as T;
        throw new Error("matching cache should not download the book again");
      } },
      privacy: { isConsented: async () => true },
    });
    expect(await reopened.loadBookLearningExamples(bookId)).toBe(true);
    expect(reopened.learningExampleFor({ term: "学校", reading: "がっこう" }, bookId)?.zh).toBe("更正后的译文");
    expect(sameVersionUrls).toEqual(["/data/examples/v1/manifest.json"]);
  });

  it("keeps a structurally valid cached book available when the version check is offline", async () => {
    const storage = new MemoryStorage();
    const bookId = "biaori-beginner-lower";
    storage.values.set(`${MINI_PROGRAM_LEARNING_EXAMPLES_STORAGE_PREFIX}${bookId}`, JSON.stringify({
      "学校|がっこう": example("离线缓存译文"),
    }));
    const request = vi.fn(async () => { throw new Error("offline"); });
    const service = createMiniProgramLearningExamples({
      storage,
      network: { async request<T>(url: string) { return request(url) as T; } },
      privacy: { isConsented: async () => true },
    });

    expect(await service.loadBookLearningExamples(bookId)).toBe(true);
    expect(service.learningExampleFor({ term: "学校", reading: "がっこう" }, bookId)?.zh).toBe("离线缓存译文");
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("/data/examples/v1/manifest.json");
  });
});
