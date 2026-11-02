import { describe, expect, it } from 'vitest';
import type { Word } from '@jp/models';
import { createInputQuestion, inputAttempt, normalizeKanaAnswer } from '../apps/web/src/services/kana-input';

function word(overrides: Partial<Word> = {}): Word {
  return {
    id: 'word-1',
    lessonId: 'lesson-1',
    term: '学校',
    reading: 'がっこう',
    meaning: '学校；学校机构',
    order: 1,
    ...overrides,
  };
}

describe('kana input and dictation questions', () => {
  it('uses the written term with Han and falls back to Chinese meaning without Han', () => {
    const han = word();
    const withHan = createInputQuestion(han, 'kana-input');
    expect(withHan).toMatchObject({ wordId: 'word-1', prompt: '学校', correct: 'がっこう' });
    expect(withHan?.prompt).not.toContain(han.reading);

    const kanaOnly = word({ term: 'がっこう', meaning: '学校' });
    expect(createInputQuestion(kanaOnly, 'kana-input')?.prompt).toBe('学校');
  });

  it('keeps dictation cues empty while preserving the source word id and meaning', () => {
    const question = createInputQuestion(word(), 'dictation');
    expect(question).toEqual({
      type: 'dictation', wordId: 'word-1', prompt: '', meaning: '学校；学校机构', correct: 'がっこう',
    });
  });

  it('normalizes corpus katakana, half-width input, decomposed voicing, spaces, and Japanese marks', () => {
    expect(createInputQuestion(word({ term: 'エレベーター', reading: 'エレベーター' }), 'kana-input')?.correct).toBe('えれべーたー');
    expect(normalizeKanaAnswer(' ｶﾞｯ ｺｳ　')).toBe('がっこう');
    expect(normalizeKanaAnswer('か\u3099')).toBe('が');
    expect(normalizeKanaAnswer('コーヒー・ショップ')).toBe('こーひー・しょっぷ');
  });

  it('rejects missing, romanized, and explicitly ambiguous source readings', () => {
    expect(createInputQuestion(word({ reading: '   ' }), 'kana-input')).toBeNull();
    expect(createInputQuestion(word({ reading: 'gakkou' }), 'dictation')).toBeNull();
    expect(createInputQuestion(word({ reading: 'あめ／あま' }), 'kana-input')).toBeNull();
  });

  it('grades normalized answers without merging long vowels, small tsu, or ji/di readings', () => {
    const source = word();
    const question = createInputQuestion(source, 'kana-input')!;
    expect(question.wordId).toBe('word-1');
    expect(inputAttempt(question, ' ｶﾞｯｺｳ ').isCorrect).toBe(true);
    expect(inputAttempt(question, null)).toMatchObject({ type: 'kana-input', prompt: '学校', options: [], selected: null, correct: 'がっこう', isCorrect: false });
    const dictation = createInputQuestion(source, 'dictation')!;
    expect(inputAttempt(dictation, 'ガッコウ')).toMatchObject({ type: 'dictation', prompt: '', options: [], selected: 'ガッコウ', correct: 'がっこう', isCorrect: true });
    expect(normalizeKanaAnswer('てんきー')).not.toBe(normalizeKanaAnswer('てんき'));
    expect(normalizeKanaAnswer('きって')).not.toBe(normalizeKanaAnswer('きて'));
    expect(normalizeKanaAnswer('じ')).not.toBe(normalizeKanaAnswer('ぢ'));
    expect(inputAttempt(createInputQuestion(word({ term: '天気', reading: 'てんき' }), 'kana-input')!, 'てんきー').isCorrect).toBe(false);
    expect(inputAttempt(createInputQuestion(word({ term: '切手', reading: 'きって' }), 'kana-input')!, 'きて').isCorrect).toBe(false);
    expect(inputAttempt(createInputQuestion(word({ term: '地', reading: 'ぢ' }), 'dictation')!, 'じ').isCorrect).toBe(false);
    expect(source.reading).toBe('がっこう');
  });
});
