import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Data, Word } from '@jp/models';
import { learningScenes, resolveSceneWords, sceneExampleFor, sceneFor } from '../apps/web/src/services/learning-scenes';
import { webTextbookWordId } from '../apps/web/src/services/textbook-catalog';
import { createSentenceCloze, matchesClozeExample } from '../apps/web/src/services/sentence-cloze';
import { validStudySession } from '../apps/web/src/services/study-session';

function catalogData(): Pick<Data, 'words' | 'lessons'> {
  const data: Pick<Data, 'words' | 'lessons'> = { words: [], lessons: [] };
  for (const bookId of new Set(learningScenes.flatMap(scene => scene.items.map(item => item.bookId)))) {
    const book = JSON.parse(readFileSync(resolve('apps/web/public/data/books', `${bookId}.json`), 'utf8'));
    for (const lesson of book.lessons) {
      const lessonId = `${bookId}-l-${lesson.order}`;
      data.lessons.push({ id: lessonId, bookId, title: lesson.title, order: lesson.order });
      lesson.words.forEach((word: any, index: number) => data.words.push({ ...word, id: webTextbookWordId(bookId, lesson.order, word, index), lessonId, order: index }));
    }
  }
  return data;
}

describe('life scene content and learning references', () => {
  it('resolves all scene items to actual existing source words without duplicates or source mutation', () => {
    const data = catalogData();
    const before = JSON.stringify(data);
    expect(learningScenes.map(scene => scene.id)).toEqual(['shopping', 'dining', 'directions', 'lodging', 'meeting', 'weather']);
    for (const scene of learningScenes) {
      const entries = resolveSceneWords(scene, data);
      expect(entries, scene.id).toHaveLength(8);
      expect(new Set(entries.map(entry => entry.word.id)).size).toBe(8);
      expect(entries.every(entry => data.words.includes(entry.word))).toBe(true);
    }
    expect(JSON.stringify(data)).toBe(before);
  });

  it('uses all 48 complete scene sentences for cloze instead of unrelated book samples', () => {
    for (const scene of learningScenes) for (const { word, item } of resolveSceneWords(scene, catalogData())) {
      const example = sceneExampleFor(scene.id, word);
      expect(example).toBe(item.example);
      const question = createSentenceCloze(word, example);
      expect(question?.ja).toBe(item.example.ja);
      expect(question?.answer).toBe(item.example.cloze.answer);
      expect(item.example.ja.split(item.example.cloze.answer)).toHaveLength(2);
      expect(matchesClozeExample(question!, item.example.cloze.reading)).toBe(true);
      expect(/\p{Script=Han}/u.test(item.example.reading)).toBe(false);
    }
  });

  it('includes complete dialogue and usable expression tips for each scene', () => {
    expect(learningScenes.reduce((total, scene) => total + scene.expressions.length, 0)).toBe(12);
    for (const scene of learningScenes) {
      expect(scene.expressions).toHaveLength(2);
      for (const phrase of [...scene.dialogue, ...scene.expressions]) {
        expect(phrase.ja.trim()).not.toBe('');
        expect(phrase.zh.trim()).not.toBe('');
        expect(phrase.reading).toMatch(/^[\u3040-\u30ff\s、。ー！？「」]+$/u);
      }
      for (const expression of scene.expressions) {
        expect(expression.note.trim()).not.toBe('');
        expect(expression.note).not.toContain('；');
      }
    }
  });

  it('keeps scene identity optional and ignores words from another source book', () => {
    const scene = sceneFor('shopping')!;
    const entry = resolveSceneWords(scene, catalogData())[0];
    expect(sceneExampleFor(scene.id, { ...entry.word, lessonId: 'another-book-l-1' })).toBeUndefined();
    expect(sceneFor('missing')).toBeUndefined();
    const session = { version: 1, owner: 'data_guest', mode: 'difficult', bookIds: [scene.items[0].bookId], wordIds: [entry.word.id], reviewCounts: [0], index: 0, focusedPractice: true, exercise: 'sentence-cloze', updatedAt: new Date().toISOString() };
    expect(validStudySession(session, 'data_guest')).toBe(true);
    expect(validStudySession({ ...session, sceneId: 'shopping' }, 'data_guest')).toBe(true);
    expect(validStudySession({ ...session, sceneId: 'missing' }, 'data_guest')).toBe(false);
  });
});
