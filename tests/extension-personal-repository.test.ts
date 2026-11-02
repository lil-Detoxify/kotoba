import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ExtensionRepository, snapshotToData } from '../apps/extension/src/repository';
import { exportExtensionPersonalLibrary, extensionContentWords } from '../apps/extension/src/personal-library';
import { extensionDailyStudyPlan } from '../apps/extension/src/daily-study-plan';
import { extensionLibraryProgress } from '../apps/extension/src/learning-analytics';
import type { ExtensionWord } from '../apps/extension/src/model';

const catalog: ExtensionWord[] = [{ id: 'textbook-word', lessonId: 'textbook-l-1', term: '学生', reading: 'がくせい', meaning: '学生', order: 1, source: 'textbook', bookTitle: '教材', lessonTitle: '第一课' }];
function repository() { return new ExtensionRepository(`personal-repo-${crypto.randomUUID()}`); }
async function createPersonalWord(repo: ExtensionRepository) {
  let state = await repo.mutatePersonalLibrary({ type: 'create-book', title: '旅途' }, catalog);
  const book = state.learning.books.find(book => book.title === '旅途')!;
  state = await repo.mutatePersonalLibrary({ type: 'create-lesson', bookId: book.id, title: '第一站' }, catalog);
  const lesson = state.learning.lessons!.find(lesson => lesson.title === '第一站')!;
  state = await repo.mutatePersonalLibrary({ type: 'save-word', lessonId: lesson.id, term: '旅', reading: 'たび', meaning: '旅行' }, catalog);
  return { book, lesson, word: state.learning.words[0] };
}

describe('extension personal content persistence', () => {
  it('retains original FSRS records while edited words, empty lessons and contexts survive reload', async () => {
    const repo = repository();
    const { book, lesson, word } = await createPersonalWord(repo);
    await repo.save(word);
    const graded = await repo.rateLearning(word, 3, 'personal-grade', 0, 'new', 500);
    await repo.mutatePersonalLibrary({ type: 'save-word', wordId: word.id, lessonId: lesson.id, term: '旅', reading: 'たび', meaning: '旅程', example: '一人で旅をします。' }, catalog);
    await repo.mutatePersonalLibrary({ type: 'create-lesson', bookId: book.id, title: '空课次' }, catalog);
    await repo.mutatePersonalLibrary({ type: 'save-context', wordId: word.id, draft: { sentence: '春の旅を楽しみます。', translation: '享受春日旅行。' } }, catalog);
    const reloaded = await repo.read();
    expect(reloaded.learning.states).toEqual(graded.learning.states);
    expect(reloaded.learning.logs).toEqual(graded.learning.logs);
    expect(reloaded.words[0].word.meaning).toBe('旅程');
    expect(reloaded.learning.words[0].readingContexts?.[0].sentence).toBe('春の旅を楽しみます。');
    expect(reloaded.learning.lessons?.some(lesson => lesson.title === '空课次')).toBe(true);
    const portable = exportExtensionPersonalLibrary(reloaded, catalog);
    expect(portable.words[0].id).toBe(word.id);
    expect(portable.lessons.some(lesson => lesson.title === '空课次')).toBe(true);
    expect(extensionLibraryProgress(catalog, reloaded).books.find(entry => entry.id === book.id)).toMatchObject({ total: 1, learned: 1 });
    expect(extensionDailyStudyPlan(catalog, reloaded, book.id, 1)).toMatchObject({ target: 1, completed: 1, remaining: 0 });
    expect(snapshotToData(reloaded, 'local', catalog).lessons.some(entry => entry.title === '空课次')).toBe(true);
  });

  it('exports textbook contexts without copying textbook bodies and deletes personal progress only', async () => {
    const repo = repository();
    const { book, word } = await createPersonalWord(repo);
    await repo.rateLearning(catalog[0], 3, 'textbook-grade', 0, 'new', 500);
    await repo.rateLearning(word, 3, 'personal-grade', 0, 'new', 500);
    await repo.mutatePersonalLibrary({ type: 'save-context', wordId: catalog[0].id, draft: { sentence: '私は学生です。', sourceTitle: '阅读笔记' } }, catalog);
    const before = await repo.read();
    const portable = exportExtensionPersonalLibrary(before, catalog);
    expect(portable.words.some(entry => entry.id === catalog[0].id)).toBe(false);
    expect(portable.builtinContexts[0].wordId).toBe(catalog[0].id);
    const after = await repo.mutatePersonalLibrary({ type: 'delete-book', bookId: book.id }, catalog);
    expect(after.learning.states.map(state => state.wordId)).toEqual([catalog[0].id]);
    expect(after.learning.logs.map(log => log.wordId)).toEqual([catalog[0].id]);
    expect(extensionContentWords(await repo.read(), catalog)[0].readingContexts?.[0].sentence).toBe('私は学生です。');
  });

  it('rolls back an invalid content edit as one storage transaction', async () => {
    const repo = repository();
    const { lesson, word } = await createPersonalWord(repo);
    const before = await repo.read();
    await expect(repo.mutatePersonalLibrary({ type: 'save-word', wordId: word.id, lessonId: lesson.id, term: '', reading: 'たび', meaning: '旅行' }, catalog)).rejects.toThrow();
    expect(await repo.read()).toEqual(before);
  });

  it('keeps guest empty lessons and both kinds of original sentences when merging to an account', async () => {
    const database = `personal-guest-${crypto.randomUUID()}`;
    const guest = new ExtensionRepository(database);
    const { book, word } = await createPersonalWord(guest);
    await guest.mutatePersonalLibrary({ type: 'create-lesson', bookId: book.id, title: '空课次' }, catalog);
    await guest.mutatePersonalLibrary({ type: 'save-context', wordId: word.id, draft: { sentence: '長い旅でした。' } }, catalog);
    await guest.mutatePersonalLibrary({ type: 'save-context', wordId: catalog[0].id, draft: { sentence: '私は学生です。' } }, catalog);
    const account = new ExtensionRepository(database, 'account:synthetic-user');
    const merged = await account.mergeGuest('synthetic-user', catalog);
    expect(merged.learning.lessons?.find(lesson => lesson.title === '空课次')).toBeDefined();
    expect(merged.learning.words[0].readingContexts?.[0].sentence).toBe('長い旅でした。');
    expect(merged.learning.builtinContexts?.[0].contexts[0].sentence).toBe('私は学生です。');
    expect(merged.learning.words[0].bookId).toBeTruthy();
  });
});
