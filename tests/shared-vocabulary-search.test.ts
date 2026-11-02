import { describe, expect, it } from 'vitest';
import { normalizeVocabularySearchText, rankVocabularyMatches, searchVocabulary, type SearchableVocabularyEntry } from '../packages/shared/src';

interface WordLike extends SearchableVocabularyEntry {
  note: string;
}

const entries: WordLike[] = [
  { id: 'substring', term: '大日本', reading: 'だいにほん', meaning: 'Japan', order: 0, note: 'substring result' },
  { id: 'prefix-b', term: '日本人', reading: 'にほんじん', meaning: 'person', order: 2, note: 'later prefix' },
  { id: 'prefix-a', term: '日本語', reading: 'にほんご', meaning: 'language', order: 1, note: 'earlier prefix' },
  { id: 'exact-raw', term: 'Nihon', rawTerm: '日本', reading: 'にほん', meaning: 'Japan', order: 5, note: 'raw term exact' },
  { id: 'meaning-prefix', term: '先生', reading: 'せんせい', meaning: '日本の教師', order: 3, note: 'meaning prefix' },
];

describe('shared vocabulary search', () => {
  it('normalizes NFKC width, Katakana to Hiragana, whitespace, and case', () => {
    expect(normalizeVocabularySearchText(' Ｎｉｈｏｎ　ﾆﾎﾝ カナ ')).toBe('nihonにほんかな');
    expect(searchVocabulary(entries, 'ニホン')[0].id).toBe('exact-raw');
  });

  it('ranks exact terms before ordered prefixes and substring matches for generic entries', () => {
    const results = searchVocabulary(entries, '日本');
    expect(results.map(entry => entry.id)).toEqual(['exact-raw', 'prefix-a', 'prefix-b', 'meaning-prefix', 'substring']);
    expect(results[0].note).toBe('raw term exact');
  });

  it('bounds invalid queries and limits, and keeps the first matching copy of an id', () => {
    expect(searchVocabulary(entries, '　 \n')).toEqual([]);
    expect(searchVocabulary(entries, '日'.repeat(41))).toEqual([]);
    expect(searchVocabulary(entries, '日本', -1)).toEqual([]);
    expect(searchVocabulary(entries, '日本', 1).map(entry => entry.id)).toEqual(['exact-raw']);
    expect(searchVocabulary([entries[0], { ...entries[0], term: '日本' }], '日本')).toEqual([entries[0]]);
  });

  it('places an exact Chinese meaning before a prefix match', () => {
    const words = [
      { id: 'prefix', term: '語', reading: 'ご', meaning: '词语及表达', order: 1 },
      { id: 'exact', term: '言葉', reading: 'ことば', meaning: '词语', order: 2 },
    ];
    expect(searchVocabulary(words, '词语').map(word => word.id)).toEqual(['exact', 'prefix']);
  });

  it('can rank every source before grouping while retaining the existing bounded search interface', () => {
    const sources = Array.from({length:120}, (_, index) => ({...entries[0], id:'source-'+index}));
    expect(rankVocabularyMatches(sources, '日本')).toHaveLength(120);
    expect(searchVocabulary(sources, '日本', 120)).toHaveLength(100);
    expect(rankVocabularyMatches(sources, '　')).toEqual([]);
  });
});
