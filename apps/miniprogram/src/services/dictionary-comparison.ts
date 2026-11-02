import { dictionaryBucket, matchEntries, partOfSpeechLabel, type DictionaryEntry } from '@jp/dictionary';
import { UniNetworkAdapter } from '../adapters/network';
import type { NetworkAdapter } from '../adapters/types';
import { defaultPrivacyConsent, type PrivacyConsentGate } from './privacy-consent';
import { dictionaryLookupForms, type DictionaryQuery } from './dictionary-lookup-forms';

export type { DictionaryQuery } from './dictionary-lookup-forms';
export type DictionarySourceId = 'tomoshi' | 'jmdict' | 'wiktionary-ja';
export interface ComparisonSense { definition: string; pos?: string; examples?: string[]; language?: string }
export interface ComparisonEntry {
  id: string; term: string; readings: string[]; senses: ComparisonSense[]; sourceUrl?: string;
  match: 'exact' | 'headword' | 'lemma'; matchedTerm?: string; readingVerified?: boolean;
}
export interface DictionarySearchResult {
  id: string; term: string; reading: string; meaning: string; partOfSpeech: string; language: 'zh' | 'en' | 'empty';
}
interface WiktionaryEntry {
  id: string; term: string; readings: string[]; pos: string;
  senses: Array<{ definition: string; examples?: string[] }>;
  sourceUrl: string;
}

export const DICTIONARY_SOURCES: readonly {
  id: DictionarySourceId; name: string; language: string; description: string;
  attributionUrl: string; licenseUrl: string; version: string;
}[] = [
  { id: 'tomoshi', name: 'Tomoshi', language: '中文译释', description: '基于 JMdict 的机器辅助中文译释，附已有日文补充。',
    attributionUrl: 'https://github.com/tomoshi-app/tomoshi-dict-data', licenseUrl: 'https://kotobud.com/dictionary/LICENSE.md', version: '收录 v1 · EDRDG / Tomoshi (Y1Z)' },
  { id: 'jmdict', name: 'JMdict', language: '英文原义', description: '保留 EDRDG 编纂的英文义项，可与中文译释对照。',
    attributionUrl: 'https://www.edrdg.org/jmdict/j_jmdict.html', licenseUrl: 'https://www.edrdg.org/edrdg/licence.html', version: '收录 v1 · EDRDG' },
  { id: 'wiktionary-ja', name: '维基词典', language: '日文解释', description: '日语版维基词典的社区释义及原文用例。',
    attributionUrl: 'https://kaikki.org/jawiktionary/', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', version: '2026-10-01 快照 · Wiktionary 贡献者 / Wiktextract' },
];

export const WIKTIONARY_VERSION = '2026-10-12';
const configuredOrigin = import.meta.env.VITE_MINIPROGRAM_DICTIONARY_ASSET_BASE_URL?.trim();
export const MINIPROGRAM_DICTIONARY_BASE_URL = configuredOrigin?.replace(/\/+$/, '') || 'https://staging.kotobud.com';
const exact = (value: string) => value.normalize('NFKC').trim();
const kana = (value: string) => exact(value).replace(/[ァ-ヶ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
const katakana = (value: string) => kana(value).replace(/[ぁ-ゖ]/gu, char => String.fromCharCode(char.charCodeAt(0) + 0x60));
const validQuery = (value: string) => typeof value === 'string' && value.length <= 80;
type BaseShard = Record<string, DictionaryEntry[]>;
type WikiShard = Record<string, WiktionaryEntry[]>;

function selectPair(entry: DictionaryEntry, query: string) {
  const terms = entry.terms.filter(term => exact(term) === query);
  const readings = entry.readings.filter(reading => kana(reading.text) === kana(query));
  const allowed = (reading: DictionaryEntry['readings'][number], term: string) => !reading.restrictedTo.length || reading.restrictedTo.includes(term) || !entry.terms.length;
  if (!terms.length && !readings.length) return undefined;
  const term = terms[0] ?? entry.terms.find(candidate => readings.some(reading => allowed(reading, candidate))) ?? entry.terms[0] ?? readings[0]?.text;
  if (!term || (readings.length && !readings.some(reading => allowed(reading, term)))) return undefined;
  const reading = readings.find(candidate => allowed(candidate, term))?.text ?? entry.readings.find(candidate => allowed(candidate, term))?.text ?? '';
  return { term, reading };
}

/** Small in-memory shard caches; full dictionaries never enter the mini-program package or learning data. */
export class MiniDictionaryService {
  private readonly baseCache = new Map<number, BaseShard>();
  private readonly wikiCache = new Map<number, WikiShard>();
  private readonly pending = new Map<string, Promise<BaseShard | WikiShard>>();
  constructor(
    private readonly network: NetworkAdapter = new UniNetworkAdapter(MINIPROGRAM_DICTIONARY_BASE_URL),
    private readonly privacy: Pick<PrivacyConsentGate, 'isConsented'> = defaultPrivacyConsent,
  ) {}

  private async loadShard<T extends BaseShard | WikiShard>(kind: 'base' | 'wiki', bucket: number): Promise<T> {
    const cache = kind === 'base' ? this.baseCache : this.wikiCache;
    const cached = cache.get(bucket);
    if (cached) { cache.delete(bucket); (cache as Map<number, T>).set(bucket, cached as T); return cached as T; }
    const key = `${kind}:${bucket}`;
    const running = this.pending.get(key);
    if (running) return running as Promise<T>;
    const endpoint = kind === 'base' ? `/dictionary/${bucket}.json?v=v1` : `/data/dictionaries/wiktionary-ja/${WIKTIONARY_VERSION}/${bucket}.json`;
    const request = this.network.request<unknown>(endpoint, { timeout: 12000 }).then(payload => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('词典数据暂时不可用');
      if (cache.size >= 6) cache.delete(cache.keys().next().value!);
      (cache as Map<number, T>).set(bucket, payload as T);
      return payload as T;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  async search(rawQuery: string): Promise<DictionarySearchResult[]> {
    if (!validQuery(rawQuery) || !rawQuery.trim()) return [];
    if (!await this.privacy.isConsented()) throw new Error('同意隐私说明后可查询在线词典。');
    const query = exact(rawQuery);
    const buckets = new Map<number, string[]>();
    for (const key of new Set([query, kana(query), katakana(query)])) {
      const bucket = dictionaryBucket(key);
      if (!buckets.has(bucket) && buckets.size >= 2) continue;
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), key]);
    }
    const shards = await Promise.all([...buckets.keys()].map(bucket => this.loadShard<BaseShard>('base', bucket)));
    const seen = new Set<string>();
    const results: DictionarySearchResult[] = [];
    for (const [index, keys] of [...buckets.values()].entries()) {
      for (const key of keys) for (const entry of shards[index][key] ?? []) {
        if (seen.has(entry.id)) continue;
        const pair = selectPair(entry, query);
        if (!pair) continue;
        seen.add(entry.id);
        const zh = entry.senses.flatMap(sense => sense.zh).flatMap(value => value.split(/[；;]/u)).map(value => value.trim()).filter(Boolean).slice(0, 2);
        const en = entry.senses.flatMap(sense => sense.en).map(value => value.trim()).filter(Boolean).slice(0, 2);
        results.push({ id: entry.id, ...pair, meaning: zh.length ? zh.join('、') : en.join(' · '),
          language: zh.length ? 'zh' : en.length ? 'en' : 'empty', partOfSpeech: partOfSpeechLabel([...new Set(entry.senses.flatMap(sense => sense.pos))]) });
        if (results.length >= 20) return results;
      }
    }
    return results;
  }

  async querySource(source: DictionarySourceId, query: DictionaryQuery): Promise<ComparisonEntry[]> {
    if (!validQuery(query.term) || !validQuery(query.reading) || !query.term.trim()) return [];
    if (!await this.privacy.isConsented()) throw new Error('同意隐私说明后可查询在线词典。');
    for (const form of dictionaryLookupForms(query)) {
      if (source === 'wiktionary-ja') {
        const shard = await this.loadShard<WikiShard>('wiki', dictionaryBucket(form.term) % 256);
        const results: ComparisonEntry[] = (shard[form.term] ?? []).flatMap(entry => {
          if (exact(entry.term) !== form.term && !entry.readings.some(reading => kana(reading) === kana(form.term))) return [];
          const verified = !!form.reading && entry.readings.some(reading => kana(reading) === kana(form.reading));
          if (form.reading && entry.readings.length && !verified) return [];
          const senses = entry.senses.filter(sense => sense.definition?.trim()).map(sense => ({ ...sense, pos: entry.pos, language: 'ja' }));
          return senses.length ? [{ id: entry.id, term: entry.term, readings: entry.readings, senses, sourceUrl: entry.sourceUrl,
            match: form.lemma ? 'lemma' : verified ? 'exact' : 'headword', readingVerified: verified, ...(form.lemma ? { matchedTerm: form.term } : {}) }] : [];
        });
        if (results.length) return results;
      } else {
        const shard = await this.loadShard<BaseShard>('base', dictionaryBucket(form.term));
        const candidates = shard[form.term] ?? [];
        const entries = form.reading ? matchEntries(candidates, form.term, form.reading) : candidates.filter(entry => selectPair(entry, form.term));
        const results: ComparisonEntry[] = entries.flatMap(entry => {
          const senses: ComparisonSense[] = entry.senses.flatMap(sense => {
            const gloss = (source === 'tomoshi' ? sense.zh : sense.en).map(value => value.trim()).filter(Boolean);
            return gloss.length ? [{ definition: source === 'tomoshi' ? gloss.join('、').replace(/[；;]/gu, '、') : gloss.join(', '),
              pos: partOfSpeechLabel(sense.pos), language: source === 'tomoshi' ? 'zh-CN' : 'en' }] : [];
          });
          if (source === 'tomoshi') for (const supplement of entry.japanese) for (const definition of supplement.texts.filter(Boolean)) {
            senses.push({ definition, language: 'ja', pos: supplement.source === 'wiktionary' ? '日文补充 · 维基词典' : '日文补充 · 机器辅助' });
          }
          return senses.length ? [{ id: entry.id, term: form.term, senses,
            readings: entry.readings.filter(reading => !reading.restrictedTo.length || reading.restrictedTo.includes(form.term) || !entry.terms.length).map(reading => reading.text),
            match: form.lemma ? 'lemma' : form.reading ? 'exact' : 'headword', readingVerified: !!form.reading, ...(form.lemma ? { matchedTerm: form.term } : {}) }] : [];
        });
        if (results.length) return results;
      }
    }
    return [];
  }
}

export const miniDictionary = new MiniDictionaryService();
