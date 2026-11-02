import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import type { WordState } from '@jp/models';
import { learningScenes, resolveSceneWords } from '../apps/web/src/services/learning-scenes';
import { learningUsageCatalog, usageFor } from '../apps/web/src/services/learning-usage';
import { conjugationFor, conjugationVerbs } from '../apps/web/src/services/conjugation';
import { webTextbookWordId } from '../apps/web/src/services/textbook-catalog';
import { createSentenceCloze } from '../apps/web/src/services/sentence-cloze';
import { bookIdForWord } from '../apps/extension/src/learning';
import { sceneExampleFor, resolveExtensionSceneWords, sceneStudyQueue } from '../apps/extension/src/learning-content';
import { emptySnapshot, type ExtensionSnapshot, type ExtensionWord } from '../apps/extension/src/model';

function realSceneWords(): ExtensionWord[] {
  const words: ExtensionWord[] = [];
  const bookIds = new Set(learningScenes.flatMap(scene => scene.items.map(item => item.bookId)));
  for (const bookId of bookIds) {
    const book = JSON.parse(readFileSync(resolve('apps/web/public/data/books', `${bookId}.json`), 'utf8'));
    for (const lesson of book.lessons) {
      const lessonId = `${bookId}-l-${lesson.order}`;
      lesson.words.forEach((sourceWord: any, index: number) => words.push({
        ...sourceWord,
        id: webTextbookWordId(bookId, lesson.order, sourceWord, index),
        lessonId,
        order: index,
        source: 'textbook',
        bookTitle: book.title,
        lessonTitle: lesson.title,
      }));
    }
  }
  return words;
}

function snapshot(): ExtensionSnapshot {
  return { ...emptySnapshot(), identity: { partitionKey: 'account:user-a', userId: 'user-a' } };
}

function state(wordId: string, userId: string, patch: Partial<WordState> = {}): WordState {
  return { ...initialState(wordId, new Date('2026-10-15T00:00:00.000Z'), userId), ...patch };
}

describe('extension scene learning content', () => {
  it('resolves all six Web scenes to the original extension words and valid scene cloze examples', () => {
    const words = realSceneWords();
    const current = snapshot();

    expect(learningScenes.map(scene => scene.id)).toEqual(['shopping', 'dining', 'directions', 'lodging', 'meeting', 'weather']);
    for (const scene of learningScenes) {
      const expected = resolveSceneWords(scene, {
        lessons: [...new Map(words.map(word => [word.lessonId, {
          id: word.lessonId,
          bookId: bookIdForWord(word),
          title: word.lessonTitle,
          order: Number(word.lessonId.match(/-l-(\d+)$/)?.[1] ?? word.order),
        }])).values()],
        words,
      });
      const entries = resolveExtensionSceneWords(scene.id, words, current);
      expect(entries.map(entry => entry.word.id)).toEqual(expected.map(entry => entry.word.id));
      expect(entries).toHaveLength(8);
      for (const { word, item } of entries) {
        expect(words).toContain(word);
        expect(sceneExampleFor(scene.id, word)).toBe(item.example);
        const question = createSentenceCloze(word, sceneExampleFor(scene.id, word));
        expect(question).toMatchObject({ ja: item.example.ja, answer: item.example.cloze.answer });
        expect(question?.ja.split(question.answer)).toHaveLength(2);
      }
    }
    expect(resolveExtensionSceneWords('missing', words, current)).toEqual([]);
  });

  it('merges learning words and uses same-owner canonical state before legacy mirrors', () => {
    const words = realSceneWords();
    const current = snapshot();
    const target = resolveExtensionSceneWords('shopping', words, current).slice(0, 3);
    const learnedWord = { ...target[0].word, meaning: '保留个人词条对象' };
    const canonicalIgnored = state(target[1].word.id, 'user-a', { isIgnored: true });
    const canonicalActive = state(target[2].word.id, 'user-a', { reviewCount: 4, firstSeenAt: '2026-10-01T00:00:00.000Z' });
    current.learning.words = [learnedWord];
    current.learning.states = [canonicalIgnored, canonicalActive, state(target[0].word.id, 'foreign-user', { isIgnored: true })];
    current.words = [
      { word: target[1].word, savedAt: '2026-10-01T00:00:00.000Z', state: state(target[1].word.id, 'user-a') },
      { word: target[2].word, savedAt: '2026-10-01T00:00:00.000Z', state: state(target[2].word.id, 'user-a', { isIgnored: true }) },
    ];

    const resolved = resolveExtensionSceneWords('shopping', words.filter(word => word.id !== learnedWord.id), current);
    expect(resolved.find(entry => entry.word.id === learnedWord.id)?.word).toBe(learnedWord);
    expect(resolved.map(entry => entry.word.id)).not.toContain(canonicalIgnored.wordId);
    expect(resolved.map(entry => entry.word.id)).toContain(target[0].word.id);
    expect(resolved.map(entry => entry.word.id)).toContain(canonicalActive.wordId);
    const queue = sceneStudyQueue('shopping', words.filter(word => word.id !== learnedWord.id), current);
    expect(queue.find(item => item.word.id === canonicalActive.wordId)?.state).toBe(canonicalActive);
  });

  it('keeps curated scene order for new and learned words without requiring difficult flags', () => {
    const words = realSceneWords();
    const current = snapshot();
    const entries = resolveExtensionSceneWords('dining', words, current);
    const learned = state(entries[0].word.id, 'user-a', {
      firstSeenAt: '2026-10-01T00:00:00.000Z', reviewCount: 3, isDifficult: false,
    });
    const ignored = state(entries[2].word.id, 'user-a', { isIgnored: true });
    current.learning.states = [learned, ignored];

    const queue = sceneStudyQueue('dining', words, current);
    expect(queue.map(item => item.word.id)).toEqual(entries.filter(entry => entry.word.id !== ignored.wordId).map(entry => entry.word.id));
    expect(queue[0]).toMatchObject({ word: entries[0].word, state: learned });
    expect(queue[1].state.userId).toBe('user-a');
    expect(queue.every(item => !item.state.isDifficult)).toBe(true);
  });

  it('uses the shared Web catalogs for thirty usage pairs and twenty-four verb references', () => {
    expect(learningUsageCatalog).toHaveLength(60);
    expect(new Set(learningUsageCatalog.map(entry => {
      const counterpart = entry.contrast ? usageFor(entry.contrast) : undefined;
      return counterpart ? [entry.id, counterpart.id].sort().join('|') : entry.id;
    })).size).toBe(30);
    for (const entry of learningUsageCatalog) {
      for (const form of entry.forms) expect(usageFor(form)).toBe(entry);
    }
    expect(conjugationVerbs).toHaveLength(24);
    for (const verb of conjugationVerbs) {
      for (const form of verb.forms) expect(conjugationFor(form)?.id).toBe(verb.id);
    }
  });
});
