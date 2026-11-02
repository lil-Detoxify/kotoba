import { describe, expect, it } from "vitest";
import { emptyData } from "@jp/models";
import { initialState } from "@jp/core";
import { miniSessionSummary, miniWeakPracticeSuggestions } from "../apps/miniprogram/src/services/study-feedback";

function fixture() {
  const data = emptyData();
  data.books = [
    { id: "book-a", title: "甲书", description: "", language: "ja", createdAt: "2026-10-01", updatedAt: "2026-10-01" },
    { id: "book-b", title: "乙书", description: "", language: "ja", createdAt: "2026-10-01", updatedAt: "2026-10-01" },
  ];
  data.lessons = [
    { id: "lesson-a", bookId: "book-a", title: "第一课", order: 1 },
    { id: "lesson-b", bookId: "book-b", title: "第二课", order: 1 },
  ];
  data.words = [
    { id: "forgotten", lessonId: "lesson-a", term: "忘れた", reading: "わすれた", meaning: "忘记", order: 1 },
    { id: "difficult", lessonId: "lesson-a", term: "難しい", reading: "むずかしい", meaning: "困难", order: 2 },
    { id: "ignored", lessonId: "lesson-a", term: "無視", reading: "むし", meaning: "忽略", order: 3 },
    { id: "other-book", lessonId: "lesson-b", term: "別", reading: "べつ", meaning: "其他", order: 4 },
  ];
  return data;
}

describe("Mini Program study feedback adapter", () => {
  it("counts account-owned review events and keeps repository records unchanged", () => {
    const data = fixture();
    const state = { ...initialState("forgotten", new Date("2026-10-14T00:00:00Z"), "account-1"), reviewCount: 1 };
    data.states.push(state);
    data.logs.push({
      id: "event-1",
      userId: "account-1",
      wordId: "forgotten",
      reviewedAt: "2026-10-13T12:00:00.000Z",
      rating: 1,
      responseTime: 0,
      previousState: initialState("forgotten", new Date("2026-10-12T00:00:00Z"), "account-1"),
      newState: state,
      studyMode: "review",
    });
    const stateBefore = data.states[0];
    const logBefore = data.logs[0];

    const suggestions = miniWeakPracticeSuggestions(data, new Date("2026-10-14T12:00:00Z"), "book-a");

    expect(suggestions.map((item) => [item.word.id, item.reason])).toEqual([["forgotten", "近 30 天有 1 次「忘记」"]]);
    expect(data.states[0]).toBe(stateBefore);
    expect(data.states[0].userId).toBe("account-1");
    expect(data.logs[0]).toBe(logBefore);
    expect(data.logs[0].userId).toBe("account-1");
  });

  it("reuses book scope, ignored filtering, and difficult-mark reasons", () => {
    const data = fixture();
    data.states.push(
      { ...initialState("difficult", new Date("2026-10-14T00:00:00Z"), "account-1"), isDifficult: true },
      { ...initialState("ignored", new Date("2026-10-14T00:00:00Z"), "account-1"), isDifficult: true, isIgnored: true },
      { ...initialState("other-book", new Date("2026-10-14T00:00:00Z"), "account-1"), isDifficult: true },
    );

    expect(miniWeakPracticeSuggestions(data, new Date("2026-10-14T12:00:00Z"), "book-a").map((item) => [item.word.id, item.reason])).toEqual([
      ["difficult", "你标记了生词"],
    ]);
  });

  it("honors the requested suggestion limit", () => {
    const data = fixture();
    data.lessons = Array.from({ length: 7 }, (_, index) => ({ id: `lesson-${index}`, bookId: "book-a", title: `第${index + 1}课`, order: index }));
    data.words = Array.from({ length: 7 }, (_, index) => ({ id: `word-${index}`, lessonId: `lesson-${index}`, term: `词${index}`, reading: "ことば", meaning: "测试", order: index }));
    data.states = data.words.map((word) => ({ ...initialState(word.id, new Date("2026-10-14T00:00:00Z"), "account-1"), isDifficult: true }));

    expect(miniWeakPracticeSuggestions(data, new Date("2026-10-14T12:00:00Z"), "book-a", 5)).toHaveLength(5);
  });

  it("summarizes non-local account reviews without rewriting repository data", () => {
    const data = fixture();
    const target = data.words[0];
    const before = initialState(target.id, new Date("2026-10-12T00:00:00Z"), "account-1");
    const after = { ...initialState(target.id, new Date("2026-10-13T00:00:00Z"), "account-1"), firstSeenAt: "2026-10-13T00:00:00.000Z", reviewCount: 1 };
    data.states.push(after);
    data.logs.push({
      id: "summary-event",
      userId: "account-1",
      wordId: target.id,
      reviewedAt: "2026-10-13T12:00:00.000Z",
      rating: 1,
      responseTime: 0,
      previousState: before,
      newState: after,
      studyMode: "new",
    });
    const originalState = data.states[0];
    const originalLog = data.logs[0];

    const summary = miniSessionSummary(data, [target], 1, [0]);

    expect(summary).toMatchObject({
      newCount: 1,
      reviewCount: 0,
      skippedCount: 0,
      self: { total: 1, forgotten: 1, uncertain: 0, remembered: 0 },
    });
    expect(summary.practiceWords).toEqual([target]);
    expect(summary.recap).toEqual([target]);
    expect(data.states[0]).toBe(originalState);
    expect(data.states[0].userId).toBe("account-1");
    expect(data.logs[0]).toBe(originalLog);
    expect(data.logs[0].userId).toBe("account-1");
  });
});
