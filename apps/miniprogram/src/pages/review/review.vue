<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { defaultRepository } from "../../adapters";
import { getDueWords } from "@jp/core";
import type { Word } from "@jp/models";

const dueWords = ref<Word[]>([]);

async function loadReview() {
  const data = await defaultRepository.read();
  dueWords.value = getDueWords(data, new Date());
}

function startReview() {
  uni.navigateTo({
    url: "/pages/study/study?mode=review"
  });
}

onShow(() => {
  loadReview();
});
</script>

<template>
  <view class="container">
    <view class="section-header">
      <text class="section-title">复习队列</text>
      <text class="section-desc">基于 FSRS 遗忘曲线科学规划</text>
    </view>

    <view class="card review-summary">
      <view class="due-info">
        <text class="due-count">{{ dueWords.length }}</text>
        <text class="due-label">个待复习单词</text>
      </view>
      <button v-if="dueWords.length > 0" class="primary-btn" @tap="startReview">开始今日复习</button>
      <text v-else class="empty-tip">当前没有到期的复习单词，先去新学几课吧！</text>
    </view>

    <view v-if="dueWords.length > 0" class="card">
      <text class="list-title">待复习词汇清单</text>
      <view v-for="w in dueWords.slice(0, 10)" :key="w.id" class="word-row">
        <text class="word-term">{{ w.term }}</text>
        <text class="word-reading">{{ w.reading }}</text>
        <text class="word-meaning">{{ w.meaning }}</text>
      </view>
      <text v-if="dueWords.length > 10" class="more-tip">还有 {{ dueWords.length - 10 }} 个单词...</text>
    </view>
  </view>
</template>

<style scoped>
.section-header {
  margin-bottom: 24rpx;
}
.section-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 6rpx;
}
.section-desc {
  font-size: 26rpx;
  color: #6B7280;
}
.review-summary {
  text-align: center;
  padding: 48rpx 32rpx;
}
.due-info {
  margin-bottom: 32rpx;
}
.due-count {
  display: block;
  font-size: 72rpx;
  font-weight: 800;
  color: #D9532F;
}
.due-label {
  font-size: 26rpx;
  color: #6B7280;
}
.empty-tip {
  display: block;
  font-size: 28rpx;
  color: #9CA3AF;
}
.list-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #1F2937;
  margin-bottom: 20rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #F3F4F6;
}
.word-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F9FAFB;
}
.word-term {
  font-size: 30rpx;
  font-weight: 600;
  color: #111827;
  width: 160rpx;
}
.word-reading {
  font-size: 26rpx;
  color: #D9532F;
  width: 180rpx;
}
.word-meaning {
  font-size: 26rpx;
  color: #4B5563;
  flex: 1;
  text-align: right;
}
.more-tip {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: #9CA3AF;
  margin-top: 16rpx;
}
</style>
