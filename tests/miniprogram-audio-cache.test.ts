import { describe, expect, it } from "vitest";
import {
  AUDIO_CACHE_KEY,
  UniAudioCache,
  type AudioCacheDriver,
} from "../apps/miniprogram/src/adapters/audio-cache";
import type { StorageAdapter } from "../apps/miniprogram/src/adapters/types";

class MemoryStorage implements StorageAdapter {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class FakeAudioDriver implements AudioCacheDriver {
  readonly files = new Map<string, number>();
  readonly removed: string[] = [];
  downloadCount = 0;
  saveCount = 0;
  nextSize = 4;
  nextStatus = 200;
  nextTempPath = "/tmp/download.mp3";
  nextSavedPath = "";
  downloadGate?: Promise<void>;

  async downloadFile(): Promise<{ statusCode: number; tempFilePath: string }> {
    this.downloadCount += 1;
    if (this.downloadGate) await this.downloadGate;
    return { statusCode: this.nextStatus, tempFilePath: this.nextTempPath };
  }

  async saveFile(): Promise<string> {
    this.saveCount += 1;
    const path = this.nextSavedPath || `/saved/audio-${this.saveCount}.mp3`;
    if (path.startsWith("/")) this.files.set(path, this.nextSize);
    return path;
  }

  async getFileInfo(filePath: string): Promise<{ size: number }> {
    const size = this.files.get(filePath);
    if (size === undefined) throw new Error("file missing");
    return { size };
  }

  async removeSavedFile(filePath: string): Promise<void> {
    this.removed.push(filePath);
    this.files.delete(filePath);
  }
}

function createCache(driver: FakeAudioDriver, storage = new MemoryStorage, options: { maxBytes?: number; maxEntries?: number; now?: () => number } = {}) {
  return { storage, cache: new UniAudioCache({ driver, storage, ...options }) };
}

describe("UniAudioCache", () => {
  it("downloads remote audio, then serves a validated local hit", async () => {
    const driver = new FakeAudioDriver();
    const { cache, storage } = createCache(driver);
    const url = "https://cdn.example.test/audio/ichi.mp3";

    await expect(cache.resolve(url)).resolves.toBe("/saved/audio-1.mp3");
    await expect(cache.resolve(url)).resolves.toBe("/saved/audio-1.mp3");

    expect(driver.downloadCount).toBe(1);
    expect(driver.saveCount).toBe(1);
    expect(JSON.parse(storage.values.get(AUDIO_CACHE_KEY) ?? "{}").entries).toHaveLength(1);
  });

  it("deduplicates concurrent downloads for the same URL", async () => {
    const driver = new FakeAudioDriver();
    let release!: () => void;
    driver.downloadGate = new Promise<void>((resolve) => { release = resolve; });
    const { cache } = createCache(driver);
    const url = "https://cdn.example.test/audio/ni.mp3";
    const first = cache.resolve(url);
    const second = cache.resolve(url);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual(["/saved/audio-1.mp3", "/saved/audio-1.mp3"]);
    expect(driver.downloadCount).toBe(1);
  });

  it("falls back to the original URL for invalid status, path, and size", async () => {
    const url = "https://cdn.example.test/audio/san.mp3";
    const cases: Array<{ configure: (driver: FakeAudioDriver) => void; removesSavedFile: boolean }> = [
      { configure: (driver) => { driver.nextStatus = 404; }, removesSavedFile: false },
      { configure: (driver) => { driver.nextTempPath = "relative/temp.mp3"; }, removesSavedFile: false },
      { configure: (driver) => { driver.nextSavedPath = "relative/saved.mp3"; }, removesSavedFile: false },
      { configure: (driver) => { driver.nextSize = 0; }, removesSavedFile: true },
    ];

    for (const testCase of cases) {
      const driver = new FakeAudioDriver();
      testCase.configure(driver);
      const { cache } = createCache(driver);
      await expect(cache.resolve(url)).resolves.toBe(url);
      expect(driver.removed.length > 0).toBe(testCase.removesSavedFile);
    }
  });

  it("evicts the least recently used entries by count and byte budget", async () => {
    const driver = new FakeAudioDriver();
    let clock = 10;
    const { cache } = createCache(driver, new MemoryStorage(), { maxBytes: 8, maxEntries: 3, now: () => clock++ });

    await cache.resolve("https://cdn.example.test/audio/one.mp3");
    await cache.resolve("https://cdn.example.test/audio/two.mp3");
    await cache.resolve("https://cdn.example.test/audio/three.mp3");

    const entries = await cache.getEntries();
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://cdn.example.test/audio/two.mp3",
      "https://cdn.example.test/audio/three.mp3",
    ]);
    expect(driver.removed).toContain("/saved/audio-1.mp3");
  });

  it("evicts the oldest entry when the entry count is exceeded", async () => {
    const driver = new FakeAudioDriver();
    let clock = 10;
    const { cache } = createCache(driver, new MemoryStorage(), { maxBytes: 100, maxEntries: 2, now: () => clock++ });

    await cache.resolve("https://cdn.example.test/audio/one.mp3");
    await cache.resolve("https://cdn.example.test/audio/two.mp3");
    await cache.resolve("https://cdn.example.test/audio/three.mp3");

    expect((await cache.getEntries()).map((entry) => entry.url)).toEqual([
      "https://cdn.example.test/audio/two.mp3",
      "https://cdn.example.test/audio/three.mp3",
    ]);
  });

  it("does not evict a recently touched entry", async () => {
    const driver = new FakeAudioDriver();
    let clock = 10;
    const { cache } = createCache(driver, new MemoryStorage(), { maxEntries: 2, now: () => clock++ });
    const one = "https://cdn.example.test/audio/one.mp3";
    await cache.resolve(one);
    await cache.resolve("https://cdn.example.test/audio/two.mp3");
    await cache.resolve(one);
    await cache.resolve("https://cdn.example.test/audio/three.mp3");

    expect((await cache.getEntries()).map((entry) => entry.url)).toEqual([one, "https://cdn.example.test/audio/three.mp3"]);
    expect(driver.removed).toContain("/saved/audio-2.mp3");
  });

  it("clears only saved audio files and its independent manifest", async () => {
    const driver = new FakeAudioDriver();
    const storage = new MemoryStorage();
    storage.values.set("data_guest", '{"learning":"keep"}');
    storage.values.set("sync_queue:data_guest", "[\"keep\"]");
    const { cache } = createCache(driver, storage);
    await cache.resolve("https://cdn.example.test/audio/yon.mp3");

    await cache.clear();

    expect(storage.values.get("data_guest")).toBe('{"learning":"keep"}');
    expect(storage.values.get("sync_queue:data_guest")).toBe('["keep"]');
    expect(storage.values.has(AUDIO_CACHE_KEY)).toBe(false);
    expect(driver.files.size).toBe(0);
    expect(driver.removed).toEqual(["/saved/audio-1.mp3"]);
  });

  it("invalidates one decoder-rejected entry without touching other audio", async () => {
    const driver = new FakeAudioDriver();
    const { cache } = createCache(driver);
    const first = "https://cdn.example.test/audio/one.mp3";
    const second = "https://cdn.example.test/audio/two.mp3";
    await cache.resolve(first);
    await cache.resolve(second);

    await cache.invalidate(first);

    expect((await cache.getEntries()).map((entry) => entry.url)).toEqual([second]);
    expect(driver.removed).toContain("/saved/audio-1.mp3");
    expect(driver.files.has("/saved/audio-2.mp3")).toBe(true);
  });

  it("ignores corrupt metadata and never trusts unsafe cached paths", async () => {
    const driver = new FakeAudioDriver();
    const storage = new MemoryStorage();
    storage.values.set(AUDIO_CACHE_KEY, JSON.stringify({
      version: 1,
      entries: [
        { url: "https://cdn.example.test/audio/bad.mp3", localPath: "../../learning.json", size: 4, lastUsedAt: 1 },
        { url: "https://cdn.example.test/audio/zero.mp3", localPath: "/saved/zero.mp3", size: 0, lastUsedAt: 2 },
      ],
    }));
    const { cache } = createCache(driver, storage);

    await expect(cache.resolve("https://cdn.example.test/audio/bad.mp3")).resolves.toBe("/saved/audio-1.mp3");
    expect(driver.removed).not.toContain("../../learning.json");
  });

  it("only caches HTTPS CDN URLs", async () => {
    const driver = new FakeAudioDriver();
    const { cache } = createCache(driver);
    const url = "http://cdn.example.test/audio/plain.mp3";

    await expect(cache.resolve(url)).resolves.toBe(url);
    expect(driver.downloadCount).toBe(0);
  });
});
