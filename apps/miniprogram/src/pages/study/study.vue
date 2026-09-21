<script setup lang="ts">
import { computed, ref } from "vue";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { defaultRepository } from "../../adapters";
import { UniAudioPlayer } from "../../adapters/audio";
import { getWordAudioUrl, getWordAudioFallbackUrl } from "../../adapters/audio-url";
import { Rating, type Grade } from "ts-fsrs";
import { statistics } from "@jp/core";
import type { Data, StudyMode, Word } from "@jp/models";
import seedData from "../../seed.json";
import { applyStudyRating, getStudyQueue } from "./study-session";

const words = ref<Word[]>([]);
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
const streak = ref(0);
const startedAt = ref(Date.now());
const ratingOptions = [
  { grade: Rating.Again, label: "忘记", hint: "还没记住", style: "again" },
  { grade: Rating.Hard, label: "困难", hint: "费力想起", style: "hard" },
  { grade: Rating.Good, label: "记得", hint: "正常想起", style: "good" },
  { grade: Rating.Easy, label: "简单", hint: "轻松掌握", style: "easy" },
] as const;

// Each page owns its player; unloading must not destroy the next page's audio.
let player: UniAudioPlayer | undefined;
let audioGeneration = 0;
let disposed = false;
let visible = true;
let initializing = false;
let requestedLesson: string | undefined;
let requestedMode: string | undefined;
let sessionKey = defaultRepository.getActiveKey();
let touchStartX = 0;
let touchStartY = 0;
let touchStarted = false;
let suppressTapUntil = 0;

const progressLabel = computed(() => `${currentIndex.value} / ${words.value.length}`);
const progressPercent = computed(() => words.value.length ? currentIndex.value / words.value.length * 100 : 0);
const modeLabel = computed(() => mode.value === "review" ? "到期复习" : mode.value === "difficult" ? "难词巩固" : "新词学习");
const audioUrl = computed(() => currentWord.value ? getWordAudioUrl(currentWord.value, voice.value) : undefined);

async function initStudy(lessonId = requestedLesson, selectedMode = requestedMode) {
  if (initializing || disposed) return;
  requestedLesson = lessonId;
  requestedMode = selectedMode;
  initializing = true;
  loading.value = true;
  loadError.value = "";
  emptyQueue.value = false;
  finished.value = false;
  currentWord.value = null;
  message.value = "";
  mode.value = selectedMode === "review" || selectedMode === "difficult" ? selectedMode : "new";
  sessionKey = defaultRepository.getActiveKey();
  try {
    let data = await defaultRepository.read(sessionKey);
    if (!data.seeded && data.books.length === 0 && data.words.length === 0) {
      data = await defaultRepository.transact((draft) => {
        if (draft.seeded || draft.books.length || draft.words.length) return;
        draft.books = seedData.books;
        draft.lessons = seedData.lessons;
        draft.words = seedData.words;
        draft.currentBookId = seedData.books[0]?.id;
        draft.currentBookIdSource = "default";
        draft.seeded = true;
      }, sessionKey);
    }
    if (disposed) return;
    words.value = getStudyQueue(data, mode.value, lessonId);
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

function loadWord() {
  stopAudio();
  touchStarted = false;
  revealed.value = false;
  currentWord.value = words.value[currentIndex.value] || null;
  finished.value = words.value.length > 0 && !currentWord.value;
  startedAt.value = Date.now();
}

function flipCard() {
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
  if (!audioUrl.value || saving.value || disposed || !visible) return;
  if (speaking.value) { stopAudio(); return; }
  const ticket = ++audioGeneration;
  const word = currentWord.value;
  speaking.value = true;
  message.value = "";
  try {
    player ||= new UniAudioPlayer();
    let played = await player.play(audioUrl.value, { slow });
    if (ticket !== audioGeneration || disposed) return;
    const fallback = word ? getWordAudioFallbackUrl(word) : undefined;
    if (!played && fallback && fallback !== audioUrl.value) {
      played = await player.play(fallback, { slow });
      if (ticket !== audioGeneration || disposed) return;
    }
    if (!played) message.value = "发音暂时无法播放，请检查网络后重试。你可以继续学习。";
  } catch {
    if (ticket === audioGeneration && !disposed) message.value = "发音暂时无法播放，请稍后重试。";
  } finally {
    if (ticket === audioGeneration && !disposed) speaking.value = false;
  }
}

async function rate(grade: Grade) {
  if (!currentWord.value || !revealed.value || saving.value || disposed || !visible) return;
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
    const updated = await defaultRepository.transact((data: Data) => {
      applyStudyRating(data, word, grade, mode.value, now, logId, responseTime);
    }, sessionKey);
    if (disposed) return;
    currentIndex.value++;
    streak.value = statistics(updated, now).streak;
    loadWord();
    message.value = `已保存「${ratingOptions.find((item) => item.grade === grade)?.label}」 · 今日已打卡`;
  } catch {
    if (!disposed) message.value = "保存失败，当前卡片已保留，请重试。";
  } finally {
    if (!disposed) saving.value = false;
  }
}

function backToHome() { uni.switchTab({ url: "/pages/index/index" }); }
onLoad((query) => { void initStudy(query?.lessonId, query?.mode); });
onShow(() => { visible = true; });
onHide(() => { visible = false; onTouchCancel(); stopAudio(); });
onUnload(() => { disposed = true; stopAudio(); player?.destroy(); });
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
          <text class="face-label">{{ revealed ? '释义与例句' : '先想一想它的意思' }}</text>
          <text class="term">{{ currentWord.term }}</text>
          <text class="reading">{{ currentWord.reading }}</text>
          <text v-if="currentWord.partOfSpeech" class="pos-badge">{{ currentWord.partOfSpeech }}</text>
          <view v-if="revealed" class="word-details">
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
        <text v-if="!audioUrl" class="card-hint">这个词暂时没有可用发音</text>
      </view>
      <button v-if="currentWord" class="study-button flip-button" :disabled="saving" @tap="flipCard">
        {{ revealed ? '返回词面' : '显示释义' }}
      </button>
      <view class="feedback"><text>{{ saving ? '正在保存…' : message }}</text></view>
      <view v-if="currentWord" class="rating-section">
        <text class="rating-caption">{{ revealed ? '这次想起来，有多轻松？' : '查看答案后，按真实记忆程度评分' }}</text>
        <view class="rating-bar">
          <button
            v-for="item in ratingOptions"
            :key="item.grade"
            class="rate-btn"
            :class="item.style"
            :disabled="saving || !revealed"
            @tap="rate(item.grade)"
          >
            <text>{{ item.label }}</text>
            <text class="rating-hint">{{ item.hint }}</text>
          </button>
        </view>
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
  --muted: #59675d;
  --green: #365d49;
  --line: #dfe5db;
  color: var(--ink);
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}
.progress-info { display: flex; justify-content: space-between; gap: 16rpx; font-size: 26rpx; color: var(--muted); }
.progress-track { height: 8rpx; margin: 18rpx 0 28rpx; border-radius: 8rpx; background: #e5eadf; overflow: hidden; }
.progress-fill { height: 100%; background: var(--green); }
.word-card { padding: 0 28rpx 28rpx; text-align: center; border-color: var(--line); }
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
.study-button { flex: 1; min-height: 48px; display: flex; align-items: center; justify-content: center; padding: 12rpx 20rpx; border: 1rpx solid var(--line); border-radius: 12rpx; background: #f7f8f4; color: var(--green); font-size: 28rpx; line-height: 1.5; }
.flip-button { width: 100%; }
.feedback { min-height: 64rpx; padding: 16rpx 0; font-size: 26rpx; color: var(--green); }
.rating-caption { display: block; margin-bottom: 16rpx; text-align: center; font-size: 26rpx; color: var(--muted); }
.rating-bar { display: flex; gap: 8px; }
.rate-btn { flex: 1; min-width: 0; min-height: 64px; border-radius: 12rpx; font-size: 28rpx; line-height: 1.5; font-weight: 600; padding: 14rpx 2rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.rating-hint { font-size: 22rpx; margin-top: 8rpx; font-weight: 400; }
.again { background: #fce5df; color: #8d3025; }
.hard { background: #f8eed6; color: #795717; }
.good { background: #e3efdf; color: #365d49; }
.easy { background: #e1ecf1; color: #2e5869; }
button[disabled] { color: #767c76; background: #eceee9; opacity: .75; }
.status-card { display: flex; flex-direction: column; align-items: center; gap: 28rpx; text-align: center; padding: 56rpx 32rpx; font-size: 28rpx; }
.status-title { font-size: 40rpx; font-weight: 700; }
.status-card .study-button { width: 100%; }
@media (max-width: 340px) { .rating-bar { flex-wrap: wrap; } .rate-btn { flex-basis: 44%; } }
</style>
