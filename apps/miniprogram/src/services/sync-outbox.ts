import type { Data, ReviewEvent, ReviewLog, SyncQueueItem, UserSettings, WordState } from "@jp/models";
import { normalizeLegacyQuizAttempt } from "./quiz-compat";

function iso(value: Date | string | undefined): Date | string | undefined {
  return value instanceof Date ? value.toISOString() : value;
}

export function progressPayload(state: WordState): Record<string, unknown> {
  return {
    _id: `${state.userId}:${state.wordId}`,
    ...state,
    card: { ...state.card, due: iso(state.card.due), last_review: iso(state.card.last_review) },
    version: 1,
  };
}

export function eventPayload(log: ReviewLog): ReviewEvent {
  return {
    _id: log.id,
    userId: log.userId,
    wordId: log.wordId,
    reviewedAt: log.reviewedAt,
    rating: log.rating,
    responseTime: log.responseTime,
    studyMode: log.studyMode,
    ...(log.deviceId ? { deviceId: log.deviceId } : {}),
    ...(log.quiz ? { quiz: normalizeLegacyQuizAttempt(log.quiz) } : {}),
    clientCreatedAt: log.clientCreatedAt ?? log.reviewedAt,
    ...(log.serverReceivedAt ? { serverReceivedAt: log.serverReceivedAt } : {}),
  };
}

export function reviewQueueItems(log: ReviewLog, state: WordState): SyncQueueItem[] {
  return [
    { id: log.id, type: "review_event", payload: eventPayload(log), createdAt: log.clientCreatedAt ?? log.reviewedAt, retries: 0 },
    { id: `progress:${state.wordId}:${state.updatedAt ?? log.reviewedAt}`, type: "progress", payload: progressPayload(state), createdAt: state.updatedAt ?? log.reviewedAt, retries: 0 },
  ];
}

export function progressQueueItem(state: WordState): SyncQueueItem {
  const createdAt = state.updatedAt ?? state.lastReviewedAt ?? new Date(0).toISOString();
  return { id: `progress:${state.wordId}:${createdAt}`, type: "progress", payload: progressPayload(state), createdAt, retries: 0 };
}

export function settingsQueueItem(settings: UserSettings): SyncQueueItem {
  return { id: `settings:${settings.updatedAt}`, type: "settings", payload: settings, createdAt: settings.updatedAt, retries: 0 };
}

export function settingsFromData(data: Data, userId: string): UserSettings | undefined {
  const meaningfulProgress = data.states.length > 0 || data.logs.length > 0;
  const existing = data.userSettings;
  const timestamps = [existing?.updatedAt, data.currentBookIdUpdatedAt].filter((value): value is string => !!value);
  const updatedAt = timestamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  if (!updatedAt) return undefined;
  const currentBookId = data.currentBookIdSource === "user" || meaningfulProgress ? data.currentBookId : undefined;
  const result: UserSettings = {
    ...(existing ?? {}),
    userId,
    updatedAt,
    ...(currentBookId ? { currentBookId } : {}),
    ...(currentBookId ? { currentBookIdSource: data.currentBookIdSource ?? "default" } : {}),
  };
  return result;
}
