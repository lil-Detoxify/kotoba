import { dictionaryBucket, partOfSpeechLabel, type DictionaryEntry } from '@jp/dictionary';
import { dictionary } from './dictionary';
import { searchDictionary } from './dictionary-search';
import { dictionaryLookupForms } from './japanese-inflection';

export type DictionarySourceId = 'tomoshi' | 'jmdict' | 'wiktionary-ja';
export interface DictionaryQuery { term: string; reading: string; partOfSpeech?: string }
export interface ComparisonSense { definition: string; pos?: string; examples?: string[]; language?: 'zh-CN' | 'en' | 'ja' }
export interface ComparisonEntry {
  id: string;
  term: string;
  readings: string[];
  senses: ComparisonSense[];
  sourceUrl?: string;
  match: 'exact' | 'headword' | 'lemma';
  matchedTerm?: string;
  readingVerified?: boolean;
}
export const WIKTIONARY_VERSION = '2026-10-12';
export const DICTIONARY_SOURCES: readonly {
  id: DictionarySourceId; name: string; language: string; description: string;
  attributionUrl: string; licenseUrl: string; version: string;
}[] = [
  { id: 'tomoshi', name: 'Tomoshi', language: '中文译释',
    description: '基于 JMdict 的机器辅助中文译释，附已有日文补充。',
    attributionUrl: 'https://github.com/tomoshi-app/tomoshi-dict-data', licenseUrl: '/dictionary/LICENSE.md',
    version: '收录版本 v1 · EDRDG / Tomoshi (Y1Z)，按原义项整理' },
  { id: 'jmdict', name: 'JMdict', language: '英文原义',
    description: '保留 EDRDG 编纂的英文义项，可与中文译释对照。',
    attributionUrl: 'https://www.edrdg.org/jmdict/j_jmdict.html', licenseUrl: 'https://www.edrdg.org/edrdg/licence.html',
    version: '收录版本 v1 · EDRDG，义项与读音从现有数据提取' },
  { id: 'wiktionary-ja', name: '维基词典', language: '日文解释',
    description: '日语版维基词典的社区释义及原文用例，按词条单独呈现。',
    attributionUrl: 'https://kaikki.org/jawiktionary/', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    version: '2026-10-01 日语版快照 · Wiktionary 贡献者 / Wiktextract，经筛选与分片' },
];

export interface WiktionaryEntry {
  id: string; term: string; readings: string[]; pos: string;
  senses: Array<{ definition: string; examples?: string[]; tags?: string[] }>;
  sourceTitle: string; sourceUrl: string;
}
type WikiShard = Record<string, WiktionaryEntry[]>;
interface ComparisonDependencies {
  lookup?: (term: string, reading: string) => Promise<DictionaryEntry[]>;
  fetcher?: typeof fetch;
}
const exact = (text: string) => text.normalize('NFKC').trim();
const kana = (text: string) => exact(text).replace(/[ァ-ヶ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
export const wiktionaryBucket = (term: string) => dictionaryBucket(term) % 256;

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

function baseEntries(entries: DictionaryEntry[], source: 'tomoshi' | 'jmdict', form: { term: string; reading: string; lemma: boolean }): ComparisonEntry[] {
  return entries.flatMap(entry => {
    const senses: ComparisonSense[] = entry.senses.flatMap(sense => {
      const values = (source === 'jmdict' ? sense.en : sense.zh).map(value => value.trim()).filter(Boolean);
      return values.length ? [{ definition: source === 'jmdict' ? values.join(', ') : values.join('、').replace(/[；;]/gu, '、'),
        pos: partOfSpeechLabel(sense.pos), language: source === 'jmdict' ? 'en' : 'zh-CN' }] : [];
    });
    if (source === 'tomoshi') {
      for (const supplement of entry.japanese) {
        for (const definition of supplement.texts.filter(Boolean)) senses.push({ definition,
          pos: supplement.source === 'wiktionary' ? '日文补充 · 维基词典' : '日文补充 · 机器辅助', language: 'ja' });
      }
    }
    if (!senses.length) return [];
    const readings = entry.readings.filter(reading => !reading.restrictedTo.length
      || reading.restrictedTo.includes(form.term) || !entry.terms.length).map(reading => reading.text);
    return [{ id: entry.id, term: form.term, readings, senses,
      match: form.lemma ? 'lemma' : form.reading ? 'exact' : 'headword',
      readingVerified: !!form.reading, ...(form.lemma ? { matchedTerm: form.term } : {}) }];
  });
}

/** Isolated sources share their upstream request, without sharing UI loading/error state. */
export function createDictionaryComparison(dependencies: ComparisonDependencies = {}) {
  const lookup = dependencies.lookup ?? (async (term: string, reading: string) => reading
    ? dictionary.lookup(term, reading) : (await searchDictionary(term)).map(result => result.entry));
  const fetcher = dependencies.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const baseCache = new Map<string, Promise<DictionaryEntry[]>>();
  const wikiCache = new Map<number, WikiShard>();
  const wikiPending = new Map<number, Promise<WikiShard>>();

  function lookupBase(term: string, reading: string): Promise<DictionaryEntry[]> {
    const key = `${term}\0${kana(reading)}`;
    const cached = baseCache.get(key);
    if (cached) { baseCache.delete(key); baseCache.set(key, cached); return cached; }
    const request = lookup(term, reading).catch(error => { if (baseCache.get(key) === request) baseCache.delete(key); throw error; });
    if (baseCache.size >= 32) baseCache.delete(baseCache.keys().next().value!);
    baseCache.set(key, request);
    return request;
  }

  async function loadWiki(bucket: number): Promise<WikiShard> {
    const cached = wikiCache.get(bucket);
    if (cached) { wikiCache.delete(bucket); wikiCache.set(bucket, cached); return cached; }
    if (wikiPending.has(bucket)) return wikiPending.get(bucket)!;
    const request = (async () => {
      const response = await fetcher(`/data/dictionaries/wiktionary-ja/${WIKTIONARY_VERSION}/${bucket}.json`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('词典数据格式不正确');
      if (wikiCache.size >= 8) wikiCache.delete(wikiCache.keys().next().value!);
      wikiCache.set(bucket, data as WikiShard);
      return data as WikiShard;
    })();
    wikiPending.set(bucket, request);
    try { return await request; }
    finally { if (wikiPending.get(bucket) === request) wikiPending.delete(bucket); }
  }

  async function querySource(source: DictionarySourceId, query: DictionaryQuery, signal?: AbortSignal): Promise<ComparisonEntry[]> {
    if (!query.term.trim() || query.term.length > 80 || query.reading.length > 80) return [];
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    for (const form of dictionaryLookupForms(query)) {
      if (source !== 'wiktionary-ja') {
        const result = baseEntries(await withAbort(lookupBase(form.term, form.reading), signal), source, form);
        if (result.length) return result;
        continue;
      }
      const shard = await withAbort(loadWiki(wiktionaryBucket(form.term)), signal);
      const entries = (shard[form.term] ?? []).filter(entry => exact(entry.term) === form.term
        || entry.readings.some(reading => kana(reading) === kana(form.term)));
      const result = entries.flatMap(entry => {
        const readingVerified = !!form.reading && entry.readings.some(reading => kana(reading) === kana(form.reading));
        if (form.reading && entry.readings.length && !readingVerified) return [];
        const senses = entry.senses.filter(sense => sense.definition?.trim()).map(sense => ({ ...sense, pos: entry.pos, language: 'ja' as const }));
        if (!senses.length) return [];
        return [{ id: entry.id, term: entry.term, readings: entry.readings, senses, sourceUrl: entry.sourceUrl,
          readingVerified, match: form.lemma ? 'lemma' as const : readingVerified ? 'exact' as const : 'headword' as const,
          ...(form.lemma ? { matchedTerm: form.term } : {}) }];
      });
      if (result.length) return result;
    }
    return [];
  }
  return { queryDictionarySource: querySource };
}

const comparison = createDictionaryComparison();
export const queryDictionarySource = comparison.queryDictionarySource;
