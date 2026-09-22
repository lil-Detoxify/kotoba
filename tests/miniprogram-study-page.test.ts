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
import { createStudyQuestion, ratingForStudyAnswer, submitStudyAnswer } from "../apps/miniprogram/src/pages/study/study-quiz";

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
  selectExercise: (value: string) => void;
  submitAnswer: (selected: string) => void;
  toggleDifficult: () => Promise<void>;
  refs: Record<string, { value: any }>;
};

const word: Word = { id: "w1", lessonId: "lesson-a", term: "猫", reading: "ねこ", meaning: "猫", order: 1 };
const data = (): Data => ({ books: [], lessons: [], words: [word], states: [], logs: [], seeded: true });

function loadStudyPage(repository: any, audio: any, getQueue = vi.fn(() => [word]), fallbackUrl = "https://kotobud.com/audio/legacy-w1.mp3", audioCache: any = { getCached: vi.fn(async () => undefined), warm: vi.fn(async () => undefined), invalidate: vi.fn(async () => undefined) }): { harness: Harness; lifecycle: { load?: (query?: any) => void; show?: () => void; hide?: () => void; unload?: () => void }; getQueue: any; players: any[]; textbooks: any; audioCache: any } {
  if (!repository.transactAndEnqueue) {
    repository.transactAndEnqueue = vi.fn(async (change: any, itemsFactory: any, key?: string) => {
      const updated = await repository.transact(change, key);
      await itemsFactory(updated);
      return updated;
    });
  }
  const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/study/study.vue"), "utf8");
  const descriptor = parse(source, { filename: "study.vue" }).descriptor;
  const script = compileScript(descriptor, { id: "study-page-test" });
  const setupMatch = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!setupMatch) throw new Error("Unable to extract script setup body");
  let code = ts.transpileModule(setupMatch[1], {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/__expose\(\);\s*/, "");
  code = code.replace(/^import .*?;\r?\n/gm, "");
  code += "\nreturn { initStudy, flipCard, rate, playAudio, selectExercise, submitAnswer, toggleDifficult, onCardTap, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, refs: { words, currentWord, revealed, message, saving, speaking, loading, loadError, mode, exercise, attempt, question, uncertain, isDifficult, markingDifficult } };";

  const lifecycle: { load?: (query?: any) => void; show?: () => void; hide?: () => void; unload?: () => void } = {};
  const players: any[] = [];
  class MockPlayer {
    constructor() { players.push(this); }
    play = vi.fn((url: string, options?: any) => audio.play(url, options));
    stop = vi.fn(() => audio.stop?.());
    destroy = vi.fn(() => audio.destroy?.());
  }
  const runner = new Function(
    "ref", "computed", "onLoad", "onShow", "onHide", "onUnload", "defaultAudioCache", "defaultRepository", "defaultSyncCoordinator", "UniAudioPlayer", "getWordAudioUrl", "getWordAudioFallbackUrl", "Rating", "statistics", "applyStudyRating", "getStudyQueue", "uni", "defaultTextbooks", "createStudyQuestion", "ratingForStudyAnswer", "submitStudyAnswer", "setDifficult", "reviewQueueItems",
    code,
  );
  const apply = vi.fn((d: Data, w: Word, rating: Rating, mode: any, now: Date, id: string, responseTime: number, quiz?: any) => realApplyStudyRating(d, w, rating as any, mode, now, id, responseTime, quiz));
  const textbooks = { prepareStudy: vi.fn(async () => repository.read()) };
  const harness = runner(
    vueRef, vueComputed,
    (callback: (query?: any) => void) => { lifecycle.load = callback; },
    (callback: () => void) => { lifecycle.show = callback; },
    (callback: () => void) => { lifecycle.hide = callback; },
    (callback: () => void) => { lifecycle.unload = callback; },
    audioCache, repository, { flush: vi.fn(async () => true) }, MockPlayer, () => "https://kotobud.com/audio/w1.mp3", () => fallbackUrl, Rating, realStatistics, apply, getQueue,
    { switchTab: vi.fn() }, textbooks, createStudyQuestion, ratingForStudyAnswer, submitStudyAnswer,
    vi.fn(async (wordId: string, value: boolean) => {
      const snapshot = await repository.read();
      const state = snapshot.states.find((item: any) => item.wordId === wordId);
      if (state) state.isDifficult = value;
      return snapshot;
    }),
    (log: any, state: any) => [{ id: log.id, type: "review_event", payload: log, createdAt: log.reviewedAt, retries: 0 }, { id: `progress:${state.wordId}`, type: "progress", payload: state, createdAt: state.updatedAt, retries: 0 }],
  ) as Harness;
  return { harness, lifecycle, getQueue, players, textbooks, audioCache };
}

describe("study page script", () => {
  beforeEach(() => vi.restoreAllMocks());
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it("requires reveal before rating and allows a revealed rating", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async (change: any) => { const d = data(); change(d); return d; }) };
    const audio = { play: vi.fn(async () => true), stop: vi.fn(), destroy: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio);
    await lifecycle.load?.({ mode: "new" });
    await settle();
    await harness.rate(Rating.Good);
    expect(repository.transact).not.toHaveBeenCalled();
    harness.flipCard();
    await harness.rate(Rating.Good);
    expect(repository.transact).toHaveBeenCalledOnce();
  });

  it("resets quiz state after advancing and never rates a card before reveal", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async (change: any) => { const d = data(); change(d); return d; }) };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    await settle();
    await harness.rate(Rating.Good);
    expect(repository.transact).not.toHaveBeenCalled();
    harness.flipCard();
    await harness.rate(Rating.Good);
    expect(harness.refs.revealed.value).toBe(false);
    expect(harness.refs.attempt.value).toBeNull();
    expect(harness.refs.question.value).toBeNull();
  });

  it("stores a wrong quiz answer as Again and prevents a second manual rating", async () => {
    const quizData = data();
    quizData.words = [
      word,
      { ...word, id: "w2", term: "犬", reading: "いぬ", meaning: "狗" },
      { ...word, id: "w3", term: "鳥", reading: "とり", meaning: "鸟" },
      { ...word, id: "w4", term: "花", reading: "はな", meaning: "花" },
    ];
    let savedRating: Rating | undefined;
    let savedQuiz: Data["logs"][number]["quiz"];
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => quizData), transact: vi.fn(async (change: any) => { const d = quizData; change(d); savedRating = d.logs.at(-1)?.rating; savedQuiz = d.logs.at(-1)?.quiz; return d; }) };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    await settle();
    harness.selectExercise("kana-meaning");
    const question = harness.refs.question.value;
    if (!question) return;
    const wrong = question.options.find((option: string) => option !== question.correct) || question.options[0];
    harness.submitAnswer(wrong);
    await harness.rate(Rating.Easy);
    expect(repository.transact).toHaveBeenCalledOnce();
    expect(savedRating).toBe(Rating.Again);
    expect(savedQuiz).toMatchObject({ type: "kana-meaning", selected: wrong, isCorrect: false });
    await harness.rate(Rating.Good);
    expect(repository.transact).toHaveBeenCalledOnce();
  });

  it("discards an initialization result after the active account changes", async () => {
    let activeKey = "data_guest";
    let resolveRead!: (value: Data) => void;
    const repository = {
      getActiveKey: vi.fn(() => activeKey),
      read: vi.fn(() => new Promise<Data>((resolve) => { resolveRead = resolve; })),
      transact: vi.fn(),
    };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    lifecycle.load?.();
    await vi.waitFor(() => expect(repository.read).toHaveBeenCalledOnce());
    activeKey = "data_user_alice";
    resolveRead(data());
    await settle();
    expect(harness.refs.currentWord.value).toBeNull();
    expect(harness.refs.loadError.value).toContain("无法读取");
  });

  it("persists a difficult mark and blocks rating while the mark is in flight", async () => {
    let resolveRead!: (value: Data) => void;
    const repository = {
      getActiveKey: vi.fn(() => "data_guest"),
      read: vi.fn()
        .mockResolvedValueOnce(data())
        .mockImplementationOnce(() => new Promise<Data>((resolve) => { resolveRead = resolve; })),
      transact: vi.fn(),
    };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    await settle();
    const marking = harness.toggleDifficult();
    expect(harness.refs.markingDifficult.value).toBe(true);
    harness.flipCard();
    await harness.rate(Rating.Good);
    expect(repository.transact).not.toHaveBeenCalled();
    resolveRead(data());
    await marking;
    expect(harness.refs.isDifficult.value).toBe(true);
  });

  it("performs only one write when rating is tapped rapidly", async () => {
    let resolveWrite!: (value: Data) => void;
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn((change: any) => new Promise<Data>((resolve) => { const d = data(); change(d); resolveWrite = resolve; })) };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    await settle();
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
    await settle();
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
    const { harness, lifecycle, textbooks } = loadStudyPage(repository, {});
    await lifecycle.load?.({ lessonId: "lesson-a", mode: "difficult" });
    await settle();
    expect(harness.refs.loadError.value).toContain("无法读取");
    await harness.initStudy();
    expect(textbooks.prepareStudy).toHaveBeenLastCalledWith("lesson-a", "difficult");
  });

  it("stops audio on hide and destroys it on unload", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const audio = { play: vi.fn(async () => true), stop: vi.fn(), destroy: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio);
    await lifecycle.load?.();
    await settle();
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
    await settle();
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
    await settle();
    const firstPlay = first.harness.playAudio();
    expect(first.harness.refs.speaking.value).toBe(true);
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    first.lifecycle.hide?.();
    resolvePlay(true);
    await firstPlay;
    expect(first.harness.refs.speaking.value).toBe(false);
    first.lifecycle.unload?.();
    expect(first.players).toHaveLength(1);
    const second = loadStudyPage(repository, { play: vi.fn(async () => true), stop: vi.fn(), destroy: vi.fn() });
    await second.lifecycle.load?.();
    await settle();
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
    await settle();
    await harness.playAudio();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.play.mock.calls.map((call: any[]) => call[0])).toEqual([
      "https://kotobud.com/audio/w1.mp3",
      "https://kotobud.com/audio/legacy.mp3",
    ]);
  });

  it("streams a cache miss and warms it after successful playback", async () => {
    const cache = { getCached: vi.fn(async () => undefined), warm: vi.fn(async () => undefined), invalidate: vi.fn(async () => undefined) };
    const audio = { play: vi.fn(async () => true), stop: vi.fn(), destroy: vi.fn() };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio, undefined, undefined, cache);
    await lifecycle.load?.();
    await settle();
    await harness.playAudio();
    expect(audio.play).toHaveBeenCalledWith("https://kotobud.com/audio/w1.mp3", expect.any(Object));
    expect(cache.warm).toHaveBeenCalledWith("https://kotobud.com/audio/w1.mp3");
  });

  it("does not fallback after focus interruption", async () => {
    const cache = { getCached: vi.fn(async () => undefined), warm: vi.fn(async () => undefined), invalidate: vi.fn(async () => undefined) };
    const audio = { play: vi.fn(async (_url: string, options?: any) => { options?.onInterrupted?.(); return false; }), stop: vi.fn(), destroy: vi.fn() };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio, undefined, "https://kotobud.com/audio/legacy.mp3", cache);
    await lifecycle.load?.();
    await settle();
    await harness.playAudio();
    expect(audio.play).toHaveBeenCalledOnce();
    expect(cache.warm).not.toHaveBeenCalled();
    expect(harness.refs.speaking.value).toBe(false);
  });

  it("uses a cached path and invalidates it before retrying the CDN", async () => {
    const cache = { getCached: vi.fn(async () => "/saved/w1.mp3"), warm: vi.fn(async () => undefined), invalidate: vi.fn(async () => undefined) };
    const audio = { play: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), stop: vi.fn(), destroy: vi.fn() };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio, undefined, "https://kotobud.com/audio/legacy.mp3", cache);
    await lifecycle.load?.();
    await settle();
    await harness.playAudio();
    expect(cache.invalidate).toHaveBeenCalledWith("https://kotobud.com/audio/w1.mp3");
    expect(audio.play.mock.calls.map((call: any[]) => call[0])).toEqual(["/saved/w1.mp3", "https://kotobud.com/audio/w1.mp3"]);
  });

  it("does not start a fallback play after hide invalidates the audio ticket", async () => {
    let resolvePrimary!: (value: boolean) => void;
    const audio = { play: vi.fn(() => new Promise<boolean>((resolve) => { resolvePrimary = resolve; })), stop: vi.fn(), destroy: vi.fn() };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio);
    await lifecycle.load?.();
    await settle();
    const pending = harness.playAudio();
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());
    lifecycle.hide?.();
    resolvePrimary(false);
    await pending;
    expect(audio.play).toHaveBeenCalledOnce();
  });
});
