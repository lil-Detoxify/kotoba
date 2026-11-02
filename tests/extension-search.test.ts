import { describe, expect, it } from 'vitest';
import type { ExtensionWord } from '../apps/extension/src/model';
import { normalizeSearchText, searchCatalog } from '../apps/extension/src/search';

function entry(id: string, term: string, reading: string, meaning: string, order: number): ExtensionWord {
  return {
    id,
    lessonId: 'book-l-1',
    term,
    reading,
    meaning,
    order,
    source: 'textbook',
    bookTitle: 'Test book',
    lessonTitle: 'Lesson 1'
  };
}

describe('extension catalog search', () => {
  const catalog = [
    entry('prefix', '日本人', 'にほんじん', 'Japanese person', 2),
    entry('exact', '日本', 'にほん', 'Japan', 1),
    entry('meaning-prefix', '教師', 'きょうし', 'teacher; instructor', 3),
    entry('meaning-substring', '先生', 'せんせい', 'school teacher', 4),
    entry('later-prefix', '日本語', 'にほんご', 'Japanese language', 5)
  ];

  it('normalizes half-width katakana, full-width text, and katakana readings', () => {
    expect(normalizeSearchText(' ｶﾀカナ ')).toBe('かたかな');
    expect(searchCatalog(catalog, 'ニホン').map(word => word.id)).toEqual(['exact', 'prefix', 'later-prefix']);
  });

  it('ranks exact headword or reading before prefixes and meaning matches', () => {
    expect(searchCatalog(catalog, 'にほん')[0].id).toBe('exact');
    expect(searchCatalog(catalog, 'teacher').map(word => word.id)).toEqual(['meaning-prefix', 'meaning-substring']);
  });

  it('supports substring matches and deterministic order within a rank', () => {
    expect(searchCatalog(catalog, '本人').map(word => word.id)).toEqual(['prefix']);
    expect(searchCatalog(catalog, 'にほん', 2).map(word => word.id)).toEqual(['exact', 'prefix']);
  });

  it('does not search blank or overlong text and bounds the result count', () => {
    expect(searchCatalog(catalog, '　 \n')).toEqual([]);
    expect(searchCatalog(catalog, '日'.repeat(81))).toEqual([]);
    expect(searchCatalog(catalog, '日', 1)).toHaveLength(1);
    expect(searchCatalog(catalog, '日', -1)).toEqual([]);
  });

  it('returns each matching id once even if the catalog repeats it', () => {
    expect(searchCatalog([catalog[1], { ...catalog[1], meaning: 'duplicate' }], '日本')).toEqual([catalog[1]]);
  });
});
