import type { ExerciseType, InputQuizType, Lesson, QuizAttempt, QuizType, ReadingContext, ReviewLog, SyncQueueItem, UserSettings, Word, WordState } from '@jp/models';
import type { CheckAccountResult } from '@jp/sync';
import type { CloudAuthStatus, CloudOperationResult } from './cloud';
import type { SendCodeResult } from './cloud-client';
import type { PersonalLibraryMutation } from './personal-library';
import type { PersonalBackupView } from './personal-library-backup';
import type { ExistingContentPolicy } from '../../web/src/services/personal-library';

export interface ExtensionWord extends Word {
  /** Explicit book association keeps portable lesson IDs unchanged. */
  bookId?: string;
  source: 'textbook' | 'manual';
  bookTitle: string;
  lessonTitle: string;
}
export interface SavedWord {
  word: ExtensionWord;
  savedAt: string;
  sourceHost?: string;
  state: WordState;
}
export interface ExtensionBook {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  source: 'textbook' | 'manual';
  createdAt?: string;
  updatedAt?: string;
  cover?: string;
}
export interface ExtensionQuizAttempt extends QuizAttempt {
  id: string;
  requestId: string;
  wordId: string;
  elapsedMs: number;
  recordedAt: string;
}
export interface LearningRecords {
  /** Imported wordbook metadata and words are independent from saved/favorite words. */
  books: ExtensionBook[];
  words: ExtensionWord[];
  lessons?: Lesson[];
  builtinContexts?: Array<{ bookId: string; wordId: string; contexts: ReadingContext[] }>;
  /** Canonical local progress, mirrored to SavedWord.state for legacy readers. */
  states: WordState[];
  logs: ReviewLog[];
  quizAttempts: ExtensionQuizAttempt[];
  userSettings?: UserSettings;
  guestClaimedBy?: string;
  guestClaimedRevision?: string;
}
export type MotionMode = 'standard' | 'reduced';
export type ExtensionExerciseType = ExerciseType | InputQuizType | 'sentence-cloze';
export interface ExtensionPreferences {
  motion: MotionMode;
  dailyGoal: number;
  voice: 'female' | 'male';
  exerciseType: ExtensionExerciseType;
  selectedBookIds: string[];
  /** True after an explicit local range selection, including an empty range. */
  selectedBookIdsExplicit: boolean;
}
/** Schema 1 is deliberately retained; missing learning/preferences fields are hydrated when read. */
export interface ExtensionSnapshot {
  schema: 1;
  words: SavedWord[];
  logs: ReviewLog[];
  preferences: ExtensionPreferences;
  learning: LearningRecords;
  syncQueue: SyncQueueItem[];
  /** Runtime-only partition identity. It is never persisted in the snapshot row. */
  identity?: { partitionKey: string; userId: string };
}
export interface LookupRequest { text: string; sourceHost?: string; requestId: string }
export interface LearningLaunchRequest {
  id: number;
  owner: string;
  kind: 'daily' | 'review' | 'resume' | 'library' | 'scene' | 'feedback' | 'personal-context';
  bookId?: string;
  sceneId?: string;
  exercise?: ExtensionExerciseType;
  range?: 7 | 30;
  readingContextIds?: Record<string, string>;
}
export interface HistoricalPracticeRequest { bookId: string; type: QuizType; range: 7 | 30 }
export type LearningMode = 'new' | 'review' | 'difficult';
export interface StudyQueueOptions {
  mode: LearningMode;
  bookIds?: string[];
  lessonIds?: string[];
  limit?: number;
  now?: Date;
}
export interface StudyQueueItem { word: ExtensionWord; state: WordState }
export interface LearningFlagPatch { isDifficult?: boolean; isIgnored?: boolean }
export interface QuizAttemptInput {
  requestId: string;
  wordId: string;
  word: ExtensionWord;
  type: QuizType;
  prompt: string;
  options: string[];
  selected: string | null;
  correct: string;
  elapsedMs: number;
}
export interface LearningStatistics {
  total: number;
  learned: number;
  mastered: number;
  percent: number;
  new: number;
  due: number;
  difficult: number;
  newToday: number;
  reviewToday: number;
  totalReviews: number;
  streak: number;
  todayCount: number;
  dailyGoal: number;
  goalRemaining: number;
  days: Array<{ day: string; label: string; count: number }>;
  quiz: { attempts: number; correct: number; accuracy: number; elapsedMs: number };
}
export interface ExtensionApi {
  authStatus(): Promise<CloudAuthStatus>;
  checkAccount(email: string): Promise<CheckAccountResult>;
  sendCode(email: string): Promise<SendCodeResult>;
  login(email: string, password: string): Promise<CloudOperationResult>;
  register(email: string, password: string, code: string, verificationId?: string, flow?: 'register' | 'legacy_upgrade'): Promise<CloudOperationResult>;
  logout(): Promise<CloudAuthStatus>;
  sync(options?: { mergeGuest?: boolean }): Promise<CloudOperationResult>;
  loadCatalog(): Promise<ExtensionWord[]>;
  read(): Promise<ExtensionSnapshot>;
  save(word: ExtensionWord, sourceHost?: string): Promise<ExtensionSnapshot>;
  remove(wordId: string): Promise<ExtensionSnapshot>;
  rate(wordId: string, rating: 1 | 2 | 3 | 4, requestId: string, expectedReviewCount: number): Promise<ExtensionSnapshot>;
  setMotion(mode: MotionMode): Promise<ExtensionSnapshot>;
  getLearningQueue(words: ExtensionWord[], options: StudyQueueOptions): Promise<StudyQueueItem[]>;
  rateLearning(word: ExtensionWord, rating: 1 | 2 | 3 | 4, requestId: string, expectedReviewCount: number, mode: LearningMode, elapsedMs: number, quizRequestId?: string, sceneId?: string, feedbackPractice?: boolean, personalContextId?: string): Promise<ExtensionSnapshot>;
  setLearningFlags(wordId: string, patch: LearningFlagPatch, word: ExtensionWord): Promise<ExtensionSnapshot>;
  recordQuizAttempt(attempt: QuizAttemptInput): Promise<ExtensionSnapshot>;
  importCustomBook(input: { text: string; format: 'csv' | 'json'; title: string }): Promise<ExtensionSnapshot>;
  mutatePersonalLibrary(action: PersonalLibraryMutation): Promise<ExtensionSnapshot>;
  readPersonalBackup(): Promise<PersonalBackupView>;
  savePersonalBackup(): Promise<PersonalBackupView>;
  mergePersonalBackup(policy: ExistingContentPolicy): Promise<ExtensionSnapshot>;
  setDailyGoal(goal: number): Promise<ExtensionSnapshot>;
  setVoice(voice: 'female' | 'male'): Promise<ExtensionSnapshot>;
  setExerciseType(type: ExtensionExerciseType): Promise<ExtensionSnapshot>;
  setSelectedBookIds(ids: string[]): Promise<ExtensionSnapshot>;
  subscribeLookup(handler: (request: LookupRequest) => void): () => void;
}
export const emptySnapshot = (): ExtensionSnapshot => ({
  schema: 1,
  words: [],
  logs: [],
  preferences: { motion: 'standard', dailyGoal: 20, voice: 'female', exerciseType: 'card', selectedBookIds: [], selectedBookIdsExplicit: false },
  learning: { books: [], words: [], states: [], logs: [], quizAttempts: [] },
  syncQueue: []
});
