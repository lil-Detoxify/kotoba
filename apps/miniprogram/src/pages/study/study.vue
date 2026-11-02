<script lang="ts">
import { createFriendShare, createTimelineShare } from "../../services/share";
export default {
  onShareAppMessage: createFriendShare,
  onShareTimeline: createTimelineShare,
};
</script>

<script setup lang="ts">
import { useMiniPageActivity } from "../../services/page-motion";
import { computed, nextTick, ref, watch } from "vue";
import { onHide, onLoad, onReady, onShow, onUnload } from "@dcloudio/uni-app";
import { defaultAudioCache, defaultRepository, defaultStorage, defaultSyncCoordinator } from "../../adapters";
import StudyMascot from "../../components/StudyMascot.vue";
import MiniPage from "../../components/MiniPage.vue";
import MiniHeader from "../../components/MiniHeader.vue";
import MiniSkeleton from "../../components/MiniSkeleton.vue";
import MiniNotice from "../../components/MiniNotice.vue";
import MiniDictionaryComparison from "../../components/MiniDictionaryComparison.vue";
import MiniInputQuestion from "../../components/MiniInputQuestion.vue";
import MiniSentenceCloze from "../../components/MiniSentenceCloze.vue";
import MiniSentenceAudio from "../../components/MiniSentenceAudio.vue";
import MiniMeaningText from "../../components/MiniMeaningText.vue";
import MiniUsageNotes from "../../components/MiniUsageNotes.vue";
import MiniReadingContexts from "../../components/MiniReadingContexts.vue";
import MiniStudySummary from "../../components/MiniStudySummary.vue";
import { miniSessionSummary } from "../../services/study-feedback";
import { historicalPracticeWords, parseHistoricalPractice, type HistoricalPractice } from "../../services/historical-practice";
import { conjugationFor } from "../../services/conjugation";
import { sceneFor, sceneExampleFor, resolveSceneWords, sceneStudyWords } from "../../services/learning-scenes";
import { miniAnswerSound } from "../../services/answer-sound";
import { miniDailyStudyPlan, miniDailyStudyWords } from "../../services/daily-study-plan";
import { miniStudyPlanPreference } from "../../services/study-plan-preference";
import { miniStudyCheckpoint, resolveMiniStudyCheckpoint, type MiniStudyCheckpoint } from "../../services/study-checkpoint";
import { createInputQuestion, inputAttempt, type InputQuestion } from "../../services/input-practice";
import { loadBookLearningExamples, hasBookLearningExamples, learningExampleFor, createSentenceCloze, matchesClozeExample, type ClozeQuestion } from "../../services/learning-examples";
import { miniStudyExercisePreference, isMiniStudyExercise, type MiniStudyExercise } from "../../services/study-exercise-preference";
import { createMiniStudyAutoPronunciationGate, miniAutoPronunciationPreference, shouldAutoPronounceAfterReveal, shouldAutoPronounceOnEntry } from "../../services/auto-pronunciation-preference";
import { UniAudioPlayer } from "../../adapters/audio";
import { AudioPreloader } from "../../adapters/audio-preload";
import { AUDIO_VOICE_OPTIONS, getCloudflareAudioUrl, getWordAudioUrl, getWordAudioFallbackUrl, type AudioVoice } from "../../adapters/audio-url";
import { Rating, type Grade } from "ts-fsrs";
import { statistics, stateFor } from "@jp/core";
import type { Data, ExerciseType, StudyMode, Word, QuizAttempt } from "@jp/models";
import { applyStudyRating, getStudyQueue } from "./study-session";
import { createStudyQuestion, hasStudyContent, ratingForStudyAnswer, submitStudyAnswer } from "./study-quiz";
import { defaultTextbooks, textbookCatalog } from "../../services/textbooks";
import { setDifficult, setIgnored } from "../../services/word-flags";
import { setPronunciationVoice } from "../../services/pronunciation";
import {
  miniPersonalClozeExampleFor,
  miniPersonalExampleFor,
  miniReadingContextPracticeWords,
  parseMiniReadingContextIds,
  type MiniReadingContextIds,
} from "../../services/personal-reading-practice";
import { lessonPracticeRecommendation, type LessonPracticeRecommendation } from "../../../../web/src/services/lesson-practice-recommendation";
import { reviewQueueItems } from "../../services/sync-outbox";
import {
  clampStudyMascotPosition,
  DEFAULT_STUDY_MASCOT_POSITION,
  movedBeforeMascotLongPress,
  parseStudyMascotPosition,
  readStudyMascotVisibility,
  STUDY_MASCOT_POSITION_KEY,
  translateStudyMascotPosition,
  writeStudyMascotPosition,
  type StudyMascotBounds,
  type StudyMascotPose,
} from "../../services/mascot";
useMiniPageActivity();

const words = ref<Word[]>([]);
const requestedReadingContextIds = ref<MiniReadingContextIds | null>(null);
const studyPool = ref<Word[]>([]);
const loadedData = ref<Data | null>(null);
const currentIndex = ref(0);
const baseline = ref<number[]>([]);
const sessionSummary = computed(() => loadedData.value ? miniSessionSummary(loadedData.value, words.value, currentIndex.value, baseline.value) : null);
const completionRecommendation = computed(() => {
  const data = loadedData.value;
  const summary = sessionSummary.value;
  if (!finished.value || !data || !summary) return undefined;
  const completedWords = [...summary.newWords, ...summary.reviewWords];
  const ignoredWordIds = new Set(completedWords
    .filter(word => stateFor(data, word.id)?.isIgnored)
    .map(word => word.id));
  return lessonPracticeRecommendation(data, completedWords, { excludeSceneId: requestedScene, ignoredWordIds });
});
const revealed = ref(false);
const currentWord = ref<Word | null>(null);
const finished = ref(false);
const historyWords = ref<Word[]>([]);
const reviewIndex = ref<number | null>(null);
const reviewing = computed(() => reviewIndex.value !== null);
const reviewWord = computed(() => reviewIndex.value === null ? null : historyWords.value[reviewIndex.value] ?? null);
const comparisonOpen = ref(false);
const comparisonWord = computed(() => reviewWord.value ?? currentWord.value);
const inputQuestion = ref<InputQuestion | null>(null);
const inputValue = ref("");
const clozeQuestion = ref<ClozeQuestion | null>(null);
const clozeValue = ref("");
const exampleLoading = ref(false);
const exampleError = ref("");
const examplesRevision = ref(0);
const exerciseFallback = ref("");
const audioError = ref("");
const practiceBusy = computed(() => saving.value || markingDifficult.value || markingIgnored.value || changingVoice.value);
let exampleRequest = 0;
function bookFor(word: Word): string | undefined { return loadedData.value?.lessons.find(lesson => lesson.id === word.lessonId)?.bookId; }
function exampleFor(word: Word) {
  examplesRevision.value;
  const sceneExample = sceneExampleFor(requestedScene, word);
  if (sceneExample) return sceneExample;
  if (requestedReadingContextIds.value !== null) {
    const contextId = requestedReadingContextIds.value[word.id];
    return contextId ? miniPersonalExampleFor(word, contextId) : undefined;
  }
  return word.example ? { ja: word.example, reading: word.exampleReading || "", zh: word.exampleTranslation || "" } : learningExampleFor(word, bookFor(word));
}
const displayExample = computed(() => { const word = reviewWord.value ?? currentWord.value; return word ? exampleFor(word) : undefined; });
const relatedVerb = computed(() => comparisonWord.value ? conjugationFor(comparisonWord.value) : undefined);
function openConjugation() {
  if (relatedVerb.value && !practiceBusy.value) uni.navigateTo({ url: `/pages/conjugation/conjugation?verbId=${encodeURIComponent(relatedVerb.value.id)}` });
}
function openPracticeRecommendation(recommendation: LessonPracticeRecommendation) {
  if (recommendation.kind === "scene") {
    uni.navigateTo({ url: `/pages/scenes/scenes?sceneId=${encodeURIComponent(recommendation.scene.id)}` });
  } else {
    uni.navigateTo({ url: `/pages/conjugation/conjugation?verbId=${encodeURIComponent(recommendation.verb.id)}` });
  }
}
const clozeMatches = computed(() => !!clozeQuestion.value && matchesClozeExample(clozeQuestion.value, clozeValue.value));
watch(() => [currentWord.value?.id, reviewWord.value?.id], () => { comparisonOpen.value = false; });
const canPrevious = computed(() => !saving.value && !markingDifficult.value && !markingIgnored.value && !changingVoice.value
  && (reviewIndex.value === null ? historyWords.value.length > 0 : reviewIndex.value > 0));
let reviewStartedAt: number | null = null;
let studyEpoch = 0;
const message = ref("");
const saving = ref(false);
const savingGrade = ref<Grade | null>(null);
const speaking = ref(false);
const loading = ref(true);
const loadError = ref("");
const emptyQueue = ref(false);
const mode = ref<StudyMode>("new");
const voice = ref<"female" | "male">("female");
const exercise = ref<MiniStudyExercise>("card");
const preferredExercise = ref<MiniStudyExercise>("card");
const question = ref<ReturnType<typeof createStudyQuestion>>(null);
const showGenericAudioControls = computed(() => question.value?.type !== "audio-meaning" && inputQuestion.value?.type !== "dictation");
const attempt = ref<QuizAttempt | null>(null);
const heard = ref(false);
const uncertain = ref(false);
const streak = ref(0);
const isDifficult = ref(false);
const mascotVisible = ref(true);
const mascotPose = ref<StudyMascotPose>("studying");
const mascotPosition = ref({ ...DEFAULT_STUDY_MASCOT_POSITION });
const mascotStyleBounds = ref<StudyMascotBounds>({ width: 0, height: 0, mascotWidth: 0, mascotHeight: 0 });
const mascotPositionReady = ref(false);
const mascotDisplayPosition = computed(() => clampStudyMascotPosition(mascotPosition.value, mascotStyleBounds.value));
const mascotPositionStyle = computed(() => ({
  left: `${mascotDisplayPosition.value.x * mascotStyleBounds.value.width}px`,
  top: `${mascotDisplayPosition.value.y * mascotStyleBounds.value.height}px`,
}));
const markingDifficult = ref(false);
const markingIgnored = ref(false);
const changingVoice = ref(false);
const changingVoiceTo = ref<AudioVoice | null>(null);
const startedAt = ref(Date.now());
const ratingOptions = [
  { grade: Rating.Again, label: "忘记了", hint: "还没记住", style: "again" },
  { grade: Rating.Hard, label: "模糊", hint: "费力想起", style: "hard" },
  { grade: Rating.Good, label: "记得", hint: "正常想起", style: "good" },
] as const;

// Each page owns its player; unloading must not destroy the next page's audio.
let player: UniAudioPlayer | undefined;
let audioGeneration = 0;
let disposed = false;
let visible = true;
let initializing = false;
let pendingAutoEntry = false;
let requestedLesson: string | undefined;
let requestedMode: string | undefined;
let requestedExercise: string | undefined;
let requestedScene: string | undefined;
const requestedDailyBook = ref("");
const dailyPlanCaption = ref("");
const requestedResume = ref(false);
const requestedScopeBook = ref("");
const requestedPracticeIds = ref<string[] | null>(null);
const requestedHistoricalPractice = ref<HistoricalPractice | null>(null);
let checkpointWrite: Promise<void> = Promise.resolve();
let sessionKey = defaultRepository.getActiveKey();
let mascotReactionTimer: ReturnType<typeof setTimeout> | undefined;
let touchStartX = 0;
let touchStartY = 0;
let touchStarted = false;
let suppressTapUntil = 0;
let mascotBounds: StudyMascotBounds | undefined;
let mascotPressStart: { x: number; y: number } | undefined;
let mascotPressOrigin = { ...DEFAULT_STUDY_MASCOT_POSITION };
let mascotPressPending = false;
let mascotDragActive = false;
let mascotResizeListening = false;
let mascotUsesCardPlacement = true;
let audioTraceStart: number | undefined;
let preloadTraceStart: number | undefined;
const audioDiagnosticsEnabled = import.meta.env.DEV;
const preloader = new AudioPreloader(defaultAudioCache, {
  onDiagnostic: (event) => {
    if (!audioDiagnosticsEnabled) return;
    if (event.type === "downloadStart") preloadTraceStart = Date.now();
    if (preloadTraceStart !== undefined) console.info(`[KotoBud audio] preload.${event.type}: ${Date.now() - preloadTraceStart}ms`);
    traceAudioStage(`download.${event.type}`);
  },
});
const autoPronunciationGate = createMiniStudyAutoPronunciationGate();
const AUTO_PRONUNCIATION_START_DELAY_MS = 120;
const AUTO_PRONUNCIATION_RETRY_DELAY_MS = 100;
let autoPronunciationTimer: ReturnType<typeof setTimeout> | undefined;
let autoPronunciationScheduleRevision = 0;
let pendingAutoPronunciation: { revision: number; owner: string; wordId: string } | undefined;
let automaticPronunciationInFlight: { owner: string; wordId: string; ticket: number; started: boolean } | undefined;
let answerSoundPlayback: Promise<boolean> = Promise.resolve(false);

function traceAudioStage(stage: string): void {
  if (!audioDiagnosticsEnabled || audioTraceStart === undefined) return;
  // Deliberately log timing only: no audio URLs, words, account data or native errors.
  console.info(`[KotoBud audio] ${stage}: ${Date.now() - audioTraceStart}ms`);
}

function resolveStudyAudioUrl(word: Word): string | undefined {
  return hasStudyContent(word.reading)
    ? getWordAudioUrl(word, voice.value)
    : getWordAudioFallbackUrl(word);
}

const progressLabel = computed(() => `${currentIndex.value} / ${words.value.length}`);
const progressPercent = computed(() => words.value.length ? currentIndex.value / words.value.length * 100 : 0);
const modeLabel = computed(() => requestedScene ? "场景词汇" : requestedHistoricalPractice.value ? "历史错词重练" : requestedReadingContextIds.value !== null ? "我的原句" : mode.value === "review" ? "到期复习" : requestedPracticeIds.value ? "重点巩固" : mode.value === "difficult" ? "难词巩固" : requestedDailyBook.value ? "今日计划" : "新词学习");
const audioUrl = computed(() => {
  const word = reviewWord.value ?? currentWord.value;
  if (!word) return undefined;
  const started = Date.now();
  const resolved = resolveStudyAudioUrl(word);
  if (import.meta.env.DEV) console.info(`[KotoBud audio] urlCompute: ${Date.now() - started}ms`);
  return resolved;
});
const exerciseOptions: Array<{ value: MiniStudyExercise; label: string }> = [
  { value: "card", label: "卡片" }, { value: "mixed", label: "混合" },
  { value: "kana-meaning", label: "假名选义" }, { value: "kanji-reading", label: "汉字选音" },
  { value: "audio-meaning", label: "听音选义" },
  { value: "kana-input", label: "假名键入" }, { value: "dictation", label: "听写" }, { value: "cloze", label: "例句填空" },
];

async function initStudy(lessonId = requestedLesson, selectedMode = requestedMode, selectedExercise = requestedExercise) {
  if (initializing || disposed) return;
  stopAudio();
  preloader.cancel();
  autoPronunciationGate.reset();
  requestedLesson = lessonId;
  requestedMode = selectedMode;
  requestedExercise = selectedExercise;
  initializing = true;
  studyEpoch++;
  historyWords.value = [];
  reviewIndex.value = null;
  reviewStartedAt = null;
  loading.value = true;
  loadError.value = "";
  dailyPlanCaption.value = "";
  emptyQueue.value = false;
  finished.value = false;
  currentWord.value = null;
  message.value = "";
  question.value = null;
  attempt.value = null;
  heard.value = false;
  uncertain.value = false;
  mode.value = requestedScene || requestedReadingContextIds.value !== null ? 'difficult' : selectedMode === "review" || selectedMode === "difficult" ? selectedMode : "new";
  let validExercise = isMiniStudyExercise(selectedExercise) ? selectedExercise : undefined;
  requestedExercise = validExercise;
  preferredExercise.value = validExercise ?? (mode.value === "review" ? "mixed" : "card");
  exercise.value = preferredExercise.value;
  sessionKey = defaultRepository.getActiveKey();
  const key = sessionKey;
  try {
    const checkpoint = requestedResume.value ? await miniStudyCheckpoint.load(key) : null;
    if (requestedResume.value && !checkpoint) {
      await miniAutoPronunciationPreference.load();
      loadedData.value = await defaultTextbooks.hydrate(key);
      words.value = []; currentIndex.value = 0; emptyQueue.value = true; loadWord(); return;
    }
    if (checkpoint) {
      requestedScene = checkpoint.sceneId;
      requestedDailyBook.value = checkpoint.dailyBookId || "";
      requestedLesson = lessonId = checkpoint.lessonId;
      requestedMode = mode.value = checkpoint.mode;
      requestedExercise = validExercise = checkpoint.exercise;
      requestedReadingContextIds.value = checkpoint.readingContextIds ? { ...checkpoint.readingContextIds } : null;
      requestedHistoricalPractice.value = checkpoint.feedback ?? null;
    }
    const scene = requestedScene ? sceneFor(requestedScene) : undefined;
    if (requestedScene && !scene) throw new Error('Scene unavailable');
    const dailyBookId = !scene && !lessonId && mode.value === "new" ? requestedDailyBook.value : "";
    const prepare = async () => {
      if (checkpoint) {
        let snapshot = await defaultTextbooks.hydrate(key);
        for (const bookId of checkpoint.bookIds) {
          if (!snapshot.books.some(book => book.id === bookId)) continue;
          snapshot = await defaultTextbooks.ensureBookLoaded(bookId, key);
          if (disposed || key !== defaultRepository.getActiveKey()) throw new Error('Account changed');
        }
        return snapshot;
      }
      if (requestedHistoricalPractice.value) return defaultTextbooks.ensureBookLoaded(requestedHistoricalPractice.value.bookId, key);
      if (requestedReadingContextIds.value !== null) {
        let snapshot = await defaultTextbooks.hydrate(key);
        const books = new Set(Object.keys(requestedReadingContextIds.value).map(id => snapshot.states.find(state => state.wordId === id)?.bookId
          || snapshot.lessons.find(lesson => lesson.id === snapshot.words.find(word => word.id === id)?.lessonId)?.bookId
          || textbookCatalog.find(book => id.startsWith(`${book.id}-w-`))?.id).filter((id): id is string => !!id));
        for (const bookId of books) {
          snapshot = await defaultTextbooks.ensureBookLoaded(bookId, key);
          if (disposed || key !== defaultRepository.getActiveKey()) throw new Error("Account changed");
        }
        return snapshot;
      }
      if (requestedPracticeIds.value !== null) {
        let snapshot = await defaultTextbooks.hydrate(key);
        const books = new Set(requestedPracticeIds.value.map(id => snapshot.states.find(state => state.wordId === id)?.bookId
          || snapshot.lessons.find(lesson => lesson.id === snapshot.words.find(word => word.id === id)?.lessonId)?.bookId
          || textbookCatalog.find(book => id.startsWith(`${book.id}-w-`))?.id).filter((id): id is string => !!id));
        for (const bookId of books) snapshot = await defaultTextbooks.ensureBookLoaded(bookId, key);
        return snapshot;
      }
      if (requestedScopeBook.value && !lessonId) return defaultTextbooks.ensureBookLoaded(requestedScopeBook.value, key);
      if (dailyBookId) return defaultTextbooks.ensureBookLoaded(dailyBookId, key);
      if (!scene) return defaultTextbooks.prepareStudy(lessonId, mode.value);
      let snapshot = await defaultTextbooks.hydrate(key);
      for (const bookId of new Set(scene.items.map(item => item.bookId))) {
        snapshot = await defaultTextbooks.ensureBookLoaded(bookId, key);
        if (disposed || defaultRepository.getActiveKey() !== key) throw new Error('Account changed');
      }
      if (resolveSceneWords(scene, snapshot).length !== scene.items.length) throw new Error('Scene words unavailable');
      return snapshot;
    };
    let [data] = await Promise.all([prepare(), miniStudyExercisePreference.load(), miniAutoPronunciationPreference.load(), dailyBookId ? miniStudyPlanPreference.load() : Promise.resolve()]);
    if (requestedHistoricalPractice.value) data = await defaultRepository.read(key);
    if (disposed) return;
    if (defaultRepository.getActiveKey() !== key) throw new Error("Account changed");
    loadedData.value = data;
    preferredExercise.value = validExercise ?? (miniStudyExercisePreference.state.value !== 'auto' ? miniStudyExercisePreference.state.value : mode.value === 'review' ? 'mixed' : 'card');
    exercise.value = preferredExercise.value;
    if (checkpoint) words.value = resolveMiniStudyCheckpoint(data, checkpoint);
    else if (requestedHistoricalPractice.value) words.value = historicalPracticeWords(data, requestedHistoricalPractice.value);
    else if (requestedReadingContextIds.value !== null) words.value = miniReadingContextPracticeWords(data, requestedReadingContextIds.value);
    else if (requestedPracticeIds.value !== null) {
      const byId = new Map(data.words.map(word => [word.id, word]));
      words.value = requestedPracticeIds.value.flatMap(id => { const word = byId.get(id); return word && !stateFor(data, id)?.isIgnored ? [word] : []; });
    } else if (dailyBookId) {
      const pace = miniStudyPlanPreference.getPace(dailyBookId);
      const now = new Date();
      const plan = miniDailyStudyPlan(data, dailyBookId, pace, now);
      words.value = miniDailyStudyWords(data, dailyBookId, pace, now);
      dailyPlanCaption.value = `${plan.lessonTitle ? `${plan.lessonTitle} · ` : ""}${pace === .5 ? "半" : "一"}${dailyBookId.startsWith("jlpt-") ? "组" : "课"} / 天`;
    } else {
      const scope = requestedScopeBook.value ? new Set(data.lessons.filter(lesson => lesson.bookId === requestedScopeBook.value).map(lesson => lesson.id)) : null;
      words.value = scene ? sceneStudyWords(scene, data) : getStudyQueue(scope ? { ...data, words: data.words.filter(word => scope.has(word.lessonId)) } : data, mode.value, lessonId);
    }
    studyPool.value = data.words;
    baseline.value = words.value.map(word => stateFor(data, word.id)?.reviewCount || 0);
    currentIndex.value = 0;
    voice.value = data.userSettings?.preferences?.pronunciationVoice === "male" ? "male" : "female";
    streak.value = statistics(data).streak;
    emptyQueue.value = words.value.length === 0;
    loadWord();
  } catch {
    if (!disposed) loadError.value = requestedScene ? '场景词汇暂时无法读取，请返回场景页重试。' : requestedReadingContextIds.value !== null ? '所选原句暂时无法读取，请返回我的原句重新选择。' : "学习记录暂时无法读取，请重试。原有记录未被覆盖。";
  } finally {
    initializing = false;
    if (!disposed) {
      loading.value = false;
      void nextTick(() => { void refreshMascotLayout(); });
    }
  }
}

function stopAudio(resumeUnstartedAutoReadOnShow = false) {
  const shouldResumeAutoRead = resumeUnstartedAutoReadOnShow && (pendingAutoEntry || !!pendingAutoPronunciation
    || (!!automaticPronunciationInFlight && !automaticPronunciationInFlight.started));
  cancelPendingAutoPronunciation();
  automaticPronunciationInFlight = undefined;
  pendingAutoEntry = shouldResumeAutoRead;
  miniAnswerSound.stop();
  answerSoundPlayback = Promise.resolve(false);
  audioGeneration++;
  player?.stop();
  speaking.value = false;
}

function previousWord() {
  if (!canPrevious.value || disposed || !visible || defaultRepository.getActiveKey() !== sessionKey) return;
  stopAudio();
  preloader.cancel();
  clearMascotReactionTimer();
  onTouchCancel();
  onMascotTouchCancel();
  if (reviewIndex.value === null) {
    reviewStartedAt = Date.now();
    reviewIndex.value = historyWords.value.length - 1;
  } else reviewIndex.value--;
}

function returnToCurrent() {
  if (!reviewing.value || saving.value || markingIgnored.value || markingDifficult.value || changingVoice.value) return;
  stopAudio();
  if (reviewStartedAt !== null) startedAt.value += Math.max(0, Date.now() - reviewStartedAt);
  reviewIndex.value = null;
  reviewStartedAt = null;
  preloadNearbyWords();
}

function preloadNearbyWords(): void {
  if (!visible || disposed || !currentWord.value) { preloader.cancel(); return; }
  const started = Date.now();
  const urls = words.value.slice(currentIndex.value, currentIndex.value + 3)
    .map(resolveStudyAudioUrl)
    .filter((url): url is string => !!url);
  if (audioDiagnosticsEnabled) console.info(`[KotoBud audio] preloadUrlCompute: ${Date.now() - started}ms`);
  preloader.schedule(urls);
}

function loadWord() {
  exampleRequest++;
  exampleLoading.value = false;
  exampleError.value = "";
  audioError.value = "";
  exerciseFallback.value = "";
  inputQuestion.value = null;
  inputValue.value = "";
  clozeQuestion.value = null;
  clozeValue.value = "";
  clearMascotReactionTimer();
  stopAudio();
  touchStarted = false;
  clearMascotDragState();
  attempt.value = null;
  heard.value = false;
  uncertain.value = false;
  question.value = null;
  exercise.value = preferredExercise.value;
  revealed.value = false;
  currentWord.value = words.value[currentIndex.value] || null;
  preloadNearbyWords();
  isDifficult.value = !!loadedData.value?.states.find((state) => state.wordId === currentWord.value?.id)?.isDifficult;
  finished.value = words.value.length > 0 && !currentWord.value;
  mascotPose.value = finished.value ? "complete" : mode.value === "review" ? "review" : "studying";
  startedAt.value = Date.now();
  if (currentWord.value && (exercise.value === 'kana-input' || exercise.value === 'dictation')) {
    const candidate = createInputQuestion(currentWord.value, exercise.value);
    if (candidate && (candidate.type === 'dictation' ? !!audioUrl.value : hasStudyContent(candidate.prompt))) inputQuestion.value = candidate;
    else { exercise.value = 'card'; exerciseFallback.value = '这个词暂时不适合键入练习，先用卡片学习。'; }
  } else if (currentWord.value && exercise.value === 'cloze') {
    if (requestedReadingContextIds.value !== null) {
      const contextId = requestedReadingContextIds.value[currentWord.value.id];
      const example = contextId ? miniPersonalClozeExampleFor(currentWord.value, contextId) : undefined;
      clozeQuestion.value = example ? createSentenceCloze(currentWord.value, example, undefined) : null;
      if (!clozeQuestion.value) {
        exercise.value = 'card';
        exerciseFallback.value = contextId ? '这条原句暂不适合填空，先读句子并用卡片复习。' : '这条原句已修改或移除，先用卡片复习。';
      }
    } else {
      clozeQuestion.value = createSentenceCloze(currentWord.value, sceneExampleFor(requestedScene, currentWord.value), bookFor(currentWord.value));
    }
  } else if (currentWord.value && exercise.value !== "card" && exercise.value !== 'kana-input' && exercise.value !== 'dictation' && exercise.value !== 'cloze') {
    const candidate = createStudyQuestion(currentWord.value, studyPool.value, exercise.value, Math.random, () => !!audioUrl.value);
    question.value = candidate;
    if (!question.value) exercise.value = "card";
  }
  if (currentWord.value) void prepareExamples(currentWord.value);
  maybeAutoPronounceOnEntry();
  persistStudyCheckpoint();
  void nextTick(() => { void refreshMascotLayout(); });
}

function maybeAutoPronounceOnEntry(): void {
  pendingAutoEntry = false;
  if (!miniAutoPronunciationPreference.state.enabled || !shouldAutoPronounceOnEntry(exercise.value, question.value?.type, inputQuestion.value?.type)) return;
  if (!visible || saving.value) { pendingAutoEntry = true; return; }
  autoPronounceCurrentWord();
}

function maybeAutoPronounceAfterReveal(): void {
  if (!miniAutoPronunciationPreference.state.enabled) return;
  if (shouldAutoPronounceAfterReveal(exercise.value, question.value?.type, inputQuestion.value?.type)) {
    autoPronounceCurrentWord();
  }
}

function autoPronounceCurrentWord(): void {
  const word = currentWord.value;
  if (!word || reviewing.value || !visible || disposed || speaking.value || !audioUrl.value) return;
  const owner = sessionKey;
  if (pendingAutoPronunciation?.owner === owner && pendingAutoPronunciation.wordId === word.id) return;
  cancelPendingAutoPronunciation();
  const revision = ++autoPronunciationScheduleRevision;
  pendingAutoPronunciation = { revision, owner, wordId: word.id };
  const startWhenReady = async () => {
    if (pendingAutoPronunciation?.revision !== revision) return;
    try { await answerSoundPlayback; } catch { /* Feedback failure must not block pronunciation. */ }
    if (pendingAutoPronunciation?.revision !== revision) return;
    if (!miniAutoPronunciationPreference.state.enabled || !visible || disposed
      || owner !== defaultRepository.getActiveKey() || owner !== sessionKey || currentWord.value?.id !== word.id) {
      cancelPendingAutoPronunciation();
      return;
    }
    if (speaking.value) {
      autoPronunciationTimer = setTimeout(() => { autoPronunciationTimer = undefined; void startWhenReady(); }, AUTO_PRONUNCIATION_RETRY_DELAY_MS);
      return;
    }
    pendingAutoPronunciation = undefined;
    autoPronunciationTimer = undefined;
    void playAudio(false, true);
  };
  autoPronunciationTimer = setTimeout(() => {
    autoPronunciationTimer = undefined;
    void startWhenReady();
  }, AUTO_PRONUNCIATION_START_DELAY_MS);
}

function cancelPendingAutoPronunciation(): void {
  if (autoPronunciationTimer !== undefined) clearTimeout(autoPronunciationTimer);
  autoPronunciationTimer = undefined;
  pendingAutoPronunciation = undefined;
  autoPronunciationScheduleRevision++;
}

function playAnswerFeedback(correct: boolean): void {
  answerSoundPlayback = miniAnswerSound.play(correct);
  void answerSoundPlayback.catch(() => false);
}

function persistStudyCheckpoint() {
  const data = loadedData.value;
  const owner = sessionKey;
  if (!data || owner !== defaultRepository.getActiveKey()) return;
  const remaining = words.value.slice(currentIndex.value);
  const remainingIds = new Set(remaining.map(word => word.id));
  const lessonBooks = new Map(data.lessons.map(lesson => [lesson.id, lesson.bookId]));
  const readingContextIds = requestedReadingContextIds.value === null ? undefined : Object.fromEntries(
    Object.entries(requestedReadingContextIds.value).filter(([wordId]) => remainingIds.has(wordId)),
  );
  const checkpoint: MiniStudyCheckpoint = {
    version: 1, owner, wordIds: remaining.map(word => word.id),
    bookIds: [...new Set(remaining.map(word => lessonBooks.get(word.lessonId)).filter((id): id is string => !!id))],
    mode: mode.value, exercise: preferredExercise.value, lessonId: requestedLesson, dailyBookId: requestedDailyBook.value || undefined,
    sceneId: requestedScene, updatedAt: new Date().toISOString(),
    ...(readingContextIds && Object.keys(readingContextIds).length ? { readingContextIds } : {}),
    ...(requestedHistoricalPractice.value ? { feedback: requestedHistoricalPractice.value } : {}),
  };
  checkpointWrite = checkpointWrite.catch(() => undefined).then(async () => {
    if (owner !== defaultRepository.getActiveKey()) return;
    if (checkpoint.wordIds.length) await miniStudyCheckpoint.save(checkpoint);
    else await miniStudyCheckpoint.clear(owner);
  }).catch(() => { if (!disposed && visible && owner === defaultRepository.getActiveKey()) message.value = "学习记录已保留，续学位置暂时未能保存。"; });
}

async function prepareExamples(word = currentWord.value, retry = false) {
  if (!word) return;
  const sceneExample = sceneExampleFor(requestedScene, word);
  if (sceneExample) {
    exampleLoading.value = false;
    if (preferredExercise.value === 'cloze' && !revealed.value && !attempt.value) {
      clozeQuestion.value = createSentenceCloze(word, sceneExample, bookFor(word));
      if (clozeQuestion.value) exercise.value = 'cloze';
    }
    return;
  }
  if (requestedReadingContextIds.value !== null) {
    exampleLoading.value = false;
    if (preferredExercise.value === 'cloze' && !revealed.value && !attempt.value) {
      const contextId = requestedReadingContextIds.value[word.id];
      const example = contextId ? miniPersonalClozeExampleFor(word, contextId) : undefined;
      const candidate = example ? createSentenceCloze(word, example, undefined) : null;
      if (candidate) {
        clozeQuestion.value = candidate;
        exercise.value = 'cloze';
        exerciseFallback.value = '';
      } else {
        clozeQuestion.value = null;
        exercise.value = 'card';
        exerciseFallback.value = contextId ? '这条原句暂不适合填空，先读句子并用卡片复习。' : '这条原句已修改或移除，先用卡片复习。';
      }
    }
    return;
  }
  const bookId = bookFor(word);
  if (!bookId) {
    if (preferredExercise.value === 'cloze' && !clozeQuestion.value) { exercise.value = 'card'; exerciseFallback.value = '这个词暂无可用填空例句，先用卡片学习。'; }
    return;
  }
  const ticket = ++exampleRequest, key = sessionKey, wordId = word.id;
  const active = () => ticket === exampleRequest && !disposed && visible && key === defaultRepository.getActiveKey() && currentWord.value?.id === wordId;
  exampleLoading.value = !hasBookLearningExamples(bookId);
  if (retry) exampleError.value = '';
  try {
    await loadBookLearningExamples(bookId);
    if (!active()) return;
    examplesRevision.value++;
    if (preferredExercise.value === 'cloze' && !revealed.value && !attempt.value) {
      const candidate = createSentenceCloze(word, undefined, bookId);
      if (candidate) { clozeQuestion.value = candidate; exercise.value = 'cloze'; exerciseFallback.value = ''; }
      else { exercise.value = 'card'; exerciseFallback.value = '这个词暂无可用填空例句，先用卡片学习。'; }
    }
  } catch {
    if (!active()) return;
    exampleError.value = '学习例句暂时无法读取，可以重试。';
    if (preferredExercise.value === 'cloze' && !clozeQuestion.value) { exercise.value = 'card'; exerciseFallback.value = '例句暂时不可用，先用卡片学习。'; }
  } finally { if (active()) exampleLoading.value = false; }
}

function clearMascotReactionTimer() {
  if (mascotReactionTimer !== undefined) {
    clearTimeout(mascotReactionTimer);
    mascotReactionTimer = undefined;
  }
}

function restoreMascotBasePose() {
  mascotPose.value = finished.value ? "complete" : mode.value === "review" ? "review" : "studying";
}

function showRatingReaction(pose: "correct" | "wrong") {
  clearMascotReactionTimer();
  if (!mascotVisible.value || !visible || disposed || finished.value) return;
  mascotPose.value = pose;
  mascotReactionTimer = setTimeout(() => {
    mascotReactionTimer = undefined;
    if (!visible || disposed || finished.value) return;
    restoreMascotBasePose();
  }, 900);
}

async function toggleDifficult() {
  if (reviewing.value || !currentWord.value || markingDifficult.value || markingIgnored.value || changingVoice.value || saving.value || disposed) return;
  if (defaultRepository.getActiveKey() !== sessionKey) {
    message.value = "账户已切换，请返回首页后重新开始学习。";
    return;
  }
  const word = currentWord.value;
  const nextValue = !isDifficult.value;
  markingDifficult.value = true;
  try {
    const updated = await setDifficult(word.id, nextValue, defaultRepository);
    if (disposed || defaultRepository.getActiveKey() !== sessionKey || currentWord.value?.id !== word.id) return;
    loadedData.value = updated;
    isDifficult.value = nextValue;
    message.value = isDifficult.value ? "已标记为难词" : "已取消难词标记";
  } catch {
    message.value = "难词标记保存失败，请重试";
  } finally {
    markingDifficult.value = false;
  }
}

async function ignoreCurrentWord() {
  if (reviewing.value || !currentWord.value || markingIgnored.value || markingDifficult.value || changingVoice.value || saving.value || attempt.value || disposed) return;
  if (defaultRepository.getActiveKey() !== sessionKey) {
    message.value = "账户已切换，请返回首页后重新开始学习。";
    return;
  }
  const word = currentWord.value;
  const epoch = studyEpoch;
  const key = sessionKey;
  markingIgnored.value = true;
  try {
    const updated = await setIgnored(word.id, true, defaultRepository);
    if (disposed || studyEpoch !== epoch || defaultRepository.getActiveKey() !== key || currentWord.value?.id !== word.id) return;
    loadedData.value = updated;
    if (visible) historyWords.value = [...historyWords.value, word];
    currentIndex.value++;
    loadWord();
    message.value = "已忽略，可在生词本中恢复";
    void defaultSyncCoordinator.flush("timer");
  } catch {
    if (!disposed) message.value = "忽略操作保存失败，请重试";
  } finally {
    if (!disposed) markingIgnored.value = false;
  }
}

async function selectVoice(value: AudioVoice) {
  if (value === voice.value || changingVoice.value || markingIgnored.value || markingDifficult.value || saving.value || disposed) return;
  if (defaultRepository.getActiveKey() !== sessionKey) {
    message.value = "账户已切换，请返回首页后重新开始学习。";
    return;
  }
  changingVoice.value = true;
  changingVoiceTo.value = value;
  stopAudio();
  heard.value = false;
  audioError.value = '';
  try {
    const updated = await setPronunciationVoice(value, defaultRepository);
    if (disposed || defaultRepository.getActiveKey() !== sessionKey) return;
    loadedData.value = updated;
    voice.value = value;
    preloadNearbyWords();
    message.value = `已切换为${AUDIO_VOICE_OPTIONS.find((item) => item.value === value)?.label ?? "所选发音"}`;
    void defaultSyncCoordinator.flush("timer");
  } catch {
    if (!disposed) message.value = "发音偏好保存失败，请重试";
  } finally {
    if (!disposed) {
      changingVoice.value = false;
      changingVoiceTo.value = null;
    }
  }
}

function selectExercise(value: MiniStudyExercise) {
  if (reviewing.value || saving.value || markingDifficult.value || markingIgnored.value || changingVoice.value || attempt.value || value === preferredExercise.value) return;
  preferredExercise.value = value;
  exercise.value = value;
  requestedExercise = value;
  requestedHistoricalPractice.value = null;
  loadWord();
}

function submitAnswer(selected: string | null) {
  if (reviewing.value || !question.value || attempt.value || saving.value || (question.value.type === "audio-meaning" && !heard.value)) return;
  attempt.value = submitStudyAnswer(question.value, selected);
  revealed.value = true;
  stopAudio();
  maybeAutoPronounceAfterReveal();
  playAnswerFeedback(attempt.value.isCorrect);
  mascotPose.value = attempt.value.isCorrect ? "correct" : "wrong";
  void nextTick(() => { void refreshMascotLayout(); });
}

function submitInputAnswer(value: string | null) {
  if (reviewing.value || !inputQuestion.value || attempt.value || practiceBusy.value || disposed || !visible) return;
  if (inputQuestion.value.type === 'dictation' && (!heard.value || audioError.value)) return;
  attempt.value = inputAttempt(inputQuestion.value, value);
  revealed.value = true;
  stopAudio();
  maybeAutoPronounceAfterReveal();
  playAnswerFeedback(attempt.value.isCorrect);
  mascotPose.value = attempt.value.isCorrect ? 'correct' : 'wrong';
  void nextTick(() => { void refreshMascotLayout(); });
}
function revealCloze() {
  if (!clozeQuestion.value || reviewing.value || practiceBusy.value) return;
  revealed.value = true;
  maybeAutoPronounceAfterReveal();
  uni.hideKeyboard();
}

function playQuestionAudio(slow = false) { if (question.value?.type === "audio-meaning") void playAudio(slow); }

function audioFailed() {
  audioError.value = '读音暂时无法播放，请重试。';
  heard.value = false;
  if (!reviewing.value && question.value?.type === 'audio-meaning') {
    message.value = '题目音频暂时无法播放，已切回卡片模式。';
    exercise.value = 'card'; question.value = null; attempt.value = null; revealed.value = false;
  } else if (!reviewing.value && inputQuestion.value?.type === 'dictation') {
    message.value = '听写读音暂时不可用，可以重试或更换学习方式。';
  } else message.value = '发音暂时无法播放，请稍后重试。';
}

function flipCard() {
  if (reviewing.value || exercise.value !== "card") return;
  if (currentWord.value && !saving.value && !disposed && visible) revealed.value = !revealed.value;
}

function onCardTap() {
  if (Date.now() >= suppressTapUntil) flipCard();
}

type CardTouchEvent = { touches?: ArrayLike<{ clientX: number; clientY: number }>; changedTouches?: ArrayLike<{ clientX: number; clientY: number }> };
function onTouchStart(event: CardTouchEvent) {
  const touch = event.touches?.[0] || event.changedTouches?.[0];
  touchStarted = !!touch && (event.touches?.length ?? 1) === 1;
  if (!touchStarted || !touch) return;
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function onTouchMove(event: CardTouchEvent) {
  if ((event.touches?.length ?? 1) > 1) {
    touchStarted = false;
    suppressTapUntil = Date.now() + 350;
  }
}

function onTouchEnd(event: CardTouchEvent) {
  const touch = event.changedTouches?.[0];
  if (!touchStarted || !touch) return;
  touchStarted = false;
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  if (Math.abs(dx) > 12 || Math.abs(dy) > 12) suppressTapUntil = Date.now() + 350;
  if (Math.abs(dx) >= 72 && Math.abs(dx) > Math.abs(dy) * 1.5) flipCard();
}

function onTouchCancel() {
  touchStarted = false;
  suppressTapUntil = Date.now() + 350;
}

type MascotTouchEvent = { touches?: ArrayLike<{ clientX: number; clientY: number }>; changedTouches?: ArrayLike<{ clientX: number; clientY: number }> };

function clearMascotDragState() {
  mascotPressStart = undefined;
  mascotPressPending = false;
  mascotDragActive = false;
}

function onMascotTouchStart(event: MascotTouchEvent) {
  clearMascotDragState();
  const touch = event.touches?.[0] || event.changedTouches?.[0];
  if (!touch || (event.touches?.length ?? 1) !== 1 || !mascotBounds) return;
  mascotPressStart = { x: touch.clientX, y: touch.clientY };
  mascotPressOrigin = { ...mascotDisplayPosition.value };
  mascotPressPending = true;
}

function onMascotLongPress() {
  if (!mascotPressPending || !mascotPressStart || !mascotBounds) return;
  mascotDragActive = true;
  suppressTapUntil = Date.now() + 500;
}

function onMascotTouchMove(event: MascotTouchEvent) {
  const touch = event.touches?.[0] || event.changedTouches?.[0];
  if ((event.touches?.length ?? 1) > 1) {
    clearMascotDragState();
    suppressTapUntil = Date.now() + 350;
    return;
  }
  if (!touch || !mascotPressStart) return;
  const point = { x: touch.clientX, y: touch.clientY };
  if (!mascotDragActive) {
    if (movedBeforeMascotLongPress(mascotPressStart, point)) clearMascotDragState();
    return;
  }
  if (!mascotBounds) return;
  mascotPosition.value = translateStudyMascotPosition(
    mascotPressOrigin,
    point.x - mascotPressStart.x,
    point.y - mascotPressStart.y,
    mascotBounds,
  );
  suppressTapUntil = Date.now() + 500;
}

function onMascotTouchEnd() {
  if (mascotDragActive) {
    mascotUsesCardPlacement = false;
    void writeStudyMascotPosition(defaultStorage, mascotPosition.value).catch(() => undefined);
  }
  clearMascotDragState();
}

function onMascotTouchCancel() {
  clearMascotDragState();
}

function getStudyViewportBounds(): StudyMascotBounds {
  const info = uni.getWindowInfo();
  const safeAreaBottomInset = Math.max(0, info.screenHeight - (info.safeArea?.bottom ?? info.screenHeight));
  const width = info.windowWidth;
  const height = Math.max(0, info.windowHeight - safeAreaBottomInset);
  const actionDockClearance = exercise.value !== "card" && attempt.value ? uni.upx2px(300) : 0;
  const visibleHeight = Math.max(0, height - actionDockClearance);
  const mascotSize = uni.upx2px(116);
  const bounds: StudyMascotBounds = { width, height, mascotWidth: mascotSize, mascotHeight: mascotSize, visibleHeight };
  mascotStyleBounds.value = bounds;
  mascotPositionReady.value = width > 0 && height > 0;
  return bounds;
}

function readWordCardRect(): Promise<{ left: number; top: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    try {
      let cardRect: { left: number; top: number; width: number; height: number } | null = null;
      const query = uni.createSelectorQuery();
      query.select(".word-card").boundingClientRect((rect: any) => {
        if (typeof rect?.left === "number" && typeof rect?.top === "number"
          && typeof rect?.width === "number" && typeof rect?.height === "number") {
          cardRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        }
      });
      query.exec(() => resolve(cardRect));
    } catch {
      resolve(null);
    }
  });
}

function refreshMascotLayout(): Promise<void> {
  if (!visible || !mascotVisible.value || !currentWord.value) return Promise.resolve();
  try {
    mascotBounds = getStudyViewportBounds();
  } catch {
    return Promise.resolve();
  }
  return (async () => {
    if (mascotUsesCardPlacement && mascotBounds) {
      const cardRect = await readWordCardRect();
      if (cardRect && mascotBounds.width > 0 && mascotBounds.height > 0) {
        const topRightInset = uni.upx2px(10);
        const belowCardActions = uni.upx2px(168);
        mascotPosition.value = {
          x: (cardRect.left + cardRect.width - mascotBounds.mascotWidth / 2 - topRightInset) / mascotBounds.width,
          y: (cardRect.top + belowCardActions) / mascotBounds.height,
        };
        return;
      }
    }
  })();
}

function onMascotWindowResize() {
  void nextTick(() => { void refreshMascotLayout(); });
}

async function loadMascotSettings() {
  const [visiblePreference, rawPosition] = await Promise.all([
    readStudyMascotVisibility(defaultStorage),
    defaultStorage.getItem(STUDY_MASCOT_POSITION_KEY).catch(() => null),
  ]);
  mascotVisible.value = visiblePreference;
  mascotPosition.value = parseStudyMascotPosition(rawPosition);
  const hasCustomPosition = rawPosition !== null && (mascotPosition.value.x !== DEFAULT_STUDY_MASCOT_POSITION.x
    || mascotPosition.value.y !== DEFAULT_STUDY_MASCOT_POSITION.y);
  mascotUsesCardPlacement = !hasCustomPosition;
  await nextTick();
  await refreshMascotLayout();
}

async function playAudio(slow = false, automatic = false) {
  if (!automatic) {
    cancelPendingAutoPronunciation();
    miniAnswerSound.stop();
  }
  audioError.value = '';
  if (!audioUrl.value || saving.value || changingVoice.value || disposed || !visible) return;
  if (speaking.value) { stopAudio(); return; }
  const ticket = ++audioGeneration;
  const key = sessionKey;
  const word = reviewWord.value ?? currentWord.value;
  const primaryUrl = audioUrl.value;
  if (!word || !primaryUrl) return;
  if (automatic) automaticPronunciationInFlight = { owner: key, wordId: word.id, ticket, started: false };
  const isCurrent = () => ticket === audioGeneration && !disposed && visible
    && key === defaultRepository.getActiveKey()
    && (reviewWord.value ?? currentWord.value)?.id === word.id;
  audioTraceStart = Date.now();
  traceAudioStage("tap");
  speaking.value = true;
  message.value = "";
  try {
    player ||= new UniAudioPlayer(({ playId, type }) => traceAudioStage(`native#${playId}.${type}`));
    traceAudioStage("urlReady");
    traceAudioStage("cacheLookupStart");
    let cachedUrl = await defaultAudioCache.getCached(primaryUrl);
    if (!cachedUrl && preloader.isActive(primaryUrl)) {
      const resolved = await defaultAudioCache.resolve(primaryUrl);
      if (resolved !== primaryUrl) cachedUrl = resolved;
    }
    traceAudioStage(cachedUrl ? "cacheHit" : "cacheMiss");
    if (!isCurrent()) return;
    const onInterrupted = () => {
      if (isCurrent()) audioGeneration++;
      speaking.value = false;
    };
    if (automatic) {
      if (!autoPronunciationGate.claim(key, word.id)) return;
      if (automaticPronunciationInFlight?.ticket === ticket) automaticPronunciationInFlight.started = true;
    }
    let played = await player.play(cachedUrl || primaryUrl, { slow, onInterrupted });
    traceAudioStage(played ? "primaryEnded" : "primaryFailed");
    if (!isCurrent()) return;
    let retriedPrimary = false;
    if (!played && cachedUrl) {
      await defaultAudioCache.invalidate(primaryUrl);
      if (!isCurrent()) return;
      played = await player.play(primaryUrl, { slow, onInterrupted });
      retriedPrimary = true;
      if (!isCurrent()) return;
    }
    if (played && (!cachedUrl || retriedPrimary)) void defaultAudioCache.warm(primaryUrl);
    const cloudflareUrl = getCloudflareAudioUrl(primaryUrl);
    const legacyUrl = word ? getWordAudioFallbackUrl(word) : undefined;
    const fallbackUrls = [cloudflareUrl, legacyUrl, legacyUrl ? getCloudflareAudioUrl(legacyUrl) : undefined]
      .filter((url, index, urls): url is string => !!url && url !== primaryUrl && urls.indexOf(url) === index);
    for (const fallback of fallbackUrls) {
      if (played) break;
      const cachedFallback = await defaultAudioCache.getCached(fallback);
      if (!isCurrent()) return;
      played = await player.play(cachedFallback || fallback, { slow, onInterrupted });
      traceAudioStage(played ? "fallbackEnded" : "fallbackFailed");
      if (!isCurrent()) return;
      let retriedRemote = false;
      if (!played && cachedFallback) {
        await defaultAudioCache.invalidate(fallback);
        if (!isCurrent()) return;
        played = await player.play(fallback, { slow, onInterrupted });
        retriedRemote = true;
        if (!isCurrent()) return;
      }
      if (played && (!cachedFallback || retriedRemote)) void defaultAudioCache.warm(fallback);
    }
    if (!played) {
      audioFailed();
    } else {
      if (!automatic) autoPronunciationGate.claim(key, word.id);
      if (!reviewing.value && (question.value?.type === "audio-meaning" || inputQuestion.value?.type === 'dictation')) heard.value = true;
    }
  } catch {
    if (isCurrent()) {
      audioFailed();
    }
  } finally {
    if (automaticPronunciationInFlight?.ticket === ticket) automaticPronunciationInFlight = undefined;
    if (ticket === audioGeneration) speaking.value = false;
  }
}

async function rate(grade: Grade) {
  if (reviewing.value || !currentWord.value || saving.value || markingDifficult.value || markingIgnored.value || changingVoice.value || disposed || !visible) return;
  if (exercise.value === "card" && !revealed.value) return;
  if (exercise.value === 'cloze' && (!clozeQuestion.value || !revealed.value)) return;
  if (exercise.value !== "card" && exercise.value !== 'cloze' && !attempt.value) return;
  const attemptSnapshot = attempt.value;
  const uncertainSnapshot = uncertain.value;
  const finalGrade = attemptSnapshot ? ratingForStudyAnswer(attemptSnapshot, uncertainSnapshot) : grade;
  if (defaultRepository.getActiveKey() !== sessionKey) {
    message.value = "账户已切换，请返回首页后重新开始学习。";
    return;
  }
  saving.value = true;
  savingGrade.value = grade;
  stopAudio();
  const word = currentWord.value;
  const epoch = studyEpoch;
  const key = sessionKey;
  const now = new Date();
  const responseTime = Math.max(0, now.getTime() - startedAt.value);
  const logId = `log_${now.getTime()}_${Math.random().toString(36).slice(2)}_${word.id}`;
  try {
    let result: ReturnType<typeof applyStudyRating> | undefined;
    const updated = await defaultRepository.transactAndEnqueue((data: Data) => {
      result = applyStudyRating(data, word, finalGrade, mode.value, now, logId, responseTime, attemptSnapshot ?? undefined);
    }, () => result ? reviewQueueItems(result.log, result.state) : [], key);
    if (disposed || studyEpoch !== epoch || defaultRepository.getActiveKey() !== key || currentWord.value?.id !== word.id) return;
    loadedData.value = updated;
    if (visible) historyWords.value = [...historyWords.value, word];
    currentIndex.value++;
    streak.value = statistics(updated, now).streak;
    loadWord();
    showRatingReaction(finalGrade === Rating.Again ? "wrong" : "correct");
    if (!attemptSnapshot && (finalGrade === Rating.Again || finalGrade === Rating.Good)) playAnswerFeedback(finalGrade === Rating.Good);
    message.value = `已保存「${ratingOptions.find((item) => item.grade === finalGrade)?.label ?? "模糊"}」 · 今日已打卡`;
    void defaultSyncCoordinator.flush("timer");
  } catch {
    if (!disposed) message.value = "保存失败，当前卡片已保留，请重试。";
  } finally {
    if (!disposed) {
      saving.value = false;
      savingGrade.value = null;
      if (visible && pendingAutoEntry) maybeAutoPronounceOnEntry();
    }
  }
}

function backToHome() { uni.switchTab({ url: "/pages/index/index" }); }
function practiceAgain(ids: string[]) {
  const data = loadedData.value;
  if (!data || practiceBusy.value || disposed || sessionKey !== defaultRepository.getActiveKey()) return;
  const byId = new Map(data.words.map(word => [word.id, word]));
  words.value = [...new Set(ids)].flatMap(id => { const word = byId.get(id); return word && !stateFor(data, id)?.isIgnored ? [word] : []; });
  if (requestedReadingContextIds.value !== null) {
    const selectedWordIds = new Set(words.value.map(word => word.id));
    const selectedContexts = Object.fromEntries(
      Object.entries(requestedReadingContextIds.value).filter(([wordId]) => selectedWordIds.has(wordId)),
    );
    requestedReadingContextIds.value = Object.keys(selectedContexts).length ? selectedContexts : null;
  }
  baseline.value = words.value.map(word => stateFor(data, word.id)?.reviewCount || 0);
  requestedDailyBook.value = ''; requestedLesson = undefined; requestedMode = 'difficult'; requestedResume.value = false;
  requestedHistoricalPractice.value = null;
  requestedPracticeIds.value = words.value.map(word => word.id); mode.value = 'difficult';
  historyWords.value = []; reviewIndex.value = null; currentIndex.value = 0; dailyPlanCaption.value = '';
  emptyQueue.value = !words.value.length; loadWord();
}
onLoad((query) => {
  requestedHistoricalPractice.value = parseHistoricalPractice({ bookId: query?.feedbackBookId, type: query?.feedbackType, range: query?.feedbackRange === '30' ? 30 : 7 });
  requestedScene = query?.sceneId;
  requestedResume.value = query?.resume === '1';
  requestedScopeBook.value = typeof query?.scopeBookId === 'string' && (query?.mode === 'difficult' || query?.mode === 'review') ? query.scopeBookId : '';
  if (typeof query?.practiceIds === 'string') {
    try { const ids: unknown = JSON.parse(query.practiceIds); requestedPracticeIds.value = Array.isArray(ids) && ids.length <= 50 && ids.every(id => typeof id === 'string' && id) ? [...new Set(ids)] : []; }
    catch { requestedPracticeIds.value = []; }
  }
  if (typeof query?.readingContextIds === "string") {
    requestedReadingContextIds.value = parseMiniReadingContextIds(query.readingContextIds) ?? Object.create(null) as MiniReadingContextIds;
  }
  requestedDailyBook.value = !query?.sceneId && !query?.lessonId && !query?.mode && typeof query?.dailyBookId === "string" ? query.dailyBookId : "";
  const feedback = requestedHistoricalPractice.value;
  void initStudy(feedback ? undefined : query?.lessonId, feedback ? 'difficult' : query?.mode, feedback?.type ?? query?.exercise);
});
onReady(() => { void nextTick(() => { void refreshMascotLayout(); }); });
onShow(() => {
  miniAnswerSound.setForeground(true);
  visible = true;
  if (!initializing && defaultRepository.getActiveKey() !== sessionKey) void initStudy();
  if (!mascotResizeListening) {
    uni.onWindowResize(onMascotWindowResize);
    mascotResizeListening = true;
  }
  void loadMascotSettings();
  preloadNearbyWords();
  if (pendingAutoEntry) {
    pendingAutoEntry = false;
    if (miniAutoPronunciationPreference.state.enabled) autoPronounceCurrentWord();
  }
  if (currentWord.value) void prepareExamples(currentWord.value);
});
onHide(() => {
  if (!loading.value && !loadError.value) persistStudyCheckpoint();
  exampleRequest++;
  comparisonOpen.value = false;
  visible = false;
  if (reviewStartedAt !== null) startedAt.value += Math.max(0, Date.now() - reviewStartedAt);
  reviewStartedAt = null;
  reviewIndex.value = null;
  historyWords.value = [];
  clearMascotReactionTimer();
  restoreMascotBasePose();
  onTouchCancel();
  onMascotTouchCancel();
  if (mascotResizeListening) { uni.offWindowResize(onMascotWindowResize); mascotResizeListening = false; }
  stopAudio(true);
  preloader.cancel();
});
onUnload(() => {
  exampleRequest++;
  comparisonOpen.value = false;
  disposed = true;
  studyEpoch++;
  historyWords.value = [];
  reviewIndex.value = null;
  clearMascotReactionTimer();
  onMascotTouchCancel();
  if (mascotResizeListening) { uni.offWindowResize(onMascotWindowResize); mascotResizeListening = false; }
  stopAudio();
  preloader.cancel();
  player?.destroy();
});
</script>

<template>
  <MiniPage class="study-page" :class="{ 'has-quiz-dock': !reviewing && currentWord && exercise !== 'card' && attempt }">
    <MiniHeader :kicker="`STUDY / ${modeLabel}`" :title="reviewing ? '回看刚才的词' : finished ? '又积累了一点' : '一词一句，慢慢记住'" description="先回忆，再看答案。每次真实的反馈，都让下一次复习更适合你。" />
    <MiniSkeleton v-if="loading" label="正在准备学习卡片…" />
    <view v-else-if="loadError" class="card status-card">
      <text>{{ loadError }}</text>
      <button class="study-button" @tap="initStudy()">重新读取</button>
    </view>
    <view v-else-if="emptyQueue" class="card status-card">
      <text class="status-title">{{ requestedScene ? '当前场景没有可练习的词' : requestedHistoricalPractice ? '当前没有待重练的错词' : requestedReadingContextIds !== null ? '所选原句暂不可用于复习' : mode === 'review' ? '暂时没有到期词' : requestedDailyBook ? '今日计划已完成' : '这一组已没有待学词' }}</text>
      <text>{{ requestedScene ? '已忽略的词会跳过，可到生词本恢复后再练习。' : requestedHistoricalPractice ? '这些词可能已答对或被忽略，可以返回统计页查看最新记录。' : requestedReadingContextIds !== null ? '这条原句或关联词可能已修改或移除，请返回我的原句重新选择。' : requestedDailyBook ? '今天的积累已经记下，也可以到词书中自由选择课次。' : '可以返回首页，选择其他课次或稍后再来。' }}</text>
      <button class="study-button" @tap="backToHome">返回首页</button>
    </view>
    <view v-else>
      <scroll-view class="exercise-picker" scroll-x="true" :show-scrollbar="false">
        <button v-for="item in exerciseOptions" :key="item.value" class="exercise-btn" :class="{ selected: preferredExercise === item.value }" :disabled="reviewing || saving || markingDifficult || markingIgnored || changingVoice" @tap="selectExercise(item.value)">{{ item.label }}</button>
      </scroll-view>
      <view class="voice-picker">
        <text>声音</text>
        <button v-for="item in AUDIO_VOICE_OPTIONS" :key="item.value" class="voice-option" :class="{ selected: voice === item.value }" :disabled="changingVoice || markingDifficult || markingIgnored || saving" :loading="changingVoiceTo === item.value" @tap="selectVoice(item.value)">{{ changingVoiceTo === item.value ? '切换中…' : item.label }}</button>
      </view>
      <view class="progress-info">
        <text>{{ modeLabel }}</text>
        <text>已完成 {{ progressLabel }}</text>
      </view>
      <text v-if="dailyPlanCaption" class="daily-plan-caption">{{ dailyPlanCaption }}</text>
      <view class="progress-track"><view class="progress-fill" :style="{ transform: `scaleX(${progressPercent / 100})` }" /></view>
      <view v-if="!finished || reviewing" class="history-navigation">
        <button class="study-button" :disabled="!canPrevious" @tap="previousWord">上一个</button>
        <button v-if="reviewing" class="study-button" :disabled="saving || changingVoice" @tap="returnToCurrent">{{ finished ? '返回完成页' : '返回当前词' }}</button>
        <text v-if="reviewing">回看 {{ (reviewIndex ?? 0) + 1 }} / {{ historyWords.length }} · 不重复评分</text>
      </view>
      <view v-if="reviewWord" class="card word-card is-revealed history-card">
        <view class="history-body">
          <text class="face-label">本轮已处理的词</text>
          <text class="term">{{ reviewWord.term }}</text>
          <text v-if="hasStudyContent(reviewWord.reading)" class="reading">{{ reviewWord.reading }}</text>
          <MiniMeaningText v-if="hasStudyContent(reviewWord.meaning)" class="meaning" :word="reviewWord" :expandable="true" />
          <view v-if="displayExample" class="example-box">
            <text class="example-ja">{{ displayExample.ja }}</text>
            <MiniSentenceAudio :text="displayExample.ja" :voice="voice" />
            <text v-if="displayExample.zh" class="example-zh">{{ displayExample.zh }}</text>
          </view>
          <MiniUsageNotes :word="reviewWord" />
          <MiniReadingContexts :word="reviewWord" :editable="false" />
        </view>
        <button class="study-button dictionary-entry-button" @tap.stop="comparisonOpen = true">更多释义 · 词典对照</button>
        <view class="audio-controls">
          <button class="study-button" :disabled="!audioUrl || changingVoice" @tap="playAudio()">{{ speaking ? '停止发音' : '播放发音' }}</button>
          <button class="study-button" :disabled="!audioUrl || speaking || changingVoice" @tap="playAudio(true)">慢速听</button>
        </view>
      </view>
      <view v-else-if="currentWord" :key="currentWord.id" class="card word-card" :class="{ 'is-revealed': revealed }">
        <view class="card-corner-actions">
          <button class="difficult-button" :loading="markingDifficult" :disabled="markingDifficult || markingIgnored || changingVoice || saving" @tap.stop="toggleDifficult">{{ markingDifficult ? '保存中…' : isDifficult ? '★ 已标记难词' : '☆ 标记为难词' }}</button>
          <button class="ignore-button" :loading="markingIgnored" :disabled="markingIgnored || markingDifficult || changingVoice || saving || !!attempt" @tap.stop="ignoreCurrentWord">{{ markingIgnored ? '保存中…' : '忽略此词' }}</button>
        </view>
        <view
          class="card-surface"
          hover-class="surface-pressed"
          @tap="onCardTap"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchCancel"
        >
          <MiniInputQuestion v-if="inputQuestion" :key="currentWord.id + inputQuestion.type" :question="inputQuestion" :value="inputValue" :attempt="attempt" :busy="practiceBusy" :heard="heard" :audio-error="audioError" :speaking="speaking" @update:value="inputValue = $event" @submit="submitInputAnswer" @play="playAudio($event)" @stop="stopAudio" />
          <view v-else-if="exercise === 'cloze' && clozeQuestion">
            <MiniSentenceAudio :text="clozeQuestion.ja" :voice="voice" />
            <MiniSentenceCloze :question="clozeQuestion" :value="clozeValue" :revealed="revealed" :matches="clozeMatches" :busy="practiceBusy" @update:value="clozeValue = $event" @reveal="revealCloze" @grade="rate($event as Grade)" />
          </view>
          <view v-else-if="exercise === 'cloze' && exampleLoading" class="cloze-preparing"><text>正在准备例句…</text></view>
          <view v-else>
          <view class="term-stage">
            <text class="face-label">{{ exercise === 'card' ? (revealed ? '释义与例句' : '先想一想它的意思') : question?.type === 'audio-meaning' ? '听音后选择中文释义' : question?.prompt }}</text>
            <view class="term-row">
              <view class="term-copy">
                <text v-if="exercise === 'card' || question?.type === 'kanji-reading' || attempt" class="term">{{ currentWord.term }}</text>
                <text v-if="(exercise === 'card' || attempt) && hasStudyContent(currentWord.reading)" class="reading">{{ currentWord.reading }}</text>
                <text v-if="hasStudyContent(currentWord.partOfSpeech)" class="pos-badge">{{ currentWord.partOfSpeech }}</text>
              </view>
            </view>
          </view>
          <view v-if="exercise !== 'card' && question" class="quiz-options">
            <view v-if="question.type === 'audio-meaning'" class="quiz-listen">
              <button class="study-button quiz-audio" :disabled="saving" @tap.stop="playQuestionAudio(false)">{{ speaking ? '停止发音' : '播放题目音频' }}</button>
              <button class="study-button quiz-audio" :disabled="saving || speaking" @tap.stop="playQuestionAudio(true)">慢速听</button>
            </view>
            <text v-if="question.type === 'audio-meaning' && !heard && !attempt" class="card-hint">播放后即可选择答案</text>
            <button v-for="(option, optionIndex) in question.options" :key="option" class="quiz-option"
              :class="{ 'option-correct': attempt && option === question.correct, 'option-wrong': attempt && !attempt.isCorrect && option === attempt.selected }"
              :disabled="!!attempt || saving || (question.type === 'audio-meaning' && !heard)" @tap.stop="submitAnswer(option)"><text class="option-symbol" aria-hidden="true">{{ attempt && option === question.correct ? '✓' : attempt && !attempt.isCorrect && option === attempt.selected ? '×' : optionIndex + 1 }}</text><text class="option-copy">{{ option }}</text></button>
            <button v-if="!attempt" class="dont-know" :disabled="saving || (question.type === 'audio-meaning' && !heard)" @tap.stop="submitAnswer(null)">不认识，查看解析</button>
            <text v-if="attempt" class="quiz-feedback" :class="{ incorrect: !attempt.isCorrect }">{{ attempt.isCorrect ? '答对了，继续巩固这份记忆。' : `再记住一次。正确答案：${attempt.correct}` }}</text>
            <view v-if="attempt" class="word-details">
              <MiniMeaningText v-if="hasStudyContent(currentWord.meaning)" class="meaning" :word="currentWord" :expandable="true" />
              <view v-if="displayExample" class="example-box">
                <text class="example-ja">{{ displayExample.ja }}</text>
                <MiniSentenceAudio :text="displayExample.ja" :voice="voice" />
                <text v-if="displayExample.reading" class="example-reading">{{ displayExample.reading }}</text>
                <text v-if="displayExample.zh" class="example-zh">{{ displayExample.zh }}</text>
              </view>
            </view>
          </view>
          <view v-else-if="revealed" class="word-details">
            <MiniMeaningText v-if="hasStudyContent(currentWord.meaning)" class="meaning" :word="currentWord" :expandable="true" />
            <view v-if="displayExample" class="example-box">
              <text class="example-ja">{{ displayExample.ja }}</text>
              <MiniSentenceAudio :text="displayExample.ja" :voice="voice" />
              <text v-if="displayExample.reading" class="example-reading">{{ displayExample.reading }}</text>
              <text v-if="displayExample.zh" class="example-zh">{{ displayExample.zh }}</text>
            </view>
          </view>
          <text v-else class="card-hint">点击卡片或左右轻滑，查看答案</text>
          </view>
          <view v-if="revealed && inputQuestion" class="word-details">
            <text class="term">{{ currentWord.term }}</text><text class="reading">{{ currentWord.reading }}</text><MiniMeaningText class="meaning" :word="currentWord" :expandable="true" />
          </view>
          <view v-if="revealed && displayExample && exercise !== 'cloze' && inputQuestion" class="example-box learning-example">
            <text class="face-label">用例展示</text><text class="example-ja">{{ displayExample.ja }}</text><MiniSentenceAudio :text="displayExample.ja" :voice="voice" />
            <text v-if="displayExample.reading" class="example-reading">{{ displayExample.reading }}</text><text v-if="displayExample.zh" class="example-zh">{{ displayExample.zh }}</text>
          </view>
          <MiniUsageNotes v-if="revealed" :word="currentWord" />
        </view>
        <text v-if="exerciseFallback" class="card-hint">{{ exerciseFallback }}</text>
        <view v-if="exampleError" class="example-load-error"><text>{{ exampleError }}</text><button class="study-button" :disabled="exampleLoading || practiceBusy" @tap.stop="prepareExamples(currentWord, true)">重试例句</button></view>
        <MiniReadingContexts v-if="revealed || attempt" :word="currentWord" :initial-sentence="displayExample?.ja" :initial-translation="displayExample?.zh" />
        <button v-if="revealed || attempt" class="study-button dictionary-entry-button" @tap.stop="comparisonOpen = true">更多释义 · 词典对照</button>
        <view v-if="showGenericAudioControls" class="audio-controls">
          <button class="study-button" :disabled="!audioUrl || saving" @tap="playAudio()">
            <view class="audio-signal" :class="{ playing: speaking }" aria-hidden="true"><view /><view /><view /></view>
            {{ speaking ? '停止发音' : '播放发音' }}
          </button>
          <button class="study-button" :disabled="!audioUrl || saving || speaking" @tap="playAudio(true)">慢速听</button>
        </view>
        <text v-if="audioUrl && showGenericAudioControls" class="audio-source">{{ hasStudyContent(currentWord.reading) ? `Google WaveNet · ${voice === 'male' ? '男声 C' : '女声 A'}` : '词书发音' }}</text>
        <text v-if="!audioUrl" class="card-hint">这个词暂时没有可用发音</text>
      </view>
      <button v-if="!reviewing && currentWord && exercise === 'card'" class="study-button flip-button" :disabled="saving" @tap="flipCard">
        {{ revealed ? '返回词面' : '显示释义' }}
      </button>
      <button v-if="relatedVerb && (revealed || reviewing)" class="study-button conjugation-entry" :disabled="practiceBusy" @tap="openConjugation">练习「{{ relatedVerb.term }}」的活用</button>
      <view class="feedback"><MiniNotice :message="saving ? '正在保存…' : message" /></view>
      <view v-if="!reviewing && currentWord && exercise === 'card'" class="rating-section">
        <text class="rating-caption">{{ revealed ? '这次想起来，有多轻松？' : '查看答案后，按真实记忆程度评分' }}</text>
        <view v-if="exercise === 'card'" class="rating-bar">
          <button
            v-for="item in ratingOptions"
            :key="item.grade"
            class="rate-btn"
            :class="item.style"
            :disabled="saving || markingDifficult || markingIgnored || changingVoice || !revealed"
            :loading="savingGrade === item.grade"
            @tap="rate(item.grade)"
          >
            <text>{{ item.label }}</text>
            <text class="rating-hint">{{ item.hint }}</text>
          </button>
        </view>
      </view>
      <view v-if="!reviewing && finished" class="card status-card completion-card motion-enter">
        <text class="face-label">ことばを、少しずつ。</text>
        <StudyMascot v-if="mascotVisible" class="completion-mascot" pose="complete" />
        <text class="status-title">{{ requestedDailyBook ? '今日计划已完成' : '本组学习完成' }}</text>
        <text>已保存 {{ currentIndex }} 次学习记录，连续打卡 {{ streak }} 天。</text>
        <MiniStudySummary v-if="sessionSummary" :summary="sessionSummary" :recommendation="completionRecommendation" @practice="practiceAgain" @recommend="openPracticeRecommendation" />
        <button class="study-button" @tap="backToHome">返回首页</button>
      </view>
    </view>
    <view v-if="!reviewing && currentWord && exercise !== 'card' && attempt" class="quiz-action-dock">
      <text class="rating-caption">{{ attempt.isCorrect ? '答对了；这次有多轻松？' : '答错了；下次会更早复习' }}</text>
      <label v-if="attempt.isCorrect" class="uncertain-toggle"><checkbox :checked="uncertain" @tap.stop="uncertain = !uncertain" />这次是猜对的</label>
      <button class="study-button quiz-save" :loading="saving" :disabled="saving || markingDifficult || markingIgnored || changingVoice || !attempt" @tap.stop="rate(Rating.Good)">
        {{ saving ? '保存中…' : `保存并继续（${attempt.isCorrect ? (uncertain ? '模糊' : '记得') : '忘记了'}）` }}
      </button>
    </view>
    <view
      v-if="!reviewing && currentWord && mascotVisible && mascotPositionReady && !inputQuestion && exercise !== 'cloze'"
      class="mascot-drag-handle"
      :style="mascotPositionStyle"
      @tap.stop
      @longpress.stop.prevent="onMascotLongPress"
      @touchstart.stop="onMascotTouchStart"
      @touchmove.stop.prevent="onMascotTouchMove"
      @touchend.stop="onMascotTouchEnd"
      @touchcancel.stop="onMascotTouchCancel"
    >
      <StudyMascot class="word-mascot" :pose="mascotPose" />
    </view>
    <MiniDictionaryComparison :open="comparisonOpen" :query="comparisonWord" @close="comparisonOpen = false" />
  </MiniPage>
</template>

<style scoped>
.daily-plan-caption { display: block; margin: 0 0 16rpx; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.6; }
.cloze-preparing { min-height: 220rpx; display: flex; align-items: center; justify-content: center; color: var(--kotoba-muted); font-size: 28rpx; }
.example-load-error { font-size: 24rpx; color: var(--kotoba-muted); display: flex; flex-wrap: wrap; align-items: center; gap: 16rpx; padding: 12rpx 0; }.example-load-error .study-button { min-height: 44px; font-size: 24rpx; }
.learning-example { margin-top: 24rpx; }
.dictionary-entry-button { width: 100%; min-height: 44px; margin: 22rpx 0; border: 1rpx solid #c5d8b8; border-radius: 16rpx; background: #eaf3e2; color: var(--kotoba-green); font-size: 26rpx; }
.history-navigation { display: flex; gap: 16rpx; flex-wrap: wrap; margin-bottom: 24rpx; }
.history-navigation .study-button { flex: 1; min-width: 100px; min-height: 48px; margin: 0; }
.history-navigation text { width: 100%; font-size: 24rpx; color: var(--kotoba-green); }
.history-body { min-height: 460rpx; padding: 40rpx 0 28rpx; display: flex; flex-direction: column; align-items: center; }
.study-page {
  --ink: var(--kotoba-ink);
  --muted: var(--kotoba-muted);
  --green: var(--kotoba-green);
  --line: var(--kotoba-line);
  color: var(--ink);
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}
.study-page.has-quiz-dock { padding-bottom: calc(320rpx + env(safe-area-inset-bottom)); }
.voice-picker { display: flex; align-items: center; gap: 10rpx; margin: 0 0 20rpx; color: var(--muted); font-size: 25rpx; }
.voice-option { margin: 0; min-height: 42px; padding: 4rpx 20rpx; border: 1rpx solid var(--line); border-radius: 12rpx; background: #fffefb; color: var(--muted); font-size: 25rpx; }
.voice-option.selected { background: #eaf0e3; border-color: #a8bbac; color: var(--green); font-weight: 600; }
.progress-info { display: flex; justify-content: space-between; gap: 16rpx; font-size: 26rpx; color: var(--muted); }
.exercise-picker { display: flex; white-space: nowrap; margin-bottom: 18rpx; }
.exercise-btn { display: inline-flex; min-height: 48px; margin-right: 10rpx; padding: 0 22rpx; border: 1rpx solid var(--line); border-radius: 24rpx; background: #fffefb; color: var(--muted); align-items: center; justify-content: center; font-size: 24rpx; }
.exercise-btn.selected { background: #eaf0e3; border-color: #a8bbac; color: var(--green); font-weight: 600; }
.progress-track { height: 8rpx; margin: 18rpx 0 28rpx; border-radius: 8rpx; background: #e5eadf; overflow: hidden; }
.progress-fill { height: 100%; background: var(--green); }
.word-card { position: relative; padding: 0 28rpx 28rpx; text-align: center; border-color: var(--line); background: #fffefb; box-shadow: none; border-radius: 18rpx; }
.is-revealed { border-color: #a8bbac; background: #fffefb; }
.card-corner-actions { position: absolute; z-index: 5; top: 6rpx; left: 12rpx; right: 12rpx; display: flex; justify-content: space-between; pointer-events: none; }
.card-corner-actions button { width: auto; min-width: 44px; min-height: 44px; margin: 0; padding: 0 12rpx; border: 0; background: transparent; color: var(--muted); font-size: 24rpx; pointer-events: auto; }
.card-surface { min-height: 460rpx; padding: 96rpx 0 28rpx; display: flex; flex-direction: column; align-items: center; }
.surface-pressed { opacity: .85; }
.face-label { font-size: 24rpx; color: var(--muted); margin-bottom: 28rpx; }
.term-stage { position: relative; display: flex; width: 100%; min-width: 0; flex-direction: column; align-items: center; }
.term-stage > .face-label { margin-bottom: 8rpx; }
.mascot-drag-handle { position: fixed; z-index: 30; width: 116rpx; height: 116rpx; transform: translate(-50%, -50%); pointer-events: auto; touch-action: none; }
.term-row { display: flex; width: 100%; min-width: 0; align-items: center; justify-content: center; }
.term-copy { display: flex; width: 100%; min-width: 0; flex-direction: column; align-items: center; }
.word-mascot { width: 116rpx; height: 116rpx; }
.completion-mascot { width: 168rpx; height: 168rpx; margin: 0 auto 16rpx; }
.term { max-width: 100%; overflow-wrap: anywhere; word-break: break-all; font-size: 64rpx; line-height: 1.4; font-weight: 700; }
.reading { margin: 12rpx 0 20rpx; font-size: 34rpx; color: var(--green); word-break: break-all; }
.pos-badge { font-size: 24rpx; background: #eaf0e3; color: var(--green); padding: 6rpx 16rpx; border-radius: 20rpx; }
.card-hint { display: block; font-size: 26rpx; color: var(--muted); margin-top: 28rpx; }
.word-details { width: 100%; text-align: left; border-top: 1rpx solid var(--line); margin-top: 28rpx; padding-top: 24rpx; }
.meaning { display: block; font-size: 34rpx; font-weight: 600; word-break: break-all; }
.example-box { margin-top: 24rpx; padding: 24rpx; background: #f7f8f4; border-radius: 12rpx; }
.example-ja, .example-reading, .example-zh { display: block; font-size: 28rpx; word-break: break-all; }
.example-reading, .example-zh { margin-top: 12rpx; font-size: 26rpx; color: var(--muted); }
.audio-controls { display: flex; gap: 8px; }
.difficult-button { min-height: 44px; border: 0; background: transparent; color: var(--muted); font-size: 24rpx; }
.study-button { flex: 1; min-height: 48px; display: flex; align-items: center; justify-content: center; padding: 12rpx 20rpx; border: 1rpx solid var(--line); border-radius: 12rpx; background: #f7f8f4; color: var(--green); font-size: 28rpx; line-height: 1.5; }
.flip-button { width: 100%; }
.feedback { min-height: 64rpx; padding: 16rpx 0; font-size: 26rpx; color: var(--green); }
.rating-caption { display: block; margin-bottom: 16rpx; text-align: center; font-size: 26rpx; color: var(--muted); }
.uncertain-toggle { display: flex; min-height: 48px; align-items: center; justify-content: center; gap: 8rpx; margin-bottom: 14rpx; color: var(--muted); font-size: 25rpx; }
.quiz-action-dock { position: fixed; z-index: 40; left: 24rpx; right: 24rpx; bottom: calc(12rpx + env(safe-area-inset-bottom)); box-sizing: border-box; display: flex; flex-direction: column; align-items: stretch; gap: 2rpx; padding: 12rpx 16rpx; border: 1rpx solid var(--line); border-radius: 18rpx; background: #fffefb; box-shadow: 0 6rpx 24rpx rgba(39, 60, 53, .14); }
.quiz-action-dock .rating-caption { margin: 0; }
.quiz-action-dock .uncertain-toggle { margin: 0; }
.quiz-options { width: 100%; display: flex; flex-direction: column; gap: 12rpx; margin-top: 24rpx; }
.quiz-option { width: 100%; min-height: 52px; border: 1rpx solid var(--line); border-radius: 12rpx; background: #fffefb; color: var(--ink); font-size: 30rpx; }
.quiz-option.option-correct { border-color: #9cba9a; background: #e3efdf; color: var(--green); }
.quiz-option.option-wrong { border-color: #d5a79a; background: #fce5df; color: #8d3025; }
.quiz-listen { display: flex; gap: 8rpx; }
.quiz-feedback { padding: 16rpx 20rpx; border-radius: 12rpx; background: #e3efdf; color: var(--green); font-size: 27rpx; }
.quiz-feedback.incorrect { background: #fce5df; color: #8d3025; }
.dont-know { margin-top: 4rpx; min-height: 44px; border: 0; background: transparent; color: var(--muted); font-size: 25rpx; }
.audio-source { display: block; margin-top: 14rpx; color: var(--muted); font-size: 23rpx; }
.ignore-button { min-height: 44px; border: 0; background: transparent; color: var(--muted); font-size: 24rpx; }
.quiz-audio { width: 100%; }
.quiz-save { width: 100%; min-height: 48px; margin-top: 0; }
.rating-bar { display: flex; gap: 8px; }
.rate-btn { flex: 1; min-width: 0; min-height: 64px; border-radius: 12rpx; font-size: 28rpx; line-height: 1.5; font-weight: 600; padding: 14rpx 2rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.rating-hint { font-size: 22rpx; margin-top: 8rpx; font-weight: 400; }
.again { background: #fce5df; color: #8d3025; }
.hard { background: #f8eed6; color: #795717; }
.good { background: #e3efdf; color: #365d49; }
button[disabled] { color: #767c76; background: #eceee9; opacity: .75; }
.status-card { display: flex; flex-direction: column; align-items: center; gap: 28rpx; text-align: center; padding: 56rpx 32rpx; font-size: 28rpx; }
.status-title { font-size: 40rpx; font-weight: 700; }
.status-card .study-button { width: 100%; }
.exercise-btn, .voice-option { background: var(--kotoba-paper); }
.exercise-btn.selected, .voice-option.selected { background: #e4eedf; border-color: #8eab90; color: #214b34; }
.progress-info { color: var(--kotoba-ink); font-weight: 600; }
.progress-track { height: 12rpx; background: #e2eade; }
.word-card { border-radius: 24rpx; background: var(--kotoba-paper); box-shadow: 0 10rpx 30rpx rgba(35,57,46,.055); }
.is-revealed { border-color: #8eab90; }
.face-label { color: var(--kotoba-green); font-weight: 600; }
.example-box { background: #f3f6ef; }
.flip-button, .quiz-save { background: var(--kotoba-green); border-color: var(--kotoba-green); color: #fff; font-weight: 650; }
.quiz-option { text-align: left; padding: 16rpx 24rpx; border-radius: 16rpx; }
.quiz-action-dock { background: var(--kotoba-paper); border-radius: 22rpx; box-shadow: 0 10rpx 32rpx rgba(35,57,46,.15); }
.rate-btn { border-radius: 16rpx; }
@media (max-width: 340px) { .rating-bar { flex-wrap: wrap; } .rate-btn { flex-basis: 44%; } }
.study-page .mini-heading { margin-bottom: 24rpx; }
.exercise-btn { border-radius: 14rpx; min-height: 88rpx; }
.voice-picker { padding: 18rpx 0 6rpx; }
.progress-info { margin-top: 12rpx; font-size: 24rpx; }
.progress-fill { width: 100%; transform-origin: left center; transition: transform 400ms cubic-bezier(.2,.8,.2,1); }
.word-card { border-radius: 30rpx; border-color: #d1ddc9; box-shadow: 0 14rpx 36rpx rgba(35,57,46,.055); transition: border-color 200ms ease, background-color 200ms ease; }
.word-card.is-revealed { border-color: #99b78e; background: #fdfff9; }
.card-surface { transition: opacity 120ms ease, transform 160ms ease; }
.surface-pressed { opacity: .9; transform: scale(.99); }
.term { font-family: "Hiragino Mincho ProN", "Noto Serif CJK JP", serif; font-size: 76rpx; font-weight: 600; line-height: 1.35; }
.face-label { font-size: 23rpx; letter-spacing: 1rpx; }
.reading { font-size: 32rpx; }
.card-hint { font-size: 25rpx; line-height: 1.6; }
.meaning { font-size: 32rpx; line-height: 1.65; }
.example-box { border-left: 4rpx solid #b5caa7; border-radius: 4rpx 16rpx 16rpx 4rpx; }
.example-ja { line-height: 1.7; }
.audio-controls { padding-top: 18rpx; border-top: 1rpx solid var(--line); }
.audio-controls .study-button { gap: 12rpx; background: #eef4e8; border-color: #d6e4cd; font-size: 26rpx; }
.audio-signal { display: flex; align-items: center; justify-content: center; gap: 4rpx; width: 30rpx; height: 32rpx; }
.audio-signal view { width: 4rpx; height: 24rpx; border-radius: 4rpx; background: currentColor; transform: scaleY(.4); }
.audio-signal view:nth-child(2) { transform: scaleY(.8); }
.audio-signal.playing view { animation: audio-playing 700ms ease-in-out infinite alternate; }
.audio-signal.playing view:nth-child(2) { animation-delay: 150ms; }
.audio-signal.playing view:nth-child(3) { animation-delay: 300ms; }
@keyframes audio-playing { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
.quiz-option { display: flex; justify-content: flex-start; gap: 18rpx; padding: 20rpx; }
.option-symbol { display: flex; flex: none; align-items: center; justify-content: center; width: 44rpx; height: 44rpx; border: 1rpx solid #d2ddcb; border-radius: 12rpx; color: var(--muted); font-size: 25rpx; }
.option-copy { flex: 1; min-width: 0; text-align: left; overflow-wrap: anywhere; font-size: 29rpx; }
.quiz-option.option-correct[disabled], .quiz-option.option-wrong[disabled] { opacity: 1; }
.option-correct .option-symbol { color: var(--green); border-color: #a7c59b; background: #d3e6c9; }
.option-wrong .option-symbol { color: #873c2c; border-color: #dcb8aa; background: #f4d9cc; }
.quiz-feedback { font-size: 26rpx; line-height: 1.7; border-left: 4rpx solid #98b38b; }
.quiz-feedback.incorrect { border-left-color: #c39580; }
.feedback { min-height: 52rpx; padding: 8rpx 0; }
.feedback .mini-notice { margin: 8rpx 0 16rpx; }
.rating-caption { font-size: 25rpx; line-height: 1.6; }
.rate-btn { min-height: 124rpx; border: 1rpx solid transparent; border-radius: 20rpx; }
.rate-btn.again { border-color: #ead1c7; }
.rate-btn.hard { border-color: #e6d7b4; }
.rate-btn.good { border-color: #bdcfb2; }
.completion-card { background: #f1f6eb; border-color: #d1e0c7; }
</style>
