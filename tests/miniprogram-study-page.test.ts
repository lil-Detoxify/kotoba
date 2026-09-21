import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Rating } from "ts-fsrs";
import type { Data, Word } from "@jp/models";
import { computed as vueComputed, ref as vueRef } from "vue";
import { applyStudyRating as realApplyStudyRating } from "../apps/miniprogram/src/pages/study/study-session";
import { statistics as realStatistics } from "@jp/core";

type Harness = {
  initStudy: (lessonId?: string, requestedMode?: string) => Promise<void>;
  flipCard: () => void;
  rate: (rating: Rating) => Promise<void>;
  playAudio: () => Promise<void>;
  onCardTap: () => void;
  onTouchStart: (event: any) => void;
  onTouchMove: (event: any) => void;
  onTouchEnd: (event: any) => void;
  onTouchCancel: () => void;
  refs: Record<string, { value: any }>;
};

const word: Word = { id: "w1", lessonId: "lesson-a", term: "猫", reading: "ねこ", meaning: "猫", order: 1 };
const data = (): Data => ({ books: [], lessons: [], words: [word], states: [], logs: [], seeded: true });

function loadStudyPage(repository: any, audio: any, getQueue = vi.fn(() => [word]), fallbackUrl = "https://kotobud.com/audio/legacy-w1.mp3"): { harness: Harness; lifecycle: { load?: (query?: any) => void; show?: () => void; hide?: () => void; unload?: () => void }; getQueue: any; players: any[] } {
  const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/study/study.vue"), "utf8");
  const descriptor = parse(source, { filename: "study.vue" }).descriptor;
  const script = compileScript(descriptor, { id: "study-page-test" });
  const setupMatch = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!setupMatch) throw new Error("Unable to extract script setup body");
  let code = ts.transpileModule(setupMatch[1], {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/__expose\(\);\s*/, "");
  code = code.replace(/^import .*?;\r?\n/gm, "");
  code += "\nreturn { initStudy, flipCard, rate, playAudio, onCardTap, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, refs: { words, currentWord, revealed, message, saving, speaking, loading, loadError, mode } };";

  const lifecycle: { load?: (query?: any) => void; show?: () => void; hide?: () => void; unload?: () => void } = {};
  const players: any[] = [];
  class MockPlayer {
    constructor() { players.push(this); }
    play = vi.fn((url: string, options?: any) => audio.play(url, options));
    stop = vi.fn(() => audio.stop?.());
    destroy = vi.fn(() => audio.destroy?.());
  }
  const runner = new Function(
    "ref", "computed", "onLoad", "onShow", "onHide", "onUnload", "defaultRepository", "UniAudioPlayer", "getWordAudioUrl", "getWordAudioFallbackUrl", "Rating", "statistics", "seedData", "applyStudyRating", "getStudyQueue", "uni",
    code,
  );
  const apply = vi.fn((d: Data, w: Word, rating: Rating, mode: any, now: Date, id: string, responseTime: number) => realApplyStudyRating(d, w, rating as any, mode, now, id, responseTime));
  const harness = runner(
    vueRef, vueComputed,
    (callback: (query?: any) => void) => { lifecycle.load = callback; },
    (callback: () => void) => { lifecycle.show = callback; },
    (callback: () => void) => { lifecycle.hide = callback; },
    (callback: () => void) => { lifecycle.unload = callback; },
    repository, MockPlayer, () => "https://kotobud.com/audio/w1.mp3", () => fallbackUrl, Rating, realStatistics, { books: [], lessons: [], words: [] }, apply, getQueue,
    { switchTab: vi.fn() },
  ) as Harness;
  return { harness, lifecycle, getQueue, players };
}

describe("study page script", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires reveal before rating and allows a revealed rating", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async (change: any) => { const d = data(); change(d); return d; }) };
    const audio = { play: vi.fn(async () => true), stop: vi.fn(), destroy: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio);
    await lifecycle.load?.({ mode: "new" });
    await harness.rate(Rating.Good);
    expect(repository.transact).not.toHaveBeenCalled();
    harness.flipCard();
    await harness.rate(Rating.Good);
    expect(repository.transact).toHaveBeenCalledOnce();
  });

  it("performs only one write when rating is tapped rapidly", async () => {
    let resolveWrite!: (value: Data) => void;
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn((change: any) => new Promise<Data>((resolve) => { const d = data(); change(d); resolveWrite = resolve; })) };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    harness.flipCard();
    const first = harness.rate(Rating.Good);
    const second = harness.rate(Rating.Easy);
    expect(repository.transact).toHaveBeenCalledOnce();
    resolveWrite(data());
    await Promise.all([first, second]);
  });

  it("keeps the same card after a failed save and permits retry", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn()
      .mockRejectedValueOnce(new Error("quota"))
      .mockImplementation(async (change: any) => { const d = data(); change(d); return d; }) };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    const current = harness.refs.currentWord.value;
    harness.flipCard();
    await harness.rate(Rating.Good);
    expect(harness.refs.currentWord.value).toBe(current);
    expect(harness.refs.message.value).toContain("保存失败");
    await harness.rate(Rating.Good);
    expect(repository.transact).toHaveBeenCalledTimes(2);
  });

  it("preserves the requested lesson and mode when retrying initialization", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn().mockRejectedValueOnce(new Error("read failed")).mockResolvedValue(data()), transact: vi.fn() };
    const { harness, lifecycle, getQueue } = loadStudyPage(repository, {});
    await lifecycle.load?.({ lessonId: "lesson-a", mode: "difficult" });
    expect(harness.refs.loadError.value).toContain("无法读取");
    await harness.initStudy();
    expect(getQueue).toHaveBeenLastCalledWith(expect.anything(), "difficult", "lesson-a");
  });

  it("stops audio on hide and destroys it on unload", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const audio = { play: vi.fn(async () => true), stop: vi.fn(), destroy: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio);
    await lifecycle.load?.();
    await harness.playAudio();
    lifecycle.hide?.();
    lifecycle.unload?.();
    expect(audio.stop).toHaveBeenCalledTimes(2);
    expect(audio.destroy).toHaveBeenCalledOnce();
    expect(harness.refs.speaking.value).toBe(false);
  });

  it("flips only for a horizontal swipe and suppresses the follow-up tap", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    harness.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    harness.onTouchEnd({ changedTouches: [{ clientX: 90, clientY: 8 }] });
    expect(harness.refs.revealed.value).toBe(true);
    harness.flipCard();
    harness.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    harness.onTouchEnd({ changedTouches: [{ clientX: 20, clientY: 0 }] });
    harness.onCardTap();
    expect(harness.refs.revealed.value).toBe(false);
  });

  it("cancels vertical and multi-touch gestures without flipping", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    harness.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    harness.onTouchEnd({ changedTouches: [{ clientX: 90, clientY: 80 }] });
    expect(harness.refs.revealed.value).toBe(false);
    harness.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    harness.onTouchMove({ touches: [{ clientX: 0, clientY: 0 }, { clientX: 1, clientY: 1 }] });
    harness.onTouchEnd({ changedTouches: [{ clientX: 100, clientY: 0 }] });
    expect(harness.refs.revealed.value).toBe(false);
    harness.onTouchCancel();
  });

  it("invalidates a late play promise after hide and creates a fresh player after unload", async () => {
    let resolvePlay!: (value: boolean) => void;
    const audio = { play: vi.fn(() => new Promise<boolean>((resolve) => { resolvePlay = resolve; })), stop: vi.fn(), destroy: vi.fn() };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const first = loadStudyPage(repository, audio);
    await first.lifecycle.load?.();
    const firstPlay = first.harness.playAudio();
    expect(first.harness.refs.speaking.value).toBe(true);
    first.lifecycle.hide?.();
    resolvePlay(true);
    await firstPlay;
    expect(first.harness.refs.speaking.value).toBe(false);
    first.lifecycle.unload?.();
    expect(first.players).toHaveLength(1);
    const second = loadStudyPage(repository, { play: vi.fn(async () => true), stop: vi.fn(), destroy: vi.fn() });
    await second.lifecycle.load?.();
    await second.harness.playAudio();
    expect(second.players).toHaveLength(1);
    expect(second.players[0]).not.toBe(first.players[0]);
  });

  it("tries the legacy audio URL once when the primary URL fails", async () => {
    const audio = { play: vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true), stop: vi.fn(), destroy: vi.fn() };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio, undefined, "https://kotobud.com/audio/legacy.mp3");
    await lifecycle.load?.();
    await harness.playAudio();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.play.mock.calls.map((call: any[]) => call[0])).toEqual([
      "https://kotobud.com/audio/w1.mp3",
      "https://kotobud.com/audio/legacy.mp3",
    ]);
  });

  it("does not start a fallback play after hide invalidates the audio ticket", async () => {
    let resolvePrimary!: (value: boolean) => void;
    const audio = { play: vi.fn(() => new Promise<boolean>((resolve) => { resolvePrimary = resolve; })), stop: vi.fn(), destroy: vi.fn() };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio);
    await lifecycle.load?.();
    const pending = harness.playAudio();
    lifecycle.hide?.();
    resolvePrimary(false);
    await pending;
    expect(audio.play).toHaveBeenCalledOnce();
  });
});
