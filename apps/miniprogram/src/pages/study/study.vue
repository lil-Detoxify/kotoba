<script setup lang="ts">
import { computed, ref } from "vue";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { defaultAudioCache, defaultRepository, defaultSyncCoordinator } from "../../adapters";
import { UniAudioPlayer } from "../../adapters/audio";
import { AudioPreloader } from "../../adapters/audio-preload";
import { AUDIO_VOICE_OPTIONS, getCloudflareAudioUrl, getWordAudioUrl, getWordAudioFallbackUrl, type AudioVoice } from "../../adapters/audio-url";
import { Rating, type Grade } from "ts-fsrs";
import { statistics } from "@jp/core";
import type { Data, ExerciseType, StudyMode, Word, QuizAttempt } from "@jp/models";
import { applyStudyRating, getStudyQueue } from "./study-session";
import { createStudyQuestion, ratingForStudyAnswer, submitStudyAnswer } from "./study-quiz";
import { defaultTextbooks } from "../../services/textbooks";
import { setDifficult, setIgnored } from "../../services/word-flags";
import { setPronunciationVoice } from "../../services/pronunciation";
import { reviewQueueItems } from "../../services/sync-outbox";

const words = ref<Word[]>([]);
const studyPool = ref<Word[]>([]);
const loadedData = ref<Data | null>(null);
const currentIndex = ref(0);
const revealed = ref(false);
const currentWord = ref<Word | null>(null);
const finished = ref(false);
const message = ref("");
const saving = ref(false);
const speaking = ref(false);
const loading = ref(true);
const loadError = ref("");
const emptyQueue = ref(false);
const mode = ref<StudyMode>("new");
const voice = ref<"female" | "male">("female");
const exercise = ref<ExerciseType>("card");
const question = ref<ReturnType<typeof createStudyQuestion>>(null);
const attempt = ref<QuizAttempt | null>(null);
const heard = ref(false);
const uncertain = ref(false);
const streak = ref(0);
const isDifficult = ref(false);
const markingDifficult = ref(false);
const markingIgnored = ref(false);
const changingVoice = ref(false);
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
let requestedLesson: string | undefined;
let requestedMode: string | undefined;
let requestedExercise: string | undefined;
let sessionKey = defaultRepository.getActiveKey();
let touchStartX = 0;
let touchStartY = 0;
let touchStarted = false;
let suppressTapUntil = 0;
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

function traceAudioStage(stage: string): void {
  if (!audioDiagnosticsEnabled || audioTraceStart === undefined) return;
  // Deliberately log timing only: no audio URLs, words, account data or native errors.
  console.info(`[KotoBud audio] ${stage}: ${Date.now() - audioTraceStart}ms`);
}

const progressLabel = computed(() => `${currentIndex.value} / ${words.value.length}`);
const progressPercent = computed(() => words.value.length ? currentIndex.value / words.value.length * 100 : 0);
const modeLabel = computed(() => mode.value === "review" ? "到期复习" : mode.value === "difficult" ? "难词巩固" : "新词学习");
const audioUrl = computed(() => {
  if (!currentWord.value) return undefined;
  const started = Date.now();
  const resolved = getWordAudioUrl(currentWord.value, voice.value);
  if (import.meta.env.DEV) console.info(`[KotoBud audio] urlCompute: ${Date.now() - started}ms`);
  return resolved;
});
const exerciseOptions: Array<{ value: ExerciseType; label: string }> = [
  { value: "card", label: "卡片" }, { value: "mixed", label: "混合" },
  { value: "kana-meaning", label: "假名选义" }, { value: "kanji-reading", label: "汉字选音" },
  { value: "audio-meaning", label: "听音选义" },
];

async function initStudy(lessonId = requestedLesson, selectedMode = requestedMode, selectedExercise = requestedExercise) {
  if (initializing || disposed) return;
  requestedLesson = lessonId;
  requestedMode = selectedMode;
  requestedExercise = selectedExercise;
  initializing = true;
  loading.value = true;
  loadError.value = "";
  emptyQueue.value = false;
  finished.value = false;
  currentWord.value = null;
  message.value = "";
  question.value = null;
  attempt.value = null;
  heard.value = false;
  uncertain.value = false;
  mode.value = selectedMode === "review" || selectedMode === "difficult" ? selectedMode : "new";
  if (["card", "kana-meaning", "kanji-reading", "audio-meaning", "mixed"].includes(selectedExercise || "")) {
    exercise.value = selectedExercise as ExerciseType;
  }
  sessionKey = defaultRepository.getActiveKey();
  const key = sessionKey;
  try {
    const data = await defaultTextbooks.prepareStudy(lessonId, mode.value);
    if (disposed) return;
    if (defaultRepository.getActiveKey() !== key) throw new Error("Account changed");
    loadedData.value = data;
    words.value = getStudyQueue(data, mode.value, lessonId);
    studyPool.value = data.words;
    currentIndex.value = 0;
    voice.value = data.userSettings?.preferences?.pronunciationVoice === "male" ? "male" : "female";
    streak.value = statistics(data).streak;
    emptyQueue.value = words.value.length === 0;
    loadWord();
  } catch {
    if (!disposed) loadError.value = "学习记录暂时无法读取，请重试。原有记录未被覆盖。";
  } finally {
    initializing = false;
    if (!disposed) loading.value = false;
  }
}

function stopAudio() {
  audioGeneration++;
  player?.stop();
  speaking.value = false;
}

function preloadNearbyWords(): void {
  if (!visible || disposed || !currentWord.value) { preloader.cancel(); return; }
  const started = Date.now();
  const urls = words.value.slice(currentIndex.value, currentIndex.value + 3)
    .map((word) => getWordAudioUrl(word, voice.value))
    .filter((url): url is string => !!url);
  if (audioDiagnosticsEnabled) console.info(`[KotoBud audio] preloadUrlCompute: ${Date.now() - started}ms`);
  preloader.schedule(urls);
}

function loadWord() {
  stopAudio();
  touchStarted = false;
  attempt.value = null;
  heard.value = false;
  uncertain.value = false;
  question.value = null;
  if (requestedExercise && ["card", "kana-meaning", "kanji-reading", "audio-meaning", "mixed"].includes(requestedExercise)) {
    exercise.value = requestedExercise as ExerciseType;
  }
  revealed.value = false;
  currentWord.value = words.value[currentIndex.value] || null;
  preloadNearbyWords();
  isDifficult.value = !!loadedData.value?.states.find((state) => state.wordId === currentWord.value?.id)?.isDifficult;
  finished.value = words.value.length > 0 && !currentWord.value;
  startedAt.value = Date.now();
  if (currentWord.value && exercise.value !== "card") {
    const candidate = createStudyQuestion(currentWord.value, studyPool.value, exercise.value, Math.random, () => !!audioUrl.value);
    question.value = candidate;
    if (!question.value) exercise.value = "card";
  }
}

async function toggleDifficult() {
  if (!currentWord.value || markingDifficult.value || markingIgnored.value || changingVoice.value || saving.value || disposed) return;
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
  if (!currentWord.value || markingIgnored.value || markingDifficult.value || changingVoice.value || saving.value || attempt.value || disposed) return;
  if (defaultRepository.getActiveKey() !== sessionKey) {
    message.value = "账户已切换，请返回首页后重新开始学习。";
    return;
  }
  const word = currentWord.value;
  markingIgnored.value = true;
  try {
    const updated = await setIgnored(word.id, true, defaultRepository);
    if (disposed || defaultRepository.getActiveKey() !== sessionKey || currentWord.value?.id !== word.id) return;
    loadedData.value = updated;
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
  stopAudio();
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
    if (!disposed) changingVoice.value = false;
  }
}

function selectExercise(value: ExerciseType) {
  if (saving.value || markingDifficult.value || markingIgnored.value || changingVoice.value || attempt.value || value === exercise.value) return;
  exercise.value = value;
  requestedExercise = value;
  loadWord();
}

function submitAnswer(selected: string | null) {
  if (!question.value || attempt.value || saving.value || (question.value.type === "audio-meaning" && !heard.value)) return;
  attempt.value = submitStudyAnswer(question.value, selected);
  revealed.value = true;
}

function playQuestionAudio(slow = false) { if (question.value?.type === "audio-meaning") void playAudio(slow); }

function flipCard() {
  if (exercise.value !== "card") return;
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

async function playAudio(slow = false) {
  if (!audioUrl.value || saving.value || changingVoice.value || disposed || !visible) return;
  if (speaking.value) { stopAudio(); return; }
  const ticket = ++audioGeneration;
  audioTraceStart = Date.now();
  traceAudioStage("tap");
  const word = currentWord.value;
  speaking.value = true;
  message.value = "";
  try {
    player ||= new UniAudioPlayer(({ playId, type }) => traceAudioStage(`native#${playId}.${type}`));
    const primaryUrl = audioUrl.value;
    traceAudioStage("urlReady");
    traceAudioStage("cacheLookupStart");
    let cachedUrl = await defaultAudioCache.getCached(primaryUrl);
    if (!cachedUrl && preloader.isActive(primaryUrl)) {
      const resolved = await defaultAudioCache.resolve(primaryUrl);
      if (resolved !== primaryUrl) cachedUrl = resolved;
    }
    traceAudioStage(cachedUrl ? "cacheHit" : "cacheMiss");
    if (ticket !== audioGeneration || disposed || !visible) return;
    const onInterrupted = () => {
      if (ticket === audioGeneration) audioGeneration++;
      speaking.value = false;
    };
    let played = await player.play(cachedUrl || primaryUrl, { slow, onInterrupted });
    traceAudioStage(played ? "primaryEnded" : "primaryFailed");
    if (ticket !== audioGeneration || disposed) return;
    let retriedPrimary = false;
    if (!played && cachedUrl) {
      await defaultAudioCache.invalidate(primaryUrl);
      if (ticket !== audioGeneration || disposed || !visible) return;
      played = await player.play(primaryUrl, { slow, onInterrupted });
      retriedPrimary = true;
      if (ticket !== audioGeneration || disposed) return;
    }
    if (played && (!cachedUrl || retriedPrimary)) void defaultAudioCache.warm(primaryUrl);
    const cloudflareUrl = getCloudflareAudioUrl(primaryUrl);
    const legacyUrl = word ? getWordAudioFallbackUrl(word) : undefined;
    const fallbackUrls = [cloudflareUrl, legacyUrl, legacyUrl ? getCloudflareAudioUrl(legacyUrl) : undefined]
      .filter((url, index, urls): url is string => !!url && url !== primaryUrl && urls.indexOf(url) === index);
    for (const fallback of fallbackUrls) {
      if (played) break;
      const cachedFallback = await defaultAudioCache.getCached(fallback);
      if (ticket !== audioGeneration || disposed || !visible) return;
      played = await player.play(cachedFallback || fallback, { slow, onInterrupted });
      traceAudioStage(played ? "fallbackEnded" : "fallbackFailed");
      if (ticket !== audioGeneration || disposed) return;
      let retriedRemote = false;
      if (!played && cachedFallback) {
        await defaultAudioCache.invalidate(fallback);
        if (ticket !== audioGeneration || disposed || !visible) return;
        played = await player.play(fallback, { slow, onInterrupted });
        retriedRemote = true;
        if (ticket !== audioGeneration || disposed) return;
      }
      if (played && (!cachedFallback || retriedRemote)) void defaultAudioCache.warm(fallback);
    }
    if (!played) {
      const isListeningQuestion = question.value?.type === "audio-meaning";
      message.value = isListeningQuestion ? "题目音频暂时无法播放，已切回卡片模式。" : "发音暂时无法播放，请稍后重试。";
      if (isListeningQuestion) { exercise.value = "card"; question.value = null; attempt.value = null; revealed.value = false; }
    } else if (question.value?.type === "audio-meaning") {
      heard.value = true;
    }
  } catch {
    if (ticket === audioGeneration && !disposed) {
      const isListeningQuestion = question.value?.type === "audio-meaning";
      message.value = isListeningQuestion ? "题目音频暂时无法播放，已切回卡片模式。" : "发音暂时无法播放，请稍后重试。";
      if (isListeningQuestion) { exercise.value = "card"; question.value = null; attempt.value = null; revealed.value = false; }
    }
  } finally {
    if (ticket === audioGeneration && !disposed) speaking.value = false;
  }
}

async function rate(grade: Grade) {
  if (!currentWord.value || saving.value || markingDifficult.value || markingIgnored.value || changingVoice.value || disposed || !visible) return;
  if (exercise.value === "card" && !revealed.value) return;
  if (exercise.value !== "card" && !attempt.value) return;
  const attemptSnapshot = attempt.value;
  const uncertainSnapshot = uncertain.value;
  const finalGrade = attemptSnapshot ? ratingForStudyAnswer(attemptSnapshot, uncertainSnapshot) : grade;
  if (defaultRepository.getActiveKey() !== sessionKey) {
    message.value = "账户已切换，请返回首页后重新开始学习。";
    return;
  }
  saving.value = true;
  stopAudio();
  const word = currentWord.value;
  const now = new Date();
  const responseTime = Math.max(0, now.getTime() - startedAt.value);
  const logId = `log_${now.getTime()}_${Math.random().toString(36).slice(2)}_${word.id}`;
  try {
    let result: ReturnType<typeof applyStudyRating> | undefined;
    const updated = await defaultRepository.transactAndEnqueue((data: Data) => {
      result = applyStudyRating(data, word, finalGrade, mode.value, now, logId, responseTime, attemptSnapshot ?? undefined);
    }, () => result ? reviewQueueItems(result.log, result.state) : [], sessionKey);
    if (disposed) return;
    loadedData.value = updated;
    currentIndex.value++;
    streak.value = statistics(updated, now).streak;
    loadWord();
    message.value = `已保存「${ratingOptions.find((item) => item.grade === finalGrade)?.label ?? "模糊"}」 · 今日已打卡`;
    void defaultSyncCoordinator.flush("timer");
  } catch {
    if (!disposed) message.value = "保存失败，当前卡片已保留，请重试。";
  } finally {
    if (!disposed) saving.value = false;
  }
}

function backToHome() { uni.switchTab({ url: "/pages/index/index" }); }
onLoad((query) => { void initStudy(query?.lessonId, query?.mode, query?.exercise); });
onShow(() => { visible = true; preloadNearbyWords(); });
onHide(() => { visible = false; onTouchCancel(); stopAudio(); preloader.cancel(); });
onUnload(() => { disposed = true; stopAudio(); preloader.cancel(); player?.destroy(); });
</script>

<template>
  <view class="container study-page">
    <view v-if="loading" class="card status-card">
      <text>正在准备学习卡片…</text>
    </view>
    <view v-else-if="loadError" class="card status-card">
      <text>{{ loadError }}</text>
      <button class="study-button" @tap="initStudy()">重新读取</button>
    </view>
    <view v-else-if="emptyQueue" class="card status-card">
      <text class="status-title">{{ mode === 'review' ? '暂时没有到期词' : '这一组已没有待学词' }}</text>
      <text>可以返回首页，选择其他课次或稍后再来。</text>
      <button class="study-button" @tap="backToHome">返回首页</button>
    </view>
    <view v-else>
      <scroll-view class="exercise-picker" scroll-x="true" :show-scrollbar="false">
        <button v-for="item in exerciseOptions" :key="item.value" class="exercise-btn" :class="{ selected: exercise === item.value }" :disabled="saving || markingDifficult || markingIgnored || changingVoice" @tap="selectExercise(item.value)">{{ item.label }}</button>
      </scroll-view>
      <view class="voice-picker">
        <text>声音</text>
        <button v-for="item in AUDIO_VOICE_OPTIONS" :key="item.value" class="voice-option" :class="{ selected: voice === item.value }" :disabled="changingVoice || markingDifficult || markingIgnored || saving" @tap="selectVoice(item.value)">{{ item.label }}</button>
      </view>
      <view class="progress-info">
        <text>{{ modeLabel }}</text>
        <text>已完成 {{ progressLabel }}</text>
      </view>
      <view class="progress-track"><view class="progress-fill" :style="{ width: progressPercent + '%' }" /></view>
      <view v-if="currentWord" class="card word-card" :class="{ 'is-revealed': revealed }">
        <view
          class="card-surface"
          hover-class="surface-pressed"
          @tap="onCardTap"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchCancel"
        >
          <text class="face-label">{{ exercise === 'card' ? (revealed ? '释义与例句' : '先想一想它的意思') : question?.type === 'audio-meaning' ? '听音后选择中文释义' : question?.prompt }}</text>
          <text v-if="exercise === 'card' || question?.type === 'kanji-reading' || attempt" class="term">{{ currentWord.term }}</text>
          <text v-if="exercise === 'card' || attempt" class="reading">{{ currentWord.reading }}</text>
          <text v-if="currentWord.partOfSpeech" class="pos-badge">{{ currentWord.partOfSpeech }}</text>
          <view v-if="exercise !== 'card' && question" class="quiz-options">
            <view v-if="question.type === 'audio-meaning'" class="quiz-listen">
              <button class="study-button quiz-audio" :disabled="saving" @tap.stop="playQuestionAudio(false)">{{ speaking ? '停止发音' : '播放题目音频' }}</button>
              <button class="study-button quiz-audio" :disabled="saving || speaking" @tap.stop="playQuestionAudio(true)">慢速听</button>
            </view>
            <text v-if="question.type === 'audio-meaning' && !heard && !attempt" class="card-hint">播放后即可选择答案</text>
            <button v-for="option in question.options" :key="option" class="quiz-option"
              :class="{ 'option-correct': attempt && option === question.correct, 'option-wrong': attempt && !attempt.isCorrect && option === attempt.selected }"
              :disabled="!!attempt || saving || (question.type === 'audio-meaning' && !heard)" @tap.stop="submitAnswer(option)">{{ option }}</button>
            <button v-if="!attempt" class="dont-know" :disabled="saving || (question.type === 'audio-meaning' && !heard)" @tap.stop="submitAnswer(null)">不认识，查看解析</button>
            <text v-if="attempt" class="quiz-feedback" :class="{ incorrect: !attempt.isCorrect }">{{ attempt.isCorrect ? '答对了，继续巩固这份记忆。' : `再记住一次。正确答案：${attempt.correct}` }}</text>
            <view v-if="attempt" class="word-details">
              <text class="meaning">{{ currentWord.meaning }}</text>
              <view v-if="currentWord.example" class="example-box">
                <text class="example-ja">{{ currentWord.example }}</text>
                <text v-if="currentWord.exampleReading" class="example-reading">{{ currentWord.exampleReading }}</text>
                <text v-if="currentWord.exampleTranslation" class="example-zh">{{ currentWord.exampleTranslation }}</text>
              </view>
            </view>
          </view>
          <view v-else-if="revealed" class="word-details">
            <text class="meaning">{{ currentWord.meaning }}</text>
            <view v-if="currentWord.example" class="example-box">
              <text class="example-ja">{{ currentWord.example }}</text>
              <text v-if="currentWord.exampleReading" class="example-reading">{{ currentWord.exampleReading }}</text>
              <text v-if="currentWord.exampleTranslation" class="example-zh">{{ currentWord.exampleTranslation }}</text>
            </view>
          </view>
          <text v-else class="card-hint">点击卡片或左右轻滑，查看答案</text>
        </view>
        <view class="audio-controls">
          <button class="study-button" :disabled="!audioUrl || saving" @tap="playAudio()">
            {{ speaking ? '停止发音' : '播放发音' }}
          </button>
          <button class="study-button" :disabled="!audioUrl || saving || speaking" @tap="playAudio(true)">慢速听</button>
        </view>
        <text v-if="audioUrl" class="audio-source">{{ currentWord.reading ? `Google WaveNet · ${voice === 'male' ? '男声 C' : '女声 A'}` : '词书发音' }}</text>
        <button class="difficult-button" :disabled="markingDifficult || markingIgnored || changingVoice || saving" @tap="toggleDifficult">{{ isDifficult ? '★ 已标记难词' : '☆ 标记为难词' }}</button>
        <button class="ignore-button" :disabled="markingIgnored || markingDifficult || changingVoice || saving || !!attempt" @tap="ignoreCurrentWord">忽略此词</button>
        <text v-if="!audioUrl" class="card-hint">这个词暂时没有可用发音</text>
      </view>
      <button v-if="currentWord && exercise === 'card'" class="study-button flip-button" :disabled="saving" @tap="flipCard">
        {{ revealed ? '返回词面' : '显示释义' }}
      </button>
      <view class="feedback"><text>{{ saving ? '正在保存…' : message }}</text></view>
      <view v-if="currentWord" class="rating-section">
        <text class="rating-caption">{{ exercise !== 'card' && attempt ? (attempt.isCorrect ? '答对了；这次有多轻松？' : '答错了；下次会更早复习') : revealed ? '这次想起来，有多轻松？' : '查看答案后，按真实记忆程度评分' }}</text>
        <label v-if="exercise !== 'card' && attempt?.isCorrect" class="uncertain-toggle"><checkbox :checked="uncertain" @tap="uncertain = !uncertain" />这次是猜对的</label>
        <view v-if="exercise === 'card'" class="rating-bar">
          <button
            v-for="item in ratingOptions"
            :key="item.grade"
            class="rate-btn"
            :class="item.style"
            :disabled="saving || markingDifficult || markingIgnored || changingVoice || !revealed"
            @tap="rate(item.grade)"
          >
            <text>{{ item.label }}</text>
            <text class="rating-hint">{{ item.hint }}</text>
          </button>
        </view>
        <button v-else class="study-button quiz-save" :disabled="saving || markingDifficult || markingIgnored || changingVoice || !attempt" @tap="rate(Rating.Good)">
          保存并继续（{{ attempt?.isCorrect ? (uncertain ? '模糊' : '记得') : '忘记了' }}）
        </button>
      </view>
      <view v-if="finished" class="card status-card">
        <text class="face-label">ことばを、少しずつ。</text>
        <text class="status-title">本组学习完成</text>
        <text>已保存 {{ currentIndex }} 次学习记录，连续打卡 {{ streak }} 天。</text>
        <button class="study-button" @tap="backToHome">返回首页</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.study-page {
  --ink: #273c35;
  --muted: #69746b;
  --green: #365d49;
  --line: #dfe5db;
  color: var(--ink);
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}
.voice-picker { display: flex; align-items: center; gap: 10rpx; margin: 0 0 20rpx; color: var(--muted); font-size: 25rpx; }
.voice-option { margin: 0; min-height: 42px; padding: 4rpx 20rpx; border: 1rpx solid var(--line); border-radius: 12rpx; background: #fffefb; color: var(--muted); font-size: 25rpx; }
.voice-option.selected { background: #eaf0e3; border-color: #a8bbac; color: var(--green); font-weight: 600; }
.progress-info { display: flex; justify-content: space-between; gap: 16rpx; font-size: 26rpx; color: var(--muted); }
.exercise-picker { display: flex; white-space: nowrap; margin-bottom: 18rpx; }
.exercise-btn { display: inline-flex; min-height: 48px; margin-right: 10rpx; padding: 0 22rpx; border: 1rpx solid var(--line); border-radius: 24rpx; background: #fffefb; color: var(--muted); align-items: center; justify-content: center; font-size: 24rpx; }
.exercise-btn.selected { background: #eaf0e3; border-color: #a8bbac; color: var(--green); font-weight: 600; }
.progress-track { height: 8rpx; margin: 18rpx 0 28rpx; border-radius: 8rpx; background: #e5eadf; overflow: hidden; }
.progress-fill { height: 100%; background: var(--green); }
.word-card { padding: 0 28rpx 28rpx; text-align: center; border-color: var(--line); background: #fffefb; box-shadow: none; border-radius: 18rpx; }
.is-revealed { border-color: #a8bbac; background: #fffefb; }
.card-surface { min-height: 460rpx; padding: 36rpx 0 28rpx; display: flex; flex-direction: column; align-items: center; }
.surface-pressed { opacity: .85; }
.face-label { font-size: 24rpx; color: var(--muted); margin-bottom: 28rpx; }
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
.difficult-button { min-height: 44px; margin-top: 14rpx; border: 0; background: transparent; color: var(--muted); font-size: 24rpx; }
.study-button { flex: 1; min-height: 48px; display: flex; align-items: center; justify-content: center; padding: 12rpx 20rpx; border: 1rpx solid var(--line); border-radius: 12rpx; background: #f7f8f4; color: var(--green); font-size: 28rpx; line-height: 1.5; }
.flip-button { width: 100%; }
.feedback { min-height: 64rpx; padding: 16rpx 0; font-size: 26rpx; color: var(--green); }
.rating-caption { display: block; margin-bottom: 16rpx; text-align: center; font-size: 26rpx; color: var(--muted); }
.uncertain-toggle { display: flex; min-height: 48px; align-items: center; justify-content: center; gap: 8rpx; margin-bottom: 14rpx; color: var(--muted); font-size: 25rpx; }
.quiz-options { width: 100%; display: flex; flex-direction: column; gap: 12rpx; margin-top: 24rpx; }
.quiz-option { width: 100%; min-height: 52px; border: 1rpx solid var(--line); border-radius: 12rpx; background: #fffefb; color: var(--ink); font-size: 30rpx; }
.quiz-option.option-correct { border-color: #9cba9a; background: #e3efdf; color: var(--green); }
.quiz-option.option-wrong { border-color: #d5a79a; background: #fce5df; color: #8d3025; }
.quiz-listen { display: flex; gap: 8rpx; }
.quiz-feedback { padding: 16rpx 20rpx; border-radius: 12rpx; background: #e3efdf; color: var(--green); font-size: 27rpx; }
.quiz-feedback.incorrect { background: #fce5df; color: #8d3025; }
.dont-know { margin-top: 4rpx; min-height: 44px; border: 0; background: transparent; color: var(--muted); font-size: 25rpx; }
.audio-source { display: block; margin-top: 14rpx; color: var(--muted); font-size: 23rpx; }
.ignore-button { min-height: 42px; border: 0; background: transparent; color: var(--muted); font-size: 24rpx; }
.quiz-audio { width: 100%; }
.quiz-save { width: 100%; margin-top: 14rpx; }
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
@media (max-width: 340px) { .rating-bar { flex-wrap: wrap; } .rate-btn { flex-basis: 44%; } }
</style>
