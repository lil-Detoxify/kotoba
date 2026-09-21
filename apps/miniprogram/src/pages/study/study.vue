<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { defaultRepository } from "../../adapters";
import { evaluate, initialState, stateFor } from "@jp/core";
import type { Word, WordState } from "@jp/models";
import { Rating } from "ts-fsrs";
import seedData from "../../seed.json";

const words = ref<Word[]>([]);
const currentIndex = ref(0);
const revealed = ref(false);
const currentWord = ref<Word | null>(null);
const currentWordState = ref<WordState | null>(null);
const finished = ref(false);
const message = ref("");

async function initStudy(lessonId?: string) {
  let data = await defaultRepository.read();
  if (!data.words || data.words.length === 0) {
    data = await defaultRepository.transact((d) => {
      d.books = seedData.books as any;
      d.lessons = seedData.lessons as any;
      d.words = seedData.words as any;
      d.currentBookId = seedData.books[0]?.id;
      d.seeded = true;
    });
  }

  let queue = data.words;
  if (lessonId) {
    queue = data.words.filter((w) => w.lessonId === lessonId);
  }
  if (queue.length === 0) queue = data.words;

  words.value = queue;
  currentIndex.value = 0;
  loadWord(data);
}

function loadWord(data: any) {
  if (currentIndex.value >= words.value.length) {
    finished.value = true;
    currentWord.value = null;
    return;
  }
  const w = words.value[currentIndex.value];
  currentWord.value = w;
  revealed.value = false;
  message.value = "";
  currentWordState.value = stateFor(data, w.id) || initialState(w.id);
}

function reveal() {
  revealed.value = true;
}

async function rate(grade: number) {
  if (!currentWord.value) return;
  const word = currentWord.value;
  const prev = currentWordState.value || initialState(word.id);
  const now = new Date();
  const res = evaluate(prev, grade as any, "new", now, `log_${Date.now()}`);

  const updatedData = await defaultRepository.transact((d) => {
    const idx = d.states.findIndex((s) => s.wordId === word.id);
    if (idx >= 0) {
      d.states[idx] = res.state;
    } else {
      d.states.push(res.state);
    }
    d.logs.push(res.log);
  });

  message.value = `已更新 FSRS 状态 (复习次数: ${res.state.reviewCount})`;
  setTimeout(() => {
    currentIndex.value++;
    loadWord(updatedData);
  }, 400);
}

function backToHome() {
  uni.switchTab({
    url: "/pages/index/index"
  });
}

onLoad((query: any) => {
  initStudy(query?.lessonId);
});
</script>

<template>
  <view class="container study-page">
    <view class="progress-bar">
      <view class="progress-info">
        <text class="progress-text">学习进度: {{ currentIndex + 1 }} / {{ words.length }}</text>
        <text v-if="message" class="toast-msg">{{ message }}</text>
      </view>
    </view>

    <view v-if="!finished && currentWord" class="card word-card">
      <view class="word-main">
        <text class="term">{{ currentWord.term }}</text>
        <text class="reading">{{ currentWord.reading }}</text>
        <text v-if="currentWord.partOfSpeech" class="pos-badge">{{ currentWord.partOfSpeech }}</text>
      </view>

      <view v-if="revealed" class="word-details">
        <view class="meaning-box">
          <text class="meaning-label">中文释义</text>
          <text class="meaning-text">{{ currentWord.meaning }}</text>
        </view>

        <view v-if="currentWord.example" class="example-box">
          <text class="example-label">例句</text>
          <text class="example-ja">{{ currentWord.example }}</text>
          <text class="example-zh">{{ currentWord.exampleTranslation }}</text>
        </view>
      </view>

      <view v-else class="reveal-prompt" @tap="reveal">
        <text class="reveal-btn-text">点击显示释义与例句</text>
      </view>
    </view>

    <view v-if="!finished && currentWord" class="rating-bar">
      <button class="rate-btn again" @tap="rate(Rating.Again)">忘记</button>
      <button class="rate-btn hard" @tap="rate(Rating.Hard)">模糊</button>
      <button class="rate-btn good" @tap="rate(Rating.Good)">记得</button>
    </view>

    <view v-if="finished" class="card finish-card">
      <text class="finish-title">🎉 本组学习完成！</text>
      <text class="finish-desc">所有进度已通过 Storage Adapter 原子落盘保存。</text>
      <button class="primary-btn" @tap="backToHome">返回首页</button>
    </view>
  </view>
</template>

<style scoped>
.study-page {
  display: flex;
  flex-direction: column;
  min-height: 80vh;
}
.progress-bar {
  margin-bottom: 24rpx;
}
.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.progress-text {
  font-size: 26rpx;
  color: #6B7280;
}
.toast-msg {
  font-size: 24rpx;
  color: #059669;
}
.word-card {
  padding: 48rpx 32rpx;
  text-align: center;
  margin-bottom: 32rpx;
}
.word-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 32rpx;
}
.term {
  font-size: 68rpx;
  font-weight: 800;
  color: #111827;
  margin-bottom: 8rpx;
}
.reading {
  font-size: 36rpx;
  color: #D9532F;
  margin-bottom: 16rpx;
}
.pos-badge {
  font-size: 22rpx;
  background: #F3F4F6;
  color: #4B5563;
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
}
.reveal-prompt {
  background: #F9FAFB;
  border: 2rpx dashed #D1D5DB;
  border-radius: 16rpx;
  padding: 40rpx;
  margin-top: 16rpx;
}
.reveal-btn-text {
  font-size: 28rpx;
  color: #6B7280;
}
.word-details {
  text-align: left;
  border-top: 1rpx solid #F3F4F6;
  padding-top: 24rpx;
}
.meaning-box {
  margin-bottom: 24rpx;
}
.meaning-label, .example-label {
  display: block;
  font-size: 22rpx;
  color: #9CA3AF;
  margin-bottom: 4rpx;
}
.meaning-text {
  font-size: 36rpx;
  font-weight: 600;
  color: #1F2937;
}
.example-box {
  background: #FDFBF7;
  padding: 20rpx;
  border-radius: 12rpx;
}
.example-ja {
  display: block;
  font-size: 28rpx;
  color: #1F2937;
  margin-bottom: 6rpx;
}
.example-zh {
  font-size: 24rpx;
  color: #6B7280;
}
.rating-bar {
  display: flex;
  gap: 16rpx;
  margin-top: auto;
}
.rate-btn {
  flex: 1;
  border-radius: 36rpx;
  font-size: 28rpx;
  font-weight: 600;
  padding: 20rpx 0;
  border: none;
}
.again {
  background: #FEE2E2;
  color: #DC2626;
}
.hard {
  background: #FEF3C7;
  color: #D97706;
}
.good {
  background: #D1FAE5;
  color: #059669;
}
.finish-card {
  text-align: center;
  padding: 60rpx 32rpx;
}
.finish-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 16rpx;
}
.finish-desc {
  display: block;
  font-size: 26rpx;
  color: #6B7280;
  margin-bottom: 40rpx;
}
</style>
