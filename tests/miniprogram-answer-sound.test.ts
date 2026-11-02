import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AudioAdapter, StorageAdapter } from "../apps/miniprogram/src/adapters/types";
import { createAnswerSoundSource } from "../apps/miniprogram/src/services/answer-sound-source";
import { createMiniAnswerSound } from "../apps/miniprogram/src/services/answer-sound";

const STORAGE_KEY = "kotobud.miniprogram.answer-sound.v1";

function createMemoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(STORAGE_KEY, initial);
  const storage: Pick<StorageAdapter, "getItem" | "setItem"> = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
  };
  return { storage, values };
}

function createPlayer(play: AudioAdapter["play"] = async () => true) {
  return {
    play: vi.fn(play),
    stop: vi.fn(),
  } satisfies AudioAdapter;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("mini-program answer sound", () => {
  it("persists preferences and ignores invalid stored values", async () => {
    const { storage, values } = createMemoryStorage();
    const sound = createMiniAnswerSound({ storage, player: createPlayer() });

    await sound.setEnabled(false);
    await sound.setScheme("chime");
    await sound.setVolume(4);
    expect(JSON.parse(values.get(STORAGE_KEY)!)).toEqual({ enabled: false, scheme: "chime", volume: 1 });

    const restored = createMiniAnswerSound({ storage, player: createPlayer() });
    await restored.load();
    expect(restored.state).toMatchObject({ enabled: false, scheme: "chime", volume: 1, ready: true });

    values.set(STORAGE_KEY, JSON.stringify({ enabled: "false", scheme: "sparkle", volume: null }));
    const invalid = createMiniAnswerSound({ storage, player: createPlayer() });
    await invalid.load();
    expect(invalid.state).toMatchObject({ enabled: true, scheme: "wood", volume: 0.45, ready: true });
  });

  it("uses each correct and incorrect URL and forwards the selected volume", async () => {
    const player = createPlayer();
    const sound = createMiniAnswerSound({ storage: createMemoryStorage().storage, player });
    await sound.load();

    const expected = [
      ["wood", "/static/answer-sounds/wood-correct.wav", "/static/answer-sounds/wood-incorrect.wav"],
      ["chime", "/static/answer-sounds/chime-correct.wav", "/static/answer-sounds/chime-incorrect.wav"],
      ["timber", "/static/answer-sounds/timber-correct.wav", "/static/answer-sounds/timber-incorrect.wav"],
      ["stone", "/static/answer-sounds/stone-correct.wav", "/static/answer-sounds/stone-incorrect.wav"],
    ] as const;

    for (const [scheme, correctUrl, incorrectUrl] of expected) {
      await sound.setScheme(scheme);
      await sound.setVolume(0.32);
      await expect(sound.play(true)).resolves.toBe(true);
      await expect(sound.play(false)).resolves.toBe(true);
      expect(player.play).toHaveBeenLastCalledWith(incorrectUrl, expect.objectContaining({ volume: 0.32 }));
      expect(player.play).toHaveBeenNthCalledWith(player.play.mock.calls.length - 1, correctUrl, expect.objectContaining({ volume: 0.32 }));
    }
    expect(player.play).toHaveBeenCalledTimes(8);
  });

  it("keeps automatic feedback muted while allowing preview until volume reaches zero", async () => {
    const player = createPlayer();
    const sound = createMiniAnswerSound({ storage: createMemoryStorage().storage, player });
    await sound.load();
    await sound.setEnabled(false);

    await expect(sound.play(true)).resolves.toBe(false);
    await expect(sound.preview(false)).resolves.toBe(true);
    expect(player.play).toHaveBeenCalledTimes(1);

    await sound.setVolume(0);
    await expect(sound.preview(true)).resolves.toBe(false);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("cancels plays while loading after stop and while audio is active in background", async () => {
    const delayedRead = deferred<string | null>();
    const playerBeforeLoad = createPlayer();
    const loadStorage: Pick<StorageAdapter, "getItem" | "setItem"> = {
      getItem: () => delayedRead.promise,
      setItem: async () => undefined,
    };
    const loadingSound = createMiniAnswerSound({ storage: loadStorage, player: playerBeforeLoad });
    const pendingLoadPlay = loadingSound.play(true);
    loadingSound.stop();
    delayedRead.resolve(null);
    await expect(pendingLoadPlay).resolves.toBe(false);
    expect(playerBeforeLoad.play).not.toHaveBeenCalled();

    const started = deferred<void>();
    const result = deferred<boolean>();
    const backgroundPlayer = createPlayer(() => {
      started.resolve();
      return result.promise;
    });
    const backgroundSound = createMiniAnswerSound({ storage: createMemoryStorage().storage, player: backgroundPlayer });
    await backgroundSound.load();
    const pendingAudio = backgroundSound.preview(true);
    await started.promise;
    backgroundSound.setForeground(false);
    result.resolve(true);
    await expect(pendingAudio).resolves.toBe(false);
    expect(backgroundPlayer.stop).toHaveBeenCalled();
  });

  it("turns rejected native playback into false", async () => {
    const player = createPlayer(async () => { throw new Error("native audio failed"); });
    const sound = createMiniAnswerSound({ storage: createMemoryStorage().storage, player });
    await sound.load();

    await expect(sound.play(false)).resolves.toBe(false);
  });

  it("reports the native failure category and clears it when retry succeeds", async () => {
    const player = createPlayer(async (_url, options) => {
      options?.onError?.({ errCode: 10002, errMsg: "network unavailable" });
      return false;
    });
    const sound = createMiniAnswerSound({ storage: createMemoryStorage().storage, player });
    await expect(sound.preview(true)).resolves.toBe(false);
    expect(sound.state.playbackError).toContain("网络连接失败");
    expect(sound.state.playbackError).toContain("10002");
    player.play.mockImplementation(async () => true);
    await expect(sound.preview(true)).resolves.toBe(true);
    expect(sound.state.playbackError).toBe("");
  });

  it("ignores a late native error from an interrupted preview", async () => {
    let reportError: ((error: unknown) => void) | undefined;
    const oldResult = deferred<boolean>();
    const started = deferred<void>();
    const player = createPlayer((_url, options) => {
      reportError = options?.onError;
      started.resolve();
      return oldResult.promise;
    });
    const sound = createMiniAnswerSound({ storage: createMemoryStorage().storage, player });
    const pending = sound.preview(true);
    await started.promise;
    sound.stop();
    player.play.mockImplementation(async () => true);
    await expect(sound.preview(false)).resolves.toBe(true);
    reportError?.({ errCode: 10004 });
    oldResult.resolve(false);
    await expect(pending).resolves.toBe(false);
    expect(sound.state.playbackError).toBe("");
  });

  it("plays a packaged WAV from the user cache when the network would fail with 10002", async () => {
    const bytes = new Uint8Array([82, 73, 70, 70]).buffer;
    const readFileSync = vi.fn(() => bytes);
    const writeFileSync = vi.fn();
    const networkCall = vi.fn(() => {
      throw new Error("10002 network unavailable");
    });
    const runtime = {
      env: { USER_DATA_PATH: "wxfile://usr" },
      getFileSystemManager: () => ({ readFileSync, writeFileSync }),
      downloadFile: networkCall,
      request: networkCall,
    };
    const source = createAnswerSoundSource({
      platform: () => "mp-weixin",
      runtime: () => runtime,
    });
    const player = createPlayer(async (path, options) => {
      if (path.startsWith("https://")) {
        options?.onError?.({ errCode: 10002, errMsg: "network unavailable" });
        return false;
      }
      return path.startsWith("wxfile://");
    });
    const sound = createMiniAnswerSound({ storage: createMemoryStorage().storage, player, source });

    await expect(sound.preview(true)).resolves.toBe(true);
    expect(readFileSync).toHaveBeenCalledWith("static/answer-sounds/wood-correct.wav");
    expect(writeFileSync).toHaveBeenCalledWith("wxfile://usr/kotobud-answer-sound-wood-correct.wav", bytes);
    expect(player.play).toHaveBeenCalledWith("wxfile://usr/kotobud-answer-sound-wood-correct.wav", expect.any(Object));
    expect(networkCall).not.toHaveBeenCalled();
    expect(sound.state.playbackError).toBe("");
  });

  it.each(["read", "write"] as const)("fails closed when native cache %s fails", async (failurePoint) => {
    const readFileSync = vi.fn(() => {
      if (failurePoint === "read") throw new Error("package file read failed");
      return new ArrayBuffer(4);
    });
    const writeFileSync = vi.fn(() => {
      if (failurePoint === "write") throw new Error("user cache write failed");
    });
    const source = createAnswerSoundSource({
      platform: () => "mp-weixin",
      runtime: () => ({
        env: { USER_DATA_PATH: "wxfile://usr" },
        getFileSystemManager: () => ({ readFileSync, writeFileSync }),
      }),
    });
    const player = createPlayer();
    const sound = createMiniAnswerSound({ storage: createMemoryStorage().storage, player, source });

    await expect(sound.preview(true)).resolves.toBe(false);
    expect(player.play).not.toHaveBeenCalled();
    expect(sound.state.playbackError).toContain("提示音播放失败");
  });

  it("reuses the resolved native user-cache path", async () => {
    const readFileSync = vi.fn(() => new ArrayBuffer(4));
    const writeFileSync = vi.fn();
    const source = createAnswerSoundSource({
      platform: () => "mp-weixin",
      runtime: () => ({
        env: { USER_DATA_PATH: "wxfile://usr" },
        getFileSystemManager: () => ({ readFileSync, writeFileSync }),
      }),
    });

    await expect(source.resolve("/static/answer-sounds/wood-correct.wav")).resolves.toBe(
      "wxfile://usr/kotobud-answer-sound-wood-correct.wav",
    );
    await expect(source.resolve("/static/answer-sounds/wood-correct.wav")).resolves.toBe(
      "wxfile://usr/kotobud-answer-sound-wood-correct.wav",
    );
    expect(readFileSync).toHaveBeenCalledTimes(1);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it("does not start playback if stop happens while the source is resolving", async () => {
    const delayedResolve = deferred<string>();
    const source = { resolve: vi.fn(() => delayedResolve.promise) };
    const player = createPlayer();
    const sound = createMiniAnswerSound({ storage: createMemoryStorage().storage, player, source });
    const pending = sound.preview(true);
    await vi.waitFor(() => expect(source.resolve).toHaveBeenCalledTimes(1));

    sound.stop();
    delayedResolve.resolve("wxfile://usr/kotobud-answer-sound-wood-correct.wav");

    await expect(pending).resolves.toBe(false);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("uses a static asset URL on H5", async () => {
    const source = createAnswerSoundSource({ platform: () => "h5", baseUrl: "/" });
    await expect(source.resolve("/static/answer-sounds/wood-correct.wav")).resolves.toBe(
      "/static/answer-sounds/wood-correct.wav",
    );
  });

  it("packages exactly the approved eight WAVs byte-for-byte", () => {
    const sourceDirectory = resolve("apps/web/src/assets/answer-sounds");
    const packageDirectory = resolve("apps/miniprogram/src/static/answer-sounds");
    const expected = [
      "chime-correct.wav",
      "chime-incorrect.wav",
      "stone-correct.wav",
      "stone-incorrect.wav",
      "timber-correct.wav",
      "timber-incorrect.wav",
      "wood-correct.wav",
      "wood-incorrect.wav",
    ];

    expect(readdirSync(packageDirectory).sort()).toEqual(expected);
    for (const fileName of expected) {
      expect(readFileSync(resolve(packageDirectory, fileName)).equals(readFileSync(resolve(sourceDirectory, fileName)))).toBe(true);
    }
  });

  it("detects a native wx runtime from its user-data path without uniPlatform", async () => {
    const readFileSync = vi.fn(() => new ArrayBuffer(4));
    const writeFileSync = vi.fn();
    vi.stubGlobal("wx", {
      env: { USER_DATA_PATH: "wxfile://usr" },
      getFileSystemManager: () => ({ readFileSync, writeFileSync }),
    });
    try {
      const source = createAnswerSoundSource();
      await expect(source.resolve("/static/answer-sounds/wood-correct.wav")).resolves.toBe(
        "wxfile://usr/kotobud-answer-sound-wood-correct.wav",
      );
      expect(readFileSync).toHaveBeenCalledWith("static/answer-sounds/wood-correct.wav");
      expect(writeFileSync).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
