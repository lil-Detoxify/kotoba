<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { defaultRepository } from "../../adapters";
import { statistics } from "@jp/core";
import type { Data } from "@jp/models";
import seedData from "../../seed.json";

const appData = ref<Data | null>(null);
const streak = ref(0);
const dueCount = ref(0);
const learnedCount = ref(0);
const currentBookTitle = ref("日语测试词书");

async function loadData() {
  let data = await defaultRepository.read();
  if (!data.books || data.books.length === 0) {
    // Auto-seed initial demo book
    data = await defaultRepository.transact((d) => {
      d.books = seedData.books as any;
      d.lessons = seedData.lessons as any;
      d.words = seedData.words as any;
      d.currentBookId = seedData.books[0]?.id;
      d.seeded = true;
    });
  }

  appData.value = data;
  const stats = statistics(data, new Date());
  streak.value = stats.streak;
  dueCount.value = stats.due;
  learnedCount.value = stats.learned;
  const curBook = data.books.find((b) => b.id === data.currentBookId) || data.books[0];
  if (curBook) {
    currentBookTitle.value = curBook.title;
  }
}

function goToStudy() {
  uni.navigateTo({
    url: "/pages/study/study"
  });
}

function goToBooks() {
  uni.switchTab({
    url: "/pages/books/books"
  });
}

onShow(() => {
  loadData();
});
</script>

<template>
  <view class="container">
    <view class="hero-section">
      <text class="hero-eyebrow">今日、少しずつ。</text>
      <text class="hero-title">今天，也学一点吧</text>
      <text class="hero-subtitle">不用着急，每一个词都在让世界变得清晰。</text>
    </view>

    <view class="card today-panel">
      <view class="panel-header">
        <text class="panel-label">温故知新 · 今日复习</text>
        <text class="streak-badge">🔥 连续 {{ streak }} 天</text>
      </view>
      <view class="due-row">
        <text class="due-number">{{ dueCount }}</text>
        <text class="due-desc">个单词，等你再见</text>
      </view>
      <view class="action-row">
        <button class="primary-btn" @tap="goToStudy">开始学习</button>
        <button class="secondary-btn" @tap="goToBooks">选择课次</button>
      </view>
    </view>

    <view class="stats-grid">
      <view class="card stat-item">
        <text class="stat-num">{{ learnedCount }}</text>
        <text class="stat-label">累计已学</text>
      </view>
      <view class="card stat-item">
        <text class="stat-num">{{ appData?.words?.length || 48 }}</text>
        <text class="stat-label">词库总数</text>
      </view>
    </view>

    <view class="card book-card" @tap="goToBooks">
      <view class="book-info">
        <text class="book-tag">正在学习</text>
        <text class="book-title">{{ currentBookTitle }}</text>
        <text class="book-meta">4 课 · 48 词 · 点击切换</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.hero-section {
  margin-top: 16rpx;
  margin-bottom: 32rpx;
  display: flex;
  flex-direction: column;
}
.hero-eyebrow {
  font-size: 24rpx;
  color: #9CA3AF;
  margin-bottom: 8rpx;
}
.hero-title {
  font-size: 44rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8rpx;
}
.hero-subtitle {
  font-size: 26rpx;
  color: #6B7280;
}
.today-panel {
  border-left: 8rpx solid #D9532F;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}
.panel-label {
  font-size: 24rpx;
  color: #D9532F;
  font-weight: 600;
}
.streak-badge {
  font-size: 24rpx;
  background: #FFF4ED;
  color: #C2410C;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-weight: 600;
}
.due-row {
  display: flex;
  align-items: baseline;
  margin-bottom: 28rpx;
}
.due-number {
  font-size: 64rpx;
  font-weight: 800;
  color: #111827;
  margin-right: 12rpx;
}
.due-desc {
  font-size: 26rpx;
  color: #6B7280;
}
.action-row {
  display: flex;
  gap: 20rpx;
}
.stats-grid {
  display: flex;
  gap: 20rpx;
  margin-bottom: 24rpx;
}
.stat-item {
  flex: 1;
  text-align: center;
  padding: 24rpx;
  margin-bottom: 0;
}
.stat-num {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #1F2937;
  margin-bottom: 4rpx;
}
.stat-label {
  font-size: 24rpx;
  color: #9CA3AF;
}
.book-card {
  border: 1rpx solid #E5E7EB;
}
.book-tag {
  display: inline-block;
  font-size: 22rpx;
  color: #D9532F;
  margin-bottom: 8rpx;
}
.book-title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8rpx;
}
.book-meta {
  font-size: 24rpx;
  color: #6B7280;
}
</style>
