import {defineStore} from 'pinia';
import {ref,computed} from 'vue';
import {emptyData,type Data,type StudyMode,type Word,type QuizAttempt,type ReviewLog,type WordState,type CloudProgressDoc,type ReviewEvent,type SyncBootstrapResult} from '@jp/models';
import {IndexedDbRepository,deleteBook} from '@jp/storage';
import {createStudyQueue,evaluate,initialState,stateFor,statistics,mergeWordStateWithLww,reconcileFsrsFromEvents} from '@jp/core';
import {importBook,type ImportRow,type TextbookDefinition,textbookWordId} from '@jp/importers';
import {type AuthUser,type AuthClient,type SyncClient,type SyncPullResult,CloudBaseAuthClient,MockAuthClient,WorkerSyncClient} from '@jp/sync';
import type {Grade} from 'ts-fsrs';
import seed from './seed.json';
import textbookMetaPayload from './textbooks-metadata.json';

export interface TextbookMetaBook {
  id: string;
  title: string;
  description: string;
  wordCount: number;
  lessons: Array<{ id: string; bookId: string; title: string; order: number; wordCount: number }>;
}

export const metaBooks = (textbookMetaPayload as { books: TextbookMetaBook[] }).books;
const repository = new IndexedDbRepository();
const loadingBooks = new Set<string>();

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
const syncClient: SyncClient = new WorkerSyncClient(defaultApiBase, 10000, authClient);

export const useApp = defineStore('app', () => {
  const data = ref<Data>(emptyData());
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
  const syncStatus = ref<'synced' | 'syncing' | 'offline' | 'error'>('synced');
  const syncError = ref('');
  const lastSyncedAt = ref<string | null>(null);
  const isSyncReady = ref(false);
  const showLoginModal = ref(false);
  const showConflictModal = ref(false);
  let syncTimer: any = null;
  let reconciliationPromise: Promise<void> | null = null;

  let refreshingPromise: Promise<void> | null = null;
  async function refresh() {
    if (refreshingPromise) return refreshingPromise;
    refreshingPromise = (async () => {
      try {
        data.value = await repository.read();
        now.value = new Date();
      } catch (e) {
        error.value = `无法读取本地数据：${String(e)}`;
      } finally {
        refreshingPromise = null;
      }
    })();
    return refreshingPromise;
  }

  async function mutate(change: (d: Data) => void) {
    if (busy.value) return false;
    busy.value = true;
    error.value = '';
    try {
      data.value = await repository.transact(change);
      now.value = new Date();
      return true;
    } catch (e) {
      error.value = `保存失败，操作未完成：${e instanceof Error ? e.message : String(e)}`;
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

        // Smart self-healing: if resolvedBookId has 0 learned words in mergedStates,
        // but user has learned words in another book, auto-heal to the book with progress!
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

        if (bookLearnedCounts.size > 0 && (!resolvedBookId || (bookLearnedCounts.get(resolvedBookId) || 0) === 0)) {
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

  async function init() {
    // 1. Initialize Auth session & listeners first to determine user namespace
    try {
      await authClient.init();
      const user = authClient.getCurrentUser();
      if (user) {
        currentUser.value = user;
        repository.switchUser(user.id);
      }
      authClient.onAuthStateChange(async (u) => {
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
      console.warn('Auth init failed:', e);
    }

    // 2. Read data for current namespace (guest or logged-in user)
    await refresh();

    // 3. Ensure system textbooks and initial guest seed on active namespace
    await mutate(d => {
      const existing = d.books.length > 0 || d.seeded;
      if (!d.seeded && !currentUser.value) {
        importBook(d, seed, '日语测试词书', () => crypto.randomUUID(), new Date(), '从初次见面到日常生活，48 个常用词。');
        d.seeded = true;
      }
      ensureSystemTextbooks(d);
      d.textbooksVersion = 'biaori-v2';
      if (!existing && metaBooks[0] && !d.currentBookId) {
        d.currentBookId = metaBooks[0].id;
        d.currentBookIdSource = 'default';
      }
    });

    // 4. Synchronously upgrade and cache-bust any already-loaded textbook words
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

    // 5. If user is logged in, perform reconciliation with cloud
    if (currentUser.value) {
      await reconcileWithCloud(currentUser.value);
    } else {
      isSyncReady.value = false;
    }

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

    ready.value = true;
  }

  async function ensureBookLoaded(bookId: string, force = false): Promise<boolean> {
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
    if (loadingBooks.has(bookId)) return false;
    loadingBooks.add(bookId);
    try {
      const res = await fetch(`/data/books/${bookId}.json?v=${TEXTBOOKS_DATA_VERSION}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bookDef = await res.json() as TextbookDefinition;
      await mutate(d => {
        const existingMap = new Map<string, Word>(d.words.map(w => [w.id, w]));
        for (const lesson of bookDef.lessons) {
          const lessonId = `${bookDef.id}-l-${lesson.order}`;
          for (const [idx, row] of lesson.words.entries()) {
            const wordId = textbookWordId(bookDef.id, lesson.order, row.sourceIndex ?? idx);
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
      });
      return true;
    } catch (err) {
      console.error(`Failed to load textbook ${bookId}:`, err);
      return false;
    } finally {
      loadingBooks.delete(bookId);
    }
  }

  async function addBook(rows: ImportRow[], title: string, description = '') {
    let id = '';
    const ok = await mutate(d => {
      id = importBook(d, rows, title, () => crypto.randomUUID(), new Date(), description);
    });
    return ok ? id : undefined;
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

  async function start(studyMode: StudyMode, lessons?: string[], bookId?: string) {
    const targetBookId = bookId || data.value.currentBookId || data.value.books[0]?.id;
    if (targetBookId) {
      await ensureBookLoaded(targetBookId);
    }
    await refresh();
    queue.value = createStudyQueue(data.value, studyMode, lessons);
    index.value = 0;
    mode.value = studyMode;
    sessionSize.value = queue.value.length;
    if (bookId) {
      await mutate(d => {
        d.currentBookId = bookId;
        d.currentBookIdSource = 'user';
        d.currentBookIdUpdatedAt = new Date().toISOString();
      });
      scheduleDebouncedSync();
    }
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
    if (!currentUser.value) return;
    if (!isSyncReady.value) return;
    flushing = true;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        syncStatus.value = 'offline';
        return;
      }
      const queue = await repository.getQueue();

      // Guard: If queue is empty AND currentBookId is only a program default, do not push empty settings!
      if (queue.length === 0 && data.value.currentBookIdSource === 'default') {
        return;
      }

      syncStatus.value = 'syncing';
      try {
        const token = await authClient.getAccessToken();
        if (!token) {
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
          userId: currentUser.value.id,
          currentBookId: data.value.currentBookId,
          currentBookIdSource: data.value.currentBookIdSource || 'default',
          preferences: {
            pronunciationVoice
          },
          updatedAt: data.value.currentBookIdUpdatedAt || new Date().toISOString()
        };

        const res = await syncClient.push(token, { events, progress, settings });
        if (res.success) {
          if (queue.length > 0) {
            await repository.dequeue(queue.map(q => q.id));
          }
          syncStatus.value = 'synced';
          syncError.value = '';
          lastSyncedAt.value = new Date().toISOString();
        } else {
          syncStatus.value = 'error';
        }
      } catch (err) {
        console.error('Sync flush failed:', err);
        syncStatus.value = 'error';
        syncError.value = String(err);
      }
    } finally {
      flushing = false;
    }
  }

  async function rate(rating: Grade, responseTime: number, attempt?: QuizAttempt) {
    const word = queue.value[index.value];
    if (!word || busy.value) return;
    const currentUserId = currentUser.value?.id || 'local';
    let newLog: ReviewLog | null = null;
    let newState: WordState | null = null;
    const ok = await mutate(d => {
      const previous = stateFor(d, word.id, currentUserId) ?? initialState(word.id, new Date(), currentUserId);
      if (previous.isIgnored) return;
      const result = evaluate(previous, rating, mode.value, new Date(), crypto.randomUUID(), responseTime);
      result.state.userId = currentUserId;
      result.log.userId = currentUserId;
      d.states = d.states.filter(s => !(s.wordId === word.id && (s.userId === currentUserId || s.userId === 'local')));
      d.states.push(result.state);
      if (attempt) result.log.quiz = { ...attempt, options: [...attempt.options] };
      d.logs.push(result.log);
      newLog = result.log;
      newState = result.state;
    });
    if (ok) {
      index.value++;
      if (currentUser.value && newLog && newState) {
        await repository.enqueue([
          {
            id: `log_${(newLog as ReviewLog).id}`,
            type: 'review_event',
            payload: newLog,
            createdAt: new Date().toISOString(),
            retries: 0
          },
          {
            id: `prog_${(newState as WordState).wordId}`,
            type: 'progress',
            payload: newState,
            createdAt: new Date().toISOString(),
            retries: 0
          }
        ]);
        scheduleDebouncedSync();
      }
    }
  }

  async function flag(wordId: string, key: 'isDifficult' | 'isIgnored', value: boolean) {
    const currentUserId = currentUser.value?.id || 'local';
    let updatedState: WordState | null = null;
    const ok = await mutate(d => {
      let state = stateFor(d, wordId, currentUserId);
      if (!state) {
        state = initialState(wordId, new Date(), currentUserId);
        d.states.push(state);
      }
      state[key] = value;
      const nowIso = new Date().toISOString();
      if (key === 'isDifficult') state.difficultUpdatedAt = nowIso;
      if (key === 'isIgnored') state.ignoredUpdatedAt = nowIso;
      state.updatedAt = nowIso;
      updatedState = state;
    });
    if (ok && currentUser.value && updatedState) {
      await repository.enqueue([
        {
          id: `prog_${(updatedState as WordState).wordId}`,
          type: 'progress',
          payload: updatedState,
          createdAt: new Date().toISOString(),
          retries: 0
        }
      ]);
      scheduleDebouncedSync();
    }
  }

  async function sendEmailCode(email: string) {
    return authClient.sendEmailCode(email);
  }

  async function applyAuthenticatedUser(user: AuthUser, token: string): Promise<{ success: boolean; error?: string; requireConflictResolution?: boolean }> {
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
      await refresh();
      currentUser.value = user;
      scheduleDebouncedSync();
      return { success: true };
    }

    // Case B: Local is empty, Cloud has data -> 拉取云端数据
    if (!localHasData && cloudHasData) {
      const pullRes = await syncClient.pull(token);
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
        if (pullRes.settings?.currentBookId) {
          d.currentBookId = pullRes.settings.currentBookId;
        } else if (!d.currentBookId && metaBooks[0]) {
          d.currentBookId = metaBooks[0].id;
        }
      });
      await refresh();
      currentUser.value = user;
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
      await refresh();
      currentUser.value = user;
      showConflictModal.value = true;
      return { success: true, requireConflictResolution: true };
    }

    // Both empty -> 新用户初始数据
    await repository.transact(d => {
      copyGuestCustomData(d, localGuestData);
      ensureSystemTextbooks(d);
      if (metaBooks[0] && !d.currentBookId) {
        d.currentBookId = metaBooks[0].id;
      }
    });
    await refresh();
    currentUser.value = user;
    scheduleDebouncedSync();
    syncStatus.value = 'synced';
    return { success: true };
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

    showConflictModal.value = false;
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
    removeBook,
    editBook,
    start,
    setCurrentBook,
    rate,
    flag,
    ensureBookLoaded,
    sendEmailCode,
    checkAccount,
    loginWithPassword,
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
