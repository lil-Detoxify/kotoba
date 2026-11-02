import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDB } from 'idb';
import { initialState } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { learningScenes } from '../apps/web/src/services/learning-scenes';
import { webTextbookWordId } from '../apps/web/src/services/textbook-catalog';
import { sceneStudyQueue } from '../apps/extension/src/learning-content';
import {
  ExtensionRepository,
  DuplicateReviewRequestError,
  InvalidRatingError,
  SavedWordNotFoundError,
  StaleReviewError
} from '../apps/extension/src/repository';
import type { ExtensionWord } from '../apps/extension/src/model';

function repository(name = `extension-test-${Math.random().toString(36).slice(2)}`): ExtensionRepository {
  return new ExtensionRepository(name);
}

function word(overrides: Partial<ExtensionWord> = {}): ExtensionWord {
  return {
    id: 'book-l-1-w-1',
    lessonId: 'book-l-1',
    term: '日本',
    reading: 'にほん',
    meaning: 'Japan',
    order: 1,
    source: 'textbook',
    bookTitle: 'Test book',
    lessonTitle: 'Lesson 1',
    ...overrides
  };
}

function realSceneTextbookWords(): ExtensionWord[] {
  const words: ExtensionWord[] = [];
  const bookIds = new Set(learningScenes.flatMap(scene => scene.items.map(item => item.bookId)));
  for (const bookId of bookIds) {
    const book = JSON.parse(readFileSync(resolve('apps/web/public/data/books', `${bookId}.json`), 'utf8'));
    for (const lesson of book.lessons) {
      const lessonId = `${bookId}-l-${lesson.order}`;
      lesson.words.forEach((sourceWord: any, index: number) => words.push({
        id: webTextbookWordId(bookId, lesson.order, sourceWord, index),
        lessonId,
        term: sourceWord.term,
        reading: sourceWord.reading,
        meaning: sourceWord.meaning,
        ...(sourceWord.partOfSpeech ? { partOfSpeech: sourceWord.partOfSpeech } : {}),
        ...(sourceWord.rawTerm ? { rawTerm: sourceWord.rawTerm } : {}),
        order: index,
        source: 'textbook',
        bookTitle: book.title,
        lessonTitle: lesson.title,
      }));
    }
  }
  return words;
}

describe('ExtensionRepository', () => {
  it('starts empty and saves a validated card with an isolated local FSRS state', async () => {
    const name = `extension-test-${Math.random().toString(36).slice(2)}`;
    const repo = repository(name);
    expect(await repo.read()).toMatchObject({
      schema: 1,
      words: [],
      logs: [],
      preferences: { motion: 'standard', dailyGoal: 20, voice: 'female', exerciseType: 'card', selectedBookIds: [] },
      learning: { books: [], words: [], states: [], logs: [], quizAttempts: [] },
      syncQueue: [],
      identity: { partitionKey: 'current', userId: 'local' }
    });

    const saved = await repo.save(word(), 'WWW.Example.COM.');
    expect(saved.words).toHaveLength(1);
    expect(saved.words[0].sourceHost).toBe('www.example.com');
    expect(saved.words[0].state.userId).toBe('local');
    expect(saved.words[0].state.wordId).toBe(word().id);
    expect(saved.words[0].state.reviewCount).toBe(0);
    expect(saved.words[0].state.card.due).toBeInstanceOf(Date);

    const reloaded = await repository(name).read();
    expect(reloaded.words[0].state.card.due).toBeInstanceOf(Date);
  });

  it('does not accept injected user state and drops full or malformed source URLs', async () => {
    const repo = repository();
    await expect(repo.save({ ...word(), state: { userId: 'attacker' } } as unknown as ExtensionWord)).rejects.toThrow(/review state or user data/);

    const saved = await repo.save(word(), 'https://user:secret@example.com/path?q=token');
    expect(saved.words[0].sourceHost).toBeUndefined();
    await expect(repo.save(word({ id: 'too-long', meaning: 'x'.repeat(2_001) }))).rejects.toThrow(/exceeds 2000 characters/);
  });

  it('treats repeated saves as idempotent and preserves existing review state', async () => {
    const repo = repository();
    await repo.save(word());
    const firstReview = await repo.rate(word().id, 3, 'review-1', 0);
    const reviewed = await repo.rate(word().id, 3, 'review-2', 1);
    const repeated = await repo.save(word({ meaning: 'changed text' }), 'example.com');

    expect(firstReview.logs[0].studyMode).toBe('new');
    expect(reviewed.logs[1].studyMode).toBe('review');
    expect(repeated).toEqual(reviewed);
    expect(repeated.words).toHaveLength(1);
    expect(repeated.words[0].word.meaning).toBe('Japan');
    expect(repeated.words[0].state.reviewCount).toBe(2);
    expect(repeated.logs).toHaveLength(2);
  });

  it('deduplicates a retried rating before the stale review-count guard', async () => {
    const repo = repository();
    await repo.save(word());
    const first = await repo.rate(word().id, 3, 'request-1', 0);
    const retry = await repo.rate(word().id, 3, 'request-1', 0);

    expect(retry).toEqual(first);
    expect(retry.words[0].state.reviewCount).toBe(1);
    expect(retry.logs).toHaveLength(1);
    expect(retry.logs[0].rating).toBe(3);
    expect(retry.logs[0].studyMode).toBe('new');
    expect(retry.logs[0].previousState.card.due).toBeInstanceOf(Date);
    expect(retry.logs[0].newState.card.due).toBeInstanceOf(Date);
    await expect(repo.rate(word().id, 1, 'request-1', 0)).rejects.toBeInstanceOf(DuplicateReviewRequestError);
    await expect(repo.rate('another-word', 3, 'request-1', 0)).rejects.toBeInstanceOf(DuplicateReviewRequestError);
  });

  it('serializes ratings across repository instances and rejects a stale second card', async () => {
    const name = `extension-test-${Math.random().toString(36).slice(2)}`;
    const first = repository(name);
    const second = repository(name);
    await first.save(word());

    const results = await Promise.allSettled([
      first.rate(word().id, 2, 'parallel-a', 0),
      second.rate(word().id, 4, 'parallel-b', 0)
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find(result => result.status === 'rejected');
    expect(rejection?.status === 'rejected' && rejection.reason).toBeInstanceOf(StaleReviewError);

    const final = await first.read();
    expect(final.words[0].state.reviewCount).toBe(1);
    expect(final.logs).toHaveLength(1);
  });

  it('rejects stale or missing-card operations without changing the snapshot', async () => {
    const repo = repository();
    await repo.save(word());
    await repo.rate(word().id, 3, 'already-reviewed', 0);

    await expect(repo.rate(word().id, 3, 'different-request', 0)).rejects.toBeInstanceOf(StaleReviewError);
    await expect(repo.rate('missing-word', 3, 'missing-request', 0)).rejects.toBeInstanceOf(SavedWordNotFoundError);
    const snapshot = await repo.read();
    expect(snapshot.words[0].state.reviewCount).toBe(1);
    expect(snapshot.logs).toHaveLength(1);
    expect(snapshot.logs[0].studyMode).toBe('new');
  });

  it('removes the saved card while retaining its historical review logs', async () => {
    const repo = repository();
    await repo.save(word());
    await repo.rate(word().id, 3, 'historic-review', 0);
    const removed = await repo.remove(word().id);

    expect(removed.words).toHaveLength(0);
    expect(removed.logs).toHaveLength(1);
    await expect(repo.rate(word().id, 3, 'later-review', 1)).rejects.toBeInstanceOf(SavedWordNotFoundError);
    expect((await repo.read()).logs).toHaveLength(1);
  });

  it('validates motion settings and avoids writes when the preference is unchanged', async () => {
    const repo = repository();
    const reduced = await repo.setMotion('reduced');
    expect(reduced.preferences.motion).toBe('reduced');
    expect(await repo.setMotion('reduced')).toEqual(reduced);
    await expect(repo.setMotion('automatic' as never)).rejects.toThrow(/动效设置无效/);
    await expect(repo.rate(word().id, 0 as never, 'unknown-rating', 0)).rejects.toBeInstanceOf(InvalidRatingError);
  });

  it('throws on corrupt persisted data instead of replacing it with an empty snapshot', async () => {
    const name = `extension-corrupt-${Math.random().toString(36).slice(2)}`;
    const db = await openDB(name, 1, {
      upgrade(database) { database.createObjectStore('snapshot'); }
    });
    const corrupt = { schema: 7, words: [], logs: [], preferences: { motion: 'standard' } };
    await db.put('snapshot', corrupt, 'current');
    db.close();

    await expect(new ExtensionRepository(name).read()).rejects.toThrow(/扩展本地数据损坏/);
    const inspect = await openDB(name, 1);
    expect(await inspect.get('snapshot', 'current')).toEqual(corrupt);
    inspect.close();
  });

  it('hydrates a schema 1 user database in place and retains its saved words on the next write', async () => {
    const name = `extension-legacy-${Math.random().toString(36).slice(2)}`;
    const legacyWord = word();
    const savedAt = '2026-10-01T12:00:00.000Z';
    const legacy = {
      schema: 1,
      words: [{ word: legacyWord, savedAt, state: initialState(legacyWord.id, new Date(savedAt), 'local') }],
      logs: [],
      preferences: { motion: 'reduced' }
    };
    const db = await openDB(name, 1, { upgrade(database) { database.createObjectStore('snapshot'); } });
    await db.put('snapshot', legacy, 'current');
    db.close();

    const repo = new ExtensionRepository(name);
    const hydrated = await repo.read();
    expect(hydrated.words).toHaveLength(1);
    expect(hydrated.words[0].word.id).toBe(legacyWord.id);
    expect(hydrated.learning.states).toHaveLength(1);
    expect(hydrated.preferences).toMatchObject({ motion: 'reduced', dailyGoal: 20, voice: 'female' });
    const legacyRead = await openDB(name, 1);
    expect(await legacyRead.get('snapshot', 'current')).toEqual(legacy);
    legacyRead.close();

    const written = await repo.setDailyGoal(25);
    expect(written.words[0].word.id).toBe(legacyWord.id);
    expect(written.learning.states[0].wordId).toBe(legacyWord.id);
    expect(written.preferences.dailyGoal).toBe(25);
  });

  it('keeps lesson learning separate from favorites while sharing one FSRS state', async () => {
    const repo = repository();
    const queue = await repo.getLearningQueue([word()], { mode: 'new' });
    expect(queue).toHaveLength(1);
    expect(queue[0].state.reviewCount).toBe(0);

    const learned = await repo.rateLearning(word(), 3, 'lesson-review-1', 0, 'new', 840);
    expect(learned.words).toHaveLength(0);
    expect(learned.learning.states).toHaveLength(1);
    expect(learned.learning.logs).toHaveLength(1);
    expect(learned.learning.states[0].reviewCount).toBe(1);

    const saved = await repo.save(word());
    expect(saved.words).toHaveLength(1);
    expect(saved.words[0].state).toEqual(saved.learning.states[0]);
    const reviewed = await repo.rate(word().id, 4, 'favorite-review-2', 1);
    expect(reviewed.words[0].state.reviewCount).toBe(2);
    expect(reviewed.learning.states[0].reviewCount).toBe(2);
    expect(reviewed.learning.logs).toHaveLength(2);
  });

  it('maps textbook favorites to the shared difficult flag and preserves FSRS when removed', async () => {
    const name = `extension-favorite-sync-${Math.random().toString(36).slice(2)}`;
    const repo = new ExtensionRepository(name, 'account:user-1');
    const saved = await repo.save(word());
    const savedState = saved.learning.states.find(item => item.wordId === word().id)!;
    const saveProgress = saved.syncQueue.find(item => item.type === 'progress')!;
    expect(savedState.isDifficult).toBe(true);
    expect(savedState.difficultUpdatedAt).toBeTruthy();
    expect(saveProgress.payload).toMatchObject({ userId: 'user-1', wordId: word().id, isDifficult: true });

    const removed = await repo.remove(word().id);
    const removedState = removed.learning.states.find(item => item.wordId === word().id)!;
    const progressRows = removed.syncQueue.filter(item => item.type === 'progress');
    expect(removed.words).toHaveLength(0);
    expect(removedState).toMatchObject({ isDifficult: false, reviewCount: savedState.reviewCount, lapseCount: savedState.lapseCount });
    expect(removedState.card).toEqual(savedState.card);
    expect(removedState.difficultUpdatedAt).toBeTruthy();
    expect(progressRows.at(-1)?.payload).toMatchObject({ userId: 'user-1', wordId: word().id, isDifficult: false });
    expect(progressRows[0].id).not.toBe(progressRows.at(-1)?.id);
  });

  it('materializes catalog words marked difficult by cloud progress without resetting FSRS', async () => {
    const name = `extension-cloud-flags-${Math.random().toString(36).slice(2)}`;
    const repo = new ExtensionRepository(name, 'account:user-1');
    const rated = await repo.rateLearning(word(), 3, 'seed-rating', 0, 'new', 1_600);
    const before = rated.learning.states.find(item => item.wordId === word().id)!;
    const serverTime = new Date(Date.now() + 10_000).toISOString();
    const progress = {
      _id: `user-1:${word().id}`, userId: 'user-1', wordId: word().id,
      bookId: 'book', lessonId: word().lessonId, status: before.status,
      firstSeenAt: before.firstSeenAt, lastReviewedAt: before.lastReviewedAt, nextReviewAt: before.nextReviewAt,
      reviewCount: before.reviewCount, lapseCount: before.lapseCount,
      card: { ...before.card, due: before.card.due.toISOString(), last_review: before.card.last_review?.toISOString() },
      isDifficult: true, difficultUpdatedAt: serverTime, isIgnored: before.isIgnored,
      ignoredUpdatedAt: before.ignoredUpdatedAt, updatedAt: serverTime, version: 1
    };

    const merged = await repo.mergeCloud({ userId: 'user-1', progress: [progress], events: [], serverTime }, 'user-1', [word()]);
    const after = merged.learning.states.find(item => item.wordId === word().id)!;
    expect(merged.words.map(saved => saved.word.id)).toContain(word().id);
    expect(after.isDifficult).toBe(true);
    expect(after.reviewCount).toBe(before.reviewCount);
    expect(after.card).toEqual(before.card);
  });

  it('keeps newly queued progress when an older push acknowledgement arrives', async () => {
    const name = `extension-outbox-race-${Math.random().toString(36).slice(2)}`;
    const repo = new ExtensionRepository(name, 'account:user-1');
    await repo.setLearningFlags(word().id, { isDifficult: true }, word());
    const first = (await repo.getSyncQueue()).find(item => item.type === 'progress')!;
    await repo.setLearningFlags(word().id, { isDifficult: false }, word());
    const second = (await repo.getSyncQueue()).filter(item => item.type === 'progress').at(-1)!;
    expect(second.id).not.toBe(first.id);

    await repo.dequeueSync([first.id]);
    const remaining = await repo.getSyncQueue();
    expect(remaining.map(item => item.id)).toContain(second.id);
    expect(remaining.find(item => item.id === second.id)?.payload).toMatchObject({ isDifficult: false });
  });

  it('migrates schema-1 guest textbook favorites during explicit merge and guards cleanup by revision', async () => {
    const name = `extension-guest-merge-${Math.random().toString(36).slice(2)}`;
    const legacyWord = word();
    const savedAt = '2026-10-01T12:00:00.000Z';
    const legacyState = initialState(legacyWord.id, new Date(savedAt), 'local');
    legacyState.isDifficult = false;
    const legacy = {
      schema: 1,
      words: [{ word: legacyWord, savedAt, state: legacyState }],
      logs: [],
      preferences: { motion: 'standard' }
    };
    const db = await openDB(name, 1, { upgrade(database) { database.createObjectStore('snapshot'); } });
    await db.put('snapshot', legacy, 'current');
    db.close();

    const account = new ExtensionRepository(name, 'account:user-1');
    const guest = new ExtensionRepository(name, 'current');
    const merged = await account.mergeGuest('user-1', [legacyWord]);
    const migrated = merged.learning.states.find(item => item.wordId === legacyWord.id)!;
    expect(merged.words).toHaveLength(1);
    expect(migrated.isDifficult).toBe(true);
    expect(migrated.reviewCount).toBe(legacyState.reviewCount);
    expect(migrated.card).toEqual(legacyState.card);
    expect(merged.syncQueue.filter(item => item.type === 'progress')).toHaveLength(1);
    expect(merged.syncQueue.find(item => item.type === 'progress')?.payload).toMatchObject({ isDifficult: true });
    const countAfterFirstMerge = merged.syncQueue.length;
    const retry = await account.mergeGuest('user-1', [legacyWord]);
    expect(retry.syncQueue).toHaveLength(countAfterFirstMerge);

    await guest.save(word({ id: 'added-during-push', term: '追加' }));
    await guest.clearGuestAfterMerge('user-1');
    const retainedGuest = await guest.read();
    expect(retainedGuest.words.map(saved => saved.word.id)).toContain('added-during-push');
    expect(retainedGuest.learning.guestClaimedBy).toBe('user-1');
    await expect(new ExtensionRepository(name, 'account:user-2').mergeGuest('user-2', [legacyWord])).rejects.toThrow(/不能再次导入/);
  });

  it('keeps explicit multi-select and empty local book ranges across cloud pulls', async () => {
    const name = `extension-book-range-${Math.random().toString(36).slice(2)}`;
    const repo = new ExtensionRepository(name, 'account:user-1');
    const selected = await repo.setSelectedBookIds(['book-a', 'book-b']);
    expect(selected.preferences).toMatchObject({ selectedBookIds: ['book-a', 'book-b'], selectedBookIdsExplicit: true });
    expect(selected.learning.userSettings?.currentBookId).toBe('book-a');
    expect(selected.syncQueue.find(item => item.type === 'settings')?.payload).toMatchObject({ currentBookId: 'book-a', userId: 'user-1' });

    const later = new Date(Date.now() + 60_000).toISOString();
    const cloudSettings = { userId: 'user-1', currentBookId: 'book-c', currentBookIdSource: 'user', updatedAt: later };
    const pulled = { userId: 'user-1', progress: [], events: [], settings: cloudSettings, serverTime: later };
    const afterPull = await repo.mergeCloud(pulled, 'user-1');
    expect(afterPull.preferences.selectedBookIds).toEqual(['book-a', 'book-b']);
    expect(afterPull.learning.userSettings?.currentBookId).toBe('book-c');

    const cleared = await repo.setSelectedBookIds([]);
    expect(cleared.preferences).toMatchObject({ selectedBookIds: [], selectedBookIdsExplicit: true });
    const afterSecondPull = await repo.mergeCloud({
      ...pulled,
      settings: { ...cloudSettings, currentBookId: 'book-d', updatedAt: new Date(Date.now() + 120_000).toISOString() }
    }, 'user-1');
    expect(afterSecondPull.preferences.selectedBookIds).toEqual([]);
  });

  it('hydrates a legacy non-empty selected book range as an explicit local choice', async () => {
    const name = `extension-book-range-legacy-${Math.random().toString(36).slice(2)}`;
    const legacy = { schema: 1, words: [], logs: [], preferences: { motion: 'standard', selectedBookIds: ['legacy-book'] } };
    const db = await openDB(name, 1, { upgrade(database) { database.createObjectStore('snapshot'); } });
    await db.put('snapshot', legacy, 'current');
    db.close();

    expect((await new ExtensionRepository(name).read()).preferences).toMatchObject({
      selectedBookIds: ['legacy-book'], selectedBookIdsExplicit: true
    });
  });

  it('clears a successfully merged guest claim so a new guest batch can be claimed elsewhere', async () => {
    const name = `extension-guest-reclaim-${Math.random().toString(36).slice(2)}`;
    const guest = new ExtensionRepository(name, 'current');
    await guest.save(word());
    const firstAccount = new ExtensionRepository(name, 'account:user-1');
    await firstAccount.mergeGuest('user-1', [word()]);
    await guest.clearGuestAfterMerge('user-1');
    expect((await guest.read()).learning.guestClaimedBy).toBeUndefined();

    await guest.save(word({ id: 'second-batch-word', term: '二回目' }));
    const secondAccount = new ExtensionRepository(name, 'account:user-2');
    const merged = await secondAccount.mergeGuest('user-2', [word({ id: 'second-batch-word', term: '二回目' })]);
    expect(merged.words.map(saved => saved.word.id)).toContain('second-batch-word');
  });

  it('links an actual quiz attempt to the idempotent FSRS review event', async () => {
    const repo = repository('extension-quiz-' + Math.random().toString(36).slice(2));
    await repo.recordQuizAttempt({
      requestId: 'quiz-attempt-1', wordId: word().id, word: word(), type: 'kana-meaning', prompt: 'にほん',
      options: ['Japan', 'China', 'Korea'], selected: 'Japan', correct: 'Japan', elapsedMs: 1_240
    });
    const rated = await repo.rateLearning(word(), 3, 'quiz-grade-1', 0, 'new', 1_240, 'quiz-attempt-1');
    expect(rated.learning.logs[0].quiz).toMatchObject({ selected: 'Japan', correct: 'Japan', isCorrect: true });
    expect(rated.learning.logs[0].responseTime).toBe(1_240);
    const retry = await repo.rateLearning(word(), 3, 'quiz-grade-1', 0, 'new', 1_240, 'quiz-attempt-1');
    expect(retry).toEqual(rated);
    expect(retry.learning.logs).toHaveLength(1);
  });

  it('rates an unflagged scene word through difficult mode without changing its difficult flag', async () => {
    const repo = repository('extension-scene-rate-' + Math.random().toString(36).slice(2));
    const catalog = realSceneTextbookWords();
    const queue = sceneStudyQueue('shopping', catalog, await repo.read());
    expect(queue).toHaveLength(8);
    const candidate = queue[0];
    expect(candidate.state.isDifficult).toBe(false);

    const rate = () => repo.rateLearning(candidate.word, 3, 'scene-rating-1', 0, 'difficult', 720, null, 'shopping');
    const rated = await rate();
    const savedState = rated.learning.states.find(state => state.wordId === candidate.word.id)!;
    expect(savedState).toMatchObject({ reviewCount: 1, isDifficult: false });
    expect(rated.learning.logs).toHaveLength(1);
    expect(rated.learning.logs[0].studyMode).toBe('difficult');

    const retry = await rate();
    expect(retry).toEqual(rated);
    expect(retry.learning.states.find(state => state.wordId === candidate.word.id)?.reviewCount).toBe(1);
    expect(retry.learning.logs).toHaveLength(1);
  });

  it('rates a new unsaved textbook word from its selected personal sentence and keeps retries idempotent', async () => {
    const catalog = realSceneTextbookWords();
    const candidate = catalog.find(item => item.lessonId === 'biaori-beginner-upper-l-16' && item.term === '操作')!;
    expect(candidate).toBeDefined();
    const draft = {
      sentence: '昨日、操作方法を説明書で確認した。',
      translation: '昨天，我对照说明书确认了操作方法。',
      matchedText: '操作',
      sourceTitle: 'repository fixture',
    };
    const repo = repository('extension-personal-sentence-rate-' + Math.random().toString(36).slice(2));
    const withContext = await repo.mutatePersonalLibrary({ type: 'save-context', wordId: candidate.id, draft }, catalog);
    const selected = withContext.learning.builtinContexts?.find(entry => entry.wordId === candidate.id)?.contexts[0];
    expect(selected).toBeDefined();
    expect(withContext.words).toHaveLength(0);

    const rate = () => repo.rateLearning(candidate, 3, 'personal-context-rate-1', 0, 'difficult', 800, null, null, false, selected!.id);
    const rated = await rate();
    const state = rated.learning.states.find(entry => entry.wordId === candidate.id)!;
    expect(state).toMatchObject({ reviewCount: 1, isDifficult: false });
    expect(rated.words).toHaveLength(0);
    expect(rated.learning.logs).toHaveLength(1);
    expect(rated.learning.logs[0].studyMode).toBe('difficult');
    expect(await rate()).toEqual(rated);
    expect((await repo.read()).learning.logs).toHaveLength(1);

    const staleRepo = repository('extension-personal-sentence-stale-' + Math.random().toString(36).slice(2));
    const staleSeed = await staleRepo.mutatePersonalLibrary({ type: 'save-context', wordId: candidate.id, draft }, catalog);
    const staleContext = staleSeed.learning.builtinContexts?.find(entry => entry.wordId === candidate.id)?.contexts[0]!;
    await staleRepo.mutatePersonalLibrary({ type: 'delete-context', wordId: candidate.id, contextId: staleContext.id }, catalog);
    await expect(staleRepo.rateLearning(candidate, 3, 'personal-context-stale-1', 0, 'difficult', 800, null, null, false, staleContext.id))
      .rejects.toBeInstanceOf(StaleReviewError);
    expect((await staleRepo.read()).learning.logs).toHaveLength(0);
  });

  it('keeps the difficult-flag requirement without a valid scene member context', async () => {
    const repo = repository('extension-scene-rate-reject-' + Math.random().toString(36).slice(2));
    const catalog = realSceneTextbookWords();
    const candidate = sceneStudyQueue('shopping', catalog, await repo.read())[0].word;
    const outside = word({
      id: 'outside-shopping-scene',
      lessonId: candidate.lessonId,
      term: '場面外の語',
      reading: 'ばめんがいのご',
      meaning: 'outside the scene',
      source: 'textbook',
      bookTitle: candidate.bookTitle,
      lessonTitle: candidate.lessonTitle,
    });

    await expect(repo.rateLearning(candidate, 3, 'scene-no-context', 0, 'difficult', 300))
      .rejects.toBeInstanceOf(StaleReviewError);
    await expect(repo.rateLearning(candidate, 3, 'scene-invalid-id', 0, 'difficult', 300, null, 'missing'))
      .rejects.toThrow(/场景与词条不匹配/);
    await expect(repo.rateLearning(outside, 3, 'scene-outside-member', 0, 'difficult', 300, null, 'shopping'))
      .rejects.toThrow(/场景与词条不匹配/);
    expect((await repo.read()).learning.logs).toHaveLength(0);
  });

  it('persists input-practice preferences and validates input answers with the Web kana normalizer', async () => {
    const name = `extension-input-practice-${Math.random().toString(36).slice(2)}`;
    const repo = repository(name);
    for (const type of ['kana-input', 'dictation', 'sentence-cloze'] as const) {
      await repo.setExerciseType(type);
      expect((await repository(name).read()).preferences.exerciseType).toBe(type);
    }

    const kanaAttempt = {
      requestId: 'kana-input-1', wordId: word().id, word: word(), type: 'kana-input' as const,
      prompt: '日本', options: [], selected: 'ニ ホン', correct: 'にほん', elapsedMs: 920
    };
    const savedKana = await repo.recordQuizAttempt(kanaAttempt);
    expect(savedKana.learning.quizAttempts[0]).toMatchObject({
      type: 'kana-input', options: [], selected: 'ニ ホン', correct: 'にほん', isCorrect: true
    });
    expect(await repo.recordQuizAttempt(kanaAttempt)).toEqual(savedKana);

    const dictation = await repo.recordQuizAttempt({
      requestId: 'dictation-1', wordId: word().id, word: word(), type: 'dictation',
      prompt: '', options: [], selected: 'にぽん', correct: 'にほん', elapsedMs: 1_200
    });
    expect(dictation.learning.quizAttempts[1]).toMatchObject({
      type: 'dictation', options: [], selected: 'にぽん', correct: 'にほん', isCorrect: false
    });
    expect((await repository(name).read()).learning.quizAttempts).toHaveLength(2);

    const rated = await repo.rateLearning(word(), 3, 'input-grade-1', 0, 'new', 920, 'kana-input-1');
    expect(rated.learning.logs[0].quiz).toMatchObject({
      type: 'kana-input', options: [], selected: 'ニ ホン', correct: 'にほん', isCorrect: true
    });
  });

  it('keeps choice-quiz option validation and does not record sentence cloze as an objective quiz', async () => {
    const repo = repository();
    const choice = {
      requestId: 'choice-validation', wordId: word().id, word: word(), type: 'kana-meaning' as const,
      prompt: 'にほん', options: ['Japan', 'China'], selected: 'Japan', correct: 'Japan', elapsedMs: 500
    };
    await expect(repo.recordQuizAttempt({ ...choice, options: ['Japan'] })).rejects.toThrow(/测验作答内容无效/);
    await expect(repo.recordQuizAttempt({ ...choice, correct: 'Korea' })).rejects.toThrow(/测验作答内容无效/);
    await expect(repo.recordQuizAttempt({ ...choice, selected: 'Korea' })).rejects.toThrow(/测验作答内容无效/);
    await expect(repo.recordQuizAttempt({
      ...choice, requestId: 'cloze-is-not-an-attempt', type: 'sentence-cloze' as never, options: []
    })).rejects.toThrow(/测验作答内容无效/);
    expect((await repo.read()).learning.quizAttempts).toHaveLength(0);
  });

  it('rejects malformed custom wordbook input without partially importing any rows', async () => {
    const repo = repository('extension-import-' + Math.random().toString(36).slice(2));
    const before = await repo.read();
    await expect(repo.importCustomBook({ text: '[{"lesson":"1","term":"日","reading":"ひ","meaning":"sun"},{"lesson":"2","term":"月","reading":"つき"}]', format: 'json', title: 'My words' })).rejects.toThrow(/缺少 meaning/);
    expect(await repo.read()).toEqual(before);

    const imported = await repo.importCustomBook({ text: '[{"lesson":"1","term":"日","reading":"ひ","meaning":"sun","state":{"userId":"attacker","reviewCount":99},"userId":"attacker"}]', format: 'json', title: 'My words' });
    expect(imported.learning.books).toHaveLength(1);
    expect(imported.learning.words).toHaveLength(1);
    expect(imported.learning.words[0]).not.toHaveProperty('state');
    expect(imported.learning.states).toHaveLength(0);
  });
});
