import { dictionaryBucket, partOfSpeechLabel, type DictionaryEntry } from '@jp/dictionary';
import type { WordSense } from '@jp/models';

export interface DictionarySearchResult {
  entry: DictionaryEntry;
  term: string;
  reading: string;
  meaning: string;
  language: 'zh' | 'en' | 'empty';
}

export interface DictionaryWordDraft {
  entryId: string;
  term: string;
  reading: string;
  meaning: string;
  partOfSpeech?: string;
  definitionJa?: string;
  senses?: WordSense[];
}

export function dictionaryResultKey(result: Pick<DictionarySearchResult, 'entry' | 'term' | 'reading'>): string {
  return `${result.entry.id}\0${exactText(result.term)}\0${exactText(result.reading)}`;
}

const MAX_BUCKETS = 8;
const MAX_QUERY_BUCKETS = 2;
const cache = new Map<number, Record<string, DictionaryEntry[]>>();
const pending = new Map<number, Promise<Record<string, DictionaryEntry[]>>>();

function kanaForm(text: string, katakana: boolean): string {
  const hira = text.normalize('NFKC').replace(/[ァ-ヶ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
  return katakana ? hira.replace(/[ぁ-ゖ]/gu, char => String.fromCharCode(char.charCodeAt(0) + 0x60)) : hira;
}

function exactText(text: string): string {
  return text.normalize('NFKC').trim();
}

function readingText(text: string): string {
  return kanaForm(text, false);
}

function nonEmpty(values: string[]): string[] {
  return values.map(value => value.trim()).filter(Boolean);
}

function allowedReading(reading: DictionaryEntry['readings'][number], term: string, entry: DictionaryEntry): boolean {
  return reading.restrictedTo.length === 0 || reading.restrictedTo.includes(term) || entry.terms.length === 0;
}

function choosePair(entry: DictionaryEntry, query: string): { term: string; reading: string } | undefined {
  const q = exactText(query);
  const qKana = readingText(query);
  const matchingTerms = entry.terms.filter(term => exactText(term) === q);
  const matchingReadings = entry.readings.filter(reading => readingText(reading.text) === qKana);

  if (!matchingTerms.length && !matchingReadings.length) return undefined;
  const term = matchingTerms[0]
    ?? entry.terms.find(candidate => matchingReadings.some(reading => allowedReading(reading, candidate, entry)))
    ?? entry.terms[0]
    ?? matchingReadings[0]?.text
    ?? query.trim();
  const reading = (matchingReadings.length
    ? matchingReadings.find(candidate => allowedReading(candidate, term, entry))
    : undefined)?.text
    ?? entry.readings.find(candidate => allowedReading(candidate, term, entry))?.text
    ?? '';
  if (matchingReadings.length && !matchingReadings.some(candidate => allowedReading(candidate, term, entry))) return undefined;
  return { term, reading };
}

function preferredGloss(entry: DictionaryEntry): { meaning: string; language: DictionarySearchResult['language'] } {
  const zh = nonEmpty(entry.senses.flatMap(sense => sense.zh).flatMap(gloss=>gloss.split(/[；;]/u))).slice(0, 2);
  if (zh.length) return { meaning: zh.join('、'), language: 'zh' };
  const en = nonEmpty(entry.senses.flatMap(sense => sense.en)).slice(0, 2);
  if (en.length) return { meaning: en.join(' · '), language: 'en' };
  return { meaning: '', language: 'empty' };
}

async function loadBucket(bucket: number, fetcher: typeof fetch): Promise<Record<string, DictionaryEntry[]>> {
  const cached = cache.get(bucket);
  if (cached) {
    cache.delete(bucket);
    cache.set(bucket, cached);
    return cached;
  }
  const existing = pending.get(bucket);
  if (existing) return existing;
  const version = import.meta.env.VITE_KOTOBA_DATA_VERSION ?? 'v1';
  const request = (async () => {
    const response = await fetcher(`/dictionary/${bucket}.json?v=${encodeURIComponent(version)}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('词典数据格式不正确');
    const entries = value as Record<string, DictionaryEntry[]>;
    if (cache.size >= MAX_BUCKETS) cache.delete(cache.keys().next().value!);
    cache.set(bucket, entries);
    return entries;
  })();
  pending.set(bucket, request);
  try {
    return await request;
  } finally {
    if (pending.get(bucket) === request) pending.delete(bucket);
  }
}

/** Search the shipped exact-key shards only; each request reads at most two buckets. */
export async function searchDictionary(
  rawQuery: string,
  options: { fetcher?: typeof fetch } = {},
): Promise<DictionarySearchResult[]> {
  if (typeof rawQuery !== 'string' || rawQuery.length > 80) return [];
  const query = exactText(rawQuery);
  if (!query) return [];
  const fetcher = options.fetcher ?? fetch;
  const keys = [...new Set([query, kanaForm(query, false), kanaForm(query, true)])];
  const bucketKeys = new Map<number, string[]>();
  for (const key of keys) {
    const bucket = dictionaryBucket(key);
    if (!bucketKeys.has(bucket)) bucketKeys.set(bucket, []);
    bucketKeys.get(bucket)!.push(key);
    if (bucketKeys.size >= MAX_QUERY_BUCKETS) break;
  }
  const shards = await Promise.all([...bucketKeys.keys()].map(bucket => loadBucket(bucket, fetcher)));
  const results: DictionarySearchResult[] = [];
  const seen = new Set<string>();
  for (const [index, [bucket, requestedKeys]] of [...bucketKeys.entries()].entries()) {
    const shard = shards[index];
    for (const key of requestedKeys) {
      for (const entry of shard[key] ?? []) {
        if (seen.has(entry.id)) continue;
        const pair = choosePair(entry, query);
        if (!pair) continue;
        seen.add(entry.id);
        results.push({
          entry,
          ...pair,
          ...preferredGloss(entry),
        });
      }
    }
    void bucket;
  }
  return results;
}

export function dictionaryWord(
  entry: DictionaryEntry,
  term = entry.terms[0] ?? entry.readings[0]?.text ?? '',
  reading = entry.readings.find(candidate => allowedReading(candidate, term, entry))?.text ?? '',
): DictionaryWordDraft {
  const translatedSenses: WordSense[] = entry.senses.map(sense => {
    const zh = nonEmpty(sense.zh);
    const en = nonEmpty(sense.en);
    return {
      meaning: zh.join('、') || en.join(' · '),
      ...(sense.pos.length ? { partOfSpeech: partOfSpeechLabel(sense.pos) } : {}),
    };
  });
  const { meaning } = preferredGloss(entry);
  const pos = entry.senses.find(sense => sense.pos.length)?.pos;
  const definitionJa = entry.japanese.flatMap(definition => definition.texts).find(Boolean);
  return {
    entryId: entry.id,
    term,
    reading,
    meaning,
    ...(pos?.length ? { partOfSpeech: partOfSpeechLabel(pos) } : {}),
    ...(definitionJa ? { definitionJa } : {}),
    ...(translatedSenses.length ? { senses: translatedSenses } : {}),
  };
}

export function resetDictionarySearchCacheForTests(): void {
  cache.clear();
  pending.clear();
}
