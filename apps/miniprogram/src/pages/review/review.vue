<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { getDifficultWords, getDueWords } from "@jp/core";
import type { Word } from "@jp/models";
import { defaultTextbooks } from "../../services/textbooks";

const dueWords = ref<Word[]>([]);
const difficultWords = ref<Word[]>([]);
const dueError = ref("");
const difficultError = ref("");
const dueLoading = ref(false);
const difficultLoading = ref(false);
const loading = computed(() => dueLoading.value || difficultLoading.value);
let refreshToken = 0;

/**
 * Prepare each queue through the textbook service before deriving its words.
 * Review and difficult words can live in different books, so both calls are
 * required to hydrate all referenced word bodies before rendering a count.
 */
async function refreshReview() {
  const token = ++refreshToken;
  dueLoading.value = true;
  difficultLoading.value = true;
  dueError.value = "";
  difficultError.value = "";
  dueWords.value = [];
  difficultWords.value = [];

  const [reviewResult, difficultResult] = await Promise.allSettled([
    defaultTextbooks.prepareStudy(undefined, "review"),
    defaultTextbooks.prepareStudy(undefined, "difficult"),
  ]);
  if (token !== refreshToken) return;

  if (reviewResult.status === "fulfilled") {
    dueWords.value = getDueWords(reviewResult.value, new Date());
  } else {
    dueError.value = "到期复习队列暂时无法读取，请重试。";
  }
  if (difficultResult.status === "fulfilled") {
    difficultWords.value = getDifficultWords(difficultResult.value);
  } else {
    difficultError.value = "困难词队列暂时无法读取，请重试。";
  }
  dueLoading.value = false;
  difficultLoading.value = false;
}

function startReview() {
  uni.navigateTo({ url: "/pages/study/study?mode=review" });
}

function startDifficult() {
  uni.navigateTo({ url: "/pages/study/study?mode=difficult" });
}

onShow(() => {
  void refreshReview();
});
</script>

<template>
  <view class="container review-page">
    <view class="section-header">
      <text class="section-title">复习</text>
      <text class="section-desc">把到期词和需要多见几次的词分开处理</text>
    </view>

    <view v-if="loading" class="card status-card">
      <text class="status-title">正在准备复习队列…</text>
      <text class="status-hint">正在读取词书内容，请稍候。</text>
    </view>

    <template v-else>
      <view class="card queue-card">
        <view class="queue-heading">
          <view class="queue-title-group">
            <text class="queue-kicker">今日计划</text>
            <text class="queue-title">到期复习</text>
          </view>
          <text v-if="!dueError" class="queue-count">{{ dueWords.length }}</text>
          <text v-else class="queue-count unavailable-count">—</text>
        </view>
        <text class="queue-description">按照 FSRS 计划，今天需要再次回忆的词。</text>
        <view v-if="dueError" class="queue-error">
          <text class="empty-title">{{ dueError }}</text>
          <button class="secondary-btn action-button retry-button" @tap="refreshReview">重新读取</button>
        </view>
        <template v-else>
          <button
            v-if="dueWords.length"
            class="primary-btn action-button queue-action"
            @tap="startReview"
          >开始到期复习</button>
          <view v-else class="empty-state">
            <text class="empty-title">暂时没有到期词</text>
            <text class="empty-hint">新学几课后，记得回来看看。</text>
          </view>
          <view v-if="dueWords.length" class="word-list">
            <text class="list-label">词汇预览</text>
            <view v-for="word in dueWords.slice(0, 8)" :key="word.id" class="word-row">
              <text class="word-term">{{ word.term }}</text>
              <text class="word-reading">{{ word.reading }}</text>
              <text class="word-meaning">{{ word.meaning }}</text>
            </view>
            <text v-if="dueWords.length > 8" class="more-tip">还有 {{ dueWords.length - 8 }} 个到期词</text>
          </view>
        </template>
      </view>

      <view class="card queue-card">
        <view class="queue-heading">
          <view class="queue-title-group">
            <text class="queue-kicker">重点巩固</text>
            <text class="queue-title">困难词</text>
          </view>
          <text v-if="!difficultError" class="queue-count difficult-count">{{ difficultWords.length }}</text>
          <text v-else class="queue-count difficult-count unavailable-count">—</text>
        </view>
        <text class="queue-description">学习时标记的词会留在这里，直到你觉得轻松一些。</text>
        <view v-if="difficultError" class="queue-error">
          <text class="empty-title">{{ difficultError }}</text>
          <button class="secondary-btn action-button retry-button" @tap="refreshReview">重新读取</button>
        </view>
        <template v-else>
          <button
            v-if="difficultWords.length"
            class="secondary-btn action-button queue-action"
            @tap="startDifficult"
          >开始困难词巩固</button>
          <view v-else class="empty-state">
            <text class="empty-title">还没有标记困难词</text>
            <text class="empty-hint">在学习卡片上标记后，它们会出现在这里。</text>
          </view>
          <view v-if="difficultWords.length" class="word-list">
            <text class="list-label">词汇预览</text>
            <view v-for="word in difficultWords.slice(0, 8)" :key="word.id" class="word-row">
              <text class="word-term">{{ word.term }}</text>
              <text class="word-reading">{{ word.reading }}</text>
              <text class="word-meaning">{{ word.meaning }}</text>
            </view>
            <text v-if="difficultWords.length > 8" class="more-tip">还有 {{ difficultWords.length - 8 }} 个困难词</text>
          </view>
        </template>
      </view>
    </template>
  </view>
</template>

<style scoped>
.review-page {
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}

.section-header {
  margin-bottom: 24rpx;
}

.section-title {
  display: block;
  margin-bottom: 6rpx;
  color: #111827;
  font-size: 40rpx;
  font-weight: 700;
}

.section-desc {
  color: #6B7280;
  font-size: 26rpx;
}

.status-card {
  padding: 44rpx 32rpx;
  text-align: center;
}

.status-title,
.status-hint {
  display: block;
}

.status-title {
  color: #273C35;
  font-size: 30rpx;
  font-weight: 700;
}

.status-hint {
  margin-top: 12rpx;
  color: #6B7280;
  font-size: 25rpx;
  overflow-wrap: anywhere;
}

.action-button {
  min-height: 96rpx;
  margin: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.retry-button {
  display: block;
  margin: 24rpx auto 0;
}

.queue-card {
  padding: 28rpx;
}

.queue-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.queue-title-group {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.queue-kicker {
  color: #D9532F;
  font-size: 23rpx;
  font-weight: 600;
}

.queue-title {
  margin-top: 4rpx;
  color: #273C35;
  font-size: 34rpx;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.queue-count {
  flex-shrink: 0;
  color: #D9532F;
  font-size: 52rpx;
  font-weight: 800;
  line-height: 1;
}

.difficult-count {
  color: #365D49;
}

.unavailable-count {
  color: #9CA3AF;
}

.queue-description {
  display: block;
  margin-top: 12rpx;
  color: #6B7280;
  font-size: 25rpx;
  overflow-wrap: anywhere;
}

.queue-action {
  width: 100%;
  margin-top: 20rpx;
}

.empty-state {
  display: flex;
  min-height: 96rpx;
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  flex-direction: column;
  justify-content: center;
  border-radius: 14rpx;
  background: #F9F8F6;
}

.queue-error {
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 14rpx;
  background: #FFF7F3;
}

.empty-title {
  color: #4B5563;
  font-size: 27rpx;
  font-weight: 600;
}

.empty-hint {
  margin-top: 4rpx;
  color: #9CA3AF;
  font-size: 23rpx;
  overflow-wrap: anywhere;
}

.word-list {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #F0ECE4;
}

.list-label {
  display: block;
  margin-bottom: 8rpx;
  color: #9CA3AF;
  font-size: 22rpx;
}

.word-row {
  display: flex;
  min-width: 0;
  padding: 16rpx 0;
  flex-direction: column;
  gap: 4rpx;
  border-bottom: 1rpx solid #F9FAFB;
}

.word-row:last-child {
  border-bottom: 0;
}

.word-term,
.word-reading,
.word-meaning,
.more-tip {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.word-term {
  color: #273C35;
  font-size: 30rpx;
  font-weight: 700;
}

.word-reading {
  color: #365D49;
  font-size: 24rpx;
}

.word-meaning {
  color: #4B5563;
  font-size: 26rpx;
}

.more-tip {
  display: block;
  margin-top: 12rpx;
  color: #9CA3AF;
  font-size: 23rpx;
  text-align: center;
}
</style>
