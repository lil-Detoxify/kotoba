import { initialState } from '@jp/core';
import type { WordState } from '@jp/models';
import { bookIdForWord } from './learning';
import type { ExtensionExerciseType, ExtensionSnapshot, ExtensionWord, LearningMode, StudyQueueItem } from './model';
import { sceneFor } from '../../web/src/services/learning-scenes';
import { canFeedbackPractice } from './study-feedback';

export interface ExtensionStudyCheckpoint {
  version: 1;
  owner: string;
  bookIds: string[];
  wordIds: string[];
  reviewCounts: number[];
  mode: LearningMode;
  exercise: ExtensionExerciseType;
  dailyBookId?: string;
  sceneId?: string;
  feedbackPractice?: boolean;
  readingContextIds?: Record<string, string>;
  updatedAt: string;
}

export const EXTENSION_STUDY_CHECKPOINT_KEY_PREFIX = 'kotobud.extension.study.checkpoint.v1:';

type StudyCheckpointStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const learningModes = new Set<LearningMode>(['new', 'review', 'difficult']);
const exerciseTypes = new Set<ExtensionExerciseType>([
  'card', 'kana-meaning', 'kanji-reading', 'audio-meaning', 'mixed',
  'kana-input', 'dictation', 'sentence-cloze'
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validReadingContextIds(value: unknown, wordIds: string[]): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([wordId, contextId]) => wordIds.includes(wordId) && isNonEmptyString(contextId));
}

function ownerKey(owner: unknown): string | null {
  if (!isNonEmptyString(owner)) return null;
  return `${EXTENSION_STUDY_CHECKPOINT_KEY_PREFIX}${encodeURIComponent(owner)}`;
}

function checkpointForOwner(value: unknown, owner: string): ExtensionStudyCheckpoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    candidate.owner !== owner ||
    !Array.isArray(candidate.bookIds) ||
    !candidate.bookIds.every(isNonEmptyString) ||
    !Array.isArray(candidate.wordIds) ||
    !candidate.wordIds.every(isNonEmptyString) ||
    !Array.isArray(candidate.reviewCounts) ||
    candidate.reviewCounts.length !== candidate.wordIds.length ||
    !candidate.reviewCounts.every(count => Number.isSafeInteger(count) && count >= 0) ||
    !learningModes.has(candidate.mode as LearningMode) ||
    !exerciseTypes.has(candidate.exercise as ExtensionExerciseType) ||
    !isNonEmptyString(candidate.updatedAt) ||
    !Number.isFinite(Date.parse(candidate.updatedAt))
  ) return null;
  if (candidate.dailyBookId !== undefined && !isNonEmptyString(candidate.dailyBookId)) return null;
  if (candidate.sceneId !== undefined && (typeof candidate.sceneId !== 'string' || !sceneFor(candidate.sceneId))) return null;
  if (candidate.feedbackPractice !== undefined && (typeof candidate.feedbackPractice !== 'boolean' || candidate.feedbackPractice && candidate.mode !== 'difficult')) return null;
  if (candidate.readingContextIds !== undefined && !validReadingContextIds(candidate.readingContextIds, candidate.wordIds as string[])) return null;

  return {
    version: 1,
    owner,
    bookIds: [...candidate.bookIds] as string[],
    wordIds: [...candidate.wordIds] as string[],
    reviewCounts: [...candidate.reviewCounts] as number[],
    mode: candidate.mode as LearningMode,
    exercise: candidate.exercise as ExtensionExerciseType,
    ...(candidate.dailyBookId !== undefined ? { dailyBookId: candidate.dailyBookId as string } : {}),
    ...(candidate.sceneId !== undefined ? { sceneId: candidate.sceneId as string } : {}),
    ...(candidate.feedbackPractice !== undefined ? { feedbackPractice: candidate.feedbackPractice as boolean } : {}),
    ...(candidate.readingContextIds !== undefined ? { readingContextIds: { ...(candidate.readingContextIds as Record<string, string>) } } : {}),
    updatedAt: candidate.updatedAt
  };
}

function browserStorage(): StudyCheckpointStorage {
  // Resolve localStorage only when a method is called so importing this module
  // remains safe in tests, private windows, and server-rendered contexts.
  return {
    getItem: key => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
    removeItem: key => globalThis.localStorage.removeItem(key)
  };
}

export function createStudyCheckpointStore(storage?: StudyCheckpointStorage) {
  const target = storage ?? browserStorage();

  function read(owner: string): ExtensionStudyCheckpoint | null {
    const key = ownerKey(owner);
    if (!key) return null;
    try {
      const raw = target.getItem(key);
      if (!raw) return null;
      return checkpointForOwner(JSON.parse(raw), owner);
    } catch {
      return null;
    }
  }

  function clear(owner: string): void {
    const key = ownerKey(owner);
    if (!key) return;
    try {
      target.removeItem(key);
    } catch {
      // Storage can be disabled or full; checkpoint cleanup must stay best effort.
    }
  }

  function write(checkpoint: ExtensionStudyCheckpoint): boolean {
    const owner = checkpoint && typeof checkpoint.owner === 'string' ? checkpoint.owner : '';
    const key = ownerKey(owner);
    if (!key) return false;
    if (Array.isArray((checkpoint as ExtensionStudyCheckpoint | null)?.wordIds) && checkpoint.wordIds.length === 0) {
      try {
        target.removeItem(key);
        return true;
      } catch {
        return false;
      }
    }
    const normalized = checkpointForOwner(checkpoint, owner);
    if (!normalized) return false;
    try {
      target.setItem(key, JSON.stringify(normalized));
      return true;
    } catch {
      return false;
    }
  }

  return { read, write, clear };
}

const defaultStudyCheckpointStore = createStudyCheckpointStore();

export function readStudyCheckpoint(owner: string): ExtensionStudyCheckpoint | null {
  return defaultStudyCheckpointStore.read(owner);
}

export function writeStudyCheckpoint(checkpoint: ExtensionStudyCheckpoint): boolean {
  return defaultStudyCheckpointStore.write(checkpoint);
}

export function clearStudyCheckpoint(owner: string): void {
  defaultStudyCheckpointStore.clear(owner);
}

function checkpointOwner(snapshot: ExtensionSnapshot): string {
  return snapshot.identity?.partitionKey || 'local';
}

function checkpointUserId(snapshot: ExtensionSnapshot): string {
  return snapshot.identity?.userId || 'local';
}

/** Resolve saved IDs against this owner's current words and learning state. */
export function resolveStudyCheckpoint(
  words: ExtensionWord[],
  snapshot: ExtensionSnapshot,
  checkpoint: ExtensionStudyCheckpoint
): StudyQueueItem[] {
  const owner = checkpointOwner(snapshot);
  const normalized = checkpointForOwner(checkpoint, owner);
  if (!normalized) return [];

  const userId = checkpointUserId(snapshot);
  const wordsById = new Map<string, ExtensionWord>();
  for (const word of words) if (!wordsById.has(word.id)) wordsById.set(word.id, word);

  const statesById = new Map<string, WordState>();
  for (const state of snapshot.learning.states ?? []) {
    if (state.userId === userId) statesById.set(state.wordId, state);
  }
  // SavedWord.state is the legacy mirror. Use it only for this owner's words,
  // and only when the canonical state is absent.
  for (const saved of snapshot.words ?? []) {
    if (saved.state.userId === userId && !statesById.has(saved.word.id)) {
      statesById.set(saved.word.id, saved.state);
    }
  }

  const bookFilter = normalized.bookIds.length ? new Set(normalized.bookIds) : undefined;
  const now = new Date();
  const resolved: StudyQueueItem[] = [];
  const seen = new Set<string>();
  normalized.wordIds.forEach((wordId, index) => {
    if (seen.has(wordId)) return;
    seen.add(wordId);
    const word = wordsById.get(wordId);
    if (!word || (bookFilter && !bookFilter.has(bookIdForWord(word)))) return;

    const state = statesById.get(wordId) ?? {
      ...initialState(wordId, now, userId),
      bookId: bookIdForWord(word),
      lessonId: word.lessonId
    };
    if (state.isIgnored) return;
    if (normalized.feedbackPractice && !normalized.sceneId && !canFeedbackPractice(snapshot, wordId, now)) return;
    if (normalized.mode === 'new' && (state.firstSeenAt || state.reviewCount > 0)) return;
    if (state.reviewCount !== normalized.reviewCounts[index]) return;
    resolved.push({ word, state });
  });
  return resolved;
}
