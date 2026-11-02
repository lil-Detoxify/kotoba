import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, compileScript } from "@vue/compiler-sfc";
import { computed, ref } from "vue";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { initialState } from "@jp/core";
import { emptyData, type Data, type QuizType, type ReviewLog, type Word } from "@jp/models";
import type { StorageAdapter } from "../apps/miniprogram/src/adapters/types";
import catalog from "../apps/miniprogram/src/services/textbooks-catalog.json";
import { learningAnalytics, libraryProgress } from "../apps/miniprogram/src/services/learning-analytics";
import { historicalPracticeWords, parseHistoricalPractice } from "../apps/miniprogram/src/services/historical-practice";
import {
  createMiniStudyCheckpoint,
  resolveMiniStudyCheckpoint,
  type MiniStudyCheckpoint,
} from "../apps/miniprogram/src/services/study-checkpoint";
import { miniPracticeFeedback, miniWeakPracticeSuggestions } from "../apps/miniprogram/src/services/study-feedback";

const bookA = "book-a";
const bookB = "book-b";

function word(id: string, order: number, lessonId = "lesson-a"): Word {
  return { id, lessonId, term: id, reading: "ことば", meaning: "测试", order };
}

function fixture(): Data {
  const data = emptyData();
  const stamp = new Date().toISOString();
  data.books = [
    { id: bookA, title: "甲书", description: "", language: "ja", createdAt: stamp, updatedAt: stamp },
    { id: bookB, title: "乙书", description: "", language: "ja", createdAt: stamp, updatedAt: stamp },
  ];
  data.lessons = [
    { id: "lesson-a", bookId: bookA, title: "第一课", order: 1 },
    { id: "lesson-b", bookId: bookB, title: "第二课", order: 1 },
  ];
  data.currentBookId = bookA;
  data.seeded = true;
  return data;
}

function addWord(data: Data, id: string, order: number, bookId = bookA): Word {
  const lessonId = bookId === bookA ? "lesson-a" : "lesson-b";
  const item = word(id, order, lessonId);
  data.words.push(item);
  return item;
}

function addQuizLog(data: Data, input: {
  id: string;
  wordId: string;
  type: QuizType;
  isCorrect: boolean;
  reviewedAt: string;
}): ReviewLog {
  const item = data.words.find(candidate => candidate.id === input.wordId);
  if (!item) throw new Error(`Missing test word: ${input.wordId}`);
  const userId = "account-1";
  const state = { ...initialState(input.wordId, new Date(input.reviewedAt), userId), lessonId: item.lessonId };
  const log: ReviewLog = {
    id: input.id,
    userId,
    wordId: input.wordId,
    reviewedAt: input.reviewedAt,
    rating: 2,
    responseTime: 0,
    previousState: state,
    newState: state,
    studyMode: "new",
    quiz: {
      type: input.type,
      prompt: "题目",
      options: ["正确", "错误"],
      selected: input.isCorrect ? "正确" : "错误",
      correct: "正确",
      isCorrect: input.isCorrect,
    },
  };
  data.logs.push(log);
  return log;
}

function ago(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: Pick<StorageAdapter, "getItem" | "setItem" | "removeItem"> = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
  return { storage, values };
}

function statisticsPage(repository: any, options: { ensureBookLoaded?: ReturnType<typeof vi.fn>; navigateTo?: ReturnType<typeof vi.fn> } = {}) {
  const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/statistics/statistics.vue"), "utf8");
  const script = compileScript(parse(source).descriptor, { id: "historical-practice-statistics-test" });
  const setup = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\r?\n([\s\S]*?)\r?\n\r?\nconst __returned__/);
  if (!setup) throw new Error("Statistics setup was not extracted");
  const code = ts.transpileModule(setup[1], { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText.replace(/__expose\(\);\s*/, "");
  const ensureBookLoaded = options.ensureBookLoaded ?? vi.fn();
  const navigateTo = options.navigateTo ?? vi.fn();
  const run = new Function(
    "ref", "computed", "onHide", "onShow", "onUnload", "defaultRepository", "defaultTextbooks", "isBookLoaded",
    "textbookCatalog", "learningAnalytics", "libraryProgress", "miniPracticeFeedback", "miniWeakPracticeSuggestions",
    "useMiniPageActivity", "uni",
    `${code}\nreturn {refresh,chooseFeedbackBook,prepareFeedback,data,range,feedbackBookId,feedbackError,feedbackLoading,currentBookId};`,
  );
  const noOp = () => {};
  const harness = run(
    ref, computed, noOp, noOp, noOp, repository, { ensureBookLoaded }, () => true, catalog.books,
    learningAnalytics, libraryProgress, miniPracticeFeedback, miniWeakPracticeSuggestions, noOp, { navigateTo },
  ) as {
    refresh: () => Promise<void>;
    chooseFeedbackBook: (event: { detail: { value: string | number } }) => void;
    prepareFeedback: (type?: QuizType) => Promise<void>;
    data: { value: Data | null };
    range: { value: 7 | 30 };
    feedbackBookId: { value: string };
    feedbackError: { value: string };
    feedbackLoading: { value: boolean };
    currentBookId: { value: string };
  };
  return { harness, ensureBookLoaded, navigateTo };
}

describe("Mini Program historical practice", () => {
  it("validates a saved book, question type, and report range", () => {
    expect(parseHistoricalPractice({ bookId: bookA, type: "dictation", range: 30 })).toEqual({
      bookId: bookA,
      type: "dictation",
      range: 30,
    });
    expect(parseHistoricalPractice({ bookId: bookA, type: "card", range: 7 })).toBeNull();
    expect(parseHistoricalPractice({ bookId: bookA, type: "kana-input", range: 14 })).toBeNull();
    expect(parseHistoricalPractice(null)).toBeNull();
  });

  it("uses the latest matching input-quiz answer and excludes correct or ignored words", () => {
    const now = new Date();
    const data = fixture();
    const a = addWord(data, "word-a", 1);
    const b = addWord(data, "word-b", 2);
    addWord(data, "word-c", 3);
    addWord(data, "word-ignored", 4);
    data.states.push({ ...initialState("word-ignored", now, "account-1"), isIgnored: true });
    addQuizLog(data, { id: "b-wrong", wordId: "word-b", type: "kana-input", isCorrect: false, reviewedAt: ago(now, 5) });
    addQuizLog(data, { id: "a-wrong", wordId: "word-a", type: "kana-input", isCorrect: false, reviewedAt: ago(now, 4) });
    addQuizLog(data, { id: "c-wrong", wordId: "word-c", type: "kana-input", isCorrect: false, reviewedAt: ago(now, 3) });
    addQuizLog(data, { id: "c-right", wordId: "word-c", type: "kana-input", isCorrect: true, reviewedAt: ago(now, 2) });
    addQuizLog(data, { id: "ignored-wrong", wordId: "word-ignored", type: "kana-input", isCorrect: false, reviewedAt: ago(now, 1) });

    const queue = historicalPracticeWords(data, { bookId: bookA, type: "kana-input", range: 7 }, now);

    expect(queue.map(item => item.id)).toEqual(["word-a", "word-b"]);
    expect(queue[0]).toBe(a);
    expect(queue[1]).toBe(b);
  });

  it("saves feedback context and resumes only saved words that are still wrong and not ignored", async () => {
    const now = new Date();
    const data = fixture();
    const a = addWord(data, "word-a", 1);
    const b = addWord(data, "word-b", 2);
    const d = addWord(data, "word-d", 4);
    addQuizLog(data, { id: "a-wrong", wordId: a.id, type: "dictation", isCorrect: false, reviewedAt: ago(now, 8) });
    addQuizLog(data, { id: "b-wrong", wordId: b.id, type: "dictation", isCorrect: false, reviewedAt: ago(now, 7) });
    addQuizLog(data, { id: "d-wrong", wordId: d.id, type: "dictation", isCorrect: false, reviewedAt: ago(now, 6) });
    const feedback = { bookId: bookA, type: "dictation" as const, range: 7 as const };
    const originalIds = historicalPracticeWords(data, feedback, now).map(item => item.id);
    expect(originalIds).toEqual(["word-d", "word-b", "word-a"]);

    const { storage } = memoryStorage();
    const checkpoints = createMiniStudyCheckpoint(storage);
    const saved: MiniStudyCheckpoint = {
      version: 1,
      owner: "user-a",
      bookIds: [bookA],
      wordIds: originalIds,
      mode: "difficult",
      exercise: "dictation",
      feedback,
      updatedAt: now.toISOString(),
    };
    await checkpoints.save(saved);
    const restored = await checkpoints.load("user-a");
    expect(restored?.feedback).toEqual(feedback);

    data.states.push({ ...initialState(b.id, now, "account-1"), isIgnored: true });
    addWord(data, "word-c", 3);
    addQuizLog(data, { id: "a-latest-right", wordId: a.id, type: "dictation", isCorrect: true, reviewedAt: ago(now, 2) });
    addQuizLog(data, { id: "c-new-wrong", wordId: "word-c", type: "dictation", isCorrect: false, reviewedAt: ago(now, 1) });

    const resumed = resolveMiniStudyCheckpoint(data, restored!);
    expect(resumed.map(item => item.id)).toEqual(["word-d"]);
    expect(resumed[0]).toBe(d);
  });

  it("re-reads feedback and skips navigation when the last wrong answer is now correct", async () => {
    const now = new Date();
    const initial = fixture();
    addWord(initial, "word-a", 1);
    addQuizLog(initial, { id: "a-wrong", wordId: "word-a", type: "kana-meaning", isCorrect: false, reviewedAt: ago(now, 2) });
    const updated = structuredClone(initial);
    addQuizLog(updated, { id: "a-right", wordId: "word-a", type: "kana-meaning", isCorrect: true, reviewedAt: ago(now, 1) });
    let reads = 0;
    const repository = {
      getActiveKey: () => "data_guest",
      read: vi.fn(async () => (++reads === 1 ? initial : updated)),
      transact: vi.fn(),
    };
    const { harness, ensureBookLoaded, navigateTo } = statisticsPage(repository);
    await harness.refresh();
    await harness.prepareFeedback("kana-meaning");

    expect(repository.read).toHaveBeenCalledTimes(2);
    expect(harness.data.value?.logs).toHaveLength(2);
    expect(harness.feedbackError.value).toBe("记录已有更新，当前没有需要重练的错词。");
    expect(harness.currentBookId.value).toBe(bookA);
    expect(ensureBookLoaded).not.toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
    expect(repository.transact).not.toHaveBeenCalled();
  });

  it("navigates with the chosen book, original input type, and selected range without changing the current book", async () => {
    const now = new Date();
    const snapshot = fixture();
    addWord(snapshot, "word-b", 1, bookB);
    addQuizLog(snapshot, { id: "b-dictation-wrong", wordId: "word-b", type: "dictation", isCorrect: false, reviewedAt: ago(now, 1) });
    const repository = { getActiveKey: () => "data_guest", read: vi.fn(async () => snapshot), transact: vi.fn() };
    const { harness, ensureBookLoaded, navigateTo } = statisticsPage(repository);
    await harness.refresh();
    harness.chooseFeedbackBook({ detail: { value: 1 } });
    harness.range.value = 30;
    await harness.prepareFeedback("dictation");

    expect(harness.feedbackBookId.value).toBe(bookB);
    expect(harness.currentBookId.value).toBe(bookA);
    expect(navigateTo).toHaveBeenCalledWith({
      url: `/pages/study/study?mode=difficult&feedbackBookId=${bookB}&feedbackType=dictation&feedbackRange=30`,
    });
    expect(ensureBookLoaded).not.toHaveBeenCalled();
    expect(repository.transact).not.toHaveBeenCalled();
  });
});
