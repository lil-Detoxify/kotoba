import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createMiniProgramLearningExamples } from '../apps/miniprogram/src/services/learning-examples';

it('loads the published book payloads with the native parser and covers every built-in word', async () => {
  const root = resolve('apps/web/public/data');
  const manifest = JSON.parse(readFileSync(resolve(root, 'examples/v1/manifest.json'), 'utf8'));
  const service = createMiniProgramLearningExamples({
    network: { request: async endpoint => JSON.parse(readFileSync(resolve('apps/web/public', '.' + endpoint), 'utf8')) },
    storage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, clear: async () => {} },
    privacy: { isConsented: async () => true },
  });
  let biaoriWords = 0, jlptWords = 0;
  for (const metadata of manifest.books) {
    expect(await service.loadBookLearningExamples(metadata.id)).toBe(true);
    const book = JSON.parse(readFileSync(resolve(root, 'books', metadata.id + '.json'), 'utf8'));
    let matched = 0;
    for (const lesson of book.lessons) for (const word of lesson.words) {
      const question = service.createSentenceCloze(word, undefined, metadata.id);
      if (question) matched++;
      expect(question, `${metadata.id}: ${word.term} / ${word.reading}`).not.toBeNull();
      if (metadata.id.startsWith('biaori-')) {
        biaoriWords++;
      }
      if (metadata.id.startsWith('jlpt-')) jlptWords++;
    }
    expect(matched).toBe(metadata.matchedWords);
  }
  expect(biaoriWords).toBe(9117);
  expect(jlptWords).toBe(7809);
});
