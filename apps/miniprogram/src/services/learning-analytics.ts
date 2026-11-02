import type { Data, ReviewLog, StudyMode, WordState } from "@jp/models";
import { dayKey, daysBefore } from "@jp/shared";
import { fullBookTitle } from "./book-presentation";
import catalog from "./textbooks-catalog.json";

export interface LearningBookMetadata {
  id: string;
  wordCount: number;
  lessons: Array<{ id: string; wordCount: number }>;
}

export interface LearningDay {
  day: string;
  label: string;
  words: number;
  reviews: number;
}

export interface BookShare {
  id: string;
  title: string;
  count: number;
  percent: number;
}

export interface LearningMethod {
  id: StudyMode;
  title: string;
  count: number;
}

export interface ProgressCount {
  total: number;
  learned: number;
  percent: number;
}

export interface MemoryStages {
  new: number;
  learning: number;
  review: number;
  mastered: number;
}

const emptyStages = (): MemoryStages => ({ new: 0, learning: 0, review: 0, mastered: 0 });

function accountStates(data: Data, userId?: string): Map<string, WordState> {
  const accountId = userId ?? "local";
  return new Map(data.states.filter((state) => state.userId === accountId).map((state) => [state.wordId, state]));
}

function locations(data: Data, states: Map<string, WordState>) {
  const lessons = new Map(data.lessons.map((lesson) => [lesson.id, lesson.bookId]));
  const words = new Map(data.words.map((word) => [word.id, { lessonId: word.lessonId, bookId: lessons.get(word.lessonId) }]));

  return (wordId: string, log?: ReviewLog) => {
    const state = states.get(wordId);
    const lessonId = words.get(wordId)?.lessonId
      ?? state?.lessonId
      ?? log?.newState?.lessonId
      ?? log?.previousState?.lessonId;
    return {
      lessonId,
      bookId: words.get(wordId)?.bookId
        ?? state?.bookId
        ?? log?.newState?.bookId
        ?? log?.previousState?.bookId
        ?? lessons.get(lessonId ?? ""),
    };
  };
}

/** Counts daily distinct words separately from review events, using local calendar days. */
export function learningAnalytics(data: Data, now: Date, range: 7 | 30, userId?: string) {
  const states = accountStates(data, userId);
  const locate = locations(data, states);
  const days = Array.from({ length: range }, (_, index) => {
    const date = daysBefore(now, range - 1 - index);
    return { day: dayKey(date), label: `${date.getMonth() + 1}/${date.getDate()}`, words: 0, reviews: 0 };
  });
  const byDay = new Map(days.map((day) => [day.day, { day, words: new Set<string>() }]));
  const byBook = new Map<string, Set<string>>();
  const seenEvents = new Set<string>();
  const distinctWords = new Set<string>();
  const methods: LearningMethod[] = [
    { id: "new", title: "新词学习", count: 0 },
    { id: "review", title: "常规复习", count: 0 },
    { id: "difficult", title: "难词强化", count: 0 },
  ];
  const byMethod = new Map(methods.map((method) => [method.id, method]));

  for (const log of data.logs) {
    if (log.userId !== (userId ?? "local") || seenEvents.has(log.id)) continue;
    const timestamp = new Date(log.reviewedAt);
    if (!Number.isFinite(timestamp.getTime()) || timestamp > now) continue;
    const bucket = byDay.get(dayKey(timestamp));
    if (!bucket) continue;

    seenEvents.add(log.id);
    bucket.day.reviews += 1;
    // Imported logs may predate studyMode; retain the Web fallback classification.
    const method = byMethod.get(log.studyMode)
      ?? byMethod.get(log.previousState?.reviewCount > 0 ? "review" : "new")!;
    method.count += 1;
    bucket.words.add(log.wordId);
    distinctWords.add(log.wordId);

    const bookId = locate(log.wordId, log).bookId ?? "unassigned";
    if (!byBook.has(bookId)) byBook.set(bookId, new Set());
    byBook.get(bookId)!.add(log.wordId);
  }

  for (const bucket of byDay.values()) bucket.day.words = bucket.words.size;

  const bookTitles = new Map<string, string>(catalog.books.map((book) => [book.id, fullBookTitle(book)]));
  for (const book of data.books) bookTitles.set(book.id, fullBookTitle(book));
  const allShares: BookShare[] = [...byBook]
    .map(([id, words]) => ({ id, title: bookTitles.get(id) ?? "未归属词书", count: words.size, percent: 0 }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
  const shares = allShares.length > 5
    ? [
      ...allShares.slice(0, 4),
      { id: "other", title: "其他词书", count: allShares.slice(4).reduce((sum, item) => sum + item.count, 0), percent: 0 },
    ]
    : allShares;
  const shareTotal = shares.reduce((sum, share) => sum + share.count, 0);
  for (const share of shares) share.percent = shareTotal ? Math.round(share.count / shareTotal * 100) : 0;

  return {
    days,
    shares,
    shareTotal,
    methods,
    distinctWords: distinctWords.size,
    reviews: days.reduce((sum, day) => sum + day.reviews, 0),
    activeDays: days.filter((day) => day.words > 0).length,
  };
}

/** Unloaded textbooks keep their per-lesson catalog totals; progress uses this account's states. */
export function libraryProgress(data: Data, metadata: LearningBookMetadata[], userId?: string) {
  const states = accountStates(data, userId);
  const locate = locations(data, states);
  const metadataByBook = new Map(metadata.map((book) => [book.id, book]));
  const wordCounts = new Map<string, number>();
  for (const word of data.words) wordCounts.set(word.lessonId, (wordCounts.get(word.lessonId) ?? 0) + 1);

  const byLesson = new Map<string, { learned: number; ignored: number; stages: MemoryStages }>();
  const lessonIds = new Set(data.lessons.map((lesson) => lesson.id));
  const stages = emptyStages();
  for (const state of states.values()) {
    const lessonId = locate(state.wordId).lessonId;
    if (!lessonId || !lessonIds.has(lessonId)) continue;
    const bucket = byLesson.get(lessonId) ?? { learned: 0, ignored: 0, stages: emptyStages() };
    if (state.isIgnored) bucket.ignored += 1;
    else if (state.firstSeenAt || state.reviewCount > 0) {
      bucket.learned += 1;
      bucket.stages[state.status === "new" ? "learning" : state.status] += 1;
    }
    byLesson.set(lessonId, bucket);
  }

  const count = (total: number, learned: number): ProgressCount => {
    const boundedLearned = Math.min(total, learned);
    return { total, learned: boundedLearned, percent: total ? Math.round(boundedLearned / total * 100) : 0 };
  };
  const books = data.books.map((book) => {
    const meta = metadataByBook.get(book.id);
    const metadataLessons = new Map(meta?.lessons.map((lesson) => [lesson.id, lesson.wordCount]));
    const lessons = data.lessons
      .filter((lesson) => lesson.bookId === book.id)
      .sort((left, right) => left.order - right.order)
      .map((lesson) => {
        const state = byLesson.get(lesson.id);
        const total = Math.max(0, (metadataLessons.get(lesson.id) ?? wordCounts.get(lesson.id) ?? 0) - (state?.ignored ?? 0));
        return { ...lesson, ...count(total, state?.learned ?? 0) };
      });
    const bookCount = count(
      lessons.reduce((sum, lesson) => sum + lesson.total, 0),
      lessons.reduce((sum, lesson) => sum + lesson.learned, 0),
    );
    const bookStages = emptyStages();
    for (const lesson of lessons) {
      const lessonStages = byLesson.get(lesson.id)?.stages;
      if (!lessonStages) continue;
      bookStages.learning += lessonStages.learning;
      bookStages.review += lessonStages.review;
      bookStages.mastered += lessonStages.mastered;
    }
    bookStages.new = Math.max(0, bookCount.total - bookStages.learning - bookStages.review - bookStages.mastered);
    stages.learning += bookStages.learning;
    stages.review += bookStages.review;
    stages.mastered += bookStages.mastered;
    return { id: book.id, title: fullBookTitle(book), lessons, stages: bookStages, ...bookCount };
  });

  const total = books.reduce((sum, book) => sum + book.total, 0);
  const learned = books.reduce((sum, book) => sum + book.learned, 0);
  stages.new = Math.max(0, total - stages.learning - stages.review - stages.mastered);
  return { books, stages, ...count(total, learned) };
}
