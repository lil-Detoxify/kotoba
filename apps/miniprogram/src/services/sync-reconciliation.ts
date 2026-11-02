import { evaluate, initialState, mergeWordStateWithLww, reconcileFsrsFromEvents } from "@jp/core";
import type { Grade } from "ts-fsrs";
import type { Data, CloudProgressDoc, ReviewEvent, ReviewLog, SyncQueueItem, UserSettings, WordState } from "@jp/models";
import { ensureStudyRuntime } from "../adapters/runtime";
import { normalizeLegacyAudioPrompt, normalizeLegacyQuizAttempt } from "./quiz-compat";

type FsrsCard = WordState["card"];
type RecordValue = Record<string, unknown>;
export type ValidatedSettings = UserSettings & { currentBookIdSource?: "default" | "user" };

export interface ValidatedCloudPull {
  userId: string;
  progress: CloudProgressDoc[];
  events: ReviewEvent[];
  settings?: ValidatedSettings;
  serverTime: string;
}

export type ValidatedSyncPull = ValidatedCloudPull;

export class SyncPayloadError extends Error {
  constructor(message: string) {
    super(`无效的云端同步数据：${message}`);
    this.name = "SyncPayloadError";
  }
}

const EPOCH = "1970-01-01T00:00:00.000Z";
const STUDY_MODES = new Set(["new", "review", "difficult"]);
const STATUSES = new Set(["new", "learning", "review", "mastered"]);

function object(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyncPayloadError(`${path} 必须是对象`);
  return value as RecordValue;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new SyncPayloadError(`${path} 必须是非空字符串`);
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return string(value, path);
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new SyncPayloadError(`${path} 必须是大于等于 ${minimum} 的整数`);
  }
  return value;
}

function finiteNumber(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new SyncPayloadError(`${path} 必须是有效数字`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new SyncPayloadError(`${path} 必须是布尔值`);
  return value;
}

function iso(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new SyncPayloadError(`${path} 必须是有效的 UTC ISO 日期`);
  }
  return value;
}

function optionalIso(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return iso(value, path);
}

function date(value: unknown, path: string): Date {
  return new Date(iso(value, path));
}

function normalizeCard(value: unknown, path: string): FsrsCard {
  const raw = object(value, path);
  const state = integer(raw.state, `${path}.state`);
  if (state > 3) throw new SyncPayloadError(`${path}.state 超出 FSRS 范围`);
  const card: FsrsCard = {
    due: date(raw.due, `${path}.due`),
    stability: finiteNumber(raw.stability, `${path}.stability`),
    difficulty: finiteNumber(raw.difficulty, `${path}.difficulty`),
    elapsed_days: finiteNumber(raw.elapsed_days, `${path}.elapsed_days`),
    scheduled_days: finiteNumber(raw.scheduled_days, `${path}.scheduled_days`),
    learning_steps: finiteNumber(raw.learning_steps, `${path}.learning_steps`),
    reps: integer(raw.reps, `${path}.reps`),
    lapses: integer(raw.lapses, `${path}.lapses`),
    state: state as FsrsCard["state"],
  };
  if (raw.last_review !== undefined && raw.last_review !== null) card.last_review = date(raw.last_review, `${path}.last_review`);
  return card;
}

function normalizeQuiz(value: unknown, path: string): ReviewEvent["quiz"] {
  if (value === undefined || value === null) return undefined;
  const raw = object(value, path);
  const type = string(raw.type, `${path}.type`);
  const choiceType = ["kana-meaning", "kanji-reading", "audio-meaning"].includes(type);
  const inputType = type === "kana-input" || type === "dictation";
  if (!choiceType && !inputType) throw new SyncPayloadError(`${path}.type 无效`);
  const normalizedPrompt = normalizeLegacyAudioPrompt(type, raw.prompt);
  const prompt = type === "dictation" && normalizedPrompt === ""
    ? ""
    : string(normalizedPrompt, `${path}.prompt`);
  if (!Array.isArray(raw.options) ||
      (inputType ? raw.options.length !== 0 : raw.options.length === 0) ||
      !raw.options.every((item) => typeof item === "string" && (inputType || item.length > 0))) {
    throw new SyncPayloadError(`${path}.options 无效`);
  }
  const selected = raw.selected === null ? null : string(raw.selected, `${path}.selected`);
  const correct = string(raw.correct, `${path}.correct`);
  return { type: type as ReviewEvent["quiz"] extends infer T ? T extends { type: infer U } ? U : never : never, prompt, options: raw.options as string[], selected, correct, isCorrect: boolean(raw.isCorrect, `${path}.isCorrect`) } as ReviewEvent["quiz"];
}

function normalizeProgress(value: unknown, expectedUserId: string, index: number): CloudProgressDoc {
  const raw = object(value, `progress[${index}]`);
  const userId = string(raw.userId, `progress[${index}].userId`);
  if (userId !== expectedUserId) throw new SyncPayloadError(`progress[${index}].userId 与当前账号不一致`);
  const wordId = string(raw.wordId, `progress[${index}].wordId`);
  const status = string(raw.status, `progress[${index}].status`);
  if (!STATUSES.has(status)) throw new SyncPayloadError(`progress[${index}].status 无效`);
  const card = normalizeCard(raw.card, `progress[${index}].card`);
  return {
    _id: optionalString(raw._id, `progress[${index}]._id`) ?? `${expectedUserId}:${wordId}`,
    userId,
    wordId,
    bookId: optionalString(raw.bookId, `progress[${index}].bookId`),
    lessonId: optionalString(raw.lessonId, `progress[${index}].lessonId`),
    status: status as CloudProgressDoc["status"],
    firstSeenAt: optionalIso(raw.firstSeenAt, `progress[${index}].firstSeenAt`),
    lastReviewedAt: optionalIso(raw.lastReviewedAt, `progress[${index}].lastReviewedAt`),
    nextReviewAt: optionalIso(raw.nextReviewAt, `progress[${index}].nextReviewAt`),
    reviewCount: integer(raw.reviewCount, `progress[${index}].reviewCount`),
    lapseCount: integer(raw.lapseCount, `progress[${index}].lapseCount`),
    card,
    isDifficult: boolean(raw.isDifficult, `progress[${index}].isDifficult`),
    difficultUpdatedAt: optionalIso(raw.difficultUpdatedAt, `progress[${index}].difficultUpdatedAt`),
    isIgnored: boolean(raw.isIgnored, `progress[${index}].isIgnored`),
    ignoredUpdatedAt: optionalIso(raw.ignoredUpdatedAt, `progress[${index}].ignoredUpdatedAt`),
    updatedAt: iso(raw.updatedAt, `progress[${index}].updatedAt`),
    version: integer(raw.version, `progress[${index}].version`, 1),
  };
}

function normalizeEvent(value: unknown, expectedUserId: string, index: number): ReviewEvent {
  const raw = object(value, `events[${index}]`);
  const userId = string(raw.userId, `events[${index}].userId`);
  if (userId !== expectedUserId) throw new SyncPayloadError(`events[${index}].userId 与当前账号不一致`);
  const rating = integer(raw.rating, `events[${index}].rating`);
  if (rating < 1 || rating > 4) throw new SyncPayloadError(`events[${index}].rating 必须为 1-4`);
  const studyMode = string(raw.studyMode, `events[${index}].studyMode`);
  if (!STUDY_MODES.has(studyMode)) throw new SyncPayloadError(`events[${index}].studyMode 无效`);
  return {
    _id: string(raw._id ?? raw.id, `events[${index}]._id`),
    userId,
    wordId: string(raw.wordId, `events[${index}].wordId`),
    reviewedAt: iso(raw.reviewedAt, `events[${index}].reviewedAt`),
    rating: rating as ReviewEvent["rating"],
    responseTime: finiteNumber(raw.responseTime ?? 0, `events[${index}].responseTime`),
    studyMode: studyMode as ReviewEvent["studyMode"],
    deviceId: optionalString(raw.deviceId, `events[${index}].deviceId`),
    clientCreatedAt: iso(raw.clientCreatedAt ?? raw.reviewedAt, `events[${index}].clientCreatedAt`),
    serverReceivedAt: optionalIso(raw.serverReceivedAt, `events[${index}].serverReceivedAt`),
    quiz: normalizeQuiz(raw.quiz, `events[${index}].quiz`),
  };
}

function normalizeSettings(value: unknown, expectedUserId: string): ValidatedSettings {
  const raw = object(value, "settings");
  const userId = string(raw.userId, "settings.userId");
  if (userId !== expectedUserId) throw new SyncPayloadError("settings.userId 与当前账号不一致");
  const position = raw.lastStudiedPosition === undefined || raw.lastStudiedPosition === null ? undefined : object(raw.lastStudiedPosition, "settings.lastStudiedPosition");
  const preferences = raw.preferences === undefined || raw.preferences === null ? undefined : object(raw.preferences, "settings.preferences");
  const voice = preferences?.pronunciationVoice;
  if (voice !== undefined && voice !== "female" && voice !== "male") throw new SyncPayloadError("settings.preferences.pronunciationVoice 无效");
  const currentBookIdSource = raw.currentBookIdSource;
  if (currentBookIdSource !== undefined && currentBookIdSource !== "default" && currentBookIdSource !== "user") throw new SyncPayloadError("settings.currentBookIdSource 无效");
  return {
    userId,
    email: optionalString(raw.email, "settings.email"),
    currentBookId: optionalString(raw.currentBookId, "settings.currentBookId"),
    lastStudiedPosition: position ? {
      bookId: string(position.bookId, "settings.lastStudiedPosition.bookId"),
      lessonId: string(position.lessonId, "settings.lastStudiedPosition.lessonId"),
      wordId: string(position.wordId, "settings.lastStudiedPosition.wordId"),
      updatedAt: iso(position.updatedAt, "settings.lastStudiedPosition.updatedAt"),
    } : undefined,
    preferences: preferences ? { pronunciationVoice: voice as "female" | "male" | undefined } : undefined,
    updatedAt: iso(raw.updatedAt, "settings.updatedAt"),
    currentBookIdSource,
  };
}

/** Validate and normalize the complete cloud response before it can touch local data. */
export function validateCloudPayload(value: unknown, expectedUserId: string): ValidatedCloudPull {
  string(expectedUserId, "expectedUserId");
  const raw = object(value, "pull");
  const userId = string(raw.userId, "pull.userId");
  if (userId !== expectedUserId) throw new SyncPayloadError("pull.userId 与当前账号不一致");
  if (!Array.isArray(raw.progress)) throw new SyncPayloadError("pull.progress 必须是数组");
  if (!Array.isArray(raw.events)) throw new SyncPayloadError("pull.events 必须是数组");
  const settings = raw.settings === undefined || raw.settings === null ? undefined : normalizeSettings(raw.settings, expectedUserId);
  return {
    userId,
    progress: raw.progress.map((item, index) => normalizeProgress(item, expectedUserId, index)),
    events: raw.events.map((item, index) => normalizeEvent(item, expectedUserId, index)),
    settings,
    serverTime: iso(raw.serverTime, "pull.serverTime"),
  };
}

export const validateSyncPull = validateCloudPayload;

function cardClone(card: FsrsCard): FsrsCard {
  return { ...card, due: new Date(card.due), ...(card.last_review ? { last_review: new Date(card.last_review) } : {}) };
}

function stateClone(state: WordState): WordState {
  return { ...state, card: cardClone(state.card) };
}

function stableValue(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as RecordValue).sort().map((key) => `${JSON.stringify(key)}:${stableValue((value as RecordValue)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" && !(value instanceof Date)) return Number.NEGATIVE_INFINITY;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : Number.NEGATIVE_INFINITY;
}

function maxTimestamp(...values: unknown[]): string {
  const time = Math.max(...values.map(timestamp));
  return Number.isFinite(time) ? new Date(time).toISOString() : EPOCH;
}

function cloneData(data: Data): Data {
  return {
    ...data,
    books: data.books.map((book) => ({ ...book })),
    lessons: data.lessons.map((lesson) => ({ ...lesson })),
    words: data.words.map((word) => ({ ...word })),
    states: data.states.map(stateClone),
    logs: data.logs.map((log) => ({ ...log, previousState: stateClone(log.previousState), newState: stateClone(log.newState) })),
    userSettings: data.userSettings ? { ...data.userSettings, lastStudiedPosition: data.userSettings.lastStudiedPosition ? { ...data.userSettings.lastStudiedPosition } : undefined, preferences: data.userSettings.preferences ? { ...data.userSettings.preferences } : undefined } : undefined,
  };
}

function localEvent(log: ReviewLog, userId: string, index: number): ReviewEvent {
  return {
    _id: log.id || `local:${log.wordId}:${log.reviewedAt}:${index}`,
    userId,
    wordId: log.wordId,
    reviewedAt: log.reviewedAt,
    rating: log.rating,
    responseTime: log.responseTime,
    studyMode: log.studyMode,
    quiz: log.quiz ? normalizeLegacyQuizAttempt(log.quiz) : undefined,
    clientCreatedAt: log.clientCreatedAt ?? log.reviewedAt,
    serverReceivedAt: log.serverReceivedAt,
  };
}

function eventSort(a: ReviewEvent, b: ReviewEvent): number {
  return timestamp(a.reviewedAt) - timestamp(b.reviewedAt) || a._id.localeCompare(b._id);
}

function upsertEvent(events: Map<string, ReviewEvent>, candidate: ReviewEvent): void {
  const existing = events.get(candidate._id);
  if (!existing || stableValue(candidate) > stableValue(existing)) events.set(candidate._id, candidate);
}

function chooseState(current: WordState | undefined, candidate: WordState): WordState {
  if (!current) return candidate;
  const currentTime = timestamp(current.updatedAt ?? current.lastReviewedAt ?? current.firstSeenAt);
  const candidateTime = timestamp(candidate.updatedAt ?? candidate.lastReviewedAt ?? candidate.firstSeenAt);
  if (candidateTime !== currentTime) return candidateTime > currentTime ? candidate : current;
  return stableValue(candidate) > stableValue(current) ? candidate : current;
}

function progressState(progress: CloudProgressDoc, userId: string): WordState {
  return {
    userId,
    wordId: progress.wordId,
    bookId: progress.bookId,
    lessonId: progress.lessonId,
    status: progress.status,
    firstSeenAt: progress.firstSeenAt,
    lastReviewedAt: progress.lastReviewedAt,
    nextReviewAt: progress.nextReviewAt,
    reviewCount: progress.reviewCount,
    lapseCount: progress.lapseCount,
    card: cardClone(progress.card),
    isDifficult: progress.isDifficult,
    difficultUpdatedAt: progress.difficultUpdatedAt,
    isIgnored: progress.isIgnored,
    ignoredUpdatedAt: progress.ignoredUpdatedAt,
    updatedAt: progress.updatedAt,
  };
}

function materializeEvents(events: ReviewEvent[], userId: string, states: Map<string, WordState>, progress: Map<string, CloudProgressDoc>): ReviewLog[] {
  ensureStudyRuntime();
  const byWord = new Map<string, ReviewEvent[]>();
  for (const event of events) (byWord.get(event.wordId) ?? (byWord.set(event.wordId, []), byWord.get(event.wordId)!)).push(event);
  const result: ReviewLog[] = [];
  for (const [wordId, wordEvents] of byWord) {
    const seed = initialState(wordId, new Date(wordEvents[0].reviewedAt), userId);
    const base = states.get(wordId) ?? (progress.get(wordId) ? progressState(progress.get(wordId)!, userId) : undefined);
    if (base) {
      seed.bookId = base.bookId;
      seed.lessonId = base.lessonId;
      seed.isDifficult = base.isDifficult;
      seed.difficultUpdatedAt = base.difficultUpdatedAt;
      seed.isIgnored = base.isIgnored;
      seed.ignoredUpdatedAt = base.ignoredUpdatedAt;
    }
    let current = seed;
    for (const event of wordEvents) {
      const previous = stateClone(current);
      const evaluated = evaluate(previous, event.rating as Grade, event.studyMode, new Date(event.reviewedAt), event._id, event.responseTime);
      const nextState: WordState = { ...evaluated.state, userId, bookId: base?.bookId ?? progress.get(wordId)?.bookId, lessonId: base?.lessonId ?? progress.get(wordId)?.lessonId };
      result.push({
        ...evaluated.log,
        id: event._id,
        userId,
        wordId,
        reviewedAt: event.reviewedAt,
        rating: event.rating,
        responseTime: event.responseTime,
        previousState: previous,
        newState: stateClone(nextState),
        studyMode: event.studyMode,
        quiz: event.quiz,
        clientCreatedAt: event.clientCreatedAt,
        serverReceivedAt: event.serverReceivedAt,
      });
      current = nextState;
    }
  }
  return result.sort((a, b) => timestamp(a.reviewedAt) - timestamp(b.reviewedAt) || a.id.localeCompare(b.id));
}

function mergeSettings(data: Data, settings: ValidatedSettings | undefined): void {
  if (!settings) return;
  const source = settings.currentBookIdSource;
  const remoteIsDefault = source === "default";
  const localIsUserChoice = data.currentBookIdSource === "user";
  const remoteIsNewer = !data.currentBookIdUpdatedAt || timestamp(settings.updatedAt) > timestamp(data.currentBookIdUpdatedAt);
  const remoteIsExplicitUserChoice = source === "user";
  if (settings.currentBookId && (!localIsUserChoice || (remoteIsExplicitUserChoice && remoteIsNewer))) {
    data.currentBookId = settings.currentBookId;
    data.currentBookIdSource = remoteIsDefault ? "default" : "user";
    data.currentBookIdUpdatedAt = settings.updatedAt;
  }
  const localSettings = data.userSettings;
  const remoteWins = !localSettings || timestamp(settings.updatedAt) > timestamp(localSettings.updatedAt);
  const mergedSettings: UserSettings & { currentBookIdSource?: "default" | "user" } = remoteWins
    ? { ...(localSettings ?? {}), ...settings, userId: settings.userId }
    : { ...settings, ...localSettings, userId: settings.userId };
  if (localIsUserChoice && !remoteIsExplicitUserChoice) {
    mergedSettings.currentBookId = data.currentBookId;
    mergedSettings.currentBookIdSource = "user";
  }
  data.userSettings = mergedSettings;
}

function mergeWordState(local: WordState | undefined, remote: CloudProgressDoc | undefined, logs: ReviewLog[], userId: string): WordState {
  if (!local && !remote) return reconcileFsrsFromEvents(logs, initialState(logs[0].wordId, new Date(logs[0].reviewedAt), userId));
  if (!local) return progressState(remote!, userId);
  if (!remote) return logs.length ? reconcileFsrsFromEvents(logs, local) : local;

  // The shared helper owns field-level flag LWW. Its FSRS replay is only
  // authoritative when the event history is at least as recent as both
  // materialized progress snapshots (migrated accounts may lack old events).
  const shared = mergeWordStateWithLww(local, remote, logs);
  const remoteState = progressState(remote, userId);
  const newestProgress = chooseState(local, remoteState);
  const lastEventAt = logs.length ? logs[logs.length - 1].reviewedAt : undefined;
  const progressAt = maxTimestamp(local.updatedAt, local.lastReviewedAt, remote.updatedAt, remote.lastReviewedAt);
  const base = logs.length && timestamp(lastEventAt) >= timestamp(progressAt) ? shared : newestProgress;
  return {
    ...base,
    userId,
    bookId: base.bookId ?? local.bookId ?? remote.bookId,
    lessonId: base.lessonId ?? local.lessonId ?? remote.lessonId,
    isDifficult: shared.isDifficult,
    difficultUpdatedAt: shared.difficultUpdatedAt,
    isIgnored: shared.isIgnored,
    ignoredUpdatedAt: shared.ignoredUpdatedAt,
  };
}

/** Merge a validated pull into a cloned local snapshot without using any Web API. */
function reconcileValidated(localData: Data, cloud: ValidatedCloudPull, queuedItems: SyncQueueItem[] = []): Data {
  const userId = cloud.userId;
  const data = cloneData(localData);
  const localStates = new Map<string, WordState>();
  for (const state of data.states) localStates.set(state.wordId, chooseState(localStates.get(state.wordId), stateClone(state)));
  const remoteProgress = new Map<string, CloudProgressDoc>();
  queuedItems.forEach((item, index) => {
    if (item.type !== "progress") return;
    if (!item.payload || typeof item.payload !== "object") throw new SyncPayloadError(`queue.progress[${index}] 无效`);
    const payload = { ...(item.payload as RecordValue), userId, version: (item.payload as RecordValue).version ?? 1, updatedAt: (item.payload as RecordValue).updatedAt ?? item.createdAt };
    const queuedProgress = normalizeProgress(payload, userId, index);
    remoteProgress.set(queuedProgress.wordId, queuedProgress);
  });
  for (const progress of cloud.progress) {
    const existing = remoteProgress.get(progress.wordId);
    if (!existing || timestamp(progress.updatedAt) > timestamp(existing.updatedAt) ||
        (timestamp(progress.updatedAt) === timestamp(existing.updatedAt) && stableValue(progress) > stableValue(existing))) {
      remoteProgress.set(progress.wordId, progress);
    }
  }

  const eventsById = new Map<string, ReviewEvent>();
  data.logs.forEach((log, index) => upsertEvent(eventsById, localEvent(log, userId, index)));
  queuedItems.forEach((item, index) => {
    if (item.type !== "review_event") return;
    if (!item.payload || typeof item.payload !== "object") throw new SyncPayloadError(`queue.events[${index}] 无效`);
    const payload = { ...(item.payload as RecordValue), userId: cloud.userId };
    const event = normalizeEvent(payload, cloud.userId, index);
    upsertEvent(eventsById, event);
  });
  for (const event of cloud.events) upsertEvent(eventsById, event);
  const allEvents = [...eventsById.values()].sort(eventSort);
  const logs = materializeEvents(allEvents, userId, localStates, remoteProgress);
  const eventsByWord = new Map<string, ReviewLog[]>();
  for (const log of logs) (eventsByWord.get(log.wordId) ?? (eventsByWord.set(log.wordId, []), eventsByWord.get(log.wordId)!)).push(log);

  const wordIds = new Set([...localStates.keys(), ...remoteProgress.keys(), ...eventsByWord.keys()]);
  const states: WordState[] = [];
  for (const wordId of wordIds) {
    const local = localStates.get(wordId);
    const remote = remoteProgress.get(wordId);
    const wordLogs = eventsByWord.get(wordId) ?? [];
    const merged = mergeWordState(local, remote, wordLogs, userId);
    merged.userId = userId;
    merged.updatedAt = maxTimestamp(local?.updatedAt, local?.lastReviewedAt, local?.firstSeenAt, remote?.updatedAt, remote?.lastReviewedAt, remote?.firstSeenAt, ...wordLogs.flatMap((log) => [log.reviewedAt, log.clientCreatedAt, log.serverReceivedAt]));
    states.push(merged);
  }
  data.states = states.sort((a, b) => a.wordId.localeCompare(b.wordId));
  data.logs = logs;
  let queuedSettings = cloud.settings;
  queuedItems.forEach((item) => {
    if (item.type !== "settings") return;
    const candidate = normalizeSettings({ ...(object(item.payload, "queue.settings")), userId }, userId);
    if (!queuedSettings || timestamp(candidate.updatedAt) > timestamp(queuedSettings.updatedAt) ||
        (timestamp(candidate.updatedAt) === timestamp(queuedSettings.updatedAt) && stableValue(candidate) > stableValue(queuedSettings))) {
      queuedSettings = candidate;
    }
  });
  mergeSettings(data, queuedSettings);
  if (data.userSettings) data.userSettings = { ...data.userSettings, userId };
  return data;
}

/** Reconcile a payload that has already passed validateCloudPayload. */
export function reconcileMiniProgramData(localData: Data, validatedPull: ValidatedSyncPull, queuedItems: SyncQueueItem[] = []): Data {
  return reconcileValidated(localData, validatedPull, queuedItems);
}

export function reconcileWithCloud(localData: Data, payload: unknown, userId: string, queuedItems: SyncQueueItem[] = []): Data {
  return reconcileValidated(localData, validateCloudPayload(payload, userId), queuedItems);
}

export const reconcileCloudData = reconcileWithCloud;
