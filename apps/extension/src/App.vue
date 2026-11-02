<script setup lang="ts">
import { computed, KeepAlive, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  ArrowLeft,
  ChartNoAxesCombined,
  Bookmark,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Globe2,
  LoaderCircle,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-vue-next';
import extensionPackage from '../package.json';
import { extensionApi } from './client';
import LearningWorkspace from './LearningWorkspace.vue';
import PracticeWorkspace from './components/PracticeWorkspace.vue';
import PersonalLibraryWorkspace from './components/PersonalLibraryWorkspace.vue';
import IgnoredWordsWorkspace from './components/IgnoredWordsWorkspace.vue';
import { extensionContentWords } from './personal-library';
import WordLearningNotes from './components/WordLearningNotes.vue';
import MeaningPreview from '../../web/src/components/MeaningPreview.vue';
import { stopAnswerSound } from './answer-sound';
import AccountPanel from './components/AccountPanel.vue';
import LearningStatistics from './components/LearningStatistics.vue';
import DictionaryComparisonPanel from './components/DictionaryComparisonPanel.vue';
import DictionaryPreferences from './components/DictionaryPreferences.vue';
import AnswerSoundPreferences from './components/AnswerSoundPreferences.vue';
import AutoPronunciationPreferences from './components/AutoPronunciationPreferences.vue';
import HomeDisplayPreferences from './components/HomeDisplayPreferences.vue';
import DictionaryLookupResults from './components/DictionaryLookupResults.vue';
import { dictionaryFavoriteId, dictionaryResultKey, dictionaryWord, type DictionaryQuery, type DictionarySearchResult } from './dictionary';
import { extensionLibraryProgress } from './learning-analytics';
import { fullBookTitle } from './book-presentation';
import { bookIdForWord, buildStudyQueue } from './learning';
import { extensionDailyStudyPlan } from './daily-study-plan';
import { useStudyPlanPreference } from './study-plan-preference';
import { useHomeDisplayPreference } from './home-display-preference';
import { readStudyCheckpoint, resolveStudyCheckpoint } from './study-checkpoint';
import type { ExtensionSnapshot, ExtensionWord, HistoricalPracticeRequest, LearningLaunchRequest, LookupRequest, MotionMode, SavedWord } from './model';
import { searchCatalog } from './search';
import { useExtensionMotion } from './motion';

type MainView = 'lookup' | 'learning' | 'saved' | 'stats';
type View = MainView | 'review' | 'settings' | 'practice' | 'personal' | 'ignored';
type ReviewKind = 'due' | 'new';

interface ReviewCandidate {
  saved: SavedWord;
  kind: ReviewKind;
}

const mainViews = [
  { id: 'lookup', label: '今日', icon: Search },
  { id: 'learning', label: '词书', icon: BookOpen },
  { id: 'saved', label: '生词本', icon: Bookmark },
  { id: 'stats', label: '统计', icon: ChartNoAxesCombined },
] as const satisfies ReadonlyArray<{ id: MainView; label: string; icon: typeof Search }>;

const samples = ['言葉', '毎日', '記憶'];
const ratings = [
  { value: 1 as const, label: '重来', sublabel: 'Again' },
  { value: 2 as const, label: '困难', sublabel: 'Hard' },
  { value: 3 as const, label: '记住了', sublabel: 'Good' },
  { value: 4 as const, label: '很熟', sublabel: 'Easy' },
];

const root = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const initialView: MainView = typeof window !== 'undefined' && window.location?.pathname.endsWith('/learning.html') ? 'learning' : 'lookup';
const activeView = ref<View>(initialView);
const selectedMainView = ref<MainView>(initialView);
const settingsReturnView = ref<View>(initialView);
const query = ref('');
const submittedQuery = ref('');
const sourceHost = ref('');
const catalog = ref<ExtensionWord[]>([]);
const catalogReady = ref(false);
const nowMs = ref(Date.now());
const storedSnapshot = ref<ExtensionSnapshot | null>(null);
let expectedViewPartition = '';
const snapshot = computed({
  get: () => storedSnapshot.value,
  set: (next: ExtensionSnapshot | null) => {
    if (next?.identity?.partitionKey && expectedViewPartition && next.identity.partitionKey !== expectedViewPartition) {
      throw new Error('账号已切换，请重新读取扩展数据。');
    }
    nowMs.value = Date.now();
    storedSnapshot.value = next;
  },
});
const loading = ref(true);
const loadError = ref('');
const searchError = ref('');
const actionError = ref('');
const actionMessage = ref('');
const savingWordId = ref('');
const manualError = ref('');
const manualDraftId = ref('');
const manualDraftFingerprint = ref('');
const manualDraft = ref({ term: '', reading: '', meaning: '' });
const manualSavedTerm = ref('');
const pendingRemoveId = ref('');
const removingWordId = ref('');
const savedError = ref('');
const backupMessage = ref('');
const downloadingBackup = ref(false);
const sessionReviewedIds = ref(new Set<string>());
const pendingReviewWrite = ref<{ wordId: string; requestId: string; rating: 1 | 2 | 3 | 4; expectedReviewCount: number } | null>(null);
const reviewRevealed = ref(false);
const reviewBusy = ref(false);
const refreshingReview = ref(false);
const reviewError = ref('');
const reviewMessage = ref('');
const settingsError = ref('');
const savingMotion = ref(false);
const comparisonOpen = ref(false);
const comparisonQuery = ref<DictionaryQuery>({ term: '', reading: '' });
const savingDictionaryKey = ref('');
const savedDictionaryKeys = ref<string[]>([]);
const homePreference = useHomeDisplayPreference();
const homeDisplay = homePreference.display;
const planPreference = useStudyPlanPreference();
const learningLaunch = ref<LearningLaunchRequest | null>(null);
let launchSequence = 0;
const practiceTool = ref<'scenes' | 'conjugation'>('scenes');
const practiceVerbId = ref<string>();
const practiceSceneId = ref<string>();
const practiceReturnView = ref<MainView>(initialView);
const personalReturnView = ref<View>('learning');
const personalWordId = ref<string>();
const ignoredReturnView = ref<View>('saved');
const contentWords = computed(() => snapshot.value ? extensionContentWords(snapshot.value, catalog.value) : catalog.value);

let lookupUnsubscribe: (() => void) | undefined;
let clockTimer: ReturnType<typeof setInterval> | undefined;
let loadSequence = 0;
let accountChannel: BroadcastChannel | undefined;
let lastAccountSignal = '';

const motionMode = computed<MotionMode>(() => snapshot.value?.preferences.motion ?? 'standard');
const { animateView, animateReveal } = useExtensionMotion(root, motionMode);

watch(activeView, (view, previous) => {
  comparisonOpen.value = false;
  if (view === 'learning') {
    loadSequence++;
    loading.value = false;
  } else {
    if (previous === 'learning' || view === 'stats') void loadData();
    void animateView();
  }
  void nextTick(() => { if (typeof window !== 'undefined') window.scrollTo?.({ top: 0, behavior: 'instant' }); });
});

const searchResults = computed(() => {
  if (!submittedQuery.value || !catalogReady.value) return [];
  return searchCatalog(contentWords.value, submittedQuery.value, 24);
});

const savedIds = computed(() => new Set((snapshot.value?.words ?? []).map(item => item.word.id)));
const savedWords = computed(() => snapshot.value?.words ?? []);

function isDue(item: SavedWord, at = nowMs.value): boolean {
  if (item.state.reviewCount <= 0 || !item.state.nextReviewAt) return false;
  const nextAt = Date.parse(item.state.nextReviewAt);
  return Number.isFinite(nextAt) && nextAt <= at;
}

function classifySaved(item: SavedWord): 'new' | 'due' | 'planned' | 'learned' {
  if (item.state.reviewCount === 0) return 'new';
  if (isDue(item)) return 'due';
  return item.state.nextReviewAt ? 'planned' : 'learned';
}

const savedNewCount = computed(() => savedWords.value.filter(item => classifySaved(item) === 'new').length);
const savedDueCount = computed(() => savedWords.value.filter(item => classifySaved(item) === 'due').length);
const library = computed(() => snapshot.value ? extensionLibraryProgress(catalog.value, snapshot.value) : null);
const activeBook = computed(() => {
  const id = snapshot.value?.learning.userSettings?.currentBookId || snapshot.value?.preferences.selectedBookIds[0];
  return library.value?.books.find(book => book.id === id) || library.value?.books.find(book => book.id === 'biaori-beginner-upper') || library.value?.books[0];
});
const todayPlan = computed(() => snapshot.value && activeBook.value
  ? extensionDailyStudyPlan(catalog.value, snapshot.value, activeBook.value.id, planPreference.getPace(activeBook.value.id), new Date(nowMs.value))
  : null);
const currentBookDue = computed(() => snapshot.value && activeBook.value
  ? buildStudyQueue([...catalog.value, ...snapshot.value.learning.words], snapshot.value.learning.states, { mode: 'review', bookIds: [activeBook.value.id], now: new Date(nowMs.value) }).length : 0);
const homeNumber = computed(() => homeDisplay.value === 'today' ? todayPlan.value?.remaining ?? 0 : homeDisplay.value === 'progress' ? activeBook.value?.percent ?? 0 : currentBookDue.value);
const homeLabel = computed(() => homeDisplay.value === 'today' ? '今日待学' : homeDisplay.value === 'progress' ? '词书进度' : '待复习');
const homeDescription = computed(() => {
  if (homeDisplay.value === 'progress') return `已学 ${activeBook.value?.learned ?? 0} / ${activeBook.value?.total ?? 0} 词`;
  if (homeDisplay.value === 'review') return currentBookDue.value ? '到时间了，温习一下熟悉的词。' : '今天暂无到期复习，按自己的节奏认识新词。';
  return todayPlan.value?.remaining ? `${todayPlan.value.lessonTitle} · 今天已学 ${todayPlan.value.completed} / ${todayPlan.value.target} 词` : todayPlan.value?.target ? '今天的计划已完成，明天再继续。' : '这本词书的新词已学完，可以温习或换一本。';
});
const resumeWords = computed(() => {
  if (!snapshot.value) return [];
  // loadData refreshes the shell after leaving learning and on account changes.
  const checkpoint = readStudyCheckpoint(snapshot.value.identity?.partitionKey ?? 'local');
  return checkpoint ? resolveStudyCheckpoint([...catalog.value, ...snapshot.value.learning.words], snapshot.value, checkpoint) : [];
});
const homePaceLabel = computed(() => `${planPreference.getPace(activeBook.value?.id ?? '') === 0.5 ? '半' : '一'}${activeBook.value?.id.startsWith('jlpt-') ? '组' : '课'} / 天`);
const primaryHomeLabel = computed(() => homeDisplay.value === 'review' && currentBookDue.value ? '开始复习' : todayPlan.value?.remaining ? '开始今日计划' : '选择课次');

function launchLearning(kind: 'daily' | 'review' | 'resume' | 'library') {
  if (!snapshot.value) return;
  learningLaunch.value = { id: ++launchSequence, kind, owner: snapshot.value.identity?.partitionKey ?? 'local', bookId: activeBook.value?.id };
  openMainView('learning');
}

function startHomePlan() {
  launchLearning(homeDisplay.value === 'review' && currentBookDue.value ? 'review' : todayPlan.value?.remaining ? 'daily' : 'library');
}
function openPractice(tool: 'scenes' | 'conjugation', verbId?: string, sceneId?: string) {
  stopAnswerSound();
  if (activeView.value !== 'practice') practiceReturnView.value = selectedMainView.value;
  practiceTool.value = tool;
  practiceVerbId.value = verbId;
  practiceSceneId.value = sceneId;
  selectedMainView.value = 'learning';
  activeView.value = 'practice';
}
function startScenePractice(value: { sceneId: string; exercise: 'card' | 'sentence-cloze' }) {
  if (!snapshot.value) return;
  learningLaunch.value = { id: ++launchSequence, kind: 'scene', owner: snapshot.value.identity?.partitionKey ?? 'local', ...value };
  openMainView('learning');
}
function startHistoricalPractice(value: HistoricalPracticeRequest) {
  if (!snapshot.value) return;
  learningLaunch.value = { id: ++launchSequence, kind: 'feedback', owner: snapshot.value.identity?.partitionKey ?? 'local', bookId: value.bookId, exercise: value.type, range: value.range };
  openMainView('learning');
}
function startPersonalContextPractice(value: { wordId: string; contextId: string }) {
  if (!snapshot.value) return;
  learningLaunch.value = {
    id: ++launchSequence,
    kind: 'personal-context',
    owner: snapshot.value.identity?.partitionKey ?? 'local',
    readingContextIds: { [value.wordId]: value.contextId },
  };
  openMainView('learning');
}
function displayBookTitle(word: ExtensionWord) { return fullBookTitle({ id: bookIdForWord(word), title: word.bookTitle }); }

const reviewQueue = computed<ReviewCandidate[]>(() => {
  const queue: ReviewCandidate[] = [];
  for (const saved of savedWords.value) {
    if (saved.state.isIgnored || sessionReviewedIds.value.has(saved.word.id)) continue;
    if (saved.state.reviewCount === 0) {
      queue.push({ saved, kind: 'new' });
    } else if (isDue(saved)) {
      queue.push({ saved, kind: 'due' });
    }
  }

  return queue.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'due' ? -1 : 1;
    if (a.kind === 'due') {
      return Date.parse(a.saved.state.nextReviewAt ?? '') - Date.parse(b.saved.state.nextReviewAt ?? '');
    }
    return Date.parse(a.saved.savedAt) - Date.parse(b.saved.savedAt);
  });
});

const currentReview = computed(() => reviewQueue.value[0] ?? null);
const reviewedThisSession = computed(() => sessionReviewedIds.value.size);
const nextScheduledReview = computed(() => {
  const future = savedWords.value
    .filter(item => !item.state.isIgnored && item.state.nextReviewAt)
    .map(item => Date.parse(item.state.nextReviewAt!))
    .filter(value => Number.isFinite(value) && value > nowMs.value)
    .sort((a, b) => a - b)[0];
  return future ? formatDate(future) : '';
});

const version = String(extensionPackage.version || '0.1.0');

watch(() => currentReview.value?.saved.word.id, (nextId, previousId) => {
  if (nextId !== previousId) {
    comparisonOpen.value = false;
    reviewRevealed.value = false;
    reviewError.value = '';
    pendingReviewWrite.value = null;
  }
});
watch(query, () => { comparisonOpen.value = false; });

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

async function loadData() {
  const current = ++loadSequence;
  loading.value = true;
  loadError.value = '';

  const [catalogResult, snapshotResult] = await Promise.allSettled([
    extensionApi.loadCatalog(),
    extensionApi.read(),
  ]);
  if (current !== loadSequence) return;

  const failures: string[] = [];
  if (catalogResult.status === 'fulfilled') {
    catalog.value = catalogResult.value;
    catalogReady.value = true;
  } else {
    catalogReady.value = false;
    failures.push(messageFrom(catalogResult.reason, '离线词库暂时无法读取。'));
  }

  if (snapshotResult.status === 'fulfilled') {
    expectedViewPartition = snapshotResult.value.identity?.partitionKey ?? 'current';
    snapshot.value = snapshotResult.value;
  } else {
    snapshot.value = null;
    failures.push(messageFrom(snapshotResult.reason, '本地生词本暂时无法读取。'));
  }

  loadError.value = failures.join(' ');
  loading.value = false;
}

function accountChanged(event: Event) {
  const detail = event instanceof MessageEvent ? event.data : (event as CustomEvent).detail;
  const partition = typeof detail?.partitionKey === 'string' ? detail.partitionKey : '';
  if (!partition) return;
  if (partition === lastAccountSignal && !detail.refresh) return;
  lastAccountSignal = partition;
  const changed = partition !== expectedViewPartition;
  expectedViewPartition = partition;
  if (changed) {
    learningLaunch.value = null;
    comparisonOpen.value = false;
    savingDictionaryKey.value = '';
    savedDictionaryKeys.value = [];
    snapshot.value = null;
    loading.value = true;
    sessionReviewedIds.value = new Set();
    pendingReviewWrite.value = null;
    reviewRevealed.value = false;
    query.value = '';
    submittedQuery.value = '';
    manualDraft.value = { term: '', reading: '', meaning: '' };
    manualDraftId.value = '';
    manualSavedTerm.value = '';
    actionMessage.value = '';
    reviewMessage.value = '';
  }
  // The visible learning workspace owns its read; refresh this shell after
  // leaving learning so both components do not compete for the account fence.
  if (changed || activeView.value !== 'learning') void nextTick(() => loadData());
}

function openMainView(view: MainView | 'review') {
  selectedMainView.value = view === 'review' ? 'saved' : view;
  activeView.value = view;
}

function openSettings() {
  if (activeView.value !== 'settings') settingsReturnView.value = activeView.value;
  activeView.value = 'settings';
}

function closeSettings() {
  activeView.value = settingsReturnView.value;
}

function openPersonalLibrary(wordId?: string) {
  personalReturnView.value = activeView.value;
  personalWordId.value = wordId;
  activeView.value = 'personal';
}

function personalLibraryChanged(next: ExtensionSnapshot) {
  loadSequence++;
  loading.value = false;
  snapshot.value = next;
}

function openIgnoredWords() {
  ignoredReturnView.value = activeView.value;
  activeView.value = 'ignored';
}

function onTabKeydown(event: KeyboardEvent, current: MainView) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const index = mainViews.findIndex(view => view.id === current);
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const next = mainViews[(index + direction + mainViews.length) % mainViews.length];
  openMainView(next.id);
  void nextTick(() => {
    root.value?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  });
}

function runSearch(value = query.value, preserveSource = false) {
  comparisonOpen.value = false;
  const term = value.trim();
  searchError.value = '';
  actionError.value = '';
  actionMessage.value = '';
  manualError.value = '';
  manualSavedTerm.value = '';
  if (!preserveSource) sourceHost.value = '';

  if (!term) {
    query.value = '';
    submittedQuery.value = '';
    manualDraft.value = { term: '', reading: '', meaning: '' };
    manualDraftId.value = '';
    return;
  }

  if (term.length > 80) {
    searchError.value = '请输入 80 个字符以内的词语，再进行查找。';
    return;
  }

  query.value = term;
  submittedQuery.value = term;
  manualDraft.value = { term, reading: '', meaning: '' };
  manualDraftId.value = '';
}

function compareWord(word: DictionaryQuery) {
  comparisonQuery.value = { term: word.term, reading: word.reading, partOfSpeech: word.partOfSpeech };
  comparisonOpen.value = true;
}

function compareDictionaryResult(result: DictionarySearchResult) {
  const draft = dictionaryWord(result.entry, result.term, result.reading);
  compareWord({ term: draft.term, reading: draft.reading, partOfSpeech: draft.partOfSpeech });
}

async function saveDictionaryResult(result: DictionarySearchResult) {
  if (savingWordId.value || savingDictionaryKey.value || !result.reading || !result.meaning) return;
  const key = dictionaryResultKey(result);
  const partition = expectedViewPartition;
  const draft = dictionaryWord(result.entry, result.term, result.reading);
  savingDictionaryKey.value = key;
  actionError.value = '';
  actionMessage.value = '';
  try {
    const id = await dictionaryFavoriteId(result);
    if (partition !== expectedViewPartition) return;
    const word: ExtensionWord = {
      id, lessonId: 'manual-dictionary', order: 0, source: 'manual',
      bookTitle: '我的词条', lessonTitle: '词典收藏', term: draft.term, reading: draft.reading, meaning: draft.meaning,
      ...(draft.partOfSpeech ? { partOfSpeech: draft.partOfSpeech } : {}),
    };
    const next = await extensionApi.save(word, sourceHost.value || undefined);
    if (partition !== expectedViewPartition) return;
    snapshot.value = next;
    savedDictionaryKeys.value = [...new Set([...savedDictionaryKeys.value, key])];
    actionMessage.value = `「${word.term}」已保存到本地生词本。`;
  } catch (error) {
    if (partition === expectedViewPartition) actionError.value = messageFrom(error, '收藏没有完成，请重试。');
  } finally {
    if (partition === expectedViewPartition) savingDictionaryKey.value = '';
  }
}

function onLookupRequest(request: LookupRequest) {
  query.value = request.text;
  sourceHost.value = request.sourceHost ?? '';
  activeView.value = 'lookup';
  selectedMainView.value = 'lookup';
  searchError.value = '';
  void nextTick(() => {
    runSearch(request.text, true);
    searchInput.value?.focus();
  });
}

function domainLabel(host?: string): string {
  if (!host) return '';
  try {
    const url = new URL(host.includes('://') ? host : `https://${host}`);
    return url.hostname || host;
  } catch {
    return host;
  }
}

async function saveCatalogWord(word: ExtensionWord) {
  if (savedIds.value.has(word.id) || savingWordId.value) return;
  savingWordId.value = word.id;
  actionError.value = '';
  actionMessage.value = '';
  try {
    snapshot.value = await extensionApi.save(word, sourceHost.value || undefined);
    actionMessage.value = `「${word.term}」已保存到本地生词本。`;
  } catch (error) {
    actionError.value = messageFrom(error, '保存没有完成，请重试。');
  } finally {
    savingWordId.value = '';
  }
}

function makeManualId() {
  return `manual:${crypto.randomUUID().toLowerCase()}`;
}

async function saveManualWord() {
  if (savingWordId.value) return;
  const term = manualDraft.value.term.trim();
  const reading = manualDraft.value.reading.trim();
  const meaning = manualDraft.value.meaning.trim();
  if (!term || !reading || !meaning) {
    manualError.value = '请填写词语、读音和释义。';
    return;
  }

  const fingerprint = JSON.stringify([term, reading, meaning, sourceHost.value]);
  if (!manualDraftId.value || manualDraftFingerprint.value !== fingerprint) {
    manualDraftId.value = makeManualId();
    manualDraftFingerprint.value = fingerprint;
  }
  const word: ExtensionWord = {
    id: manualDraftId.value,
    lessonId: 'manual',
    term,
    reading,
    meaning,
    order: 0,
    source: 'manual',
    bookTitle: '我的词条',
    lessonTitle: '手动添加',
  };

  savingWordId.value = word.id;
  manualError.value = '';
  actionError.value = '';
  try {
    snapshot.value = await extensionApi.save(word, sourceHost.value || undefined);
    manualSavedTerm.value = term;
    manualDraft.value = { term: '', reading: '', meaning: '' };
    manualDraftId.value = '';
    manualDraftFingerprint.value = '';
  } catch (error) {
    manualError.value = messageFrom(error, '保存没有完成。再次提交会沿用这条词语的本地标识。');
  } finally {
    savingWordId.value = '';
  }
}

function beginRemove(wordId: string) {
  pendingRemoveId.value = wordId;
  savedError.value = '';
}

async function removeSavedWord(wordId: string) {
  if (removingWordId.value) return;
  removingWordId.value = wordId;
  savedError.value = '';
  try {
    snapshot.value = await extensionApi.remove(wordId);
    pendingRemoveId.value = '';
  } catch (error) {
    savedError.value = messageFrom(error, '移除没有完成，请重试。');
  } finally {
    removingWordId.value = '';
  }
}

function cancelRemove() {
  pendingRemoveId.value = '';
  savedError.value = '';
}

function downloadBackup() {
  if (!snapshot.value || downloadingBackup.value) return;
  downloadingBackup.value = true;
  backupMessage.value = '';
  try {
    const backup = {
      format: 'kotobud-extension-backup',
      schema: snapshot.value.schema,
      exportedAt: new Date().toISOString(),
      snapshot: snapshot.value,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kotobud-extension-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    backupMessage.value = '已生成导出文件，请查看浏览器下载。';
  } catch (error) {
    backupMessage.value = messageFrom(error, '备份文件未能生成，请重试。');
  } finally {
    downloadingBackup.value = false;
  }
}

function revealReviewAnswer() {
  if (!currentReview.value || reviewBusy.value) return;
  reviewRevealed.value = true;
  void animateReveal();
}

async function rateCurrent(rating: 1 | 2 | 3 | 4) {
  const current = currentReview.value;
  if (!current || !snapshot.value || !reviewRevealed.value || reviewBusy.value) return;

  let pending = pendingReviewWrite.value;
  if (!pending || pending.wordId !== current.saved.word.id) {
    pending = {
      wordId: current.saved.word.id,
      requestId: crypto.randomUUID(),
      rating,
      expectedReviewCount: current.saved.state.reviewCount,
    };
    pendingReviewWrite.value = pending;
  } else if (pending.rating !== rating) {
    return;
  }

  reviewBusy.value = true;
  reviewError.value = '';
  reviewMessage.value = '';
  try {
    const nextSnapshot = await extensionApi.rate(
      current.saved.word.id,
      pending.rating,
      pending.requestId,
      pending.expectedReviewCount,
    );
    snapshot.value = nextSnapshot;
    sessionReviewedIds.value = new Set(sessionReviewedIds.value).add(current.saved.word.id);
    pendingReviewWrite.value = null;
    reviewMessage.value = '评分已保存，复习时间已更新。';
  } catch (error) {
    reviewError.value = messageFrom(error, '评分没有保存。请重试当前卡片。');
  } finally {
    reviewBusy.value = false;
  }
}

async function refreshReviewCard() {
  if (refreshingReview.value || reviewBusy.value) return;
  const pending = pendingReviewWrite.value;
  refreshingReview.value = true;
  reviewError.value = '';
  try {
    const nextSnapshot = await extensionApi.read();
    snapshot.value = nextSnapshot;
    const refreshed = pending && nextSnapshot.words.find(item => item.word.id === pending.wordId);
    if (pending && refreshed && refreshed.state.reviewCount > pending.expectedReviewCount) {
      sessionReviewedIds.value = new Set(sessionReviewedIds.value).add(pending.wordId);
      reviewMessage.value = '本地复习状态已更新，这张卡片本轮不会重复出现。';
    } else {
      reviewMessage.value = '卡片状态已重新载入，可以继续复习。';
    }
    pendingReviewWrite.value = null;
    reviewRevealed.value = false;
  } catch (error) {
    reviewError.value = messageFrom(error, '卡片状态没有载入，请重试。');
  } finally {
    refreshingReview.value = false;
  }
}

async function setMotion(mode: MotionMode) {
  if (!snapshot.value || savingMotion.value || snapshot.value.preferences.motion === mode) return;
  savingMotion.value = true;
  settingsError.value = '';
  try {
    snapshot.value = await extensionApi.setMotion(mode);
  } catch (error) {
    settingsError.value = messageFrom(error, '设置没有保存，请重试。');
  } finally {
    savingMotion.value = false;
  }
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function savedStatus(item: SavedWord): string {
  switch (classifySaved(item)) {
    case 'new': return '新词';
    case 'due': return '待复习';
    case 'planned': return '已安排';
    case 'learned': return '已学习';
  }
}

function refreshClock() {
  nowMs.value = Date.now();
}

onMounted(() => {
  window.addEventListener('kotobud:account-changed', accountChanged);
  if (typeof BroadcastChannel !== 'undefined') {
    accountChannel = new BroadcastChannel('kotobud-account');
    accountChannel.addEventListener('message', accountChanged);
  }
  lookupUnsubscribe = extensionApi.subscribeLookup(onLookupRequest);
  clockTimer = setInterval(refreshClock, 60_000);
  void loadData();
});

onUnmounted(() => {
  window.removeEventListener('kotobud:account-changed', accountChanged);
  accountChannel?.close();
  lookupUnsubscribe?.();
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<template>
  <div ref="root" class="extension-panel" :class="{ 'motion-reduced': motionMode === 'reduced', 'learning-mode': activeView === 'learning' }">
    <header class="panel-header">
      <a class="brand" href="https://kotobud.com/app/" target="_blank" rel="noreferrer" aria-label="KotoBud 首页">
        <span class="brand-mark" aria-hidden="true">言</span>
        <span class="brand-copy"><strong>KotoBud</strong><small>每天，认识一点日语。</small></span>
      </a>
      <button class="icon-button settings-shortcut" type="button" aria-label="打开设置" @click="openSettings">
        <Settings2 :size="18" aria-hidden="true" />
      </button>
    </header>

    <section v-if="activeView !== 'learning' && activeView !== 'practice'" class="hero-banner" data-motion-enter aria-label="KotoBud 日语词汇侧边栏">
      <div class="hero-copy">
        <p class="hero-kicker"><span class="hero-dot"></span> KOTOBUD / 今日、少しずつ。</p>
        <h1 v-if="activeView === 'settings'">设置与关于<span class="heading-star" aria-hidden="true"> ✳</span></h1>
        <h1 v-else-if="activeView === 'stats'">每一点积累，都算数。</h1>
        <h1 v-else-if="activeView === 'saved' || activeView === 'review'">把遇见的词收好。</h1>
        <h1 v-else>今天，也学一点吧。</h1>
        <p class="hero-subtitle">{{ activeView === 'settings' ? '把学习节奏，调成你喜欢的样子。' : activeView === 'stats' ? '看看最近的学习节奏，也看看当前词书的进度。' : activeView === 'saved' || activeView === 'review' ? '一词一句，慢慢积累。' : '查一个词，或继续你的词书。' }}</p>
      </div>
      <div class="hero-seal" aria-hidden="true">
        <Sparkles class="seal-sparkle" :size="17" :stroke-width="1.8" />
        <span class="seal-character">言</span>
        <span class="seal-caption">ことば</span>
      </div>
      <span class="hero-orbit orbit-one" aria-hidden="true"></span>
      <span class="hero-orbit orbit-two" aria-hidden="true"></span>
      <span class="hero-grain" aria-hidden="true"></span>
    </section>

    <div v-if="loading && !snapshot" class="bootstrap-state" role="status" aria-live="polite">
      <LoaderCircle class="spin" :size="20" aria-hidden="true" />
      <span>正在打开本地词库…</span>
    </div>

    <section v-else-if="!snapshot" class="bootstrap-error" role="alert">
      <div class="state-icon state-icon-error"><RotateCcw :size="20" aria-hidden="true" /></div>
      <h2>本地数据暂时无法读取</h2>
      <p>{{ loadError || '请检查后重试。' }}</p>
      <button class="primary-button" type="button" :disabled="loading" @click="loadData">
        <LoaderCircle v-if="loading" class="spin" :size="16" aria-hidden="true" />
        <RotateCcw v-else :size="16" aria-hidden="true" />
        重试
      </button>
    </section>

    <template v-else>
      <div v-if="loadError" class="inline-alert" role="status">
        <span>{{ loadError }}</span>
        <button type="button" class="text-button" :disabled="loading" @click="loadData">重试</button>
      </div>

      <main class="view-area">
        <KeepAlive>
          <LearningWorkspace v-if="activeView === 'learning'" id="learning-panel" role="tabpanel" aria-labelledby="tab-learning" :launch-request="learningLaunch" @practice="openPractice" @personal="openPersonalLibrary" @ignored="openIgnoredWords" />
        </KeepAlive>
        <PersonalLibraryWorkspace v-if="activeView === 'personal'" :key="snapshot.identity?.partitionKey ?? 'local'" :snapshot="snapshot" :catalog="catalog" :initial-word-id="personalWordId" @changed="personalLibraryChanged" @back="activeView = personalReturnView" @practice-context="startPersonalContextPractice" />
        <IgnoredWordsWorkspace v-if="activeView === 'ignored'" :key="snapshot.identity?.partitionKey ?? 'local'" :snapshot="snapshot" :catalog="catalog" @changed="personalLibraryChanged" @back="activeView = ignoredReturnView" />
        <KeepAlive><PracticeWorkspace v-if="activeView === 'practice'" :catalog="catalog" :snapshot="snapshot" :owner="snapshot.identity?.partitionKey ?? 'local'" v-model:initialTool="practiceTool" :verb-id="practiceVerbId" :scene-id="practiceSceneId" @close="openMainView(practiceReturnView)" @practice="startScenePractice" /></KeepAlive>
        <LearningStatistics v-if="activeView === 'stats'" id="stats-panel" role="tabpanel" aria-labelledby="tab-stats" :catalog="catalog" :snapshot="snapshot" :now-ms="nowMs" @practice="startHistoricalPractice" />
        <section v-show="activeView === 'lookup'" id="lookup-panel" class="view-panel" role="tabpanel" aria-labelledby="tab-lookup" tabindex="0">
          <section v-if="activeBook && !submittedQuery" class="today-plan-card" aria-labelledby="today-book-title" data-motion-enter>
            <div class="today-plan-heading"><p class="eyebrow">今日の手帖</p><button type="button" class="text-button" aria-label="调整首页展示" @click="openSettings">调整展示</button></div>
            <div class="today-plan-content"><div><h2 id="today-book-title">{{ homeLabel }}</h2><p class="today-plan-number">{{ homeNumber }}<span>{{ homeDisplay === 'progress' ? '%' : '词' }}</span></p></div><div class="today-plan-seal" aria-hidden="true"><strong>言</strong><small>ことば</small></div></div>
            <p class="today-plan-description">{{ homeDescription }}</p>
            <div class="today-plan-meta"><span>{{ activeBook.title }}</span><span>{{ homePaceLabel }}</span></div>
            <div class="today-plan-actions"><button class="primary-button" type="button" @click="startHomePlan"><BookOpen :size="16" aria-hidden="true" />{{ primaryHomeLabel }}<ChevronRight :size="16" aria-hidden="true" /></button><button class="secondary-button" type="button" @click="launchLearning('library')">词书与课次</button></div>
          </section>
          <section v-if="resumeWords.length && !submittedQuery" class="resume-study-card" aria-label="继续上次学习">
            <div><strong>继续上次学习</strong><p>{{ displayBookTitle(resumeWords[0].word) }} · 还有 {{ resumeWords.length }} 词未评分</p></div><button class="secondary-button" type="button" @click="launchLearning('resume')">继续<ChevronRight :size="15" aria-hidden="true" /></button>
          </section>
          <div v-if="!submittedQuery" class="practice-entry-grid" aria-label="换一种方式练日语"><button class="open-scenes" type="button" @click="openPractice('scenes')"><strong>场景学习</strong><span>在生活里认词、接话</span><ChevronRight :size="16" aria-hidden="true" /></button><button class="open-conjugation" type="button" @click="openPractice('conjugation')"><strong>动词活用</strong><span>让动作换一种表达</span><ChevronRight :size="16" aria-hidden="true" /></button></div>
          <div class="view-heading" data-motion-enter>
            <div>
              <p class="eyebrow">词库与通用词典<span class="eyebrow-dot">·</span>{{ catalogReady ? `${catalog.length.toLocaleString('zh-CN')} 条离线词汇` : '等待读取' }}</p>
              <h2>查一查</h2>
            </div>
            <div class="heading-icon"><Search :size="20" aria-hidden="true" /></div>
          </div>

          <form class="search-form" role="search" @submit.prevent="runSearch()">
            <label class="sr-only" for="word-search">搜索日语词语、读音或中文释义</label>
            <Search class="search-field-icon" :size="18" aria-hidden="true" />
            <input
              id="word-search"
              ref="searchInput"
              v-model="query"
              type="search"
              maxlength="80"
              autocomplete="off"
              enterkeyhint="search"
              placeholder="输入日语、读音或中文释义"
            />
            <button class="search-submit" type="submit" aria-label="查找">
              <Search :size="17" aria-hidden="true" />
              <span>查找</span>
            </button>
          </form>

          <p v-if="sourceHost" class="lookup-origin" role="status">
            <Globe2 :size="14" aria-hidden="true" />
            <span>所选文字来自 {{ domainLabel(sourceHost) }}</span>
            <button type="button" class="clear-origin" aria-label="清除来源网站" @click="sourceHost = ''"><X :size="14" /></button>
          </p>
          <p v-if="searchError" class="field-error" role="alert">{{ searchError }}</p>
          <div v-if="actionError" class="inline-alert error-alert" role="alert">{{ actionError }}</div>
          <p v-if="actionMessage" class="success-note" role="status"><Check :size="15" aria-hidden="true" />{{ actionMessage }}</p>

          <div v-if="!submittedQuery" class="search-intro" data-motion-enter>
            <div class="intro-mark"><BookOpen :size="21" aria-hidden="true" /></div>
            <h3>查一查日语词汇</h3>
            <p>离线词库支持汉字、假名与中文释义。通用词典可联网查询日语词形与读音，也可选中网页文字后右键查词。</p>
            <p v-if="!catalogReady" class="muted-inline">词库尚未载入。<button class="text-button" type="button" :disabled="loading" @click="loadData">重试</button></p>
            <div class="sample-area">
              <span>试着查</span>
              <div class="sample-chips">
                <button v-for="sample in samples" :key="sample" type="button" @click="runSearch(sample)">{{ sample }}<ChevronRight :size="13" aria-hidden="true" /></button>
              </div>
            </div>
          </div>

          <div v-else class="search-results" aria-live="polite">
            <div class="result-heading" data-motion-enter>
              <div><p class="eyebrow">词书结果</p><h3>{{ submittedQuery }}</h3></div>
              <span v-if="catalogReady" class="result-count">{{ searchResults.length }} 条</span>
            </div>

            <div v-if="!catalogReady" class="empty-card" role="status">
              <div class="state-icon"><BookOpen :size="20" aria-hidden="true" /></div>
              <h3>词库暂不可用</h3>
              <p>检查后重试，或稍后再次搜索。</p>
              <button class="secondary-button" type="button" :disabled="loading" @click="loadData"><RotateCcw :size="15" />重试</button>
            </div>

            <template v-else-if="searchResults.length">
              <article v-for="word in searchResults" :key="word.id" class="word-card" data-motion-enter>
                <div class="word-card-top">
                  <div class="word-heading">
                    <h4 lang="ja">{{ word.term }}</h4>
                    <span v-if="word.partOfSpeech" class="part-of-speech">{{ word.partOfSpeech }}</span>
                  </div>
                  <span class="source-tag">{{ word.source === 'manual' ? '手动词条' : '教材词库' }}</span>
                </div>
                <p class="word-reading" lang="ja">{{ word.reading }}</p>
                <MeaningPreview :word="word" />
                <WordLearningNotes :word="word" :voice="snapshot.preferences.voice" @conjugation="openPractice('conjugation', $event)" />
                <button class="dictionary-entry-button" type="button" @click="openPersonalLibrary(word.id)"><Bookmark :size="15" aria-hidden="true" />{{ word.readingContexts?.length ? '管理原句' : '记录原句' }}<ChevronRight :size="15" aria-hidden="true" /></button>
                <button class="dictionary-entry-button" type="button" @click="compareWord(word)"><BookOpen :size="15" aria-hidden="true" />词典对照<ChevronRight :size="15" aria-hidden="true" /></button>
                <div class="word-card-bottom">
                  <span class="book-source"><BookOpen :size="13" aria-hidden="true" />{{ displayBookTitle(word) }}<span class="source-separator">/</span>{{ word.lessonTitle }}</span>
                  <button
                    v-if="savedIds.has(word.id)"
                    class="saved-button is-saved"
                    type="button"
                    disabled
                    :aria-label="`${word.term}已在生词本`"
                  ><Check :size="15" aria-hidden="true" />已收好</button>
                  <button
                    v-else
                    class="saved-button"
                    type="button"
                    :disabled="Boolean(savingWordId)"
                    :aria-label="`收藏 ${word.term}`"
                    @click="saveCatalogWord(word)"
                  ><LoaderCircle v-if="savingWordId === word.id" class="spin" :size="15" aria-hidden="true" /><Bookmark v-else :size="15" aria-hidden="true" />收藏</button>
                </div>
              </article>
            </template>

            <template v-else>
              <div class="not-found-card" data-motion-enter>
                <div class="not-found-head">
                  <div class="state-icon"><Search :size="20" aria-hidden="true" /></div>
                  <div><span class="eyebrow">离线词库</span><h3>词书里暂未找到「{{ submittedQuery }}」</h3></div>
                </div>
                <p>离线词库没有匹配项。下方也会查询通用词典；你可以填写读音和释义，把自己的词条保存在本机。</p>
              </div>

              <details class="manual-entry-disclosure"><summary>填写自己的词条<ChevronRight :size="16" aria-hidden="true" /></summary>
              <form class="manual-form" @submit.prevent="saveManualWord">
                <div class="manual-form-title">
                  <div><span class="eyebrow">本地保存</span><h3>手动添加词条</h3></div>
                  <span class="manual-pill">自定义</span>
                </div>
                <label>词语
                  <input v-model="manualDraft.term" :disabled="!!savingWordId" type="text" maxlength="80" autocomplete="off" required placeholder="例如：言葉" />
                </label>
                <label>读音
                  <input v-model="manualDraft.reading" :disabled="!!savingWordId" type="text" maxlength="100" autocomplete="off" required placeholder="例如：ことば" />
                </label>
                <label>释义
                  <textarea v-model="manualDraft.meaning" :disabled="!!savingWordId" rows="2" maxlength="500" required placeholder="写下自己的释义" />
                </label>
                <p v-if="manualError" class="field-error" role="alert">{{ manualError }}</p>
                <p v-if="manualSavedTerm" class="success-note" role="status"><Check :size="15" aria-hidden="true" />「{{ manualSavedTerm }}」已保存在本地生词本。</p>
                <button class="primary-button manual-submit" type="submit" :disabled="Boolean(savingWordId)">
                  <LoaderCircle v-if="savingWordId.startsWith('manual:')" class="spin" :size="16" aria-hidden="true" />
                  <Bookmark v-else :size="16" aria-hidden="true" />
                  保存到生词本
                </button>
              </form>
              </details>
            </template>
          </div>
          <DictionaryLookupResults v-if="submittedQuery" :query="submittedQuery" :owner="snapshot.identity?.partitionKey ?? 'guest'" :saving-key="savingDictionaryKey" :saved-keys="savedDictionaryKeys" :saved-word-ids="[...savedIds]" @compare="compareDictionaryResult" @save="saveDictionaryResult" />
        </section>

        <section v-show="activeView === 'saved'" id="saved-panel" class="view-panel" role="tabpanel" aria-labelledby="tab-saved" tabindex="0">
          <div class="view-heading" data-motion-enter>
            <div><p class="eyebrow">保存在本机，也可登录后同步</p><h2>生词本</h2></div>
            <button class="export-button" type="button" :disabled="downloadingBackup" @click="downloadBackup">
              <LoaderCircle v-if="downloadingBackup" class="spin" :size="15" aria-hidden="true" />
              <Download v-else :size="15" aria-hidden="true" />
              <span>导出备份</span>
            </button>
          </div>

          <div class="saved-summary" data-motion-enter>
            <div class="summary-total"><strong>{{ savedWords.length }}</strong><span>已收藏</span></div>
            <div><strong>{{ savedNewCount }}</strong><span>新词</span></div>
            <div><strong>{{ savedDueCount }}</strong><span>待复习</span></div>
          </div>
          <button class="secondary-button saved-review-shortcut" type="button" :disabled="!savedWords.length" @click="openMainView('review')"><RotateCcw :size="16" aria-hidden="true" />复习生词本 · {{ savedDueCount }} 待复习 · {{ savedNewCount }} 新词</button>
          <button class="secondary-button ignored-entry" type="button" @click="openIgnoredWords"><RotateCcw :size="15" aria-hidden="true" />查看忽略词，恢复学习</button>
          <p v-if="backupMessage" class="success-note" role="status"><Check :size="15" aria-hidden="true" />{{ backupMessage }}</p>
          <p class="privacy-hint"><ShieldCheck :size="14" aria-hidden="true" />备份文件由你下载到本机，不会自动上传或同步。</p>
          <div v-if="savedError" class="inline-alert error-alert" role="alert">{{ savedError }}</div>

          <div v-if="!savedWords.length" class="empty-card saved-empty" data-motion-enter>
            <div class="state-icon"><Bookmark :size="20" aria-hidden="true" /></div>
            <h3>生词本还是空的</h3>
            <p>查到想记住的词，点一下收藏，就会出现在这里。</p>
            <button class="secondary-button" type="button" @click="openMainView('lookup')"><Search :size="15" aria-hidden="true" />去查词</button>
          </div>

          <div v-else class="saved-list">
            <article v-for="item in savedWords" :key="item.word.id" class="saved-card" data-motion-enter>
              <div class="saved-card-top">
                <div class="word-heading">
                  <h3 lang="ja">{{ item.word.term }}</h3>
                  <span :class="['status-tag', `status-${classifySaved(item)}`]">{{ savedStatus(item) }}</span>
                </div>
                <span class="part-of-speech">{{ item.word.source === 'manual' ? '手动词条' : '教材词库' }}</span>
              </div>
              <p class="word-reading" lang="ja">{{ item.word.reading }}</p>
              <MeaningPreview :word="item.word" />
              <div class="saved-card-meta">
                <span><BookOpen :size="13" aria-hidden="true" />{{ displayBookTitle(item.word) }}<span class="source-separator">/</span>{{ item.word.lessonTitle }}</span>
                <span v-if="item.sourceHost"><Globe2 :size="13" aria-hidden="true" />{{ domainLabel(item.sourceHost) }}</span>
              </div>
              <div v-if="pendingRemoveId === item.word.id" class="remove-confirm" role="group" :aria-label="`确认移除${item.word.term}`">
                <span>从本地生词本移除？</span>
                <button class="confirm-remove" type="button" :disabled="removingWordId === item.word.id" @click="removeSavedWord(item.word.id)">
                  <LoaderCircle v-if="removingWordId === item.word.id" class="spin" :size="14" aria-hidden="true" />
                  <Check v-else :size="14" aria-hidden="true" />确定
                </button>
                <button class="cancel-remove" type="button" :disabled="removingWordId === item.word.id" @click="cancelRemove"><X :size="14" aria-hidden="true" />取消</button>
              </div>
              <div v-else class="saved-card-actions">
                <span class="saved-date">保存于 {{ new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(item.savedAt)) }}</span>
                <button class="remove-button" type="button" :aria-label="`移除${item.word.term}`" @click="beginRemove(item.word.id)"><Trash2 :size="14" aria-hidden="true" />移除</button>
              </div>
            </article>
          </div>
        </section>

        <section v-show="activeView === 'review'" id="review-panel" class="view-panel" role="tabpanel" aria-labelledby="tab-saved" tabindex="0">
          <div class="view-heading" data-motion-enter>
            <div><p class="eyebrow">生词本 / FSRS</p><h2 id="saved-review-title">复习一下</h2></div>
            <button class="back-button" type="button" @click="openMainView('saved')"><ArrowLeft :size="15" aria-hidden="true" />返回生词本</button>
          </div>

          <template v-if="currentReview">
            <div class="review-meta" data-motion-enter>
              <span :class="['review-kind', currentReview.kind === 'due' ? 'kind-due' : 'kind-new']">{{ currentReview.kind === 'due' ? '到期复习' : '新词预览' }}</span>
              <span><Sparkles :size="13" aria-hidden="true" />评分后自动安排</span>
            </div>
            <article class="review-card" data-motion-enter>
              <div class="review-card-decoration" aria-hidden="true"></div>
              <div class="review-card-content">
                <p class="review-prompt">先看词形与读音</p>
                <p class="review-reading" lang="ja">{{ currentReview.saved.word.reading }}</p>
                <h3 lang="ja">{{ currentReview.saved.word.term }}</h3>
                <button v-if="!reviewRevealed" class="reveal-button" type="button" @click="revealReviewAnswer">
                  <BookOpen :size="16" aria-hidden="true" />查看释义
                </button>
                <div v-else class="review-answer" data-motion-reveal>
                  <span class="answer-label">释义</span>
                  <MeaningPreview :word="currentReview.saved.word" />
                  <span class="answer-source"><BookOpen :size="13" aria-hidden="true" />{{ currentReview.saved.word.bookTitle }}<span class="source-separator">/</span>{{ currentReview.saved.word.lessonTitle }}</span>
                  <button class="dictionary-entry-button" type="button" @click="compareWord(currentReview.saved.word)"><BookOpen :size="15" aria-hidden="true" />词典对照<ChevronRight :size="15" aria-hidden="true" /></button>
                </div>
              </div>
            </article>

            <div v-if="reviewError" class="inline-alert error-alert review-error-alert" role="alert">
              <span>{{ reviewError }} 可重试原评分，或重新载入卡片确认本地状态。</span>
              <button class="refresh-review-button" type="button" :disabled="reviewBusy || refreshingReview" @click="refreshReviewCard">
                <LoaderCircle v-if="refreshingReview" class="spin" :size="14" aria-hidden="true" />
                <RotateCcw v-else :size="14" aria-hidden="true" />重新载入卡片
              </button>
            </div>
            <p v-if="reviewMessage" class="success-note" role="status"><Check :size="15" aria-hidden="true" />{{ reviewMessage }}</p>
            <div class="rating-block">
              <p>看过释义后，选择这次的记忆感受</p>
              <div class="rating-grid" role="group" aria-label="记忆评分">
                <button
                  v-for="rating in ratings"
                  :key="rating.value"
                  type="button"
                  :class="['rating-button', `rating-${rating.value}`]"
                  :disabled="!reviewRevealed || reviewBusy || refreshingReview || (pendingReviewWrite?.wordId === currentReview.saved.word.id && pendingReviewWrite.rating !== rating.value)"
                  @click="rateCurrent(rating.value)"
                >
                  <LoaderCircle v-if="reviewBusy" class="spin rating-loader" :size="14" aria-hidden="true" />
                  <strong>{{ rating.label }}</strong><small>{{ rating.sublabel }}</small>
                </button>
              </div>
              <p class="rating-footnote">每次评分会保存新的 FSRS 复习时间。</p>
            </div>
          </template>

          <section v-else class="review-complete" data-motion-enter aria-live="polite">
            <div class="completion-mark"><Check :size="24" aria-hidden="true" /></div>
            <p class="eyebrow">{{ reviewedThisSession ? '这一轮完成了' : '暂时没有待复习词条' }}</p>
            <h3>{{ reviewedThisSession ? `已完成 ${reviewedThisSession} 张卡片` : '你的卡片都在合适的时间' }}</h3>
            <p v-if="reviewedThisSession" class="completion-copy">评分已保存在本机。你可以继续查词，新的收藏会加入复习队列。</p>
            <p v-else class="completion-copy">新收藏会先作为新词出现；学过的词到期后会回到这里。</p>
            <div class="schedule-note">
              <Sparkles :size="16" aria-hidden="true" />
              <span>{{ nextScheduledReview ? `最近的下一次复习：${nextScheduledReview}` : 'FSRS 会根据每次评分安排下次复习。' }}</span>
            </div>
            <button class="secondary-button" type="button" @click="openMainView('lookup')"><Search :size="15" aria-hidden="true" />查找新词</button>
          </section>
        </section>

        <section v-if="activeView === 'settings'" class="view-panel settings-panel" aria-labelledby="settings-heading" tabindex="0">
          <div class="view-heading settings-heading" data-motion-enter>
            <div><p class="eyebrow">偏好与关于</p><h2 id="settings-heading">设置</h2></div>
            <button class="back-button" type="button" @click="closeSettings"><ArrowLeft :size="15" aria-hidden="true" />返回</button>
          </div>

          <AccountPanel />

          <section class="settings-card" data-motion-enter><HomeDisplayPreferences /></section>

          <section class="settings-card" data-motion-enter aria-labelledby="answer-sound-title"><AnswerSoundPreferences /></section>

          <section class="settings-card" data-motion-enter aria-labelledby="auto-pronunciation-title"><AutoPronunciationPreferences /></section>

          <section class="settings-card" data-motion-enter><DictionaryPreferences /></section>

          <section class="settings-card" data-motion-enter aria-labelledby="motion-title">
            <div class="settings-card-header"><span class="settings-card-badge" aria-hidden="true"><Sparkles :size="18" /></span><div class="setting-copy">
              <span class="settings-kicker">01 / MOTION</span>
              <h3 id="motion-title">动态效果</h3>
              <p>系统启用减少动态效果时，动画也会自动静止。</p>
            </div></div>
            <div class="motion-options" role="group" aria-label="动态效果偏好">
              <button type="button" :aria-pressed="motionMode === 'standard'" :disabled="savingMotion" @click="setMotion('standard')">标准</button>
              <button type="button" :aria-pressed="motionMode === 'reduced'" :disabled="savingMotion" @click="setMotion('reduced')">减少</button>
            </div>
            <p v-if="settingsError" class="field-error" role="alert">{{ settingsError }}</p>
          </section>

          <section class="settings-card about-card" data-motion-enter aria-labelledby="about-title">
            <div class="settings-card-header"><span class="settings-card-badge" aria-hidden="true"><BookOpen :size="18" /></span><div class="setting-copy"><span class="settings-kicker">02 / YOUR SPACE</span><h3 id="about-title">关于 KotoBud</h3><p>轻轻收集，慢慢记住。</p></div></div>
            <dl class="about-list">
              <div><dt>版本</dt><dd>{{ version }}</dd></div>
              <div><dt>词库</dt><dd>本地词书与联网通用词典</dd></div>
              <div><dt>数据</dt><dd>保存在本机扩展存储</dd></div>
              <div><dt>同步</dt><dd>登录后可在设置中手动同步</dd></div>
            </dl>
          </section>

          <section class="privacy-card" data-motion-enter aria-labelledby="privacy-title">
            <span class="settings-kicker">03 / PRIVACY</span>
            <div class="privacy-title"><ShieldCheck :size="17" aria-hidden="true" /><h3 id="privacy-title">浏览与隐私</h3></div>
            <p>通过右键菜单发起查词时，扩展接收所选文字和来源域名。词库与学习记录保存在本机；提交通用词典查询、打开词典对照或播放教材发音时，会从 kotobud.com 获取对应资料。登录后可在设置中手动同步进度。</p>
            <a href="https://kotobud.com/app/" target="_blank" rel="noreferrer">访问 KotoBud <ExternalLink :size="13" aria-hidden="true" /></a>
          </section>

          <p class="settings-local-note">手动词条和教材词条使用相同的本地复习流程。账号与云同步统一在这里管理。</p>
        </section>
      </main>

      <nav class="tab-bar" role="tablist" aria-label="主要功能">
        <button
          v-for="tab in mainViews"
          :id="`tab-${tab.id}`"
          :key="tab.id"
          :data-tab="tab.id"
          type="button"
          role="tab"
          :aria-selected="selectedMainView === tab.id"
          :aria-controls="tab.id === 'saved' && activeView === 'review' ? 'review-panel' : `${tab.id}-panel`"
          :tabindex="selectedMainView === tab.id ? 0 : -1"
          @click="openMainView(tab.id)"
          @keydown="onTabKeydown($event, tab.id)"
        >
          <component :is="tab.icon" :size="18" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ tab.label }}</span>
          <i v-if="selectedMainView === tab.id" class="tab-indicator" aria-hidden="true"></i>
        </button>
      </nav>

      <footer class="panel-footer">
        <span><span class="local-indicator"></span>数据保存在本机</span>
        <span>v{{ version }}<span class="footer-separator">·</span><button class="text-button" type="button" @click="openSettings">账号与同步</button></span>
      </footer>
    </template>
    <DictionaryComparisonPanel :open="comparisonOpen" :term="comparisonQuery.term" :reading="comparisonQuery.reading" :part-of-speech="comparisonQuery.partOfSpeech" :owner="snapshot?.identity?.partitionKey ?? 'guest'" @close="comparisonOpen = false" />
  </div>
</template>
