import { initialState } from '@jp/core';
import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { extensionDailyStudyPlan } from '../apps/extension/src/daily-study-plan';
import { applyPersonalLibraryMutation, exportExtensionPersonalLibrary, personalLibraryData } from '../apps/extension/src/personal-library';
import { emptySnapshot, type ExtensionSnapshot, type ExtensionWord } from '../apps/extension/src/model';

const builtin: ExtensionWord = {
  id: 'text-word', bookId: 'text-book', lessonId: 'text-l-1', order: 0,
  term: '猫', reading: 'ねこ', meaning: 'cat', source: 'textbook', bookTitle: '教材', lessonTitle: '第一课',
};

function personalSnapshot(): ExtensionSnapshot {
  const snapshot = emptySnapshot();
  snapshot.learning.books.push({
    id: 'personal-book', title: '本地词书', description: '简介', wordCount: 1, source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', cover: 'cover.png',
  });
  snapshot.learning.lessons = [{ id: 'portable-lesson-id', bookId: 'personal-book', title: '第一课', order: 0 }];
  snapshot.learning.words.push({
    id: 'personal-word', bookId: 'personal-book', lessonId: 'portable-lesson-id', order: 0,
    term: '言葉', reading: 'ことば', meaning: 'word', source: 'manual', bookTitle: '本地词书', lessonTitle: '第一课',
  });
  return snapshot;
}

function mutate(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], action: Parameters<typeof applyPersonalLibraryMutation>[2], id = 'new-id', now = '2026-10-16T00:00:00.000Z') {
  applyPersonalLibraryMutation(snapshot, catalog, action, { now, createId: () => id });
}

describe('extension personal library adapter', () => {
  it('preserves progress while creating and editing personal content', () => {
    const snapshot = personalSnapshot();
    const state = initialState('personal-word', new Date('2026-01-01T00:00:00.000Z'), 'local');
    state.status = 'learning';
    state.reviewCount = 4;
    snapshot.learning.states.push(state);
    snapshot.learning.logs.push({
      id: 'review-1', userId: 'local', wordId: 'personal-word', reviewedAt: '2026-01-02T00:00:00.000Z',
      rating: 3, responseTime: 1200, previousState: state, newState: state, studyMode: 'new',
    });
    snapshot.learning.quizAttempts.push({
      id: 'quiz-1', requestId: 'request-1', wordId: 'personal-word', type: 'card', prompt: '言葉', options: [],
      selected: null, correct: 'word', isCorrect: false, elapsedMs: 500, recordedAt: '2026-01-02T00:00:00.000Z',
    });
    const progressBefore = JSON.stringify({ states: snapshot.learning.states, logs: snapshot.learning.logs, quiz: snapshot.learning.quizAttempts });

    mutate(snapshot, [builtin], { type: 'create-book', title: '新词书' }, 'new-book');
    mutate(snapshot, [builtin], { type: 'create-lesson', bookId: 'new-book', title: '空课次' }, 'empty-lesson');
    mutate(snapshot, [builtin], { type: 'update-book', bookId: 'personal-book', title: '改名词书', description: '新简介' });
    mutate(snapshot, [builtin], { type: 'update-lesson', lessonId: 'portable-lesson-id', title: '第二课' });
    mutate(snapshot, [builtin], {
      type: 'save-word', wordId: 'personal-word', lessonId: 'portable-lesson-id',
      term: '言の葉', reading: 'ことのは', meaning: 'language', example: '言の葉を学ぶ',
    });

    expect(snapshot.learning.books.find(book => book.id === 'personal-book')).toMatchObject({ title: '改名词书', description: '新简介' });
    expect(snapshot.learning.lessons).toContainEqual({ id: 'empty-lesson', bookId: 'new-book', title: '空课次', order: 0 });
    expect(snapshot.learning.lessons?.find(lesson => lesson.id === 'portable-lesson-id')?.title).toBe('第二课');
    expect(snapshot.learning.words.find(word => word.id === 'personal-word')).toMatchObject({ term: '言の葉', meaning: 'language', bookId: 'personal-book' });
    expect(JSON.stringify({ states: snapshot.learning.states, logs: snapshot.learning.logs, quiz: snapshot.learning.quizAttempts })).toBe(progressBefore);
  });

  it('refreshes personal book counts and denormalized titles after edits and deletions', () => {
    const snapshot = personalSnapshot();
    const state = initialState('personal-word', new Date('2026-01-01T00:00:00.000Z'), 'local');
    snapshot.learning.states.push(state);
    snapshot.words.push({ word: structuredClone(snapshot.learning.words[0]), savedAt: '2026-01-01T00:00:00.000Z', state: structuredClone(state) });
    const progressBefore = JSON.stringify({ states: snapshot.learning.states, logs: snapshot.learning.logs, quiz: snapshot.learning.quizAttempts });

    mutate(snapshot, [builtin], { type: 'update-book', bookId: 'personal-book', title: '更新后的词书' });
    mutate(snapshot, [builtin], { type: 'update-lesson', lessonId: 'portable-lesson-id', title: '更新后的课次' });
    expect(snapshot.learning.words[0]).toMatchObject({ bookTitle: '更新后的词书', lessonTitle: '更新后的课次' });
    expect(snapshot.words[0].word).toMatchObject({ bookTitle: '更新后的词书', lessonTitle: '更新后的课次' });

    mutate(snapshot, [builtin], {
      type: 'save-word', lessonId: 'portable-lesson-id', term: '新词', reading: 'しんご', meaning: 'new word',
    }, 'second-word');
    expect(snapshot.learning.books[0].wordCount).toBe(2);
    mutate(snapshot, [builtin], { type: 'delete-word', wordId: 'second-word' });
    expect(snapshot.learning.books[0].wordCount).toBe(1);

    mutate(snapshot, [builtin], { type: 'create-lesson', bookId: 'personal-book', title: '待删除课次' }, 'temporary-lesson');
    mutate(snapshot, [builtin], {
      type: 'save-word', lessonId: 'temporary-lesson', term: '另一词', reading: 'べつのことば', meaning: 'another word',
    }, 'third-word');
    expect(snapshot.learning.books[0].wordCount).toBe(2);
    mutate(snapshot, [builtin], { type: 'delete-lesson', lessonId: 'temporary-lesson' });
    expect(snapshot.learning.books[0].wordCount).toBe(1);
    expect(snapshot.learning.words.map(word => word.id)).toEqual(['personal-word']);
    expect(JSON.stringify({ states: snapshot.learning.states, logs: snapshot.learning.logs, quiz: snapshot.learning.quizAttempts })).toBe(progressBefore);
  });

  it('deletes only personal content and leaves built-in progress intact', () => {
    const snapshot = personalSnapshot();
    const builtinState = initialState('text-word', new Date('2026-01-01T00:00:00.000Z'), 'local');
    const personalState = initialState('personal-word', new Date('2026-01-01T00:00:00.000Z'), 'local');
    snapshot.learning.states.push(builtinState, personalState);
    snapshot.words.push({ word: snapshot.learning.words[0], savedAt: '2026-01-01T00:00:00.000Z', state: personalState });
    snapshot.preferences.selectedBookIds = ['text-book', 'personal-book'];

    expect(() => mutate(snapshot, [builtin], { type: 'delete-book', bookId: 'text-book' })).toThrow();
    expect(snapshot.learning.states.map(state => state.wordId)).toEqual(['text-word', 'personal-word']);

    mutate(snapshot, [builtin], { type: 'delete-book', bookId: 'personal-book' });
    expect(snapshot.learning.books.some(book => book.id === 'personal-book')).toBe(false);
    expect(snapshot.learning.words).toHaveLength(0);
    expect(snapshot.words).toHaveLength(0);
    expect(snapshot.learning.states.map(state => state.wordId)).toEqual(['text-word']);
    expect(snapshot.preferences.selectedBookIds).toEqual(['text-book']);
  });

  it('deduplicates and edits contexts while keeping textbook contexts separate from catalog words', () => {
    const snapshot = personalSnapshot();
    const catalog = [builtin];
    const draft = { sentence: '  猫 がいる。 ', sourceTitle: '小说', translation: '有猫。' };
    mutate(snapshot, catalog, { type: 'save-context', wordId: 'text-word', draft }, 'context-1');
    mutate(snapshot, catalog, { type: 'save-context', wordId: 'text-word', draft: { ...draft, sentence: '猫   がいる。', translation: '猫在这里。' } }, 'unused');
    expect(snapshot.learning.builtinContexts).toHaveLength(1);
    expect(snapshot.learning.builtinContexts?.[0].contexts).toMatchObject([{ id: 'context-1', translation: '猫在这里。' }]);

    mutate(snapshot, catalog, { type: 'save-context', wordId: 'text-word', contextId: 'context-1', draft: { sentence: '猫が好き。' } });
    expect(snapshot.learning.builtinContexts?.[0].contexts[0]).toMatchObject({ id: 'context-1', sentence: '猫が好き。' });
    expect(catalog[0].readingContexts).toBeUndefined();

    mutate(snapshot, catalog, { type: 'save-context', wordId: 'personal-word', draft: { sentence: '言葉を覚える。' } }, 'personal-context');
    expect(snapshot.learning.words[0].readingContexts?.[0].id).toBe('personal-context');
  });

  it('roundtrips portable lesson IDs and applies keep-local/use-package merge policies', () => {
    const catalog = [builtin];
    const exported = exportExtensionPersonalLibrary(personalSnapshot(), catalog, new Date('2026-10-16T00:00:00.000Z'));
    expect(exported.lessons.map(lesson => lesson.id)).toContain('portable-lesson-id');
    expect(exported.words.map(word => word.id)).toContain('personal-word');
    expect(exported.books.map(book => book.id)).not.toContain('text-book');

    const incoming = structuredClone(exported);
    incoming.books[0].title = '包内名称';
    incoming.words[0].meaning = 'package meaning';
    const keepLocal = personalSnapshot();
    mutate(keepLocal, catalog, { type: 'merge-package', library: incoming, policy: 'keep-local' });
    expect(keepLocal.learning.books[0].title).toBe('本地词书');
    expect(keepLocal.learning.words[0].meaning).toBe('word');
    expect(keepLocal.learning.lessons?.[0].id).toBe('portable-lesson-id');

    const usePackage = personalSnapshot();
    mutate(usePackage, catalog, { type: 'merge-package', library: incoming, policy: 'use-package' });
    expect(usePackage.learning.books[0].title).toBe('包内名称');
    expect(usePackage.learning.words[0].meaning).toBe('package meaning');
    expect(usePackage.learning.lessons?.[0].id).toBe('portable-lesson-id');
  });

  it('exports legacy manual favorites under their inferred personal book without leaking textbooks', () => {
    const snapshot = emptySnapshot();
    const legacy: ExtensionWord = {
      id: 'legacy-manual-word', lessonId: 'manual-l-1', order: 3, term: '手作り', reading: 'てづくり', meaning: 'handmade',
      source: 'manual', bookTitle: '我的生词本', lessonTitle: '旧课次',
    };
    snapshot.words.push({
      word: legacy, savedAt: '2026-01-01T00:00:00.000Z',
      state: initialState(legacy.id, new Date('2026-01-01T00:00:00.000Z'), 'local'),
    });
    const data = personalLibraryData(snapshot, [builtin]);
    const exported = exportExtensionPersonalLibrary(snapshot, [builtin], '2026-10-16T00:00:00.000Z');
    expect(data.lessons).toContainEqual({ id: 'manual-l-1', bookId: 'manual', title: '旧课次', order: 3 });
    expect(exported.books.map(book => book.id)).toContain('manual');
    expect(exported.words.map(word => word.id)).toContain('legacy-manual-word');
    expect(exported.books.map(book => book.id)).not.toContain('text-book');
  });

  it('supports Vue-reactive snapshots and catalogs used by the library workspace', () => {
    const snapshot = reactive(personalSnapshot()) as unknown as ExtensionSnapshot;
    const catalog = reactive([builtin]) as unknown as ExtensionWord[];

    const data = personalLibraryData(snapshot, catalog);
    const exported = exportExtensionPersonalLibrary(snapshot, catalog, '2026-10-16T00:00:00.000Z');
    const plan = extensionDailyStudyPlan(catalog, snapshot, 'personal-book', 1, new Date('2026-10-16T00:00:00.000Z'));

    expect(data.words.map(word => word.id)).toContain('personal-word');
    expect(exported.books.map(book => book.id)).toContain('personal-book');
    expect(plan.lessonId).toBe('portable-lesson-id');
  });
});
