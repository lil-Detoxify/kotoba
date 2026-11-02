import { matchEntries } from '@jp/dictionary';
import {
  createDictionaryComparison,
  DICTIONARY_SOURCES as webSources,
} from '../../web/src/services/dictionary-comparison';
import { searchDictionary, dictionaryWord, type DictionarySearchResult } from '../../web/src/services/dictionary-search';

export type { ComparisonEntry, DictionaryQuery, DictionarySourceId } from '../../web/src/services/dictionary-comparison';
export type { DictionarySearchResult } from '../../web/src/services/dictionary-search';
export { dictionaryWord };

export function dictionaryResultKey(result: DictionarySearchResult): string {
  return `${result.entry.id}\0${result.term}\0${result.reading}`;
}

/** A dictionary favorite keeps its identity after reloads and repeated saves. */
export async function dictionaryFavoriteId(result: DictionarySearchResult): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dictionaryResultKey(result)));
  const digest = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
  return `manual:dictionary:${digest}`;
}

const origin = 'https://kotobud.com';
export const DICTIONARY_SOURCES = webSources.map(source => ({
  ...source,
  licenseUrl: new URL(source.licenseUrl, origin).href,
}));

/** Keep every data request on the host already allowed by the extension. */
export function createExtensionDictionaries(fetcher: typeof fetch = (...args) => fetch(...args)) {
  const remoteFetch: typeof fetch = (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return fetcher(new URL(path, origin), init);
  };
  const search = (query: string): Promise<DictionarySearchResult[]> => searchDictionary(query, { fetcher: remoteFetch });
  const comparison = createDictionaryComparison({
    fetcher: remoteFetch,
    lookup: async (term, reading) => {
      const entries = (await search(term)).map(result => result.entry);
      return reading ? matchEntries(entries, term, reading) : entries;
    },
  });
  return { search, queryDictionarySource: comparison.queryDictionarySource };
}

const dictionaries = createExtensionDictionaries();
export const searchExtensionDictionary = dictionaries.search;
export const queryDictionarySource = dictionaries.queryDictionarySource;
