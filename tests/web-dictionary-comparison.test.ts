import { describe, expect, it, vi } from 'vitest';
import type { DictionaryEntry } from '@jp/dictionary';
import { createDictionaryComparison, wiktionaryBucket } from '../apps/web/src/services/dictionary-comparison';

function baseEntry(overrides: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    id: 'jmdict:1',
    terms: ['橋'],
    readings: [{ text: 'はし', restrictedTo: [] }],
    senses: [{ pos: ['noun'], zh: ['桥'], en: ['bridge'] }],
    japanese: [],
    ...overrides,
  };
}

function wikiEntry(overrides: Partial<{
  id: string; term: string; readings: string[]; pos: string;
  senses: Array<{ definition: string; examples?: string[]; tags?: string[] }>;
  sourceTitle: string; sourceUrl: string;
}> = {}) {
  return {
    id: 'jawiktionary:橋:1', term: '橋', readings: ['はし'], pos: '名詞',
    senses: [{ definition: '川などに架ける道。' }], sourceTitle: '橋 - ウィクショナリー日本語版',
    sourceUrl: 'https://ja.wiktionary.org/wiki/橋',
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(status === 200 ? JSON.stringify(body) : '', {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

describe('web dictionary comparison service', () => {
  it('shares an in-flight base lookup while keeping JMdict and Tomoshi glosses source-specific', async () => {
    let resolveLookup!: (entries: DictionaryEntry[]) => void;
    const lookup = vi.fn(() => new Promise<DictionaryEntry[]>(resolve => { resolveLookup = resolve; }));
    const service = createDictionaryComparison({ lookup });
    const query = { term: '橋', reading: 'はし' };

    const english = service.queryDictionarySource('jmdict', query);
    const chinese = service.queryDictionarySource('tomoshi', query);
    expect(lookup).toHaveBeenCalledTimes(1);
    resolveLookup([baseEntry()]);

    await expect(english).resolves.toMatchObject([{ term: '橋', senses: [{ definition: 'bridge', language: 'en' }] }]);
    await expect(chinese).resolves.toMatchObject([{ term: '橋', senses: [{ definition: '桥', language: 'zh-CN' }] }]);
  });

  it('matches term and reading together, and keeps homophones as separate entries', async () => {
    const shard = {
      '橋': [
        wikiEntry({ id: 'ja:橋:はし', term: '橋', readings: ['はし'] }),
        wikiEntry({ id: 'ja:橋:きょう', term: '橋', readings: ['きょう'] }),
      ],
      'はし': [
        wikiEntry({ id: 'ja:橋', term: '橋', readings: ['はし'] }),
        wikiEntry({ id: 'ja:箸', term: '箸', readings: ['はし'], senses: [{ definition: '食事に使う道具。' }] }),
      ],
    };
    const fetcher = vi.fn(async () => response(shard)) as unknown as typeof fetch;
    const service = createDictionaryComparison({ fetcher });

    const exactPair = await service.queryDictionarySource('wiktionary-ja', { term: '橋', reading: 'はし' });
    const homophones = await service.queryDictionarySource('wiktionary-ja', { term: 'はし', reading: 'はし' });

    expect(exactPair).toHaveLength(1);
    expect(exactPair[0]).toMatchObject({ id: 'ja:橋:はし', term: '橋', match: 'exact', readingVerified: true });
    expect(homophones.map(entry => entry.term)).toEqual(['橋', '箸']);
    expect(new Set(homophones.map(entry => entry.id)).size).toBe(2);
    expect(fetcher).toHaveBeenCalledWith(
      `/data/dictionaries/wiktionary-ja/2026-10-12/${wiktionaryBucket('橋')}.json`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('marks a headword match unverified when the query and entry have no reading', async () => {
    const fetcher = vi.fn(async () => response({
      'ありがとう': [wikiEntry({ id: 'ja:ありがとう', term: 'ありがとう', readings: [] })],
    })) as unknown as typeof fetch;
    const service = createDictionaryComparison({ fetcher });

    const results = await service.queryDictionarySource('wiktionary-ja', { term: 'ありがとう', reading: '' });

    expect(results).toMatchObject([{ term: 'ありがとう', readings: [], match: 'headword', readingVerified: false }]);
  });

  it('retries a failed Wiktionary shard and caches a later successful response', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ '橋': [wikiEntry()] }));
    const service = createDictionaryComparison({ fetcher: fetcher as unknown as typeof fetch });
    const query = { term: '橋', reading: 'はし' };

    await expect(service.queryDictionarySource('wiktionary-ja', query)).rejects.toThrow('HTTP 503');
    await expect(service.queryDictionarySource('wiktionary-ja', query)).resolves.toHaveLength(1);
    await expect(service.queryDictionarySource('wiktionary-ja', query)).resolves.toHaveLength(1);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses POS to restore a polite verb form to its lemma, and does not guess without POS', async () => {
    const verbLookup = vi.fn(async (term: string) => term === '食べる' ? [baseEntry({
      terms: ['食べる'], readings: [{ text: 'たべる', restrictedTo: [] }],
    })] : []);
    const verbService = createDictionaryComparison({ lookup: verbLookup });

    const restored = await verbService.queryDictionarySource('jmdict', {
      term: '食べます', reading: 'たべます', partOfSpeech: '一段动词',
    });

    expect(verbLookup.mock.calls.map(([term]) => term)).toEqual(['食べます', '食べる']);
    expect(restored).toMatchObject([{ term: '食べる', match: 'lemma', matchedTerm: '食べる' }]);

    const unknownPosLookup = vi.fn(async () => []);
    const unknownPosService = createDictionaryComparison({ lookup: unknownPosLookup });
    await unknownPosService.queryDictionarySource('jmdict', { term: '食べます', reading: 'たべます' });
    expect(unknownPosLookup).toHaveBeenCalledTimes(1);
    expect(unknownPosLookup).toHaveBeenCalledWith('食べます', 'たべます');
  });

  it('cancels one waiter without aborting the shared request used by another source', async () => {
    let resolveLookup!: (entries: DictionaryEntry[]) => void;
    const lookup = vi.fn(() => new Promise<DictionaryEntry[]>(resolve => { resolveLookup = resolve; }));
    const service = createDictionaryComparison({ lookup });
    const controller = new AbortController();
    const query = { term: '橋', reading: 'はし' };
    const cancelled = service.queryDictionarySource('jmdict', query, controller.signal);
    const active = service.queryDictionarySource('tomoshi', query);

    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(lookup).toHaveBeenCalledTimes(1);

    resolveLookup([baseEntry()]);
    await expect(active).resolves.toMatchObject([{ senses: [{ definition: '桥', language: 'zh-CN' }] }]);
  });
});
