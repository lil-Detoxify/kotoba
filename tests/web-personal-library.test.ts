import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import { emptyData, type Book, type Data, type Lesson, type ReadingContext, type Word } from '@jp/models';
import {
  createPersonalLibrary,
  mergePersonalLibrary,
  parsePersonalLibrary,
  previewPersonalLibraryMerge,
  summarizePersonalLibrary,
} from '../apps/web/src/services/personal-library';

const exportedAt = '2026-10-10T08:00:00.000Z';
const localAt = '2026-10-09T08:00:00.000Z';

function book(id: string, title = id): Book {
  return { id, title, description: `说明 ${title}`, language: 'ja', createdAt: localAt, updatedAt: localAt };
}

function lesson(id: string, bookId: string, title = id): Lesson {
  return { id, bookId, title, order: 1 };
}

function context(id: string, sentence: string, createdAt = localAt): ReadingContext {
  return { id, sentence, translation: '译文', createdAt, updatedAt: createdAt };
}

function word(id: string, lessonId: string, term = id, contexts: ReadingContext[] = []): Word {
  return { id, lessonId, term, reading: 'ことば', meaning: '词语', order: 1, readingContexts: contexts };
}

function sourceData(): Data {
  const data = emptyData();
  data.books = [book('builtin', '内置词书'), book('personal', '我的词书')];
  data.lessons = [lesson('builtin-lesson', 'builtin'), lesson('personal-lesson', 'personal')];
  data.words = [
    word('builtin-word', 'builtin-lesson', '内置词', [context('builtin-context-1', '駅で友だちに会いました。')]),
    word('personal-word', 'personal-lesson', '自建词', [context('personal-context-1', '朝、駅まで走ります。')]),
  ];
  data.seeded = true;
  data.userSettings = { userId: 'local', updatedAt: localAt };
  return data;
}

function packageFromSource(includeBuiltinContexts = true) {
  const pkg = createPersonalLibrary(sourceData(), ['builtin'], new Date(exportedAt));
  if (!includeBuiltinContexts) pkg.builtinContexts = [];
  return pkg;
}

describe('personal library transfer package', () => {
  it('exports complete personal words with stable IDs and only references contexts on builtin words', () => {
    const data = sourceData();
    const state = initialState('personal-word', new Date(exportedAt));
    data.states.push(state);
    data.logs.push({
      id: 'review-1', userId: 'local', wordId: 'personal-word', reviewedAt: exportedAt,
      rating: 3, responseTime: 100, previousState: state, newState: state, studyMode: 'new',
    });

    const pkg = createPersonalLibrary(data, ['builtin'], new Date(exportedAt));

    expect(pkg).toMatchObject({ kind: 'kotobud-personal-library', version: 1, exportedAt });
    expect(pkg.books.map(item => item.id)).toEqual(['personal']);
    expect(pkg.lessons.map(item => item.id)).toEqual(['personal-lesson']);
    expect(pkg.words.map(item => item.id)).toEqual(['personal-word']);
    expect(pkg.words[0]).toMatchObject({ id: 'personal-word', lessonId: 'personal-lesson', term: '自建词' });
    expect(pkg.builtinContexts).toEqual([{
      bookId: 'builtin', wordId: 'builtin-word', contexts: [expect.objectContaining({ id: 'builtin-context-1' })],
    }]);
    expect(pkg).not.toHaveProperty('states');
    expect(pkg).not.toHaveProperty('logs');
    expect(pkg).not.toHaveProperty('userSettings');
    expect(pkg).not.toHaveProperty('progress');
    expect(summarizePersonalLibrary(pkg)).toMatchObject({ bookCount: 1, lessonCount: 1, wordCount: 1, contextCount: 2 });
  });

  it('round trips through JSON while preserving book, lesson, word, and context IDs', () => {
    const pkg = packageFromSource();
    const parsed = parsePersonalLibrary(JSON.stringify(pkg));

    expect(parsed).toEqual(pkg);
    expect(parsed?.books[0].id).toBe('personal');
    expect(parsed?.lessons[0].id).toBe('personal-lesson');
    expect(parsed?.words[0].id).toBe('personal-word');
    expect(parsed?.words[0].readingContexts?.[0].id).toBe('personal-context-1');
    expect(parsed?.builtinContexts[0].contexts[0].id).toBe('builtin-context-1');
    expect(parsePersonalLibrary(JSON.stringify([{ words: [] }]))).toBeNull();
    expect(parsePersonalLibrary(JSON.stringify({ words: [] }))).toBeNull();
  });

  it('rejects an unsupported package version', () => {
    const pkg = packageFromSource();
    expect(() => parsePersonalLibrary(JSON.stringify({ ...pkg, version: 99 }))).toThrow();
  });

  it('previews and merges missing records without changing local records or losing learning data', () => {
    const pkg = packageFromSource(false);
    pkg.words[0].readingContexts?.push(context('package-context-2', '夜、駅で待ちます。'));
    const data = emptyData();
    data.books = [book('personal', '本机标题')];
    data.lessons = [lesson('personal-lesson', 'personal', '本机课名')];
    data.words = [word('personal-word', 'personal-lesson', '本机词条', [
      { ...context('personal-context-1', '朝、駅まで走ります。'), translation: '本机译文' },
      context('local-context', '本机保存的句子。'),
    ])];
    const state = initialState('personal-word', new Date(exportedAt));
    data.states = [state];
    data.logs = [{
      id: 'local-log', userId: 'local', wordId: 'personal-word', reviewedAt: exportedAt,
      rating: 3, responseTime: 100, previousState: state, newState: state, studyMode: 'new',
    }];

    const preview = previewPersonalLibraryMerge(data, pkg, []);
    expect(preview).toMatchObject({ newBooks: 0, newLessons: 0, newWords: 0, existingWords: 1 });
    const result = mergePersonalLibrary(data, pkg, []);

    expect(result).toMatchObject({ newBooks: 0, newLessons: 0, newWords: 0, existingWords: 1 });
    expect(data.books[0].title).toBe('本机标题');
    expect(data.lessons[0].title).toBe('本机课名');
    expect(data.words[0].term).toBe('本机词条');
    expect(data.words[0].readingContexts?.map(item => item.id)).toEqual(['personal-context-1', 'local-context', 'package-context-2']);
    expect(data.words[0].readingContexts?.[0].translation).toBe('本机译文');
    expect(data.states).toHaveLength(1);
    expect(data.logs).toHaveLength(1);
  });

  it('supports choosing package content for existing records and repeated imports stay idempotent', () => {
    const pkg = packageFromSource(false);
    const data = emptyData();
    data.books = [book('personal', '本机标题')];
    data.lessons = [lesson('personal-lesson', 'personal', '本机课名')];
    data.words = [word('personal-word', 'personal-lesson', '本机词条', [
      { ...context('personal-context-1', '朝、駅まで走ります。'), translation: '本机译文' },
      context('local-context', '本机句子。'),
    ])];

    mergePersonalLibrary(data, pkg, [], 'use-package');
    expect(data.books[0].title).toBe('我的词书');
    expect(data.lessons[0].title).toBe('personal-lesson');
    expect(data.words[0].term).toBe('自建词');
    expect(data.words[0].readingContexts?.map(item => item.id)).toEqual(['personal-context-1', 'local-context']);
    expect(data.words[0].readingContexts?.[0].translation).toBe('译文');
    const afterFirstImport = structuredClone(data);

    mergePersonalLibrary(data, pkg, [], 'use-package');
    expect(data).toEqual(afterFirstImport);
  });

  it('merges builtin-word contexts by stable context ID and never alters the builtin word itself', () => {
    const pkg = packageFromSource();
    const builtinWord = word('builtin-word', 'builtin-lesson', '原有内置词', [context('existing-context', '本机公共例句。')]);
    const data = emptyData();
    data.books = [book('builtin', '内置词书')];
    data.lessons = [lesson('builtin-lesson', 'builtin')];
    data.words = [builtinWord];
    const originalWord = structuredClone(builtinWord);
    const preview = previewPersonalLibraryMerge(data, pkg, ['builtin']);

    expect(preview).toMatchObject({ newContexts: 2, existingContexts: 0 });
    mergePersonalLibrary(data, pkg, ['builtin']);
    expect(data.words[0]).toEqual({ ...originalWord, readingContexts: [
      ...(originalWord.readingContexts ?? []), expect.objectContaining({ id: 'builtin-context-1' }),
    ] });
    const afterFirstImport = structuredClone(data);
    mergePersonalLibrary(data, pkg, ['builtin']);
    expect(data).toEqual(afterFirstImport);
  });

  it('rejects broken parent relationships before changing any data', () => {
    const pkg = packageFromSource(false);
    const data = emptyData();
    data.books = [book('personal', '现有书')];
    data.lessons = [lesson('personal-lesson', 'personal', '现有课')];
    data.words = [word('personal-word', 'personal-lesson', '现有词')];
    const before = structuredClone(data);
    const invalid = structuredClone(pkg);
    invalid.words[0].lessonId = 'missing-lesson';

    expect(() => mergePersonalLibrary(data, invalid, [])).toThrow();
    expect(data).toEqual(before);
  });

  it('rejects an incoming ID with a conflicting parent without partially applying new records', () => {
    const pkg = packageFromSource(false);
    const data = emptyData();
    data.books = [book('other', '其他词书')];
    data.lessons = [lesson('personal-lesson', 'other', '占用同ID的课')];
    data.words = [];
    const before = structuredClone(data);

    expect(() => mergePersonalLibrary(data, pkg, [])).toThrow();
    expect(data).toEqual(before);
  });

  it('rejects malformed word data as one unit without partially applying valid records', () => {
    const pkg = packageFromSource(false);
    const data = emptyData();
    data.books = [book('existing', '已有词书')];
    const before = structuredClone(data);
    const invalid = structuredClone(pkg);
    invalid.words[0].id = '';

    expect(() => mergePersonalLibrary(data, invalid, [])).toThrow();
    expect(data).toEqual(before);
  });

  it('round trips empty dictionary reading and meanings through create, parse, and merge without changing learning state', () => {
    const source = sourceData();
    const dictionaryWord = source.words.find(item => item.id === 'personal-word')!;
    dictionaryWord.reading = '';
    dictionaryWord.meaning = '';
    dictionaryWord.senses = [{ meaning: '' }];

    const state = initialState('builtin-word', new Date(exportedAt));
    source.states = [state];
    source.logs = [{
      id: 'builtin-log', userId: 'local', wordId: 'builtin-word', reviewedAt: exportedAt,
      rating: 3, responseTime: 100, previousState: state, newState: state, studyMode: 'new',
    }];
    source.currentBookId = 'builtin';
    source.currentBookIdUpdatedAt = localAt;
    source.currentBookIdSource = 'user';

    const created = createPersonalLibrary(source, ['builtin'], new Date(exportedAt));
    const parsed = parsePersonalLibrary(JSON.stringify(created));
    expect(parsed).not.toBeNull();
    const incoming = parsed!;
    expect(incoming.words[0]).toMatchObject({
      id: 'personal-word', reading: '', meaning: '', senses: [{ meaning: '' }],
    });

    const target = structuredClone(source);
    target.words = target.words.filter(item => item.id !== 'personal-word');
    const statesBefore = structuredClone(target.states);
    const logsBefore = structuredClone(target.logs);
    const currentBookBefore = {
      id: target.currentBookId,
      updatedAt: target.currentBookIdUpdatedAt,
      source: target.currentBookIdSource,
    };

    const result = mergePersonalLibrary(target, incoming, ['builtin']);

    expect(result.newWords).toBe(1);
    expect(target.words.find(item => item.id === 'personal-word')).toMatchObject({
      id: 'personal-word', reading: '', meaning: '', senses: [{ meaning: '' }],
    });
    expect(target.states).toEqual(statesBefore);
    expect(target.logs).toEqual(logsBefore);
    expect({ id: target.currentBookId, updatedAt: target.currentBookIdUpdatedAt, source: target.currentBookIdSource })
      .toEqual(currentBookBefore);
  });
});
