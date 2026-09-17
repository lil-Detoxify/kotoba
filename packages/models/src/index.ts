import type { Card, Grade } from 'ts-fsrs';
export interface Book {id:string;title:string;description:string;language:string;cover?:string;createdAt:string;updatedAt:string}
export interface Lesson {id:string;bookId:string;title:string;order:number}
export interface Word {id:string;lessonId:string;term:string;reading:string;meaning:string;order:number;partOfSpeech?:string;accent?:string;example?:string;exampleTranslation?:string;audioUrl?:string;note?:string;definitionJa?:string;definitionZh?:string;exampleReading?:string;senses?:WordSense[]}
export interface WordSense {meaning:string;definitionJa?:string;partOfSpeech?:string;example?:string;exampleReading?:string;exampleTranslation?:string}
export type ExerciseType='card'|'kana-meaning'|'kanji-reading'|'audio-meaning'|'mixed';
export type QuizType=Exclude<ExerciseType,'card'|'mixed'>;
export interface QuizAttempt {type:QuizType;prompt:string;options:string[];selected:string|null;correct:string;isCorrect:boolean}
export type StudyMode='new'|'review'|'difficult';
export interface WordState {userId:string;wordId:string;status:'new'|'learning'|'review'|'mastered';isIgnored:boolean;isDifficult:boolean;firstSeenAt?:string;lastReviewedAt?:string;nextReviewAt?:string;reviewCount:number;lapseCount:number;card:Card}
export interface ReviewLog {id:string;userId:string;wordId:string;reviewedAt:string;rating:Grade;responseTime:number;previousState:WordState;newState:WordState;studyMode:StudyMode;quiz?:QuizAttempt}
export interface Data {books:Book[];lessons:Lesson[];words:Word[];states:WordState[];logs:ReviewLog[];currentBookId?:string;seeded:boolean;textbooksVersion?:string}
export const emptyData=():Data=>({books:[],lessons:[],words:[],states:[],logs:[],seeded:false});
