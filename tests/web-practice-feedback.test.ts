import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import { emptyData, type Data, type QuizType, type ReviewLog, type Word } from '@jp/models';
import { practiceFeedback } from '../apps/web/src/services/practice-feedback';

const now = new Date(2026, 9, 10, 12, 0, 0);
const bookA = 'jlpt-n5';
const bookB = 'jlpt-n4';
const stamp = (daysAgo = 0, hour = 10, minute = 0) => new Date(
  now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, 0,
).toISOString();

function fixture(): Data {
  const data = emptyData();
  data.books = [
    { id: bookA, title: 'A', description: '', language: 'ja', createdAt: stamp(), updatedAt: stamp() },
    { id: bookB, title: 'B', description: '', language: 'ja', createdAt: stamp(), updatedAt: stamp() },
  ];
  data.lessons = [
    { id: 'lesson-a', bookId: bookA, title: 'A课', order: 1 },
    { id: 'lesson-b', bookId: bookB, title: 'B课', order: 1 },
  ];
  data.words = [
    { id: 'word-a', lessonId: 'lesson-a', term: '言葉', reading: 'ことば', meaning: '词语', order: 1 },
    { id: 'word-b', lessonId: 'lesson-a', term: '毎日', reading: 'まいにち', meaning: '每天', order: 2 },
    { id: 'word-c', lessonId: 'lesson-b', term: '記憶', reading: 'きおく', meaning: '记忆', order: 1 },
  ];
  return data;
}

interface ReviewInput {
  id: string;
  wordId: string;
  reviewedAt?: string;
  type?: QuizType;
  isCorrect?: boolean;
  rating?: 1 | 2 | 3 | 4;
  userId?: string;
  stateBookId?: string;
  stateLessonId?: string;
  snapshotFrom?: 'new' | 'previous';
}

function addReview(data: Data, input: ReviewInput): ReviewLog {
  const word = data.words.find(item => item.id === input.wordId);
  const lessonId = input.stateLessonId ?? word?.lessonId;
  const bookId = input.stateBookId ?? data.lessons.find(item => item.id === lessonId)?.bookId;
  const userId = input.userId ?? 'local';
  const reviewedAt = input.reviewedAt ?? stamp();
  const parsedTime = Date.parse(reviewedAt);
  const snapshot = initialState(input.wordId, new Date(Number.isFinite(parsedTime) ? parsedTime : now), userId);
  snapshot.lessonId = lessonId;
  snapshot.bookId = bookId;
  snapshot.reviewCount = 1;
  const log: ReviewLog = {
    id: input.id, userId, wordId: input.wordId, reviewedAt, rating: input.rating ?? 2,
    responseTime: 125, previousState: snapshot, newState: snapshot, studyMode: 'new',
  };
  if (input.snapshotFrom === 'previous') {
    log.previousState = { ...snapshot, bookId, lessonId };
    log.newState = initialState(input.wordId, new Date(reviewedAt), userId);
  }
  if (input.type) {
    log.quiz = {
      type: input.type, prompt: 'prompt', options: ['answer', 'other'], selected: input.isCorrect ? 'answer' : 'other',
      correct: 'answer', isCorrect: input.isCorrect ?? false,
    };
  }
  data.logs.push(log);
  return log;
}

const quizTypes: QuizType[] = ['kana-meaning', 'kanji-reading', 'audio-meaning'];

describe('practice feedback', () => {
  it('uses the objective quiz result even when a correct guess received rating 2', () => {
    const data = fixture();
    addReview(data, { id: 'guess', wordId: 'word-a', type: 'kana-meaning', isCorrect: true, rating: 2 });

    const result = practiceFeedback(data, now, 7, 'local', bookA);
    const row = result.quiz.find(item => item.id === 'kana-meaning')!;

    expect(row).toMatchObject({ total: 1, correct: 1, incorrect: 0, accuracy: 100, practiceWordIds: [], unresolvedWordIds: [] });
    expect(row.previewWords).toEqual([]);
    expect(result.self).toEqual({ total: 0, forgotten: 0, uncertain: 0, remembered: 0 });
  });

  it('uses each word’s latest result per question type and removes a word after its latest correct answer', () => {
    const data = fixture();
    addReview(data, { id: 'kana-wrong', wordId: 'word-a', type: 'kana-meaning', isCorrect: false, reviewedAt: stamp(2) });
    addReview(data, { id: 'kana-right', wordId: 'word-a', type: 'kana-meaning', isCorrect: true, reviewedAt: stamp(1) });
    addReview(data, { id: 'kanji-wrong', wordId: 'word-a', type: 'kanji-reading', isCorrect: false, reviewedAt: stamp(1) });

    const result = practiceFeedback(data, now, 7, 'local', bookA);

    expect(result.quiz.find(item => item.id === 'kana-meaning')).toMatchObject({ total: 2, correct: 1, incorrect: 1, practiceWordIds: [] });
    expect(result.quiz.find(item => item.id === 'kanji-reading')).toMatchObject({ total: 1, correct: 0, incorrect: 1, practiceWordIds: ['word-a'] });
    expect(result.quiz.find(item => item.id === 'audio-meaning')).toMatchObject({ total: 0, accuracy: null });
  });

  it('retains ignored-word history but excludes it from practice and reports unloaded false candidates as unresolved', () => {
    const data = fixture();
    const ignored = initialState('word-a');
    ignored.isIgnored = true;
    data.states.push(ignored);
    addReview(data, { id: 'ignored-false', wordId: 'word-a', type: 'kana-meaning', isCorrect: false });
    const unloadedId = `${bookA}-w-unloaded`;
    addReview(data, { id: 'unloaded-false', wordId: unloadedId, type: 'kana-meaning', isCorrect: false, stateBookId: bookA });

    const row = practiceFeedback(data, now, 7, 'local', bookA).quiz.find(item => item.id === 'kana-meaning')!;

    expect(row).toMatchObject({ total: 2, incorrect: 2, practiceWordIds: [], unresolvedWordIds: [unloadedId] });
    expect(row.previewWords).toEqual([]);
  });

  it('uses a loaded word first, a known source prefix next, and snapshots for legacy IDs', () => {
    const data = fixture();
    addReview(data, { id: 'word-wins', wordId: 'word-a', type: 'kana-meaning', isCorrect: false, stateBookId: bookB });
    addReview(data, { id: 'prefix-wins', wordId: `${bookB}-w-from-prefix`, type: 'kana-meaning', isCorrect: false, stateLessonId: 'lesson-a' });
    addReview(data, { id: 'new-state-lesson', wordId: 'legacy-newstate', type: 'kana-meaning', isCorrect: false, stateLessonId: 'lesson-a' });
    addReview(data, { id: 'previous-state-book', wordId: 'legacy-previous', type: 'kana-meaning', isCorrect: false, stateBookId: bookA, snapshotFrom: 'previous' });
    addReview(data, { id: 'prefix', wordId: `${bookA}-w-missing-3`, type: 'kana-meaning', isCorrect: false });
    addReview(data, { id: 'no-owner', wordId: 'unlocated', type: 'kana-meaning', isCorrect: false });
    const row = practiceFeedback(data, now, 7, 'local', bookA).quiz.find(item => item.id === 'kana-meaning')!;
    expect(row).toMatchObject({ total: 4, incorrect: 4, practiceWordIds: ['word-a'] });
    expect(row.unresolvedWordIds).toEqual([`${bookA}-w-missing-3`]);
  });

  it('deduplicates log IDs and filters the local-date range, owner, and selected book', () => {
    const data = fixture();
    addReview(data, { id: 'same-id', wordId: 'word-a', type: 'kana-meaning', isCorrect: false, reviewedAt: stamp(1) });
    addReview(data, { id: 'same-id', wordId: 'word-b', type: 'kana-meaning', isCorrect: false, reviewedAt: stamp(1) });
    addReview(data, { id: 'edge-in', wordId: 'word-b', type: 'kana-meaning', isCorrect: true, reviewedAt: stamp(6, 0) });
    addReview(data, { id: 'edge-out', wordId: 'word-b', type: 'kana-meaning', isCorrect: false, reviewedAt: stamp(7, 23, 59) });
    addReview(data, { id: 'future', wordId: 'word-b', type: 'kana-meaning', isCorrect: false, reviewedAt: stamp(-1) });
    addReview(data, { id: 'invalid-date', wordId: 'word-b', type: 'kana-meaning', isCorrect: false, reviewedAt: 'not-a-date' });
    addReview(data, { id: 'other-owner', wordId: 'word-b', type: 'kana-meaning', isCorrect: false, userId: 'other' });
    addReview(data, { id: 'other-book', wordId: 'word-c', type: 'kana-meaning', isCorrect: false });

    const result = practiceFeedback(data, now, 7, 'local', bookA);
    const row = result.quiz.find(item => item.id === 'kana-meaning')!;

    expect(row).toMatchObject({ total: 2, correct: 1, incorrect: 1 });
    expect(practiceFeedback(data, now, 7, 'local', 'missing-book').quiz.every(item => item.total === 0 && item.accuracy === null)).toBe(true);
  });

  it('counts self ratings only for logs without a quiz and ignores malformed quiz types', () => {
    const data = fixture();
    addReview(data, { id: 'forgotten', wordId: 'word-a', rating: 1 });
    addReview(data, { id: 'uncertain', wordId: 'word-a', rating: 2 });
    addReview(data, { id: 'remembered-3', wordId: 'word-a', rating: 3 });
    addReview(data, { id: 'remembered-4', wordId: 'word-a', rating: 4 });
    addReview(data, { id: 'objective', wordId: 'word-a', type: 'kana-meaning', isCorrect: true, rating: 2 });
    const malformed = addReview(data, { id: 'bad-type', wordId: 'word-a', rating: 1 });
    malformed.quiz = { type: 'card' as QuizType, prompt: 'p', options: [], selected: null, correct: '', isCorrect: false };

    const result = practiceFeedback(data, now, 7, 'local', bookA);

    expect(result.self).toEqual({ total: 4, forgotten: 1, uncertain: 1, remembered: 2 });
    expect(result.quiz.find(item => item.id === 'kana-meaning')).toMatchObject({ total: 1, correct: 1 });
  });

  it('returns null accuracy for empty type rows rather than a fabricated zero percent', () => {
    const result = practiceFeedback(emptyData(), now, 30, 'local');

    expect(result.quiz.map(item => item.id)).toEqual([...quizTypes,'kana-input','dictation']);
    expect(result.quiz.every(item => item.total === 0 && item.correct === 0 && item.incorrect === 0 && item.accuracy === null)).toBe(true);
    expect(result.self).toEqual({ total: 0, forgotten: 0, uncertain: 0, remembered: 0 });
  });

  it('does not mutate words, states, or source review records while building feedback', () => {
    const data = fixture();
    const state = initialState('word-a', now);
    state.bookId = bookA;
    state.lessonId = 'lesson-a';
    state.isDifficult = true;
    data.states.push(state);
    addReview(data, { id: 'source', wordId: 'word-a', type: 'kana-meaning', isCorrect: false });
    const before = structuredClone(data);

    practiceFeedback(data, now, 7, 'local', bookA);

    expect(data).toEqual(before);
  });
});
