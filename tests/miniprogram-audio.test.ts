import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UniAudioPlayer } from "../apps/miniprogram/src/adapters/audio";

type AudioMock = {
  src?: string;
  playbackRate?: number;
  play: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  onEnded: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  ended: Array<() => void>;
  errors: Array<(error: unknown) => void>;
};

function audioMock(withOff = true): AudioMock {
  const ended: Array<() => void> = [];
  const errors: Array<(error: unknown) => void> = [];
  const mock: AudioMock = {
    play: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    onEnded: vi.fn((callback: () => void) => ended.push(callback)),
    onError: vi.fn((callback: (error: unknown) => void) => errors.push(callback)),
    ended,
    errors
  };
  if (withOff) {
    (mock as any).offEnded = vi.fn((callback: () => void) => {
      const index = ended.indexOf(callback);
      if (index >= 0) ended.splice(index, 1);
    });
    (mock as any).offError = vi.fn((callback: (error: unknown) => void) => {
      const index = errors.indexOf(callback);
      if (index >= 0) errors.splice(index, 1);
    });
  }
  return mock;
}

describe("UniAudioPlayer", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("configures uni audio and resolves a successful play", async () => {
    const context = audioMock();
    const setInnerAudioOption = vi.fn();
    vi.stubGlobal("uni", { createInnerAudioContext: () => context, setInnerAudioOption });
    const onEnded = vi.fn();
    const player = new UniAudioPlayer();

    const result = player.play("https://kotobud.com/audio/a.mp3", { slow: true, onEnded });
    expect(context.src).toBe("https://kotobud.com/audio/a.mp3");
    expect(context.playbackRate).toBe(0.75);
    expect(setInnerAudioOption).toHaveBeenCalledWith({ obeyMuteSwitch: false });
    expect(player.isSpeaking()).toBe(true);
    context.ended[0]();
    expect(await result).toBe(true);
    expect(onEnded).toHaveBeenCalledOnce();
    expect(player.isSpeaking()).toBe(false);
  });

  it("settles a pending play when stopped and removes listeners", async () => {
    const context = audioMock();
    vi.stubGlobal("uni", { createInnerAudioContext: () => context });
    const player = new UniAudioPlayer();
    const result = player.play("audio.mp3");
    player.stop();

    expect(await result).toBe(false);
    expect(context.stop).toHaveBeenCalledOnce();
    expect(context.ended).toHaveLength(0);
    expect(context.errors).toHaveLength(0);
    expect(player.isSpeaking()).toBe(false);
  });

  it("ignores late callbacks from a previous play even without off listeners", async () => {
    const context = audioMock(false);
    vi.stubGlobal("uni", { createInnerAudioContext: () => context });
    const player = new UniAudioPlayer();
    const first = player.play("first.mp3");
    const second = player.play("second.mp3");

    expect(await first).toBe(false);
    context.ended[0]();
    context.ended[1]();
    expect(await second).toBe(true);
    expect(context.ended).toHaveLength(2);
  });

  it("reports native errors and releases the context on destroy", async () => {
    const context = audioMock();
    vi.stubGlobal("uni", { createInnerAudioContext: () => context });
    const onError = vi.fn();
    const player = new UniAudioPlayer();
    const result = player.play("broken.mp3", { onError });
    const error = { errMsg: "decode failed" };
    context.errors[0](error);

    expect(await result).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
    player.destroy();
    expect(context.destroy).toHaveBeenCalledOnce();
    expect(await player.play("after-destroy.mp3")).toBe(false);
  });

  it("times out a silent native context and stops it", async () => {
    vi.useFakeTimers();
    const context = audioMock();
    vi.stubGlobal("uni", { createInnerAudioContext: () => context });
    const onError = vi.fn();
    const player = new UniAudioPlayer();
    const result = player.play("never-ends.mp3", { onError });

    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toBe(false);
    expect(context.stop).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(player.isSpeaking()).toBe(false);
  });

  it("settles when the native play call throws", async () => {
    const context = audioMock();
    context.play.mockImplementation(() => {
      throw new Error("play unavailable");
    });
    vi.stubGlobal("uni", { createInnerAudioContext: () => context });
    const player = new UniAudioPlayer();

    expect(await player.play("broken-native.mp3")).toBe(false);
    expect(context.stop).toHaveBeenCalledOnce();
    expect(player.isSpeaking()).toBe(false);
  });
});
