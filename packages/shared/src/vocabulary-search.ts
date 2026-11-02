/** Fields needed to search and order vocabulary entries across app surfaces. */
export interface SearchableVocabularyEntry {
  id: string;
  term: string;
  rawTerm?: string;
  reading: string;
  meaning: string;
  order: number;
}

const MAX_QUERY_LENGTH = 80;

/** Normalize width, kana script, and whitespace for locale-independent lookup. */
export function normalizeVocabularySearchText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u30A1-\u30F6]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .replace(/\s+/gu, '')
    .toLowerCase();
}

function matchRank(entry: SearchableVocabularyEntry, query: string): number | undefined {
  if (typeof entry.term !== 'string' || typeof entry.reading !== 'string' || typeof entry.meaning !== 'string') return undefined;
  const term = normalizeVocabularySearchText(entry.term);
  const rawTerm = typeof entry.rawTerm === 'string' ? normalizeVocabularySearchText(entry.rawTerm) : '';
  const reading = normalizeVocabularySearchText(entry.reading);
  const meaning = normalizeVocabularySearchText(entry.meaning);

  if (query === term || query === rawTerm || query === reading || query === meaning) return 0;
  if ([term, rawTerm, reading, meaning].some(value => value.startsWith(query))) return 1;
  if ([term, rawTerm, reading, meaning].some(value => value.includes(query))) return 2;
  return undefined;
}

/** Rank matching entries before a caller applies its display limit or groups sources. */
export function rankVocabularyMatches<TEntry extends SearchableVocabularyEntry>(
  catalog: readonly TEntry[],
  rawQuery: string,
): TEntry[] {
  if (!Array.isArray(catalog) || typeof rawQuery !== 'string' || rawQuery.length > MAX_QUERY_LENGTH) return [];
  const query = normalizeVocabularySearchText(rawQuery);
  if (!query) return [];

  const ranked: Array<{ entry: TEntry; rank: number; index: number }> = [];
  const seenIds = new Set<string>();
  catalog.forEach((entry, index) => {
    if (!entry || typeof entry.id !== 'string' || seenIds.has(entry.id)) return;
    const rank = matchRank(entry, query);
    if (rank !== undefined) {
      seenIds.add(entry.id);
      ranked.push({ entry, rank, index });
    }
  });

  ranked.sort((a, b) => a.rank - b.rank || a.entry.order - b.entry.order || a.index - b.index);
  return ranked.map(item => item.entry);
}

/** Search generic word-like entries with exact, prefix, then substring relevance. */
export function searchVocabulary<TEntry extends SearchableVocabularyEntry>(
  catalog: readonly TEntry[],
  rawQuery: string,
  limit = 30,
): TEntry[] {
  const take = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.trunc(limit))) : 30;
  return take ? rankVocabularyMatches(catalog, rawQuery).slice(0, take) : [];
}
