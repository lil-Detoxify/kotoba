import { describe, expect, it } from 'vitest';
import { analyzeKanaAnswer } from '../apps/web/src/services/kana-answer-diff';

describe('kana answer diff', () => {
  it('marks a missing small tsu and gives the gemination hint', () => {
    const diff = analyzeKanaAnswer('がこう', 'がっこう');
    expect(diff.matches).toBe(false);
    expect(diff.submitted).toEqual([{ text: 'がこう', kind: 'same' }]);
    expect(diff.correct).toEqual([{ text: 'が', kind: 'same' }, { text: 'っ', kind: 'missing' }, { text: 'こう', kind: 'same' }]);
    expect(diff.hint).toContain('促音「っ」');
  });

  it('marks small kana differences without treating them as ordinary letters', () => {
    const diff = analyzeKanaAnswer('きゆう', 'きゅう');
    expect(diff.submitted).toEqual([{ text: 'き', kind: 'same' }, { text: 'ゆ', kind: 'changed' }, { text: 'う', kind: 'same' }]);
    expect(diff.correct).toEqual([{ text: 'き', kind: 'same' }, { text: 'ゅ', kind: 'changed' }, { text: 'う', kind: 'same' }]);
    expect(diff.hint).toContain('小假名');
  });

  it('points out a clear unvoiced/voiced kana substitution', () => {
    const diff = analyzeKanaAnswer('かくせい', 'がくせい');
    expect(diff.submitted[0]).toEqual({ text: 'か', kind: 'changed' });
    expect(diff.correct[0]).toEqual({ text: 'が', kind: 'changed' });
    expect(diff.hint).toContain('浊音');
  });

  it('describes an extra small kana instead of instructing the learner to add one', () => {
    expect(analyzeKanaAnswer('がっっこう', 'がっこう').hint).toBe('这里多写了小假名「っ」。');
    expect(analyzeKanaAnswer('っき', 'つき').hint).toContain('应写「つ」');
  });

  it('identifies an explicitly missing long-vowel mark', () => {
    const diff = analyzeKanaAnswer('コヒー', 'コーヒー');
    expect(diff.correct).toEqual([{ text: 'こ', kind: 'same' }, { text: 'ー', kind: 'missing' }, { text: 'ひー', kind: 'same' }]);
    expect(diff.hint).toContain('长音符「ー」');
  });

  it('normalizes katakana, half-width kana, spaces, and decomposed voicing marks', () => {
    expect(analyzeKanaAnswer('ガッコウ', 'がっこう').matches).toBe(true);
    expect(analyzeKanaAnswer(' ｶﾞｯ ｺｳ　', 'がっこう').matches).toBe(true);
    expect(analyzeKanaAnswer('か\u3099こう', 'がこう').matches).toBe(true);
  });

  it('uses a generic missing-kana hint for vowel sequences without guessing long-vowel meaning', () => {
    const diff = analyzeKanaAnswer('おも', 'おもう');
    expect(diff.correct).toEqual([{ text: 'おも', kind: 'same' }, { text: 'う', kind: 'missing' }]);
    expect(diff.hint).toBe('少了「う」。');
  });

  it('asks the learner to listen and try again when the submitted answer is blank', () => {
    expect(analyzeKanaAnswer(null, 'がっこう')).toEqual({
      submitted: [],
      correct: [{ text: 'がっこう', kind: 'missing' }],
      hint: '先听一遍，再试着输入。',
      matches: false,
    });
    expect(analyzeKanaAnswer('   ', 'がっこう').hint).toBe('先听一遍，再试着输入。');
  });
});
