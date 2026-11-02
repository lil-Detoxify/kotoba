import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UniAudioPlayer } from "../apps/miniprogram/src/adapters/audio";

type AudioMock = {
  volume?: number;
  play: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  ended: Array<() => void>;
  onEnded: (callback: () => void) => void;
  onError: ReturnType<typeof vi.fn>;
};

function audioMock(): AudioMock {
  const ended: Array<() => void> = [];
  const mock: AudioMock = {
    play: vi.fn(),
    stop: vi.fn(),
    ended,
    onEnded: (callback: () => void) => ended.push(callback),
    onError: vi.fn(),
  };
  mock.play.mockImplementation(() => ended[ended.length - 1]?.());
  return mock;
}

describe("UniAudioPlayer volume", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores full volume when a later play omits volume", async () => {
    const context = audioMock();
    const volumesAtPlay: number[] = [];
    context.play.mockImplementation(() => {
      volumesAtPlay.push(context.volume!);
      context.ended[context.ended.length - 1]?.();
    });
    vi.stubGlobal("uni", { createInnerAudioContext: () => context });
    const player = new UniAudioPlayer();

    expect(await player.play("effect.mp3", { volume: 0.45 })).toBe(true);
    expect(await player.play("word.mp3")).toBe(true);
    expect(volumesAtPlay).toEqual([0.45, 1]);
  });

  it("defaults non-finite volume to full and clamps finite values to 0..1", async () => {
    const context = audioMock();
    const volumesAtPlay: number[] = [];
    context.play.mockImplementation(() => {
      volumesAtPlay.push(context.volume!);
      context.ended[context.ended.length - 1]?.();
    });
    vi.stubGlobal("uni", { createInnerAudioContext: () => context });
    const player = new UniAudioPlayer();

    for (const volume of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1, 2]) {
      expect(await player.play("tone.mp3", { volume })).toBe(true);
    }

    expect(volumesAtPlay).toEqual([1, 1, 0, 0, 1, 1]);
  });
});
