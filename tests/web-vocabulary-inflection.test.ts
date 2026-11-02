import { describe, expect, it } from 'vitest';
import { searchVocabularyEntries, type VocabularySearchEntry } from '../apps/web/src/services/vocabulary-search';

function word(id: string, term: string, reading: string, partOfSpeech?: string, order = 1): VocabularySearchEntry {
  return { id, term, reading, partOfSpeech, order, meaning: '测试释义', lessonId: 'lesson', bookId: 'book', bookTitle: '词书', lessonTitle: '第1课', source: 'custom' };
}

describe('Web inflected vocabulary lookup', () => {
  it('matches polite verb forms against both dictionary and textbook masu entries', () => {
    const entries = [word('dictionary', '食べる', 'たべる', '一段动词'), word('textbook', '食べます', 'たべます', '[动2]')];
    for (const query of ['食べました', '食べません', '食べませんでした', 'タベマシタ', '食べたいです']) {
      const result = searchVocabularyEntries(entries, query);
      expect(result.map(item => item.id), query).toEqual(['dictionary', 'textbook']);
      expect(result.every(item => item.inflection?.baseTerm === '食べる'), query).toBe(true);
      expect(result[1].term).toBe('食べます');
    }
  });

  it('handles each godan sound change and the special iku past form', () => {
    const cases = [
      ['買う', 'かう', '買った', '買って'], ['待つ', 'まつ', '待った', '待って'],
      ['帰る', 'かえる', '帰った', '帰って'], ['読む', 'よむ', '読んだ', '読んで'],
      ['遊ぶ', 'あそぶ', '遊んだ', '遊んで'], ['死ぬ', 'しぬ', '死んだ', '死んで'],
      ['書く', 'かく', '書いた', '書いて'], ['泳ぐ', 'およぐ', '泳いだ', '泳いで'],
      ['話す', 'はなす', '話した', '話して'], ['行く', 'いく', '行った', '行って'],
    ];
    for (const [term, reading, past, te] of cases) {
      const entries = [word('verb', term, reading, '五段动词')];
      for (const query of [past, te]) expect(searchVocabularyEntries(entries, query)[0]?.id, query).toBe('verb');
    }
    const entries = [word('masu', '行きます', 'いきます', '[动1]')];
    expect(searchVocabularyEntries(entries, '行った')[0]?.inflection?.baseTerm).toBe('行く');
    expect(searchVocabularyEntries(entries, '行かなかった')[0]?.id).toBe('masu');
    expect(searchVocabularyEntries(entries, '行いた')).toEqual([]);
    expect(searchVocabularyEntries(entries, '行いて')).toEqual([]);
    expect(searchVocabularyEntries([word('iku-alias', '逝く', 'いく', '五段动词')], '逝った')[0]?.id).toBe('iku-alias');
    const aru = [word('aru', 'ある', 'ある', '五段动词')];
    expect(searchVocabularyEntries(aru, 'ない')[0]?.id).toBe('aru');
    expect(searchVocabularyEntries(aru, 'あらない')).toEqual([]);
  });

  it('keeps suru, kuru and homograph readings distinct while allowing real ambiguity', () => {
    const entries = [
      word('suru', 'する', 'する', 'サ变动词'), word('suru-masu', 'します', 'します', '[动3]'),
      word('study', '勉強', 'べんきょう', '名词・サ变动词'),
      word('kuru', '来る', 'くる', 'カ变自动词'), word('kuru-masu', '来ます', 'きます', '[动3]'),
      word('kitaru', '来る', 'きたる', '五段动词'), word('kiru', '着る', 'きる', '一段动词'),
    ];
    expect(searchVocabularyEntries(entries, 'しました').map(item => item.id)).toEqual(['suru', 'suru-masu']);
    expect(searchVocabularyEntries(entries, '勉強しなかった')[0]?.id).toBe('study');
    expect(searchVocabularyEntries(entries, 'きました').map(item => item.id)).toEqual(['kuru', 'kuru-masu', 'kiru']);
    expect(searchVocabularyEntries(entries, '来た').map(item => item.id)).toEqual(['kuru', 'kuru-masu']);
    expect(searchVocabularyEntries(entries, 'こなかった').map(item => item.id)).toEqual(['kuru', 'kuru-masu']);
  });

  it('recognizes negative past, te-iru and adjective forms without guessing noun conjugations', () => {
    const entries = [
      word('eat', '食べます', 'たべます', '[动2]'), word('read', '読む', 'よむ', '五段动词'),
      word('high', '高い', 'たかい', '[形1]'), word('good', 'いい', 'いい', '形容词'),
      word('quiet', '静か', 'しずか', '[形2]'), word('pretty', 'きれい', 'きれい', '形容动词'),
      word('noun', '思い', 'おもい', '名词'),
    ];
    for (const [query, id] of [
      ['食べなかった', 'eat'], ['食べていました', 'eat'], ['読んでいます', 'read'],
      ['高くなかった', 'high'], ['高くないです', 'high'], ['よかった', 'good'],
      ['静かでした', 'quiet'], ['きれいじゃなかったです', 'pretty'],
    ]) expect(searchVocabularyEntries(entries, query)[0]?.id, query).toBe(id);
    expect(searchVocabularyEntries(entries, '思かった')).toEqual([]);
    expect(searchVocabularyEntries(entries, 'きれかった')).toEqual([]);
    expect(searchVocabularyEntries(entries, '食べられさせました')).toEqual([]);
  });

  it('keeps literal exact results first and preserves existing partial-search ordering', () => {
    const entries = [
      word('verb', '食べる', 'たべる', '一段动词', 1),
      word('literal', '食べました', 'たべました', undefined, 20),
      word('phrase', '食べましたよ', 'たべましたよ', undefined, 3),
    ];
    const result = searchVocabularyEntries(entries, '食べました');
    expect(result.map(item => item.id)).toEqual(['literal', 'verb', 'phrase']);
    expect(result[0].inflection).toBeUndefined();
    expect(result[1].inflection?.query).toBe('食べました');
    expect(result[2].inflection).toBeUndefined();
    expect(searchVocabularyEntries(entries, '食べ').map(item => item.id)).toEqual(['verb', 'phrase', 'literal']);
  });

  it('uses attested classifications for unlabeled personal words and does not invent a new lemma', () => {
    const entries = [
      word('known', '食べます', 'たべます', '[动2]'),
      word('personal', '食べる', 'たべる'), word('unknown', '架空る', 'かくうる'),
      word('different-reading', '食べる', 'しょくべる'),
    ];
    expect(searchVocabularyEntries(entries, '食べました').map(item => item.id)).toEqual(['known', 'personal']);
    expect(searchVocabularyEntries(entries, '架空ました')).toEqual([]);
  });

  it('returns result-only metadata without mutating source records or their identities', () => {
    const entry = Object.freeze(word('original-id', '食べます', 'たべます', '[动2]'));
    const entries = Object.freeze([entry]);
    const before = JSON.stringify(entries);
    const result = searchVocabularyEntries(entries, '食べました');
    expect(result[0]).toMatchObject({ id: 'original-id', term: '食べます', reading: 'たべます', inflection: { baseTerm: '食べる' } });
    expect(JSON.stringify(entries)).toBe(before);
    expect(searchVocabularyEntries(entries, '食べます')[0]).toBe(entry);
  });

  it('preserves query and result bounds', () => {
    const entries = [word('verb', '食べる', 'たべる', '一段动词')];
    expect(searchVocabularyEntries(entries, '  ')).toEqual([]);
    expect(searchVocabularyEntries(entries, '食'.repeat(81))).toEqual([]);
    expect(searchVocabularyEntries(entries, '食べました', 0)).toEqual([]);
    expect(searchVocabularyEntries(entries, '食べました', 1)).toHaveLength(1);
  });

  it('keeps the displayed lemma spelling while normalizing matching kana', () => {
    const entries = [word('copy', 'コピーします', 'こぴーします', '[动3]'), word('good', 'いい', 'いい', '[形1]')];
    expect(searchVocabularyEntries(entries, 'コピーしました')[0]?.inflection?.baseTerm).toBe('コピーする');
    expect(searchVocabularyEntries(entries, 'コピーシマシタ')[0]?.id).toBe('copy');
    expect(searchVocabularyEntries(entries, 'よかった')[0]?.inflection?.baseTerm).toBe('いい');
  });
});
