import { describe, expect, it } from "vitest";
import { initialState } from "@jp/core";
import { emptyData, type Data, type QuizType, type ReviewLog } from "@jp/models";
import { miniPracticeFeedback } from "../apps/miniprogram/src/services/study-feedback";

const now = new Date(2026, 9, 18, 12, 0, 0);
const bookA = "jlpt-n5";
const bookB = "jlpt-n4";
const stamp = (daysAgo = 0, hour = 10, minute = 0) => new Date(
  now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, 0,
).toISOString();

function fixture(): Data {
  const data = emptyData();
  data.books = [
    { id: bookA, title: "甲书", description: "", language: "ja", createdAt: stamp(), updatedAt: stamp() },
    { id: bookB, title: "乙书", description: "", language: "ja", createdAt: stamp(), updatedAt: stamp() },
  ];
  data.lessons = [
    { id: "lesson-a", bookId: bookA, title: "第一课", order: 1 },
    { id: "lesson-b", bookId: bookB, title: "第二课", order: 1 },
  ];
  data.words = [
    { id: "word-a", lessonId: "lesson-a", term: "言葉", reading: "ことば", meaning: "词语", order: 1 },
    { id: "word-b", lessonId: "lesson-a", term: "毎日", reading: "まいにち", meaning: "每天", order: 2 },
    { id: "word-c", lessonId: "lesson-b", term: "記憶", reading: "きおく", meaning: "记忆", order: 1 },
  ];
  return data;
}

interface LogInput {
  id: string;
  wordId: string;
  daysAgo?: number;
  hour?: number;
  minute?: number;
  type?: QuizType;
  isCorrect?: boolean;
  rating?: 1 | 2 | 3 | 4;
  userId?: string;
}

function addLog(data: Data, input: LogInput): ReviewLog {
  const word = data.words.find((item) => item.id === input.wordId);
  const lessonId = word?.lessonId;
  const bookId = data.lessons.find((lesson) => lesson.id === lessonId)?.bookId;
  const userId = input.userId ?? "account-1";
  const reviewedAt = stamp(input.daysAgo, input.hour, input.minute);
  const state = { ...initialState(input.wordId, new Date(reviewedAt), userId), lessonId, bookId };
  const log: ReviewLog = {
    id: input.id,
    userId,
    wordId: input.wordId,
    reviewedAt,
    rating: input.rating ?? 2,
    responseTime: 0,
    previousState: state,
    newState: state,
    studyMode: "new",
  };
  if (input.type) {
    const isCorrect = input.isCorrect ?? false;
    log.quiz = {
      type: input.type,
      prompt: "题目",
      options: ["正确", "错误"],
      selected: isCorrect ? "正确" : "错误",
      correct: "正确",
      isCorrect,
    };
  }
  data.logs.push(log);
  return log;
}

describe("Mini Program practice feedback adapter", () => {
  it("applies inclusive local-date boundaries for both report ranges", () => {
    const data = fixture();
    addLog(data, { id: "seven-in", wordId: "word-a", type: "kana-meaning", isCorrect: false, daysAgo: 6, hour: 0 });
    addLog(data, { id: "seven-out", wordId: "word-a", type: "kana-meaning", isCorrect: false, daysAgo: 7, hour: 23, minute: 59 });
    addLog(data, { id: "thirty-in", wordId: "word-b", type: "kana-meaning", isCorrect: true, daysAgo: 29, hour: 0 });
    addLog(data, { id: "thirty-out", wordId: "word-b", type: "kana-meaning", isCorrect: false, daysAgo: 30, hour: 23, minute: 59 });

    const sevenDay = miniPracticeFeedback(data, now, 7, bookA).quiz[0];
    const thirtyDay = miniPracticeFeedback(data, now, 30, bookA).quiz[0];

    expect(sevenDay).toMatchObject({ total: 1, incorrect: 1, correct: 0 });
    expect(thirtyDay).toMatchObject({ total: 3, incorrect: 2, correct: 1 });
  });

  it("keeps objective quiz results separate from self-rated review feedback", () => {
    const data = fixture();
    addLog(data, { id: "objective-correct", wordId: "word-a", type: "kana-meaning", isCorrect: true, rating: 2 });
    addLog(data, { id: "objective-wrong", wordId: "word-b", type: "kanji-reading", isCorrect: false, rating: 4 });
    addLog(data, { id: "self-forgotten", wordId: "word-a", rating: 1 });

    const report = miniPracticeFeedback(data, now, 7, bookA);

    expect(report.quiz.find((row) => row.id === "kana-meaning")).toMatchObject({ total: 1, correct: 1, incorrect: 0, accuracy: 100 });
    expect(report.quiz.find((row) => row.id === "kanji-reading")).toMatchObject({ total: 1, correct: 0, incorrect: 1, accuracy: 0 });
    expect(report.self).toEqual({ total: 1, forgotten: 1, uncertain: 0, remembered: 0 });
  });

  it("scopes reports to the selected book and counts a duplicate log ID once", () => {
    const data = fixture();
    addLog(data, { id: "duplicate", wordId: "word-a", type: "kana-meaning", isCorrect: false });
    addLog(data, { id: "duplicate", wordId: "word-b", type: "kana-meaning", isCorrect: false });
    addLog(data, { id: "other-book", wordId: "word-c", type: "kana-meaning", isCorrect: false });

    const row = miniPracticeFeedback(data, now, 7, bookA).quiz[0];

    expect(row).toMatchObject({ total: 1, incorrect: 1, practiceWordIds: ["word-a"] });
  });

  it("keeps latest-answer practice decisions independent by question type", () => {
    const data = fixture();
    addLog(data, { id: "kana-wrong", wordId: "word-a", type: "kana-meaning", isCorrect: false, daysAgo: 2 });
    addLog(data, { id: "kana-right", wordId: "word-a", type: "kana-meaning", isCorrect: true, daysAgo: 1 });
    addLog(data, { id: "kanji-wrong", wordId: "word-a", type: "kanji-reading", isCorrect: false, daysAgo: 1 });
    addLog(data, { id: "other-word-wrong", wordId: "word-b", type: "kana-meaning", isCorrect: false });

    const report = miniPracticeFeedback(data, now, 7, bookA);

    expect(report.quiz.find((row) => row.id === "kana-meaning")).toMatchObject({ total: 3, practiceWordIds: ["word-b"] });
    expect(report.quiz.find((row) => row.id === "kanji-reading")).toMatchObject({ total: 1, practiceWordIds: ["word-a"] });
  });

  it("excludes ignored words from practice and returns unloaded built-in IDs as unresolved", () => {
    const data = fixture();
    data.states.push({ ...initialState("word-a", now, "account-1"), isIgnored: true });
    const unloadedId = `${bookA}-w-unloaded`;
    addLog(data, { id: "ignored-wrong", wordId: "word-a", type: "kana-meaning", isCorrect: false });
    addLog(data, { id: "unloaded-wrong", wordId: unloadedId, type: "kana-meaning", isCorrect: false });

    const row = miniPracticeFeedback(data, now, 7, bookA).quiz[0];

    expect(row).toMatchObject({ total: 2, incorrect: 2, practiceWordIds: [], unresolvedWordIds: [unloadedId] });
    expect(row.previewWords).toEqual([]);
  });

  it("adapts account-partitioned records through a derived copy without mutating the input", () => {
    const data = fixture();
    const ignored = { ...initialState("word-a", now, "account-42"), isIgnored: true };
    data.states.push(ignored);
    const log = addLog(data, { id: "account-log", wordId: "word-a", type: "kana-meaning", isCorrect: false, userId: "account-42" });
    const before = structuredClone(data);

    const row = miniPracticeFeedback(data, now, 7, bookA).quiz[0];

    expect(row).toMatchObject({ total: 1, incorrect: 1, practiceWordIds: [] });
    expect(data).toEqual(before);
    expect(data.states[0].userId).toBe("account-42");
    expect(data.logs[0]).toBe(log);
    expect(data.logs[0].userId).toBe("account-42");
  });
});
