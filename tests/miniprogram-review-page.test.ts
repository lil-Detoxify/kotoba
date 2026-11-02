import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDifficultWords, getDueWords, initialState } from "@jp/core";
import type { Data, Word } from "@jp/models";
import { computed as vueComputed, ref as vueRef } from "vue";

type Harness = {
  refreshReview: () => Promise<void>;
  startReview: () => void;
  startDifficult: () => void;
  refs: Record<string, { value: any }>;
};

const dueWord: Word = { id: "due-1", lessonId: "lesson-a", term: "復習", reading: "ふくしゅう", meaning: "复习", order: 1 };
const difficultWord: Word = { id: "difficult-1", lessonId: "lesson-b", term: "難しい長い単語", reading: "むずかしいながいたんご", meaning: "一个很长的困难词释义", order: 2 };

function sourceData(word: Word, state: Partial<Data["states"][number]>): Data {
  return {
    books: [],
    lessons: [],
    words: [word],
    states: [{
      userId: "local", wordId: word.id, status: "review", isIgnored: false, isDifficult: false,
      reviewCount: 1, lapseCount: 0, card: initialState(word.id).card, ...state,
    }],
    logs: [],
    seeded: true,
  };
}

function loadReviewPage(textbooks: any): { harness: Harness; lifecycle: { show?: () => void }; navigateTo: any } {
  const path = resolve(process.cwd(), "apps/miniprogram/src/pages/review/review.vue");
  const source = readFileSync(path, "utf8");
  const descriptor = parse(source, { filename: "review.vue" }).descriptor;
  const script = compileScript(descriptor, { id: "review-page-test" });
  const setupMatch = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!setupMatch) throw new Error("Unable to extract review page setup body");
  let code = ts.transpileModule(setupMatch[1], {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^import .*?;\r?\n/gm, "");
  code = code.replace(/__expose\(\);\s*/, "");
  code += "\nreturn { refreshReview, startReview, startDifficult, refs: { dueWords, difficultWords, loading, dueError, difficultError } };";

  const lifecycle: { show?: () => void } = {};
  const navigateTo = vi.fn();
  const runner = new Function("ref", "computed", "onShow", "getDifficultWords", "getDueWords", "defaultTextbooks", "uni", "useMiniPageActivity", code);
  const harness = runner(
    vueRef,
    vueComputed,
    (callback: () => void) => { lifecycle.show = callback; },
    getDifficultWords,
    getDueWords,
    textbooks,
    { navigateTo },
    () => vueRef(true),
  ) as Harness;
  return { harness, lifecycle, navigateTo };
}

describe("review page script", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("prepares both modes and reports exact due and difficult queues", async () => {
    const reviewData = sourceData(dueWord, { nextReviewAt: "2026-01-01T00:00:00.000Z" });
    const difficultData = sourceData(difficultWord, { isDifficult: true });
    expect(difficultData.states[0].isDifficult).toBe(true);
    expect(getDifficultWords(difficultData).map((word) => word.id)).toEqual(["difficult-1"]);
    const textbooks = { prepareStudy: vi.fn()
      .mockResolvedValueOnce(reviewData)
      .mockResolvedValueOnce(difficultData) };
    const { harness, lifecycle } = loadReviewPage(textbooks);

    await lifecycle.show?.();
    await vi.waitFor(() => expect(textbooks.prepareStudy).toHaveBeenCalledTimes(2));

    expect(textbooks.prepareStudy).toHaveBeenNthCalledWith(1, undefined, "review");
    expect(textbooks.prepareStudy).toHaveBeenNthCalledWith(2, undefined, "difficult");
    expect(harness.refs.dueWords.value.map((word: Word) => word.id)).toEqual(["due-1"]);
    expect(harness.refs.difficultWords.value.map((word: Word) => word.id)).toEqual(["difficult-1"]);
    expect(harness.refs.loading.value).toBe(false);
  });

  it("routes each queue to its matching study mode", () => {
    const textbooks = { prepareStudy: vi.fn() };
    const { harness, navigateTo } = loadReviewPage(textbooks);

    harness.startReview();
    harness.startDifficult();

    expect(navigateTo).toHaveBeenNthCalledWith(1, { url: "/pages/study/study?mode=review" });
    expect(navigateTo).toHaveBeenNthCalledWith(2, { url: "/pages/study/study?mode=difficult" });
  });

  it("keeps a successful due queue visible when difficult preparation fails", async () => {
    const reviewData = sourceData(dueWord, { nextReviewAt: "2026-01-01T00:00:00.000Z" });
    const textbooks = { prepareStudy: vi.fn()
      .mockResolvedValueOnce(reviewData)
      .mockRejectedValueOnce(new Error("offline")) };
    const { harness, lifecycle } = loadReviewPage(textbooks);

    await lifecycle.show?.();
    await vi.waitFor(() => expect(textbooks.prepareStudy).toHaveBeenCalledTimes(2));

    expect(harness.refs.dueWords.value.map((word: Word) => word.id)).toEqual(["due-1"]);
    expect(harness.refs.dueError.value).toBe("");
    expect(harness.refs.difficultWords.value).toEqual([]);
    expect(harness.refs.difficultError.value).toContain("困难词队列");
  });

  it("exposes retryable errors and no false zero count when both preparations fail", async () => {
    const textbooks = { prepareStudy: vi.fn().mockRejectedValue(new Error("offline")) };
    const { harness, lifecycle } = loadReviewPage(textbooks);

    await lifecycle.show?.();

    await vi.waitFor(() => expect(textbooks.prepareStudy).toHaveBeenCalledTimes(2));
    expect(harness.refs.loading.value).toBe(false);
    expect(harness.refs.dueError.value).toContain("到期复习队列");
    expect(harness.refs.difficultError.value).toContain("困难词队列");
    expect(harness.refs.dueWords.value).toEqual([]);
    expect(harness.refs.difficultWords.value).toEqual([]);
  });

  it("keeps the page free of browser routing and gives actions safe-area and touch sizing", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/review/review.vue"), "utf8");
    expect(source).not.toMatch(/vue-router|window\.|document\./);
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain("min-height: 96rpx");
    expect(source).toContain("gap: 16rpx");
  });
});
