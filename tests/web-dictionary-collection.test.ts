import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import { emptyData, type Data } from '@jp/models';
import { collectDictionaryWord } from '../apps/web/src/services/dictionary-personal-word';
import type { DictionaryWordDraft } from '../apps/web/src/services/dictionary-search';

const stamp = '2026-10-11T00:00:00.000Z';

function draft(overrides: Partial<DictionaryWordDraft> = {}): DictionaryWordDraft {
  return {
    entryId: 'jmdict:内省',
    term: '内省',
    reading: 'ないせい',
    meaning: '反省',
    partOfSpeech: 'noun',
    senses: [{ meaning: '反省', partOfSpeech: 'noun' }],
    ...overrides,
  };
}

function dataWithLearningRecords(): Data {
  const data = emptyData();
  data.books.push({ id: 'current-book', title: '正在学习', description: '', language: 'ja', createdAt: stamp, updatedAt: stamp });
  data.lessons.push({ id: 'current-lesson', bookId: 'current-book', title: '第1课', order: 1 });
  data.words.push({ id: 'current-word', lessonId: 'current-lesson', term: '現在', reading: 'げんざい', meaning: '现在', order: 1 });
  data.userSettings = { userId: 'local', currentBookId: 'current-book', updatedAt: stamp };
  const state = initialState('current-word', new Date(stamp));
  data.states.push(state);
  data.logs.push({
    id: 'review-1', userId: 'local', wordId: 'current-word', reviewedAt: stamp,
    rating: 3, responseTime: 500, previousState: state, newState: state, studyMode: 'new',
  });
  return data;
}

describe('dictionary word collection', () => {
  it('creates the personal dictionary book, lesson, and word without touching learning records or current book', () => {
    const data = dataWithLearningRecords();
    const states = structuredClone(data.states);
    const logs = structuredClone(data.logs);
    const currentBookId = data.userSettings?.currentBookId;

    const result = collectDictionaryWord(data, draft(), stamp);

    expect(result.status).toBe('saved');
    expect(data.books.find(book => book.id === 'personal-dictionary')?.title).toBe('我的查词词书');
    expect(data.lessons.find(lesson => lesson.id === 'personal-dictionary-l-1')?.bookId).toBe('personal-dictionary');
    expect(data.words.find(word => word.id === result.wordId)).toMatchObject({ term: '内省', reading: 'ないせい', lessonId: 'personal-dictionary-l-1' });
    expect(data.states).toEqual(states);
    expect(data.logs).toEqual(logs);
    expect(data.userSettings?.currentBookId).toBe(currentBookId);
  });

  it('reuses the existing ID without replacing a user-edited meaning or note', () => {
    const data = emptyData();
    const first = collectDictionaryWord(data, draft(), stamp);
    const word = data.words.find(item => item.id === first.wordId)!;
    word.meaning = '我的释义';
    word.note = '我的笔记';

    const duplicate = collectDictionaryWord(data, draft({ meaning: '更新后的词典释义', senses: [{ meaning: '更新后的义项' }] }), stamp);

    expect(duplicate).toEqual({ status: 'existing', wordId: first.wordId });
    expect(data.words).toHaveLength(1);
    expect(word).toMatchObject({ meaning: '我的释义', note: '我的笔记' });
  });

  it('keeps different term-reading pairs distinct and deep-copies senses', () => {
    const data = emptyData();
    const originalSense = { meaning: '一个释义', definitionJa: '説明', partOfSpeech: 'noun' };
    const firstDraft = draft({ senses: [originalSense] });
    const first = collectDictionaryWord(data, firstDraft, stamp);
    originalSense.meaning = '调用方后续修改';
    const alternateReading = collectDictionaryWord(data, draft({ reading: 'うちかえり' }), stamp);
    const alternateTerm = collectDictionaryWord(data, draft({ term: '自省' }), stamp);
    const missingReading = collectDictionaryWord(data, draft({ entryId: 'jmdict:no-reading', term: '無読', reading: '' }), stamp);

    expect(new Set([first.wordId, alternateReading.wordId, alternateTerm.wordId, missingReading.wordId]).size).toBe(4);
    expect(data.words.find(word => word.id === missingReading.wordId)).toMatchObject({ term: '無読', reading: '' });
    expect(data.words.find(word => word.id === first.wordId)?.senses?.[0]).toEqual({
      meaning: '一个释义', definitionJa: '説明', partOfSpeech: 'noun',
    });
  });
});
