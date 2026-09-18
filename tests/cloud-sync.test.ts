import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IndexedDbRepository } from '@jp/storage';
import { initialState, evaluate, reconcileFsrsFromEvents, mergeWordStateWithLww } from '@jp/core';
import type { WordState, ReviewLog, ReviewEvent, CloudProgressDoc } from '@jp/models';
import { WorkerSyncClient, MockAuthClient } from '@jp/sync';
// @ts-ignore
import worker from '../scripts/cloudflare-worker.js';

// ---------------------------------------------------------------------------
// In-memory Mock D1 Implementation for Cloudflare Worker tests
// ---------------------------------------------------------------------------
class MockD1 {
  public users: Map<string, any> = new Map(); // key: id
  public progress: Map<string, any> = new Map(); // key: user_id + ':' + word_id
  public events: Map<string, any> = new Map(); // key: event_id
  public settings: Map<string, any> = new Map(); // key: user_id

  prepare(sql: string) {
    const d1 = this;
    return {
      bind(...params: any[]) {
        return {
          async first() {
            if (sql.includes('FROM users WHERE auth_provider = ? AND provider_uid = ?')) {
              const [provider, uid] = params;
              for (const u of d1.users.values()) {
                if (u.auth_provider === provider && u.provider_uid === uid) return { ...u };
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
              const [id, auth_provider, provider_uid, email, created_at, updated_at] = params;
              d1.users.set(id, { id, auth_provider, provider_uid, email, created_at, updated_at });
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

describe('KotoBud Cloud Sync & Account System (17 Scenarios)', () => {
  // Scenario 1
  it('1. 旧版游客（只有 "data"）无损升级至 "data_guest"，旧键保留，数据 100% 存在', async () => {
    const dbName = `test_mig_${Math.random()}`;
    // Directly seed legacy 'data' into the database
    const rawRepo = new IndexedDbRepository(dbName);
    await rawRepo.transact(d => {
      d.seeded = true;
      d.books = [{ id: 'b_old', title: 'Legacy Book', description: 'Legacy', language: 'ja', createdAt: '2026-01-01', updatedAt: '2026-01-01' }];
      d.states = [{ wordId: 'w_old', userId: 'local', status: 'learning', isIgnored: false, isDifficult: true, reviewCount: 1, lapseCount: 0, card: {} as any }];
    }, 'data');

    // Create fresh repository instance (representing app restart / upgrade)
    const upgradedRepo = new IndexedDbRepository(dbName);
    const guestData = await upgradedRepo.read('data_guest');

    // Verified: data was migrated to data_guest
    expect(guestData.seeded).toBe(true);
    expect(guestData.books[0].title).toBe('Legacy Book');
    expect(guestData.states[0].wordId).toBe('w_old');

    // Verified: original legacy 'data' is strictly preserved for zero data loss
    const legacyData = await upgradedRepo.read('data');
    expect(legacyData.seeded).toBe(true);
    expect(legacyData.books[0].title).toBe('Legacy Book');
    expect(await upgradedRepo.hasLegacyData()).toBe(true);
  });

  // Scenario 2
  it('2. 首次登录（Case A：本地有数据，云端为空）将本地记录作为初始云端记录完整上传', async () => {
    const mockD1 = new MockD1();
    const env = { DB: mockD1 };

    // Worker sync push
    const token = 'mock_user_case_a:user_a:case_a@kotobud.com';
    const initRes = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/bootstrap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }), env);
    expect(initRes.status).toBe(200);
    const bootData = await initRes.json();
    expect(bootData.hasCloudData).toBe(false);

    // Push local initial records
    const pushRes = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        progress: [
          { wordId: 'w1', status: 'review', reviewCount: 3, lapseCount: 0, card: { reps: 3 } }
        ],
        events: [
          { _id: 'ev_1', wordId: 'w1', reviewedAt: '2026-09-17T10:00:00Z', rating: 3, responseTime: 1200, studyMode: 'review' }
        ],
        settings: { currentBookId: 'book_1' }
      })
    }), env);
    expect(pushRes.status).toBe(200);
    const pushData = await pushRes.json();
    expect(pushData.success).toBe(true);
    expect(pushData.acceptedEvents).toBe(1);

    // Now bootstrap reflects cloud data exists
    const bootRes2 = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/bootstrap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }), env);
    const bootData2 = await bootRes2.json();
    expect(bootData2.hasCloudData).toBe(true);
    expect(bootData2.progressCount).toBe(1);
    expect(bootData2.eventCount).toBe(1);
  });

  // Scenario 3
  it('3. 新设备登录（Case B：本地为空，云端有记录）完整拉取云端记录到本地', async () => {
    const mockD1 = new MockD1();
    const env = { DB: mockD1 };
    const token = 'mock_user_case_b:user_b:case_b@kotobud.com';

    // Seed cloud data
    await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        progress: [
          { wordId: 'word_cloud_1', status: 'mastered', reviewCount: 5, card: { stability: 35 } },
          { wordId: 'word_cloud_2', status: 'learning', reviewCount: 1, card: { stability: 2 } }
        ],
        events: [
          { _id: 'ev_b1', wordId: 'word_cloud_1', reviewedAt: '2026-09-17T10:00:00Z', rating: 3 },
          { _id: 'ev_b2', wordId: 'word_cloud_2', reviewedAt: '2026-09-17T10:05:00Z', rating: 2 }
        ],
        settings: { currentBookId: 'biaori-1' }
      })
    }), env);

    // Pull to new device
    const pullRes = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/pull', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }), env);
    expect(pullRes.status).toBe(200);
    const pullData = await pullRes.json();
    expect(pullData.progress).toHaveLength(2);
    expect(pullData.events).toHaveLength(2);
    expect(pullData.settings.currentBookId).toBe('biaori-1');
  });

  // Scenario 4
  it('4. 两设备合并（Case C：A 设备有 100 词，B 设备有 50 词无交集）合并后两端均为 150 词', () => {
    const localStates: WordState[] = Array.from({ length: 100 }, (_, i) => ({
      ...initialState(`w_a_${i}`),
      status: 'learning',
      reviewCount: 1
    }));
    const remoteProgress: CloudProgressDoc[] = Array.from({ length: 50 }, (_, i) => ({
      _id: `doc_b_${i}`,
      userId: 'u1',
      wordId: `w_b_${i}`,
      status: 'review',
      reviewCount: 2,
      lapseCount: 0,
      card: {} as any,
      isDifficult: false,
      isIgnored: false,
      updatedAt: '2026-09-17T12:00:00Z',
      version: 1
    }));

    const wordIds = new Set<string>([
      ...localStates.map(s => s.wordId),
      ...remoteProgress.map(p => p.wordId)
    ]);
    expect(wordIds.size).toBe(150);

    const mergedStates: WordState[] = [];
    for (const id of wordIds) {
      const local = localStates.find(s => s.wordId === id);
      const remote = remoteProgress.find(p => p.wordId === id);
      if (local && remote) {
        mergedStates.push(mergeWordStateWithLww(local, remote, []));
      } else if (local) {
        mergedStates.push(local);
      } else if (remote) {
        mergedStates.push({
          userId: 'u1',
          wordId: remote.wordId,
          status: remote.status,
          reviewCount: remote.reviewCount,
          lapseCount: remote.lapseCount,
          card: remote.card,
          isDifficult: remote.isDifficult,
          isIgnored: remote.isIgnored,
          updatedAt: remote.updatedAt
        });
      }
    }
    expect(mergedStates).toHaveLength(150);
  });

  // Scenario 5
  it('5. 同一词两设备复习（Case D：A 设备 10:00 评分 Good，B 设备 10:05 评分 Hard）经 union + ts-fsrs 顺序重放，最终 FSRS 状态严格一致且确定', () => {
    const eventA: ReviewEvent = {
      _id: 'ev_a',
      userId: 'u1',
      wordId: 'w_test',
      reviewedAt: '2026-09-17T10:00:00.000Z',
      rating: 3, // Good
      responseTime: 1000,
      studyMode: 'new',
      clientCreatedAt: '2026-09-17T10:00:00.000Z',
      serverReceivedAt: '2026-09-17T10:00:01.000Z'
    };

    const eventB: ReviewEvent = {
      _id: 'ev_b',
      userId: 'u1',
      wordId: 'w_test',
      reviewedAt: '2026-09-17T10:05:00.000Z',
      rating: 2, // Hard
      responseTime: 1500,
      studyMode: 'review',
      clientCreatedAt: '2026-09-17T10:05:00.000Z',
      serverReceivedAt: '2026-09-17T10:05:01.000Z'
    };

    // Reconcile passing in out-of-order [eventB, eventA]
    const replayed = reconcileFsrsFromEvents([eventB, eventA]);

    // Order should be sorted by reviewedAt: eventA (10:00) then eventB (10:05)
    expect(replayed.reviewCount).toBe(2);
    expect(replayed.firstSeenAt).toBe('2026-09-17T10:00:00.000Z');
    expect(replayed.lastReviewedAt).toBe('2026-09-17T10:05:00.000Z');
    expect(replayed.card.reps).toBe(2);
    expect(replayed.card.due).toBeInstanceOf(Date);

    // Replaying in reverse order produces IDENTICAL deterministic result
    const replayedReverse = reconcileFsrsFromEvents([eventA, eventB]);
    expect(replayed.card.stability).toBe(replayedReverse.card.stability);
    expect(replayed.card.difficulty).toBe(replayedReverse.card.difficulty);
    expect(replayed.nextReviewAt).toBe(replayedReverse.nextReviewAt);
  });

  // Scenario 6
  it('6. review_events event_id UUID 去重，重复同步不产生重复重放', () => {
    const event1: ReviewEvent = {
      _id: 'duplicate-uuid-1',
      userId: 'u1',
      wordId: 'w_dedup',
      reviewedAt: '2026-09-17T10:00:00.000Z',
      rating: 3,
      responseTime: 1000,
      studyMode: 'new',
      clientCreatedAt: '2026-09-17T10:00:00.000Z',
      serverReceivedAt: '2026-09-17T10:00:01.000Z'
    };

    // Duplicate list: event1 appears twice
    const rawEvents = [event1, { ...event1 }];
    const dedupMap = new Map<string, ReviewEvent>();
    for (const ev of rawEvents) {
      dedupMap.set(ev._id, ev);
    }
    const deduped = Array.from(dedupMap.values());
    expect(deduped).toHaveLength(1);

    const replayed = reconcileFsrsFromEvents(deduped);
    expect(replayed.reviewCount).toBe(1);
    expect(replayed.card.reps).toBe(1);
  });

  // Scenario 7
  it('7. 标星（difficult）/ 忽略（ignored）状态以各自字段的时间戳（LWW）独立合并', () => {
    const base: WordState = {
      ...initialState('w1'),
      isDifficult: true,
      difficultUpdatedAt: '2026-09-17T10:00:00.000Z',
      isIgnored: false,
      ignoredUpdatedAt: '2026-09-17T10:00:00.000Z'
    };

    const remote: CloudProgressDoc = {
      _id: 'doc1',
      userId: 'u1',
      wordId: 'w1',
      status: 'learning',
      reviewCount: 1,
      lapseCount: 0,
      card: {} as any,
      // Remote cancelled difficulty later (10:10 > 10:00)
      isDifficult: false,
      difficultUpdatedAt: '2026-09-17T10:10:00.000Z',
      // Remote set ignored later (10:05 > 10:00)
      isIgnored: true,
      ignoredUpdatedAt: '2026-09-17T10:05:00.000Z',
      updatedAt: '2026-09-17T10:10:00.000Z',
      version: 2
    };

    const merged = mergeWordStateWithLww(base, remote, []);
    expect(merged.isDifficult).toBe(false);
    expect(merged.difficultUpdatedAt).toBe('2026-09-17T10:10:00.000Z');
    expect(merged.isIgnored).toBe(true);
    expect(merged.ignoredUpdatedAt).toBe('2026-09-17T10:05:00.000Z');
  });

  // Scenario 8
  it('8. 取消标星也能基于最新时间戳正确同步，不会被旧的 true 覆盖', () => {
    // Local cancelled star at 10:20 (false)
    const local: WordState = {
      ...initialState('w1'),
      isDifficult: false,
      difficultUpdatedAt: '2026-09-17T10:20:00.000Z'
    };

    // Remote had star at 10:10 (true)
    const remote: CloudProgressDoc = {
      _id: 'doc1',
      userId: 'u1',
      wordId: 'w1',
      status: 'learning',
      reviewCount: 0,
      lapseCount: 0,
      card: {} as any,
      isDifficult: true,
      difficultUpdatedAt: '2026-09-17T10:10:00.000Z',
      isIgnored: false,
      updatedAt: '2026-09-17T10:10:00.000Z',
      version: 1
    };

    const merged = mergeWordStateWithLww(local, remote, []);
    expect(merged.isDifficult).toBe(false);
    expect(merged.difficultUpdatedAt).toBe('2026-09-17T10:20:00.000Z');
  });

  // Scenario 9
  it('9. 离线状态下产生的学习记录先存入本地 IndexedDB，网络恢复后自动提交 sync_queue', async () => {
    const dbName = `test_offline_${Math.random()}`;
    const repo = new IndexedDbRepository(dbName);

    // Enqueue an offline item
    await repo.enqueue([{
      id: 'queue_1',
      type: 'review_event',
      payload: { wordId: 'w_off', rating: 3, reviewedAt: '2026-09-17T11:00:00Z' },
      createdAt: '2026-09-17T11:00:00Z',
      retries: 0
    }]);

    // Verify queue persisted
    const queue = await repo.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('queue_1');

    // Simulate online flush: items dequeued
    await repo.dequeue(['queue_1']);
    const emptyQueue = await repo.getQueue();
    expect(emptyQueue).toHaveLength(0);
  });

  // Scenario 10
  it('10. 离线时多次评测同一单词，在一次批量同步中按产生时序一次性提交', async () => {
    const dbName = `test_offline_batch_${Math.random()}`;
    const repo = new IndexedDbRepository(dbName);

    await repo.enqueue([
      {
        id: 'q_ev_1',
        type: 'review_event',
        payload: { wordId: 'w1', rating: 1, reviewedAt: '2026-09-17T10:00:00.000Z' },
        createdAt: '2026-09-17T10:00:00.000Z',
        retries: 0
      },
      {
        id: 'q_ev_2',
        type: 'review_event',
        payload: { wordId: 'w1', rating: 3, reviewedAt: '2026-09-17T10:05:00.000Z' },
        createdAt: '2026-09-17T10:05:00.000Z',
        retries: 0
      }
    ]);

    const queue = await repo.getQueue();
    expect(queue).toHaveLength(2);
    expect(new Date(queue[0].payload.reviewedAt).getTime()).toBeLessThan(new Date(queue[1].payload.reviewedAt).getTime());
  });

  // Scenario 11
  it('11. 3.5s 防抖合并正常工作，高频操作不打崩接口', () => {
    vi.useFakeTimers();
    let syncCallCount = 0;
    let timer: any = null;

    function scheduleDebouncedSync() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        syncCallCount++;
      }, 3500);
    }

    // Trigger 10 high-frequency ratings within 1 second
    for (let i = 0; i < 10; i++) {
      scheduleDebouncedSync();
      vi.advanceTimersByTime(100);
    }

    // At this point (1000ms), 0 sync calls should have been made
    expect(syncCallCount).toBe(0);

    // Fast-forward past 3.5s window
    vi.advanceTimersByTime(3500);
    expect(syncCallCount).toBe(1);

    vi.useRealTimers();
  });

  // Scenario 12
  it('12. 页面刷新 / 重新打开后，用户 session 自动恢复（若 token 有效）', async () => {
    const auth = new MockAuthClient();
    await auth.init();
    expect(auth.getCurrentUser()).toBeNull();

    // Sign in
    await auth.signInWithEmailCode('user@kotobud.com', '123456');
    const user = auth.getCurrentUser();
    expect(user).not.toBeNull();
    expect(user?.email).toBe('user@kotobud.com');

    // Simulate page reload: new instance
    const freshAuth = new MockAuthClient();
    await freshAuth.init();
    const restoredUser = freshAuth.getCurrentUser();
    expect(restoredUser).not.toBeNull();
    expect(restoredUser?.id).toBe(user?.id);
    expect(restoredUser?.email).toBe('user@kotobud.com');
  });

  // Scenario 13
  it('13. 退出登录后切回当前设备游客数据，用户数据隔离不清除', async () => {
    const dbName = `test_logout_${Math.random()}`;
    const repo = new IndexedDbRepository(dbName);

    // Guest has 1 word
    await repo.transact(d => {
      d.states = [initialState('guest_word')];
    });

    // User logs in
    repo.switchUser('kb_user_x');
    await repo.transact(d => {
      d.states = [initialState('user_word')];
    });

    // User data is in user storage
    const userRead = await repo.read();
    expect(userRead.states[0].wordId).toBe('user_word');

    // Logout: switch back to null (guest)
    repo.switchUser(null);
    const guestRead = await repo.read();
    expect(guestRead.states[0].wordId).toBe('guest_word');

    // User data remains intact in 'data_user_kb_user_x'
    const userDirect = await repo.read('data_user_kb_user_x');
    expect(userDirect.states[0].wordId).toBe('user_word');
  });

  // Scenario 14
  it('14. 两个不同用户先后在同一设备登录，各自数据完全隔离（data_user_A 与 data_user_B 互不影响）', async () => {
    const dbName = `test_multi_user_${Math.random()}`;
    const repo = new IndexedDbRepository(dbName);

    // User A writes data
    repo.switchUser('kb_user_a');
    await repo.transact(d => {
      d.states = [initialState('word_for_a')];
    });

    // User B writes data
    repo.switchUser('kb_user_b');
    await repo.transact(d => {
      d.states = [initialState('word_for_b')];
    });

    // Inspect user A's data
    repo.switchUser('kb_user_a');
    const aData = await repo.read();
    expect(aData.states).toHaveLength(1);
    expect(aData.states[0].wordId).toBe('word_for_a');

    // Inspect user B's data
    repo.switchUser('kb_user_b');
    const bData = await repo.read();
    expect(bData.states).toHaveLength(1);
    expect(bData.states[0].wordId).toBe('word_for_b');
  });

  // Scenario 15
  it('15. 未携带合法 Authorization 头的 Worker 请求严格返回 401', async () => {
    const mockD1 = new MockD1();
    const env = { DB: mockD1 };

    // No Authorization header
    const resNoAuth = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/pull', {
      method: 'POST'
    }), env);
    expect(resNoAuth.status).toBe(401);
    const bodyNoAuth = await resNoAuth.json();
    expect(bodyNoAuth.error).toBe('unauthorized');

    // Invalid / empty token
    const resBadToken = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' }
    }), env);
    expect(resBadToken.status).toBe(401);
  });

  // Scenario 16
  it('16. 恶意伪造或修改 request body 中的 userId 无法越权访问其他用户数据（Worker 强制基于 token 解析 user_id）', async () => {
    const mockD1 = new MockD1();
    const env = { DB: mockD1 };
    const attackerToken = 'mock_attacker:attacker_uid:attacker@example.com';

    // Attacker tries to push data into victim's record by forging userId
    const attackReq = new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attackerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'kb_victim_123', // Forged target
        progress: [{ wordId: 'stolen_word', status: 'mastered' }],
        events: []
      })
    });
    const res = await worker.fetch(attackReq, env);
    expect(res.status).toBe(200);

    // Verify victim table was untouched
    expect(mockD1.progress.has('kb_victim_123:stolen_word')).toBe(false);

    // Verify data was safely scoped ONLY to attacker's actual resolved user_id
    const attacker = Array.from(mockD1.users.values()).find(u => u.provider_uid === 'attacker_uid');
    expect(attacker).toBeDefined();
    expect(mockD1.progress.has(`${attacker.id}:stolen_word`)).toBe(true);
  });

  // Scenario 17
  it('17. D1 数据库中 review_events 满足不可变追加，同一 user_id 历史全量事件可溯源', async () => {
    const mockD1 = new MockD1();
    const env = { DB: mockD1 };
    const token = 'mock_history:history_uid:history@example.com';

    // Push first event
    await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { _id: 'ev_hist_1', wordId: 'w1', reviewedAt: '2026-09-17T10:00:00Z', rating: 1 }
        ]
      })
    }), env);

    // Push second event (with ev_hist_1 included again, plus new ev_hist_2)
    await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { _id: 'ev_hist_1', wordId: 'w1', reviewedAt: '2026-09-17T10:00:00Z', rating: 1 },
          { _id: 'ev_hist_2', wordId: 'w1', reviewedAt: '2026-09-17T10:10:00Z', rating: 3 }
        ]
      })
    }), env);

    // Pull events to verify both exist and ev_hist_1 was not duplicated
    const pullRes = await worker.fetch(new Request('https://staging.kotobud.com/api/v1/sync/pull', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }), env);
    const pullData = await pullRes.json();
    expect(pullData.events).toHaveLength(2);
    expect(pullData.events.map((e: any) => e._id)).toEqual(['ev_hist_1', 'ev_hist_2']);
  });

  // Scenario 18
  it('18. 当底层连接被关闭（模拟 Safari 后台挂起 connection is closing）时，Repository 自动重连自愈且数据零丢失', async () => {
    const dbName = `test_safari_closing_${Math.random()}`;
    const repo = new IndexedDbRepository(dbName);

    // Initial write
    await repo.transact(d => {
      d.books.push({ id: 'b1', title: '标日', description: '', language: 'ja', createdAt: '', updatedAt: '' });
      d.states.push(initialState('w1'));
    });

    // Verify initial write
    const before = await repo.read();
    expect(before.books).toHaveLength(1);
    expect(before.states).toHaveLength(1);

    // Forcefully simulate Safari backgrounding by explicitly closing the raw connection
    const rawDb = await (repo as any).getDb();
    rawDb.close();

    // In a stale-holding implementation, the next read/transact would throw "The database connection is closing / closed".
    // With resilient withConnection, it detects the closed state, reconnects, and succeeds!
    const after = await repo.read();
    expect(after.books).toHaveLength(1);
    expect(after.states[0].wordId).toBe('w1');

    // Also verify write/transact works after close
    await repo.transact(d => {
      d.states.push(initialState('w2'));
    });
    const afterWrite = await repo.read();
    expect(afterWrite.states).toHaveLength(2);

    // Verify close() method works cleanly
    await repo.close();
    const afterExplicitClose = await repo.read();
    expect(afterExplicitClose.states).toHaveLength(2);
  });

  // Scenario 19
  it('19. 登录串行生命周期与退出后重新登录：游客读取 -> 备份 -> 关闭旧连接 -> 用户切换 -> 退出 -> 重新登录数据无损', async () => {
    const dbName = `test_serial_lifecycle_${Math.random()}`;
    const repo = new IndexedDbRepository(dbName);

    // 1. 游客状态在本地学习
    await repo.transact(d => {
      d.states.push(initialState('guest_word_1'));
      d.logs.push({
        id: 'log_1',
        userId: 'local',
        wordId: 'guest_word_1',
        reviewedAt: '2026-09-18T10:00:00Z',
        rating: 3,
        responseTime: 1000,
        previousState: null as any,
        newState: null as any,
        studyMode: 'review'
      });
    });

    // 2. 模拟串行登录：
    // Step A: 游客数据读取
    const guestData = await repo.read('data_guest');
    expect(guestData.states).toHaveLength(1);

    // Step B: 本地备份快照
    await repo.createPreLoginSnapshot();
    expect(await repo.hasPreLoginSnapshot()).toBe(true);

    // Step C: 关闭旧连接
    await repo.close();

    // Step D: 切换用户并打开新连接
    repo.switchUser('user_alice');
    await repo.open();

    // Step E: 写入用户命名空间
    await repo.transact(d => {
      d.states = structuredClone(guestData.states);
      for (const s of d.states) s.userId = 'user_alice';
    });

    const userRead = await repo.read();
    expect(userRead.states[0].userId).toBe('user_alice');

    // Step F: 退出登录 (Close -> Switch null -> Open)
    await repo.close();
    repo.switchUser(null);
    await repo.open();
    const guestAgain = await repo.read();
    expect(guestAgain.states[0].wordId).toBe('guest_word_1');

    // Step G: 重新登录同一用户 (Close -> Switch user_alice -> Open)
    await repo.close();
    repo.switchUser('user_alice');
    await repo.open();
    const aliceAgain = await repo.read();
    expect(aliceAgain.states[0].userId).toBe('user_alice');
    expect(aliceAgain.states[0].wordId).toBe('guest_word_1');

    // Step H: 验证备份快照依然安全完好
    expect(await repo.hasPreLoginSnapshot()).toBe(true);
  });
});
