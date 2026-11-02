import { initialState } from '@jp/core';
import type { ReviewLog, WordState } from '@jp/models';
import {
  sessionSummary as summarizeSession,
  weakPracticeSuggestions,
  type SessionSummary,
} from '../../web/src/services/study-feedback';
import { bookIdForWord } from './learning';
import { extensionContentWords, personalLibraryData } from './personal-library';
import type { ExtensionSnapshot, ExtensionWord, StudyQueueItem } from './model';

export type { SessionSummary } from '../../web/src/services/study-feedback';

export interface ExtensionSessionReceipt {
  word: ExtensionWord;
  baselineReviewCount: number;
  logId: string;
}

export interface ExtensionWeakPracticeSuggestion {
  word: ExtensionWord;
  reason: string;
}

const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

function currentOwner(snapshot: ExtensionSnapshot): string {
  return snapshot.identity?.userId || snapshot.learning.userSettings?.userId || 'local';
}

/** Canonical state wins; the saved-word copy is a fallback for older snapshots. */
function currentOwnerStates(snapshot: ExtensionSnapshot, userId: string): Map<string, WordState> {
  const states = new Map<string, WordState>();
  for (const state of snapshot.learning.states ?? []) {
    if (state.userId === userId) states.set(state.wordId, state);
  }
  for (const saved of snapshot.words ?? []) {
    if (saved.state.userId === userId && !states.has(saved.word.id)) {
      states.set(saved.word.id, saved.state);
    }
  }
  return states;
}

/** Merge the two extension log stores, retaining only this owner's first copy of each event. */
function currentOwnerLogs(snapshot: ExtensionSnapshot, userId: string): ReviewLog[] {
  const seen = new Set<string>();
  const logs: ReviewLog[] = [];
  for (const log of [...(snapshot.learning.logs ?? []), ...(snapshot.logs ?? [])]) {
    if (log.userId !== userId || seen.has(log.id)) continue;
    seen.add(log.id);
    logs.push(log);
  }
  return logs;
}

function sharedDataForOwner(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], userId: string, logs: ReviewLog[]) {
  const data = personalLibraryData(snapshot, catalog);
  data.states = [...currentOwnerStates(snapshot, userId).values()];
  data.logs = logs;
  return data;
}

export function extensionSessionSummary(
  snapshot: ExtensionSnapshot,
  catalog: ExtensionWord[],
  receipts: ExtensionSessionReceipt[],
): SessionSummary {
  const owner = currentOwner(snapshot);
  const receiptWordsByLogId = new Map<string, string | null>();
  for (const receipt of receipts) {
    const existing = receiptWordsByLogId.get(receipt.logId);
    receiptWordsByLogId.set(receipt.logId, existing === undefined || existing === receipt.word.id ? receipt.word.id : null);
  }
  const logs = currentOwnerLogs(snapshot, owner).filter(log => receiptWordsByLogId.get(log.id) === log.wordId);
  const data = sharedDataForOwner(snapshot, catalog, owner, logs);
  return summarizeSession(
    data,
    receipts.map(receipt => receipt.word),
    receipts.length,
    receipts.map(receipt => receipt.baselineReviewCount),
    owner,
  );
}

export function extensionWeakPracticeSuggestions(
  snapshot: ExtensionSnapshot,
  catalog: ExtensionWord[],
  now = new Date(),
  bookId?: string,
  limit = 5,
): ExtensionWeakPracticeSuggestion[] {
  const owner = currentOwner(snapshot);
  const data = sharedDataForOwner(snapshot, catalog, owner, currentOwnerLogs(snapshot, owner));
  const extensionWords = new Map(extensionContentWords(snapshot, catalog).map(word => [word.id, word]));
  return weakPracticeSuggestions(data, now, owner, bookId, limit).flatMap(({ word, reason }) => {
    const extensionWord = extensionWords.get(word.id);
    return extensionWord ? [{ word: extensionWord, reason }] : [];
  });
}

export function feedbackPracticeQueue(
  snapshot: ExtensionSnapshot,
  catalog: ExtensionWord[],
  wordIds: string[],
  now = new Date(),
): StudyQueueItem[] {
  const owner = currentOwner(snapshot);
  const states = currentOwnerStates(snapshot, owner);
  const words = new Map(extensionContentWords(snapshot, catalog).map(word => [word.id, word]));
  const seen = new Set<string>();
  const queue: StudyQueueItem[] = [];

  for (const wordId of wordIds) {
    if (seen.has(wordId)) continue;
    seen.add(wordId);
    const word = words.get(wordId);
    if (!word) continue;
    const state = states.get(wordId) ?? initialState(wordId, now, owner);
    if (state.isIgnored) continue;
    queue.push({
      word,
      state: { ...state, bookId: bookIdForWord(word), lessonId: word.lessonId },
    });
  }
  return queue;
}

export function canFeedbackPractice(snapshot: ExtensionSnapshot, wordId: string, now = new Date()): boolean {
  const owner = currentOwner(snapshot);
  const state = currentOwnerStates(snapshot, owner).get(wordId);
  if (state?.isIgnored) return false;
  if (state?.isDifficult) return true;

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return false;
  const since = nowMs - thirtyDaysMs;
  return currentOwnerLogs(snapshot, owner).some(log => {
    if (log.wordId !== wordId) return false;
    const reviewedAt = Date.parse(log.reviewedAt);
    return Number.isFinite(reviewedAt)
      && reviewedAt >= since
      && reviewedAt <= nowMs
      && (log.rating <= 2 || log.quiz?.isCorrect === false);
  });
}
