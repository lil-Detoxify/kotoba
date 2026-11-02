import { describe, expect, it } from "vitest";
import { initialState } from "@jp/core";
import { emptyData, type Book, type Data, type ReviewLog, type Word } from "@jp/models";
import catalog from "../apps/miniprogram/src/services/textbooks-catalog.json";
import { learningAnalytics, libraryProgress } from "../apps/miniprogram/src/services/learning-analytics";

const now = new Date(2026, 9, 5, 18);
const localIso = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();

function dataFixture(): Data {
  const createdAt = "2026-01-01T00:00:00.000Z";
  return {
    ...emptyData(),
    books: catalog.books.map((book) => ({
      id: book.id,
      title: book.title,
      description: book.description,
      language: "ja",
      createdAt,
      updatedAt: createdAt,
    })),
    lessons: catalog.books.flatMap((book) => book.lessons.map((lesson) => ({ ...lesson }))),
  };
}

function addWord(data: Data, id: string, lessonId: string): Word {
  const word: Word = { id, lessonId, term: id, reading: "", meaning: id, order: data.words.length + 1 };
  data.words.push(word);
  return word;
}

function reviewLog(
  id: string,
  wordId: string,
  reviewedAt: string,
  options: { userId?: string; bookId?: string; lessonId?: string; studyMode?: ReviewLog["studyMode"] } = {},
): ReviewLog {
  const userId = options.userId ?? "local";
  const state = initialState(wordId, now, userId);
  state.bookId = options.bookId;
  state.lessonId = options.lessonId;
  return {
    id,
    wordId,
    reviewedAt,
    userId,
    rating: 3,
    responseTime: 100,
    previousState: state,
    newState: { ...state },
    studyMode: options.studyMode ?? "new",
  };
}

describe("Mini-program learning analytics", () => {
  it("counts daily distinct words separately from deduplicated evaluations", () => {
    const data = dataFixture();
    const lessonId = catalog.books[0].lessons[0].id;
    addWord(data, "word-a", lessonId);
    addWord(data, "word-b", lessonId);
    data.logs = [
      reviewLog("event-1", "word-a", localIso(4), { studyMode: "new" }),
      reviewLog("event-1", "word-a", localIso(4), { studyMode: "new" }),
      reviewLog("event-2", "word-a", localIso(4), { studyMode: "review" }),
      reviewLog("event-3", "word-b", localIso(4), { studyMode: "difficult" }),
      reviewLog("event-4", "word-a", localIso(5), { studyMode: "review" }),
      reviewLog("other-account", "word-b", localIso(5), { userId: "bob" }),
      reviewLog("invalid-date", "word-b", "not-a-date"),
      reviewLog("future", "word-b", localIso(6)),
      reviewLog("outside-seven-days", "word-b", new Date(2026, 8, 20).toISOString()),
    ];

    const result = learningAnalytics(data, now, 7);
    expect(result.days.at(-2)).toMatchObject({ day: "2026-10-04", words: 2, reviews: 3 });
    expect(result.days.at(-1)).toMatchObject({ day: "2026-10-05", words: 1, reviews: 1 });
    expect(result).toMatchObject({ reviews: 4, distinctWords: 2, activeDays: 2, shareTotal: 2 });
    expect(result.methods).toEqual([
      { id: "new", title: "新词学习", count: 1 },
      { id: "review", title: "常规复习", count: 2 },
      { id: "difficult", title: "难词强化", count: 1 },
    ]);
    expect(result.methods.reduce((sum, method) => sum + method.count, 0)).toBe(result.reviews);
    expect(learningAnalytics(data, now, 30).reviews).toBe(5);
  });

  it("filters states and logs to the requested account without using the guest fallback", () => {
    const data = dataFixture();
    const lessonId = catalog.books[0].lessons[0].id;
    addWord(data, "alice-word", lessonId);
    const aliceLog = reviewLog("alice-event", "alice-word", localIso(5), { userId: "alice" });
    data.logs = [
      aliceLog,
      { ...aliceLog },
      reviewLog("guest-event", "alice-word", localIso(5)),
      reviewLog("bob-event", "alice-word", localIso(5), { userId: "bob" }),
    ];
    const aliceState = initialState("alice-word", now, "alice");
    aliceState.lessonId = lessonId;
    aliceState.bookId = catalog.books[0].id;
    aliceState.firstSeenAt = localIso(1);
    data.states = [aliceState, { ...aliceState, userId: "bob", status: "mastered" }];

    expect(learningAnalytics(data, now, 7, "alice")).toMatchObject({ reviews: 1, distinctWords: 1 });
    expect(libraryProgress(data, catalog.books, "alice").books[0]).toMatchObject({ learned: 1 });
    expect(libraryProgress(data, catalog.books).books[0]).toMatchObject({ learned: 0 });
  });

  it("keeps five share segments and folds every remaining textbook into other", () => {
    const data: Data = { ...emptyData(), books: [], lessons: [], words: [] };
    for (let index = 0; index < 7; index += 1) {
      const id = `custom-${index}`;
      const book: Book = { id, title: `自定义词书${index}`, description: "", language: "ja", createdAt: "", updatedAt: "" };
      const lessonId = `lesson-${id}`;
      data.books.push(book);
      data.lessons.push({ id: lessonId, bookId: id, title: "第1课", order: 1 });
      addWord(data, `word-${index}`, lessonId);
      data.logs.push(reviewLog(`event-${index}`, `word-${index}`, localIso(5), { bookId: id, lessonId }));
    }

    const result = learningAnalytics(data, now, 7);
    expect(result.shares).toHaveLength(5);
    expect(result.shares.at(-1)).toMatchObject({ id: "other", title: "其他词书", count: 3, percent: 43 });
    expect(result.shareTotal).toBe(7);
    expect(result.shares.reduce((sum, share) => sum + share.count, 0)).toBe(7);
  });
});

describe("Mini-program textbook progress", () => {
  it("uses the per-lesson catalog, excludes ignored and foreign states, and preserves FSRS stages", () => {
    const data = dataFixture();
    const [learningBook, reviewBook] = catalog.books;
    const learningLessonId = learningBook.lessons[0].id;
    const reviewLessonId = reviewBook.lessons[0].id;
    const learningState = {
      ...initialState("learned", now),
      firstSeenAt: localIso(1),
      reviewCount: 1,
      status: "learning" as const,
      bookId: learningBook.id,
      lessonId: learningLessonId,
    };
    const reviewState = {
      ...initialState("review", now),
      firstSeenAt: localIso(1),
      reviewCount: 2,
      status: "review" as const,
      bookId: reviewBook.id,
      lessonId: reviewLessonId,
    };
    const masteredBase = initialState("mastered", now);
    const masteredState = {
      ...masteredBase,
      firstSeenAt: localIso(1),
      reviewCount: 3,
      status: "mastered" as const,
      card: { ...masteredBase.card, stability: 30 },
      bookId: reviewBook.id,
      lessonId: reviewLessonId,
    };
    const ignoredState = {
      ...initialState("ignored", now),
      isIgnored: true,
      bookId: learningBook.id,
      lessonId: learningLessonId,
    };
    const foreignState = { ...learningState, wordId: "foreign", userId: "bob" };
    data.states = [learningState, reviewState, masteredState, ignoredState, foreignState];

    const result = libraryProgress(data, catalog.books);
    expect(result.books[0]).toMatchObject({
      title: "新版标准日本语初级上册",
      total: learningBook.wordCount - 1,
      learned: 1,
      stages: { learning: 1, review: 0, mastered: 0, new: learningBook.wordCount - 2 },
    });
    expect(result.books[1]).toMatchObject({
      total: reviewBook.wordCount,
      learned: 2,
      stages: { learning: 0, review: 1, mastered: 1, new: reviewBook.wordCount - 2 },
    });
    expect(result.stages).toEqual({
      new: catalog.books.reduce((sum, book) => sum + book.wordCount, 0) - 4,
      learning: 1,
      review: 1,
      mastered: 1,
    });
    expect(result).toMatchObject({ total: catalog.books.reduce((sum, book) => sum + book.wordCount, 0) - 1, learned: 3 });
  });

  it("falls back to loaded custom words when catalog metadata is absent and does not mutate input", () => {
    const data: Data = {
      ...emptyData(),
      books: [{ id: "custom", title: "旅行词书", description: "", language: "ja", createdAt: "", updatedAt: "" }],
      lessons: [{ id: "custom-lesson", bookId: "custom", title: "第1课", order: 1 }],
      words: [],
    };
    addWord(data, "learned", "custom-lesson");
    addWord(data, "ignored", "custom-lesson");
    const learned = { ...initialState("learned", now), firstSeenAt: localIso(1), status: "learning" as const };
    const ignored = { ...initialState("ignored", now), isIgnored: true };
    data.states = [learned, ignored];
    const before = structuredClone(data);

    const result = libraryProgress(data, []);
    expect(result.books[0]).toMatchObject({ total: 1, learned: 1, percent: 100 });
    expect(result.books[0].lessons[0]).toMatchObject({ total: 1, learned: 1, percent: 100 });
    expect(data).toEqual(before);
  });
});
