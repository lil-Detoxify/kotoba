import type { ExerciseType, InputQuizType, StudyMode } from '@jp/models';
import { sceneFor } from './learning-scenes';
export type WebExerciseType=ExerciseType|InputQuizType|'sentence-cloze';

/** Device-local navigation state. Progress and grades remain in the existing repository. */
export interface StudySession {
  version: 1;
  owner: string;
  mode: StudyMode;
  bookIds: string[];
  lessonIds?: string[];
  wordIds: string[];
  reviewCounts: number[];
  index: number;
  roundStart?: number;
  exercise?: WebExerciseType;
  focusedPractice?: boolean;
  sceneId?: string;
  readingContextIds?: Record<string, string>;
  updatedAt: string;
}
const prefix = 'kotobud.web.study-session.v1:';
const modes = new Set(['new', 'review', 'difficult']);
const exercises = new Set(['card', 'mixed', 'kana-meaning', 'kanji-reading', 'audio-meaning', 'sentence-cloze', 'kana-input', 'dictation']);
const ids = (value: unknown, limit: number): value is string[] => Array.isArray(value) && value.length <= limit && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 200) && new Set(value).size === value.length;
function validReadingContextIds(value: unknown, wordIds: string[]): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= wordIds.length && entries.every(([wordId, contextId]) =>
    wordIds.includes(wordId) && wordId.length <= 200 && typeof contextId === 'string' && contextId.length > 0 && contextId.length <= 200);
}
export function validStudySession(value: unknown, owner: string): value is StudySession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as StudySession;
  return row.version === 1 && row.owner === owner && modes.has(row.mode)
    && ids(row.bookIds, 2000) && ids(row.wordIds, 50000) && row.wordIds.length > 0
    && (row.lessonIds === undefined || ids(row.lessonIds, 2000))
    && Array.isArray(row.reviewCounts) && row.reviewCounts.length === row.wordIds.length
    && row.reviewCounts.every(count => Number.isSafeInteger(count) && count >= 0)
    && Number.isSafeInteger(row.index) && row.index >= 0 && row.index <= row.wordIds.length
    && (row.roundStart === undefined || Number.isSafeInteger(row.roundStart) && row.roundStart >= 0 && row.roundStart <= row.index)
    && (row.exercise === undefined || exercises.has(row.exercise))
    && (row.focusedPractice === undefined || typeof row.focusedPractice === 'boolean')
    && (row.sceneId === undefined || typeof row.sceneId === 'string' && !!sceneFor(row.sceneId))
    && (row.readingContextIds === undefined || validReadingContextIds(row.readingContextIds, row.wordIds))
    && typeof row.updatedAt === 'string' && Number.isFinite(Date.parse(row.updatedAt));
}
export function readStudySession(owner: string): StudySession | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(prefix + owner);
    if (!raw || raw.length > 2_000_000) return null;
    const value: unknown = JSON.parse(raw);
    return validStudySession(value, owner) ? value : null;
  } catch { return null; }
}
export function writeStudySession(session: StudySession): boolean {
  try {
    if (typeof localStorage === 'undefined' || !validStudySession(session, session.owner)) return false;
    if (session.index >= session.wordIds.length) localStorage.removeItem(prefix + session.owner);
    else localStorage.setItem(prefix + session.owner, JSON.stringify(session));
    return true;
  } catch { return false; }
}
export function clearStudySession(owner: string) {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(prefix + owner); } catch { /* Grades remain readable even when browser storage is unavailable. */ }
}
