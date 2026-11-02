import { describe, expect, it } from 'vitest';
import { evaluate, initialState } from '@jp/core';
import { createQuestion } from '@jp/core';
import { emptyData, type Data, type QuizAttempt, type QuizType, type ReviewLog, type Word } from '@jp/models';
import { practiceFeedback } from '../apps/web/src/services/practice-feedback';
import { sessionSummary } from '../apps/web/src/services/study-feedback';

const now = new Date('2026-10-11T04:00:00.000Z');
const bookId = 'input-quiz-book';

function fixture(): Data {
  const data = emptyData();
  data.books = [{ id: bookId, title: 'Input quiz', description: '', language: 'ja', createdAt: now.toISOString(), updatedAt: now.toISOString() }];
  data.lessons = [{ id: 'input-lesson', bookId, title: '第一课', order: 1 }];
  data.words = [
    { id: 'input-word-1', lessonId: 'input-lesson', term: '言葉', reading: 'ことば', meaning: '词语', order: 1 },
    { id: 'input-word-2', lessonId: 'input-lesson', term: '毎日', reading: 'まいにち', meaning: '每天', order: 2 },
    { id: 'input-word-3', lessonId: 'input-lesson', term: '記憶', reading: 'きおく', meaning: '记忆', order: 3 },
  ];
  return data;
}

function attempt(type: 'kana-input' | 'dictation', isCorrect: boolean): QuizAttempt {
  return {
    type, prompt: type === 'dictation' ? '听写题目' : '键入假名', options: [],
    selected: isCorrect ? 'ことば' : 'ことは', correct: 'ことば', isCorrect,
  };
}

function record(data: Data, word: Word, rating: 1 | 2 | 3 | 4, options: {
  id: string; quiz?: ReviewLog['quiz']; reviewedAt?: Date;
}): ReviewLog {
  const previous = initialState(word.id, options.reviewedAt ?? now, 'local');
  previous.bookId = bookId;
  previous.lessonId = word.lessonId;
  const result = evaluate(previous, rating, 'new', options.reviewedAt ?? now, options.id, 220);
  if (options.quiz) result.log.quiz = options.quiz;
  data.logs.push(result.log);
  data.states.push(result.state);
  return result.log;
}

function ago(days: number): Date {
  return new Date(now.getTime() - days * 86400000);
}

describe('Web input-quiz feedback', () => {
  it('counts kana input and dictation as objective results, separate from self grades', () => {
    const data = fixture();
    record(data, data.words[0], 1, { id: 'input-wrong', quiz: attempt('kana-input', false) });
    record(data, data.words[1], 2, { id: 'dictation-right', quiz: attempt('dictation', true) });
    record(data, data.words[2], 4, { id: 'self-remembered' });

    const summary = sessionSummary(data, data.words, 3, [0, 0, 0]);

    expect(summary.quiz).toEqual({ total: 2, correct: 1, incorrect: 1, accuracy: 50 });
    expect(summary.self).toEqual({ total: 1, forgotten: 0, uncertain: 0, remembered: 1 });
    expect(summary.practiceWords.map(word => word.id)).toEqual(['input-word-1', 'input-word-2']);
  });

  it('tracks per-type retry until that type has a latest correct answer without mutating source data', () => {
    const data = fixture();
    record(data, data.words[0], 1, { id: 'input-old-wrong', quiz: attempt('kana-input', false), reviewedAt: ago(2) });
    record(data, data.words[0], 3, { id: 'input-latest-right', quiz: attempt('kana-input', true), reviewedAt: ago(1) });
    record(data, data.words[1], 1, { id: 'dictation-wrong', quiz: attempt('dictation', false) });
    record(data, data.words[2], 1, { id: 'self-forgotten' });
    const before = structuredClone(data);

    const report = practiceFeedback(data, now, 7, 'local', bookId);
    const inputRow = report.quiz.find(row => row.id === 'kana-input')!;
    const dictationRow = report.quiz.find(row => row.id === 'dictation')!;

    expect(inputRow).toMatchObject({ total: 2, correct: 1, incorrect: 1, accuracy: 50, practiceWordIds: [] });
    expect(dictationRow).toMatchObject({ total: 1, correct: 0, incorrect: 1, practiceWordIds: ['input-word-2'] });
    expect(report.self).toEqual({ total: 1, forgotten: 1, uncertain: 0, remembered: 0 });
    expect(data).toEqual(before);
  });

  it('does not turn input-only quiz modes into multiple-choice questions', () => {
    const data = fixture();
    const inputTypes: QuizType[] = ['kana-input', 'dictation'];

    for (const type of inputTypes) {
      expect(createQuestion(data.words[0], data.words, type)).toBeNull();
    }
  });
});
