import { dayKey, daysBefore } from '@jp/shared';
import type { ReviewLog, StudyMode, WordState } from '@jp/models';
import type { ExtensionBook, ExtensionSnapshot, ExtensionWord } from './model';
import { bookIdForWord } from './learning';

export interface ExtensionLearningDay {
  day: string;
  label: string;
  words: number;
  reviews: number;
}

export interface ExtensionBookShare {
  id: string;
  title: string;
  count: number;
  percent: number;
}

export interface ExtensionLearningMethod {
  id: StudyMode;
  title: string;
  count: number;
}

export interface ExtensionMemoryStages {
  new: number;
  learning: number;
  review: number;
  mastered: number;
}

export interface ExtensionProgressCount {
  total: number;
  learned: number;
  percent: number;
}

export interface ExtensionLessonProgress extends ExtensionProgressCount {
  id: string;
  title: string;
}

export interface ExtensionBookProgress extends ExtensionProgressCount {
  id: string;
  title: string;
  stages: ExtensionMemoryStages;
  lessons: ExtensionLessonProgress[];
}

const CANONICAL_TITLES: Record<string, string> = {
  'biaori-beginner-upper': '新版标准日本语初级上册',
  'biaori-beginner-lower': '新版标准日本语初级下册',
  'biaori-intermediate-upper': '新版标准日本语中级上册',
  'biaori-intermediate-lower': '新版标准日本语中级下册',
  'biaori-advanced-upper': '新版标准日本语高级上册',
  'biaori-advanced-lower': '新版标准日本语高级下册',
  'jlpt-n5': 'JLPT N5 备考词汇',
  'jlpt-n4': 'JLPT N4 备考词汇',
  'jlpt-n3': 'JLPT N3 备考词汇',
  'jlpt-n2': 'JLPT N2 备考词汇',
  'jlpt-n1': 'JLPT N1 备考词汇',
};

const emptyStages = (): ExtensionMemoryStages => ({ new: 0, learning: 0, review: 0, mastered: 0 });

function accountId(snapshot: ExtensionSnapshot): string {
  return snapshot.identity?.userId || snapshot.learning.userSettings?.userId || 'local';
}

function bookIdForLesson(lessonId: string): string {
  const separator = lessonId.indexOf('-l-');
  return separator > 0 ? lessonId.slice(0, separator) : lessonId;
}

function fullTitle(id: string, fallback?: string): string {
  return CANONICAL_TITLES[id] ?? fallback ?? id;
}

function uniqueWordInstances(words: ExtensionWord[], snapshot: ExtensionSnapshot): ExtensionWord[] {
  const result: ExtensionWord[] = [];
  const seen = new Set<string>();
  const candidates = [...words, ...snapshot.learning.words, ...snapshot.words.map(saved => saved.word)];
  for (const word of candidates) {
    const key = word.id + '\u0000' + word.lessonId;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result;
}

function isLearned(state: WordState | undefined): state is WordState {
  return !!state && (!!state.firstSeenAt || state.reviewCount > 0);
}

function stageFor(state: WordState): keyof ExtensionMemoryStages {
  if (Number.isFinite(state.card?.stability) && state.card.stability >= 30) return 'mastered';
  if (state.status === 'review' || state.status === 'mastered') return 'review';
  return 'learning';
}

function boundedCount(total: number, learned: number): ExtensionProgressCount {
  const boundedLearned = Math.min(total, learned);
  return { total, learned: boundedLearned, percent: total ? Math.round(boundedLearned / total * 100) : 0 };
}

function accountStates(snapshot: ExtensionSnapshot): Map<string, WordState> {
  const currentUserId = accountId(snapshot);
  const states = new Map<string, WordState>();
  for (const state of snapshot.learning.states) {
    if (state.userId === currentUserId) states.set(state.wordId, state);
  }
  // SavedWord.state is retained for old readers. The canonical learning state wins.
  for (const saved of snapshot.words) {
    if (saved.state.userId === currentUserId && !states.has(saved.word.id)) states.set(saved.word.id, saved.state);
  }
  return states;
}

function logLocation(
  log: ReviewLog,
  wordsById: Map<string, ExtensionWord[]>,
): { bookId: string; wordKey: string } {
  const candidates = wordsById.get(log.wordId) ?? [];
  const eventStates = [log.newState, log.previousState];
  const lessonId = eventStates.find(state => state.lessonId)?.lessonId;
  const stateBookId = eventStates.find(state => state.bookId)?.bookId;
  const matchedByLesson = lessonId ? candidates.find(word => word.lessonId === lessonId) : undefined;
  const matchedByBook = stateBookId ? candidates.find(word => bookIdForWord(word) === stateBookId) : undefined;
  const matched = matchedByLesson ?? matchedByBook ?? candidates[0];
  const resolvedLesson = matched?.lessonId ?? lessonId;
  const bookId = (matched && bookIdForWord(matched))
    || stateBookId
    || (resolvedLesson ? bookIdForLesson(resolvedLesson) : 'unassigned');
  return { bookId, wordKey: bookId + '\u0000' + log.wordId };
}

/** Counts local-calendar-day word entries separately from deduplicated review events. */
export function extensionLearningAnalytics(
  words: ExtensionWord[],
  snapshot: ExtensionSnapshot,
  now: Date,
  range: 7 | 30,
) {
  const currentUserId = accountId(snapshot);
  const uniqueWords = uniqueWordInstances(words, snapshot);
  const wordsById = new Map<string, ExtensionWord[]>();
  const titleByBook = new Map<string, string>();
  for (const word of uniqueWords) {
    const bookId = bookIdForWord(word);
    const entries = wordsById.get(word.id) ?? [];
    entries.push(word);
    wordsById.set(word.id, entries);
    if (!titleByBook.has(bookId)) titleByBook.set(bookId, word.bookTitle || bookId);
  }
  for (const book of snapshot.learning.books) titleByBook.set(book.id, book.title);

  const days: ExtensionLearningDay[] = Array.from({ length: range }, (_, index) => {
    const date = daysBefore(now, range - 1 - index);
    return { day: dayKey(date), label: (date.getMonth() + 1) + '/' + date.getDate(), words: 0, reviews: 0 };
  });
  const byDay = new Map(days.map(day => [day.day, { day, words: new Set<string>() }]));
  const byBook = new Map<string, Set<string>>();
  const seenEvents = new Set<string>();
  const distinctWords = new Set<string>();
  const methods: ExtensionLearningMethod[] = [
    { id: 'new', title: '新词学习', count: 0 },
    { id: 'review', title: '常规复习', count: 0 },
    { id: 'difficult', title: '难词与巩固', count: 0 },
  ];
  const byMethod = new Map(methods.map(method => [method.id, method]));
  const logs = [...snapshot.learning.logs, ...snapshot.logs];

  for (const log of logs) {
    if (log.userId !== currentUserId || seenEvents.has(log.id)) continue;
    const timestamp = new Date(log.reviewedAt);
    if (!Number.isFinite(timestamp.getTime()) || timestamp > now) continue;
    const bucket = byDay.get(dayKey(timestamp));
    if (!bucket) continue;

    seenEvents.add(log.id);
    const location = logLocation(log, wordsById);
    bucket.day.reviews += 1;
    bucket.words.add(location.wordKey);
    distinctWords.add(location.wordKey);
    const bookWords = byBook.get(location.bookId) ?? new Set<string>();
    bookWords.add(location.wordKey);
    byBook.set(location.bookId, bookWords);

    const method = byMethod.get(log.studyMode)
      ?? byMethod.get(log.previousState.reviewCount > 0 ? 'review' : 'new')!;
    method.count += 1;
  }
  for (const bucket of byDay.values()) bucket.day.words = bucket.words.size;

  const allShares: ExtensionBookShare[] = [...byBook]
    .map(([id, bookWords]) => ({
      id,
      title: id === 'unassigned' ? '未归属词书' : fullTitle(id, titleByBook.get(id)),
      count: bookWords.size,
      percent: 0,
    }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
  const shares = allShares.length > 5
    ? [
      ...allShares.slice(0, 4),
      { id: 'other', title: '其他词书', count: allShares.slice(4).reduce((sum, share) => sum + share.count, 0), percent: 0 },
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
    activeDays: days.filter(day => day.words > 0).length,
  };
}

interface LessonBucket {
  id: string;
  title: string;
  order: number;
  wordKeys: Set<string>;
  ignored: number;
  learned: number;
  stages: ExtensionMemoryStages;
}

/** Builds per-book and per-lesson progress from this extension partition's states. */
export function extensionLibraryProgress(words: ExtensionWord[], snapshot: ExtensionSnapshot) {
  const allWords = uniqueWordInstances(words, snapshot);
  const states = accountStates(snapshot);
  const wordsById = new Map<string, ExtensionWord[]>();
  const books = new Map<string, { title: string; meta?: ExtensionBook; lessons: Map<string, LessonBucket> }>();

  for (const word of allWords) {
    const bookId = bookIdForWord(word);
    const book = books.get(bookId) ?? { title: fullTitle(bookId, word.bookTitle || bookId), lessons: new Map<string, LessonBucket>() };
    if (!books.has(bookId)) books.set(bookId, book);
    const lesson = book.lessons.get(word.lessonId) ?? {
      id: word.lessonId,
      title: word.lessonTitle || word.lessonId,
      order: word.order,
      wordKeys: new Set<string>(),
      ignored: 0,
      learned: 0,
      stages: emptyStages(),
    };
    lesson.order = Math.min(lesson.order, word.order);
    if (!lesson.title && word.lessonTitle) lesson.title = word.lessonTitle;
    lesson.wordKeys.add(word.id);
    book.lessons.set(word.lessonId, lesson);

    const candidates = wordsById.get(word.id) ?? [];
    candidates.push(word);
    wordsById.set(word.id, candidates);
  }
  for (const meta of snapshot.learning.books) {
    const book = books.get(meta.id) ?? { title: fullTitle(meta.id, meta.title), lessons: new Map<string, LessonBucket>() };
    book.meta = meta;
    book.title = fullTitle(meta.id, meta.title);
    if (!books.has(meta.id)) books.set(meta.id, book);
  }

  const stateTargets = new Map<string, ExtensionWord>();
  for (const [wordId, state] of states) {
    const candidates = wordsById.get(wordId);
    if (!candidates?.length) continue;
    const matchedByLesson = state.lessonId ? candidates.find(word => word.lessonId === state.lessonId) : undefined;
    const matchedByBook = state.bookId ? candidates.find(word => bookIdForWord(word) === state.bookId) : undefined;
    const match = matchedByLesson ?? matchedByBook ?? candidates[0];
    stateTargets.set(wordId, match);
  }
  for (const [wordId, word] of stateTargets) {
    const state = states.get(wordId)!;
    const book = books.get(bookIdForWord(word));
    const lesson = book?.lessons.get(word.lessonId);
    if (!lesson) continue;
    if (state.isIgnored) {
      lesson.ignored += 1;
      continue;
    }
    if (!isLearned(state)) continue;
    lesson.learned += 1;
    lesson.stages[stageFor(state)] += 1;
  }

  const resultBooks: ExtensionBookProgress[] = [...books].map(([id, book]) => {
    const lessons: ExtensionLessonProgress[] = [...book.lessons.values()]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map(lesson => {
        const total = Math.max(0, lesson.wordKeys.size - lesson.ignored);
        const count = boundedCount(total, lesson.learned);
        const stages = lesson.stages;
        stages.new = Math.max(0, total - stages.learning - stages.review - stages.mastered);
        return { id: lesson.id, title: lesson.title, ...count };
      });
    const loadedTotal = lessons.reduce((sum, lesson) => sum + lesson.total, 0);
    const total = lessons.length > 0 ? loadedTotal : book.meta?.wordCount || 0;
    const learned = lessons.reduce((sum, lesson) => sum + lesson.learned, 0);
    const stages = emptyStages();
    for (const lesson of book.lessons.values()) {
      stages.learning += lesson.stages.learning;
      stages.review += lesson.stages.review;
      stages.mastered += lesson.stages.mastered;
    }
    stages.new = Math.max(0, total - stages.learning - stages.review - stages.mastered);
    return { id, title: book.title, ...boundedCount(total, learned), stages, lessons };
  });

  const total = resultBooks.reduce((sum, book) => sum + book.total, 0);
  const learned = resultBooks.reduce((sum, book) => sum + book.learned, 0);
  const stages = emptyStages();
  for (const book of resultBooks) {
    stages.new += book.stages.new;
    stages.learning += book.stages.learning;
    stages.review += book.stages.review;
    stages.mastered += book.stages.mastered;
  }
  return { books: resultBooks, stages, ...boundedCount(total, learned) };
}
