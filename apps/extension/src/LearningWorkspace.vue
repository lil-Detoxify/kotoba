<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FileUp,
  Flag,
  Headphones,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from 'lucide-vue-next';
import { createQuestion, quizAttempt, quizRating, toHiragana, type Question } from '@jp/core';
import type { QuizAttempt, QuizType } from '@jp/models';
import extensionPackage from '../package.json';
import { extensionApi } from './client';
import { studyHref, grammarHref, grammarForExtensionVocabulary } from './study/navigation';
import { extensionContentWords, personalLibraryData } from './personal-library';
import { createExtensionPronunciation } from './audio';
import { bookIdForWord, buildStudyQueue, listLearningBooks, summarizeLearning } from './learning';
import { useExtensionMotion } from './motion';
import ExtensionBookCover from './components/ExtensionBookCover.vue';
import DictionaryComparisonPanel from './components/DictionaryComparisonPanel.vue';
import MeaningPreview from '../../web/src/components/MeaningPreview.vue';
import KanaInputQuestion from '../../web/src/components/KanaInputQuestion.vue';
import ExtensionSentenceCloze from './components/ExtensionSentenceCloze.vue';
import WordLearningNotes from './components/WordLearningNotes.vue';
import StudySessionSummary from './components/StudySessionSummary.vue';
import WeakPracticeSuggestions from './components/WeakPracticeSuggestions.vue';
import { extensionSessionSummary, extensionWeakPracticeSuggestions, feedbackPracticeQueue, type ExtensionSessionReceipt } from './study-feedback';
import { extensionPracticeFeedback } from './library-reports';
import { createInputQuestion, inputAttempt, type InputQuestion } from '../../web/src/services/kana-input';
import { createSentenceCloze, matchesClozeExample, type ClozeQuestion } from '../../web/src/services/sentence-cloze';
import { contextClozeExample } from '../../web/src/services/personal-learning-example';
import { wordReadingContexts } from '../../web/src/services/reading-context';
import { lessonPracticeRecommendation, type LessonPracticeRecommendation } from '../../web/src/services/lesson-practice-recommendation';
import { meaningOptionLabels } from '../../web/src/services/meaning-presentation';
import { loadBookLearningExamples } from '../../web/src/services/book-learning-examples';
import { playAnswerSound, stopAnswerSound } from './answer-sound';
import { bookCategory, fullBookTitle } from './book-presentation';
import { extensionLibraryProgress } from './learning-analytics';
import { extensionDailyStudyPlan } from './daily-study-plan';
import { useStudyPlanPreference, type DailyPace } from './study-plan-preference';
import { useAutoPronunciationPreference } from './auto-pronunciation-preference';
import { readStudyCheckpoint, writeStudyCheckpoint, resolveStudyCheckpoint, type ExtensionStudyCheckpoint } from './study-checkpoint';
import { sceneStudyQueue, sceneExampleFor, sceneFor } from './learning-content';
import type { ExtensionBook, ExtensionSnapshot, ExtensionWord, LearningLaunchRequest, LearningMode, MotionMode, StudyQueueItem, ExtensionExerciseType as ExerciseType } from './model';

type WorkspacePage = 'home' | 'study' | 'summary';
type Grade = 1 | 2 | 3 | 4;
interface LessonOption { id: string; title: string; order: number; wordCount: number }
interface SessionResult extends ExtensionSessionReceipt { correct: boolean | null; rating: Grade }
interface IgnoredCard { item: StudyQueueItem; index: number }
const props = defineProps<{ launchRequest?: LearningLaunchRequest | null }>();
const emit = defineEmits<{ practice: [tool: 'scenes' | 'conjugation', verbId?: string, sceneId?: string]; personal: [wordId?: string]; ignored: [] }>();
let handledLaunchId = 0;

const grades: Array<{ value: Grade; title: string; english: string }> = [
  { value: 1, title: '没记住', english: 'Again' },
  { value: 2, title: '有点难', english: 'Hard' },
  { value: 3, title: '记住了', english: 'Good' },
  { value: 4, title: '很熟', english: 'Easy' },
];
const exerciseChoices: Array<{ value: ExerciseType; title: string; detail: string }> = [
  { value: 'card', title: '翻卡学习', detail: '词形 ↔ 释义' },
  { value: 'kana-meaning', title: '假名选释义', detail: '读音 → 中文' },
  { value: 'kanji-reading', title: '汉字选读音', detail: '词形 → 假名' },
  { value: 'audio-meaning', title: '听音选释义', detail: '听发音 → 中文' },
  { value: 'mixed', title: '混合练习', detail: '按卡片切换题型' },
  { value: 'kana-input', title: '假名键入', detail: '用键盘写出读音' },
  { value: 'dictation', title: '听写', detail: '听发音，写出假名' },
  { value: 'sentence-cloze', title: '例句填空', detail: '在语境中回忆这个词' },
];
const studyModes: Array<{ value: LearningMode; title: string; description: string }> = [
  { value: 'new', title: '学习新词', description: '从未学过的词开始' },
  { value: 'review', title: '到期复习', description: '按 FSRS 到期时间排列' },
  { value: 'difficult', title: '难词练习', description: '重练已标记的词' },
];

const root = ref<HTMLElement | null>(null);
const page = ref<WorkspacePage>('home');
const loading = ref(true);
const loadError = ref('');
const catalogError = ref('');
const actionError = ref('');
const actionMessage = ref('');
const snapshot = ref<ExtensionSnapshot | null>(null);
const catalogWords = ref<ExtensionWord[]>([]);
const selectedMode = ref<LearningMode>('new');
const newTarget = ref(10);
const expandedBookIds = ref(new Set<string>());
const visibleLessonCount = ref(6);
const selectedLessonIds = ref<string[] | null>(null);
const lessonRanges = reactive<Record<string, { from: string; to: string }>>({});
const selectedFile = ref<File | null>(null);
const importTitle = ref('');
const importing = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const goalInput = ref(20);
const savingGoal = ref(false);
const queue = ref<StudyQueueItem[]>([]);
const index = ref(0);
const sessionMode = ref<LearningMode>('new');
const sessionDailyBookId = ref<string | undefined>();
const sessionSceneId = ref<string | undefined>();
const sessionReadingContextIds = ref<Record<string, string>>({});
const sessionExerciseOverride = ref<ExerciseType | null>(null);
const sessionFeedbackPractice = ref(false);
const activeScene = computed(() => sceneFor(sessionSceneId.value));
const savedCheckpoint = ref<ExtensionStudyCheckpoint | null>(null);
const planPreference = useStudyPlanPreference();
const autoPronunciationPreference = useAutoPronunciationPreference();
const autoPronunciationEnabled = autoPronunciationPreference.enabled;
const planNow = ref(Date.now());
const sessionResults = ref<SessionResult[]>([]);
const historyWords = ref<ExtensionWord[]>([]);
const reviewIndex = ref<number | null>(null);
let reviewStartedAt = 0;
const sessionSkipped = ref(0);
const sessionStartedAt = ref(0);
const summaryDurationMs = ref(0);
let summaryPausedAt = 0;
const busy = ref(false);
const queueBusy = ref(false);
const revealed = ref(false);
const comparisonOpen = ref(false);
const reverseCard = ref(false);
const activeQuestion = ref<Question | null>(null);
const activeQuestionType = ref<QuizType | null>(null);
const inputQuestion = ref<InputQuestion | null>(null);
const inputValue = ref('');
const clozeQuestion = ref<ClozeQuestion | null>(null);
const clozeValue = ref('');
const objectiveQuestion = computed(() => activeQuestion.value ?? inputQuestion.value);
const clozeMatches = computed(() => !!clozeQuestion.value && matchesClozeExample(clozeQuestion.value, clozeValue.value));
const attempt = ref<QuizAttempt | null>(null);
const attemptRequestId = ref('');
const attemptElapsedMs = ref<number | null>(null);
const attemptSaved = ref(false);
const attemptBusy = ref(false);
const attemptError = ref('');
const pendingGrade = ref<Grade | null>(null);
const pendingGradeRequestId = ref('');
const pendingGradeExpectedCount = ref<number | null>(null);
const pendingGradeElapsedMs = ref<number | null>(null);
const gradeError = ref('');
const staleReview = ref(false);
const lastIgnored = ref<IgnoredCard | null>(null);
const hasHeardAudio = ref(false);
const audioNotice = ref('');
const elapsedMs = ref(0);
let clockTimer: ReturnType<typeof setInterval> | undefined;
let cardStartedAt = 0;
let loadSequence = 0;
let refreshSequence = 0;
let workspaceVisible = true;
let suspendedAt = 0;
let snapshotReadGeneration = 0;
let autoSpeechHandled = new Set<string>();
let autoSpeechGeneration = 0;
let autoSpeechPending = false;
let autoSpeechPlaybackPending = false;
let autoSpeechTimer: ReturnType<typeof setTimeout> | undefined;

const motionMode = computed<MotionMode>(() => snapshot.value?.preferences.motion ?? 'standard');
const { animateView, animateReveal } = useExtensionMotion(root, motionMode);
const pronunciation = createExtensionPronunciation();
const { play, stop, prefetch, clearPrefetch, setVoice: setAudioVoice, voice, playing, error: audioError } = pronunciation;
const audioSource = pronunciation.sourceLabel ?? ref('');

const learningWords = computed(() => {
  return snapshot.value ? extensionContentWords(snapshot.value, catalogWords.value) : catalogWords.value;
});
const learningBooks = computed(() => listLearningBooks(learningWords.value, snapshot.value?.learning.books ?? []).map(book => ({ ...book, title: fullBookTitle(book) })));
const bookIds = computed(() => learningBooks.value.map(book => book.id));
const category = ref<'all' | 'textbook' | 'jlpt' | 'custom'>('all');
const categories = [{ id: 'all', label: '全部' }, { id: 'textbook', label: '教材' }, { id: 'jlpt', label: 'JLPT' }, { id: 'custom', label: '我的词书' }] as const;
const visibleBooks = computed(() => category.value === 'all' ? learningBooks.value : learningBooks.value.filter(book => bookCategory(book) === category.value));
const libraryProgress = computed(() => snapshot.value ? extensionLibraryProgress(learningWords.value, snapshot.value) : null);
const activeBookId = computed(() => {
  const saved = snapshot.value?.learning.userSettings?.currentBookId || snapshot.value?.preferences.selectedBookIds[0];
  return saved && bookIds.value.includes(saved) ? saved : bookIds.value.includes('biaori-beginner-upper') ? 'biaori-beginner-upper' : bookIds.value[0];
});
const activeBookProgress = computed(() => libraryProgress.value?.books.find(book => book.id === activeBookId.value));
const dailyPace = computed(() => planPreference.getPace(activeBookId.value ?? ''));
const dailyPlan = computed(() => snapshot.value && activeBookId.value
  ? extensionDailyStudyPlan(learningWords.value, snapshot.value, activeBookId.value, dailyPace.value, new Date(planNow.value))
  : null);
const dailyUnit = computed(() => activeBookId.value?.startsWith('jlpt-') ? '组' : '课');
const resumableItems = computed(() => snapshot.value && savedCheckpoint.value
  ? resolveStudyCheckpoint(learningWords.value, snapshot.value, savedCheckpoint.value) : []);
const selectedBookIds = computed(() => {
  const saved = snapshot.value?.preferences.selectedBookIds ?? [];
  return saved.length ? saved.filter(id => bookIds.value.includes(id))
    : snapshot.value?.preferences.selectedBookIdsExplicit ? bookIds.value
    : activeBookId.value ? [activeBookId.value] : [];
});
const selectedBookSet = computed(() => new Set(selectedBookIds.value));
const stats = computed(() => snapshot.value
  ? summarizeLearning(
    learningWords.value,
    snapshot.value.learning.states,
    snapshot.value.learning.logs,
    snapshot.value.learning.quizAttempts,
    new Date(),
    snapshot.value.preferences.dailyGoal,
  )
  : null);
const current = computed(() => queue.value[index.value] ?? null);
const reviewing = computed(() => reviewIndex.value !== null);
const reviewWord = computed(() => reviewIndex.value === null ? null : historyWords.value[reviewIndex.value] ?? null);
const comparisonWord = computed(() => reviewWord.value ?? current.value?.word ?? null);
watch([page, () => comparisonWord.value?.id], () => { comparisonOpen.value = false; });
const canPrevious = computed(() => !busy.value && !attemptBusy.value && historyWords.value.length > 0 && (reviewIndex.value === null || reviewIndex.value > 0));
const currentWord = computed(() => current.value?.word ?? null);
const currentState = computed(() => current.value?.state ?? null);
const activeQuestionOptionLabels = computed(() => {
  const question = activeQuestion.value;
  if (!question || !currentWord.value?.lessonId.startsWith('jlpt-n') || activeQuestionType.value === 'kanji-reading') return question?.options ?? [];
  return meaningOptionLabels(question.options);
});
const activeQuestionCorrectLabel = computed(() => {
  const question = activeQuestion.value;
  return question ? activeQuestionOptionLabels.value[question.options.indexOf(question.correct)] ?? question.correct : '';
});
const remaining = computed(() => Math.max(0, queue.value.length - index.value));
const sessionProgress = computed(() => queue.value.length ? Math.min(100, Math.round(index.value / queue.value.length * 100)) : 0);
const summaryStats = computed(() => stats.value);
const sessionFeedback = computed(() => snapshot.value ? extensionSessionSummary(snapshot.value, learningWords.value, sessionResults.value) : null);
const relatedGrammar = computed(() => {
  if (!snapshot.value || !sessionFeedback.value || remaining.value || sessionSceneId.value || sessionMode.value !== 'new') return;
  const newIds = new Set(sessionFeedback.value.newWords.map(word => word.id));
  return grammarForExtensionVocabulary(sessionResults.value.map(result => result.word).filter(word => newIds.has(word.id)));
});
const relatedPractice = computed(() => {
  if (!snapshot.value || !sessionResults.value.length) return undefined;
  const completedWords = sessionResults.value.map(result => result.word);
  const userId = snapshot.value.identity?.userId || snapshot.value.learning.userSettings?.userId || 'local';
  const stateById = new Map(snapshot.value.learning.states.filter(state => state.userId === userId).map(state => [state.wordId, state]));
  for (const saved of snapshot.value.words) {
    if (saved.state.userId === userId && !stateById.has(saved.word.id)) stateById.set(saved.word.id, saved.state);
  }
  const ignoredWordIds = new Set(completedWords.filter(word => stateById.get(word.id)?.isIgnored).map(word => word.id));
  return lessonPracticeRecommendation(personalLibraryData(snapshot.value, learningWords.value), completedWords, {
    ...(sessionSceneId.value ? { excludeSceneId: sessionSceneId.value } : {}),
    ignoredWordIds,
  });
});
function practiceRecommended(recommendation: LessonPracticeRecommendation) {
  if (recommendation.kind === 'scene') emit('practice', 'scenes', undefined, recommendation.scene.id);
  else emit('practice', 'conjugation', recommendation.verb.id);
}
const weakSuggestions = computed(() => snapshot.value && activeBookId.value
  ? extensionWeakPracticeSuggestions(snapshot.value, learningWords.value, new Date(), activeBookId.value) : []);
const version = String(extensionPackage.version || '0.1.0');
const effectiveExercise = computed<ExerciseType>(() => page.value === 'study' && sessionExerciseOverride.value
  ? sessionExerciseOverride.value
  : snapshot.value?.preferences.exerciseType ?? 'card');
const queueCounts = computed(() => ({
  new: previewQueue('new').length,
  review: previewQueue('review').length,
  difficult: previewQueue('difficult').length,
}));
const todayBarsMax = computed(() => Math.max(1, ...(stats.value?.days.map(day => day.count) ?? [])));
const todayRatio = computed(() => stats.value ? Math.min(100, Math.round(stats.value.todayCount / stats.value.dailyGoal * 100)) : 0);
const currentBook = computed(() => learningBooks.value.find(book => book.id === (currentWord.value ? bookIdForWord(currentWord.value) : '')));
const currentLesson = computed(() => currentWord.value?.lessonTitle ?? '');
const canRate = computed(() => Boolean(!reviewing.value && currentWord.value && !busy.value && !gradeError.value && (objectiveQuestion.value ? attempt.value && attemptSaved.value : revealed.value)));
let accountEpoch = 0;
let accountChannel: BroadcastChannel | undefined;
let lastAccountEventPartitionKey = '';
let lastRefreshEventAt = 0;

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function lessonsFor(bookId: string): LessonOption[] {
  const map = new Map<string, LessonOption>();
  for (const lesson of snapshot.value?.learning.lessons ?? []) {
    if (lesson.bookId === bookId) map.set(lesson.id, { ...lesson, wordCount: 0 });
  }
  for (const word of learningWords.value) {
    if (bookIdForWord(word) !== bookId) continue;
    const orderMatch = word.lessonId.match(/-l-(\d+)$/);
    const order = orderMatch ? Number(orderMatch[1]) : (word.order || 0);
    const lesson = map.get(word.lessonId);
    if (lesson) lesson.wordCount++;
    else map.set(word.lessonId, { id: word.lessonId, title: word.lessonTitle || '未分类', order, wordCount: 1 });
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'));
}
function bookProgress(id: string) { return libraryProgress.value?.books.find(book => book.id === id); }
async function useBook(id: string) {
  if (busy.value || queueBusy.value || loading.value) return;
  await persistBookSelection([id]);
  if (selectedBookIds.value.length === 1 && selectedBookIds.value[0] === id) expandedBookIds.value = new Set();
}
function previousWord() {
  if (!canPrevious.value || !workspaceVisible) return;
  cancelPendingAutoSpeech();
  stop();
  if (!reviewing.value) reviewStartedAt = Date.now();
  reviewIndex.value = reviewIndex.value === null ? historyWords.value.length - 1 : reviewIndex.value - 1;
}
function returnToCurrent() {
  cancelPendingAutoSpeech();
  stop();
  if (reviewStartedAt) {
    const pauseMs = Math.max(0, Date.now() - reviewStartedAt);
    if (cardStartedAt) cardStartedAt += pauseMs;
    if (sessionStartedAt.value) sessionStartedAt.value += pauseMs;
  }
  reviewStartedAt = 0;
  reviewIndex.value = null;
}
function updateSessionClock() {
  const now = Date.now();
  if (new Date(now).toDateString() !== new Date(planNow.value).toDateString()) planNow.value = now;
  if (page.value !== 'study') return;
  elapsedMs.value = sessionStartedAt.value ? Math.max(0, Date.now() - sessionStartedAt.value - (reviewStartedAt ? Date.now() - reviewStartedAt : 0)) : 0;
}

function saveCheckpoint() {
  if (!snapshot.value) return;
  const items = queue.value.slice(index.value);
  const checkpoint: ExtensionStudyCheckpoint = {
    version: 1,
    owner: snapshot.value.identity?.partitionKey ?? 'local',
    bookIds: [...new Set(items.map(item => bookIdForWord(item.word)))],
    wordIds: items.map(item => item.word.id),
    reviewCounts: items.map(item => item.state.reviewCount),
    mode: sessionMode.value,
    exercise: effectiveExercise.value,
    ...(sessionDailyBookId.value ? { dailyBookId: sessionDailyBookId.value } : {}),
    ...(sessionSceneId.value ? { sceneId: sessionSceneId.value } : {}),
    ...(sessionFeedbackPractice.value ? { feedbackPractice: true } : {}),
    ...(Object.keys(sessionReadingContextIds.value).length ? {
      readingContextIds: Object.fromEntries(Object.entries(sessionReadingContextIds.value).filter(([wordId]) => items.some(item => item.word.id === wordId))),
    } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (writeStudyCheckpoint(checkpoint)) savedCheckpoint.value = items.length ? checkpoint : null;
}

function changeDailyPace(pace: DailyPace) {
  if (activeBookId.value) planPreference.setPace(activeBookId.value, pace);
}

async function startDailyPlan(bookId = activeBookId.value) {
  if (!snapshot.value || !bookId) return;
  const plan = extensionDailyStudyPlan(learningWords.value, snapshot.value, bookId, planPreference.getPace(bookId), new Date());
  if (!plan.remaining) {
    actionMessage.value = plan.target ? '今天的计划已完成，明天再继续。' : '这本词书的新词已学完，可以复习或选择其他词书。';
    return;
  }
  const pending = new Set(plan.pendingWordIds);
  const items = buildStudyQueue(learningWords.value, snapshot.value.learning.states, { mode: 'new', bookIds: [bookId] }).filter(item => pending.has(item.word.id));
  await startSession(items, 'new', bookId);
}

async function resumeCheckpoint() {
  if (!snapshot.value || busy.value || attemptBusy.value || pendingGrade.value !== null) return;
  const checkpoint = readStudyCheckpoint(snapshot.value.identity?.partitionKey ?? 'local');
  const items = checkpoint ? resolveStudyCheckpoint(learningWords.value, snapshot.value, checkpoint) : [];
  savedCheckpoint.value = checkpoint;
  if (!checkpoint || !items.length) {
    actionMessage.value = '上次剩余内容已完成，可以开始今天的计划。';
    return;
  }
  await startSession(items, checkpoint.mode, checkpoint.dailyBookId, checkpoint.sceneId, checkpoint.feedbackPractice, true, checkpoint.readingContextIds, checkpoint.exercise);
}

async function startWeakPractice() {
  if (!snapshot.value) return;
  const items = feedbackPracticeQueue(snapshot.value, learningWords.value, weakSuggestions.value.map(entry => entry.word.id));
  await startSession(items, 'difficult', undefined, undefined, true);
}

async function retrySessionWords() {
  if (!snapshot.value || remaining.value > 0 || !sessionFeedback.value) return;
  const sceneId = sessionSceneId.value;
  const items = feedbackPracticeQueue(snapshot.value, learningWords.value, sessionFeedback.value.practiceWords.map(word => word.id));
  await startSession(items, 'difficult', undefined, sceneId, true);
}

async function startScenePractice(sceneId: string, exercise: 'card' | 'sentence-cloze') {
  if (!snapshot.value || !sceneFor(sceneId)) return;
  const epoch = accountEpoch;
  if (exercise !== effectiveExercise.value && !await saveSnapshot(() => extensionApi.setExerciseType(exercise))) return;
  if (epoch !== accountEpoch || !snapshot.value) return;
  const items = sceneStudyQueue(sceneId, learningWords.value, snapshot.value);
  if (!items.length) { actionError.value = '这个场景暂时没有可练习的词，可以恢复已忽略的词后再来。'; return; }
  await startSession(items, 'difficult', undefined, sceneId);
}

async function startHistoricalPractice(request: LearningLaunchRequest) {
  if (!snapshot.value || !request.bookId) return;
  const epoch = accountEpoch;
  const range = request.range === 30 ? 30 : 7;
  const getRow = () => snapshot.value && extensionPracticeFeedback(snapshot.value, learningWords.value, new Date(), range, request.bookId).quiz.find(row => row.id === request.exercise);
  const row = getRow();
  if (!row?.practiceWordIds.length) {
    actionMessage.value = '当前没有可重练的错词，这些词可能已答对或被忽略。';
    return;
  }
  if (effectiveExercise.value !== row.id && !await saveSnapshot(() => extensionApi.setExerciseType(row.id))) return;
  if (epoch !== accountEpoch || !snapshot.value) return;
  const latest = getRow();
  const items = feedbackPracticeQueue(snapshot.value, learningWords.value, latest?.practiceWordIds ?? []);
  if (!items.length) {
    actionMessage.value = '这些词的记录已有变化，当前没有需要重练的词。';
    return;
  }
  await startSession(items, 'difficult', undefined, undefined, true);
}

async function startPersonalContextPractice(request: LearningLaunchRequest) {
  if (!snapshot.value || !request.readingContextIds) return;
  const requested = Object.entries(request.readingContextIds);
  if (!requested.length) return;
  const validContextIds: Record<string, string> = {};
  for (const [wordId, contextId] of requested) {
    const word = learningWords.value.find(item => item.id === wordId);
    const context = wordReadingContexts(word).find(item => item.id === contextId);
    if (!word || !context || !contextClozeExample(word, context)) continue;
    validContextIds[wordId] = contextId;
  }
  if (!Object.keys(validContextIds).length) {
    actionError.value = '这条例句已更新或暂不适合填空，请重新选择。';
    return;
  }

  const items = feedbackPracticeQueue(snapshot.value, learningWords.value, Object.keys(validContextIds));
  const activeContextIds = Object.fromEntries(Object.entries(validContextIds).filter(([wordId]) => items.some(item => item.word.id === wordId)));
  if (!items.length) {
    actionError.value = '这个词已忽略，恢复学习后再练习原句。';
    return;
  }
  await startSession(items, 'difficult', undefined, undefined, false, false, activeContextIds, 'sentence-cloze');
}

async function handleLaunchRequest() {
  const request = props.launchRequest;
  if (!request || request.id === handledLaunchId || loading.value || !snapshot.value || !workspaceVisible) return;
  handledLaunchId = request.id;
  if (request.owner !== (snapshot.value.identity?.partitionKey ?? 'local')) return;
  if (busy.value || attemptBusy.value || pendingGrade.value !== null || queueBusy.value) {
    actionError.value = '当前记录正在保存，请稍后再开始。';
    return;
  }
  returnToCurrent();
  page.value = 'home';
  if (request.kind === 'library') return;
  if (request.kind === 'resume') return resumeCheckpoint();
  if (request.kind === 'daily') return startDailyPlan(request.bookId);
  if (request.kind === 'scene') return startScenePractice(request.sceneId ?? '', request.exercise === 'card' ? 'card' : 'sentence-cloze');
  if (request.kind === 'feedback') return startHistoricalPractice(request);
  if (request.kind === 'personal-context') return startPersonalContextPractice(request);
  const items = buildStudyQueue(learningWords.value, snapshot.value.learning.states, { mode: 'review', ...(request.bookId ? { bookIds: [request.bookId] } : {}) });
  await startSession(items, 'review');
}

watch([() => props.launchRequest, loading], () => { void handleLaunchRequest(); });

function isLessonSelected(lessonId: string): boolean {
  return selectedLessonIds.value === null || selectedLessonIds.value.includes(lessonId);
}

function lessonSummary(bookId: string): string {
  const all = lessonsFor(bookId);
  if (selectedLessonIds.value === null) return `全部 ${all.length} 课`;
  const count = all.filter(lesson => selectedLessonIds.value!.includes(lesson.id)).length;
  return `${count} / ${all.length} 课`;
}

function allSelectedLessonIds(): string[] {
  return selectedBookIds.value.flatMap(id => lessonsFor(id).map(lesson => lesson.id));
}

function normalizeLessonSelection(ids: string[]) {
  const all = allSelectedLessonIds();
  selectedLessonIds.value = all.length > 0 && all.every(id => ids.includes(id)) ? null : [...new Set(ids)];
}

function previewQueue(mode: LearningMode): StudyQueueItem[] {
  if (!snapshot.value || selectedBookIds.value.length === 0 || learningWords.value.length === 0) return [];
  if (selectedLessonIds.value !== null && selectedLessonIds.value.length === 0) return [];
  const options = {
    mode,
    bookIds: selectedBookIds.value,
    ...(selectedLessonIds.value === null ? {} : { lessonIds: selectedLessonIds.value }),
  };
  const result = buildStudyQueue(learningWords.value, snapshot.value.learning.states, options);
  return mode === 'new' ? result.slice(0, newTarget.value) : result;
}

async function loadWorkspace() {
  const sequence = ++loadSequence;
  const generation = ++snapshotReadGeneration;
  const epoch = accountEpoch;
  loading.value = true;
  loadError.value = '';
  catalogError.value = '';
  const [catalogResult, snapshotResult] = await Promise.allSettled([extensionApi.loadCatalog(), extensionApi.read()]);
  if (sequence !== loadSequence || epoch !== accountEpoch || generation !== snapshotReadGeneration) return;
  if (snapshotResult.status === 'fulfilled') {
    if (snapshot.value?.identity?.partitionKey && snapshotResult.value.identity?.partitionKey !== snapshot.value.identity.partitionKey) {
      accountChanged({ detail: { partitionKey: snapshotResult.value.identity?.partitionKey } } as unknown as Event);
      return;
    }
    snapshot.value = snapshotResult.value;
    savedCheckpoint.value = readStudyCheckpoint(snapshotResult.value.identity?.partitionKey ?? 'local');
    goalInput.value = snapshotResult.value.preferences.dailyGoal;
    setAudioVoice(snapshotResult.value.preferences.voice);
  } else {
    snapshot.value = null;
    loadError.value = messageFrom(snapshotResult.reason, '学习数据暂时无法读取。');
  }
  if (catalogResult.status === 'fulfilled') catalogWords.value = catalogResult.value;
  else {
    catalogWords.value = [];
    catalogError.value = messageFrom(catalogResult.reason, '教材词库暂时无法读取。');
  }
  for (const book of learningBooks.value) {
    if (lessonRanges[book.id]) continue;
    const lessons = lessonsFor(book.id);
    lessonRanges[book.id] = { from: lessons[0]?.id ?? '', to: lessons.at(-1)?.id ?? '' };
  }
  if (snapshotResult.status === 'fulfilled' && catalogResult.status === 'rejected' && !snapshot.value?.learning.words.length) {
    loadError.value = `${catalogError.value} ${loadError.value}`.trim();
  }
  loading.value = false;
}

async function refreshLatestSnapshot() {
  const epoch = accountEpoch;
  const generation = ++snapshotReadGeneration;
  try {
    const fresh = await extensionApi.read();
    if (epoch !== accountEpoch || generation !== snapshotReadGeneration || !workspaceVisible) return;
    if (snapshot.value?.identity?.partitionKey && fresh.identity?.partitionKey !== snapshot.value.identity.partitionKey) {
      accountChanged({ detail: { partitionKey: fresh.identity?.partitionKey } } as unknown as Event);
      return;
    }
    snapshot.value = fresh;
    goalInput.value = fresh.preferences.dailyGoal;
    setAudioVoice(fresh.preferences.voice);
    loading.value = false;
  } catch (error) {
    if (epoch === accountEpoch && generation === snapshotReadGeneration && workspaceVisible) {
      actionError.value = messageFrom(error, '操作已保存，学习概览暂时无法刷新，请重新进入学习。');
      loading.value = false;
    }
  }
}

function acceptWriteSnapshot(result: ExtensionSnapshot, generation: number) {
  if (generation === snapshotReadGeneration) snapshot.value = result;
  else if (workspaceVisible) void refreshLatestSnapshot();
}

async function saveSnapshot(action: () => Promise<ExtensionSnapshot>, success?: string) {
  const epoch = accountEpoch;
  const generation = snapshotReadGeneration;
  actionError.value = '';
  actionMessage.value = '';
  try {
    const result = await action();
    if (epoch !== accountEpoch) return false;
    acceptWriteSnapshot(result, generation);
    if (success) actionMessage.value = success;
    return true;
  } catch (error) {
    if (epoch !== accountEpoch) return false;
    actionError.value = messageFrom(error, '保存没有完成，请重试。');
    return false;
  }
}

async function persistBookSelection(ids: string[]) {
  if (!ids.length) return;
  const selected = ids.length === learningBooks.value.length ? [] : ids;
  const ok = await saveSnapshot(() => extensionApi.setSelectedBookIds(selected), '词书选择已保存。');
  if (ok) selectedLessonIds.value = null;
}

function toggleExpanded(bookId: string) {
  visibleLessonCount.value = 6;
  expandedBookIds.value = expandedBookIds.value.has(bookId) ? new Set() : new Set([bookId]);
}

function toggleBook(bookId: string) {
  const next = new Set(selectedBookIds.value);
  if (next.has(bookId)) {
    if (next.size === 1) return;
    next.delete(bookId);
  } else next.add(bookId);
  void persistBookSelection([...next]);
}

function selectAllBooks() {
  void persistBookSelection(bookIds.value);
}

function toggleLesson(lessonId: string) {
  const visibleIds = allSelectedLessonIds();
  const next = new Set(selectedLessonIds.value ?? visibleIds);
  if (next.has(lessonId)) next.delete(lessonId);
  else next.add(lessonId);
  normalizeLessonSelection([...next]);
}

function selectBookLessons(bookId: string) {
  const ids = lessonsFor(bookId).map(lesson => lesson.id);
  const base = new Set(selectedLessonIds.value ?? allSelectedLessonIds());
  ids.forEach(id => base.add(id));
  normalizeLessonSelection([...base]);
}

function clearBookLessons(bookId: string) {
  const ids = new Set(lessonsFor(bookId).map(lesson => lesson.id));
  const base = selectedLessonIds.value === null ? new Set(allSelectedLessonIds()) : new Set(selectedLessonIds.value);
  ids.forEach(id => base.delete(id));
  normalizeLessonSelection([...base]);
}

function applyLessonRange(bookId: string) {
  const lessons = lessonsFor(bookId);
  if (!lessons.length) return;
  const range = lessonRanges[bookId];
  const from = lessons.findIndex(lesson => lesson.id === range?.from);
  const to = lessons.findIndex(lesson => lesson.id === range?.to);
  if (from < 0 || to < 0) return;
  const [start, end] = from <= to ? [from, to] : [to, from];
  const selected = new Set(selectedLessonIds.value ?? allSelectedLessonIds());
  lessons.forEach((lesson, position) => {
    if (position >= start && position <= end) selected.add(lesson.id);
    else selected.delete(lesson.id);
  });
  normalizeLessonSelection([...selected]);
  actionMessage.value = `${lessons[start].title} 至 ${lessons[end].title} 已选中。`;
}

function changeMode(mode: LearningMode) {
  selectedMode.value = mode;
  actionError.value = '';
}

async function startSession(items = previewQueue(selectedMode.value), mode = selectedMode.value, dailyBookId?: string, sceneId?: string, feedbackPractice = false, suppressInitialAutoSpeech = false, readingContextIds: Record<string, string> = {}, exerciseOverride?: ExerciseType) {
  if (loading.value || queueBusy.value || busy.value || attemptBusy.value || pendingGrade.value !== null || !snapshot.value) return;
  const epoch = accountEpoch;
  const exerciseForSession = exerciseOverride ?? effectiveExercise.value;
  queueBusy.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    if (!items.length) {
      actionError.value = selectedLessonIds.value?.length === 0
        ? '所选课次没有词语，请重新选择课次。'
        : mode === 'review'
          ? '所选范围内暂时没有到期词语。'
          : mode === 'difficult'
            ? '所选范围内还没有标记为难词的词语。'
            : '所选范围内暂时没有新词。';
      return;
    }
    if (exerciseForSession === 'sentence-cloze' && !sceneId && !Object.keys(readingContextIds).length) {
      await Promise.all([...new Set(items.map(item => bookIdForWord(item.word)))].map(loadBookLearningExamples));
      if (epoch !== accountEpoch || !workspaceVisible) return;
    }
    autoSpeechHandled = new Set();
    queue.value = items;
    index.value = 0;
    sessionMode.value = mode;
    sessionDailyBookId.value = dailyBookId;
    sessionSceneId.value = sceneId;
    sessionExerciseOverride.value = exerciseOverride ?? null;
    const queuedWordIds = new Set(items.map(item => item.word.id));
    sessionReadingContextIds.value = Object.fromEntries(Object.entries(readingContextIds).filter(([wordId, contextId]) => queuedWordIds.has(wordId) && contextId.trim()));
    sessionFeedbackPractice.value = feedbackPractice;
    sessionResults.value = [];
    historyWords.value = [];
    reviewIndex.value = null;
    reviewStartedAt = 0;
    sessionSkipped.value = 0;
    lastIgnored.value = null;
    sessionStartedAt.value = Date.now();
    summaryPausedAt = 0;
    summaryDurationMs.value = 0;
    elapsedMs.value = 0;
    page.value = 'study';
    resetCard();
    saveCheckpoint();
    await nextTick();
    if (epoch !== accountEpoch) return;
    void animateView();
    if (!suppressInitialAutoSpeech) autoSpeakCurrent();
  } catch (error) {
    if (epoch !== accountEpoch) return;
    actionError.value = messageFrom(error, '学习队列暂时无法生成。');
  } finally {
    if (epoch === accountEpoch) queueBusy.value = false;
  }
}

function selectQuizQuestion(word: ExtensionWord, exercise: ExerciseType): { question: Question | null; chosen: QuizType | null } {
  if (exercise === 'kana-input' || exercise === 'dictation' || exercise === 'sentence-cloze') return { question: null, chosen: null };
  const pool = learningWords.value.filter(item => !snapshot.value?.learning.states.find(state => state.wordId === item.id)?.isIgnored);
  const types: QuizType[] = exercise === 'mixed'
    ? ['kana-meaning', 'kanji-reading', 'audio-meaning']
    : exercise === 'card' ? [] : [exercise];
  if (!types.length) return { question: null, chosen: null };
  const rotation = exercise === 'mixed' ? index.value % types.length : 0;
  const ordered = [...types.slice(rotation), ...types.slice(0, rotation)];
  for (const type of ordered) {
    if (type === 'kanji-reading' && !/\p{Script=Han}/u.test(word.term)) continue;
    const candidate = createQuestion(word, pool, type);
    if (candidate) return { question: candidate, chosen: type };
  }
  return { question: null, chosen: null };
}

function resetCard() {
  cancelPendingAutoSpeech();
  stop();
  audioNotice.value = '';
  hasHeardAudio.value = false;
  audioError.value = '';
  revealed.value = false;
  reverseCard.value = false;
  activeQuestion.value = null;
  activeQuestionType.value = null;
  inputQuestion.value = null;
  inputValue.value = '';
  clozeQuestion.value = null;
  clozeValue.value = '';
  attempt.value = null;
  attemptRequestId.value = '';
  attemptElapsedMs.value = null;
  attemptSaved.value = false;
  attemptBusy.value = false;
  attemptError.value = '';
  pendingGrade.value = null;
  pendingGradeRequestId.value = '';
  pendingGradeExpectedCount.value = null;
  pendingGradeElapsedMs.value = null;
  staleReview.value = false;
  gradeError.value = '';
  cardStartedAt = Date.now();
  const word = currentWord.value;
  if (!word || effectiveExercise.value === 'card') return;
  if (effectiveExercise.value === 'kana-input' || effectiveExercise.value === 'dictation') {
    inputQuestion.value = createInputQuestion(word, effectiveExercise.value);
    if (!inputQuestion.value) audioNotice.value = '这个词暂时没有可用于键入的读音，已切换翻卡。';
    return;
  }
  if (effectiveExercise.value === 'sentence-cloze') {
    const selectedContextId = sessionReadingContextIds.value[word.id];
    const selectedContext = selectedContextId ? wordReadingContexts(word).find(context => context.id === selectedContextId) : undefined;
    const selectedPersonalExample = selectedContext ? contextClozeExample(word, selectedContext) : undefined;
    clozeQuestion.value = selectedContextId
      ? selectedPersonalExample ? createSentenceCloze(word, selectedPersonalExample) : null
      : createSentenceCloze(word, sceneExampleFor(sessionSceneId.value, word));
    if (!clozeQuestion.value) audioNotice.value = selectedContextId
      ? '这条原句已修改或移除，无法继续填空。'
      : '这个词暂时没有合适的填空例句，已切换翻卡。';
    return;
  }
  const result = selectQuizQuestion(word, effectiveExercise.value);
  activeQuestion.value = result.question;
  activeQuestionType.value = result.chosen;
  if (!result.question) audioNotice.value = '没有足够的合适选项，这张卡片会使用翻卡学习。';
}

async function changeExercise(value: ExerciseType) {
  if (reviewing.value || busy.value || attemptBusy.value || (page.value === 'study' && attempt.value) || pendingGrade.value !== null) return;
  if (await saveSnapshot(() => extensionApi.setExerciseType(value), '练习方式已保存。')) {
    const word = currentWord.value;
    const epoch = accountEpoch;
    if (sessionExerciseOverride.value) sessionExerciseOverride.value = value;
    if (value === 'sentence-cloze' && word && !sessionSceneId.value) await loadBookLearningExamples(bookIdForWord(word));
    if (epoch === accountEpoch && currentWord.value?.id === word?.id) {
      resetCard();
      if (page.value === 'study') saveCheckpoint();
    }
  }
}

function onExerciseChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (exerciseChoices.some(option => option.value === value)) void changeExercise(value as ExerciseType);
}

function onVoiceChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (value === 'female' || value === 'male') void changeVoice(value);
}

async function revealCard() {
  if (reviewing.value || !currentWord.value || busy.value || objectiveQuestion.value || clozeQuestion.value) return;
  revealed.value = true;
  await animateReveal();
}

function cancelPendingAutoSpeech(stopPlayback = false): void {
  const wasPending = autoSpeechPending;
  const playbackWasPending = autoSpeechPlaybackPending;
  if (autoSpeechTimer !== undefined) clearTimeout(autoSpeechTimer);
  autoSpeechTimer = undefined;
  autoSpeechPending = false;
  autoSpeechPlaybackPending = false;
  autoSpeechGeneration++;
  if (stopPlayback && wasPending && playbackWasPending) stop();
}

function autoSpeakCurrent(afterAnswer = false, waitForFeedback = false): void {
  const word = currentWord.value;
  if (!autoPronunciationEnabled.value || !word || page.value !== 'study' || reviewing.value || !workspaceVisible || autoSpeechHandled.has(word.id)) return;
  const answerGated = activeQuestionType.value === 'kanji-reading' || inputQuestion.value?.type === 'kana-input' || !!clozeQuestion.value;
  if (answerGated && !afterAnswer) return;

  autoSpeechHandled.add(word.id);
  const generation = ++autoSpeechGeneration;
  autoSpeechPending = true;
  const beginPlayback = () => {
    if (generation !== autoSpeechGeneration || !autoSpeechPending) return;
    autoSpeechTimer = undefined;
    autoSpeechPlaybackPending = true;
    void playCurrent(false, true).finally(() => {
      if (generation === autoSpeechGeneration) {
        autoSpeechPending = false;
        autoSpeechPlaybackPending = false;
      }
    });
  };
  if (afterAnswer || waitForFeedback) autoSpeechTimer = setTimeout(beginPlayback, 750);
  else beginPlayback();
}

async function playCurrent(slow = false, automatic = false): Promise<boolean> {
  if (!automatic) cancelPendingAutoSpeech();
  stopAnswerSound();
  const word = reviewWord.value || currentWord.value;
  if (!word) return false;
  const wordId = word.id;
  const wasReviewing = reviewing.value;
  const epoch = accountEpoch;
  const played = await play(word, slow);
  if (epoch !== accountEpoch || !workspaceVisible) return false;
  if (played && !wasReviewing && !reviewing.value && currentWord.value?.id === wordId) {
    hasHeardAudio.value = true;
    audioNotice.value = '';
    return true;
  }
  return false;
}

function chooseAnswer(selected: string) {
  if (reviewing.value || !activeQuestion.value || attempt.value || busy.value || attemptBusy.value) return;
  if (activeQuestionType.value === 'audio-meaning' && (!hasHeardAudio.value || audioError.value)) return;
  const quiz = quizAttempt(activeQuestion.value, selected);
  attempt.value = quiz;
  stop();
  if (activeQuestionType.value === 'kanji-reading') autoSpeakCurrent(true);
  void playAnswerSound(quiz.isCorrect);
  attemptRequestId.value = crypto.randomUUID();
  attemptElapsedMs.value = Math.max(0, Date.now() - cardStartedAt);
  void saveQuizAttempt();
}

function submitInputAnswer(value: string | null) {
  const question = inputQuestion.value;
  if (!question || reviewing.value || busy.value || attemptBusy.value || attempt.value) return;
  if (question.type === 'dictation' && (!hasHeardAudio.value || audioError.value)) return;
  attempt.value = inputAttempt(question, value);
  stop();
  revealed.value = true;
  if (question.type === 'kana-input') autoSpeakCurrent(true);
  attemptRequestId.value = crypto.randomUUID();
  attemptElapsedMs.value = Math.max(0, Date.now() - cardStartedAt);
  void playAnswerSound(attempt.value.isCorrect);
  void saveQuizAttempt();
}

function revealCloze() {
  if (!clozeQuestion.value || reviewing.value || revealed.value || busy.value) return;
  revealed.value = true;
  autoSpeakCurrent(true);
}

async function saveQuizAttempt() {
  if (reviewing.value) return;
  const word = currentWord.value;
  const question = objectiveQuestion.value;
  const response = attempt.value;
  if (!word || !question || !response || !attemptRequestId.value || attemptSaved.value || attemptBusy.value) return;
  attemptBusy.value = true;
  attemptError.value = '';
  const epoch = accountEpoch;
  const generation = snapshotReadGeneration;
  // This operation is idempotent by requestId; keep its whole payload stable
  // when the user retries after an ambiguous response.
  const duration = attemptElapsedMs.value ?? Math.max(0, Date.now() - cardStartedAt);
  try {
    const result = await extensionApi.recordQuizAttempt({
      requestId: attemptRequestId.value,
      wordId: word.id,
      word,
      type: question.type,
      prompt: question.prompt,
      options: 'options' in question ? [...question.options] : [],
      selected: response.selected,
      correct: question.correct,
      elapsedMs: duration,
    });
    if (epoch !== accountEpoch) return;
    acceptWriteSnapshot(result, generation);
    attemptSaved.value = true;
    if (activeQuestionType.value === 'audio-meaning' || question.type === 'dictation') stop();
  } catch (error) {
    if (epoch !== accountEpoch) return;
    attemptError.value = messageFrom(error, '答题记录没有保存，可以重试。');
  } finally {
    if (epoch === accountEpoch) attemptBusy.value = false;
  }
}

async function setDifficult() {
  if (reviewing.value) return;
  const word = currentWord.value;
  const state = currentState.value;
  if (!word || !state || busy.value || pendingGrade.value !== null) return;
  const epoch = accountEpoch;
  const generation = snapshotReadGeneration;
  busy.value = true;
  actionError.value = '';
  try {
    const result = await extensionApi.setLearningFlags(word.id, { isDifficult: !state.isDifficult }, word);
    if (epoch !== accountEpoch) return;
    acceptWriteSnapshot(result, generation);
    const currentState = result.learning.states.find(item => item.wordId === word.id);
    if (currentState) current.value!.state = currentState;
    actionMessage.value = currentState?.isDifficult ? '已标记为难词。' : '已取消难词标记。';
  } catch (error) {
    if (epoch !== accountEpoch) return;
    actionError.value = messageFrom(error, '难词标记没有保存。');
  } finally {
    if (epoch === accountEpoch) busy.value = false;
  }
}

async function ignoreCurrent() {
  if (reviewing.value) return;
  const item = current.value;
  if (!item || busy.value || pendingGrade.value !== null) return;
  const epoch = accountEpoch;
  const generation = snapshotReadGeneration;
  busy.value = true;
  actionError.value = '';
  try {
    const result = await extensionApi.setLearningFlags(item.word.id, { isIgnored: true }, item.word);
    if (epoch !== accountEpoch) return;
    acceptWriteSnapshot(result, generation);
    lastIgnored.value = { item, index: index.value };
    if (workspaceVisible) historyWords.value.push(item.word);
    sessionSkipped.value++;
    index.value++;
    saveCheckpoint();
    stop();
    if (index.value >= queue.value.length) finishSession();
    else resetCard();
  } catch (error) {
    if (epoch !== accountEpoch) return;
    actionError.value = messageFrom(error, '忽略标记没有保存。');
  } finally {
    if (epoch === accountEpoch) busy.value = false;
  }
}

async function undoIgnore() {
  if (reviewing.value) return;
  const ignored = lastIgnored.value;
  if (!ignored || busy.value) return;
  const epoch = accountEpoch;
  const generation = snapshotReadGeneration;
  busy.value = true;
  actionError.value = '';
  try {
    const result = await extensionApi.setLearningFlags(ignored.item.word.id, { isIgnored: false }, ignored.item.word);
    if (epoch !== accountEpoch) return;
    acceptWriteSnapshot(result, generation);
    const state = result.learning.states.find(item => item.wordId === ignored.item.word.id);
    if (state) ignored.item.state = state;
    sessionSkipped.value = Math.max(0, sessionSkipped.value - 1);
    const historyIndex = historyWords.value.map(word => word.id).lastIndexOf(ignored.item.word.id);
    if (historyIndex >= 0) historyWords.value.splice(historyIndex, 1);
    lastIgnored.value = null;
    if (index.value === ignored.index + 1) {
      index.value = ignored.index;
      page.value = 'study';
      resetCard();
      saveCheckpoint();
    } else {
      actionMessage.value = `「${ignored.item.word.term}」已恢复，可在下一轮学习。`;
    }
  } catch (error) {
    if (epoch !== accountEpoch) return;
    actionError.value = messageFrom(error, '撤销忽略没有保存。');
  } finally {
    if (epoch === accountEpoch) busy.value = false;
  }
}

async function rateCurrent(rating: Grade) {
  if (reviewing.value) return;
  const item = current.value;
  const isAnswerReady = Boolean(objectiveQuestion.value ? attempt.value && attemptSaved.value : revealed.value);
  if (!item || busy.value || !isAnswerReady) return;
  const manualFeedback = !attempt.value && rating !== 2;
  if (pendingGrade.value !== null && pendingGrade.value !== rating) return;
  if (pendingGrade.value === null) {
    pendingGrade.value = rating;
    pendingGradeRequestId.value = crypto.randomUUID();
    pendingGradeExpectedCount.value = item.state.reviewCount;
    pendingGradeElapsedMs.value = Math.max(0, Date.now() - cardStartedAt);
  }
  const epoch = accountEpoch;
  busy.value = true;
  gradeError.value = '';
  const generation = snapshotReadGeneration;
  try {
    const result = await extensionApi.rateLearning(
      item.word,
      pendingGrade.value,
      pendingGradeRequestId.value,
      pendingGradeExpectedCount.value ?? item.state.reviewCount,
      sessionMode.value,
      pendingGradeElapsedMs.value ?? Math.max(0, Date.now() - cardStartedAt),
      attemptRequestId.value || undefined,
      sessionSceneId.value,
      sessionFeedbackPractice.value || undefined,
      sessionReadingContextIds.value[item.word.id],
    );
    if (epoch !== accountEpoch) return;
    acceptWriteSnapshot(result, generation);
    sessionResults.value.push({ word: item.word, correct: attempt.value?.isCorrect ?? null, rating: pendingGrade.value, baselineReviewCount: pendingGradeExpectedCount.value ?? item.state.reviewCount, logId: pendingGradeRequestId.value });
    if (workspaceVisible) historyWords.value.push(item.word);
    index.value++;
    saveCheckpoint();
    pendingGrade.value = null;
    pendingGradeRequestId.value = '';
    pendingGradeExpectedCount.value = null;
    pendingGradeElapsedMs.value = null;
    gradeError.value = '';
    staleReview.value = false;
    stop();
    if (index.value >= queue.value.length) finishSession();
    else {
      resetCard();
      await nextTick();
      void animateView();
      autoSpeakCurrent(false, true);
    }
    if (manualFeedback && workspaceVisible) void playAnswerSound(rating >= 3);
  } catch (error) {
    if (epoch !== accountEpoch) return;
    const errorMessage = messageFrom(error, '这次评分没有保存。重试会沿用同一请求编号。');
    if (errorMessage === '这张复习卡已更新，请刷新当前卡片后再评分。' || (error instanceof Error && error.name === 'StaleReviewError')) {
      pendingGrade.value = null;
      pendingGradeRequestId.value = '';
      pendingGradeExpectedCount.value = null;
      pendingGradeElapsedMs.value = null;
      staleReview.value = true;
      gradeError.value = '这张卡已在其他位置更新。请刷新卡片后继续。';
    } else {
      gradeError.value = errorMessage;
    }
  } finally {
    if (epoch === accountEpoch) busy.value = false;
  }
}

async function refreshCurrentCard() {
  if (reviewing.value) return;
  const item = current.value;
  if (!item || busy.value || !staleReview.value) return;
  const epoch = accountEpoch;
  const generation = ++snapshotReadGeneration;
  busy.value = true;
  actionError.value = '';
  try {
    const fresh = await extensionApi.read();
    if (epoch !== accountEpoch || generation !== snapshotReadGeneration) return;
    snapshot.value = fresh;
    const freshState = fresh.learning.states.find(state => state.wordId === item.word.id);
    const refreshed = sessionSceneId.value ? sceneStudyQueue(sessionSceneId.value, learningWords.value, fresh).filter(entry => entry.word.id === item.word.id) : sessionFeedbackPractice.value ? feedbackPracticeQueue(fresh, learningWords.value, [item.word.id]) : buildStudyQueue([item.word], freshState ? [freshState] : [], {
      mode: sessionMode.value,
      now: new Date(),
    });
    if (!refreshed.length) {
      queue.value = queue.value.filter((_, queueIndex) => queueIndex !== index.value);
      saveCheckpoint();
      sessionSkipped.value++;
      staleReview.value = false;
      gradeError.value = '';
      actionMessage.value = `「${item.word.term}」已不符合本轮条件，已跳过。`;
      if (index.value >= queue.value.length) finishSession();
      else resetCard();
      return;
    }
    queue.value[index.value] = refreshed[0];
    staleReview.value = false;
    gradeError.value = '';
    resetCard();
    actionMessage.value = `「${item.word.term}」的复习状态已刷新。`;
  } catch (error) {
    if (epoch !== accountEpoch) return;
    actionError.value = messageFrom(error, '刷新当前卡片失败，请重试。');
  } finally {
    if (epoch === accountEpoch) busy.value = false;
  }
}

function finishSession() {
  saveCheckpoint();
  updateSessionClock();
  summaryDurationMs.value = elapsedMs.value;
  summaryPausedAt = Date.now();
  stop();
  stopAnswerSound();
  page.value = 'summary';
  void nextTick(() => animateView());
}

function leaveSession() {
  cancelPendingAutoSpeech(true);
  if (sessionResults.value.length || sessionSkipped.value) finishSession();
  else { stop(); page.value = 'home'; }
}

function resumeStudy() {
  if (index.value >= queue.value.length) return;
  if (summaryPausedAt) sessionStartedAt.value += Math.max(0, Date.now() - summaryPausedAt);
  summaryPausedAt = 0;
  page.value = 'study';
  resetCard();
}

async function saveDailyGoal() {
  const value = Math.min(200, Math.max(1, Math.round(Number(goalInput.value) || 20)));
  goalInput.value = value;
  if (!snapshot.value || value === snapshot.value.preferences.dailyGoal || savingGoal.value) return;
  const epoch = accountEpoch;
  savingGoal.value = true;
  await saveSnapshot(() => extensionApi.setDailyGoal(value), '每日目标已保存。');
  if (epoch === accountEpoch) savingGoal.value = false;
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
  if (selectedFile.value && !importTitle.value.trim()) {
    importTitle.value = selectedFile.value.name.replace(/\.(csv|json)$/i, '').slice(0, 80);
  }
}

async function importBook() {
  const file = selectedFile.value;
  if (!file || importing.value) return;
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension !== 'csv' && extension !== 'json') {
    actionError.value = '请选取 .csv 或 .json 词书文件。';
    return;
  }
  if (file.size > 1_000_000) {
    actionError.value = '文件超过 1 MB，请先拆分词书。';
    return;
  }
  const title = importTitle.value.trim() || file.name.replace(/\.(csv|json)$/i, '');
  const epoch = accountEpoch;
  const generation = snapshotReadGeneration;
  importing.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    const text = await file.text();
    if (epoch !== accountEpoch) return;
    const next = await extensionApi.importCustomBook({ text, format: extension as 'csv' | 'json', title });
    if (epoch !== accountEpoch) return;
    acceptWriteSnapshot(next, generation);
    selectedFile.value = null;
    importTitle.value = '';
    if (importInput.value) importInput.value.value = '';
    const imported = next.learning.books.filter(book => book.source === 'manual').sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
    if (imported) {
      const ids = [...new Set([...selectedBookIds.value, imported.id])];
      const importedWords = [...new Map([...catalogWords.value, ...next.learning.words].map(word => [word.id, word])).values()];
      const allBooks = listLearningBooks(importedWords, next.learning.books);
      const updated = await extensionApi.setSelectedBookIds(ids.length === allBooks.length ? [] : ids);
      if (epoch !== accountEpoch) return;
      acceptWriteSnapshot(updated, generation);
      expandedBookIds.value = new Set(expandedBookIds.value).add(imported.id);
    }
    selectedLessonIds.value = null;
    actionMessage.value = `「${title}」已导入 ${imported?.wordCount ?? 0} 个词条。`;
  } catch (error) {
    if (epoch !== accountEpoch) return;
    actionError.value = messageFrom(error, '导入没有完成。请检查文件内容后重试。');
  } finally {
    if (epoch === accountEpoch) importing.value = false;
  }
}

async function changeVoice(value: 'female' | 'male') {
  stop();
  setAudioVoice(value);
  prefetchCurrentQueue();
  await saveSnapshot(() => extensionApi.setVoice(value), '发音声音已保存。');
}

function accountChanged(event?: Event) {
  clearPrefetch();
  stopAnswerSound();
  comparisonOpen.value = false;
  const raw = event && typeof MessageEvent !== 'undefined' && event instanceof MessageEvent
    ? event.data
    : (event as CustomEvent<{ partitionKey?: unknown; refresh?: unknown }> | undefined)?.detail;
  const partitionKey = raw && typeof raw === 'object' && 'partitionKey' in raw && typeof raw.partitionKey === 'string' ? raw.partitionKey : '';
  const refresh = raw && typeof raw === 'object' && 'refresh' in raw && raw.refresh === true;
  const currentPartitionKey = snapshot.value?.identity?.partitionKey ?? '';
  const samePartitionRefresh = refresh && partitionKey && partitionKey === currentPartitionKey;
  const now = Date.now();
  if (samePartitionRefresh && partitionKey === lastAccountEventPartitionKey && now - lastRefreshEventAt < 300) return;
  if (partitionKey && partitionKey === lastAccountEventPartitionKey && !refresh) return;
  if (partitionKey) {
    lastAccountEventPartitionKey = partitionKey;
  }
  if (samePartitionRefresh) {
    lastRefreshEventAt = now;
    if (!workspaceVisible) return;
    const epoch = accountEpoch;
    const generation = ++snapshotReadGeneration;
    const sequence = ++refreshSequence;
    void extensionApi.read().then(fresh => {
      if (epoch !== accountEpoch || sequence !== refreshSequence || generation !== snapshotReadGeneration) return;
      if (fresh.identity?.partitionKey !== partitionKey) {
        accountChanged({ detail: { partitionKey: fresh.identity?.partitionKey, userId: fresh.identity?.userId } } as unknown as Event);
        return;
      }
      snapshot.value = fresh;
      goalInput.value = fresh.preferences.dailyGoal;
      setAudioVoice(fresh.preferences.voice);
    }).catch(error => {
      if (epoch === accountEpoch && sequence === refreshSequence) actionError.value = messageFrom(error, '同步后的学习数据暂时无法读取。');
    });
    return;
  }
  accountEpoch++;
  autoSpeechHandled = new Set();
  cancelPendingAutoSpeech();
  refreshSequence++;
  lastRefreshEventAt = 0;
  stop();
  queue.value = [];
  savedCheckpoint.value = null;
  sessionDailyBookId.value = undefined;
  sessionSceneId.value = undefined;
  sessionReadingContextIds.value = {};
  sessionExerciseOverride.value = null;
  sessionFeedbackPractice.value = false;
  summaryPausedAt = 0;
  summaryDurationMs.value = 0;
  index.value = 0;
  sessionResults.value = [];
  historyWords.value = [];
  reviewIndex.value = null;
  reviewStartedAt = 0;
  sessionSkipped.value = 0;
  lastIgnored.value = null;
  pendingGrade.value = null;
  pendingGradeRequestId.value = '';
  pendingGradeExpectedCount.value = null;
  pendingGradeElapsedMs.value = null;
  attempt.value = null;
  attemptRequestId.value = '';
  attemptSaved.value = false;
  busy.value = false;
  queueBusy.value = false;
  attemptBusy.value = false;
  importing.value = false;
  savingGoal.value = false;
  gradeError.value = '';
  attemptError.value = '';
  actionError.value = '';
  actionMessage.value = '';
  page.value = 'home';
  resetCard();
  snapshot.value = null;
  loading.value = true;
  if (workspaceVisible) void loadWorkspace();
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

function keydown(event: KeyboardEvent) {
  if (comparisonOpen.value) return;
  if (reviewing.value || !workspaceVisible || event.ctrlKey || event.altKey || event.metaKey || event.repeat || page.value !== 'study' || busy.value || !currentWord.value) return;
  const target = event.target as HTMLElement;
  if (target.closest('input,textarea,select,button,a,[contenteditable="true"]')) return;
  if (activeQuestion.value && !attempt.value && ['1', '2', '3', '4'].includes(event.key)) {
    const choice = activeQuestion.value.options[Number(event.key) - 1];
    if (choice) { event.preventDefault(); chooseAnswer(choice); }
  } else if (event.code === 'Space') {
    event.preventDefault();
    if ((activeQuestion.value?.type === 'audio-meaning' || inputQuestion.value?.type === 'dictation') && !hasHeardAudio.value) void playCurrent();
    else if (clozeQuestion.value && !revealed.value) revealCloze();
    else if (!objectiveQuestion.value && !revealed.value) void revealCard();
  } else if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    void setDifficult();
  } else if (event.key.toLowerCase() === 'i') {
    event.preventDefault();
    void ignoreCurrent();
  }
}

function prefetchCurrentQueue() {
  if (page.value !== 'study' || !workspaceVisible) {
    clearPrefetch();
    return;
  }
  prefetch(queue.value.slice(index.value, index.value + 3).map(item => item.word));
}

watch([page, queue, index], async ([, nextQueue], [, previousQueue]) => {
  if (nextQueue !== previousQueue) clearPrefetch();
  prefetchCurrentQueue();
  await nextTick();
  if (page.value !== 'home') void animateView();
}, { flush: 'post' });

watch(learningBooks, books => {
  for (const book of books) {
    if (lessonRanges[book.id]) continue;
    const lessons = lessonsFor(book.id);
    lessonRanges[book.id] = { from: lessons[0]?.id ?? '', to: lessons.at(-1)?.id ?? '' };
  }
});
watch(activeBookId, () => { expandedBookIds.value = new Set(); });

watch(() => snapshot.value?.preferences.voice, value => {
  if (value && voice.value !== value) {
    setAudioVoice(value);
    prefetchCurrentQueue();
  }
});

watch(autoPronunciationEnabled, enabled => {
  if (!enabled) cancelPendingAutoSpeech(true);
}, { flush: 'sync' });

function stopFeedbackWhenHidden() {
  if (document.hidden) {
    cancelPendingAutoSpeech(true);
    stopAnswerSound();
    clearPrefetch();
  } else prefetchCurrentQueue();
}

onMounted(() => {
  document.addEventListener('visibilitychange', stopFeedbackWhenHidden);
  window.addEventListener('online',prefetchCurrentQueue);
  window.addEventListener('offline',prefetchCurrentQueue);
  window.addEventListener('pagehide', stopAnswerSound);
  window.addEventListener('keydown', keydown);
  window.addEventListener('kotobud:account-changed', accountChanged);
  if (typeof BroadcastChannel !== 'undefined') {
    accountChannel = new BroadcastChannel('kotobud-account');
    accountChannel.addEventListener('message', accountChanged);
  }
  clockTimer = setInterval(updateSessionClock, 1000);
  void loadWorkspace();
});

onDeactivated(() => {
  stopAnswerSound();
  cancelPendingAutoSpeech(true);
  clearPrefetch();
  comparisonOpen.value = false;
  returnToCurrent();
  workspaceVisible = false;
  suspendedAt = Date.now();
  window.removeEventListener('keydown', keydown);
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = undefined;
  stop();
});

onActivated(() => {
  if (!suspendedAt) return; // onMounted owns the first load.
  const pauseMs = Math.max(0, Date.now() - suspendedAt);
  if (sessionStartedAt.value) sessionStartedAt.value += pauseMs;
  if (summaryPausedAt) summaryPausedAt += pauseMs;
  if (cardStartedAt) cardStartedAt += pauseMs;
  suspendedAt = 0;
  workspaceVisible = true;
  prefetchCurrentQueue();
  window.addEventListener('keydown', keydown);
  clockTimer = setInterval(updateSessionClock, 1000);
  void loadWorkspace();
});

onUnmounted(() => {
  stopAnswerSound();
  cancelPendingAutoSpeech(true);
  clearPrefetch();
  document.removeEventListener('visibilitychange', stopFeedbackWhenHidden);
  window.removeEventListener('online',prefetchCurrentQueue);
  window.removeEventListener('offline',prefetchCurrentQueue);
  window.removeEventListener('pagehide', stopAnswerSound);
  window.removeEventListener('keydown', keydown);
  window.removeEventListener('kotobud:account-changed', accountChanged);
  accountChannel?.removeEventListener('message', accountChanged);
  accountChannel?.close();
  if (clockTimer) clearInterval(clockTimer);
  stop();
});
</script>

<template>
  <div ref="root" class="learning-workspace" :class="{ 'motion-reduced': motionMode === 'reduced' }">
    <section class="learning-hero" data-motion-enter>
      <div class="learning-hero-copy">
        <p class="learning-kicker"><span></span> KOTOBUD · DAILY STUDY</p>
        <h1>{{ reviewing ? '回看刚才的词' : page === 'study' ? (Object.keys(sessionReadingContextIds).length ? '沿着原句复习' : sessionFeedbackPractice ? '把记忆再稳一稳' : sessionMode === 'new' ? '从一个新词开始' : sessionMode === 'review' ? '把记忆接回来' : '再看一眼难词') : page === 'summary' ? '这一轮，已记下' : '我的词书' }}</h1>
        <p>{{ page === 'study' ? '先想一想，再给这次记忆一个真实的评分。' : page === 'summary' ? '每次练习都会成为下一次复习安排的依据。' : '选一本词书与课次，用适合自己的节奏学习日语。' }}</p>
      </div>
      <div class="learning-seal" aria-hidden="true"><span>ことば</span><strong>学</strong><small>一期一会</small></div>
      <span class="learning-orbit learning-orbit-a" aria-hidden="true"></span>
      <span class="learning-orbit learning-orbit-b" aria-hidden="true"></span>
    </section>

    <div v-if="loading" class="learning-loading" role="status" aria-live="polite"><LoaderCircle class="spin" :size="20" />正在整理你的学习空间…</div>
    <section v-else-if="loadError && !snapshot" class="learning-error" role="alert">
      <div class="learning-state-icon"><CircleHelp :size="21" /></div>
      <h2>学习数据暂时无法载入</h2>
      <p>{{ loadError }}</p>
      <button class="learning-button primary" type="button" @click="loadWorkspace"><RotateCcw :size="16" />重试</button>
    </section>

    <template v-else-if="snapshot">
      <div v-if="catalogError" class="learning-alert" role="status"><span>{{ catalogError }}</span><button type="button" @click="loadWorkspace">重新载入</button></div>
      <div v-if="actionError" class="learning-alert is-error" role="alert"><span>{{ actionError }}</span><button type="button" aria-label="关闭提示" @click="actionError = ''"><X :size="15" /></button></div>
      <p v-if="actionMessage" class="learning-success" role="status"><Check :size="15" />{{ actionMessage }}</p>

      <div v-if="page === 'study' || reviewing" class="history-navigation"><button type="button" :disabled="!canPrevious" @click="previousWord"><ArrowLeft :size="15" aria-hidden="true" />上一个</button><button v-if="reviewing" type="button" @click="returnToCurrent">{{ page === 'summary' ? '返回完成页' : '返回当前词' }}<ArrowRight :size="15" aria-hidden="true" /></button><span v-if="reviewing">回看 {{ (reviewIndex ?? 0) + 1 }} / {{ historyWords.length }} · 不重复评分</span></div>
      <main v-if="reviewWord" class="study-main history-preview"><section class="study-card"><p class="flashcard-label">本轮已处理的词</p><div class="flashcard-face is-revealed"><h2 lang="ja">{{ reviewWord.term }}</h2><p class="flashcard-reading" lang="ja">{{ reviewWord.reading }}</p><MeaningPreview class="flashcard-meaning" :word="reviewWord" /><p v-if="reviewWord.example" lang="ja">{{ reviewWord.example }}</p><p v-if="reviewWord.exampleTranslation">{{ reviewWord.exampleTranslation }}</p></div><button class="dictionary-entry-button" type="button" @click="comparisonOpen = true"><BookOpen :size="15" aria-hidden="true" />词典对照<ChevronRight :size="15" aria-hidden="true" /></button><div class="history-audio"><button class="learning-button secondary" type="button" :disabled="playing" @click="playCurrent()"><Volume2 :size="16" aria-hidden="true" />播放发音</button><button class="learning-button secondary" type="button" :disabled="playing" @click="playCurrent(true)">慢速听</button></div><p v-if="audioSource" class="audio-notice">{{ audioSource }}</p><p v-if="audioError" class="audio-error" role="alert">{{ audioError }}</p></section></main>
      <main v-else-if="page === 'home'" class="learning-main">
        <section v-if="activeBookProgress" class="current-learning-card" data-motion-enter>
          <p class="learning-eyebrow">正在学习</p><h2>{{ activeBookProgress.title }}</h2>
          <p>已学 {{ activeBookProgress.learned }} / {{ activeBookProgress.total }} 词 · {{ activeBookProgress.percent }}%</p>
          <div class="analytics-track"><i :style="{ width: activeBookProgress.percent + '%' }" /></div>
        </section>
        <button class="learning-button secondary ignored-entry" type="button" @click="emit('ignored')"><RotateCcw :size="15" aria-hidden="true" />查看忽略词，恢复学习</button>

        <section v-if="dailyPlan" class="learning-section daily-plan-panel" aria-labelledby="daily-plan-title" data-motion-enter>
          <div class="learning-section-heading"><div><p class="learning-eyebrow">DAY BY DAY / 每日节奏</p><h2 id="daily-plan-title">今天，从这一{{ dailyUnit }}开始</h2><p>{{ activeBookProgress?.title }}</p></div></div>
          <div class="daily-pace-options" role="group" aria-label="每日新词进度"><button type="button" :aria-pressed="dailyPace === 0.5" @click="changeDailyPace(0.5)">半{{ dailyUnit }} / 天</button><button type="button" :aria-pressed="dailyPace === 1" @click="changeDailyPace(1)">一{{ dailyUnit }} / 天</button></div>
          <p class="daily-plan-detail">{{ dailyPlan.lessonTitle || '本书新词已学完' }}<span v-if="dailyPlan.target"> · 今天已学 {{ dailyPlan.completed }} / {{ dailyPlan.target }} 词</span></p>
          <div v-if="dailyPlan.target" class="analytics-track" role="progressbar" :aria-valuenow="dailyPlan.completed" :aria-valuemin="0" :aria-valuemax="dailyPlan.target" aria-label="今日新词计划"><i :style="{ width: `${Math.round(dailyPlan.completed / dailyPlan.target * 100)}%` }" /></div>
          <p v-if="!dailyPlan.remaining" class="daily-plan-note">{{ dailyPlan.target ? '今天的计划已完成，明天再继续。也可以自由选课。' : '可以温习学过的词，或选择其他词书。' }}</p>
          <button v-else class="learning-button primary start-daily-plan" type="button" :disabled="loading || queueBusy" @click="startDailyPlan()"><BookOpen :size="16" aria-hidden="true" />开始今日计划 · {{ dailyPlan.remaining }} 词</button>
        </section>

        <div class="practice-entry-grid" aria-label="把日语用起来"><a class="open-kana" :href="studyHref('/kana')" target="_blank" rel="noopener noreferrer"><strong>五十音</strong><span>认读、发音与笔顺</span><ChevronRight :size="16" aria-hidden="true" /></a><button class="open-scenes" type="button" @click="emit('practice', 'scenes')"><strong>场景学习</strong><span>在生活里认词、接话</span><ChevronRight :size="16" aria-hidden="true" /></button><button class="open-conjugation" type="button" @click="emit('practice', 'conjugation')"><strong>动词活用</strong><span>四种变化，放进句子</span><ChevronRight :size="16" aria-hidden="true" /></button></div>

        <section v-if="resumableItems.length" class="resume-study-card" aria-label="继续上次学习"><div><strong>上次还留了 {{ resumableItems.length }} 个词</strong><p>从未评分的词继续，已保存的进度保留。</p></div><button class="learning-button secondary resume-checkpoint" type="button" :disabled="loading || queueBusy" @click="resumeCheckpoint">继续<ArrowRight :size="15" aria-hidden="true" /></button></section>

        <WeakPracticeSuggestions :suggestions="weakSuggestions" :book-title="activeBookProgress?.title" :busy="loading || queueBusy || busy" @practice="startWeakPractice" />

        <section class="learning-section book-section" data-motion-enter aria-labelledby="books-title">
          <div class="learning-section-heading"><div><p class="learning-eyebrow">LIBRARY / 教材与 JLPT</p><h2 id="books-title">词书与课次</h2><p>选择一本词书，从一课开始。</p></div></div>
          <div class="book-categories" role="group" aria-label="词书分类"><button v-for="item in categories" :key="item.id" type="button" :aria-pressed="category === item.id" @click="category = item.id">{{ item.label }} · {{ item.id === 'all' ? learningBooks.length : learningBooks.filter(book => bookCategory(book) === item.id).length }}</button></div>
          <button class="quiet-button book-select-all" type="button" :disabled="!learningBooks.length" @click="selectAllBooks"><Check :size="15" />全选词书</button>
          <div v-if="!learningBooks.length" class="learning-empty-inline"><BookOpen :size="18" />词库暂时为空。你可以在下方导入自定义词书。</div>
          <div class="learning-book-grid">
            <article v-for="book in visibleBooks" :key="book.id" class="learning-book" :class="{ 'is-selected': selectedBookSet.has(book.id) }">
              <div class="book-head"><ExtensionBookCover :book="book" /><div class="book-meta"><p class="book-category-caption">{{ bookCategory(book) === 'jlpt' ? 'JLPT 备考' : book.source === 'manual' ? '我的词书' : '教材词书' }}</p><h3>{{ book.title }}</h3><p>{{ book.wordCount.toLocaleString('zh-CN') }} 词 · {{ lessonsFor(book.id).length }} {{ bookCategory(book) === 'jlpt' ? '组' : '课' }}</p><span v-if="activeBookId === book.id" class="current-book-label"><Check :size="13" aria-hidden="true" />当前词书</span></div></div>
              <div class="book-progress-copy"><span>已学 {{ bookProgress(book.id)?.learned ?? 0 }} / {{ bookProgress(book.id)?.total ?? book.wordCount }} 词</span><strong>{{ bookProgress(book.id)?.percent ?? 0 }}%</strong></div><div class="analytics-track"><i :style="{ width: (bookProgress(book.id)?.percent ?? 0) + '%' }" /></div>
              <div class="book-bottom"><button type="button" :disabled="queueBusy || (selectedBookIds.length === 1 && selectedBookSet.has(book.id))" @click="useBook(book.id)">{{ selectedBookIds.length === 1 && selectedBookSet.has(book.id) ? '正在学习' : '使用这本词书' }}</button><button type="button" :disabled="!selectedBookSet.has(book.id)" :aria-expanded="expandedBookIds.has(book.id)" @click="toggleExpanded(book.id)">{{ expandedBookIds.has(book.id) ? '收起课次' : '选择课次' }}<ChevronDown :size="14" aria-hidden="true" /></button></div>
              <label class="combination-choice"><input type="checkbox" :checked="selectedBookSet.has(book.id)" :disabled="selectedBookSet.has(book.id) && selectedBookIds.length === 1" @change="toggleBook(book.id)" />加入组合学习范围</label>
              <a v-if="grammarHref(book.id)" class="book-grammar-link" :href="grammarHref(book.id)" target="_blank" rel="noopener noreferrer">本册语法 ↗</a>
              <div v-if="expandedBookIds.has(book.id) && selectedBookSet.has(book.id)" class="lesson-picker">
                <div class="lesson-range">
                  <label>从<select v-model="lessonRanges[book.id].from" :aria-label="`${book.title}范围起始课次`"><option v-for="lesson in lessonsFor(book.id)" :key="lesson.id" :value="lesson.id">{{ lesson.title }}</option></select></label>
                  <ArrowRight :size="14" aria-hidden="true" />
                  <label>到<select v-model="lessonRanges[book.id].to" :aria-label="`${book.title}范围结束课次`"><option v-for="lesson in lessonsFor(book.id)" :key="lesson.id" :value="lesson.id">{{ lesson.title }}</option></select></label>
                  <button type="button" @click="applyLessonRange(book.id)">应用</button>
                </div>
                <div class="lesson-actions"><button type="button" @click="selectBookLessons(book.id)">全选本册</button><button type="button" @click="clearBookLessons(book.id)">清空本册</button></div>
                <div class="lesson-list" :aria-label="`${book.title}课次选择`">
                  <div v-for="lesson in lessonsFor(book.id).slice(0, visibleLessonCount)" :key="lesson.id" class="lesson-option-row">
                    <label class="lesson-option"><input type="checkbox" :checked="isLessonSelected(lesson.id)" @change="toggleLesson(lesson.id)" /><span>{{ lesson.title }}</span><small>{{ lesson.wordCount }}</small></label>
                    <a v-if="grammarHref(book.id, lesson.order)" class="lesson-grammar-link" :href="grammarHref(book.id, lesson.order)"
                      :aria-label="`学习${book.title} ${lesson.title}语法`" target="_blank" rel="noopener noreferrer">语法 ↗</a>
                  </div>
                </div>
                <button v-if="visibleLessonCount < lessonsFor(book.id).length" class="quiet-button" type="button" @click="visibleLessonCount += 6">显示更多课次（{{Math.min(visibleLessonCount, lessonsFor(book.id).length)}} / {{lessonsFor(book.id).length}}）</button>
              </div>
            </article>
          </div>
          <p v-if="selectedLessonIds !== null" class="lesson-scope-note">已按选中的课次筛选学习队列。未勾选任何课次时不会开始学习。</p>
        </section>

        <section class="learning-section study-config" data-motion-enter aria-labelledby="session-title">
          <div class="learning-section-heading">
            <div><p class="learning-eyebrow">MAKE IT YOURS</p><h2 id="session-title">开始一轮学习</h2><p>每次评分都会用 FSRS 安排下次复习。</p></div>
            <span class="session-selection-count">{{ queueCounts[selectedMode] }} <small>个词可学</small></span>
          </div>
          <div class="session-goal"><label>每日目标<input v-model.number="goalInput" type="number" min="1" max="200" step="1" aria-label="每日学习目标次数" :disabled="savingGoal" @change="saveDailyGoal" />次评分</label><span>今天已完成 {{ stats?.todayCount ?? 0 }} 次</span></div>
          <div class="mode-cards" role="group" aria-label="学习内容">
            <button v-for="mode in studyModes" :key="mode.value" type="button" :class="{ 'is-active': selectedMode === mode.value }" :aria-pressed="selectedMode === mode.value" @click="changeMode(mode.value)"><span>{{ mode.title }}</span><small>{{ mode.description }}</small><b>{{ queueCounts[mode.value] }}</b></button>
          </div>
          <div v-if="selectedMode === 'new'" class="new-target-row"><span>本次新词目标</span><input v-model.number="newTarget" type="range" min="10" max="30" step="5" aria-label="本次新词数量" /><strong>{{ newTarget }} 词</strong></div>
          <div class="exercise-section">
            <div class="exercise-heading"><div><p class="learning-eyebrow">EXERCISE TYPE</p><h3>练习方式</h3></div><label>发音<select :value="voice" aria-label="发音声音" @change="onVoiceChange"><option value="female">女声</option><option value="male">男声</option></select></label></div>
            <div class="exercise-grid" role="group" aria-label="练习方式">
              <button v-for="exercise in exerciseChoices" :key="exercise.value" type="button" :class="{ 'is-active': effectiveExercise === exercise.value }" :aria-pressed="effectiveExercise === exercise.value" @click="changeExercise(exercise.value)"><strong>{{ exercise.title }}</strong><small>{{ exercise.detail }}</small></button>
            </div>
            <p class="exercise-footnote"><Volume2 :size="13" />教材发音由 kotobud.com 提供，点击播放时联网获取；手动词条使用设备日语语音。</p>
          </div>
          <button class="learning-button primary start-learning" type="button" :disabled="queueBusy || queueCounts[selectedMode] === 0" @click="startSession()"><LoaderCircle v-if="queueBusy" class="spin" :size="17" /><BookOpen v-else :size="17" />{{ queueBusy ? '正在准备…' : `开始${studyModes.find(item => item.value === selectedMode)?.title} · ${queueCounts[selectedMode]} 词` }}</button>
        </section>

        <details class="learning-section import-section" data-motion-enter aria-labelledby="import-title">
          <summary class="learning-section-heading"><div><p class="learning-eyebrow">BRING YOUR WORDS</p><h2 id="import-title">带上你的词书</h2><p>导入文件、整理词条，也收好遇见的原句</p></div><FileUp :size="19" aria-hidden="true" /></summary>
          <button class="learning-button secondary" type="button" @click="emit('personal')"><BookOpen :size="16" />管理词库、原句与备份</button>
          <div class="import-controls">
            <label class="file-drop" :class="{ 'has-file': selectedFile }"><input ref="importInput" type="file" accept=".csv,.json,text/csv,application/json" @change="selectFile" /><FileUp :size="18" /><span>{{ selectedFile?.name ?? '选择 CSV 或 JSON 文件' }}</span><small>最多 1 MB</small></label>
            <label class="import-title-field">词书名称<input v-model="importTitle" type="text" maxlength="80" placeholder="例如：旅行常用语" /></label>
            <button class="learning-button secondary" type="button" :disabled="!selectedFile || importing" @click="importBook"><LoaderCircle v-if="importing" class="spin" :size="16" /><Download v-else :size="16" />{{ importing ? '正在导入…' : '导入词书' }}</button>
          </div>
          <p class="import-format-note">CSV 必填列：lesson, term, reading, meaning。JSON 可用 [{ lesson: '第1课', term, reading, meaning }] 或 { words: [...] }；词书名称请在上方单独填写。</p>
        </details>

        <footer class="learning-footer"><span><span class="local-dot"></span>记录保存在本机</span><span>教材发音需要网络<span>·</span>账号可同步</span></footer>
      </main>

      <main v-else-if="page === 'study'" class="study-main">
        <div class="study-toolbar">
          <button class="study-back" type="button" @click="leaveSession"><ArrowLeft :size="16" />结束本次学习</button>
          <div><span>{{ activeScene ? activeScene.title : Object.keys(sessionReadingContextIds).length ? '我的原句' : sessionFeedbackPractice ? '巩固练习' : sessionMode === 'new' ? '新词' : sessionMode === 'review' ? '到期复习' : '难词练习' }}</span><strong>{{ Math.min(index + 1, queue.length) }} / {{ queue.length }}</strong></div>
        </div>
        <div class="study-progress" role="progressbar" :aria-valuenow="index" :aria-valuemin="0" :aria-valuemax="queue.length" aria-label="本次学习进度"><i :style="{ width: `${sessionProgress}%` }"></i></div>
        <div class="study-context" data-motion-enter>
          <span class="study-source"><BookOpen :size="14" />{{ currentBook?.title ?? currentWord?.bookTitle }}<i>/</i>{{ currentLesson }}</span>
          <span class="study-number">本轮剩余 {{ remaining }} 词 · {{ formatDuration(elapsedMs) }}</span>
        </div>
        <div class="study-tools">
          <label>练习<select :value="effectiveExercise" :disabled="busy || !!attempt" @change="onExerciseChange"><option v-for="exercise in exerciseChoices" :key="exercise.value" :value="exercise.value">{{ exercise.title }}</option></select></label>
          <label>发音<select :value="voice" aria-label="发音声音" @change="onVoiceChange"><option value="female">女声</option><option value="male">男声</option></select></label>
          <span class="keyboard-hint">按 1–4 选答案 · Space 翻卡/播放</span>
          <p v-if="audioSource" class="actual-audio-source">{{ audioSource }}</p>
        </div>

        <section v-if="currentWord" class="study-card" data-motion-enter aria-live="polite">
          <div class="study-card-top">
            <span class="question-type-label">{{ inputQuestion?.type === 'kana-input' ? '假名键入' : inputQuestion?.type === 'dictation' ? '听写' : clozeQuestion ? '例句填空' : activeQuestionType === 'kana-meaning' ? '假名 · 选择释义' : activeQuestionType === 'kanji-reading' ? '词形 · 选择读音' : activeQuestionType === 'audio-meaning' ? '听音 · 选择释义' : reverseCard ? '释义 · 回忆词形' : '词形 · 回忆释义' }}</span>
            <button class="difficult-toggle" type="button" :aria-pressed="!!currentState?.isDifficult" :disabled="busy" @click="setDifficult"><Flag :size="15" />{{ currentState?.isDifficult ? '已标记难词' : '标记难词' }}</button>
          </div>
          <KanaInputQuestion v-if="inputQuestion" :key="currentWord.id + inputQuestion.type" :question="inputQuestion" :value="inputValue" :attempt="attempt" :busy="busy || attemptBusy" :heard="hasHeardAudio" :audio-error="audioError" :speaking="playing" @update:value="inputValue = $event" @submit="submitInputAnswer" @play="playCurrent($event)" @stop="stop" />
          <ExtensionSentenceCloze v-else-if="clozeQuestion" :question="clozeQuestion" :value="clozeValue" :revealed="revealed" :matches="clozeMatches" :busy="busy || pendingGrade !== null || !!gradeError" :source-label="sessionReadingContextIds[currentWord.id] ? '我的原句' : sessionSceneId ? '场景例句' : undefined" :voice="snapshot?.preferences.voice ?? 'female'" @update:value="clozeValue = $event" @reveal="revealCloze" @grade="rateCurrent" />
          <template v-else-if="activeQuestion">
            <div class="quiz-prompt">
              <template v-if="activeQuestionType === 'audio-meaning'">
                <button class="listen-button" type="button" :disabled="playing || busy" @click="playCurrent()"><LoaderCircle v-if="playing" class="spin" :size="21" /><Headphones v-else :size="21" />{{ playing ? '正在播放…' : hasHeardAudio ? '再听一次' : '播放发音' }}</button>
                <span>{{ hasHeardAudio ? '听一听，再选择最贴近的释义。' : '先点击播放，听过后才能回答。' }}</span>
              </template>
              <template v-else>
                <small>{{ activeQuestionType === 'kana-meaning' ? '读音' : '日语词形' }}</small>
                <strong lang="ja">{{ activeQuestion.prompt }}</strong>
                <button v-if="activeQuestionType === 'kana-meaning'" class="prompt-sound" type="button" :disabled="playing" aria-label="播放当前读音" @click="playCurrent()"><Volume2 :size="17" /></button>
              </template>
            </div>
            <div class="answer-options" role="group" aria-label="选择答案">
              <button v-for="(option, optionIndex) in activeQuestion.options" :key="`${optionIndex}-${option}`" type="button" :disabled="!!attempt || busy || attemptBusy || (activeQuestionType === 'audio-meaning' && !hasHeardAudio)" :class="{ 'is-correct': attempt && option === activeQuestion.correct, 'is-wrong': attempt?.selected === option && !attempt.isCorrect }" @click="chooseAnswer(option)"><span>{{ optionIndex + 1 }}</span>{{ activeQuestionOptionLabels[optionIndex] }}<Check v-if="attempt && option === activeQuestion.correct" :size="16" /><X v-else-if="attempt?.selected === option && !attempt.isCorrect" :size="16" /></button>
            </div>
            <div v-if="attempt" class="answer-feedback" :class="attempt.isCorrect ? 'feedback-correct' : 'feedback-incorrect'" role="status" aria-live="polite"><strong>{{ attempt.isCorrect ? '答对了' : '再记一次' }}</strong><span>{{ attempt.isCorrect ? '不错，给这次记忆一个评分。' : `正确答案：${activeQuestionCorrectLabel}` }}</span><button v-if="attemptError" class="retry-inline" type="button" :disabled="attemptBusy" @click="saveQuizAttempt"><LoaderCircle v-if="attemptBusy" class="spin" :size="13" />{{ attemptBusy ? '保存中…' : '重试保存答题记录' }}</button></div>
            <p v-if="audioNotice" class="audio-notice" role="status">{{ audioNotice }}<button v-if="!activeQuestion" type="button" @click="changeExercise('card')">使用翻卡</button></p>
          </template>
          <template v-else>
            <div class="flashcard-face" :class="{ 'is-revealed': revealed }">
              <p class="flashcard-label">{{ revealed ? (reverseCard ? '词形与读音' : '释义') : (reverseCard ? '先看释义，试着想起日语' : '想一想，这个词是什么意思？') }}</p>
              <template v-if="!revealed">
                <MeaningPreview v-if="reverseCard" class="flashcard-meaning" :word="currentWord" />
                <div v-else class="flashcard-word"><p lang="ja">{{ currentWord.reading }}</p><h2 lang="ja">{{ currentWord.term }}</h2></div>
                <div class="flashcard-actions">
                  <button v-if="!reverseCard" class="small-sound-button" type="button" :disabled="playing" @click="playCurrent()"><Volume2 :size="16" />{{ playing ? '播放中…' : '听发音' }}</button>
                  <button class="flip-button" type="button" @click="revealCard"><BookOpen :size="16" />查看答案</button>
                  <button class="reverse-card-button" type="button" @click="reverseCard = !reverseCard">{{ reverseCard ? '词形先行' : '释义先行' }}</button>
                </div>
              </template>
              <template v-else>
                <h2 v-if="reverseCard" class="flashcard-term" lang="ja">{{ currentWord.term }}<small>{{ currentWord.reading }}</small></h2>
                <MeaningPreview v-else class="flashcard-meaning" :word="currentWord" />
                <span class="flashcard-source"><BookOpen :size="13" />{{ currentWord.bookTitle }}<i>/</i>{{ currentWord.lessonTitle }}</span>
              </template>
            </div>
          </template>

          <p v-if="audioError && !inputQuestion" class="audio-error" role="alert">{{ audioError }}<button type="button" :disabled="playing" @click="playCurrent()">{{ playing ? '正在重试…' : '重试发音' }}</button></p>
          <p v-if="audioNotice && !activeQuestion" class="audio-notice" role="status">{{ audioNotice }}<button type="button" @click="changeExercise('card')">使用翻卡</button></p>
          <p v-if="inputQuestion && attemptError" class="audio-error" role="alert">{{ attemptError }}<button type="button" :disabled="attemptBusy" @click="saveQuizAttempt">重试保存答题记录</button></p>
          <WordLearningNotes v-if="revealed || attempt" :key="currentWord.id" :word="currentWord" :voice="snapshot?.preferences.voice ?? 'female'" :scene-id="sessionSceneId" :expanded="true" :show-example="!clozeQuestion" @conjugation="emit('practice', 'conjugation', $event)" />
          <button v-if="revealed || attempt" class="dictionary-entry-button" type="button" @click="comparisonOpen = true"><BookOpen :size="15" aria-hidden="true" />更多释义 · 词典对照<ChevronRight :size="15" aria-hidden="true" /></button>
          <div v-if="gradeError" class="learning-alert is-error grade-alert" role="alert"><span>{{ gradeError }}</span><button type="button" :disabled="busy" @click="staleReview ? refreshCurrentCard() : pendingGrade !== null && rateCurrent(pendingGrade)"><LoaderCircle v-if="busy" class="spin" :size="14" />{{ staleReview ? '刷新当前卡片' : '重试同一评分' }}</button></div>
          <div v-if="!clozeQuestion" class="rating-panel">
            <p>{{ attempt ? attemptSaved ? '答题反馈已记录。请按记忆难度评分，FSRS 会据此安排下次复习。' : '答题记录保存后，即可按这次记忆情况评分。' : '翻开答案后，按这次实际记忆情况评分。' }}</p>
            <div class="rating-buttons" role="group" aria-label="FSRS 记忆评分">
              <button v-for="grade in grades" :key="grade.value" type="button" :class="[`rating-${grade.value}`, { 'is-recommended': attempt && quizRating(attempt) === grade.value }]" :disabled="!canRate || (pendingGrade !== null && pendingGrade !== grade.value) || (!!attempt && !attemptSaved)" @click="rateCurrent(grade.value)"><strong>{{ grade.title }}</strong><small>{{ grade.english }}</small></button>
            </div>
          </div>
          <div class="study-bottom-actions">
            <span>评分后会更新复习安排</span>
            <button class="ignore-button" type="button" :disabled="busy" @click="ignoreCurrent">忽略此词 <small>i</small></button>
          </div>
        </section>

        <div v-if="lastIgnored" class="undo-ignore-bar" role="status"><span>「{{ lastIgnored.item.word.term }}」已标记为忽略，词条与记录仍保留。</span><button type="button" :disabled="busy" @click="undoIgnore"><RotateCcw :size="14" />撤销忽略</button></div>
        <div v-if="actionError" class="learning-alert is-error" role="alert"><span>{{ actionError }}</span><button type="button" @click="actionError = ''"><X :size="15" /></button></div>
      </main>

      <main v-else class="summary-main">
        <a v-if="relatedGrammar" class="completion-grammar" :href="studyHref(relatedGrammar.href)" target="_blank" rel="noopener noreferrer"><span><strong>接着学第 {{relatedGrammar.order}} 课语法</strong><small>标日{{relatedGrammar.label}} · 讲解与练习</small></span><ArrowRight :size="18" aria-hidden="true" /></a>
        <StudySessionSummary v-if="sessionFeedback" :summary="sessionFeedback" :duration-ms="summaryDurationMs" :skipped="sessionSkipped" :remaining="remaining" :today-count="summaryStats?.todayCount ?? 0" :daily-goal="summaryStats?.dailyGoal ?? 20" :busy="busy || queueBusy" :practice-label="Object.keys(sessionReadingContextIds).length ? '我的原句 · 填空练习' : sessionFeedbackPractice ? '巩固练习' : undefined" :recommendation="relatedPractice" @home="page = 'home'" @resume="resumeStudy" @retry="retrySessionWords" @recommend="practiceRecommended" />
        <div v-if="lastIgnored" class="undo-ignore-bar" role="status"><span>「{{ lastIgnored.item.word.term }}」已标记为忽略，词条与记录仍保留。</span><button type="button" :disabled="busy" @click="undoIgnore"><RotateCcw :size="14" />撤销忽略</button></div>
        <div v-if="actionError" class="learning-alert is-error" role="alert"><span>{{ actionError }}</span><button type="button" @click="actionError = ''"><X :size="15" /></button></div>
      </main>
    </template>
    <DictionaryComparisonPanel v-if="comparisonWord" :open="comparisonOpen" :term="comparisonWord.term" :reading="comparisonWord.reading" :part-of-speech="comparisonWord.partOfSpeech" :owner="snapshot?.identity?.partitionKey ?? 'guest'" @close="comparisonOpen = false" />
  </div>
</template>
