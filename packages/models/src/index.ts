import type { Card, Grade } from 'ts-fsrs';
export interface Book {id:string;title:string;description:string;language:string;cover?:string;createdAt:string;updatedAt:string}
export interface Lesson {id:string;bookId:string;title:string;order:number}
export interface Word {id:string;lessonId:string;term:string;reading:string;meaning:string;order:number;partOfSpeech?:string;accent?:string;example?:string;exampleTranslation?:string;audioUrl?:string;audioTerm?:string;rawTerm?:string;note?:string;definitionJa?:string;definitionZh?:string;exampleReading?:string;senses?:WordSense[]}
export interface WordSense {meaning:string;definitionJa?:string;partOfSpeech?:string;example?:string;exampleReading?:string;exampleTranslation?:string}
export type ExerciseType='card'|'kana-meaning'|'kanji-reading'|'audio-meaning'|'mixed';
export type QuizType=Exclude<ExerciseType,'card'|'mixed'>;
export interface QuizAttempt {type:QuizType;prompt:string;options:string[];selected:string|null;correct:string;isCorrect:boolean}
export type StudyMode='new'|'review'|'difficult';
export interface WordState {
  userId: string;
  wordId: string;
  status: 'new' | 'learning' | 'review' | 'mastered';
  isIgnored: boolean;
  isDifficult: boolean;
  firstSeenAt?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  reviewCount: number;
  lapseCount: number;
  card: Card;
  bookId?: string;
  lessonId?: string;
  difficultUpdatedAt?: string;
  ignoredUpdatedAt?: string;
  updatedAt?: string;
}

export interface ReviewLog {
  id: string;
  userId: string;
  wordId: string;
  reviewedAt: string;
  rating: Grade;
  responseTime: number;
  previousState: WordState;
  newState: WordState;
  studyMode: StudyMode;
  quiz?: QuizAttempt;
  deviceId?: string;
  clientCreatedAt?: string;
  serverReceivedAt?: string;
}

export interface ReviewEvent {
  _id: string;
  userId: string;
  wordId: string;
  reviewedAt: string;
  rating: Grade;
  responseTime: number;
  studyMode: StudyMode;
  deviceId?: string;
  clientCreatedAt: string;
  serverReceivedAt?: string;
  quiz?: QuizAttempt;
}

export interface UserSettings {
  userId: string;
  email?: string;
  currentBookId?: string;
  lastStudiedPosition?: {
    bookId: string;
    lessonId: string;
    wordId: string;
    updatedAt: string;
  };
  preferences?: {
    pronunciationVoice?: 'female' | 'male';
  };
  updatedAt: string;
}

export interface CloudProgressDoc {
  _id: string;
  userId: string;
  wordId: string;
  bookId?: string;
  lessonId?: string;
  status: 'new' | 'learning' | 'review' | 'mastered';
  firstSeenAt?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  reviewCount: number;
  lapseCount: number;
  card: Card;
  isDifficult: boolean;
  difficultUpdatedAt?: string;
  isIgnored: boolean;
  ignoredUpdatedAt?: string;
  updatedAt: string;
  version: number;
}

export interface SyncQueueItem {
  id: string;
  type: 'progress' | 'review_event' | 'settings';
  payload: any;
  createdAt: string;
  retries: number;
}

export interface SyncBootstrapResult {
  userId: string;
  hasCloudData: boolean;
  progressCount: number;
  eventCount: number;
}

export interface Data {
  books: Book[];
  lessons: Lesson[];
  words: Word[];
  states: WordState[];
  logs: ReviewLog[];
  currentBookId?: string;
  seeded: boolean;
  textbooksVersion?: string;
  textbooksWordsVersion?: string;
  userSettings?: UserSettings;
}

export const emptyData = (): Data => ({ books: [], lessons: [], words: [], states: [], logs: [], seeded: false });
