import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictionaryEntry } from '@jp/dictionary';
import { createExtensionDictionaries, DICTIONARY_SOURCES } from '../apps/extension/src/dictionary';
import { normalizeDictionaryPreferences } from '../apps/extension/src/dictionary-preferences';
import { resetDictionarySearchCacheForTests } from '../apps/web/src/services/dictionary-search';

const student: DictionaryEntry = {
  id: 'student', terms: ['学生'], readings: [{ text: 'がくせい', restrictedTo: [] }],
  senses: [{ pos: ['noun (common)'], zh: ['学生'], en: ['student'] }], japanese: [],
};
const eat: DictionaryEntry = {
  id: 'eat', terms: ['食べる'], readings: [{ text: 'たべる', restrictedTo: [] }],
  senses: [{ pos: ['Ichidan verb'], zh: ['吃'], en: ['to eat'] }], japanese: [],
};
const wikiEntry = (term: string, readings: string[], definition: string) => ({
  id: term, term, readings, pos: '名詞', senses: [{ definition }],
  sourceTitle: term, sourceUrl: `https://ja.wiktionary.org/wiki/${encodeURIComponent(term)}`,
});
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => resetDictionarySearchCacheForTests());

describe('extension dictionary integration', () => {
  it('uses the permitted production host and shares the Chinese/English request', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ 学生: [student] }));
    const dictionaries = createExtensionDictionaries(fetcher);
    const query = { term: '学生', reading: 'がくせい' };
    const [chinese, english] = await Promise.all([
      dictionaries.queryDictionarySource('tomoshi', query), dictionaries.queryDictionarySource('jmdict', query),
    ]);
    expect(chinese[0].senses[0].definition).toBe('学生');
    expect(english[0].senses[0].definition).toBe('student');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toMatch(/^https:\/\/kotobud\.com\/dictionary\/\d+\.json\?v=v1$/);
    expect(DICTIONARY_SOURCES[0].licenseUrl).toBe('https://kotobud.com/dictionary/LICENSE.md');
  });

  it('keeps homophones separate and labels an unverified wiki reading', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({
      橋: [wikiEntry('橋', ['はし'], '川などを渡るための構造物。')],
      箸: [wikiEntry('箸', [], '食事に使う道具。')],
    }));
    const dictionaries = createExtensionDictionaries(fetcher);
    const wrongReading = await dictionaries.queryDictionarySource('wiktionary-ja', { term: '橋', reading: 'きょう' });
    expect(wrongReading).toEqual([]);
    const chopsticks = await dictionaries.queryDictionarySource('wiktionary-ja', { term: '箸', reading: 'はし' });
    expect(chopsticks).toHaveLength(1);
    expect(chopsticks[0]).toMatchObject({ term: '箸', match: 'headword', readingVerified: false });
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('https://kotobud.com/data/dictionaries/wiktionary-ja/2026-10-12/'))).toBe(true);
  });

  it('uses a known lexical class for a textbook polite form without guessing unknown forms', async () => {
    const dictionaries = createExtensionDictionaries(vi.fn<typeof fetch>(async () => response({ 食べる: [eat] })));
    const known = await dictionaries.queryDictionarySource('jmdict', { term: '食べます', reading: 'たべます', partOfSpeech: '动2' });
    expect(known[0]).toMatchObject({ term: '食べる', match: 'lemma', matchedTerm: '食べる' });
    expect(await dictionaries.queryDictionarySource('jmdict', { term: '食べます', reading: 'たべます' })).toEqual([]);
  });

  it('retries a failed wiki source while preserving working dictionary results', async () => {
    let wikiRequests = 0;
    const fetcher = vi.fn<typeof fetch>(async url => {
      if (String(url).includes('/wiktionary-ja/')) {
        wikiRequests++;
        return wikiRequests === 1 ? response({}, 503) : response({ 学生: [wikiEntry('学生', ['がくせい'], '学校で学ぶ人。')] });
      }
      return response({ 学生: [student] });
    });
    const dictionaries = createExtensionDictionaries(fetcher);
    const query = { term: '学生', reading: 'がくせい' };
    await expect(dictionaries.queryDictionarySource('wiktionary-ja', query)).rejects.toThrow('HTTP 503');
    expect((await dictionaries.queryDictionarySource('jmdict', query))[0].senses[0].definition).toBe('student');
    expect((await dictionaries.queryDictionarySource('wiktionary-ja', query))[0].senses[0].definition).toBe('学校で学ぶ人。');
  });

  it('lets one closed panel abort without cancelling another reader of the same shard', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve; }));
    const dictionaries = createExtensionDictionaries(fetcher);
    const query = { term: '学生', reading: 'がくせい' };
    const controller = new AbortController();
    const first = dictionaries.queryDictionarySource('wiktionary-ja', query, controller.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = dictionaries.queryDictionarySource('wiktionary-ja', query);
    controller.abort();
    await rejected;
    finish(response({ 学生: [wikiEntry('学生', ['がくせい'], '学校で学ぶ人。')] }));
    expect(await second).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('restores a usable preference order and keeps at least one source visible', () => {
    const preferences = normalizeDictionaryPreferences({
      order: ['wiktionary-ja', 'wiktionary-ja', 'unknown'],
      hidden: ['wiktionary-ja', 'jmdict', 'tomoshi'], preferredSource: 'unknown',
    });
    expect(preferences.order).toEqual(['wiktionary-ja', 'tomoshi', 'jmdict']);
    expect(preferences.hidden).toEqual(['jmdict', 'tomoshi']);
    expect(preferences.preferredSource).toBe('wiktionary-ja');
  });
});
