import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeVocabularySearchText } from '@jp/shared';
import { conjugationVerbs, conjugationFor, conjugate, acceptsConjugation, createConjugationRound, confirmConjugation, advanceConjugation, retryConjugation, CONJUGATION_FORMS } from '../apps/web/src/services/conjugation';

const verb = (id: string) => conjugationVerbs.find(item => item.id === id)!;
const identity = (item: { term: string; reading: string }) => JSON.stringify([item.term.normalize('NFKC').trim(), normalizeVocabularySearchText(item.reading)]);
const source = new Set(['jlpt-n5','jlpt-n4','biaori-beginner-upper','biaori-beginner-lower'].flatMap(id => {
  const book = JSON.parse(readFileSync(new URL(`../apps/web/public/data/books/${id}.json`, import.meta.url), 'utf8'));
  return book.lessons.flatMap((lesson: { words: { term: string; reading: string }[] }) => lesson.words.map(identity));
}));

describe('curated conjugation practice', () => {
  it('uses actual catalog forms, distinct verbs and complete original sentence contexts', () => {
    expect(conjugationVerbs).toHaveLength(24);
    expect(new Set(conjugationVerbs.map(item => item.id)).size).toBe(24);
    for (const item of conjugationVerbs) {
      expect(item.forms.length).toBeGreaterThan(0);
      for (const form of item.forms) expect(source.has(identity(form)), JSON.stringify(form)).toBe(true);
      for (const form of CONJUGATION_FORMS) {
        expect(item.examples[form.id].ja.match(/\{answer\}/g)).toHaveLength(1);
        expect(item.examples[form.id].zh).toBeTruthy();
        expect(conjugate(item, form.id).reading).toMatch(/^[ぁ-ゖー]+$/u);
      }
    }
  });

  it('handles godan sound changes and the go exception using reference examples', () => {
    for (const [id, te, ta] of [
      ['write','書いて','書いた'], ['swim','泳いで','泳いだ'], ['speak','話して','話した'],
      ['wait','待って','待った'], ['read','読んで','読んだ'], ['play','遊んで','遊んだ'],
      ['buy','買って','買った'], ['return','帰って','帰った'], ['go','行って','行った'],
    ]) {
      expect(conjugate(verb(id), 'te').written).toBe(te);
      expect(conjugate(verb(id), 'ta').written).toBe(ta);
    }
  });

  it('distinguishes ru-ending groups and uses wa in negative u endings', () => {
    expect(conjugate(verb('cut'), 'nai').written).toBe('切らない');
    expect(conjugate(verb('enter'), 'masu').written).toBe('入ります');
    expect(conjugate(verb('borrow'), 'nai').written).toBe('借りない');
    expect(conjugate(verb('see'), 'masu').written).toBe('見ます');
    expect(conjugate(verb('buy'), 'nai').written).toBe('買わない');
    expect(conjugate(verb('exist'), 'nai').written).toBe('ない');
    expect(conjugate(verb('exist'), 'te').written).toBe('あって');
  });

  it('preserves irregular kuru readings and suru forms', () => {
    expect(CONJUGATION_FORMS.map(form => conjugate(verb('come'), form.id).reading)).toEqual(['きます','きて','きた','こない']);
    expect(CONJUGATION_FORMS.map(form => conjugate(verb('do'), form.id).written)).toEqual(['します','して','した','しない']);
  });

  it('accepts kana, kanji and half-width input while rejecting different conjugations', () => {
    const question = { id: 'go:te', verb: verb('go'), form: 'te' as const };
    for (const input of ['行って', 'いって', ' イッテ ', 'ｲｯﾃ']) expect(acceptsConjugation(question, input)).toBe(true);
    for (const input of ['', '行いて', 'いて', 'いった', '行きます']) expect(acceptsConjugation(question, input)).toBe(false);
    expect(conjugationFor({ term: '降ります', reading: 'ふります' })).toBeUndefined();
    expect(conjugationFor({ term: '来ます', reading: 'きます' })?.id).toBe('come');
  });

  it('does not confirm or advance twice, and retries only wrong questions', () => {
    let round = createConjugationRound([verb('go'), verb('come')], ['te'], 12, () => 0);
    const first = round.questions[0];
    expect(advanceConjugation(round, first.id)).toBe(round);
    round = confirmConjugation(round, first.id, 'wrong');
    expect(confirmConjugation(round, first.id, 'きて')).toBe(round);
    round = advanceConjugation(round, first.id);
    expect(advanceConjugation(round, first.id)).toBe(round);
    const second = round.questions[1];
    round = confirmConjugation(round, second.id, conjugate(second.verb, second.form).written);
    round = advanceConjugation(round, second.id);
    expect(Object.values(round.results).filter(item => item.correct)).toHaveLength(1);
    const retry = retryConjugation(round);
    expect(retry.questions.map(item => item.id)).toEqual([first.id]);
    expect(retry.index).toBe(0);
    expect(retry.results).toEqual({});
  });

  it('offers all four forms when focusing one verb and bounds the current round', () => {
    const mixed = createConjugationRound([verb('go')], CONJUGATION_FORMS.map(item => item.id));
    expect(mixed.questions.map(item => item.form)).toEqual(['masu','te','ta','nai']);
    const full = createConjugationRound(conjugationVerbs, ['te']);
    expect(full.questions).toHaveLength(12);
    expect(new Set(full.questions.map(item => item.id)).size).toBe(12);
    expect(createConjugationRound([], ['te']).questions).toEqual([]);
  });
});
