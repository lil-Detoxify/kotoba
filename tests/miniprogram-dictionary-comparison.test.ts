import { describe, expect, it, vi } from 'vitest';
import { dictionaryBucket, type DictionaryEntry } from '@jp/dictionary';
import { MiniDictionaryService } from '../apps/miniprogram/src/services/dictionary-comparison';
import { createMiniDictionaryPreferences, normalizeDictionaryPreferences } from '../apps/miniprogram/src/services/dictionary-preferences';

const consent = { isConsented: async () => true };
const entry = (term: string, reading: string, id = term): DictionaryEntry => ({
  id, terms: [term], readings: [{ text: reading, restrictedTo: [term] }],
  senses: [{ pos: ['noun (common)'], zh: ['学生；学习者'], en: ['student', 'pupil'] }], japanese: [],
});
const wikiEntry = (term: string, readings: string[]) => ({ id: term, term, readings, pos: '名詞', senses: [{ definition: '学習する人。' }], sourceUrl: `https://ja.wiktionary.org/wiki/${term}` });

describe('Mini dictionary lookup', () => {
  it('shares the native upstream request while retaining Chinese and English meanings', async () => {
    const request = vi.fn(async () => ({ 学生: [entry('学生', 'がくせい')] }));
    const service = new MiniDictionaryService({ request } as never, consent);
    const query = { term: '学生', reading: 'がくせい' };
    const [zh, en] = await Promise.all([service.querySource('tomoshi', query), service.querySource('jmdict', query)]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(zh[0].senses[0].definition).toBe('学生、学习者');
    expect(en[0].senses[0].definition).toBe('student, pupil');
    expect(zh[0].readingVerified).toBe(true);
    expect(await service.search('学生')).toMatchObject([{ term: '学生', reading: 'がくせい', meaning: '学生、学习者' }]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps homophone headwords and reading-restricted spellings separate', async () => {
    const request = vi.fn(async () => ({ 橋: [entry('橋', 'はし'), entry('橋', 'きょう', 'bridge-alt')], 箸: [entry('箸', 'はし')] }));
    const service = new MiniDictionaryService({ request } as never, consent);
    const result = await service.querySource('jmdict', { term: '橋', reading: 'はし' });
    expect(result.map(value => value.id)).toEqual(['橋']);
    expect(await service.querySource('jmdict', { term: '橋', reading: 'きょう' })).toMatchObject([{ id: 'bridge-alt' }]);
    expect(await service.querySource('jmdict', { term: '橋', reading: 'ばし' })).toEqual([]);
  });

  it('retries one failed source and marks missing Wiki readings without inventing them', async () => {
    let attempts = 0;
    const request = vi.fn(async (url: string) => {
      if (url.startsWith('/dictionary/')) return { 学生: [entry('学生', 'がくせい')] };
      if (++attempts === 1) throw new Error('offline');
      return { 学生: [wikiEntry('学生', [])], 橋: [wikiEntry('橋', ['きょう'])] };
    });
    const service = new MiniDictionaryService({ request } as never, consent);
    await expect(service.querySource('wiktionary-ja', { term: '学生', reading: 'がくせい' })).rejects.toThrow('offline');
    expect(await service.querySource('tomoshi', { term: '学生', reading: 'がくせい' })).toHaveLength(1);
    expect(await service.querySource('wiktionary-ja', { term: '学生', reading: 'がくせい' })).toMatchObject([{ match: 'headword', readingVerified: false }]);
    expect(await service.querySource('wiktionary-ja', { term: '橋', reading: 'はし' })).toEqual([]);
    expect(attempts).toBe(3);
  });

  it('uses a known polite verb base but leaves unclassified suffixes alone', async () => {
    const request = vi.fn(async (url: string) => url.includes(`/${dictionaryBucket('食べる')}.json`)
      ? { 食べる: [entry('食べる', 'たべる')] } : {});
    const service = new MiniDictionaryService({ request } as never, consent);
    expect(await service.querySource('tomoshi', { term: '食べます', reading: 'たべます', partOfSpeech: '动2' }))
      .toMatchObject([{ term: '食べる', match: 'lemma', matchedTerm: '食べる', readingVerified: true }]);
    expect(await service.querySource('tomoshi', { term: '食べます', reading: 'たべます' })).toEqual([]);
  });

  it('keeps all online dictionary traffic behind the existing consent choice', async () => {
    const request = vi.fn(async () => ({}));
    const service = new MiniDictionaryService({ request } as never, { isConsented: async () => false });
    await expect(service.search('学生')).rejects.toThrow('隐私');
    await expect(service.querySource('jmdict', { term: '学生', reading: 'がくせい' })).rejects.toThrow('隐私');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('Mini dictionary preferences', () => {
  it('persists order and preferred source, retains a visible source and preserves state on write failure', async () => {
    let saved: string | null = null;
    const storage = { getItem: async () => saved, setItem: vi.fn(async (_key: string, value: string) => { saved = value; }) };
    const preferences = createMiniDictionaryPreferences(storage);
    await preferences.load();
    await preferences.setPreferred('wiktionary-ja');
    await preferences.move('wiktionary-ja', -1);
    await preferences.setEnabled('tomoshi', false);
    await preferences.setEnabled('jmdict', false);
    expect(await preferences.setEnabled('wiktionary-ja', false)).toBe(false);
    const reloaded = createMiniDictionaryPreferences(storage);
    await reloaded.load();
    expect(reloaded.state.preferences).toEqual(preferences.state.preferences);
    expect(reloaded.enabledSources.value.map(source => source.id)).toEqual(['wiktionary-ja']);
    storage.setItem.mockRejectedValueOnce(new Error('storage full'));
    await expect(preferences.setPreferred('tomoshi')).rejects.toThrow('storage full');
    expect(preferences.state.preferences.preferredSource).toBe('wiktionary-ja');
    expect(normalizeDictionaryPreferences({ order: ['unknown', 'jmdict'], hidden: ['tomoshi', 'jmdict', 'wiktionary-ja'] }).hidden).toEqual(['tomoshi', 'wiktionary-ja']);
  });
});
