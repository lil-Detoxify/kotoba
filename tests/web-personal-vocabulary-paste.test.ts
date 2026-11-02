import { describe, expect, it } from 'vitest';
import {
  cleanPersonalWord,
  parsePastedVocabulary,
  personalWordKey,
} from '../apps/web/src/services/personal-vocabulary';

describe('personal vocabulary paste parsing', () => {
  it('trims drafts, rejects empty fields, and canonicalizes reading keys', () => {
    expect(cleanPersonalWord({ term: ' 日本 ', reading: ' にほん ', meaning: ' 日本 ' })).toEqual({
      term: '日本', reading: 'にほん', meaning: '日本',
    });
    expect(() => cleanPersonalWord({ term: '日本', reading: '  ', meaning: '日本' })).toThrow('读音不能为空。');
    expect(personalWordKey(' ｶﾞｯｺｳ ', 'カタカナ')).toBe(personalWordKey('ガッコウ', 'かたかな'));
    expect(personalWordKey('日本', 'にほん')).not.toBe(personalWordKey('日本', 'にっぽん'));
  });

  it('parses positional TSV, skips blank rows, and deduplicates equivalent readings', () => {
    const result = parsePastedVocabulary([
      '日本\tニホン\t日本',
      '',
      '日本\tにほん\t日本',
      '日本\tにほん\t日本国',
    ].join('\n'));

    expect(result.words).toEqual([{ term: '日本', reading: 'ニホン', meaning: '日本' }]);
    expect(result.duplicateCount).toBe(1);
    expect(result.errors).toEqual([{ row: 4, message: '与第1行词形和读音相同，但中文释义不同。' }]);
  });

  it('parses quoted CSV fields and reports missing data at its original row', () => {
    const result = parsePastedVocabulary([
      'term,reading,meaning',
      '勉強,べんきょう,"study, learning，练习"',
      '',
      '学生,がくせい,',
    ].join('\n'));

    expect(result.words).toEqual([{ term: '勉強', reading: 'べんきょう', meaning: 'study, learning，练习' }]);
    expect(result.errors).toEqual([{ row: 4, message: '缺少中文释义。' }]);
  });

  it('accepts Chinese-comma tables and reorders Chinese headers', () => {
    expect(parsePastedVocabulary('释义，读音，单词\n学生，ガクセイ，学生')).toEqual({
      words: [{ term: '学生', reading: 'ガクセイ', meaning: '学生' }],
      errors: [],
      duplicateCount: 0,
    });
  });
});
