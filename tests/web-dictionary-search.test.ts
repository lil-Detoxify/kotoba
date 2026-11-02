import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dictionaryBucket, type DictionaryEntry } from '@jp/dictionary';
import {
  dictionaryWord,
  resetDictionarySearchCacheForTests,
  searchDictionary,
} from '../apps/web/src/services/dictionary-search';

function entry(overrides: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    id: 'jmdict:1',
    terms: ['内省'],
    readings: [{ text: 'ないせい', restrictedTo: [] }],
    senses: [{ pos: ['noun'], zh: ['内心反省'], en: ['introspection'] }],
    japanese: [],
    ...overrides,
  };
}

function fetchShards(shards: Record<number, Record<string, DictionaryEntry[]>>) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const bucket = Number(String(input).match(/dictionary\/(\d+)\.json/)?.[1]);
    const body = shards[bucket] ?? {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

describe('web general dictionary search', () => {
  beforeEach(() => resetDictionarySearchCacheForTests());

  it('normalizes NFKC queries, matches an exact term without a known reading, and returns a read-only draft', async () => {
    const canonical = entry({ terms: ['ガ'] , readings: [] });
    const { fetcher } = fetchShards({ [dictionaryBucket('ガ')]: { ガ: [canonical] } });
    const results = await searchDictionary(' ｶﾞ ', { fetcher });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ term: 'ガ', reading: '', meaning: '内心反省', language: 'zh' });
    const before = structuredClone(canonical);
    expect(dictionaryWord(canonical, 'ガ', '')).toMatchObject({ entryId: 'jmdict:1', term: 'ガ', meaning: '内心反省' });
    expect(canonical).toEqual(before);
  });

  it('deduplicates script aliases and preserves restricted term-reading pairs', async () => {
    const restricted = entry({
      id: 'jmdict:2',
      terms: ['甲状', '交渉'],
      readings: [
        { text: 'こうしょう', restrictedTo: ['交渉'] },
        { text: 'こうじょう', restrictedTo: ['甲状'] },
      ],
    });
    const hiraBucket = dictionaryBucket('こうしょう');
    const kataBucket = dictionaryBucket('コウショウ');
    const { fetcher, calls } = fetchShards({
      [hiraBucket]: { こうしょう: [restricted] },
      [kataBucket]: { コウショウ: [restricted] },
    });
    const results = await searchDictionary('こうしょう', { fetcher });
    expect(new Set(calls.map(url => url.match(/dictionary\/(\d+)\.json/)?.[1])).size).toBeLessThanOrEqual(2);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ term: '交渉', reading: 'こうしょう' });
  });

  it('uses English as an explicitly marked fallback when no Chinese gloss exists', async () => {
    const englishOnly = entry({ senses: [{ pos: ['noun'], zh: [], en: ['a proposal'] }] });
    const { fetcher } = fetchShards({ [dictionaryBucket('内省')]: { 内省: [englishOnly] } });
    const results = await searchDictionary('内省', { fetcher });
    expect(results[0]).toMatchObject({ meaning: 'a proposal', language: 'en' });
    expect(dictionaryWord(englishOnly).meaning).toBe('a proposal');
  });

  it('keeps the query-matched reading and compacts only the preview while retaining all senses', async () => {
    const multiReading = entry({
      id: 'jmdict:3',
      terms: ['生'],
      readings: [{ text: 'なま', restrictedTo: [] }, { text: 'せい', restrictedTo: [] }],
      senses: [
        { pos: ['Godan verb'], zh: ['鲜活；生的'], en: ['raw'] },
        { pos: ['noun'], zh: ['生命'], en: [] },
        { pos: ['noun'], zh: ['出生'], en: [] },
        { pos: ['noun'], zh: ['学生'], en: [] },
      ],
    });
    const { fetcher } = fetchShards({ [dictionaryBucket('なま')]: { なま: [multiReading] } });

    const results = await searchDictionary('なま', { fetcher });
    const saved = dictionaryWord(multiReading, results[0].term, results[0].reading);

    expect(results[0]).toMatchObject({ reading: 'なま', meaning: '鲜活、生的' });
    expect(saved.meaning).toBe('鲜活、生的');
    expect(saved.partOfSpeech).toBe('五段动词');
    expect(saved.senses).toHaveLength(4);
    expect(saved.senses?.[0].partOfSpeech).toBe('五段动词');
  });

  it('reports shard failures and rejects malformed responses', async () => {
    const failure = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(searchDictionary('稟議', { fetcher: failure })).rejects.toThrow('HTTP 503');
    const malformed = vi.fn(async () => new Response('[]', { status: 200 })) as unknown as typeof fetch;
    await expect(searchDictionary('稟議', { fetcher: malformed })).rejects.toThrow('词典数据格式不正确');
  });
});
