import type { VocabularySearchResult } from './vocabulary-search';

export interface VocabularySearchGroup {
  key: string;
  entries: VocabularySearchResult[];
  preferred: VocabularySearchResult;
}

/** Group equivalent headword/reading pairs while preserving search result order and source entries. */
export function groupVocabularySearchResults(
  results: readonly VocabularySearchResult[],
  preferredBookId?: string,
  limit = 40,
): VocabularySearchGroup[] {
  const take = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 40;
  if (!take) return [];

  const groups: VocabularySearchGroup[] = [];
  const byKey = new Map<string, VocabularySearchGroup>();
  const seenIds = new Map<string, Set<string>>();

  for (const result of results) {
    const term = result.term.normalize('NFKC').trim();
    const reading = normalizeReading(result.reading);
    const key = makeKey(term, reading, result.id);
    let group = byKey.get(key);

    if (!group) {
      group = { key, entries: [], preferred: result };
      byKey.set(key, group);
      seenIds.set(key, new Set());
      groups.push(group);
    }

    const ids = seenIds.get(key)!;
    if (ids.has(result.id)) continue;
    ids.add(result.id);
    group.entries.push(result);
    if (group.entries.length === 1 || (result.bookId === preferredBookId && group.preferred.bookId !== preferredBookId)) {
      group.preferred = result;
    }
  }

  return groups.slice(0, take);
}

function makeKey(term: string, reading: string, id: string): string {
  // Blank headwords/readings cannot identify a cross-entry duplicate safely.
  return JSON.stringify(reading && term ? [term, reading] : [term, reading, id]);
}

function normalizeReading(value: string): string {
  return value.normalize('NFKC')
    .replace(/[ァ-ヶ]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .trim();
}
