import { evaluate, initialState } from '@jp/core';
import { emptyData, type Book, type Data, type Lesson, type QuizType, type ReadingContext, type ReviewEvent, type ReviewLog, type SyncQueueItem, type UserSettings, type Word, type WordState } from '@jp/models';
import { importBook, parseImport } from '@jp/importers';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Grade } from 'ts-fsrs';
import { normalizeKanaAnswer } from '../../web/src/services/kana-input';
import { sceneExampleFor } from '../../web/src/services/learning-scenes';
import { contextClozeExample } from '../../web/src/services/personal-learning-example';
import { cleanReadingContext, wordReadingContexts } from '../../web/src/services/reading-context';
import { applyPersonalLibraryMutation, exportExtensionPersonalLibrary, type PersonalLibraryMutation } from './personal-library';
import { canFeedbackPractice } from './study-feedback';
import { reconcileMiniProgramData, validateSyncPull, type ValidatedSyncPull } from '../../miniprogram/src/services/sync-reconciliation';
import { buildStudyQueue, bookIdForWord, listLearningBooks } from './learning';
import { emptySnapshot, type ExtensionBook, type ExtensionExerciseType, type ExtensionQuizAttempt, type ExtensionSnapshot, type ExtensionWord, type LearningFlagPatch, type LearningMode, type MotionMode, type QuizAttemptInput, type SavedWord, type StudyQueueOptions } from './model';

const STORE_NAME = 'snapshot';
const DEFAULT_DATABASE_NAME = 'kotobud-extension-v1';

function savedReadingContexts(snapshot: ExtensionSnapshot, word: ExtensionWord) {
  if (word.source === 'textbook') {
    return snapshot.learning.builtinContexts?.find(entry => entry.wordId === word.id)?.contexts ?? [];
  }
  const personalWord = snapshot.learning.words.find(entry => entry.id === word.id)
    ?? snapshot.words.find(entry => entry.word.id === word.id)?.word;
  return wordReadingContexts(personalWord);
}

type ExtensionSchema = DBSchema & {
  snapshot: {
    key: string;
    value: ExtensionSnapshot;
  };
};

const wordStringLimits = {
  id: 200,
  bookId: 200,
  lessonId: 200,
  term: 200,
  reading: 200,
  meaning: 2_000,
  partOfSpeech: 200,
  accent: 100,
  example: 2_000,
  exampleTranslation: 2_000,
  audioUrl: 1_000,
  audioTerm: 200,
  rawTerm: 200,
  note: 2_000,
  definitionJa: 2_000,
  definitionZh: 2_000,
  exampleReading: 500,
  bookTitle: 200,
  lessonTitle: 200
} as const;

type WordStringField = keyof typeof wordStringLimits;

const allowedWordFields = new Set<string>([
  ...Object.keys(wordStringLimits),
  'order',
  'senses',
  'readingContexts',
  'source'
]);

const wordSenseStringLimits = {
  meaning: 2_000,
  definitionJa: 2_000,
  partOfSpeech: 200,
  example: 2_000,
  exampleReading: 500,
  exampleTranslation: 2_000
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, field: string, maxLength: number, required = false): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string`);
  }
  if (value.length > maxLength) {
    throw new RangeError(`${field} exceeds ${maxLength} characters`);
  }
  if (required && value.trim().length === 0) {
    throw new TypeError(`${field} must not be empty`);
  }
  return value;
}

function sanitizeWord(input: ExtensionWord): ExtensionWord {
  if (!isRecord(input)) {
    throw new TypeError('word must be an object');
  }
  if ('state' in input || 'userId' in input) {
    throw new TypeError('word cannot include review state or user data');
  }
  for (const key of Object.keys(input)) {
    if (!allowedWordFields.has(key)) {
      throw new TypeError(`word contains unsupported field: ${key}`);
    }
  }

  const requiredFields: WordStringField[] = [
    'id', 'lessonId', 'term', 'reading', 'meaning', 'bookTitle', 'lessonTitle'
  ];
  const word = {} as ExtensionWord;
  for (const field of Object.keys(wordStringLimits) as WordStringField[]) {
    if (input[field] === undefined && !requiredFields.includes(field)) continue;
    (word as unknown as Record<string, unknown>)[field] = boundedString(
      input[field],
      field,
      wordStringLimits[field],
      requiredFields.includes(field)
    );
  }

  if (input.source !== 'textbook' && input.source !== 'manual') {
    throw new TypeError('source must be textbook or manual');
  }
  word.source = input.source;

  if (!Number.isSafeInteger(input.order) || input.order < 0) {
    throw new TypeError('order must be a non-negative integer');
  }
  word.order = input.order;
  if (input.readingContexts !== undefined) word.readingContexts = sanitizeContexts(input.readingContexts);

  if (input.senses !== undefined) {
    if (!Array.isArray(input.senses) || input.senses.length > 30) {
      throw new TypeError('senses must be an array with at most 30 entries');
    }
    word.senses = input.senses.map((sense, index) => {
      if (!isRecord(sense)) throw new TypeError(`senses[${index}] must be an object`);
      const sanitized: NonNullable<ExtensionWord['senses']>[number] = {
        meaning: boundedString(sense.meaning, `senses[${index}].meaning`, wordSenseStringLimits.meaning, true)
      };
      for (const [field, maxLength] of Object.entries(wordSenseStringLimits)) {
        if (field === 'meaning' || sense[field] === undefined) continue;
        (sanitized as unknown as Record<string, unknown>)[field] = boundedString(
          sense[field],
          `senses[${index}].${field}`,
          maxLength
        );
      }
      for (const key of Object.keys(sense)) {
        if (!(key in wordSenseStringLimits)) {
          throw new TypeError(`senses[${index}] contains unsupported field: ${key}`);
        }
      }
      return sanitized;
    });
  }

  return word;
}

function sanitizeContexts(input: unknown): ReadingContext[] {
  if (!Array.isArray(input)) throw new TypeError('reading contexts must be an array');
  const ids = new Set<string>();
  return input.map(context => {
    if (!isRecord(context) || !isValidIsoDate(context.createdAt) || !isValidIsoDate(context.updatedAt)) throw new TypeError('reading context is malformed');
    const id = boundedString(context.id, '原句编号', 200, true);
    if (ids.has(id)) throw new TypeError('duplicate reading context');
    ids.add(id);
    return { ...cleanReadingContext(context as unknown as Parameters<typeof cleanReadingContext>[0]), id, createdAt: context.createdAt as string, updatedAt: context.updatedAt as string };
  });
}

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeSourceHost(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const host = value.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 253 || /[\s\u0000-\u001f\u007f:/?#@\\]/.test(host)) return undefined;
  if (!host.split('.').every(label => label.length <= 63 && HOST_LABEL.test(label))) return undefined;
  return host;
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function assertWordState(value: unknown, expectedWordId?: string, expectedUserId = 'local'): asserts value is WordState {
  if (!isRecord(value)) throw new TypeError('stored word state is malformed');
  if (value.userId !== expectedUserId || typeof value.wordId !== 'string' || (expectedWordId && value.wordId !== expectedWordId)) {
    throw new TypeError('stored word state has an invalid identity');
  }
  if (!['new', 'learning', 'review', 'mastered'].includes(String(value.status))) {
    throw new TypeError('stored word state has an invalid status');
  }
  if (typeof value.isIgnored !== 'boolean' || typeof value.isDifficult !== 'boolean') {
    throw new TypeError('stored word state has invalid flags');
  }
  if (!Number.isSafeInteger(value.reviewCount) || (value.reviewCount as number) < 0 || !Number.isSafeInteger(value.lapseCount) || (value.lapseCount as number) < 0) {
    throw new TypeError('stored word state has invalid review counts');
  }
  if (!isRecord(value.card) || !(value.card.due instanceof Date) || !Number.isFinite(value.card.due.getTime())) {
    throw new TypeError('stored word state has an invalid FSRS card');
  }
  if (value.card.last_review !== undefined && (!(value.card.last_review instanceof Date) || !Number.isFinite(value.card.last_review.getTime()))) {
    throw new TypeError('stored word state has an invalid FSRS review date');
  }
  for (const field of ['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'state', 'learning_steps']) {
    if (typeof value.card[field] !== 'number' || !Number.isFinite(value.card[field])) {
      throw new TypeError(`stored FSRS card has an invalid ${field}`);
    }
  }
}

function assertSavedWord(value: unknown, expectedUserId = 'local'): asserts value is SavedWord {
  if (!isRecord(value)) throw new TypeError('stored saved word is malformed');
  const word = sanitizeWord(value.word as ExtensionWord);
  if (!isValidIsoDate(value.savedAt)) throw new TypeError('stored saved word has an invalid savedAt');
  if (value.sourceHost !== undefined && normalizeSourceHost(value.sourceHost) !== value.sourceHost) {
    throw new TypeError('stored saved word has an invalid sourceHost');
  }
  assertWordState(value.state, word.id, expectedUserId);
}

function assertReviewLog(value: unknown, expectedUserId = 'local'): asserts value is ReviewLog {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 || value.userId !== expectedUserId || typeof value.wordId !== 'string') {
    throw new TypeError('stored review log is malformed');
  }
  if (!isValidIsoDate(value.reviewedAt) || ![1, 2, 3, 4].includes(value.rating as number)) {
    throw new TypeError('stored review log has invalid review data');
  }
  if (typeof value.responseTime !== 'number' || !Number.isFinite(value.responseTime) || value.responseTime < 0) {
    throw new TypeError('stored review log has an invalid response time');
  }
  if (!['new', 'review', 'difficult'].includes(String(value.studyMode))) {
    throw new TypeError('stored review log has an invalid study mode');
  }
  assertWordState(value.previousState, value.wordId, expectedUserId);
  assertWordState(value.newState, value.wordId, expectedUserId);
  if (value.quiz !== undefined) assertQuiz(value.quiz, 'stored review log quiz');
}

const exerciseTypes = new Set<ExtensionExerciseType>([
  'card', 'kana-meaning', 'kanji-reading', 'audio-meaning', 'mixed',
  'kana-input', 'dictation', 'sentence-cloze'
]);
const choiceQuizTypes = new Set<QuizType>(['kana-meaning', 'kanji-reading', 'audio-meaning']);
const inputQuizTypes = new Set<QuizType>(['kana-input', 'dictation']);
const quizTypes = new Set<QuizType>([...choiceQuizTypes, ...inputQuizTypes]);

function isInputQuizType(type: unknown): type is 'kana-input' | 'dictation' {
  return type === 'kana-input' || type === 'dictation';
}

function quizAnswerIsCorrect(type: QuizType, selected: string | null, correct: string): boolean {
  if (selected === null) return false;
  return isInputQuizType(type)
    ? normalizeKanaAnswer(selected) === normalizeKanaAnswer(correct)
    : selected === correct;
}

function assertQuiz(value: unknown, path: string): asserts value is NonNullable<ReviewLog['quiz']> {
  if (!isRecord(value) || typeof value.type !== 'string' || !quizTypes.has(value.type as QuizType) || typeof value.prompt !== 'string' ||
      !Array.isArray(value.options) ||
      (isInputQuizType(value.type) ? value.options.length !== 0 : !value.options.length || !value.options.every(item => typeof item === 'string')) ||
      (value.selected !== null && typeof value.selected !== 'string') || typeof value.correct !== 'string' || typeof value.isCorrect !== 'boolean' ||
      value.isCorrect !== quizAnswerIsCorrect(value.type as QuizType, value.selected as string | null, value.correct as string)) {
    throw new TypeError(`${path} is malformed`);
  }
}

function assertUserSettings(value: unknown, expectedUserId: string): asserts value is UserSettings {
  if (!isRecord(value) || value.userId !== expectedUserId || !isValidIsoDate(value.updatedAt)) throw new TypeError('stored user settings are malformed');
  if (value.email !== undefined && typeof value.email !== 'string') throw new TypeError('stored user settings have invalid email');
  if (value.currentBookId !== undefined && typeof value.currentBookId !== 'string') throw new TypeError('stored user settings have invalid currentBookId');
  if (value.currentBookIdSource !== undefined && !['default', 'user'].includes(String(value.currentBookIdSource))) throw new TypeError('stored user settings have invalid currentBookIdSource');
  if (value.lastStudiedPosition !== undefined) {
    const position = value.lastStudiedPosition;
    if (!isRecord(position) || typeof position.bookId !== 'string' || typeof position.lessonId !== 'string' || typeof position.wordId !== 'string' || !isValidIsoDate(position.updatedAt)) {
      throw new TypeError('stored user settings have invalid lastStudiedPosition');
    }
  }
  if (value.preferences !== undefined) {
    const preferences = value.preferences;
    if (!isRecord(preferences) || (preferences.pronunciationVoice !== undefined && !['female', 'male'].includes(String(preferences.pronunciationVoice)))) {
      throw new TypeError('stored user settings have invalid preferences');
    }
  }
}

function assertExtensionBook(value: unknown): asserts value is ExtensionBook {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.title !== 'string' || !value.title ||
      typeof value.description !== 'string' || !Number.isSafeInteger(value.wordCount) || (value.wordCount as number) < 0 || value.source !== 'manual' ||
      (value.createdAt !== undefined && !isValidIsoDate(value.createdAt)) ||
      (value.updatedAt !== undefined && !isValidIsoDate(value.updatedAt))) throw new TypeError('stored learning book is malformed');
}

function assertQuizRecord(value: unknown): asserts value is ExtensionQuizAttempt {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.requestId !== 'string' || !value.requestId ||
      typeof value.wordId !== 'string' || !value.wordId || typeof value.type !== 'string' || !quizTypes.has(value.type as QuizType) ||
      typeof value.prompt !== 'string' || !Array.isArray(value.options) ||
      (isInputQuizType(value.type) ? value.options.length !== 0 : !value.options.length || !value.options.every(item => typeof item === 'string')) ||
      (value.selected !== null && typeof value.selected !== 'string') || typeof value.correct !== 'string' || typeof value.isCorrect !== 'boolean' ||
      value.isCorrect !== quizAnswerIsCorrect(value.type as QuizType, value.selected as string | null, value.correct as string) ||
      !Number.isFinite(value.elapsedMs) || (value.elapsedMs as number) < 0 ||
      !isValidIsoDate(value.recordedAt)) throw new TypeError('stored quiz attempt is malformed');
}

function assertQueueItem(value: unknown): asserts value is SyncQueueItem {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || !['progress', 'review_event', 'settings'].includes(String(value.type)) ||
      !isRecord(value.payload) || !isValidIsoDate(value.createdAt) || !Number.isSafeInteger(value.retries) || (value.retries as number) < 0) {
    throw new TypeError('stored sync queue item is malformed');
  }
}

function validateSnapshot(value: unknown, expectedUserId = 'local'): ExtensionSnapshot {
  if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.words) || !Array.isArray(value.logs) || !isRecord(value.preferences)) {
    throw new TypeError('extension storage snapshot is malformed');
  }
  if (value.preferences.motion !== 'standard' && value.preferences.motion !== 'reduced') {
    throw new TypeError('extension storage has an invalid motion preference');
  }
  const preferences = value.preferences;
  const dailyGoal = preferences.dailyGoal ?? 20;
  const voice = preferences.voice ?? 'female';
  const exerciseType = preferences.exerciseType ?? 'card';
  const selectedBookIds = preferences.selectedBookIds ?? [];
  const selectedBookIdsExplicit = preferences.selectedBookIdsExplicit ?? (Array.isArray(selectedBookIds) && selectedBookIds.length > 0);
  if (!Number.isSafeInteger(dailyGoal) || (dailyGoal as number) < 1 || (dailyGoal as number) > 200) throw new TypeError('extension storage has an invalid daily goal');
  if (voice !== 'female' && voice !== 'male') throw new TypeError('extension storage has an invalid voice preference');
  if (typeof exerciseType !== 'string' || !exerciseTypes.has(exerciseType as ExtensionExerciseType)) throw new TypeError('extension storage has an invalid exercise preference');
  if (!Array.isArray(selectedBookIds) || selectedBookIds.length > 1_000 || !selectedBookIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 200)) {
    throw new TypeError('extension storage has invalid selected book ids');
  }
  if (typeof selectedBookIdsExplicit !== 'boolean') throw new TypeError('extension storage has invalid selected book scope');
  const learningValue = isRecord(value.learning) ? value.learning : {};
  const learning = {
    books: Array.isArray(learningValue.books) ? learningValue.books : [],
    words: Array.isArray(learningValue.words) ? learningValue.words : [],
    lessons: Array.isArray(learningValue.lessons) ? learningValue.lessons : [],
    builtinContexts: Array.isArray(learningValue.builtinContexts) ? learningValue.builtinContexts : [],
    states: Array.isArray(learningValue.states) ? learningValue.states : [],
    logs: Array.isArray(learningValue.logs) ? learningValue.logs : [...value.logs],
    quizAttempts: Array.isArray(learningValue.quizAttempts) ? learningValue.quizAttempts : [],
    ...(learningValue.userSettings === undefined ? {} : { userSettings: learningValue.userSettings }),
    ...(learningValue.guestClaimedBy === undefined ? {} : { guestClaimedBy: learningValue.guestClaimedBy }),
    ...(learningValue.guestClaimedRevision === undefined ? {} : { guestClaimedRevision: learningValue.guestClaimedRevision })
  };
  const snapshot: ExtensionSnapshot = {
    schema: 1,
    words: structuredClone(value.words) as SavedWord[],
    logs: structuredClone(value.logs) as ReviewLog[],
    preferences: { motion: preferences.motion as MotionMode, dailyGoal: dailyGoal as number, voice, exerciseType: exerciseType as ExtensionExerciseType, selectedBookIds: [...selectedBookIds] as string[], selectedBookIdsExplicit },
    learning: structuredClone(learning) as ExtensionSnapshot['learning'],
    syncQueue: Array.isArray(value.syncQueue) ? structuredClone(value.syncQueue) as SyncQueueItem[] : []
  };
  const ids = new Set<string>();
  for (const saved of snapshot.words) {
    assertSavedWord(saved, expectedUserId);
    if (ids.has(saved.word.id)) throw new TypeError('extension storage contains duplicate word ids');
    ids.add(saved.word.id);
  }
  for (const log of snapshot.logs) assertReviewLog(log, expectedUserId);
  for (const book of snapshot.learning.books) assertExtensionBook(book);
  for (const lesson of snapshot.learning.lessons ?? []) {
    if (!isRecord(lesson) || typeof lesson.id !== 'string' || !lesson.id || typeof lesson.bookId !== 'string' ||
        !snapshot.learning.books.some(book => book.id === lesson.bookId) || typeof lesson.title !== 'string' || !lesson.title.trim() ||
        !Number.isSafeInteger(lesson.order) || lesson.order < 0) throw new TypeError('stored personal lesson is malformed');
  }
  snapshot.learning.builtinContexts = (snapshot.learning.builtinContexts ?? []).map(entry => {
    if (!isRecord(entry)) throw new TypeError('stored textbook contexts are malformed');
    return { bookId: boundedString(entry.bookId, '词书编号', 200, true), wordId: boundedString(entry.wordId, '词条编号', 200, true), contexts: sanitizeContexts(entry.contexts) };
  });
  const learningWordIds = new Set<string>();
  snapshot.learning.words = snapshot.learning.words.map(input => {
    const word = sanitizeWord(input);
    if (word.source !== 'manual') throw new TypeError('custom learning words must use manual source');
    if (learningWordIds.has(word.id)) throw new TypeError('extension learning contains duplicate word ids');
    learningWordIds.add(word.id);
    return word;
  });
  const stateById = new Map<string, WordState>();
  for (const state of snapshot.learning.states) {
    assertWordState(state, undefined, expectedUserId);
    if (stateById.has(state.wordId)) throw new TypeError('extension learning contains duplicate word states');
    stateById.set(state.wordId, state);
  }
  for (const saved of snapshot.words) {
    const canonical = stateById.get(saved.word.id);
    if (canonical) saved.state = structuredClone(canonical);
    else { stateById.set(saved.word.id, structuredClone(saved.state)); }
  }
  snapshot.learning.states = [...stateById.values()];
  const uniqueLogIds = new Set<string>();
  snapshot.learning.logs = [...snapshot.learning.logs, ...snapshot.logs].filter(log => {
    assertReviewLog(log, expectedUserId);
    if (uniqueLogIds.has(log.id)) return false;
    uniqueLogIds.add(log.id);
    return true;
  });
  for (const quiz of snapshot.learning.quizAttempts) assertQuizRecord(quiz);
  if (snapshot.learning.userSettings !== undefined) assertUserSettings(snapshot.learning.userSettings, expectedUserId);
  if (snapshot.learning.guestClaimedBy !== undefined && (typeof snapshot.learning.guestClaimedBy !== 'string' || !snapshot.learning.guestClaimedBy)) {
    throw new TypeError('extension storage has an invalid guest claim');
  }
  if (snapshot.learning.guestClaimedRevision !== undefined && (typeof snapshot.learning.guestClaimedRevision !== 'string' || !snapshot.learning.guestClaimedRevision)) {
    throw new TypeError('extension storage has an invalid guest claim revision');
  }
  for (const item of snapshot.syncQueue) assertQueueItem(item);
  return snapshot;
}

function cloneSnapshot(snapshot: ExtensionSnapshot): ExtensionSnapshot {
  return structuredClone(snapshot);
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const values = new Map<string, T>();
  for (const item of items) if (!values.has(item.id)) values.set(item.id, item);
  return [...values.values()];
}

function stateFor(snapshot: ExtensionSnapshot, wordId: string): WordState | undefined {
  return snapshot.learning.states.find(state => state.wordId === wordId) ?? snapshot.words.find(saved => saved.word.id === wordId)?.state;
}

function writeState(snapshot: ExtensionSnapshot, state: WordState): void {
  const index = snapshot.learning.states.findIndex(entry => entry.wordId === state.wordId);
  if (index < 0) snapshot.learning.states.push(state);
  else snapshot.learning.states[index] = state;
  const saved = snapshot.words.find(entry => entry.word.id === state.wordId);
  if (saved) saved.state = structuredClone(state);
}

function writeLog(snapshot: ExtensionSnapshot, log: ReviewLog, includeLegacy: boolean): void {
  if (!snapshot.learning.logs.some(entry => entry.id === log.id)) snapshot.learning.logs.push(log);
  if (includeLegacy && !snapshot.logs.some(entry => entry.id === log.id)) snapshot.logs.push(log);
}

function isManualWord(snapshot: ExtensionSnapshot, wordId: string, word?: ExtensionWord): boolean {
  if (word?.source === 'manual') return true;
  if (snapshot.learning.words.some(entry => entry.id === wordId)) return true;
  return snapshot.learning.books.some(book => book.source === 'manual' && (snapshot.learning.words.some(entry => entry.id === wordId && bookIdForWord(entry) === book.id)));
}

function syncableState(state: WordState): Record<string, unknown> {
  return {
    _id: `${state.userId}:${state.wordId}`,
    ...state,
    updatedAt: state.updatedAt ?? state.lastReviewedAt ?? state.firstSeenAt ?? state.difficultUpdatedAt ?? state.ignoredUpdatedAt ?? '1970-01-01T00:00:00.000Z',
    card: { ...state.card, due: state.card.due.toISOString(), last_review: state.card.last_review?.toISOString() },
    version: 1
  };
}

function syncableEvent(log: ReviewLog): ReviewEvent {
  return {
    _id: log.id,
    userId: log.userId,
    wordId: log.wordId,
    reviewedAt: log.reviewedAt,
    rating: log.rating,
    responseTime: log.responseTime,
    studyMode: log.studyMode,
    ...(log.quiz ? { quiz: log.quiz } : {}),
    clientCreatedAt: log.clientCreatedAt ?? log.reviewedAt,
    ...(log.serverReceivedAt ? { serverReceivedAt: log.serverReceivedAt } : {})
  };
}

function enqueue(snapshot: ExtensionSnapshot, item: SyncQueueItem): void {
  const existing = snapshot.syncQueue.find(entry => entry.id === item.id);
  if (!existing) snapshot.syncQueue.push(item);
}

function queueReview(snapshot: ExtensionSnapshot, log: ReviewLog, state: WordState): void {
  enqueue(snapshot, { id: log.id, type: 'review_event', payload: syncableEvent(log), createdAt: log.clientCreatedAt ?? log.reviewedAt, retries: 0 });
  const updatedAt = state.updatedAt ?? log.reviewedAt;
  enqueue(snapshot, { id: crypto.randomUUID(), type: 'progress', payload: syncableState(state), createdAt: updatedAt, retries: 0 });
}

function queueProgress(snapshot: ExtensionSnapshot, state: WordState): void {
  const updatedAt = state.updatedAt ?? state.lastReviewedAt ?? new Date(0).toISOString();
  enqueue(snapshot, { id: crypto.randomUUID(), type: 'progress', payload: syncableState(state), createdAt: updatedAt, retries: 0 });
}

function queueSettings(snapshot: ExtensionSnapshot, settings: UserSettings): void {
  enqueue(snapshot, { id: crypto.randomUUID(), type: 'settings', payload: structuredClone(settings), createdAt: settings.updatedAt, retries: 0 });
}

function mapStateUser(state: WordState, userId: string): WordState {
  return { ...structuredClone(state), userId };
}

function mapLogUser(log: ReviewLog, userId: string): ReviewLog {
  return { ...structuredClone(log), userId, previousState: mapStateUser(log.previousState, userId), newState: mapStateUser(log.newState, userId) };
}

function mapWord(word: ExtensionWord): Word {
  const { source: _source, bookId: _bookId, bookTitle: _bookTitle, lessonTitle: _lessonTitle, ...plainWord } = structuredClone(word);
  return plainWord;
}

function uniqueWordList(words: ExtensionWord[]): ExtensionWord[] {
  const byId = new Map<string, ExtensionWord>();
  for (const word of words) if (!byId.has(word.id)) byId.set(word.id, word);
  return [...byId.values()];
}

/** Convert one extension partition to the shared sync reconciliation shape. */
export function snapshotToData(snapshot: ExtensionSnapshot, userId: string, catalogWords: ExtensionWord[] = []): Data {
  const data = emptyData();
  const extensionWords = uniqueWordList([...catalogWords, ...snapshot.learning.words, ...snapshot.words.map(saved => saved.word)]);
  const learningBooks = listLearningBooks(extensionWords, snapshot.learning.books);
  const createdAt = snapshot.learning.userSettings?.updatedAt ?? '1970-01-01T00:00:00.000Z';
  data.books = learningBooks.map(book => ({
    id: book.id,
    title: book.title,
    description: book.description,
    language: 'ja',
    createdAt: book.createdAt ?? createdAt,
    updatedAt: book.updatedAt ?? book.createdAt ?? createdAt
  } satisfies Book));
  const lessons = new Map<string, Lesson>();
  for (const word of extensionWords) {
    const existing = lessons.get(word.lessonId);
    if (!existing) lessons.set(word.lessonId, { id: word.lessonId, bookId: bookIdForWord(word), title: word.lessonTitle, order: word.order });
    else existing.order = Math.min(existing.order, word.order);
  }
  for (const lesson of snapshot.learning.lessons ?? []) lessons.set(lesson.id, structuredClone(lesson));
  data.lessons = [...lessons.values()].sort((a, b) => a.bookId.localeCompare(b.bookId) || a.order - b.order || a.id.localeCompare(b.id));
  data.words = extensionWords.map(mapWord);
  const stateById = new Map<string, WordState>();
  for (const state of snapshot.learning.states) stateById.set(state.wordId, mapStateUser(state, userId));
  for (const saved of snapshot.words) if (!stateById.has(saved.word.id)) stateById.set(saved.word.id, mapStateUser(saved.state, userId));
  data.states = [...stateById.values()];
  const logsById = new Map<string, ReviewLog>();
  for (const log of [...snapshot.learning.logs, ...snapshot.logs]) if (!logsById.has(log.id)) logsById.set(log.id, mapLogUser(log, userId));
  data.logs = [...logsById.values()];
  const settings = snapshot.learning.userSettings;
  if (settings) {
    data.userSettings = { ...structuredClone(settings), userId };
    if (settings.currentBookId) data.currentBookId = settings.currentBookId;
    data.currentBookIdSource = settings.currentBookIdSource;
    data.currentBookIdUpdatedAt = settings.updatedAt;
  }
  data.seeded = true;
  return data;
}

function snapshotFromData(snapshot: ExtensionSnapshot, data: Data, userId: string, catalogWords: ExtensionWord[] = []): void {
  const states = new Map<string, WordState>();
  for (const state of data.states) states.set(state.wordId, mapStateUser(state, userId));
  snapshot.learning.states = [...states.values()];
  for (const saved of snapshot.words) {
    const state = states.get(saved.word.id);
    if (state) saved.state = structuredClone(state);
  }
  const logs = new Map<string, ReviewLog>();
  for (const log of data.logs) if (!logs.has(log.id)) logs.set(log.id, mapLogUser(log, userId));
  snapshot.learning.logs = [...logs.values()];
  snapshot.logs = [...logs.values()];
  const attempts = new Map(snapshot.learning.quizAttempts.map(attempt => [attempt.id, attempt]));
  for (const log of logs.values()) {
    if (!log.quiz || attempts.has(log.id)) continue;
    attempts.set(log.id, { ...log.quiz, id: log.id, requestId: log.id, wordId: log.wordId, elapsedMs: log.responseTime, recordedAt: log.reviewedAt });
  }
  snapshot.learning.quizAttempts = [...attempts.values()];
  if (data.userSettings) {
    snapshot.learning.userSettings = { ...structuredClone(data.userSettings), userId };
    const voice = data.userSettings.preferences?.pronunciationVoice;
    if (voice) snapshot.preferences.voice = voice;
    if (data.userSettings.currentBookIdSource === 'user' && !snapshot.preferences.selectedBookIdsExplicit) {
      snapshot.preferences.selectedBookIds = data.userSettings.currentBookId ? [data.userSettings.currentBookId] : [];
    }
  }
  if (data.currentBookId && data.currentBookIdSource === 'user' && !snapshot.preferences.selectedBookIdsExplicit) {
    snapshot.preferences.selectedBookIds = [data.currentBookId];
  }

  // Textbook favorites are the extension's view of the shared difficult flag.
  // Keep manual lookup favorites separate, and materialize catalog entries
  // flagged on another client without changing their FSRS progress.
  const words = uniqueWordList([
    ...catalogWords,
    ...snapshot.learning.words,
    ...snapshot.words.map(saved => saved.word)
  ]);
  const existingManual = snapshot.words.filter(saved => saved.word.source === 'manual');
  const savedById = new Map(existingManual.map(saved => [saved.word.id, saved]));
  for (const word of words) {
    if (word.source !== 'textbook') continue;
    const state = states.get(word.id);
    if (!state?.isDifficult) continue;
    const existing = savedById.get(word.id);
    if (existing) {
      existing.word = structuredClone(word);
      existing.state = structuredClone(state);
    } else {
      const saved: SavedWord = {
        word: structuredClone(word),
        savedAt: state.difficultUpdatedAt ?? state.updatedAt ?? new Date().toISOString(),
        state: structuredClone(state)
      };
      savedById.set(word.id, saved);
    }
  }
  snapshot.words = [...savedById.values()];
}

function progressFromState(state: WordState, userId: string): Record<string, unknown> {
  return { ...syncableState(mapStateUser(state, userId)), userId };
}

function eventFromLog(log: ReviewLog, userId: string): ReviewEvent {
  return syncableEvent(mapLogUser(log, userId));
}

function remapQueueItem(item: SyncQueueItem, userId: string): SyncQueueItem {
  const payload = isRecord(item.payload) ? { ...item.payload, userId } : item.payload;
  return { ...structuredClone(item), payload };
}

function manualWordIds(snapshot: ExtensionSnapshot): Set<string> {
  return new Set([...snapshot.learning.words.map(word => word.id), ...snapshot.words.filter(saved => saved.word.source === 'manual').map(saved => saved.word.id)]);
}

function guestContentRevision(snapshot: ExtensionSnapshot): string {
  const content = cloneSnapshot(snapshot);
  delete content.identity;
  delete content.learning.guestClaimedBy;
  delete content.learning.guestClaimedRevision;
  return JSON.stringify(content);
}

export class ExtensionStorageError extends Error {
  constructor(readonly code: 'storage_corrupt' | 'storage_unavailable', cause?: unknown) {
    super(
      code === 'storage_corrupt'
        ? '扩展本地数据损坏或格式不兼容，现有数据未被覆盖。'
        : '暂时无法读取或保存扩展本地数据，请稍后重试。',
      { cause }
    );
    this.name = 'ExtensionStorageError';
  }
}

export class StaleReviewError extends Error {
  readonly code = 'stale_review';

  constructor() {
    super('这张复习卡已更新，请刷新当前卡片后再评分。');
    this.name = 'StaleReviewError';
  }
}

export class SavedWordNotFoundError extends Error {
  readonly code = 'saved_word_not_found';

  constructor(_wordId: string) {
    super('这张生词卡已删除或不可用，请返回生词本。');
    this.name = 'SavedWordNotFoundError';
  }
}

export class InvalidRatingError extends Error {
  readonly code = 'invalid_rating';

  constructor() {
    super('评分无效，请选择 1 到 4。');
    this.name = 'InvalidRatingError';
  }
}

export class DuplicateReviewRequestError extends Error {
  readonly code = 'duplicate_review_request';

  constructor() {
    super('复习请求编号重复，但评分内容不一致，请刷新当前卡片后重试。');
    this.name = 'DuplicateReviewRequestError';
  }
}

export class DuplicateQuizAttemptRequestError extends Error {
  readonly code = 'duplicate_quiz_request';
  constructor() { super('测验请求编号重复，但作答内容不一致，请刷新题目后重试。'); this.name = 'DuplicateQuizAttemptRequestError'; }
}

export class LearningWordNotFoundError extends Error {
  readonly code = 'learning_word_not_found';
  constructor(id: string) { super(`学习词条不存在或已过期：${id}`); this.name = 'LearningWordNotFoundError'; }
}

export class RepositoryIdentityError extends Error {
  readonly code = 'repository_identity_mismatch';
  constructor() { super('扩展账号已切换，请刷新后重试。'); this.name = 'RepositoryIdentityError'; }
}

export class GuestAlreadyClaimedError extends Error {
  readonly code = 'guest_already_claimed';
  constructor() { super('游客数据已合并到另一个账号，不能再次导入。'); this.name = 'GuestAlreadyClaimedError'; }
}

export class ExtensionRepository {
  private databasePromise: Promise<IDBPDatabase<ExtensionSchema>> | null = null;
  readonly partitionKey: string;
  readonly userId: string;

  constructor(private readonly databaseName = DEFAULT_DATABASE_NAME, partitionKey = 'current') {
    if (partitionKey !== 'current' && !/^account:.{1,200}$/.test(partitionKey)) throw new TypeError('repository partitionKey is invalid');
    this.partitionKey = partitionKey;
    this.userId = partitionKey === 'current' ? 'local' : partitionKey.slice('account:'.length);
  }

  private withIdentity(snapshot: ExtensionSnapshot): ExtensionSnapshot {
    return { ...cloneSnapshot(snapshot), identity: { partitionKey: this.partitionKey, userId: this.userId } };
  }

  private storedSnapshot(snapshot: ExtensionSnapshot): ExtensionSnapshot {
    const copy = cloneSnapshot(snapshot);
    delete copy.identity;
    return copy;
  }

  private database(): Promise<IDBPDatabase<ExtensionSchema>> {
    if (!this.databasePromise) {
      this.databasePromise = openDB<ExtensionSchema>(this.databaseName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        }
      }).catch(error => {
        this.databasePromise = null;
        throw new ExtensionStorageError('storage_unavailable', error);
      });
    }
    return this.databasePromise;
  }

  async read(): Promise<ExtensionSnapshot> {
    const db = await this.database();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const done = tx.done;
    try {
      const stored = await tx.store.get(this.partitionKey);
      await done;
      if (stored === undefined) return this.withIdentity(emptySnapshot());
      try {
        return this.withIdentity(validateSnapshot(stored, this.userId));
      } catch (error) {
        throw new ExtensionStorageError('storage_corrupt', error);
      }
    } catch (error) {
      await done.catch(() => undefined);
      if (error instanceof ExtensionStorageError) throw error;
      throw new ExtensionStorageError('storage_unavailable', error);
    }
  }

  private async update(change: (snapshot: ExtensionSnapshot) => boolean, expectedPartitionKey?: string): Promise<ExtensionSnapshot> {
    if (expectedPartitionKey !== undefined && expectedPartitionKey !== this.partitionKey) throw new RepositoryIdentityError();
    const db = await this.database();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const done = tx.done;
    try {
      const stored = await tx.store.get(this.partitionKey);
      let snapshot: ExtensionSnapshot;
      if (stored === undefined) {
        snapshot = emptySnapshot();
      } else {
        try {
          snapshot = validateSnapshot(stored, this.userId);
        } catch (error) {
          throw new ExtensionStorageError('storage_corrupt', error);
        }
      }
      const changed = change(snapshot);
      if (changed) {
        try {
          snapshot = validateSnapshot(snapshot, this.userId);
        } catch (error) {
          throw new ExtensionStorageError('storage_corrupt', error);
        }
        await tx.store.put(this.storedSnapshot(snapshot), this.partitionKey);
      }
      await done;
      return this.withIdentity(snapshot);
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => undefined);
      if (error instanceof ExtensionStorageError || error instanceof StaleReviewError || error instanceof SavedWordNotFoundError || error instanceof InvalidRatingError || error instanceof DuplicateReviewRequestError || error instanceof DuplicateQuizAttemptRequestError || error instanceof LearningWordNotFoundError || error instanceof RepositoryIdentityError || error instanceof GuestAlreadyClaimedError || error instanceof TypeError || error instanceof RangeError || error instanceof Error && !(error instanceof DOMException)) {
        throw error;
      }
      throw new ExtensionStorageError('storage_unavailable', error);
    }
  }

  async save(input: ExtensionWord, sourceHost?: string): Promise<ExtensionSnapshot> {
    const word = sanitizeWord(input);
    const normalizedHost = normalizeSourceHost(sourceHost);
    return this.update(snapshot => {
      if (snapshot.words.some(saved => saved.word.id === word.id)) return false;
      const now = new Date();
      const state = stateFor(snapshot, word.id) ?? {
        ...initialState(word.id, now, this.userId),
        bookId: bookIdForWord(word),
        lessonId: word.lessonId
      };
      if (word.source === 'textbook') {
        state.isDifficult = true;
        state.difficultUpdatedAt = now.toISOString();
        state.updatedAt = now.toISOString();
      }
      const saved: SavedWord = { word, savedAt: now.toISOString(), state: structuredClone(state) };
      if (normalizedHost) saved.sourceHost = normalizedHost;
      snapshot.words.push(saved);
      writeState(snapshot, state);
      if (this.userId !== 'local' && word.source === 'textbook') queueProgress(snapshot, state);
      return true;
    });
  }

  async remove(wordId: string): Promise<ExtensionSnapshot> {
    const id = boundedString(wordId, 'wordId', wordStringLimits.id, true);
    return this.update(snapshot => {
      const index = snapshot.words.findIndex(saved => saved.word.id === id);
      if (index < 0) return false;
      const saved = snapshot.words[index];
      snapshot.words.splice(index, 1);
      if (saved.word.source === 'textbook') {
        const state = stateFor(snapshot, id) ?? saved.state;
        const now = new Date().toISOString();
        state.isDifficult = false;
        state.difficultUpdatedAt = now;
        state.updatedAt = now;
        state.userId = this.userId;
        writeState(snapshot, state);
        if (this.userId !== 'local') queueProgress(snapshot, state);
      }
      return true;
    });
  }

  async rate(wordId: string, rating: 1 | 2 | 3 | 4, requestId: string, expectedReviewCount: number): Promise<ExtensionSnapshot> {
    const id = boundedString(wordId, 'wordId', wordStringLimits.id, true);
    const logId = boundedString(requestId, '复习请求编号', 200, true);
    if (!Number.isInteger(rating) || rating < 1 || rating > 4) throw new InvalidRatingError();
    if (!Number.isSafeInteger(expectedReviewCount) || expectedReviewCount < 0) throw new TypeError('复习进度参数无效，请刷新后重试。');

    return this.update(snapshot => {
      const priorRequest = [...snapshot.learning.logs, ...snapshot.logs].find(log => log.id === logId);
      if (priorRequest) {
        if (priorRequest.wordId === id && priorRequest.rating === rating && priorRequest.previousState.reviewCount === expectedReviewCount) return false;
        throw new DuplicateReviewRequestError();
      }
      const saved = snapshot.words.find(entry => entry.word.id === id);
      if (!saved) throw new SavedWordNotFoundError(id);
      const previous = stateFor(snapshot, id) ?? saved.state;
      if (previous.reviewCount !== expectedReviewCount) throw new StaleReviewError();
      const mode: LearningMode = previous.firstSeenAt || previous.reviewCount > 0 ? 'review' : 'new';
      const result = evaluate(previous, rating as Grade, mode, new Date(), logId);
      result.state.userId = this.userId;
      result.log.userId = this.userId;
      writeState(snapshot, result.state);
      writeLog(snapshot, result.log, true);
      if (this.userId !== 'local' && saved.word.source === 'textbook') queueReview(snapshot, result.log, result.state);
      return true;
    });
  }

  async setMotion(mode: MotionMode): Promise<ExtensionSnapshot> {
    if (mode !== 'standard' && mode !== 'reduced') throw new TypeError('动效设置无效。');
    return this.update(snapshot => {
      if (snapshot.preferences.motion === mode) return false;
      snapshot.preferences.motion = mode;
      return true;
    });
  }

  async getLearningQueue(words: ExtensionWord[], options: StudyQueueOptions): Promise<ReturnType<typeof buildStudyQueue>> {
    const catalog = words.map(sanitizeWord);
    const snapshot = await this.read();
    const allWords = uniqueWordList([...catalog, ...snapshot.learning.words]);
    return buildStudyQueue(allWords, snapshot.learning.states, { ...options, now: options.now ? new Date(options.now) : new Date() });
  }

  async rateLearning(
    input: ExtensionWord,
    rating: 1 | 2 | 3 | 4,
    requestId: string,
    expectedReviewCount: number,
    mode: LearningMode,
    elapsedMs: number,
    quizRequestId?: string | null,
    sceneId?: string | null,
    feedbackPractice?: boolean | null,
    personalContextId?: string | null
  ): Promise<ExtensionSnapshot> {
    const word = sanitizeWord(input);
    const logId = boundedString(requestId, '复习请求编号', 200, true);
    const linkedQuizId = quizRequestId == null ? undefined : boundedString(quizRequestId, '测验请求编号', 200, true);
    const scenePractice = sceneId != null && !!sceneExampleFor(sceneId, word);
    if (sceneId != null && !scenePractice) throw new TypeError('场景与词条不匹配，请重新开始这个场景。');
    if (feedbackPractice != null && (typeof feedbackPractice !== 'boolean' || feedbackPractice && mode !== 'difficult')) throw new TypeError('巩固练习上下文无效。');
    const selectedPersonalContextId = personalContextId == null ? undefined : boundedString(personalContextId, '原句编号', 200, true);
    if (selectedPersonalContextId && mode !== 'difficult') throw new TypeError('个人原句练习上下文无效。');
    if (!Number.isInteger(rating) || rating < 1 || rating > 4) throw new InvalidRatingError();
    if (!Number.isSafeInteger(expectedReviewCount) || expectedReviewCount < 0) throw new TypeError('复习进度参数无效，请刷新后重试。');
    if (!['new', 'review', 'difficult'].includes(mode)) throw new TypeError('学习模式无效。');
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 3_600_000) throw new TypeError('作答时长无效。');

    return this.update(snapshot => {
      const priorRequest = [...snapshot.learning.logs, ...snapshot.logs].find(log => log.id === logId);
      if (priorRequest) {
        if (priorRequest.wordId === word.id && priorRequest.rating === rating && priorRequest.responseTime === elapsedMs &&
            priorRequest.studyMode === mode && priorRequest.previousState.reviewCount === expectedReviewCount &&
            (!linkedQuizId || priorRequest.quiz?.prompt === snapshot.learning.quizAttempts.find(attempt => attempt.requestId === linkedQuizId)?.prompt)) return false;
        throw new DuplicateReviewRequestError();
      }
      const selectedPersonalContext = selectedPersonalContextId
        ? savedReadingContexts(snapshot, word).find(context => context.id === selectedPersonalContextId)
        : undefined;
      const personalContextPractice = !!selectedPersonalContext && !!contextClozeExample(word, selectedPersonalContext);
      if (selectedPersonalContextId && !personalContextPractice) throw new StaleReviewError();
      const now = new Date();
      const previous = stateFor(snapshot, word.id) ?? {
        ...initialState(word.id, now, this.userId),
        bookId: bookIdForWord(word),
        lessonId: word.lessonId
      };
      if (previous.reviewCount !== expectedReviewCount) throw new StaleReviewError();
      if (mode === 'new' && (previous.firstSeenAt || previous.reviewCount > 0)) throw new StaleReviewError();
      if (mode === 'review' && (!previous.nextReviewAt || new Date(previous.nextReviewAt).getTime() > now.getTime())) throw new StaleReviewError();
      if (mode === 'difficult' && !previous.isDifficult && !scenePractice && !personalContextPractice && !(feedbackPractice && canFeedbackPractice({ ...snapshot, identity: { partitionKey: this.partitionKey, userId: this.userId } }, word.id, now))) throw new StaleReviewError();
      if (previous.isIgnored) throw new StaleReviewError();

      const result = evaluate(previous, rating as Grade, mode, now, logId, elapsedMs);
      result.state.userId = this.userId;
      result.state.bookId = previous.bookId ?? bookIdForWord(word);
      result.state.lessonId = previous.lessonId ?? word.lessonId;
      result.log.userId = this.userId;
      if (linkedQuizId) {
        const quiz = snapshot.learning.quizAttempts.find(attempt => attempt.requestId === linkedQuizId);
        if (!quiz || quiz.wordId !== word.id) throw new LearningWordNotFoundError(word.id);
        result.log.quiz = { type: quiz.type, prompt: quiz.prompt, options: [...quiz.options], selected: quiz.selected, correct: quiz.correct, isCorrect: quiz.isCorrect };
      }
      writeState(snapshot, result.state);
      writeLog(snapshot, result.log, snapshot.words.some(saved => saved.word.id === word.id));
      if (this.userId !== 'local' && word.source === 'textbook') queueReview(snapshot, result.log, result.state);
      return true;
    });
  }

  async setLearningFlags(wordId: string, patch: LearningFlagPatch, input: ExtensionWord): Promise<ExtensionSnapshot> {
    const id = boundedString(wordId, 'wordId', wordStringLimits.id, true);
    const word = sanitizeWord(input);
    if (word.id !== id || !isRecord(patch) || Object.keys(patch).some(key => key !== 'isDifficult' && key !== 'isIgnored') ||
        Object.keys(patch).length === 0 || Object.values(patch).some(value => typeof value !== 'boolean')) throw new TypeError('学习标记参数无效。');
    const flags = patch as LearningFlagPatch;
    return this.update(snapshot => {
      const now = new Date();
      const state = stateFor(snapshot, id) ?? { ...initialState(id, now, this.userId), bookId: bookIdForWord(word), lessonId: word.lessonId };
      let changed = false;
      if (flags.isDifficult !== undefined && state.isDifficult !== flags.isDifficult) {
        state.isDifficult = flags.isDifficult;
        state.difficultUpdatedAt = now.toISOString();
        changed = true;
      }
      if (flags.isIgnored !== undefined && state.isIgnored !== flags.isIgnored) {
        state.isIgnored = flags.isIgnored;
        state.ignoredUpdatedAt = now.toISOString();
        changed = true;
      }
      if (!changed) return false;
      state.userId = this.userId;
      state.bookId ??= bookIdForWord(word);
      state.lessonId ??= word.lessonId;
      state.updatedAt = now.toISOString();
      writeState(snapshot, state);
      if (this.userId !== 'local' && word.source === 'textbook') queueProgress(snapshot, state);
      return true;
    });
  }

  async recordQuizAttempt(input: QuizAttemptInput): Promise<ExtensionSnapshot> {
    if (!isRecord(input)) throw new TypeError('quiz attempt must be an object');
    const word = sanitizeWord(input.word);
    const requestId = boundedString(input.requestId, '测验请求编号', 200, true);
    const wordId = boundedString(input.wordId, 'wordId', wordStringLimits.id, true);
    const inputQuiz = isInputQuizType(input.type);
    const optionsValid = Array.isArray(input.options) && (inputQuiz
      ? input.options.length === 0
      : input.options.length >= 2 && input.options.length <= 10 && input.options.every(option => typeof option === 'string' && option.length > 0 && option.length <= 1_000));
    const answersValid = typeof input.correct === 'string' && (inputQuiz || input.options.includes(input.correct)) &&
      (input.selected === null || typeof input.selected === 'string' && (inputQuiz || input.options.includes(input.selected)));
    if (word.id !== wordId || typeof input.type !== 'string' || !quizTypes.has(input.type as QuizType) || typeof input.prompt !== 'string' || input.prompt.length > 1_000 ||
        !optionsValid || (input.selected !== null && typeof input.selected !== 'string') || !answersValid ||
        !Number.isFinite(input.elapsedMs) || input.elapsedMs < 0 || input.elapsedMs > 3_600_000) {
      throw new TypeError('测验作答内容无效。');
    }
    const attempt: ExtensionQuizAttempt = {
      id: requestId,
      requestId,
      wordId,
      type: input.type,
      prompt: input.prompt,
      options: [...input.options],
      selected: input.selected,
      correct: input.correct,
      isCorrect: quizAnswerIsCorrect(input.type, input.selected, input.correct),
      elapsedMs: input.elapsedMs,
      recordedAt: new Date().toISOString()
    };
    return this.update(snapshot => {
      const prior = snapshot.learning.quizAttempts.find(entry => entry.requestId === requestId);
      if (prior) {
        if (prior.wordId === attempt.wordId && prior.type === attempt.type && prior.prompt === attempt.prompt && prior.correct === attempt.correct &&
            prior.selected === attempt.selected && prior.elapsedMs === attempt.elapsedMs && JSON.stringify(prior.options) === JSON.stringify(attempt.options)) return false;
        throw new DuplicateQuizAttemptRequestError();
      }
      snapshot.learning.quizAttempts.push(attempt);
      return true;
    });
  }

  async importCustomBook(input: { text: string; format: 'csv' | 'json'; title: string }): Promise<ExtensionSnapshot> {
    if (!isRecord(input) || typeof input.text !== 'string' || input.text.length > 5_000_000 || !['csv', 'json'].includes(input.format)) {
      throw new TypeError('导入文件无效或过大。');
    }
    const title = boundedString(input.title, '词书名称', 200, true).trim();
    const rows = parseImport(input.text, input.format);
    const now = new Date();
    const imported = emptyData();
    const idFactory = () => crypto.randomUUID();
    const bookId = importBook(imported, rows, title, idFactory, now);
    const lessons = new Map(imported.lessons.map(lesson => [lesson.id, lesson]));
    const words = imported.words.map(raw => {
      const lesson = lessons.get(raw.lessonId);
      if (!lesson) throw new TypeError('导入词条缺少课次。');
      return sanitizeWord({
        ...raw,
        lessonId: `${bookId}-l-${lesson.order}`,
        source: 'manual',
        bookTitle: title,
        lessonTitle: lesson.title
      } as ExtensionWord);
    });
    const book: ExtensionBook = { id: bookId, title, description: '', wordCount: words.length, source: 'manual', createdAt: now.toISOString() };
    return this.update(snapshot => {
      if (snapshot.learning.books.some(existing => existing.id === bookId)) throw new Error('导入词书编号冲突，请重试。');
      snapshot.learning.books.push(book);
      snapshot.learning.words.push(...words);
      snapshot.learning.lessons = [...(snapshot.learning.lessons ?? []), ...imported.lessons.map(lesson => ({ ...lesson, id: `${bookId}-l-${lesson.order}` }))];
      return true;
    });
  }

  async mutatePersonalLibrary(action: PersonalLibraryMutation, catalog: ExtensionWord[]): Promise<ExtensionSnapshot> {
    return this.update(snapshot => {
      applyPersonalLibraryMutation(snapshot, catalog, action, { now: new Date().toISOString(), createId: () => crypto.randomUUID() });
      return true;
    });
  }

  async setDailyGoal(goal: number): Promise<ExtensionSnapshot> {
    if (!Number.isSafeInteger(goal) || goal < 1 || goal > 200) throw new TypeError('每日目标需为 1 到 200。');
    return this.update(snapshot => {
      if (snapshot.preferences.dailyGoal === goal) return false;
      snapshot.preferences.dailyGoal = goal;
      return true;
    });
  }

  async setVoice(voice: 'female' | 'male'): Promise<ExtensionSnapshot> {
    if (voice !== 'female' && voice !== 'male') throw new TypeError('发音人设置无效。');
    return this.update(snapshot => {
      if (snapshot.preferences.voice === voice && snapshot.learning.userSettings?.preferences?.pronunciationVoice === voice) return false;
      const now = new Date().toISOString();
      snapshot.preferences.voice = voice;
      const previous = snapshot.learning.userSettings;
      snapshot.learning.userSettings = { ...previous, userId: this.userId, preferences: { ...previous?.preferences, pronunciationVoice: voice }, updatedAt: now };
      if (this.userId !== 'local') queueSettings(snapshot, snapshot.learning.userSettings);
      return true;
    });
  }

  async setExerciseType(type: ExtensionExerciseType): Promise<ExtensionSnapshot> {
    if (!exerciseTypes.has(type)) throw new TypeError('练习模式无效。');
    return this.update(snapshot => {
      if (snapshot.preferences.exerciseType === type) return false;
      snapshot.preferences.exerciseType = type;
      return true;
    });
  }

  async setSelectedBookIds(ids: string[]): Promise<ExtensionSnapshot> {
    if (!Array.isArray(ids) || ids.length > 1_000 || !ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 200)) throw new TypeError('词书选择无效。');
    const selectedBookIds = [...new Set(ids)];
    return this.update(snapshot => {
      if (JSON.stringify(snapshot.preferences.selectedBookIds) === JSON.stringify(selectedBookIds) && snapshot.preferences.selectedBookIdsExplicit) return false;
      snapshot.preferences.selectedBookIds = selectedBookIds;
      snapshot.preferences.selectedBookIdsExplicit = true;
      const currentBookId = selectedBookIds[0];
      // Preserve the existing single current-book cloud setting for clients
      // that understand it; the full multi-select range stays local.
      if (currentBookId) {
        const now = new Date().toISOString();
        const previous = snapshot.learning.userSettings;
        snapshot.learning.userSettings = { ...previous, userId: this.userId, currentBookId, currentBookIdSource: 'user', updatedAt: now };
        if (this.userId !== 'local') queueSettings(snapshot, snapshot.learning.userSettings);
      }
      return true;
    });
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return (await this.read()).syncQueue;
  }

  async enqueueSync(items: SyncQueueItem[]): Promise<void> {
    for (const item of items) assertQueueItem(item);
    await this.update(snapshot => {
      let changed = false;
      for (const item of items) {
        if (snapshot.syncQueue.some(existing => existing.id === item.id)) continue;
        snapshot.syncQueue.push(structuredClone(item));
        changed = true;
      }
      return changed;
    });
  }

  async dequeueSync(ids: string[]): Promise<number> {
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) throw new TypeError('sync queue ids are invalid');
    let removed = 0;
    await this.update(snapshot => {
      const accepted = new Set(ids);
      const remaining = snapshot.syncQueue.filter(item => {
        if (!accepted.has(item.id)) return true;
        removed++;
        return false;
      });
      snapshot.syncQueue = remaining;
      return removed > 0;
    });
    return removed;
  }

  async mergeCloud(pulled: unknown, expectedUserId: string, catalogWords: ExtensionWord[] = []): Promise<ExtensionSnapshot> {
    if (this.partitionKey !== `account:${expectedUserId}` || this.userId !== expectedUserId) throw new RepositoryIdentityError();
    const validated: ValidatedSyncPull = validateSyncPull(pulled, expectedUserId);
    const safeCatalog = catalogWords.map(sanitizeWord);
    return this.update(snapshot => {
      const local = snapshotToData(snapshot, expectedUserId, safeCatalog);
      const merged = reconcileMiniProgramData(local, validated, snapshot.syncQueue);
      snapshotFromData(snapshot, merged, expectedUserId, safeCatalog);
      return true;
    });
  }

  async mergeGuest(expectedUserId: string, catalogWords: ExtensionWord[] = []): Promise<ExtensionSnapshot> {
    if (this.partitionKey !== `account:${expectedUserId}` || this.userId !== expectedUserId) throw new RepositoryIdentityError();
    const safeCatalog = catalogWords.map(sanitizeWord);
    const db = await this.database();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const done = tx.done;
    try {
      const [accountRaw, guestRaw] = await Promise.all([tx.store.get(this.partitionKey), tx.store.get('current')]);
      const account = accountRaw === undefined ? emptySnapshot() : validateSnapshot(accountRaw, expectedUserId);
      if (guestRaw === undefined) { await done; return this.withIdentity(account); }
      const guest = validateSnapshot(guestRaw, 'local');
      if (guest.learning.guestClaimedBy && guest.learning.guestClaimedBy !== expectedUserId) throw new GuestAlreadyClaimedError();
      const migrationTime = new Date().toISOString();
      for (const saved of guest.words) {
        if (saved.word.source !== 'textbook') continue;
        const state = stateFor(guest, saved.word.id);
        if (state && !state.isDifficult) {
          state.isDifficult = true;
          state.difficultUpdatedAt = migrationTime;
          writeState(guest, state);
        }
      }
      const claimedRevision = guestContentRevision(guest);

      const accountData = snapshotToData(account, expectedUserId, safeCatalog);
      const guestData = snapshotToData(guest, expectedUserId, safeCatalog);
      const mergeItems = <T extends { id: string }>(primary: T[], secondary: T[]) => {
        const values = new Map(primary.map(item => [item.id, item]));
        for (const item of secondary) if (!values.has(item.id)) values.set(item.id, item);
        return [...values.values()];
      };
      accountData.books = mergeItems(accountData.books, guestData.books);
      accountData.lessons = mergeItems(accountData.lessons, guestData.lessons);
      accountData.words = mergeItems(accountData.words, guestData.words);
      const accountStateIds = new Set(accountData.states.map(state => state.wordId));
      const manualIds = manualWordIds(guest);
      for (const state of guestData.states) {
        if (!accountStateIds.has(state.wordId)) {
          accountData.states.push(state);
          accountStateIds.add(state.wordId);
        }
      }
      // Preserve the converted guest favorite even when an account-side state
      // already exists; only the difficult flag timestamp is imported.
      for (const saved of guest.words) {
        if (saved.word.source !== 'textbook') continue;
        const guestState = guestData.states.find(candidate => candidate.wordId === saved.word.id);
        const accountState = accountData.states.find(candidate => candidate.wordId === saved.word.id);
        if (guestState && accountState && guestState.difficultUpdatedAt &&
            (!accountState.difficultUpdatedAt || Date.parse(guestState.difficultUpdatedAt) >= Date.parse(accountState.difficultUpdatedAt))) {
          accountState.isDifficult = true;
          accountState.difficultUpdatedAt = guestState.difficultUpdatedAt;
        }
      }
      accountData.logs = mergeItems(accountData.logs, guestData.logs);

      const guestProgress = guestData.states.filter(state => !manualIds.has(state.wordId)).map(state => progressFromState(state, expectedUserId));
      const guestEvents = guestData.logs.filter(log => !manualIds.has(log.wordId)).map(log => eventFromLog(log, expectedUserId));
      const settings = guestData.userSettings ? { ...guestData.userSettings, userId: expectedUserId } : undefined;
      const pull = validateSyncPull({ userId: expectedUserId, progress: guestProgress, events: guestEvents, settings, serverTime: new Date().toISOString() }, expectedUserId);
      const guestQueue = guest.syncQueue.filter(item => {
        if (item.type === 'progress' || item.type === 'review_event') {
          const wordId = isRecord(item.payload) && typeof item.payload.wordId === 'string' ? item.payload.wordId : '';
          return !manualIds.has(wordId);
        }
        return true;
      }).map(item => remapQueueItem(item, expectedUserId));
      const guestQueuedIds = new Set(guestQueue.map(item => item.id));
      for (const event of guestEvents) {
        if (!guestQueuedIds.has(event._id)) guestQueue.push({ id: event._id, type: 'review_event', payload: event, createdAt: event.clientCreatedAt, retries: 0 });
      }
      const validatedQueuedItems = [...account.syncQueue, ...guestQueue];
      const merged = reconcileMiniProgramData(accountData, pull, validatedQueuedItems);
      snapshotFromData(account, merged, expectedUserId, safeCatalog);
      account.learning.books = mergeItems(account.learning.books, guest.learning.books);
      account.learning.words = mergeItems(account.learning.words, guest.learning.words);
      // Personal content uses the same portable merge as Web. It is separate
      // from progress sync and keeps account edits on ID collisions.
      applyPersonalLibraryMutation(account, safeCatalog, { type: 'merge-package', library: exportExtensionPersonalLibrary(guest, safeCatalog), policy: 'keep-local' }, { now: migrationTime, createId: () => crypto.randomUUID() });
      const savedByWord = new Map(account.words.map(saved => [saved.word.id, saved]));
      for (const guestSaved of guest.words) if (!savedByWord.has(guestSaved.word.id)) {
        const saved = structuredClone(guestSaved);
        const mergedState = account.learning.states.find(state => state.wordId === guestSaved.word.id);
        saved.state = mapStateUser(mergedState ?? saved.state, expectedUserId);
        account.words.push(saved);
        savedByWord.set(saved.word.id, saved);
      }
      const pending = new Map<string, SyncQueueItem>();
      for (const item of validatedQueuedItems) if (!pending.has(item.id)) pending.set(item.id, item);
      for (const guestState of guestData.states.filter(state => !manualIds.has(state.wordId))) {
        const state = merged.states.find(candidate => candidate.wordId === guestState.wordId);
        if (!state) continue;
        const payload = progressFromState(state, expectedUserId);
        const serialized = JSON.stringify(payload);
        if ([...pending.values()].some(item => item.type === 'progress' && JSON.stringify(item.payload) === serialized)) continue;
        const id = crypto.randomUUID();
        pending.set(id, {
          id,
          type: 'progress',
          payload,
          createdAt: state.updatedAt ?? state.lastReviewedAt ?? new Date(0).toISOString(),
          retries: 0
        });
      }
      account.syncQueue = [...pending.values()];
      guest.learning.guestClaimedBy = expectedUserId;
      guest.learning.guestClaimedRevision = claimedRevision;
      await tx.store.put(this.storedSnapshot(account), this.partitionKey);
      await tx.store.put(this.storedSnapshot(guest), 'current');
      await done;
      return this.withIdentity(account);
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => undefined);
      if (error instanceof ExtensionStorageError || error instanceof RepositoryIdentityError || error instanceof GuestAlreadyClaimedError) throw error;
      throw new ExtensionStorageError('storage_unavailable', error);
    }
  }

  async clearGuestAfterMerge(expectedUserId: string): Promise<void> {
    if (this.partitionKey !== 'current') throw new RepositoryIdentityError();
    const db = await this.database();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const done = tx.done;
    try {
      const stored = await tx.store.get('current');
      if (stored === undefined) { await done; return; }
      const guest = validateSnapshot(stored, 'local');
      if (guest.learning.guestClaimedBy !== expectedUserId) throw new RepositoryIdentityError();
      if (!guest.learning.guestClaimedRevision || guestContentRevision(guest) !== guest.learning.guestClaimedRevision) {
        await done;
        return;
      }
      const cleared = emptySnapshot();
      cleared.preferences = { ...guest.preferences };
      await tx.store.put(this.storedSnapshot(cleared), 'current');
      await done;
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => undefined);
      if (error instanceof ExtensionStorageError || error instanceof RepositoryIdentityError) throw error;
      throw new ExtensionStorageError('storage_unavailable', error);
    }
  }
}
