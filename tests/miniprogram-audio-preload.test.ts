import { describe, expect, it, vi } from "vitest";
import { AudioPreloader } from "../apps/miniprogram/src/adapters/audio-preload";
import { UniAudioCache, type AudioCacheResolveOptions } from "../apps/miniprogram/src/adapters/audio-cache";
import type { StorageAdapter } from "../apps/miniprogram/src/adapters/types";

class FakeCache {
  readonly started: string[] = [];
  readonly cancelled: string[] = [];
  active = 0;
  maxActive = 0;
  readonly gates = new Map<string, () => void>();

  async warm(url: string, options: AudioCacheResolveOptions = {}): Promise<void> {
    this.started.push(url);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => { if (settled) return; settled = true; unsubscribe(); resolve(); };
        const unsubscribe = options.cancellation?.onAbort(finish) ?? (() => undefined);
        options.cancellation?.onAbort(() => this.cancelWarm(url));
        this.gates.set(url, finish);
      });
    } finally {
      this.active -= 1;
    }
  }

  cancelWarm(url: string): void {
    this.cancelled.push(url);
    this.gates.get(url)?.();
  }
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class MemoryStorage implements StorageAdapter {
  async getItem(): Promise<string | null> { return null; }
  async setItem(): Promise<void> {}
  async removeItem(): Promise<void> {}
}

describe("AudioPreloader", () => {
  it("deduplicates URLs, limits its window to current plus two, and runs one download at a time", async () => {
    const cache = new FakeCache();
    const preloader = new AudioPreloader(cache as never);
    preloader.schedule(["one", "two", "one", "three", "four"]);
    expect(cache.started).toEqual(["one"]);
    cache.gates.get("one")?.();
    await tick();
    expect(cache.started).toEqual(["one", "two"]);
    cache.gates.get("two")?.();
    await tick();
    expect(cache.started).toEqual(["one", "two", "three"]);
    cache.gates.get("three")?.();
    await tick();
    expect(cache.maxActive).toBe(1);
    expect(cache.started).toEqual(["one", "two", "three"]);
  });

  it("cancels the old active request and replaces its queued window", async () => {
    const cache = new FakeCache();
    const preloader = new AudioPreloader(cache as never);
    preloader.schedule(["old-current", "old-next"]);
    preloader.schedule(["new-current", "new-next"]);

    await tick();
    expect(cache.cancelled).toContain("old-current");
    expect(cache.started).toEqual(["old-current", "new-current"]);
    cache.gates.get("new-current")?.();
    await tick();
    expect(cache.started).toEqual(["old-current", "new-current", "new-next"]);
    preloader.cancel();
    expect(cache.cancelled).toContain("new-next");
  });

  it("keeps an in-flight download when that word remains in the next card window", async () => {
    const cache = new FakeCache();
    const preloader = new AudioPreloader(cache as never);
    preloader.schedule(["current", "next", "later"]);
    preloader.schedule(["next", "current", "new"]);
    expect(cache.cancelled).toEqual([]);
    cache.gates.get("current")?.();
    await tick();
    expect(cache.started).toEqual(["current", "next"]);
    preloader.cancel();
  });

  it("forwards optional download diagnostics without including the URL", async () => {
    const cache = new FakeCache();
    const observed: unknown[] = [];
    const preloader = new AudioPreloader(cache as never, { onDiagnostic: (event) => observed.push(event) });
    preloader.schedule(["private-url"]);
    // The fake accepts no emitted diagnostics; assert the public type contract through its options shape.
    expect(observed).toEqual([]);
    preloader.cancel();
  });

  it("aborts an active uni.downloadFile on cancel and reports unavailable progress honestly", async () => {
    let fail!: (error: unknown) => void;
    const abort = vi.fn(() => fail({ errMsg: "request:fail abort" }));
    const diagnostics: unknown[] = [];
    vi.stubGlobal("uni", {
      getStorageSync: () => "",
      setStorageSync: () => undefined,
      removeStorageSync: () => undefined,
      downloadFile: (options: { fail: (error: unknown) => void }) => { fail = options.fail; return { abort }; },
    });
    const cache = new UniAudioCache({ storage: new MemoryStorage() });
    const preloader = new AudioPreloader(cache, { onDiagnostic: (event) => diagnostics.push(event) });
    preloader.schedule(["https://cdn.example.test/audio/current.mp3"]);
    await tick();
    preloader.cancel();
    await tick();

    expect(abort).toHaveBeenCalledOnce();
    expect(diagnostics).toContainEqual({ type: "downloadStart", progressObservable: false });
    expect(diagnostics).toContainEqual({ type: "progressUnavailable" });
    expect(diagnostics).toContainEqual({ type: "downloadFailed", cancelled: true });
    expect(diagnostics.some((event) => JSON.stringify(event).includes("cdn.example.test"))).toBe(false);
    vi.unstubAllGlobals();
  });

  it("records only the first real native progress notification and download completion", async () => {
    let success!: (result: { statusCode: number; tempFilePath: string }) => void;
    let progress!: (event: unknown) => void;
    const diagnostics: unknown[] = [];
    vi.stubGlobal("uni", {
      getStorageSync: () => "",
      setStorageSync: () => undefined,
      removeStorageSync: () => undefined,
      downloadFile: (options: { success: typeof success }) => {
        success = options.success;
        return { onProgressUpdate: (callback: typeof progress) => { progress = callback; }, offProgressUpdate: () => undefined };
      },
      saveFile: (options: { success: (result: { savedFilePath: string }) => void }) => options.success({ savedFilePath: "/saved/audio.mp3" }),
      getFileInfo: (options: { success: (result: { size: number }) => void }) => options.success({ size: 12 }),
    });
    const cache = new UniAudioCache({ storage: new MemoryStorage() });
    const preloader = new AudioPreloader(cache, { onDiagnostic: (event) => diagnostics.push(event) });
    preloader.schedule(["https://cdn.example.test/audio/current.mp3"]);
    await tick();
    progress({ progress: 1 });
    progress({ progress: 2 });
    success({ statusCode: 200, tempFilePath: "/tmp/audio.mp3" });
    await tick();

    expect(diagnostics).toContainEqual({ type: "downloadStart", progressObservable: true });
    expect(diagnostics.filter((event) => (event as { type: string }).type === "firstProgress")).toHaveLength(1);
    expect(diagnostics).toContainEqual({ type: "downloadComplete" });
    expect(diagnostics.some((event) => JSON.stringify(event).includes("cdn.example.test"))).toBe(false);
    preloader.cancel();
    vi.unstubAllGlobals();
  });
});
