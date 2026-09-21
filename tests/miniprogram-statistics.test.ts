import { describe, expect, it } from "vitest";
import type { Data, ReviewLog, WordState } from "@jp/models";
import { calculateLearningStatistics } from "../apps/miniprogram/src/services/learning-statistics";

const upper = "biaori-beginner-upper";
const lower = "biaori-beginner-lower";

function state(wordId: string, changes: Partial<WordState> = {}): WordState {
  return {
    userId: "local", wordId, status: "learning", isIgnored: false, isDifficult: false,
    reviewCount: 1, lapseCount: 0, firstSeenAt: "2026-09-20T09:00:00.000Z",
    nextReviewAt: "2026-09-20T09:00:00.000Z", card: {} as never, ...changes,
  };
}

function log(wordId: string, reviewedAt: string, mode: "new" | "review" | "difficult", previous: Partial<WordState> = {}, changes: Partial<ReviewLog> = {}): ReviewLog {
  const first = mode === "new" && !previous.firstSeenAt && !previous.reviewCount;
  return {
    id: `${wordId}:${reviewedAt}:${mode}`,
    userId: "local", wordId, reviewedAt, rating: 3, responseTime: 100,
    previousState: { wordId, userId: "local", reviewCount: first ? 0 : 1, ...previous } as WordState,
    newState: state(wordId, { firstSeenAt: first ? reviewedAt : "2026-09-20T09:00:00.000Z" }),
    studyMode: mode, ...changes,
  };
}

function data(states: WordState[] = [], logs: ReviewLog[] = []): Data {
  return { books: [], lessons: [], words: [], states, logs, seeded: true };
}

describe("mini-program learning statistics", () => {
  it("returns six catalog books and zeroes for empty data", () => {
    const stats = calculateLearningStatistics(data(), new Date(2026, 8, 22, 12));
    expect(stats.books).toHaveLength(6);
    expect(stats.total).toBe(9117);
    expect(stats.learned).toBe(0);
    expect(stats.todayNew).toBe(0);
    expect(stats.todayReview).toBe(0);
    expect(stats.streak).toBe(0);
    expect(stats.due).toBe(0);
    expect(stats.difficult).toBe(0);
    expect(stats.books.find((book) => book.bookId === upper)).toMatchObject({ total: 1077, learned: 0, progress: 0 });
  });

  it("counts one first exposure per word, every later review event, and local-day streaks", () => {
    const now = new Date(2026, 8, 22, 0, 10);
    const first = log(`${upper}-w-1-1`, "2026-09-22T00:01:00", "new");
    const duplicate = { ...first, id: first.id };
    const review = log(first.wordId, "2026-09-22T00:05:00", "review", { firstSeenAt: first.reviewedAt, reviewCount: 1 });
    const yesterday = log(`${upper}-w-1-2`, "2026-09-21T23:59:00", "new");
    const stats = calculateLearningStatistics(data([
      state(first.wordId, { firstSeenAt: first.reviewedAt, reviewCount: 2 }),
      state(yesterday.wordId, { firstSeenAt: yesterday.reviewedAt }),
    ], [first, duplicate, review, yesterday]), now);
    expect(stats.todayNew).toBe(1);
    expect(stats.todayReview).toBe(1);
    expect(stats.totalReviews).toBe(3);
    expect(stats.streak).toBe(2);
    expect(stats.days.at(-1)?.count).toBe(2);
  });

  it("continues the streak from yesterday when today has no activity", () => {
    const logs = [
      log(`${upper}-w-1-1`, "2026-09-21T18:00:00", "new"),
      log(`${upper}-w-1-2`, "2026-09-20T18:00:00", "new"),
    ];
    const stats = calculateLearningStatistics(data([], logs), new Date(2026, 8, 22, 12));
    expect(stats.todayNew).toBe(0);
    expect(stats.todayReview).toBe(0);
    expect(stats.streak).toBe(2);
  });

  it("uses state/log book metadata and stable ids even when no words are downloaded", () => {
    const lowerWord = `${lower}-w-28-1212`;
    const upperWord = `${upper}-w-1-1`;
    const stats = calculateLearningStatistics(data([
      state(lowerWord, { bookId: lower, status: "mastered", reviewCount: 2, isDifficult: true, nextReviewAt: "2026-09-21T00:00:00Z" }),
      state(upperWord, { bookId: undefined, reviewCount: 1, nextReviewAt: "2026-09-23T00:00:00Z" }),
    ], [log(lowerWord, "2026-09-20T09:00:00Z", "new", {}, { newState: state(lowerWord, { bookId: lower }) })]), new Date("2026-09-22T12:00:00Z"));
    expect(stats.learned).toBe(2);
    expect(stats.due).toBe(1);
    expect(stats.difficult).toBe(1);
    expect(stats.books.find((book) => book.bookId === lower)).toMatchObject({ learned: 1, mastered: 1, due: 1, difficult: 1, total: 1073 });
    expect(stats.books.find((book) => book.bookId === upper)).toMatchObject({ learned: 1, total: 1077 });
  });

  it("excludes ignored words from current totals without erasing activity history", () => {
    const word = `${upper}-w-1-2`;
    const ignored = state(word, { isIgnored: true, isDifficult: true, nextReviewAt: "2026-09-20T00:00:00Z" });
    const stats = calculateLearningStatistics(data([ignored], [log(word, "2026-09-22T08:00:00Z", "new")]), new Date("2026-09-22T12:00:00Z"));
    expect(stats.learned).toBe(0);
    expect(stats.todayNew).toBe(1);
    expect(stats.todayReview).toBe(0);
    expect(stats.totalReviews).toBe(1);
    expect(stats.streak).toBe(1);
    expect(stats.due).toBe(0);
    expect(stats.difficult).toBe(0);
    expect(stats.books.find((book) => book.bookId === upper)?.total).toBe(1076);
  });
});
