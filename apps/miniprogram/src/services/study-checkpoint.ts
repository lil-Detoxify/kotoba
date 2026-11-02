import { stateFor } from "@jp/core";
import type { Data, Word } from "@jp/models";
import type { StorageAdapter } from "../adapters/types";
import { defaultStorage } from "../adapters";
import { isMiniStudyExercise, type MiniStudyExercise } from "./study-exercise-preference";
import { historicalPracticeWords, parseHistoricalPractice, type HistoricalPractice } from "./historical-practice";

export type MiniStudyCheckpoint = {
  version: 1;
  owner: string;
  bookIds: string[];
  wordIds: string[];
  mode: "new" | "review" | "difficult";
  exercise: MiniStudyExercise;
  lessonId?: string;
  dailyBookId?: string;
  sceneId?: string;
  readingContextIds?: Record<string, string>;
  feedback?: HistoricalPractice;
  updatedAt: string;
};

export const MINI_STUDY_CHECKPOINT_KEY_PREFIX = "kotobud.miniprogram.study.checkpoint.v1:";

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(nonEmptyString)) return null;
  return [...new Set(value)];
}

function readingContextIds(value: unknown, wordIds: readonly string[]): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > wordIds.length) return null;
  const allowedWords = new Set(wordIds);
  const result = Object.create(null) as Record<string, string>;
  for (const [wordId, contextId] of entries) {
    if (!allowedWords.has(wordId) || wordId.length > 200
      || typeof contextId !== "string" || !contextId.trim() || contextId.length > 200) return null;
    result[wordId] = contextId;
  }
  return result;
}

function checkpointForOwner(value: unknown, owner: string): MiniStudyCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const bookIds = uniqueIds(candidate.bookIds);
  const wordIds = uniqueIds(candidate.wordIds);
  if (candidate.version !== 1 || candidate.owner !== owner || !bookIds || !wordIds) return null;
  if (candidate.mode !== "new" && candidate.mode !== "review" && candidate.mode !== "difficult") return null;
  if (!isMiniStudyExercise(candidate.exercise)) return null;
  if (!nonEmptyString(candidate.updatedAt) || !Number.isFinite(Date.parse(candidate.updatedAt))) return null;

  const optionalFields = ["lessonId", "dailyBookId", "sceneId"] as const;
  for (const field of optionalFields) {
    if (candidate[field] !== undefined && !nonEmptyString(candidate[field])) return null;
  }
  const feedback = candidate.feedback === undefined ? undefined : parseHistoricalPractice(candidate.feedback);
  if (feedback === null || (feedback && (candidate.mode !== "difficult" || candidate.exercise !== feedback.type))) return null;
  const contextIds = candidate.readingContextIds === undefined ? undefined : readingContextIds(candidate.readingContextIds, wordIds);
  if (candidate.readingContextIds !== undefined && !contextIds) return null;

  return {
    version: 1,
    owner,
    bookIds,
    wordIds,
    mode: candidate.mode,
    exercise: candidate.exercise,
    ...(candidate.lessonId !== undefined ? { lessonId: candidate.lessonId as string } : {}),
    ...(candidate.dailyBookId !== undefined ? { dailyBookId: candidate.dailyBookId as string } : {}),
    ...(candidate.sceneId !== undefined ? { sceneId: candidate.sceneId as string } : {}),
    ...(contextIds && Object.keys(contextIds).length ? { readingContextIds: contextIds } : {}),
    ...(feedback ? { feedback } : {}),
    updatedAt: candidate.updatedAt,
  };
}

function ownerKey(owner: string): string {
  if (!nonEmptyString(owner)) throw new Error("Invalid study checkpoint owner");
  return `${MINI_STUDY_CHECKPOINT_KEY_PREFIX}${encodeURIComponent(owner)}`;
}

export function createMiniStudyCheckpoint(
  storage: Pick<StorageAdapter, "getItem" | "setItem" | "removeItem"> = defaultStorage,
) {
  async function load(owner: string): Promise<MiniStudyCheckpoint | null> {
    const raw = await storage.getItem(ownerKey(owner));
    if (raw === null) return null;
    try {
      return checkpointForOwner(JSON.parse(raw), owner);
    } catch {
      // A malformed checkpoint is ignored and left untouched for recovery.
      return null;
    }
  }

  async function save(checkpoint: MiniStudyCheckpoint): Promise<void> {
    const normalized = checkpointForOwner(checkpoint, checkpoint?.owner);
    if (!normalized) throw new Error("Invalid study checkpoint");
    await storage.setItem(ownerKey(normalized.owner), JSON.stringify(normalized));
  }

  async function clear(owner: string): Promise<void> {
    await storage.removeItem(ownerKey(owner));
  }

  return { load, save, clear };
}

export const miniStudyCheckpoint = createMiniStudyCheckpoint();

/** Resolve only the saved IDs, preserving their order and the original Word objects. */
export function resolveMiniStudyCheckpoint(data: Data, checkpoint: MiniStudyCheckpoint): Word[] {
  if (checkpoint.feedback) return historicalPracticeWords(data, checkpoint.feedback, new Date(), checkpoint.wordIds);
  const wordsById = new Map<string, Word>();
  for (const word of data.words) {
    if (!wordsById.has(word.id)) wordsById.set(word.id, word);
  }

  const resolved: Word[] = [];
  const seen = new Set<string>();
  for (const wordId of checkpoint.wordIds) {
    if (seen.has(wordId)) continue;
    seen.add(wordId);
    const word = wordsById.get(wordId);
    if (!word) continue;
    const state = stateFor(data, wordId);
    if (state?.isIgnored) continue;
    if (checkpoint.mode === "new" && (state?.firstSeenAt || (state?.reviewCount ?? 0) > 0)) continue;
    resolved.push(word);
  }
  return resolved;
}
