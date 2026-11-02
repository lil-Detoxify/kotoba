<script lang="ts">
import { createFriendShare, createTimelineShare } from "../../services/share";
export default {
  onShareAppMessage: createFriendShare,
  onShareTimeline: createTimelineShare,
};
</script>

<script setup lang="ts">
import { useMiniPageActivity } from "../../services/page-motion";
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import MiniPage from "../../components/MiniPage.vue";
import MiniHeader from "../../components/MiniHeader.vue";
import MiniSkeleton from "../../components/MiniSkeleton.vue";
import MiniMeaningText from "../../components/MiniMeaningText.vue";
import { getDifficultWords, getDueWords } from "@jp/core";
import type { Word } from "@jp/models";
import { defaultTextbooks } from "../../services/textbooks";
useMiniPageActivity();

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
  <MiniPage class="review-page">
    <MiniHeader kicker="REVIEW / 再见一次" title="让记忆，慢慢扎根" description="按 FSRS 计划重温到期词，也给困难词多一点耐心。" />
    <MiniSkeleton v-if="loading" label="正在读取词书，准备复习队列…" />

    <template v-else>
      <view class="card queue-card due-queue motion-enter">
        <view class="queue-heading">
          <view class="queue-title-group">
            <text class="queue-kicker">01 / 今日计划</text>
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
            <text class="empty-mark" aria-hidden="true">✓</text>
            <text class="empty-title">暂时没有到期词</text>
            <text class="empty-hint">新学几课后，记得回来看看。</text>
          </view>
          <view v-if="dueWords.length" class="word-list">
            <text class="list-label">词汇预览</text>
            <view v-for="word in dueWords.slice(0, 8)" :key="word.id" class="word-row">
              <text class="word-term">{{ word.term }}</text>
              <text class="word-reading">{{ word.reading }}</text>
              <MiniMeaningText class="word-meaning" :word="word" />
            </view>
            <text v-if="dueWords.length > 8" class="more-tip">还有 {{ dueWords.length - 8 }} 个到期词</text>
          </view>
        </template>
      </view>

      <view class="card queue-card difficult-queue motion-enter">
        <view class="queue-heading">
          <view class="queue-title-group">
            <text class="queue-kicker">02 / 重点巩固</text>
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
              <MiniMeaningText class="word-meaning" :word="word" />
            </view>
            <text v-if="difficultWords.length > 8" class="more-tip">还有 {{ difficultWords.length - 8 }} 个困难词</text>
          </view>
        </template>
      </view>
    </template>
  </MiniPage>
</template>

<style scoped>
.review-page {
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}
.review-page .card { background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); border-radius: 24rpx; box-shadow: 0 10rpx 28rpx rgba(35,57,46,.035); }

.section-header {
  margin-bottom: 24rpx;
}

.section-title {
  display: block;
  margin-bottom: 6rpx;
  color: var(--kotoba-ink);
  font-size: 40rpx;
  font-weight: 700;
}

.section-desc {
  color: var(--kotoba-muted);
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
  color: var(--kotoba-ink);
  font-size: 30rpx;
  font-weight: 700;
}

.status-hint {
  margin-top: 12rpx;
  color: var(--kotoba-muted);
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
  color: var(--kotoba-green);
  font-size: 23rpx;
  font-weight: 600;
}

.queue-title {
  margin-top: 4rpx;
  color: var(--kotoba-ink);
  font-size: 34rpx;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.queue-count {
  flex-shrink: 0;
  color: var(--kotoba-green);
  font-size: 52rpx;
  font-weight: 800;
  line-height: 1;
}

.difficult-count {
  color: #876d35;
}

.unavailable-count {
  color: var(--kotoba-muted);
}

.queue-description {
  display: block;
  margin-top: 12rpx;
  color: var(--kotoba-muted);
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
  background: var(--kotoba-bg);
}

.queue-error {
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 14rpx;
  background: #FFF7F3;
}
.queue-error .empty-title { color: #873c2c; }

.empty-title {
  color: var(--kotoba-ink);
  font-size: 27rpx;
  font-weight: 600;
}

.empty-hint {
  margin-top: 4rpx;
  color: var(--kotoba-muted);
  font-size: 23rpx;
  overflow-wrap: anywhere;
}

.word-list {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--kotoba-line);
}

.list-label {
  display: block;
  margin-bottom: 8rpx;
  color: var(--kotoba-muted);
  font-size: 22rpx;
}

.word-row {
  display: flex;
  min-width: 0;
  padding: 16rpx 0;
  flex-direction: column;
  gap: 4rpx;
  border-bottom: 1rpx solid var(--kotoba-line);
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
.queue-card { padding: 32rpx; border-radius: 28rpx !important; }
.due-queue { background: #edf3e6 !important; border-color: #d0dfc6 !important; }
.difficult-queue { animation-delay: 65ms; }
.queue-kicker { font-size: 22rpx; letter-spacing: 2rpx; margin-bottom: 8rpx; }
.queue-title { font-size: 38rpx; }
.queue-count { font-size: 80rpx; font-weight: 600; letter-spacing: -3rpx; font-variant-numeric: tabular-nums; }
.difficult-count { color: var(--kotoba-green); }
.queue-description { margin: 20rpx 0; line-height: 1.7; }
.empty-state { position: relative; min-height: 136rpx; background: #f8faf4; border: 1rpx dashed #cbdac3; padding: 24rpx; }
.empty-mark { display: flex; width: 48rpx; height: 48rpx; align-items: center; justify-content: center; border-radius: 50%; margin-bottom: 14rpx; color: var(--kotoba-green); background: #e4eedb; font-size: 28rpx; }
.word-row { padding: 20rpx 0; gap: 8rpx; }
.word-term { font-size: 34rpx; }
.word-reading { font-size: 25rpx; }

.word-term {
  color: var(--kotoba-ink);
  font-size: 30rpx;
  font-weight: 700;
}

.word-reading {
  color: var(--kotoba-green);
  font-size: 24rpx;
}

.word-meaning {
  color: var(--kotoba-ink);
  font-size: 26rpx;
}

.more-tip {
  display: block;
  margin-top: 12rpx;
  color: var(--kotoba-muted);
  font-size: 23rpx;
  text-align: center;
}
</style>
