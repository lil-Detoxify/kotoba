import { normalizeVocabularySearchText, searchVocabulary } from '@jp/shared';
import type { ExtensionWord } from './model';

/** Compatibility name for extension callers; matching is implemented by @jp/shared. */
export const normalizeSearchText = normalizeVocabularySearchText;

/** Preserve the extension API while delegating generic vocabulary ranking. */
export function searchCatalog(catalog: ExtensionWord[], rawQuery: string, limit = 30): ExtensionWord[] {
  return searchVocabulary(catalog, rawQuery, limit);
}
