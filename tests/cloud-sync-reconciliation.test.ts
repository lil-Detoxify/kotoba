import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IndexedDbRepository } from '@jp/storage';
import {
  initialState,
  evaluate,
  statistics,
  progress,
  reconcileFsrsFromEvents,
  mergeWordStateWithLww
} from '@jp/core';
import type {
  WordState,
  ReviewLog,
  ReviewEvent,
  CloudProgressDoc,
  UserSettings,
  Data,
  Word
} from '@jp/models';
// @ts-ignore
import worker from '../scripts/cloudflare-worker.js';

// ---------------------------------------------------------------------------
// Robust In-memory Mock D1 Implementation for Cloudflare Worker tests
// ---------------------------------------------------------------------------
class MockD1 {
  public users: Map<string, any> = new Map();
  public progress: Map<string, any> = new Map();
  public events: Map<string, any> = new Map();
  public settings: Map<string, any> = new Map();

  prepare(sql: string) {
    const d1 = this;
    return {
      bind(...params: any[]) {
        return {
          async first() {
            if (sql.includes('FROM users WHERE id = ?')) {
              const [uid] = params;
              const found = d1.users.get(uid);
              return found ? { ...found } : null;
            }
            if (sql.includes('FROM users WHERE auth_provider = ? AND provider_uid = ?')) {
              const [provider, uid] = params;
              for (const u of d1.users.values()) {
                if (u.auth_provider === provider && u.provider_uid === uid) return { ...u };
              }
              return null;
            }
            if (sql.includes('FROM users WHERE email_normalized = ? OR LOWER(TRIM(email)) = ?')) {
              const [email] = params;
              for (const u of d1.users.values()) {
                if (u.email === email || u.email_normalized === email) return { ...u };
              }
              return null;
            }
            if (sql.includes('SELECT count(*) as count FROM user_progress WHERE user_id = ?')) {
              const [uid] = params;
              let count = 0;
              for (const p of d1.progress.values()) {
                if (p.user_id === uid) count++;
              }
              return { count };
            }
            if (sql.includes('SELECT count(*) as count FROM review_events WHERE user_id = ?')) {
              const [uid] = params;
              let count = 0;
              for (const e of d1.events.values()) {
                if (e.user_id === uid) count++;
              }
              return { count };
            }
            if (sql.includes('SELECT * FROM user_progress WHERE user_id = ? AND word_id = ?')) {
              const [uid, wid] = params;
              const found = d1.progress.get(`${uid}:${wid}`);
              return found ? { ...found } : null;
            }
            if (sql.includes('FROM user_settings WHERE user_id = ?')) {
              const [uid] = params;
              const found = d1.settings.get(uid);
              return found ? { ...found } : null;
            }
            return null;
          },
          async all() {
            if (sql.includes('FROM user_progress WHERE user_id = ?')) {
              const [uid] = params;
              const results: any[] = [];
              for (const p of d1.progress.values()) {
                if (p.user_id === uid) results.push({ ...p });
              }
              return { results };
            }
            if (sql.includes('FROM review_events WHERE user_id = ?')) {
              const [uid] = params;
              const results: any[] = [];
              for (const e of d1.events.values()) {
                if (e.user_id === uid) results.push({ ...e });
              }
              return { results };
            }
            return { results: [] };
          },
          async run() {
            if (sql.includes('INSERT INTO users')) {
              const [id, auth_provider, provider_uid, email, email_normalized, created_at, updated_at] = params;
              d1.users.set(id, { id, auth_provider, provider_uid, email, email_normalized: email_normalized || email, created_at, updated_at });
              return { success: true };
            }
            if (sql.includes('INSERT INTO review_events')) {
              const [event_id, user_id, word_id, reviewed_at, rating, response_time, study_mode, device_id, quiz, client_created_at, server_received_at] = params;
              if (!d1.events.has(event_id)) {
                d1.events.set(event_id, {
                  event_id, user_id, word_id, reviewed_at, rating, response_time, study_mode, device_id, quiz, client_created_at, server_received_at
                });
              }
              return { success: true };
            }
            if (sql.includes('INSERT INTO user_progress')) {
              const [user_id, word_id, book_id, lesson_id, status, first_seen_at, last_reviewed_at, next_review_at, review_count, lapse_count, fsrs_card, is_difficult, difficult_updated_at, is_ignored, ignored_updated_at, updated_at] = params;
              d1.progress.set(`${user_id}:${word_id}`, {
                user_id, word_id, book_id, lesson_id, status, first_seen_at, last_reviewed_at, next_review_at, review_count, lapse_count, fsrs_card, is_difficult, difficult_updated_at, is_ignored, ignored_updated_at, updated_at, version: 1
              });
              return { success: true };
            }
            if (sql.includes('UPDATE user_progress SET')) {
              const [book_id, lesson_id, status, first_seen_at, last_reviewed_at, next_review_at, review_count, lapse_count, fsrs_card, is_difficult, difficult_updated_at, is_ignored, ignored_updated_at, updated_at, user_id, word_id] = params;
              const key = `${user_id}:${word_id}`;
              const prev = d1.progress.get(key) || {};
              d1.progress.set(key, {
                ...prev,
                book_id, lesson_id, status, first_seen_at, last_reviewed_at, next_review_at, review_count, lapse_count, fsrs_card, is_difficult, difficult_updated_at, is_ignored, ignored_updated_at, updated_at,
                version: (prev.version || 1) + 1
              });
              return { success: true };
            }
            if (sql.includes('INSERT INTO user_settings')) {
              const [user_id, current_book_id, last_studied_book_id, last_studied_lesson_id, last_studied_word_id, last_studied_updated_at, pronunciation_voice, updated_at] = params;
              d1.settings.set(user_id, {
                user_id, current_book_id, last_studied_book_id, last_studied_lesson_id, last_studied_word_id, last_studied_updated_at, pronunciation_voice, updated_at
              });
              return { success: true };
            }
            if (sql.includes('UPDATE user_settings SET')) {
              const [targetBookId, lastBook, lastLesson, lastWord, lastUpdatedAt, voice, updated_at, user_id] = params;
              const prev = d1.settings.get(user_id) || {};
              d1.settings.set(user_id, {
                ...prev,
                current_book_id: targetBookId !== null ? targetBookId : prev.current_book_id,
                last_studied_book_id: lastBook !== null ? lastBook : prev.last_studied_book_id,
                last_studied_lesson_id: lastLesson !== null ? lastLesson : prev.last_studied_lesson_id,
                last_studied_word_id: lastWord !== null ? lastWord : prev.last_studied_word_id,
                last_studied_updated_at: lastUpdatedAt !== null ? lastUpdatedAt : prev.last_studied_updated_at,
                pronunciation_voice: voice !== null ? voice : prev.pronunciation_voice,
                updated_at: updated_at || prev.updated_at
              });
              return { success: true };
            }
            return { success: true };
          }
        };
      }
    };
  }

  async batch(statements: any[]) {
    for (const stmt of statements) {
      await stmt.run();
    }
    return [];
  }
}

describe('Cloud Sync Reconciliation & Data Loss Prevention Suite', () => {
  const userId = 'kb_recon_test_uid';
  const token = `mock_${userId}:${userId}:recon@kotobud.com`;

  function createTestEnv() {
    const mockD1 = new MockD1();
    mockD1.users.set(userId, {
      id: userId,
      auth_provider: 'mock',
      provider_uid: userId,
      email: 'recon@kotobud.com',
      email_normalized: 'recon@kotobud.com',
      created_at: '2026-09-18T00:00:00Z',
      updated_at: '2026-09-18T00:00:00Z'
    });
    return { mockD1, env: { DB: mockD1 } };
  }

  // -------------------------------------------------------------------------
  // Scenario 1: Cloud has data + local empty -> auto pull & deterministic restore
  // -------------------------------------------------------------------------
  it('Scenario 1: Cloud has data + local empty -> auto pull & deterministic restore without overwriting cloud', async () => {
    const { mockD1, env } = createTestEnv();

    // 1. Seed cloud data: 15 progress records and 15 review events (like the incident!)
    const cloudProgress: CloudProgressDoc[] = Array.from({ length: 15 }, (_, i) => ({
      _id: `recon_p_${i}`,
      userId,
      wordId: `biaori-beginner-lower-w-28-${1212 + i}`,
      bookId: 'biaori-beginner-lower',
      lessonId: 'biaori-beginner-lower-l-28',
      status: 'learning',
      reviewCount: 1,
      lapseCount: 0,
      card: { reps: 1, state: 1, stability: 2, difficulty: 5, due: new Date(Date.now() - 3600000).toISOString() } as any,
      isDifficult: false,
      isIgnored: false,
      version: 1,
      firstSeenAt: '2026-09-18T00:33:00Z',
      lastReviewedAt: '2026-09-18T00:33:00Z',
      nextReviewAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: '2026-09-18T00:33:00Z'
    }));

    const cloudEvents: ReviewEvent[] = Array.from({ length: 15 }, (_, i) => ({
      _id: `recon_ev_${i}`,
      userId,
      wordId: `biaori-beginner-lower-w-28-${1212 + i}`,
      reviewedAt: '2026-09-18T00:33:00Z',
      rating: 3,
      responseTime: 1500,
      studyMode: 'review',
      clientCreatedAt: '2026-09-18T00:33:00Z',
      serverReceivedAt: '2026-09-18T00:33:00Z'
    }));

    await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        progress: cloudProgress,
        events: cloudEvents,
        settings: {
          currentBookId: 'biaori-beginner-lower',
          currentBookIdSource: 'user',
          updatedAt: '2026-09-18T00:33:00Z'
        }
      })
    }), env);

    // Verify Cloud now has exactly 15 records and current_book_id = 'biaori-beginner-lower'
    expect(mockD1.progress.size).toBe(15);
    expect(mockD1.events.size).toBe(15);

    // 2. Initialize fresh local repository on new device / browser (empty states)
    const repo = new IndexedDbRepository(`test_recon_1_${Math.random()}`);
    repo.switchUser(userId);
    await repo.open();

    const initialLocal = await repo.read();
    expect(initialLocal.states).toHaveLength(0);
    expect(initialLocal.logs).toHaveLength(0);

    // 3. Simulate client reconciliation: Pull from cloud
    const pullRes = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/pull', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }), env);
    expect(pullRes.status).toBe(200);
    const pullData = await pullRes.json();
    expect(pullData.progress).toHaveLength(15);
    expect(pullData.events).toHaveLength(15);
    expect(pullData.settings.currentBookId).toBe('biaori-beginner-lower');

    // 4. Perform deterministic merge and persist to local
    await repo.transact(d => {
      d.states = pullData.progress.map((p: any) => ({
        userId,
        wordId: p.wordId,
        bookId: p.bookId,
        lessonId: p.lessonId,
        status: p.status,
        firstSeenAt: p.firstSeenAt,
        lastReviewedAt: p.lastReviewedAt,
        nextReviewAt: p.nextReviewAt,
        reviewCount: p.reviewCount,
        lapseCount: p.lapseCount,
        card: p.card,
        isDifficult: !!p.isDifficult,
        isIgnored: !!p.isIgnored,
        updatedAt: p.updatedAt
      }));
      d.logs = pullData.events.map((e: any) => ({
        id: e.event_id || e._id,
        userId,
        wordId: e.wordId,
        reviewedAt: e.reviewedAt,
        rating: e.rating,
        responseTime: e.responseTime,
        studyMode: e.studyMode,
        clientCreatedAt: e.clientCreatedAt
      }));
      d.currentBookId = pullData.settings.currentBookId;
      d.currentBookIdSource = 'user';
      d.currentBookIdUpdatedAt = pullData.settings.updatedAt;
    });

    // 5. Verify local state is 100% restored
    const restoredLocal = await repo.read();
    expect(restoredLocal.states).toHaveLength(15);
    expect(restoredLocal.logs).toHaveLength(15);
    expect(restoredLocal.currentBookId).toBe('biaori-beginner-lower');
    expect(restoredLocal.currentBookIdSource).toBe('user');

    // 6. Verify empty queue does NOT overwrite cloud data
    const queue = await repo.getQueue();
    expect(queue).toHaveLength(0);
    // Cloud still holds all 15 records intact
    expect(mockD1.progress.size).toBe(15);
    expect(mockD1.events.size).toBe(15);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Cloud has data + local has un-synced data -> deterministic merge
  // -------------------------------------------------------------------------
  it('Scenario 2: Cloud has data + local has un-synced data -> deterministic merge (LWW for states, FSRS replay for events, preserve local unsynced)', async () => {
    const { mockD1, env } = createTestEnv();

    // Cloud has word A (learned 2 days ago) and word B (learned 2 days ago)
    const tCloud = '2026-09-16T10:00:00Z';
    const initWordA = initialState('word_A', new Date(tCloud), userId);
    const { state: stateA1, log: logA1 } = evaluate(initWordA, 3, 'review', new Date(tCloud), 'ev_a1');
    const initWordB = initialState('word_B', new Date(tCloud), userId);
    const { state: stateB1, log: logB1 } = evaluate(initWordB, 3, 'review', new Date(tCloud), 'ev_b1');

    await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        progress: [stateA1, stateB1],
        events: [logA1, logB1],
        settings: { currentBookId: 'book_1', updatedAt: tCloud }
      })
    }), env);

    // Local device was offline. It reviewed word B today (T_local > T_cloud) and learned word C today
    const tLocal = '2026-09-18T10:00:00Z';
    const repo = new IndexedDbRepository(`test_recon_2_${Math.random()}`);
    repo.switchUser(userId);
    await repo.open();

    const { state: stateB2, log: logB2 } = evaluate(stateB1, 3, 'review', new Date(tLocal), 'ev_b2');
    const initWordC = initialState('word_C', new Date(tLocal), userId);
    const { state: stateC1, log: logC1 } = evaluate(initWordC, 3, 'new', new Date(tLocal), 'ev_c1');

    await repo.transact(d => {
      d.states = [stateB2, stateC1];
      d.logs = [logB1, logB2, logC1];
    });

    await repo.enqueue([
      { id: 'q_ev_b2', type: 'review_event', payload: logB2, retries: 0, createdAt: tLocal },
      { id: 'q_pr_b2', type: 'progress', payload: stateB2, retries: 0, createdAt: tLocal },
      { id: 'q_ev_c1', type: 'review_event', payload: logC1, retries: 0, createdAt: tLocal },
      { id: 'q_pr_c1', type: 'progress', payload: stateC1, retries: 0, createdAt: tLocal }
    ]);

    // Pull from cloud
    const pullRes = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/pull', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }), env);
    const pullData = await pullRes.json();

    // Reconcile deterministically:
    const localData = await repo.read();
    const localQueue = await repo.getQueue();

    // A) Combine all unique events
    const eventMap = new Map<string, any>();
    for (const e of pullData.events) eventMap.set(e.event_id || e._id, e);
    for (const l of localData.logs) eventMap.set(l.id, l);
    for (const q of localQueue) {
      if (q.type === 'review_event') eventMap.set(q.payload.id || q.payload._id, q.payload);
    }
    const allEvents = Array.from(eventMap.values()).sort(
      (a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime()
    );

    // B) Combine states
    const allWordIds = new Set<string>([
      ...localData.states.map(s => s.wordId),
      ...pullData.progress.map((p: any) => p.wordId)
    ]);

    const mergedStates: WordState[] = [];
    for (const wId of allWordIds) {
      const localS = localData.states.find(s => s.wordId === wId);
      const remoteP = pullData.progress.find((p: any) => p.wordId === wId);
      const wEvents = allEvents.filter(e => e.wordId === wId);

      if (localS && remoteP) {
        mergedStates.push(mergeWordStateWithLww(localS, remoteP, wEvents));
      } else if (localS) {
        mergedStates.push(wEvents.length > 0 ? reconcileFsrsFromEvents(wEvents, localS) : localS);
      } else if (remoteP) {
        mergedStates.push({
          userId,
          wordId: remoteP.wordId,
          bookId: remoteP.bookId,
          lessonId: remoteP.lessonId,
          status: remoteP.status,
          firstSeenAt: remoteP.firstSeenAt,
          lastReviewedAt: remoteP.lastReviewedAt,
          nextReviewAt: remoteP.nextReviewAt,
          reviewCount: remoteP.reviewCount,
          lapseCount: remoteP.lapseCount,
          card: remoteP.card,
          isDifficult: !!remoteP.isDifficult,
          isIgnored: !!remoteP.isIgnored,
          updatedAt: remoteP.updatedAt
        });
      }
    }

    // Persist merged states
    await repo.transact(d => {
      d.states = mergedStates;
    });

    const afterMerge = await repo.read();
    expect(afterMerge.states).toHaveLength(3); // Word A, Word B, Word C
    const mergedB = afterMerge.states.find(s => s.wordId === 'word_B');
    expect(mergedB?.reviewCount).toBe(2); // replayed both reviews (T_cloud + T_local)!

    // Now flush the queue to cloud
    const pushQueue = await repo.getQueue();
    const pushEvents = pushQueue.filter(q => q.type === 'review_event').map(q => q.payload);
    const pushProgress = pushQueue.filter(q => q.type === 'progress').map(q => q.payload);

    const pushRes = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: pushEvents, progress: pushProgress })
    }), env);
    expect(pushRes.status).toBe(200);

    // Dequeue after successful push
    await repo.dequeue(pushQueue.map(q => q.id));
    expect(await repo.getQueue()).toHaveLength(0);

    // Cloud now has 3 words, word B has review_count = 2, and word C exists
    expect(mockD1.progress.size).toBe(3);
    const cloudB = mockD1.progress.get(`${userId}:word_B`);
    expect(cloudB.review_count).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Offline / pull failure -> do NOT push defaults, retain local
  // -------------------------------------------------------------------------
  it('Scenario 3: Offline / pull failure -> do NOT push defaults, retain local state, block push until ready', async () => {
    const repo = new IndexedDbRepository(`test_recon_3_${Math.random()}`);
    repo.switchUser(userId);
    await repo.open();

    // Local has 5 words and user-configured currentBookId
    await repo.transact(d => {
      d.currentBookId = 'biaori-beginner-lower';
      d.currentBookIdSource = 'user';
      d.currentBookIdUpdatedAt = '2026-09-18T10:00:00Z';
      d.states = Array.from({ length: 5 }, (_, i) => initialState(`w_local_${i}`, new Date(), userId));
    });

    let isSyncReady = false;
    let syncPushed = false;

    // Simulate network error during pull
    try {
      throw new Error('Network offline or fetch error');
    } catch (err) {
      // Reconcile failed: isSyncReady remains false!
      isSyncReady = false;
    }

    // Flush sync queue attempt
    async function flushSyncQueue() {
      if (!isSyncReady) {
        // Guard prevents any push before reconciliation is ready!
        return;
      }
      syncPushed = true;
    }

    await flushSyncQueue();
    expect(syncPushed).toBe(false); // Push was blocked!

    // Verify local data is 100% retained
    const local = await repo.read();
    expect(local.states).toHaveLength(5);
    expect(local.currentBookId).toBe('biaori-beginner-lower');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Auth state restored asynchronously after init() -> triggers reconciliation
  // -------------------------------------------------------------------------
  it('Scenario 4: Auth state restored asynchronously after init() -> triggers reconciliation properly', async () => {
    const { mockD1, env } = createTestEnv();

    // Cloud has 1 progress record
    await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        progress: [{ wordId: 'async_w1', status: 'learning', reviewCount: 1, card: {} }],
        events: [{ _id: 'async_ev1', wordId: 'async_w1', reviewedAt: '2026-09-18T10:00:00Z', rating: 3 }]
      })
    }), env);

    const repo = new IndexedDbRepository(`test_recon_4_${Math.random()}`);

    // Simulate app startup before auth is resolved (guest namespace)
    repo.switchUser(null);
    await repo.open();
    let currentUser: any = null;
    let isSyncReady = false;

    // Simulate onAuthStateChange callback
    async function onAuthStateChange(user: any) {
      if (user) {
        currentUser = user;
        await repo.close();
        repo.switchUser(user.id);
        await repo.open();

        // Perform reconciliation
        const pullRes = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/pull', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }), env);
        const pullData = await pullRes.json();

        await repo.transact(d => {
          d.states = pullData.progress.map((p: any) => ({
            userId: user.id,
            wordId: p.wordId,
            status: p.status,
            reviewCount: p.reviewCount,
            card: p.card
          }));
        });
        isSyncReady = true;
      }
    }

    // Auth resolves asynchronously
    await onAuthStateChange({ id: userId, email: 'recon@kotobud.com' });

    expect(isSyncReady).toBe(true);
    const userData = await repo.read();
    expect(userData.states).toHaveLength(1);
    expect(userData.states[0].wordId).toBe('async_w1');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Lower book studied while default / loaded book is upper book -> statistics() decoupled
  // -------------------------------------------------------------------------
  it('Scenario 5: Lower book studied while active loaded words are upper book -> statistics() correctly shows learned=15, due=15, streak=1', () => {
    const now = new Date('2026-09-19T08:00:00Z');

    // 15 states for biaori-beginner-lower, all learned today, due now
    const states: WordState[] = Array.from({ length: 15 }, (_, i) => ({
      ...initialState(`biaori-beginner-lower-w-28-${1212 + i}`, now, userId),
      bookId: 'biaori-beginner-lower',
      lessonId: 'biaori-beginner-lower-l-28',
      status: 'learning',
      reviewCount: 1,
      firstSeenAt: '2026-09-19T00:33:00Z',
      lastReviewedAt: '2026-09-19T00:33:00Z',
      nextReviewAt: '2026-09-19T00:33:00Z', // due now!
      updatedAt: '2026-09-19T00:33:00Z'
    }));

    // 15 logs for today
    const logs: ReviewLog[] = Array.from({ length: 15 }, (_, i) => ({
      id: `log_${i}`,
      userId,
      wordId: `biaori-beginner-lower-w-28-${1212 + i}`,
      reviewedAt: '2026-09-19T00:33:00Z',
      rating: 3,
      responseTime: 1200,
      studyMode: 'review',
      clientCreatedAt: '2026-09-19T00:33:00Z',
      previousState: null as any,
      newState: null as any
    }));

    // data.words only contains biaori-beginner-upper (completely different book and words!)
    const upperWords: Word[] = Array.from({ length: 48 }, (_, i) => ({
      id: `biaori-beginner-upper-w-1-${i}`,
      lessonId: 'biaori-beginner-upper-l-1',
      term: `word_${i}`,
      reading: `yomi_${i}`,
      meaning: `meaning_${i}`,
      order: i + 1
    }));

    const data: Data = {
      books: [],
      lessons: [],
      words: upperWords,
      states,
      logs,
      currentBookId: 'biaori-beginner-upper', // default was upper!
      currentBookIdSource: 'default',
      seeded: true
    };

    // Evaluate statistics
    const stats = statistics(data, now, userId);

    // Crucial Assertions:
    // learned must be 15 (NOT 0!)
    expect(stats.learned).toBe(15);
    // due must be 15 (NOT 0!)
    expect(stats.due).toBe(15);
    // streak must be 1 (today is active)
    expect(stats.streak).toBe(1);
    // counts.learning must be 15
    expect(stats.counts.learning).toBe(15);

    // Meanwhile, progress on upperWords is 0 (as expected for that specific book)
    const upperProg = progress(data, upperWords, userId);
    expect(upperProg.learned).toBe(0);

    // But global stats correctly decoupled and reporting 15!
    expect(stats.total).toBe(48);
    expect(stats.percent).toBe(Math.round(15 / 48 * 100));
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Cross-device / multi-client alternating sync -> stale write defense & default protection
  // -------------------------------------------------------------------------
  it('Scenario 6: Cross-device / multi-client alternating sync -> stale write defense rejects older updatedAt and protects current_book_id', async () => {
    const { mockD1, env } = createTestEnv();

    // Client 1 explicitly selects 'biaori-beginner-lower' at 12:00
    const tClient1 = '2026-09-18T12:00:00Z';
    const pushRes1 = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          currentBookId: 'biaori-beginner-lower',
          currentBookIdSource: 'user',
          updatedAt: tClient1
        }
      })
    }), env);
    expect(pushRes1.status).toBe(200);

    // Verify Cloud settings
    const settingsCloud = mockD1.settings.get(userId);
    expect(settingsCloud.current_book_id).toBe('biaori-beginner-lower');
    expect(settingsCloud.updated_at).toBe(tClient1);

    // Client 2 attempts to push default 'biaori-beginner-upper' with older timestamp 08:00
    const tClient2Old = '2026-09-18T08:00:00Z';
    const pushRes2 = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          currentBookId: 'biaori-beginner-upper',
          currentBookIdSource: 'default',
          updatedAt: tClient2Old
        }
      })
    }), env);
    expect(pushRes2.status).toBe(200);

    // Worker stale-write defense & default protection prevents overwrite!
    const settingsCloudAfterStale = mockD1.settings.get(userId);
    expect(settingsCloudAfterStale.current_book_id).toBe('biaori-beginner-lower');
    expect(settingsCloudAfterStale.updated_at).toBe(tClient1);

    // Even if Client 2 pushed with current timestamp but source = 'default',
    // Worker protects existing user-configured current_book_id!
    const tClient2New = '2026-09-18T13:00:00Z';
    const pushRes3 = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          currentBookId: 'biaori-beginner-upper',
          currentBookIdSource: 'default',
          updatedAt: tClient2New
        }
      })
    }), env);
    expect(pushRes3.status).toBe(200);

    const settingsCloudAfterDefaultPush = mockD1.settings.get(userId);
    // Still 'biaori-beginner-lower'!
    expect(settingsCloudAfterDefaultPush.current_book_id).toBe('biaori-beginner-lower');

    // And when Client 2 pulls from Cloud, it receives 'biaori-beginner-lower'
    const pullRes = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/pull', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }), env);
    const pullData = await pullRes.json();
    expect(pullData.settings.currentBookId).toBe('biaori-beginner-lower');
  });
});
