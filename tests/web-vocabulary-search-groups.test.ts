import { describe, expect, it } from 'vitest';
import { groupVocabularySearchResults } from '../apps/web/src/services/vocabulary-search-groups';
import type { VocabularySearchResult } from '../apps/web/src/services/vocabulary-search';

function result(overrides: Partial<VocabularySearchResult> = {}): VocabularySearchResult {
  return {
    id: 'word-1',
    lessonId: 'lesson-1',
    term: '学校',
    reading: 'がっこう',
    meaning: '学校',
    order: 1,
    bookId: 'book-a',
    bookTitle: '词书 A',
    lessonTitle: '第1课',
    source: 'textbook',
    ...overrides,
  };
}

describe('groupVocabularySearchResults', () => {
  it('groups the same headword and reading across books while retaining original entries and IDs', () => {
    const first = result({ id: 'book-a-word', bookId: 'book-a' });
    const second = result({ id: 'book-b-word', bookId: 'book-b', source: 'custom', meaning: '学校；学园' });
    const groups = groupVocabularySearchResults([first, second]);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toEqual([first, second]);
    expect(groups[0].entries[0]).toBe(first);
    expect(groups[0].entries.map(entry => entry.id)).toEqual(['book-a-word', 'book-b-word']);
    expect(groups[0].entries[1]).toMatchObject({ source: 'custom', meaning: '学校；学园' });
  });

  it('keeps different readings apart and normalizes katakana, width, and surrounding spaces', () => {
    const hiragana = result({ term: ' 学校 ', reading: 'がっこう' });
    const katakana = result({ id: 'katakana', term: '学校', reading: 'ガッコウ', bookId: 'book-b' });
    const otherReading = result({ id: 'other-reading', reading: 'まなびや', bookId: 'book-c' });

    const groups = groupVocabularySearchResults([hiragana, katakana, otherReading]);
    expect(groups).toHaveLength(2);
    expect(groups[0].entries.map(entry => entry.id)).toEqual(['word-1', 'katakana']);
    expect(groups[1].entries.map(entry => entry.id)).toEqual(['other-reading']);
  });

  it('keeps table variants and entries without readings separate', () => {
    const traditional = result({ id: 'traditional', term: '學校', reading: 'がっこう' });
    const noReadingA = result({ id: 'missing-a', term: '学校', reading: '' });
    const noReadingB = result({ id: 'missing-b', term: '学校', reading: '   ' });

    const groups = groupVocabularySearchResults([traditional, noReadingA, noReadingB]);
    expect(groups).toHaveLength(3);
    expect(groups.map(group => group.entries[0].id)).toEqual(['traditional', 'missing-a', 'missing-b']);
  });

  it('prefers the current book without changing first-seen group order', () => {
    const a = result({ id: 'a-first', term: '学校', bookId: 'book-a' });
    const b = result({ id: 'b-first', term: '先生', reading: 'せんせい', bookId: 'book-b' });
    const aPreferred = result({ id: 'a-current', term: '学校', bookId: 'current-book' });

    const groups = groupVocabularySearchResults([a, b, aPreferred], 'current-book');
    expect(groups.map(group => group.entries[0].term)).toEqual(['学校', '先生']);
    expect(groups[0].preferred).toBe(aPreferred);
    expect(groups[1].preferred).toBe(b);
  });

  it('applies the limit after grouping all results and removes duplicate IDs within a group', () => {
    const first = result({ id: 'same-id', bookId: 'book-a' });
    const duplicate = result({ id: 'same-id', bookId: 'current-book' });
    const secondGroup = result({ id: 'second', term: '先生', reading: 'せんせい' });
    const thirdGroup = result({ id: 'third', term: '日本', reading: 'にほん' });

    const groups = groupVocabularySearchResults([first, duplicate, secondGroup, thirdGroup], 'current-book', 2);
    expect(groups).toHaveLength(2);
    expect(groups[0].entries).toEqual([first]);
    expect(groups[0].preferred).toBe(first);
    expect(groups[1].entries).toEqual([secondGroup]);
  });
});
