import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { initialState } from '@jp/core';
import { learningScenes, sceneStudyWords, resolveSceneWords, sceneExampleFor } from '../apps/miniprogram/src/services/learning-scenes';
import { parseTextbook, textbookCatalog } from '../apps/miniprogram/src/services/textbooks';
import { createSentenceCloze } from '../apps/miniprogram/src/services/learning-examples';

it('resolves all approved scene words through the native book parser, preserving identities and ignored flags', () => {
  const bookIds = [...new Set(learningScenes.flatMap(scene => scene.items.map(item => item.bookId)))];
  const data = {
    lessons: textbookCatalog.flatMap(book => book.lessons.map(lesson => ({ ...lesson, bookId: book.id }))),
    words: bookIds.flatMap(id => parseTextbook(JSON.parse(readFileSync(resolve('apps/web/public/data/books', id + '.json'), 'utf8')), id)),
    states: [],
  };
  const before = JSON.stringify(data);
  for (const scene of learningScenes) {
    const entries = resolveSceneWords(scene, data);
    expect(entries).toHaveLength(scene.items.length);
    const queue = sceneStudyWords(scene, data);
    expect(queue).toHaveLength(scene.items.length);
    for (const word of queue) {
      expect(word).toBe(data.words.find(candidate => candidate.id === word.id));
      expect(createSentenceCloze(word, sceneExampleFor(scene.id, word))).not.toBeNull();
    }
    const ignored = { ...initialState(queue[0].id), isIgnored: true };
    expect(sceneStudyWords(scene, { ...data, states: [ignored] }).map(word => word.id))
      .toEqual(queue.slice(1).map(word => word.id));
  }
  expect(JSON.stringify(data)).toBe(before);
});
