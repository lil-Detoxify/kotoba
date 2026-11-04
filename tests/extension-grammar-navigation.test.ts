import { expect, it } from 'vitest';
import { grammarForExtensionVocabulary, grammarHref } from '../apps/extension/src/study/navigation';
import type { ExtensionWord } from '../apps/extension/src/model';
const word = (volume: string, lesson: number): ExtensionWord => ({id:`${volume}-w-${lesson}-0`,lessonId:`${volume}-l-${lesson}`,term:'例',reading:'れい',meaning:'示例',order:9999,source:'textbook'});
it('uses the curriculum lesson number instead of the catalog-wide word order', () => {
  expect(grammarForExtensionVocabulary([word('biaori-beginner-upper',24)])?.href).toBe('/grammar/biaori-beginner-upper/24');
  expect(grammarForExtensionVocabulary([word('biaori-beginner-lower',25)])?.href).toBe('/grammar/biaori-beginner-lower/25');
});
it('does not recommend grammar for mixed lessons, personal words or other books', () => {
  expect(grammarForExtensionVocabulary([word('biaori-beginner-upper',1),word('biaori-beginner-upper',2)])).toBeUndefined();
  expect(grammarForExtensionVocabulary([{...word('biaori-beginner-upper',1),source:'manual'}])).toBeUndefined();
  expect(grammarForExtensionVocabulary([word('jlpt-n5',1)])).toBeUndefined();
});
it('keeps every grammar link in its own volume', () => {
  expect(grammarHref('biaori-beginner-upper',25)).toBeUndefined();
  expect(grammarHref('biaori-beginner-lower',24)).toBeUndefined();
  expect(grammarHref('biaori-beginner-lower',48)).toBe('./study.html#/grammar/biaori-beginner-lower/48');
});
