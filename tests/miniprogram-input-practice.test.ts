import { describe, expect, it } from 'vitest';
import type { Word } from '@jp/models';
import { createInputQuestion, inputAttempt, normalizeKanaAnswer } from '../apps/miniprogram/src/services/input-practice';

const school: Word = {
  id: 'school', lessonId: 'lesson', term: '学校', reading: 'がっこう', meaning: '学校', order: 1,
};

describe('mini program kana input contract', () => {
  it('keeps dictation answers out of the visible prompt and records the source word', () => {
    const question = createInputQuestion(school, 'dictation')!;
    expect(question.prompt).toBe('');
    expect(question.wordId).toBe('school');
    expect(inputAttempt(question, 'ｶﾞｯｺｳ')).toMatchObject({
      type: 'dictation', prompt: '', selected: 'ｶﾞｯｺｳ', correct: 'がっこう', isCorrect: true,
    });
    expect(school.reading).toBe('がっこう');
  });

  it('accepts script variants while retaining meaningful kana differences', () => {
    const question = createInputQuestion(school, 'kana-input')!;
    expect(inputAttempt(question, ' ガッコウ ').isCorrect).toBe(true);
    expect(inputAttempt(question, 'がこう').isCorrect).toBe(false);
    expect(normalizeKanaAnswer('コーヒー')).not.toBe(normalizeKanaAnswer('コヒ'));
    expect(normalizeKanaAnswer('ぢ')).not.toBe(normalizeKanaAnswer('じ'));
  });

  it('rejects unavailable or ambiguous readings instead of building unanswerable input questions', () => {
    for (const reading of ['', '/', 'あめ／あま', 'gakkou']) {
      expect(createInputQuestion({ ...school, reading }, 'dictation')).toBeNull();
    }
    expect(inputAttempt(createInputQuestion(school, 'kana-input')!, null)).toMatchObject({ selected: null, isCorrect: false });
  });
});
