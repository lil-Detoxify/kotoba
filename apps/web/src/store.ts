import {defineStore} from 'pinia';
import {ref,computed,watch} from 'vue';
import {emptyData,type Data,type StudyMode,type ExerciseType,type Word,type ReadingContext,type QuizAttempt,type ReviewLog,type WordState,type CloudProgressDoc,type ReviewEvent,type SyncBootstrapResult} from '@jp/models';
import {IndexedDbRepository,deleteBook} from '@jp/storage';
import {createStudyQueue,evaluate,initialState,stateFor,statistics,mergeWordStateWithLww,reconcileFsrsFromEvents} from '@jp/core';
import {importBook,type ImportRow} from '@jp/importers';
import {type AuthUser,type AuthClient,type SyncClient,type SyncPullResult,CloudBaseAuthClient,MockAuthClient,WorkerSyncClient} from '@jp/sync';
import type {Grade} from 'ts-fsrs';
import seed from './seed.json';
import textbookMetaPayload from './textbooks-metadata.json';
import {beginWechatAttempt, redeemWechatAttempt, type WechatAttempt} from './services/wechatAuth';
import { fullBookTitle } from './services/book-presentation';
import { SYSTEM_CATALOG_VERSION, validateWebTextbookDefinition, webTextbookWordId } from './services/textbook-catalog';
import { readStudySession, writeStudySession, clearStudySession, type StudySession, type WebExerciseType } from './services/study-session';
import { dailyStudyPlan } from './services/daily-study-plan';
import { useStudyPlanPreference } from './services/study-plan-preference';
import { useStudyExercisePreference } from './services/study-exercise-preference';
import { loadBookLearningExamples } from './services/book-learning-examples';
import { correctLoadedTextbookWords } from './services/textbook-corrections';
import {cleanPersonalWord,personalWordKey,type PersonalWordDraft} from './services/personal-vocabulary';
import {cleanReadingContext,upsertReadingContext,wordReadingContexts,type ReadingContextDraft} from './services/reading-context';
import {sceneFor,resolveSceneWords,sceneExampleFor} from './services/learning-scenes';
import {contextClozeExample,personalClozeExampleFor} from './services/personal-learning-example';
import {createPersonalLibrary,getPersonalLibrarySummary,validatePersonalLibrary,previewPersonalLibraryMerge,mergePersonalLibrary,type PersonalLibrary,type ExistingContentPolicy,type PersonalLibraryMergeResult} from './services/personal-library';
import {collectDictionaryWord} from './services/dictionary-personal-word';
import type {DictionaryWordDraft} from './services/dictionary-search';
import {fetchPersonalLibraryBackup as fetchCloudLibraryBackup,savePersonalLibraryBackup as saveCloudLibraryBackup,type CloudBackup} from './services/personal-library-cloud';

export interface TextbookMetaBook {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  lessons: Array<{ id: string; bookId: string; title: string; order: number; wordCount: number }>;
}

export const metaBooks = (textbookMetaPayload as { books: TextbookMetaBook[] }).books.map(book => ({ ...book, title: fullBookTitle(book) }));
const repository = new IndexedDbRepository();
const loadingBooks = new Map<string, Promise<boolean>>();

export const TEXTBOOKS_DATA_VERSION = '20260917-v2';

export function ensureSystemTextbooks(d: Data) {
  const createTime = new Date().toISOString();
  for (const b of metaBooks) {
    let existingBook = d.books.find(book => book.id === b.id);
    if (!existingBook) {
      existingBook = {
        id: b.id,
        title: b.title,
        description: b.description,
        language: 'ja',
        createdAt: createTime,
        updatedAt: createTime
      };
      d.books.push(existingBook);
    } else {
      existingBook.title = b.title;
      existingBook.description = b.description;
    }

    for (const l of b.lessons) {
      const existingLesson = d.lessons.find(lesson => lesson.id === l.id);
      if (!existingLesson) {
        d.lessons.push({
          id: l.id,
          bookId: b.id,
          title: l.title,
          order: l.order
        });
      } else {
        existingLesson.title = l.title;
        existingLesson.order = l.order;
      }
    }
  }

  if (!d.currentBookId && metaBooks.length > 0) {
    d.currentBookId = metaBooks[0].id;
    d.currentBookIdSource = 'default';
  }
}

export function copyGuestCustomData(target: Data, guest: Data) {
  const guestCustomBooks = guest.books.filter(b => !metaBooks.some(m => m.id === b.id));
  for (const cb of guestCustomBooks) {
    if (!target.books.some(b => b.id === cb.id)) {
      target.books.push(structuredClone(cb));
    }
  }

  const guestCustomLessons = guest.lessons.filter(l => guestCustomBooks.some(b => b.id === l.bookId));
  for (const cl of guestCustomLessons) {
    if (!target.lessons.some(l => l.id === cl.id)) {
      target.lessons.push(structuredClone(cl));
    }
  }

  const guestCustomWords = guest.words.filter(w => guestCustomLessons.some(l => l.id === w.lessonId));
  for (const cw of guestCustomWords) {
    if (!target.words.some(w => w.id === cw.id)) {
      target.words.push(structuredClone(cw));
    }
  }

  if (guest.currentBookId && !target.currentBookId) {
    target.currentBookId = guest.currentBookId;
    target.currentBookIdSource = guest.currentBookIdSource || 'user';
    target.currentBookIdUpdatedAt = guest.currentBookIdUpdatedAt;
  }
}

const isDesktop = typeof window !== 'undefined' && window.location.protocol === 'kotoba:';
const defaultApiBase = isDesktop ? (import.meta.env.VITE_API_BASE_URL || 'https://kotobud.com') : '';

const authClient: AuthClient = typeof window !== 'undefined' && (window as any).__MOCK_AUTH__
  ? new MockAuthClient()
  : new CloudBaseAuthClient(import.meta.env.VITE_CLOUDBASE_ENV_ID || 'kotobud-staging-d4femojn7def1c91', defaultApiBase);
const syncClient: SyncClient = new WorkerSyncClient(defaultApiBase, 30000, authClient, true);

export const useApp = defineStore('app', () => {
  const data = ref<Data>(emptyData());
  const wordsById = computed(() => {
    const words = new Map<string, Word>();
    for (const word of data.value.words) if (!words.has(word.id)) words.set(word.id, word);
    return words;
  });
  const dataOwnerKey = ref('data_guest');
  const ready = ref(false);
  const error = ref('');
  const busy = ref(false);
  const now = ref(new Date());
  const queue = ref<Word[]>([]);
  const index = ref(0);
  const mode = ref<StudyMode>('new');
  const sessionSize = ref(0);
  const stats = computed(() => statistics(data.value, now.value, currentUser.value?.id));

  // Auth & Sync Reactive State
  const currentUser = ref<AuthUser | null>(null);
  const studySession = ref<StudySession | null>(readStudySession('data_guest'));
  const sessionExercise = ref<WebExerciseType | undefined>();
  const studyPlanPreference = useStudyPlanPreference();
  const studyExercisePreference = useStudyExercisePreference();
  const sessionRoundEnd = computed(() => sessionSize.value);
  const sessionRoundComplete = computed(() => sessionSize.value > 0 && index.value >= sessionRoundEnd.value);
  const hasResumableSession = computed(() => queue.value.length > index.value || !!studySession.value && studySession.value.index < studySession.value.wordIds.length);
  let checkpointPaused = false;
  let sessionGeneration = 0;
  let continuing = false;
  function persistSession() {
    const saved = studySession.value;
    if (checkpointPaused || !saved || saved.owner !== accountKeyForUser(currentUser.value?.id ?? null) || saved.owner !== repository.getActiveKey()) return;
    const next = { ...saved, index: index.value, exercise: sessionExercise.value, updatedAt: new Date().toISOString() };
    studySession.value = next;
    writeStudySession(next);
  }
  watch([index, sessionExercise], persistSession, { flush: 'sync' });
  watch(() => currentUser.value?.id ?? null, id => {
    sessionGeneration++;
    checkpointPaused = true;
    queue.value = []; index.value = 0; sessionSize.value = 0;
    studySession.value = readStudySession(accountKeyForUser(id));
    sessionExercise.value = studySession.value?.exercise;
    checkpointPaused = false;
  }, { flush: 'sync' });
  function setSessionExercise(value: WebExerciseType) {
    if (['card', 'mixed', 'kana-meaning', 'kanji-reading', 'audio-meaning', 'sentence-cloze', 'kana-input', 'dictation'].includes(value)) sessionExercise.value = value;
  }
  function beginSession(words: Word[], studyMode: StudyMode, lessons?: string[], cursor = 0, counts?: number[], exercise?: WebExerciseType, focusedPractice=false,sceneId?:string,readingContextIds?:Record<string,string>) {
    const owner = accountKeyForUser(currentUser.value?.id ?? null);
    const lessonBook = new Map(data.value.lessons.map(lesson => [lesson.id, lesson.bookId]));
    checkpointPaused = true;
    queue.value = words; index.value = cursor; mode.value = studyMode; sessionSize.value = words.length;
    const preferred=studyExercisePreference.exercise.value;
    sessionExercise.value = exercise ?? (preferred==='auto'?(studyMode === 'new' ? 'card' : 'mixed'):preferred);
    const queuedWordIds = new Set(words.map(word => word.id));
    const queuedContextIds = readingContextIds
      ? Object.fromEntries(Object.entries(readingContextIds).filter(([wordId]) => queuedWordIds.has(wordId)))
      : undefined;
    studySession.value = words.length ? {
      version: 1, owner, mode: studyMode,
      bookIds: [...new Set(words.map(word => lessonBook.get(word.lessonId)).filter((id): id is string => !!id))],
      lessonIds: lessons ? [...lessons] : undefined, wordIds: words.map(word => word.id),
      reviewCounts: counts ?? words.map(word => stateFor(data.value, word.id, currentUser.value?.id ?? 'local')?.reviewCount ?? 0),
      index: cursor, exercise: sessionExercise.value, updatedAt: new Date().toISOString(),
      focusedPractice: focusedPractice || undefined,
      sceneId,
      ...(queuedContextIds && Object.keys(queuedContextIds).length ? { readingContextIds: queuedContextIds } : {}),
    } : null;
    checkpointPaused = false;
    if (studySession.value) persistSession(); else clearStudySession(owner);
  }
  const syncStatus = ref<'synced' | 'syncing' | 'offline' | 'error'>('synced');
  const syncError = ref('');
  const lastSyncedAt = ref<string | null>(null);
  const isSyncReady = ref(false);
  const showLoginModal = ref(false);
  const showConflictModal = ref(false);
  let syncTimer: any = null;
  let reconciliationPromise: Promise<void> | null = null;

  let refreshingPromise: Promise<void> | null = null;
  let refreshingKey: string | null = null;
  async function refresh(): Promise<void> {
    const activeKey = repository.getActiveKey();
    const userId = currentUser.value?.id ?? null;
    if (refreshingPromise) {
      const pendingKey = refreshingKey;
      await refreshingPromise;
      if (pendingKey !== repository.getActiveKey()) return refresh();
      return;
    }
    refreshingKey = activeKey;
    refreshingPromise = (async () => {
      try {
        const fresh = await repository.read(activeKey);
        if (activeKey === repository.getActiveKey() && userId === (currentUser.value?.id ?? null)) {
          correctLoadedTextbookWords(fresh.words);
          data.value = fresh;
          dataOwnerKey.value = activeKey;
          now.value = new Date();
        }
      } catch (e) {
        if (activeKey === repository.getActiveKey() && userId === (currentUser.value?.id ?? null)) error.value = `无法读取本地数据：${String(e)}`;
      } finally {
        refreshingPromise = null;
        refreshingKey = null;
      }
    })();
    return refreshingPromise;
  }

  interface AccountMutationContext { expectedUserId: string | null; activeKey: string }
  function accountKeyForUser(userId: string | null): string {
    return userId ? `data_user_${userId.trim()}` : 'data_guest';
  }
  function isAccountContextCurrent(context: AccountMutationContext): boolean {
    const activeUserId = currentUser.value?.id ?? null;
    const authUser = authClient.getCurrentUser();
    return context.activeKey === accountKeyForUser(context.expectedUserId) &&
      repository.getActiveKey() === context.activeKey && activeUserId === context.expectedUserId &&
      (!authUser || authUser.id === context.expectedUserId);
  }

  async function mutate(
    change: (d: Data) => void,
    accountContext?: AccountMutationContext,
    onCommitted?: (data: Data) => Promise<void> | void,
  ) {
    if (busy.value) return false;
    if (accountContext && !isAccountContextCurrent(accountContext)) {
      return false;
    }
    busy.value = true;
    error.value = '';
    let transactionCommitted = false;
    try {
      const result = await repository.transact(d => {
        if (accountContext && !isAccountContextCurrent(accountContext)) {
          throw new Error('账号已切换，此次操作没有写入。');
        }
        change(d);
      }, accountContext?.activeKey);
      transactionCommitted = true;
      if (onCommitted) await onCommitted(result);
      if (accountContext && !isAccountContextCurrent(accountContext)) return false;
      correctLoadedTextbookWords(result.words);
      data.value = result;
      dataOwnerKey.value = accountContext?.activeKey ?? repository.getActiveKey();
      now.value = new Date();
      return true;
    } catch (e) {
      if (transactionCommitted) {
        const message = `本地数据已保存，但同步队列写入失败：${e instanceof Error ? e.message : String(e)}`;
        if (!accountContext || isAccountContextCurrent(accountContext)) error.value = message;
        throw new Error(message);
      }
      if (!accountContext || isAccountContextCurrent(accountContext)) {
        error.value = `保存失败，操作未完成：${e instanceof Error ? e.message : String(e)}`;
      }
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function reconcileWithCloud(user: AuthUser, explicitToken?: string): Promise<void> {
    if (reconciliationPromise) return reconciliationPromise;
    reconciliationPromise = (async () => {
      try {
        const token = explicitToken || await authClient.getAccessToken();
        if (!token) return;

        syncStatus.value = 'syncing';
        syncError.value = '';

        let pullRes: SyncPullResult;
        try {
          pullRes = await syncClient.pull(token);
        } catch (pullErr) {
          console.warn('Initial cloud pull failed, running offline with local cache:', pullErr);
          syncStatus.value = 'offline';
          syncError.value = '云端连接失败，已保留本地学习记录。';
          isSyncReady.value = false;
          return;
        }

        // Validate cloud payload
        if (!pullRes || typeof pullRes !== 'object' || !Array.isArray(pullRes.progress) || !Array.isArray(pullRes.events)) {
          throw new Error('Invalid cloud sync payload received from server');
        }
        if (pullRes.userId && pullRes.userId !== user.id) {
          throw new Error(`Cloud user mismatch: expected ${user.id}, got ${pullRes.userId}`);
        }

        // 1. Read current local data for the user and local queue
        const localData = await repository.read();
        const localQueue = await repository.getQueue();

        // 2. Deterministic Merge:
        // A) Combine all review events: localData.logs, localQueue events, and pullRes.events
        const eventMap = new Map<string, ReviewEvent | ReviewLog>();
        for (const l of localData.logs) {
          eventMap.set(l.id, l);
        }
        for (const q of localQueue) {
          if (q.type === 'review_event' && q.payload) {
            const evId = q.payload._id || q.payload.id;
            if (evId) eventMap.set(evId, q.payload);
          }
        }
        for (const e of pullRes.events) {
          eventMap.set(e._id, e);
        }
        const allEvents = Array.from(eventMap.values()).sort(
          (a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime()
        );

        // B) Combine states and progress:
        const allWordIds = new Set<string>([
          ...localData.states.map(s => s.wordId),
          ...pullRes.progress.map((p: CloudProgressDoc) => p.wordId),
          ...localQueue.filter(q => q.type === 'progress').map(q => q.payload?.wordId).filter(Boolean)
        ]);

        const mergedStates: WordState[] = [];
        for (const wId of allWordIds) {
          const localS = localData.states.find(s => s.wordId === wId);
          const remoteP = pullRes.progress.find((p: CloudProgressDoc) => p.wordId === wId);
          const wordEvents = allEvents.filter(e => e.wordId === wId);

          if (localS && remoteP) {
            mergedStates.push(mergeWordStateWithLww(localS, remoteP, wordEvents));
          } else if (localS) {
            mergedStates.push(wordEvents.length > 0 ? reconcileFsrsFromEvents(wordEvents, localS) : localS);
          } else if (remoteP) {
            mergedStates.push({
              userId: user.id,
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
              isDifficult: remoteP.isDifficult,
              difficultUpdatedAt: remoteP.difficultUpdatedAt,
              isIgnored: remoteP.isIgnored,
              ignoredUpdatedAt: remoteP.ignoredUpdatedAt,
              updatedAt: remoteP.updatedAt
            });
          }
        }

        // C) Settings reconciliation & smart active book healing:
        let resolvedBookId = localData.currentBookId;
        let resolvedBookIdSource = localData.currentBookIdSource;
        let resolvedBookIdUpdatedAt = localData.currentBookIdUpdatedAt;

        if (pullRes.settings?.currentBookId) {
          const remoteBookId = pullRes.settings.currentBookId;
          const remoteUpdatedAt = pullRes.settings.updatedAt;

          if (localData.currentBookIdSource !== 'user') {
            resolvedBookId = remoteBookId;
            resolvedBookIdSource = 'user';
            resolvedBookIdUpdatedAt = remoteUpdatedAt;
          } else if (localData.currentBookIdUpdatedAt && remoteUpdatedAt) {
            if (new Date(remoteUpdatedAt).getTime() > new Date(localData.currentBookIdUpdatedAt).getTime()) {
              resolvedBookId = remoteBookId;
              resolvedBookIdSource = 'user';
              resolvedBookIdUpdatedAt = remoteUpdatedAt;
            }
          }
        } else if (!resolvedBookId && metaBooks[0]) {
          resolvedBookId = metaBooks[0].id;
          resolvedBookIdSource = 'default';
        }

        // Recover a default selection from progress, while respecting an explicit
        // choice of a new book whose learning progress is still zero.
        const bookLearnedCounts = new Map<string, number>();
        for (const s of mergedStates) {
          if (s.status !== 'new' && (s.firstSeenAt || s.reviewCount > 0)) {
            let bId = s.bookId;
            if (!bId) {
              for (const mb of metaBooks) {
                if (s.wordId.startsWith(`${mb.id}-w-`)) {
                  bId = mb.id;
                  break;
                }
              }
            }
            if (bId) {
              bookLearnedCounts.set(bId, (bookLearnedCounts.get(bId) || 0) + 1);
            }
          }
        }

        if (bookLearnedCounts.size > 0 && resolvedBookIdSource !== 'user'
          && (!resolvedBookId || (bookLearnedCounts.get(resolvedBookId) || 0) === 0)) {
          let bestBookId: string | null = null;
          let latestEventTime = 0;
          for (const ev of allEvents) {
            const t = new Date(ev.reviewedAt).getTime();
            if (t > latestEventTime) {
              for (const mb of metaBooks) {
                if (ev.wordId.startsWith(`${mb.id}-w-`)) {
                  bestBookId = mb.id;
                  latestEventTime = t;
                  break;
                }
              }
            }
          }
          if (!bestBookId) {
            let maxCount = 0;
            for (const [bId, count] of bookLearnedCounts.entries()) {
              if (count > maxCount) {
                maxCount = count;
                bestBookId = bId;
              }
            }
          }
          if (bestBookId) {
            resolvedBookId = bestBookId;
            resolvedBookIdSource = 'user';
            resolvedBookIdUpdatedAt = new Date().toISOString();
          }
        }

        if (pullRes.settings?.preferences?.pronunciationVoice) {
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('jp-vocab.pronunciation-voice', pullRes.settings.preferences.pronunciationVoice);
            }
          } catch {}
        }

        // 3. Atomically persist merged data to local IndexedDB
        await repository.transact(d => {
          ensureSystemTextbooks(d);
          d.states = mergedStates;
          d.logs = allEvents.map(e => ({
            id: (e as any)._id || (e as any).id,
            userId: user.id,
            wordId: e.wordId,
            reviewedAt: e.reviewedAt,
            rating: e.rating,
            responseTime: e.responseTime,
            previousState: (e as any).previousState,
            newState: (e as any).newState,
            studyMode: e.studyMode,
            quiz: e.quiz,
            clientCreatedAt: (e as any).clientCreatedAt || e.reviewedAt,
            serverReceivedAt: (e as any).serverReceivedAt || new Date().toISOString()
          }));
          d.currentBookId = resolvedBookId;
          d.currentBookIdSource = resolvedBookIdSource;
          d.currentBookIdUpdatedAt = resolvedBookIdUpdatedAt;
        });

        // 4. Ensure the active textbook is loaded into data.words
        if (resolvedBookId) {
          await ensureBookLoaded(resolvedBookId);
        }

        // 5. Also progressively load other books that have progress
        const learnedBookIds = new Set<string>();
        for (const s of mergedStates) {
          if (s.bookId) learnedBookIds.add(s.bookId);
          else {
            for (const mb of metaBooks) {
              if (s.wordId.startsWith(`${mb.id}-w-`)) {
                learnedBookIds.add(mb.id);
                break;
              }
            }
          }
        }
        for (const bId of learnedBookIds) {
          if (bId !== resolvedBookId) {
            ensureBookLoaded(bId).catch(() => {});
          }
        }

        await refresh();
        isSyncReady.value = true;
        syncStatus.value = 'synced';
        lastSyncedAt.value = new Date().toISOString();

        // 6. If local had queue items that were newly generated locally, flush them now
        if (localQueue.length > 0) {
          await flushSyncQueue();
        }
      } catch (err) {
        console.error('Cloud reconciliation failed:', err);
        syncStatus.value = 'error';
        syncError.value = String(err);
      } finally {
        reconciliationPromise = null;
      }
    })();
    return reconciliationPromise;
  }

  let userSwitchingLock = false;

  async function init() {
    // 1. Fast local hydrate from cached session or guest
    let cachedUser: AuthUser | null = null;
    if (typeof window !== 'undefined') {
      try {
        const savedUser = localStorage.getItem('jp-vocab.auth-user');
        if (savedUser) cachedUser = JSON.parse(savedUser);
      } catch {}
    }
    if (cachedUser) {
      currentUser.value = cachedUser;
      repository.switchUser(cachedUser.id);
    }

    // 2. Read local data for current namespace (guest or cached user)
    await refresh();

    // 3. Ensure system textbooks and initial guest seed on active namespace
    await mutate(d => {
      const existing = d.books.length > 0 || d.seeded;
      if (!d.seeded && !currentUser.value) {
        importBook(d, seed, '第一次见面 · 48 个常用词', () => crypto.randomUUID(), new Date(), '从初次见面到日常生活，48 个常用词。');
        d.seeded = true;
      }
      ensureSystemTextbooks(d);
      d.textbooksVersion = 'biaori-v2';
      if (!existing && metaBooks[0] && !d.currentBookId) {
        d.currentBookId = metaBooks[0].id;
        d.currentBookIdSource = 'default';
      }
    });

    // 4. Ensure current book words are loaded
    if (data.value.currentBookId) {
      await ensureBookLoaded(data.value.currentBookId);
    }

    // 5. Instantly mark UI as ready (< 100ms)!
    await restoreStudySession();
    ready.value = true;

    // 6. Network and visibility listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (currentUser.value && !isSyncReady.value) {
          reconcileWithCloud(currentUser.value);
        } else {
          syncStatus.value = 'syncing';
          flushSyncQueue();
        }
      });
      window.addEventListener('offline', () => {
        syncStatus.value = 'offline';
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && currentUser.value) {
          reconcileWithCloud(currentUser.value);
        } else if (document.visibilityState === 'hidden' && currentUser.value && isSyncReady.value) {
          flushSyncQueue();
        }
      });
    }

    // 7. Non-blocking background auth restore and cloud reconciliation
    (async () => {
      try {
        const authPromise = authClient.init();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 4000));
        await Promise.race([authPromise, timeoutPromise]).catch(err => console.warn('Auth init timeout/warning:', err));

        const user = authClient.getCurrentUser();
        if (user) {
          if (!currentUser.value || currentUser.value.id !== user.id) {
            if (!userSwitchingLock) {
              currentUser.value = user;
              repository.switchUser(user.id);
              await refresh();
            }
          }
          if (!userSwitchingLock) {
            await reconcileWithCloud(user);
          }
        }

        authClient.onAuthStateChange(async (u) => {
          if (userSwitchingLock) return;
          if (!u && currentUser.value) {
            await logout();
          } else if (u && (!currentUser.value || currentUser.value.id !== u.id)) {
            isSyncReady.value = false;
            syncStatus.value = 'syncing';
            currentUser.value = u;
            repository.switchUser(u.id);
            await refresh();
            await reconcileWithCloud(u);
          }
        });
      } catch (e) {
        console.warn('Background auth/sync failed:', e);
      }

      // Upgrade loaded textbook words in background if needed
      if (data.value.textbooksWordsVersion !== TEXTBOOKS_DATA_VERSION) {
        const loadedBookIds = metaBooks
          .filter(b => data.value.words.some(w => w.lessonId.startsWith(`${b.id}-l-`)))
          .map(b => b.id);
        for (const bId of loadedBookIds) {
          await ensureBookLoaded(bId, true);
        }
        await mutate(d => {
          d.textbooksWordsVersion = TEXTBOOKS_DATA_VERSION;
        });
      }
    })();
  }

  async function ensureBookLoaded(bookId: string, force = false, expectedUserId?: string | null): Promise<boolean> {
    const accountContext: AccountMutationContext | undefined = expectedUserId === undefined
      ? undefined
      : { expectedUserId, activeKey: repository.getActiveKey() };
    if (accountContext && !isAccountContextCurrent(accountContext)) return false;
    const hasWords = data.value.words.some(w => w.lessonId.startsWith(`${bookId}-l-`));
    if (hasWords && !force) {
      const needsUpdate = data.value.textbooksWordsVersion !== TEXTBOOKS_DATA_VERSION || data.value.words.some(w => w.lessonId.startsWith(`${bookId}-l-`) && !w.rawTerm && (w.term.startsWith('～') || w.term.startsWith('〜') || w.term.endsWith('～') || w.term.endsWith('〜')));
      if (!needsUpdate) {
        return true;
      }
    }
    if (!metaBooks.some(b => b.id === bookId)) {
      return true;
    }
    const loadKey = `${accountContext?.activeKey ?? repository.getActiveKey()}:${bookId}`;
    const pending = loadingBooks.get(loadKey);
    if (pending) {
      const loaded = await pending;
      return loaded && (!accountContext || isAccountContextCurrent(accountContext));
    }
    const loading = (async () => {
    try {
      const meta = metaBooks.find(book => book.id === bookId)!;
      const res = await fetch(`/data/books/${bookId}.json?v=${SYSTEM_CATALOG_VERSION}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bookDef = validateWebTextbookDefinition(await res.json(), meta);
      // A background catalog update may still be committing when a scene opens.
      while (busy.value) await new Promise<void>(resolve => {
        const stop = watch(busy, active => { if (!active) { stop(); resolve(); } }, { flush: 'sync' });
      });
      if (accountContext && !isAccountContextCurrent(accountContext)) return false;
      const loaded = await mutate(d => {
        const existingMap = new Map<string, Word>(d.words.map(w => [w.id, w]));
        for (const lesson of bookDef.lessons) {
          const lessonId = `${bookDef.id}-l-${lesson.order}`;
          for (const [idx, row] of lesson.words.entries()) {
            const wordId = webTextbookWordId(bookDef.id, lesson.order, row, idx);
            const existing = existingMap.get(wordId);
            if (existing) {
              existing.term = row.term;
              existing.reading = row.reading;
              existing.meaning = row.meaning;
              existing.partOfSpeech = row.partOfSpeech;
              existing.rawTerm = row.rawTerm;
            } else {
              const newWord: Word = {
                id: wordId,
                lessonId,
                term: row.term,
                reading: row.reading,
                meaning: row.meaning,
                partOfSpeech: row.partOfSpeech,
                rawTerm: row.rawTerm,
                order: d.words.length + 1
              };
              d.words.push(newWord);
              existingMap.set(wordId, newWord);
            }
          }
        }
      }, accountContext);
      return loaded && (!accountContext || isAccountContextCurrent(accountContext));
    } catch (err) {
      console.error(`Failed to load textbook ${bookId}:`, err);
      return false;
    } finally {
      loadingBooks.delete(loadKey);
    }
    })();
    loadingBooks.set(loadKey, loading);
    return loading;
  }

  async function addBook(rows: ImportRow[], title: string, description = '') {
    let id = '';
    const ok = await mutate(d => {
      id = importBook(d, rows, title, () => crypto.randomUUID(), new Date(), description);
    });
    return ok ? id : undefined;
  }

  const personalLibrarySummary = computed(() => getPersonalLibrarySummary(
    dataOwnerKey.value === accountKeyForUser(currentUser.value?.id ?? null) ? data.value : emptyData(),
    metaBooks.map(book => book.id),
  ));

  function exportPersonalLibrary(): { fileName: string; text: string } {
    if (dataOwnerKey.value !== accountKeyForUser(currentUser.value?.id ?? null)) {
      throw new Error('账号内容正在载入，请稍后再导出。');
    }
    const library = createPersonalLibrary(data.value, metaBooks.map(book => book.id));
    if (!library.books.length && !library.builtinContexts.length) throw new Error('还没有可导出的个人词书或收藏原句。');
    return { fileName: `KotoBud-个人词库-${library.exportedAt.slice(0, 10)}.json`, text: JSON.stringify(library, null, 2) };
  }

  async function importPersonalLibrary(
    value: PersonalLibrary, policy: ExistingContentPolicy = 'keep-local', expectedUserId?: string | null,
  ): Promise<PersonalLibraryMergeResult | undefined> {
    const userId = expectedUserId === undefined ? currentUser.value?.id ?? null : expectedUserId;
    const context: AccountMutationContext = { expectedUserId: userId, activeKey: repository.getActiveKey() };
    if (busy.value || !isAccountContextCurrent(context)) return undefined;
    const library = validatePersonalLibrary(value);
    const builtinIds = metaBooks.map(book => book.id);
    previewPersonalLibraryMerge(data.value, library, builtinIds);
    // Load only books needed to attach saved sentences to their original vocabulary IDs.
    for (const bookId of new Set(library.builtinContexts.map(entry => entry.bookId))) {
      const missing = library.builtinContexts.some(entry => entry.bookId === bookId && !data.value.words.some(word => word.id === entry.wordId));
      if (missing && !await ensureBookLoaded(bookId, false, userId)) {
        if (isAccountContextCurrent(context)) throw new Error('原句对应的词书暂未载入，请稍后重新合并。');
        return undefined;
      }
      if (!isAccountContextCurrent(context)) return undefined;
    }
    let result: PersonalLibraryMergeResult | undefined;
    const ok = await mutate(d => { result = mergePersonalLibrary(d, library, builtinIds, policy); }, context);
    return ok && isAccountContextCurrent(context) ? result : undefined;
  }

  function preparePersonalLibraryBackup(): PersonalLibrary {
    const id = currentUser.value?.id ?? null;
    if (!id) throw new Error('请先登录后使用账号备份。');
    if (dataOwnerKey.value !== accountKeyForUser(id)) throw new Error('账号内容正在载入，请稍后再备份。');
    return createPersonalLibrary(data.value, metaBooks.map(book => book.id));
  }

  async function fetchPersonalLibraryBackup(): Promise<CloudBackup | null | undefined> {
    const id = currentUser.value?.id ?? null;
    if (!id) throw new Error('请先登录后使用账号备份。');
    const context = { expectedUserId: id, activeKey: repository.getActiveKey() };
    if (!isAccountContextCurrent(context) || dataOwnerKey.value !== context.activeKey) return undefined;
    const token = await authClient.getAccessToken();
    if (!isAccountContextCurrent(context)) return undefined;
    if (!token || authClient.getCurrentUser()?.id !== id) throw new Error('登录状态已过期，请重新登录后再试。');
    const backup = await fetchCloudLibraryBackup(token, defaultApiBase);
    return isAccountContextCurrent(context) ? backup : undefined;
  }

  async function savePersonalLibraryBackup(value: PersonalLibrary, expectedRevision: number, expectedUserId?: string | null): Promise<CloudBackup | undefined> {
    const id = expectedUserId === undefined ? currentUser.value?.id ?? null : expectedUserId;
    if (!id) throw new Error('请先登录后使用账号备份。');
    const context = { expectedUserId: id, activeKey: repository.getActiveKey() };
    if (!isAccountContextCurrent(context) || dataOwnerKey.value !== context.activeKey) return undefined;
    const library = validatePersonalLibrary(value);
    const token = await authClient.getAccessToken();
    if (!isAccountContextCurrent(context)) return undefined;
    if (!token || authClient.getCurrentUser()?.id !== id) throw new Error('登录状态已过期，请重新登录后再试。');
    const result = await saveCloudLibraryBackup(token, library, expectedRevision, defaultApiBase);
    return isAccountContextCurrent(context) ? result : undefined;
  }

  async function removeBook(id: string) {
    return mutate(d => deleteBook(d, id));
  }

  async function editBook(id: string, title: string, description: string) {
    return mutate(d => {
      const b = d.books.find(book => book.id === id);
      if (b) {
        b.title = title.trim();
        b.description = description;
        b.updatedAt = new Date().toISOString();
      }
    });
  }

  function editablePersonalBook(d:Data,bookId:string){
    if(metaBooks.some(book=>book.id===bookId))throw new Error('内置词书的内容由词库维护，请在自建词书中添加。');
    const book=d.books.find(book=>book.id===bookId);
    if(!book)throw new Error('这本词书已不存在，请返回词书列表。');
    return book;
  }

  async function addDictionaryWord(draft:DictionaryWordDraft,expectedUserId=currentUser.value?.id??null):Promise<{status:'saved'|'existing'|'stale';wordId?:string}>{
    const context={expectedUserId,activeKey:accountKeyForUser(expectedUserId)};
    if(!isAccountContextCurrent(context))return {status:'stale'};
    let result:{status:'saved'|'existing';wordId:string}|undefined;
    const ok=await mutate(d=>{result=collectDictionaryWord(d,draft);},context);
    return ok&&result?result:{status:'stale'};
  }

  async function addPersonalWords(bookId:string,drafts:PersonalWordDraft[],target:{lessonId?:string;lessonTitle?:string}={}){
    const context={expectedUserId:currentUser.value?.id??null,activeKey:repository.getActiveKey()};
    const result={added:0,skipped:0,lessonId:''};
    const ok=await mutate(d=>{
      const book=editablePersonalBook(d,bookId);
      if(!drafts.length)throw new Error('先添加一个词，或粘贴词汇表。');
      const rows=drafts.map(cleanPersonalWord);
      const lessons=d.lessons.filter(lesson=>lesson.bookId===bookId).sort((a,b)=>a.order-b.order);
      let lesson=target.lessonId?lessons.find(lesson=>lesson.id===target.lessonId):undefined;
      if(target.lessonId&&!lesson)throw new Error('这个课次已不存在，请重新选择。');
      if(!target.lessonId){
        const title=target.lessonTitle?.trim();
        lesson=title?lessons.find(lesson=>lesson.title===title):lessons[0];
        if(!lesson){
          const order=lessons.reduce((value,lesson)=>Math.max(value,lesson.order),0)+1;
          lesson={id:crypto.randomUUID(),bookId,title:title||`第${order}课`,order};
          d.lessons.push(lesson);
        }
      }
      if(!lesson)throw new Error('请选择课次，或填写新课次名称。');
      result.lessonId=lesson.id;
      const existing=new Set(d.words.filter(word=>word.lessonId===lesson.id).map(word=>personalWordKey(word.term,word.reading)));
      let order=d.words.reduce((value,word)=>Math.max(value,word.order),0);
      for(const row of rows){
        const key=personalWordKey(row.term,row.reading);
        if(existing.has(key)){result.skipped++;continue;}
        d.words.push({id:crypto.randomUUID(),lessonId:lesson.id,order:++order,...row});
        existing.add(key);result.added++;
      }
      book.updatedAt=new Date().toISOString();
    },context);
    return ok?result:undefined;
  }

  async function editPersonalWord(wordId:string,draft:PersonalWordDraft):Promise<boolean>{
    const context={expectedUserId:currentUser.value?.id??null,activeKey:repository.getActiveKey()};
    const ok=await mutate(d=>{
      const word=d.words.find(word=>word.id===wordId);
      const lesson=d.lessons.find(lesson=>lesson.id===word?.lessonId);
      if(!word||!lesson)throw new Error('这个词已不存在，请刷新词表。');
      const book=editablePersonalBook(d,lesson.bookId);
      const row=cleanPersonalWord(draft);
      if(d.words.some(other=>other.id!==wordId&&other.lessonId===lesson.id&&personalWordKey(other.term,other.reading)===personalWordKey(row.term,row.reading)))throw new Error('本课已有相同词形和读音，请修改已有词条。');
      if(word.term!==row.term||word.reading!==row.reading){delete word.rawTerm;delete word.audioTerm;}
      Object.assign(word,row);
      if(word.senses?.length)word.senses[0]={...word.senses[0],meaning:row.meaning};
      book.updatedAt=new Date().toISOString();
    },context);
    if(ok&&isAccountContextCurrent(context)){
      const edited=data.value.words.find(word=>word.id===wordId);
      if(edited)for(const word of queue.value)if(word.id===wordId){
        Object.assign(word,edited);
        if(!edited.rawTerm)delete word.rawTerm;
        if(!edited.audioTerm)delete word.audioTerm;
      }
    }
    return ok;
  }

  function studyBookLoaded(bookId: string): boolean {
    if (!data.value.books.some(book => book.id === bookId)) return false;
    const meta = metaBooks.find(book => book.id === bookId);
    if (!meta) return true;
    const lessons = new Set(data.value.lessons.filter(lesson => lesson.bookId === bookId).map(lesson => lesson.id));
    return data.value.words.filter(word => lessons.has(word.lessonId)).length >= meta.wordCount;
  }

  async function start(studyMode: StudyMode, lessons?: string[], bookId?: string, selectedWordIds?: string[], focusedPractice=false, exercise?:WebExerciseType): Promise<boolean> {
    const context = { expectedUserId: currentUser.value?.id ?? null, activeKey: repository.getActiveKey() };
    const generation = ++sessionGeneration;
    await refresh();
    if (generation !== sessionGeneration || !isAccountContextCurrent(context)) return false;
    const targetBookId = bookId || data.value.currentBookId || data.value.books[0]?.id;
    const exampleBookIds=new Set<string>(targetBookId?[targetBookId]:[]);
    if(selectedWordIds){
      const selectedLessons=new Set(data.value.words.filter(word=>selectedWordIds.includes(word.id)).map(word=>word.lessonId));
      for(const lesson of data.value.lessons)if(selectedLessons.has(lesson.id))exampleBookIds.add(lesson.bookId);
    }
    const examplesLoaded=await Promise.all([...exampleBookIds].map(loadBookLearningExamples));
    if(generation!==sessionGeneration||!isAccountContextCurrent(context))return false;
    if(examplesLoaded.includes(false)&&(exercise??studyExercisePreference.exercise.value)==='sentence-cloze'){
      error.value='例句暂时无法加载，请重试。';return false;
    }
    if (targetBookId) {
      if (!data.value.books.some(book => book.id === targetBookId)) { error.value = '这本词书已不存在，请选择其他词书。'; return false; }
      if (!studyBookLoaded(targetBookId) && !await ensureBookLoaded(targetBookId, false, context.expectedUserId)) { error.value = '词书暂时无法读取，请重试。'; return false; }
    }
    await refresh();
    if (generation !== sessionGeneration || !isAccountContextCurrent(context)) return false;
    let selectedQueue = focusedPractice
      ?data.value.words.filter(word=>!stateFor(data.value,word.id,context.expectedUserId??'local')?.isIgnored)
      :createStudyQueue(data.value, studyMode, lessons, new Date(), context.expectedUserId ?? 'local');
    if(focusedPractice&&exercise==='sentence-cloze'){
      const {createSentenceCloze}=await import('./services/sentence-cloze');
      if(generation!==sessionGeneration||!isAccountContextCurrent(context))return false;
      const bookLessons=data.value.lessons.filter(lesson=>lesson.bookId===targetBookId).map(lesson=>lesson.id);
      const scope=new Set((lessons??bookLessons).filter(id=>bookLessons.includes(id)));
      selectedQueue=selectedQueue.filter(word=>(!!selectedWordIds||scope.has(word.lessonId))&&!!createSentenceCloze(word,personalClozeExampleFor(word)?.example));
      if(!selectedQueue.length){error.value='所选课次暂无可填空用例，可以选择其他课次。';return false;}
    }
    if(selectedWordIds){
      const allowed=new Set(selectedWordIds);
      selectedQueue=selectedQueue.filter(word=>allowed.has(word.id));
      if(!selectedQueue.length)return false;
    }
    if (bookId) {
      const selected = await mutate(d => {
        d.currentBookId = bookId;
        d.currentBookIdSource = 'user';
        d.currentBookIdUpdatedAt = new Date().toISOString();
      }, context);
      if (!selected || generation !== sessionGeneration || !isAccountContextCurrent(context)) return false;
      scheduleDebouncedSync();
    }
    beginSession(selectedQueue, studyMode, lessons,0,undefined,exercise,focusedPractice);
    return true;
  }

  async function startDailyLearning(bookId = data.value.currentBookId): Promise<boolean> {
    if(busy.value||!bookId)return false;
    error.value='';
    const userId=currentUser.value?.id??null;
    if(!studyBookLoaded(bookId)&&!await ensureBookLoaded(bookId,false,userId)){
      error.value='词书暂时无法读取，请重试。';return false;
    }
    await refresh();
    if(userId!==(currentUser.value?.id??null))return false;
    const plan=dailyStudyPlan(data.value,bookId,studyPlanPreference.getPace(bookId),new Date(),userId??'local');
    if(!plan.remaining||!plan.lessonId)return false;
    return start('new',[plan.lessonId],bookId,plan.pendingWordIds);
  }

  async function startFocusedPractice(wordIds:string[],exercise?:WebExerciseType,sceneId?:string):Promise<boolean> {
    if(!wordIds.length||busy.value)return false;
    if(sceneId)return startScenePractice(sceneId,exercise??'sentence-cloze',wordIds);
    const ids=[...new Set(wordIds)];
    const lessons=[...new Set(data.value.words.filter(word=>ids.includes(word.id)).map(word=>word.lessonId))];
    return start('difficult',lessons,undefined,ids,true,exercise);
  }

  async function startScenePractice(sceneId:string,exercise:WebExerciseType='sentence-cloze',onlyWordIds?:string[]):Promise<boolean> {
    if(busy.value)return false;
    error.value='';
    const scene=sceneFor(sceneId);
    if(!scene){error.value='这个生活场景暂不可用。';return false;}
    const generation=++sessionGeneration;
    const context={expectedUserId:currentUser.value?.id??null,activeKey:repository.getActiveKey()};
    for(const bookId of new Set(scene.items.map(item=>item.bookId))){
      if(!await ensureBookLoaded(bookId,false,context.expectedUserId)){
        if(isAccountContextCurrent(context))error.value='场景词汇暂时无法读取，请重试。';
        return false;
      }
      if(generation!==sessionGeneration||!isAccountContextCurrent(context))return false;
    }
    await refresh();
    if(generation!==sessionGeneration||!isAccountContextCurrent(context))return false;
    const resolved=resolveSceneWords(scene,data.value);
    if(resolved.length!==scene.items.length){error.value='部分场景词条暂时无法读取，请重试。';return false;}
    const allowed=onlyWordIds?new Set(onlyWordIds):undefined;
    const words=resolved.filter(({word})=>(!allowed||allowed.has(word.id))&&!stateFor(data.value,word.id,context.expectedUserId??'local')?.isIgnored).map(({word})=>word);
    if(!words.length){error.value='当前场景词汇均已忽略，恢复词条后可以再练习。';return false;}
    if(exercise==='sentence-cloze'){
      const {createSentenceCloze}=await import('./services/sentence-cloze');
      if(generation!==sessionGeneration||!isAccountContextCurrent(context))return false;
      if(words.some(word=>!createSentenceCloze(word,sceneExampleFor(sceneId,word)))){error.value='场景例句暂不可用，请先使用经典卡片。';return false;}
    }
    beginSession(words,'difficult',[...new Set(words.map(word=>word.lessonId))],0,undefined,exercise,true,sceneId);
    return true;
  }

  async function startReadingContextPractice(pairs:Array<{wordId:string;contextId:string}>):Promise<boolean> {
    if(busy.value)return false;
    error.value='';
    const generation=++sessionGeneration;
    const context={expectedUserId:currentUser.value?.id??null,activeKey:repository.getActiveKey()};
    await refresh();
    if(generation!==sessionGeneration||!isAccountContextCurrent(context))return false;
    const words:Word[]=[];
    const readingContextIds:Record<string,string>={};
    const seen=new Set<string>();
    for(const pair of pairs){
      if(!pair||typeof pair.wordId!=='string'||typeof pair.contextId!=='string'||seen.has(pair.wordId))continue;
      seen.add(pair.wordId);
      const word=data.value.words.find(item=>item.id===pair.wordId);
      if(!word||stateFor(data.value,word.id,context.expectedUserId??'local')?.isIgnored)continue;
      const original=wordReadingContexts(word).find(item=>item.id===pair.contextId);
      if(!original||!contextClozeExample(word,original))continue;
      words.push(word);
      readingContextIds[word.id]=original.id;
    }
    if(!words.length){
      if(generation===sessionGeneration&&isAccountContextCurrent(context))error.value='所选原句暂不可用于填空，请重新选择。';
      return false;
    }
    beginSession(words,'difficult',[...new Set(words.map(word=>word.lessonId))],0,undefined,'sentence-cloze',true,undefined,readingContextIds);
    return true;
  }

  async function startSentencePractice(lessons:string[],bookId?:string):Promise<boolean> {
    if(busy.value||!lessons.length)return false;
    error.value='';
    return start('difficult',[...new Set(lessons)],bookId,undefined,true,'sentence-cloze');
  }

  async function restoreStudySession(operation?: number): Promise<boolean> {
    const context = { expectedUserId: currentUser.value?.id ?? null, activeKey: repository.getActiveKey() };
    const saved = studySession.value ?? readStudySession(context.activeKey);
    if (!saved || saved.owner !== context.activeKey || !isAccountContextCurrent(context)) return false;
    const generation = operation ?? ++sessionGeneration;
    for (const id of saved.bookIds) {
      if (!data.value.books.some(book => book.id === id)) continue;
      const examplesLoaded=saved.sceneId?true:await loadBookLearningExamples(id);
      if(generation!==sessionGeneration||!isAccountContextCurrent(context))return false;
      if(!examplesLoaded&&saved.exercise==='sentence-cloze'){
        error.value='上次学习的例句暂时无法读取，请重试。学习记录已保留。';return false;
      }
      if (!studyBookLoaded(id) && !await ensureBookLoaded(id, false, context.expectedUserId)) {
        if (generation === sessionGeneration && isAccountContextCurrent(context)) error.value = '上次学习的词书暂时无法读取，请重试。学习记录已保留。';
        return false;
      }
      if (generation !== sessionGeneration || !isAccountContextCurrent(context)) return false;
    }
    await refresh();
    if (generation !== sessionGeneration || !isAccountContextCurrent(context)) return false;
    const available = new Map(data.value.words.map(word => [word.id, word]));
    const entries = saved.wordIds.flatMap((id, position) => {
      const word = available.get(id); return word ? [{ word, position, count: saved.reviewCounts[position] }] : [];
    });
    // An explicit progress reset must also invalidate the old navigation cursor.
    const resetProgress = entries.some(entry => {
      if (entry.position >= saved.index) return false;
      const state = stateFor(data.value, entry.word.id, context.expectedUserId ?? 'local');
      return !state?.isIgnored && (state?.reviewCount ?? 0) <= entry.count;
    });
    if (resetProgress) {
      checkpointPaused = true; queue.value = []; index.value = 0; sessionSize.value = 0; studySession.value = null; checkpointPaused = false;
      clearStudySession(context.activeKey); return false;
    }
    const isPending = (entry: typeof entries[number]) => {
      if (entry.position < saved.index) return false;
      const state = stateFor(data.value, entry.word.id, context.expectedUserId ?? 'local');
      if (state?.isIgnored || (state?.reviewCount ?? 0) > entry.count) return false;
      if (saved.mode === 'new') return !state?.firstSeenAt;
      if (saved.mode === 'difficult') return saved.focusedPractice || !!state?.isDifficult;
      return !!state?.nextReviewAt && Date.parse(state.nextReviewAt) <= Date.now();
    };
    const firstPending = entries.findIndex(isPending);
    const completed = firstPending < 0 ? [] : entries.slice(0, firstPending);
    const pending = firstPending < 0 ? [] : entries.slice(firstPending).filter(isPending);
    if (!pending.length) {
      checkpointPaused = true; queue.value = []; index.value = 0; sessionSize.value = 0; studySession.value = null; checkpointPaused = false;
      clearStudySession(context.activeKey); return false;
    }
    const restored = [...completed, ...pending];
    beginSession(restored.map(entry => entry.word), saved.mode, saved.lessonIds, completed.length, restored.map(entry => entry.count), saved.exercise,saved.focusedPractice,saved.sceneId,saved.readingContextIds);
    return true;
  }

  async function continueLearning(): Promise<boolean> {
    if (busy.value || continuing) return false;
    continuing = true; error.value = '';
    const generation = ++sessionGeneration;
    const context = { expectedUserId: currentUser.value?.id ?? null, activeKey: repository.getActiveKey() };
    try {
      if (await restoreStudySession(generation)) return true;
      if (generation !== sessionGeneration || error.value || !isAccountContextCurrent(context)) return false;
      if (queue.value.length > index.value) return true;
      await refresh();
      if (generation !== sessionGeneration || !isAccountContextCurrent(context)) return false;
      const logs = data.value.logs.filter(log => (log.userId === (context.expectedUserId ?? 'local') || log.userId === 'local') && Number.isFinite(Date.parse(log.reviewedAt)))
        .slice().sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt));
      const lessonBook = new Map(data.value.lessons.map(lesson => [lesson.id, lesson.bookId]));
      const latest = logs.find(log => data.value.words.some(word => word.id === log.wordId) || data.value.books.some(book => log.wordId.startsWith(book.id + '-w-')));
      const recentWord = latest && data.value.words.find(word => word.id === latest.wordId);
      const recentBook = recentWord ? lessonBook.get(recentWord.lessonId) : latest && data.value.books.find(book => latest.wordId.startsWith(book.id + '-w-'))?.id;
      const bookId = recentBook || data.value.currentBookId || data.value.books[0]?.id;
      if (!bookId || !studyBookLoaded(bookId) && !await ensureBookLoaded(bookId, false, context.expectedUserId)) { error.value = '词书暂时无法读取，请重试。'; return false; }
      if (generation !== sessionGeneration || !isAccountContextCurrent(context)) return false;
      const recentLessonId = latest && data.value.words.find(word => word.id === latest.wordId)?.lessonId;
      const allLessons = data.value.lessons.filter(lesson => lesson.bookId === bookId).map(lesson => lesson.id);
      let scope = recentLessonId ? [recentLessonId] : allLessons.length ? [allLessons[0]] : allLessons;
      let studyMode: StudyMode = latest?.studyMode && ['new', 'review', 'difficult'].includes(latest.studyMode) ? latest.studyMode : 'new';
      let words = createStudyQueue(data.value, studyMode, scope, new Date(), context.expectedUserId ?? 'local');
      if (!words.length) { scope = allLessons; words = createStudyQueue(data.value, studyMode, scope, new Date(), context.expectedUserId ?? 'local'); }
      if (!words.length) { studyMode = studyMode === 'new' ? 'review' : 'new'; words = createStudyQueue(data.value, studyMode, allLessons, new Date(), context.expectedUserId ?? 'local'); scope = allLessons; }
      if (!words.length) { error.value = '这本词书目前没有未学词或到期复习。你可以通过下方词书入口选择新的学习内容。'; return false; }
      beginSession(words, studyMode, scope);
      return true;
    } catch (cause) {
      if (isAccountContextCurrent(context)) error.value = `续学暂时无法恢复：${cause instanceof Error ? cause.message : String(cause)}`;
      return false;
    } finally { continuing = false; }
  }

  async function setCurrentBook(bookId: string) {
    await mutate(d => {
      d.currentBookId = bookId;
      d.currentBookIdSource = 'user';
      d.currentBookIdUpdatedAt = new Date().toISOString();
    });
    await ensureBookLoaded(bookId);
    scheduleDebouncedSync();
  }

  function scheduleDebouncedSync() {
    if (!currentUser.value) return;
    if (!isSyncReady.value) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      flushSyncQueue();
    }, 3500);
  }

  let flushing = false;
  async function flushSyncQueue() {
    if (flushing) return;
    const capturedUser = currentUser.value;
    if (!capturedUser) return;
    if (!isSyncReady.value) return;
    const accountContext: AccountMutationContext = {
      expectedUserId: capturedUser.id,
      activeKey: repository.getActiveKey(),
    };
    if (!isAccountContextCurrent(accountContext)) return;
    flushing = true;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (isAccountContextCurrent(accountContext)) syncStatus.value = 'offline';
        return;
      }
      const queue = (await repository.getQueue()).filter(item => item.payload?.userId === capturedUser.id);
      if (!isAccountContextCurrent(accountContext)) return;
      const currentBookId = data.value.currentBookId;
      const currentBookIdSource = data.value.currentBookIdSource;
      const currentBookIdUpdatedAt = data.value.currentBookIdUpdatedAt;

      // Guard: If queue is empty AND currentBookId is only a program default, do not push empty settings!
      if (queue.length === 0 && currentBookIdSource === 'default') {
        return;
      }

      syncStatus.value = 'syncing';
      try {
        const token = await authClient.getAccessToken();
        if (!token || !isAccountContextCurrent(accountContext) || authClient.getCurrentUser()?.id !== capturedUser.id) {
          if (!isAccountContextCurrent(accountContext)) return;
          syncStatus.value = 'error';
          syncError.value = '未登录或认证已过期';
          return;
        }

        let pronunciationVoice: 'female' | 'male' | undefined;
        try {
          if (typeof localStorage !== 'undefined') {
            const v = localStorage.getItem('jp-vocab.pronunciation-voice');
            if (v === 'female' || v === 'male') pronunciationVoice = v;
          }
        } catch {}

        const events: ReviewEvent[] = queue.filter(q => q.type === 'review_event').map(q => q.payload);
        const progress: CloudProgressDoc[] = queue.filter(q => q.type === 'progress').map(q => q.payload);
        const settings = {
          userId: capturedUser.id,
          currentBookId,
          currentBookIdSource: currentBookIdSource || 'default',
          preferences: {
            pronunciationVoice
          },
          updatedAt: currentBookIdUpdatedAt || new Date().toISOString()
        };

        if (!isAccountContextCurrent(accountContext) || authClient.getCurrentUser()?.id !== capturedUser.id) return;
        const res = await syncClient.push(token, { events, progress, settings });
        if (!isAccountContextCurrent(accountContext) || authClient.getCurrentUser()?.id !== capturedUser.id) return;
        if (res.success) {
          if (queue.length > 0) {
            await repository.dequeue(queue.map(q => q.id), accountContext.activeKey);
          }
          if (!isAccountContextCurrent(accountContext)) return;
          syncStatus.value = 'synced';
          syncError.value = '';
          lastSyncedAt.value = new Date().toISOString();
        } else {
          syncStatus.value = 'error';
        }
      } catch (err) {
        console.error('Sync flush failed:', err);
        if (isAccountContextCurrent(accountContext)) {
          syncStatus.value = 'error';
          syncError.value = String(err);
        }
      }
    } finally {
      flushing = false;
      if (currentUser.value && currentUser.value.id !== capturedUser.id && isSyncReady.value) scheduleDebouncedSync();
    }
  }

  async function rate(rating: Grade, responseTime: number, attempt?: QuizAttempt) {
    const capturedQueue = queue.value;
    const capturedIndex = index.value;
    const capturedMode = mode.value;
    const word = queue.value[index.value];
    if (!word || busy.value || sessionRoundComplete.value) return;
    const capturedUserId = currentUser.value?.id ?? null;
    const accountContext: AccountMutationContext = {
      expectedUserId: capturedUserId,
      activeKey: repository.getActiveKey(),
    };
    if (!isAccountContextCurrent(accountContext)) return;
    const currentUserId = capturedUserId || 'local';
    let newLog: ReviewLog | null = null;
    let newState: WordState | null = null;
    const ok = await mutate(d => {
      const previous = stateFor(d, word.id, currentUserId) ?? initialState(word.id, new Date(), currentUserId);
      if (previous.isIgnored) return;
      const result = evaluate(previous, rating, capturedMode, new Date(), crypto.randomUUID(), responseTime);
      result.state.userId = currentUserId;
      result.log.userId = currentUserId;
      d.states = d.states.filter(s => !(s.wordId === word.id && (s.userId === currentUserId || s.userId === 'local')));
      d.states.push(result.state);
      if (attempt) result.log.quiz = { ...attempt, options: [...attempt.options] };
      d.logs.push(result.log);
      newLog = result.log;
      newState = result.state;
    }, accountContext, async () => {
      if (!capturedUserId || !newLog || !newState) return;
      // The global outbox carries the captured user ID. An account switch during
      // enqueue must preserve this committed record; flush filters by that ID.
      await repository.enqueue([
        {
          id: `log_${(newLog as ReviewLog).id}`,
          type: 'review_event',
          payload: newLog,
          createdAt: new Date().toISOString(),
          retries: 0
        },
        {
          id: `prog_${crypto.randomUUID()}`,
          type: 'progress',
          payload: newState,
          createdAt: new Date().toISOString(),
          retries: 0
        }
      ]);
    });
    if (ok) {
      if (!isAccountContextCurrent(accountContext)) return;
      if (queue.value === capturedQueue && index.value === capturedIndex) index.value++;
      if (capturedUserId && newLog && newState) {
        scheduleDebouncedSync();
      }
    }
  }

  async function flag(wordId: string, key: 'isDifficult' | 'isIgnored', value: boolean, expectedUserId?: string | null): Promise<boolean> {
    const currentUserId = expectedUserId === undefined ? currentUser.value?.id ?? null : expectedUserId;
    const accountContext: AccountMutationContext = {
      expectedUserId: currentUserId,
      activeKey: repository.getActiveKey(),
    };
    if (!isAccountContextCurrent(accountContext)) return false;
    let updatedState: WordState | null = null;
    const ok = await mutate(d => {
      const targetUserId = currentUserId ?? 'local';
      const found = stateFor(d, wordId, targetUserId);
      const state = found ? structuredClone(found) : initialState(wordId, new Date(), targetUserId);
      state.userId = targetUserId;
      state[key] = value;
      const nowIso = new Date().toISOString();
      if (key === 'isDifficult') state.difficultUpdatedAt = nowIso;
      if (key === 'isIgnored') state.ignoredUpdatedAt = nowIso;
      state.updatedAt = nowIso;
      d.states = d.states.filter(s => !(s.wordId === wordId && (s.userId === targetUserId || (targetUserId !== 'local' && s.userId === 'local'))));
      d.states.push(state);
      updatedState = state;
    }, accountContext, async () => {
      if (!currentUserId || !updatedState) return;
      // Persist the committed, user-tagged change even if storage opens after a switch.
      await repository.enqueue([
        {
          id: `prog_${crypto.randomUUID()}`,
          type: 'progress',
          payload: updatedState,
          createdAt: new Date().toISOString(),
          retries: 0
        }
      ]);
    });
    if (!ok || !isAccountContextCurrent(accountContext)) return false;
    if (currentUserId && updatedState) {
      scheduleDebouncedSync();
    }
    return true;
  }

  function readingContextsForWord(wordId: string): ReadingContext[] {
    if (dataOwnerKey.value !== accountKeyForUser(currentUser.value?.id ?? null)) return [];
    return wordReadingContexts(wordsById.value.get(wordId))
      .slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function saveReadingContext(wordId: string, draft: ReadingContextDraft, options: {
    expectedUserId?: string | null; collectToDifficult?: boolean; restoreIgnored?: boolean; contextId?: string;
  } = {}): Promise<{ id: string; created: boolean } | undefined> {
    const userId = options.expectedUserId === undefined ? currentUser.value?.id ?? null : options.expectedUserId;
    const accountContext: AccountMutationContext = { expectedUserId: userId, activeKey: repository.getActiveKey() };
    if (!isAccountContextCurrent(accountContext)) return undefined;
    let result: { id: string; created: boolean } | undefined;
    let updatedState: WordState | undefined;
    const ok = await mutate(d => {
      const word = d.words.find(item => item.id === wordId);
      if (!word) throw new Error('词条尚未载入，请重新打开查词结果。');
      const clean = cleanReadingContext(draft);
      const owner = userId ?? 'local';
      const state = stateFor(d, wordId, owner);
      if (options.collectToDifficult && state?.isIgnored && !options.restoreIgnored) {
        throw new Error('这条词已忽略，请选择恢复并收藏原句。');
      }
      const saved = upsertReadingContext(wordReadingContexts(word), clean, { contextId: options.contextId, now: new Date(), createId: () => crypto.randomUUID() });
      word.readingContexts = saved.contexts;
      result = { id: saved.id, created: saved.created };
      if (options.collectToDifficult && (!state?.isDifficult || state.isIgnored)) {
        const next = state ? structuredClone(state) : initialState(wordId, new Date(), owner);
        next.userId = owner;
        const nowIso = new Date().toISOString();
        next.isDifficult = true;
        next.difficultUpdatedAt = nowIso;
        if (next.isIgnored) { next.isIgnored = false; next.ignoredUpdatedAt = nowIso; }
        next.updatedAt = nowIso;
        d.states = d.states.filter(item => !(item.wordId === wordId && (item.userId === owner || (owner !== 'local' && item.userId === 'local'))));
        d.states.push(next);
        updatedState = next;
      }
    }, accountContext, async () => {
      if (!userId || !updatedState) return;
      await repository.enqueue([{ id: `prog_${crypto.randomUUID()}`, type: 'progress', payload: updatedState, createdAt: new Date().toISOString(), retries: 0 }]);
    });
    if (!ok || !isAccountContextCurrent(accountContext)) return undefined;
    if (userId && updatedState) scheduleDebouncedSync();
    return result;
  }

  async function removeReadingContext(wordId: string, contextId: string, expectedUserId?: string | null): Promise<boolean> {
    const userId = expectedUserId === undefined ? currentUser.value?.id ?? null : expectedUserId;
    const accountContext: AccountMutationContext = { expectedUserId: userId, activeKey: repository.getActiveKey() };
    if (!isAccountContextCurrent(accountContext)) return false;
    return mutate(d => {
      const word = d.words.find(item => item.id === wordId);
      if (!word) throw new Error('这条词已不在词书中。');
      word.readingContexts = wordReadingContexts(word).filter(context => context.id !== contextId);
    }, accountContext);
  }

  async function sendEmailCode(email: string) {
    return authClient.sendEmailCode(email);
  }

  async function applyAuthenticatedUser(user: AuthUser, token: string): Promise<{ success: boolean; error?: string; requireConflictResolution?: boolean }> {
    userSwitchingLock = true;
    try {
      // 2. 游客数据读取：从当前活跃的游客命名空间中读取游客数据
      const localGuestData = await repository.read('data_guest');
      const localHasData = localGuestData.states.some(s => (s.reviewCount > 0 || s.firstSeenAt || s.isDifficult || s.isIgnored)) || localGuestData.logs.length > 0;

      // 3. 本地备份快照：在任何切换与写入前，将游客数据备份至 data_backup_pre_login
      await repository.createPreLoginSnapshot();

      // 4. 云端检查与交互（Bootstrap）：获取云端数据状态
      let bootstrapRes: SyncBootstrapResult;
      let isOfflineFallback = false;
      try {
        bootstrapRes = await syncClient.bootstrap(token);
      } catch (err) {
        console.warn('Bootstrap check failed, continuing with offline fallback:', err);
        isOfflineFallback = true;
        bootstrapRes = { userId: user.id, hasCloudData: false, progressCount: 0, eventCount: 0 };
      }

      // 5. 关闭旧连接：确保旧游客连接上的所有读取与备份事务均已彻底提交并释放
      await repository.close();

      // 6. 打开用户数据库 / 用户上下文切换：切换活跃键至该用户专属命名空间，并开启全新连接
      repository.switchUser(user.id);
      await repository.open();

      // 7. 用户数据初始化与写入（根据 Case A / Case B / Case C / Both Empty / 离线容灾分支）
      if (isOfflineFallback) {
        await repository.transact(d => {
          copyGuestCustomData(d, localGuestData);
          ensureSystemTextbooks(d);
          if (!d.currentBookId && localGuestData.currentBookId) {
            d.currentBookId = localGuestData.currentBookId;
          }
        });
        if (localGuestData.currentBookId) {
          await ensureBookLoaded(localGuestData.currentBookId);
        }
        await refresh();
        currentUser.value = user;
        syncStatus.value = 'offline';
        syncError.value = '登录成功，云同步暂未完成，本地学习记录仍然安全。';
        return { success: true };
      }

      const cloudHasData = bootstrapRes.hasCloudData;

      // Case A: Local has data, Cloud is empty -> 上传初始记录
      if (localHasData && !cloudHasData) {
        await repository.transact(d => {
          copyGuestCustomData(d, localGuestData);
          ensureSystemTextbooks(d);
          d.states = structuredClone(localGuestData.states);
          d.logs = structuredClone(localGuestData.logs);
          d.currentBookId = localGuestData.currentBookId || metaBooks[0]?.id || '';
          for (const s of d.states) s.userId = user.id;
          for (const l of d.logs) l.userId = user.id;
        });
        const validStates = localGuestData.states.filter(s => s.reviewCount > 0 || s.firstSeenAt || s.isDifficult || s.isIgnored);
        const validLogs = localGuestData.logs;
        const progressDocs = validStates.map(s => ({
          _id: `${user.id}_${s.wordId}`,
          userId: user.id,
          wordId: s.wordId,
          bookId: s.bookId,
          lessonId: s.lessonId,
          status: s.status,
          firstSeenAt: s.firstSeenAt,
          lastReviewedAt: s.lastReviewedAt,
          nextReviewAt: s.nextReviewAt,
          reviewCount: s.reviewCount,
          lapseCount: s.lapseCount,
          card: s.card,
          isDifficult: s.isDifficult,
          difficultUpdatedAt: s.difficultUpdatedAt,
          isIgnored: s.isIgnored,
          ignoredUpdatedAt: s.ignoredUpdatedAt,
          updatedAt: s.updatedAt || new Date().toISOString(),
          version: 1
        }));
        const reviewEvents = validLogs.map(l => ({
          _id: l.id,
          userId: user.id,
          wordId: l.wordId,
          reviewedAt: l.reviewedAt,
          rating: l.rating,
          responseTime: l.responseTime,
          studyMode: l.studyMode,
          quiz: l.quiz,
          clientCreatedAt: l.clientCreatedAt || l.reviewedAt,
          serverReceivedAt: new Date().toISOString()
        }));
        try {
          await syncClient.push(token, {
            events: reviewEvents,
            progress: progressDocs,
            settings: {
              userId: user.id,
              email: user.email,
              currentBookId: localGuestData.currentBookId,
              updatedAt: new Date().toISOString()
            }
          });
          syncStatus.value = 'synced';
          lastSyncedAt.value = new Date().toISOString();
        } catch (e) {
          syncStatus.value = 'offline';
        }
        if (localGuestData.currentBookId) {
          await ensureBookLoaded(localGuestData.currentBookId);
        }
        await refresh();
        currentUser.value = user;
        isSyncReady.value = true;
        scheduleDebouncedSync();
        return { success: true };
      }

      // Case B: Local is empty, Cloud has data -> 拉取云端数据
      if (!localHasData && cloudHasData) {
        const pullRes = await syncClient.pull(token);
        let targetBookId = pullRes.settings?.currentBookId;
        await repository.transact(d => {
          copyGuestCustomData(d, localGuestData);
          ensureSystemTextbooks(d);
          d.states = pullRes.progress.map(p => ({
            userId: user.id,
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
            isDifficult: p.isDifficult,
            difficultUpdatedAt: p.difficultUpdatedAt,
            isIgnored: p.isIgnored,
            ignoredUpdatedAt: p.ignoredUpdatedAt,
            updatedAt: p.updatedAt
          }));
          d.logs = pullRes.events.map(e => ({
            id: e._id,
            userId: user.id,
            wordId: e.wordId,
            reviewedAt: e.reviewedAt,
            rating: e.rating,
            responseTime: e.responseTime,
            previousState: null as any,
            newState: null as any,
            studyMode: e.studyMode,
            quiz: e.quiz,
            clientCreatedAt: e.clientCreatedAt,
            serverReceivedAt: e.serverReceivedAt
          }));
          if (targetBookId) {
            d.currentBookId = targetBookId;
          } else if (!d.currentBookId && metaBooks[0]) {
            d.currentBookId = metaBooks[0].id;
            targetBookId = metaBooks[0].id;
          }
        });
        if (targetBookId) {
          await ensureBookLoaded(targetBookId);
        }
        await refresh();
        currentUser.value = user;
        isSyncReady.value = true;
        scheduleDebouncedSync();
        syncStatus.value = 'synced';
        lastSyncedAt.value = new Date().toISOString();
        return { success: true };
      }

      // Case C: Local and Cloud both have real data -> 提示冲突合并
      if (localHasData && cloudHasData) {
        await repository.transact(d => {
          copyGuestCustomData(d, localGuestData);
          ensureSystemTextbooks(d);
        });
        if (data.value.currentBookId) {
          await ensureBookLoaded(data.value.currentBookId);
        }
        await refresh();
        currentUser.value = user;
        showConflictModal.value = true;
        return { success: true, requireConflictResolution: true };
      }

      // Both empty -> 新用户初始数据
      let defaultBookId = metaBooks[0]?.id;
      await repository.transact(d => {
        copyGuestCustomData(d, localGuestData);
        ensureSystemTextbooks(d);
        if (metaBooks[0] && !d.currentBookId) {
          d.currentBookId = metaBooks[0].id;
        }
      });
      if (defaultBookId) {
        await ensureBookLoaded(defaultBookId);
      }
      await refresh();
      currentUser.value = user;
      isSyncReady.value = true;
      scheduleDebouncedSync();
      syncStatus.value = 'synced';
      return { success: true };
    } finally {
      userSwitchingLock = false;
    }
  }

  async function checkAccount(email: string) {
    return authClient.checkAccount(email);
  }

  async function loginWithPassword(email: string, password: string): Promise<{ success: boolean; error?: string; flow?: string; requireConflictResolution?: boolean }> {
    const res = await authClient.loginWithPassword(email, password);
    if (!res.success || !res.user || !res.token) {
      return { success: false, error: res.error || '登录失败', flow: res.flow };
    }
    return applyAuthenticatedUser(res.user, res.token);
  }

  function startWechatLogin(): Promise<WechatAttempt> {
    return beginWechatAttempt('login');
  }

  async function finishWechatLogin(attempt: WechatAttempt, isActive: () => boolean = () => true): Promise<{ pending: boolean; success?: boolean; error?: string }> {
    const result = await redeemWechatAttempt(attempt);
    if (!isActive()) return { pending: false };
    if (result.pending) return { pending: true };
    if (result.linked) return { pending: false, success: false, error: '登录请求与绑定请求不一致。' };
    const session = result.session;
    if (!session.user || !session.token) return { pending: false, success: false, error: '微信会话无效。' };
    authClient.acceptSession(session);
    return { pending: false, ...await applyAuthenticatedUser(session.user, session.token) };
  }

  async function startWechatLink(): Promise<WechatAttempt> {
    if (!currentUser.value) throw new Error('请先登录邮箱账号。');
    const token = await authClient.getAccessToken();
    if (!token) throw new Error('账号会话已过期，请重新登录。');
    return beginWechatAttempt('link', token);
  }

  async function finishWechatLink(attempt: WechatAttempt): Promise<boolean> {
    if (!currentUser.value) throw new Error('请先登录邮箱账号。');
    const token = await authClient.getAccessToken();
    if (!token) throw new Error('账号会话已过期，请重新登录。');
    const result = await redeemWechatAttempt(attempt, token);
    if (result.pending) return false;
    if (!result.linked || result.userId !== currentUser.value?.id) throw new Error('微信绑定账号与当前账号不一致。');
    return true;
  }

  async function registerWithPassword(email: string, password: string, code: string, verificationId?: string): Promise<{ success: boolean; error?: string; requireConflictResolution?: boolean }> {
    const res = await authClient.registerWithPassword(email, password, code, verificationId);
    if (!res.success || !res.user || !res.token) {
      return { success: false, error: res.error || '注册失败' };
    }
    return applyAuthenticatedUser(res.user, res.token);
  }

  async function upgradeLegacyPassword(email: string, password: string, code: string, verificationId?: string): Promise<{ success: boolean; error?: string; requireConflictResolution?: boolean }> {
    const res = await authClient.upgradeLegacyPassword(email, password, code, verificationId);
    if (!res.success || !res.user || !res.token) {
      return { success: false, error: res.error || '升级失败' };
    }
    return applyAuthenticatedUser(res.user, res.token);
  }

  async function resetPassword(email: string, newPassword: string, code: string, verificationId?: string): Promise<{ success: boolean; error?: string; requireConflictResolution?: boolean }> {
    const res = await authClient.resetPassword(email, newPassword, code, verificationId);
    if (!res.success || !res.user || !res.token) {
      return { success: false, error: res.error || '重置密码失败' };
    }
    return applyAuthenticatedUser(res.user, res.token);
  }

  async function loginWithEmailCode(email: string, code: string): Promise<{ success: boolean; error?: string; requireConflictResolution?: boolean }> {
    const authRes = await authClient.signInWithEmailCode(email, code);
    if (!authRes.success || !authRes.user || !authRes.token) {
      return { success: false, error: authRes.error || '登录失败' };
    }
    return applyAuthenticatedUser(authRes.user, authRes.token);
  }

  async function resolveConflictAndMerge() {
    if (!currentUser.value) return;
    const user = currentUser.value;
    const token = await authClient.getAccessToken();
    if (!token) return;

    const localData = await repository.read('data_guest');
    const pullRes = await syncClient.pull(token);

    const eventMap = new Map<string, ReviewEvent | ReviewLog>();
    for (const l of localData.logs) {
      eventMap.set(l.id, l);
    }
    for (const e of pullRes.events) {
      eventMap.set(e._id, e);
    }
    const allEvents = Array.from(eventMap.values());

    const wordIds = new Set<string>([
      ...localData.states.map(s => s.wordId),
      ...pullRes.progress.map(p => p.wordId)
    ]);

    const mergedStates: WordState[] = [];
    for (const wId of wordIds) {
      const localS = localData.states.find(s => s.wordId === wId);
      const remoteP = pullRes.progress.find(p => p.wordId === wId);
      const wordEvents = allEvents.filter(e => e.wordId === wId);

      if (localS && remoteP) {
        mergedStates.push(mergeWordStateWithLww(localS, remoteP, wordEvents));
      } else if (localS) {
        mergedStates.push(wordEvents.length > 0 ? reconcileFsrsFromEvents(wordEvents, localS) : localS);
      } else if (remoteP) {
        mergedStates.push({
          userId: user.id,
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
          isDifficult: remoteP.isDifficult,
          difficultUpdatedAt: remoteP.difficultUpdatedAt,
          isIgnored: remoteP.isIgnored,
          ignoredUpdatedAt: remoteP.ignoredUpdatedAt,
          updatedAt: remoteP.updatedAt
        });
      }
    }

    await repository.transact(d => {
      copyGuestCustomData(d, localData);
      ensureSystemTextbooks(d);
      d.states = mergedStates;
      d.logs = allEvents.map(e => ({
        id: (e as any)._id || (e as any).id,
        userId: user.id,
        wordId: e.wordId,
        reviewedAt: e.reviewedAt,
        rating: e.rating,
        responseTime: e.responseTime,
        previousState: (e as any).previousState,
        newState: (e as any).newState,
        studyMode: e.studyMode,
        quiz: e.quiz,
        clientCreatedAt: (e as any).clientCreatedAt,
        serverReceivedAt: (e as any).serverReceivedAt
      }));
    });

    const pushProgress: CloudProgressDoc[] = mergedStates.map(s => ({
      _id: `${user.id}_${s.wordId}`,
      userId: user.id,
      wordId: s.wordId,
      bookId: s.bookId,
      lessonId: s.lessonId,
      status: s.status,
      firstSeenAt: s.firstSeenAt,
      lastReviewedAt: s.lastReviewedAt,
      nextReviewAt: s.nextReviewAt,
      reviewCount: s.reviewCount,
      lapseCount: s.lapseCount,
      card: s.card,
      isDifficult: s.isDifficult,
      difficultUpdatedAt: s.difficultUpdatedAt,
      isIgnored: s.isIgnored,
      ignoredUpdatedAt: s.ignoredUpdatedAt,
      updatedAt: new Date().toISOString(),
      version: 1
    }));

    const pushEvents: ReviewEvent[] = allEvents.map(e => ({
      _id: (e as any)._id || (e as any).id,
      userId: user.id,
      wordId: e.wordId,
      reviewedAt: e.reviewedAt,
      rating: e.rating,
      responseTime: e.responseTime,
      studyMode: e.studyMode,
      quiz: e.quiz,
      clientCreatedAt: (e as any).clientCreatedAt || e.reviewedAt,
      serverReceivedAt: new Date().toISOString()
    }));

    await syncClient.push(token, {
      events: pushEvents,
      progress: pushProgress,
      settings: {
        userId: user.id,
        email: user.email,
        currentBookId: localData.currentBookId,
        updatedAt: new Date().toISOString()
      }
    });

    if (localData.currentBookId) {
      await ensureBookLoaded(localData.currentBookId);
    }
    showConflictModal.value = false;
    isSyncReady.value = true;
    syncStatus.value = 'synced';
    lastSyncedAt.value = new Date().toISOString();
    await refresh();
  }

  async function logout() {
    await flushSyncQueue();
    await authClient.signOut();
    currentUser.value = null;
    await repository.close();
    repository.switchUser(null);
    await repository.open();
    await refresh();
    await mutate(d => {
      ensureSystemTextbooks(d);
    });
    syncStatus.value = 'synced';
    syncError.value = '';
  }

  return {
    data,
    ready,
    error,
    busy,
    now,
    stats,
    queue,
    index,
    mode,
    sessionSize,
    sessionExercise,
    studySession,
    sessionRoundEnd,
    sessionRoundComplete,
    startDailyLearning,
    startFocusedPractice,
    startScenePractice,
    startReadingContextPractice,
    startSentencePractice,
    hasResumableSession,
    continueLearning,
    setSessionExercise,
    metaBooks,
    currentUser,
    syncStatus,
    syncError,
    lastSyncedAt,
    isSyncReady,
    showLoginModal,
    showConflictModal,
    init,
    refresh,
    mutate,
    addBook,
    personalLibrarySummary,
    preparePersonalLibraryBackup,
    fetchPersonalLibraryBackup,
    savePersonalLibraryBackup,
    exportPersonalLibrary,
    importPersonalLibrary,
    removeBook,
    editBook,
    addPersonalWords,
    addDictionaryWord,
    editPersonalWord,
    start,
    setCurrentBook,
    rate,
    flag,
    saveReadingContext,
    removeReadingContext,
    readingContextsForWord,
    ensureBookLoaded,
    sendEmailCode,
    checkAccount,
    loginWithPassword,
    startWechatLogin,
    finishWechatLogin,
    startWechatLink,
    finishWechatLink,
    registerWithPassword,
    upgradeLegacyPassword,
    resetPassword,
    loginWithEmailCode,
    reconcileWithCloud,
    resolveConflictAndMerge,
    logout,
    flushSyncQueue
  };
});
