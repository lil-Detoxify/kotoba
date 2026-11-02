import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Rating } from "ts-fsrs";
import type { Data, Word } from "@jp/models";
import { computed as vueComputed, nextTick as vueNextTick, ref as vueRef, watch as vueWatch } from "vue";
import { applyStudyRating as realApplyStudyRating } from "../apps/miniprogram/src/pages/study/study-session";
import { parseHistoricalPractice as realParseHistoricalPractice } from "../apps/miniprogram/src/services/historical-practice";
import { stateFor as realStateFor, statistics as realStatistics } from "@jp/core";
import { createStudyQuestion, hasStudyContent, ratingForStudyAnswer, submitStudyAnswer } from "../apps/miniprogram/src/pages/study/study-quiz";
import { sceneExampleFor as realSceneExampleFor } from "../apps/miniprogram/src/services/learning-scenes";
import {
  miniPersonalClozeExampleFor,
  miniPersonalExampleFor,
  miniReadingContextPracticeWords,
  parseMiniReadingContextIds,
} from "../apps/miniprogram/src/services/personal-reading-practice";
import { createSentenceCloze } from "../apps/miniprogram/src/services/learning-examples";
import { lessonPracticeRecommendation } from "../apps/web/src/services/lesson-practice-recommendation";
import { resolveMiniStudyCheckpoint, type MiniStudyCheckpoint } from "../apps/miniprogram/src/services/study-checkpoint";
import { getCloudflareAudioUrl } from "../apps/miniprogram/src/adapters/audio-url";
import { createMiniStudyAutoPronunciationGate, shouldAutoPronounceAfterReveal, shouldAutoPronounceOnEntry } from "../apps/miniprogram/src/services/auto-pronunciation-preference";
import { createMiniStudyExercisePreference, isMiniStudyExercise } from "../apps/miniprogram/src/services/study-exercise-preference";
import {
  clampStudyMascotPosition,
  DEFAULT_STUDY_MASCOT_POSITION,
  movedBeforeMascotLongPress,
  parseStudyMascotPosition,
  readStudyMascotPosition,
  readStudyMascotVisibility,
  STUDY_MASCOT_POSITION_KEY,
  translateStudyMascotPosition,
  writeStudyMascotPosition,
} from "../apps/miniprogram/src/services/mascot";

type Harness = {
  initStudy: (lessonId?: string, requestedMode?: string, requestedExercise?: string) => Promise<void>;
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
  ignoreCurrentWord: () => Promise<void>;
  selectVoice: (voice: "female" | "male") => Promise<void>;
  previousWord: () => void;
  returnToCurrent: () => void;
  preloader: { schedule: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
  refs: Record<string, { value: any }>;
};

const word: Word = { id: "w1", lessonId: "lesson-a", term: "猫", reading: "ねこ", meaning: "猫", order: 1 };
const data = (): Data => ({ books: [], lessons: [], words: [word], states: [], logs: [], seeded: true });

function originalSentenceData(sentence: string, contextId = "context-a", wordOverrides: Partial<Word> = {}): Data {
  const context = {
    id: contextId,
    sentence,
    translation: "中文译文",
    matchedText: "猫",
    createdAt: "2026-10-20T09:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z",
  };
  const target = { ...word, ...wordOverrides, readingContexts: [context] } as Word;
  return {
    ...data(),
    books: [{ id: "book-a", title: "测试词书" }, { id: "book-current", title: "当前词书" }] as Data["books"],
    lessons: [{ id: "lesson-a", bookId: "book-a", title: "第一课", order: 1 }] as Data["lessons"],
    words: [target],
    currentBookId: "book-current",
  };
}

function loadStudyPage(repository: any, audio: any, getQueue = vi.fn(() => [word]), fallbackUrl = "https://kotobud.com/audio/legacy-w1.mp3", audioCache: any = { getCached: vi.fn(async () => undefined), warm: vi.fn(async () => undefined), invalidate: vi.fn(async () => undefined) }, primaryUrl = "https://kotobud.com/audio/w1.mp3", createQuestionFactory = createStudyQuestion, options: { autoPronunciation?: boolean; answerSound?: any; audioUrlForWord?: (target: Word) => string; checkpointService?: any } = {}): { harness: Harness; lifecycle: { load?: (query?: any) => void; show?: () => void; ready?: () => void; hide?: () => void; unload?: () => void }; getQueue: any; players: any[]; textbooks: any; audioCache: any; checkpointService: any; setWindowInfo: (info: any) => void } {
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
  let code = ts.transpileModule(setupMatch[1].replaceAll("import.meta.env.DEV", "false"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/__expose\(\);\s*/, "");
  code = code.replace(/^import .*?;\r?\n/gm, "");
  code += "\nreturn { initStudy, flipCard, rate, playAudio, selectExercise, submitAnswer, toggleDifficult, ignoreCurrentWord, selectVoice, previousWord, returnToCurrent, onCardTap, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, preloader, refs: { words, loadedData, currentWord, audioUrl, revealed, message, saving, speaking, loading, loadError, mode, voice, exercise, preferredExercise, attempt, question, clozeQuestion, displayExample, exerciseFallback, showGenericAudioControls, mascotPositionStyle, mascotStyleBounds, mascotPositionReady, heard, uncertain, isDifficult, markingDifficult, mascotPose, mascotVisible, finished, historyWords, reviewing, reviewWord, canPrevious, startedAt, autoEnabled: miniAutoPronunciationPreference.state.enabled } };";

  const lifecycle: { load?: (query?: any) => void; show?: () => void; ready?: () => void; hide?: () => void; unload?: () => void } = {};
  let windowInfo = { windowWidth: 390, windowHeight: 780, screenHeight: 800, safeArea: { bottom: 780 } };
  const players: any[] = [];
  class MockPlayer {
    constructor() { players.push(this); }
    play = vi.fn((url: string, options?: any) => audio.play(url, options));
    stop = vi.fn(() => audio.stop?.());
    destroy = vi.fn(() => audio.destroy?.());
  }
  class MockPreloader {
    schedule = vi.fn();
    cancel = vi.fn();
    isActive = vi.fn(() => false);
  }
  const answerSound = options.answerSound ?? { play: vi.fn(async () => true), stop: vi.fn(), setForeground: vi.fn() };
  const autoPronunciation = { state: { enabled: options.autoPronunciation ?? false }, load: vi.fn(async () => {}), setEnabled: vi.fn(async () => {}) };
  const studyExercisePreference = createMiniStudyExercisePreference({ getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) });
  const runner = new Function(
    "ref", "computed", "watch", "nextTick", "onLoad", "onShow", "onReady", "onHide", "onUnload", "defaultAudioCache", "defaultRepository", "defaultStorage", "defaultSyncCoordinator", "UniAudioPlayer", "AudioPreloader", "AUDIO_VOICE_OPTIONS", "getWordAudioUrl", "getWordAudioFallbackUrl", "getCloudflareAudioUrl", "Rating", "statistics", "stateFor", "applyStudyRating", "getStudyQueue", "uni", "defaultTextbooks", "textbookCatalog", "createStudyQuestion", "hasStudyContent", "ratingForStudyAnswer", "submitStudyAnswer", "setDifficult", "setIgnored", "setPronunciationVoice", "reviewQueueItems", "clampStudyMascotPosition", "DEFAULT_STUDY_MASCOT_POSITION", "movedBeforeMascotLongPress", "parseStudyMascotPosition", "readStudyMascotPosition", "readStudyMascotVisibility", "translateStudyMascotPosition", "writeStudyMascotPosition", "STUDY_MASCOT_POSITION_KEY", "parseStudyMascotPosition",
    "createMiniStudyAutoPronunciationGate", "miniAutoPronunciationPreference", "miniAnswerSound", "isMiniStudyExercise", "miniStudyExercisePreference", "shouldAutoPronounceAfterReveal", "shouldAutoPronounceOnEntry", "sceneExampleFor", "parseHistoricalPractice", "miniPersonalClozeExampleFor", "miniPersonalExampleFor", "miniReadingContextPracticeWords", "parseMiniReadingContextIds", "createSentenceCloze", "miniStudyCheckpoint", "resolveMiniStudyCheckpoint", "lessonPracticeRecommendation", "useMiniPageActivity", code,
  );
  const apply = vi.fn((d: Data, w: Word, rating: Rating, mode: any, now: Date, id: string, responseTime: number, quiz?: any) => realApplyStudyRating(d, w, rating as any, mode, now, id, responseTime, quiz));
  const textbooks = {
    prepareStudy: vi.fn(async () => repository.read()),
    hydrate: vi.fn(async () => repository.read()),
    ensureBookLoaded: vi.fn(async () => repository.read()),
  };
  const checkpointService = options.checkpointService ?? {
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const harness = runner(
    vueRef, vueComputed, vueWatch, vueNextTick,
    (callback: (query?: any) => void) => { lifecycle.load = callback; },
    (callback: () => void) => { lifecycle.show = callback; },
    (callback: () => void) => { lifecycle.ready = callback; },
    (callback: () => void) => { lifecycle.hide = callback; },
    (callback: () => void) => { lifecycle.unload = callback; },
    audioCache, repository, { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) }, { flush: vi.fn(async () => true) }, MockPlayer, MockPreloader,
    [{ value: "female", label: "女声 · A" }, { value: "male", label: "男声 · C" }],
    (target: Word) => options.audioUrlForWord?.(target) ?? primaryUrl, () => fallbackUrl, getCloudflareAudioUrl,
    Rating, realStatistics, realStateFor, apply, getQueue,
    {
      switchTab: vi.fn(),
      getWindowInfo: vi.fn(() => windowInfo),
      upx2px: vi.fn((value: number) => value / 2),
      onWindowResize: vi.fn(),
      offWindowResize: vi.fn(),
    }, textbooks, [], createQuestionFactory, hasStudyContent, ratingForStudyAnswer, submitStudyAnswer,
    vi.fn(async (wordId: string, value: boolean) => {
      const snapshot = await repository.read();
      const state = snapshot.states.find((item: any) => item.wordId === wordId);
      if (state) state.isDifficult = value;
      return snapshot;
    }),
    vi.fn(async (wordId: string, value: boolean) => {
      const snapshot = await repository.read();
      const state = snapshot.states.find((item: any) => item.wordId === wordId);
      if (state) state.isIgnored = value;
      return snapshot;
    }),
    vi.fn(async (value: "female" | "male") => {
      const snapshot = await repository.read();
      snapshot.userSettings = { userId: "local", updatedAt: new Date().toISOString(), preferences: { pronunciationVoice: value } };
      return snapshot;
    }),
    (log: any, state: any) => [{ id: log.id, type: "review_event", payload: log, createdAt: log.reviewedAt, retries: 0 }, { id: `progress:${state.wordId}`, type: "progress", payload: state, createdAt: state.updatedAt, retries: 0 }],
    clampStudyMascotPosition, DEFAULT_STUDY_MASCOT_POSITION, movedBeforeMascotLongPress, parseStudyMascotPosition, readStudyMascotPosition, readStudyMascotVisibility, translateStudyMascotPosition, writeStudyMascotPosition, STUDY_MASCOT_POSITION_KEY, parseStudyMascotPosition,
    createMiniStudyAutoPronunciationGate, autoPronunciation, answerSound, isMiniStudyExercise, studyExercisePreference,
    shouldAutoPronounceAfterReveal, shouldAutoPronounceOnEntry, realSceneExampleFor, realParseHistoricalPractice,
    miniPersonalClozeExampleFor, miniPersonalExampleFor, miniReadingContextPracticeWords, parseMiniReadingContextIds, createSentenceCloze,
    checkpointService, resolveMiniStudyCheckpoint, lessonPracticeRecommendation,
    () => vueRef(true),
    ) as Harness;
  return { harness, lifecycle, getQueue, players, textbooks, audioCache, checkpointService, setWindowInfo: (info: any) => { windowInfo = info; } };
}

describe("study page script", () => {
  beforeEach(() => vi.restoreAllMocks());
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it("reads the first and next words after answer feedback finishes", async () => {
    let resolveHint!: (played: boolean) => void;
    const nextWord = { ...word, id: "w2", term: "犬", reading: "いぬ", meaning: "狗", order: 2 };
    const snapshot = { ...data(), words: [word, nextWord] };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => snapshot), transact: vi.fn(async (change: any) => { change(snapshot); return snapshot; }) };
    const audio = { play: vi.fn(async () => true), stop: vi.fn(), destroy: vi.fn() };
    const answerSound = { play: vi.fn(() => new Promise<boolean>((resolve) => { resolveHint = resolve; })), stop: vi.fn(), setForeground: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio, vi.fn(() => [word, nextWord]), undefined, undefined, undefined, undefined, {
      autoPronunciation: true,
      answerSound,
      audioUrlForWord: (target) => `https://kotobud.com/audio/${target.id}.mp3`,
    });
    vi.useFakeTimers();
    try {
      await harness.initStudy();
      expect(harness.refs.loadError.value).toBe("");
      expect(harness.refs.autoEnabled).toBe(true);
      expect(harness.refs.currentWord.value?.id).toBe("w1");
      expect(harness.refs.audioUrl.value).toBe("https://kotobud.com/audio/w1.mp3");
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      expect(audio.play).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(120);
      expect(audio.play.mock.calls.map((call: any[]) => call[0])).toEqual(["https://kotobud.com/audio/w1.mp3"]);

      harness.flipCard();
      await harness.rate(Rating.Good);
      expect(harness.refs.currentWord.value.id).toBe("w2");
      await vi.advanceTimersByTimeAsync(120);
      expect(audio.play).toHaveBeenCalledOnce();
      const stopsAfterFeedbackStarted = answerSound.stop.mock.calls.length;

      resolveHint(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.play.mock.calls.map((call: any[]) => call[0])).toEqual([
        "https://kotobud.com/audio/w1.mp3",
        "https://kotobud.com/audio/w2.mp3",
      ]);
      expect(answerSound.stop).toHaveBeenCalledTimes(stopsAfterFeedbackStarted);
    } finally {
      lifecycle.hide?.();
      vi.useRealTimers();
    }
  });

  it("cancels a late pre-play request when hidden and resumes the unclaimed word once", async () => {
    let resolveCache!: (url: string | undefined) => void;
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const audio = { play: vi.fn(async () => true), stop: vi.fn(), destroy: vi.fn() };
    const audioCache = {
      getCached: vi.fn().mockImplementationOnce(() => new Promise<string | undefined>((resolve) => { resolveCache = resolve; })).mockResolvedValue(undefined),
      warm: vi.fn(async () => undefined), invalidate: vi.fn(async () => undefined),
    };
    const { harness, lifecycle } = loadStudyPage(repository, audio, undefined, undefined, audioCache, undefined, undefined, { autoPronunciation: true });
    vi.useFakeTimers();
    try {
      await harness.initStudy();
      await vi.advanceTimersByTimeAsync(120);
      expect(audioCache.getCached).toHaveBeenCalledOnce();
      lifecycle.hide?.();
      resolveCache(undefined);
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.play).not.toHaveBeenCalled();
      lifecycle.show?.();
      expect(audio.play).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(120);
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.play).toHaveBeenCalledOnce();
    } finally {
      lifecycle.unload?.();
      vi.useRealTimers();
    }
  });

  it("views handled words without advancing or writing another rating and preserves the current answer", async () => {
    const second = { ...word, id: "w2", term: "犬", reading: "いぬ", meaning: "狗", order: 2 };
    const snapshot = { ...data(), words: [word, second] };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => snapshot), transact: vi.fn(async (change: any) => { change(snapshot); return snapshot; }) };
    const { harness } = loadStudyPage(repository, {}, vi.fn(() => [word, second]));
    await harness.initStudy();
    expect(harness.refs.canPrevious.value).toBe(false);
    harness.flipCard();
    await harness.rate(Rating.Good);
    harness.refs.attempt.value = { selected: "saved-answer", isCorrect: true };
    harness.refs.uncertain.value = true;
    const answer = harness.refs.attempt.value;
    const writes = repository.transact.mock.calls.length;
    const serialized = JSON.stringify(snapshot);
    harness.previousWord();
    expect(harness.refs.reviewWord.value.id).toBe("w1");
    expect(harness.refs.currentWord.value.id).toBe("w2");
    await harness.rate(Rating.Good);
    await harness.ignoreCurrentWord();
    await harness.toggleDifficult();
    harness.submitAnswer("changed");
    harness.returnToCurrent();
    expect(harness.refs.currentWord.value.id).toBe("w2");
    expect(harness.refs.attempt.value).toBe(answer);
    expect(harness.refs.uncertain.value).toBe(true);
    expect(repository.transact).toHaveBeenCalledTimes(writes);
    expect(JSON.stringify(snapshot)).toBe(serialized);
  });

  it("does not add history when saving fails", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async () => { throw new Error("write failed"); }) };
    const { harness } = loadStudyPage(repository, {});
    await harness.initStudy();
    harness.flipCard();
    await harness.rate(Rating.Good);
    expect(harness.refs.historyWords.value).toEqual([]);
    expect(harness.refs.canPrevious.value).toBe(false);
    expect(harness.refs.currentWord.value.id).toBe(word.id);
  });

  it("excludes viewing time and clears history when leaving the page", async () => {
    let clock = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const second = { ...word, id: "w2", order: 2 };
    const snapshot = { ...data(), words: [word, second] };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => snapshot), transact: vi.fn(async (change: any) => { change(snapshot); return snapshot; }) };
    const { harness, lifecycle } = loadStudyPage(repository, {}, vi.fn(() => [word, second]));
    await harness.initStudy();
    harness.flipCard();
    await harness.rate(Rating.Good);
    const started = harness.refs.startedAt.value;
    harness.previousWord();
    clock += 5000;
    harness.returnToCurrent();
    expect(harness.refs.startedAt.value).toBe(started + 5000);
    harness.previousWord();
    lifecycle.hide?.();
    expect(harness.refs.reviewing.value).toBe(false);
    expect(harness.refs.historyWords.value).toEqual([]);
  });

  it("does not expose a late rating result after the account changes", async () => {
    let key = "data_guest";
    let resolveSave!: (value: Data) => void;
    const repository = { getActiveKey: vi.fn(() => key), read: vi.fn(async () => data()), transactAndEnqueue: vi.fn(() => new Promise<Data>(resolve => { resolveSave = resolve; })) };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await harness.initStudy();
    harness.flipCard();
    const pending = harness.rate(Rating.Good);
    key = "data_user_b";
    lifecycle.show?.();
    await settle();
    resolveSave(data());
    await pending;
    expect(harness.refs.historyWords.value).toEqual([]);
    expect(harness.refs.finished.value).toBe(false);
    expect(harness.refs.currentWord.value.id).toBe(word.id);
  });

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

  it("uses stored fallback audio when a legacy word has a slash reading", async () => {
    const slashWord = { ...word, reading: "/" };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async (change: any) => { const d = data(); change(d); return d; }) };
    const fallbackUrl = "https://kotobud.com/audio/legacy-w1.mp3";
    const { harness, lifecycle } = loadStudyPage(repository, {}, vi.fn(() => [slashWord]), fallbackUrl, undefined, "https://kotobud.com/audio/w1.mp3");
    await lifecycle.load?.({ mode: "new" });
    await settle();
    expect(harness.refs.audioUrl.value).toBe(fallbackUrl);
  });

  it.each([
    { mode: "review", exercise: undefined, expected: "mixed" },
    { mode: "review", exercise: "kana-meaning", expected: "kana-meaning" },
    { mode: "new", exercise: undefined, expected: "card" },
    { mode: "difficult", exercise: undefined, expected: "card" },
  ] as const)("chooses $expected as the preferred exercise for $mode with exercise=$exercise", async ({ mode, exercise, expected }) => {
    const pool = [word,
      { ...word, id: "w2", term: "犬", reading: "いぬ", meaning: "狗" },
      { ...word, id: "w3", term: "鳥", reading: "とり", meaning: "鸟" },
      { ...word, id: "w4", term: "花", reading: "はな", meaning: "花" },
    ];
    const prepared = { ...data(), words: pool };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => prepared), transact: vi.fn(async (change: any) => { const updated = { ...prepared, states: [...prepared.states], logs: [...prepared.logs] }; change(updated); return updated; }) };
    const createQuestion = vi.fn(() => ({ type: "kana-meaning", options: ["猫"], correct: "猫", prompt: "意味", word }) as any);
    const { harness, lifecycle } = loadStudyPage(repository, {}, vi.fn(() => [word]), undefined, undefined, undefined, createQuestion);
    await lifecycle.load?.({ mode, exercise });
    await settle();
    expect(harness.refs.preferredExercise.value).toBe(expected);
    expect(harness.refs.exercise.value).toBe(expected);
  });

  it("retries the review session's mixed preference after one word falls back to a card", async () => {
    const secondWord = { ...word, id: "w2", term: "犬", reading: "いぬ", meaning: "狗", order: 2 };
    const prepared = { ...data(), words: [word, secondWord] };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => prepared), transact: vi.fn(async (change: any) => { const updated = { ...prepared, states: [...prepared.states], logs: [...prepared.logs] }; change(updated); return updated; }) };
    const createQuestion = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ type: "kana-meaning", options: ["狗"], correct: "狗", prompt: "意味", word: secondWord });
    const { harness, lifecycle } = loadStudyPage(repository, {}, vi.fn(() => [word, secondWord]), undefined, undefined, undefined, createQuestion);
    await lifecycle.load?.({ mode: "review" });
    await settle();
    expect(harness.refs.preferredExercise.value).toBe("mixed");
    expect(harness.refs.exercise.value).toBe("card");

    harness.flipCard();
    await harness.rate(Rating.Good);
    expect(harness.refs.currentWord.value?.id).toBe("w2");
    expect(harness.refs.preferredExercise.value).toBe("mixed");
    expect(harness.refs.exercise.value).toBe("mixed");
    expect(harness.refs.question.value?.type).toBe("kana-meaning");
  });

  it("hides slash-only legacy reading, part-of-speech, and meaning text", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/study/study.vue"), "utf8");
    const template = parse(source, { filename: "study.vue" }).descriptor.template?.content || "";
    expect(template).toContain("hasStudyContent(currentWord.reading)");
    expect(template).toContain("hasStudyContent(currentWord.partOfSpeech)");
    expect(template).toContain("hasStudyContent(currentWord.reading) ? `Google WaveNet");
    expect(template.match(/hasStudyContent\(currentWord\.meaning\)/g)).toHaveLength(2);
  });

  it("keeps listening quiz controls single and leaves corner actions outside card flip handlers", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/study/study.vue"), "utf8");
    const descriptor = parse(source, { filename: "study.vue" }).descriptor;
    const template = descriptor.template?.content || "";
    const styles = descriptor.styles.map((style) => style.content).join("\n");
    expect(template).toContain(`v-if="showGenericAudioControls" class="audio-controls"`);
    expect(template).toContain(`v-if="audioUrl && showGenericAudioControls" class="audio-source"`);
    expect(template.indexOf("card-corner-actions")).toBeLessThan(template.indexOf("class=\"card-surface\""));
    expect(template).toContain(`@tap.stop="toggleDifficult"`);
    expect(template).toContain(`@tap.stop="ignoreCurrentWord"`);
    expect(styles).toContain("position: fixed;");
    expect(source).toContain(`query.select(".word-card")`);
    expect(source).toContain("clampStudyMascotPosition(mascotPosition.value, mascotStyleBounds.value)");
    expect(source).toContain("left: `${mascotDisplayPosition.value.x * mascotStyleBounds.value.width}px`");
    expect(source).toContain("top: `${mascotDisplayPosition.value.y * mascotStyleBounds.value.height}px`");
    expect(template).toContain("currentWord && mascotVisible && mascotPositionReady");
  });

  it("shows only the quiz audio pair when mixed mode draws a listening question", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async (change: any) => { const d = data(); change(d); return d; }) };
    const createQuestion = vi.fn(() => ({ type: "audio-meaning", options: ["猫"], correct: "猫", prompt: "听音辨意", word }) as any);
    const { harness, lifecycle } = loadStudyPage(repository, {}, vi.fn(() => [word]), undefined, undefined, undefined, createQuestion);
    await lifecycle.load?.({ mode: "review" });
    await settle();
    lifecycle.show?.();
    await settle();
    expect(harness.refs.exercise.value).toBe("mixed");
    expect(harness.refs.question.value?.type).toBe("audio-meaning");
    expect(harness.refs.showGenericAudioControls.value).toBe(false);
    expect(harness.refs.mascotPositionReady.value).toBe(true);
    expect(harness.refs.mascotPositionStyle.value.top).toBe("380px");
    harness.refs.heard.value = true;
    harness.submitAnswer("猫");
    await settle();
    expect(harness.refs.mascotStyleBounds.value.height).toBe(760);
    expect(harness.refs.mascotStyleBounds.value.visibleHeight).toBe(610);
    expect(harness.refs.mascotPositionStyle.value.top).toBe("380px");
  });

  it("remeasures the mascot after page ready when the first viewport height is zero", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async (change: any) => { const d = data(); change(d); return d; }) };
    const { harness, lifecycle, setWindowInfo } = loadStudyPage(repository, {});
    setWindowInfo({ windowWidth: 390, windowHeight: 0, screenHeight: 0, safeArea: { bottom: 0 } });
    lifecycle.load?.();
    await settle();
    lifecycle.show?.();
    await settle();
    expect(harness.refs.currentWord.value?.id).toBe(word.id);
    expect(harness.refs.mascotPositionReady.value).toBe(false);

    setWindowInfo({ windowWidth: 390, windowHeight: 780, screenHeight: 800, safeArea: { bottom: 780 } });
    lifecycle.ready?.();
    await settle();
    expect(harness.refs.mascotPositionReady.value).toBe(true);
  });

  it("keeps quiz saving reachable in a safe-area dock and reserves mascot space above it", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/study/study.vue"), "utf8");
    const descriptor = parse(source, { filename: "study.vue" }).descriptor;
    const template = descriptor.template?.content || "";
    const styles = descriptor.styles.map((style) => style.content).join("\n");
    expect(template).toContain(`v-if="!reviewing && currentWord && exercise !== 'card' && attempt" class="quiz-action-dock"`);
    expect(template).toContain(`@tap.stop="rate(Rating.Good)"`);
    expect(template).toContain(`v-if="!reviewing && currentWord && exercise === 'card'" class="rating-section"`);
    expect(styles).toContain(".study-page.has-quiz-dock { padding-bottom: calc(320rpx + env(safe-area-inset-bottom)); }");
    expect(styles).toContain(".quiz-action-dock { position: fixed; z-index: 40;");
    expect(styles).toContain("bottom: calc(12rpx + env(safe-area-inset-bottom))");
    expect(source).toContain("uni.upx2px(300)");
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
    harness.refs.mascotVisible.value = true;
    const current = harness.refs.currentWord.value;
    harness.flipCard();
    await harness.rate(Rating.Good);
    expect(harness.refs.currentWord.value).toBe(current);
    expect(harness.refs.message.value).toContain("保存失败");
    expect(harness.refs.mascotPose.value).toBe("studying");
    await harness.rate(Rating.Good);
    expect(repository.transact).toHaveBeenCalledTimes(2);
  });

  it("shows a short rating reaction after a successful save, then restores the study pose", async () => {
    const nextWord = { ...word, id: "w2", term: "犬", reading: "いぬ", meaning: "狗", order: 2 };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async (change: any) => { const d = data(); change(d); return d; }) };
    const { harness, lifecycle } = loadStudyPage(repository, {}, vi.fn(() => [word, nextWord]));
    await lifecycle.load?.();
    await settle();
    harness.refs.mascotVisible.value = true;
    vi.useFakeTimers();
    try {
      harness.flipCard();
      await harness.rate(Rating.Again);
      expect(harness.refs.currentWord.value?.id).toBe("w2");
      expect(harness.refs.mascotPose.value).toBe("wrong");
      await vi.advanceTimersByTimeAsync(899);
      expect(harness.refs.mascotPose.value).toBe("wrong");
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.refs.mascotPose.value).toBe("studying");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the completion pose instead of scheduling a rating reaction", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async (change: any) => { const d = data(); change(d); return d; }) };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    await settle();
    harness.refs.mascotVisible.value = true;
    vi.useFakeTimers();
    try {
      harness.flipCard();
      await harness.rate(Rating.Good);
      expect(harness.refs.finished.value).toBe(true);
      expect(harness.refs.mascotPose.value).toBe("complete");
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(harness.refs.mascotPose.value).toBe("complete");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["hide", "unload"] as const)("cleans up the mascot timer on page %s", async (lifecycleAction) => {
    const nextWord = { ...word, id: "w2", term: "犬", reading: "いぬ", meaning: "狗", order: 2 };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn(async (change: any) => { const d = data(); change(d); return d; }) };
    const { harness, lifecycle } = loadStudyPage(repository, {}, vi.fn(() => [word, nextWord]));
    await lifecycle.load?.();
    await settle();
    harness.refs.mascotVisible.value = true;
    vi.useFakeTimers();
    try {
      harness.flipCard();
      await harness.rate(Rating.Good);
      expect(vi.getTimerCount()).toBe(1);
      if (lifecycleAction === "hide") lifecycle.hide?.();
      else lifecycle.unload?.();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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

  it("tries Cloudflare's same audio path after COS playback fails", async () => {
    const audio = { play: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), stop: vi.fn(), destroy: vi.fn() };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const primary = "https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com/audio/google/v1/a/example.mp3";
    const { harness, lifecycle } = loadStudyPage(repository, audio, undefined, undefined, undefined, primary);
    await lifecycle.load?.();
    await settle();
    await harness.playAudio();
    expect(audio.play.mock.calls.map((call: any[]) => call[0])).toEqual([
      primary,
      "https://kotobud.com/audio/google/v1/a/example.mp3",
    ]);
  });

  it("invalidates a corrupt cached Cloudflare fallback and retries its remote URL", async () => {
    const primary = "https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com/audio/google/v1/a/example.mp3";
    const cloudflare = "https://kotobud.com/audio/google/v1/a/example.mp3";
    const cache = {
      getCached: vi.fn(async (url: string) => url === cloudflare ? "/saved/bad-cloudflare.mp3" : undefined),
      invalidate: vi.fn(async () => undefined), warm: vi.fn(async () => undefined),
    };
    const audio = { play: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true), stop: vi.fn(), destroy: vi.fn() };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, audio, undefined, undefined, cache, primary);
    await lifecycle.load?.();
    await settle();
    await harness.playAudio();
    expect(audio.play.mock.calls.map((call: any[]) => call[0])).toEqual([primary, "/saved/bad-cloudflare.mp3", cloudflare]);
    expect(cache.invalidate).toHaveBeenCalledWith(cloudflare);
    expect(cache.warm).toHaveBeenCalledWith(cloudflare);
  });

  it("saves a voice change and skips an ignored word without rating it", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    await settle();
    await harness.selectVoice("male");
    expect(harness.refs.voice.value).toBe("male");
    await harness.ignoreCurrentWord();
    expect(harness.refs.currentWord.value).toBeNull();
    expect(harness.refs.message.value).toContain("已忽略");
    expect(repository.transact).not.toHaveBeenCalled();
  });

  it("prefetches the current card and cancels page work when hidden", async () => {
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => data()), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    await lifecycle.load?.();
    await settle();
    expect(harness.preloader.schedule).toHaveBeenCalledWith(["https://kotobud.com/audio/w1.mp3"]);
    lifecycle.hide?.();
    expect(harness.preloader.cancel).toHaveBeenCalled();
  });

  it("starts the exact selected original sentence and keeps the active textbook unchanged", async () => {
    const snapshot = originalSentenceData("猫がいます。");
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => snapshot), transact: vi.fn() };
    const { harness, lifecycle, textbooks, checkpointService } = loadStudyPage(repository, {});
    lifecycle.load?.({ mode: "difficult", exercise: "cloze", readingContextIds: JSON.stringify({ w1: "context-a" }) });
    await settle();
    await settle();

    expect(harness.refs.words.value.map((item: Word) => item.id)).toEqual(["w1"]);
    expect(harness.refs.exercise.value).toBe("cloze");
    expect(harness.refs.clozeQuestion.value.ja).toBe("猫がいます。");
    expect(harness.refs.displayExample.value.ja).toBe("猫がいます。");
    expect(textbooks.ensureBookLoaded).toHaveBeenCalledWith("book-a", "data_guest");
    expect(snapshot.currentBookId).toBe("book-current");
    await settle();
    expect(checkpointService.save).toHaveBeenCalledWith(expect.objectContaining({
      readingContextIds: { w1: "context-a" },
      wordIds: ["w1"],
    }));
  });

  it("falls back to the selected sentence on a card when a cloze match is ambiguous", async () => {
    const sentence = "猫が猫を見ています。";
    const snapshot = originalSentenceData(sentence, "context-a", {
      example: "猫が好きです。",
      exampleReading: "ねこがすきです。",
      exampleTranslation: "喜欢猫。",
    });
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => snapshot), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, {});
    lifecycle.load?.({ mode: "difficult", exercise: "cloze", readingContextIds: JSON.stringify({ w1: "context-a" }) });
    await settle();
    await settle();

    expect(harness.refs.exercise.value).toBe("card");
    expect(harness.refs.clozeQuestion.value).toBeNull();
    expect(harness.refs.displayExample.value.ja).toBe(sentence);
    expect(harness.refs.exerciseFallback.value).toContain("暂不适合填空");
  });

  it("restores the selected original sentence from a study checkpoint", async () => {
    const snapshot = originalSentenceData("猫がいます。");
    const savedCheckpoint: MiniStudyCheckpoint = {
      version: 1,
      owner: "data_guest",
      bookIds: ["book-a"],
      wordIds: ["w1"],
      mode: "difficult",
      exercise: "cloze",
      readingContextIds: { w1: "context-a" },
      updatedAt: "2026-10-20T10:00:00.000Z",
    };
    const checkpointService = {
      load: vi.fn(async () => savedCheckpoint),
      save: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    };
    const repository = { getActiveKey: vi.fn(() => "data_guest"), read: vi.fn(async () => snapshot), transact: vi.fn() };
    const { harness, lifecycle } = loadStudyPage(repository, {}, undefined, undefined, undefined, undefined, undefined, { checkpointService });
    lifecycle.load?.({ resume: "1" });
    await settle();
    await settle();

    expect(checkpointService.load).toHaveBeenCalledWith("data_guest");
    expect(harness.refs.exercise.value).toBe("cloze");
    expect(harness.refs.clozeQuestion.value.ja).toBe("猫がいます。");
    expect(harness.refs.displayExample.value.ja).toBe("猫がいます。");
  });
});
