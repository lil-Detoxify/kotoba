<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import type { Data } from "@jp/models";
import { defaultTextbooks, textbookCatalog } from "../../services/textbooks";
import { calculateLearningStatistics, type LearningStatistics } from "../../services/learning-statistics";

const appData = ref<Data | null>(null);
const statistics = ref<LearningStatistics | null>(null);
const loading = ref(true);
const currentBookTitle = ref("标准日本语");
const loadError = ref("");
const currentMeta = computed(() => textbookCatalog.find((book) => book.id === appData.value?.currentBookId));
const catalogWordCount = textbookCatalog.reduce((sum, book) => sum + book.wordCount, 0);
const activityMax = computed(() => Math.max(1, ...(statistics.value?.days.map((day) => day.count) || [0])));
const activityDays = computed(() => statistics.value?.days || []);
const currentBookProgress = computed(() => statistics.value?.books.find((book) => book.bookId === appData.value?.currentBookId));
const learningActionLabel = computed(() => currentBookProgress.value?.learned ? "继续当前词书" : "开始当前词书");

async function refreshData() {
  loadError.value = "";
  loading.value = true;
  try { await loadData(); }
  catch { loadError.value = "学习记录暂时无法读取，请重试。原有记录未被覆盖。"; }
  finally { loading.value = false; }
}

async function loadData() {
  const data = await defaultTextbooks.hydrate();

  appData.value = data;
  statistics.value = calculateLearningStatistics(data, new Date());
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

function goToLists() { uni.navigateTo({ url: "/pages/lists/lists" }); }
function goToReview() { uni.switchTab({ url: "/pages/review/review" }); }
function goToDifficult() { uni.navigateTo({ url: "/pages/study/study?mode=difficult" }); }
function activityHeight(count: number) { return count ? Math.max(14, Math.round(count / activityMax.value * 76)) : 8; }

onShow(() => {
  void refreshData();
});
</script>

<template>
  <view class="container dashboard-page">
    <view v-if="loading" class="card status-card">
      <text>正在读取学习概览…</text>
    </view>
    <view v-else-if="loadError" class="card status-card">
      <text>{{ loadError }}</text>
      <button class="secondary-btn" @tap="refreshData">重新读取</button>
    </view>
    <template v-else>
    <view class="hero-section">
      <text class="hero-eyebrow">今日、少しずつ。</text>
      <text class="hero-title">今天，也学一点吧</text>
      <text class="hero-subtitle">不用着急，每一个词都在让世界变得清晰。</text>
    </view>

    <view class="card today-panel">
      <view class="panel-header">
        <text class="panel-label">温故知新 · 今日复习</text>
        <text class="streak-badge">连续 {{ statistics?.streak || 0 }} 天</text>
      </view>
      <view class="due-row">
        <text class="due-number">{{ statistics?.due || 0 }}</text>
        <text class="due-desc">个单词，等你再见</text>
      </view>
      <view class="action-row">
        <button class="primary-btn" @tap="goToStudy">{{ learningActionLabel }}</button>
        <button class="secondary-btn" @tap="goToBooks">选择课次</button>
      </view>
      <view class="quick-actions">
        <button v-if="statistics?.due" class="secondary-btn quick-btn" @tap="goToReview">复习到期词（{{ statistics.due }}）</button>
        <button v-if="statistics?.difficult" class="secondary-btn quick-btn" @tap="goToDifficult">巩固难词（{{ statistics.difficult }}）</button>
      </view>
    </view>

    <view class="stats-grid">
      <view class="card stat-item">
        <text class="stat-num">{{ statistics?.todayNew || 0 }}</text>
        <text class="stat-label">今日新学</text>
      </view>
      <view class="card stat-item">
        <text class="stat-num">{{ statistics?.todayReview || 0 }}</text>
        <text class="stat-label">今日复习</text>
      </view>
      <view class="card stat-item">
        <text class="stat-num">{{ statistics?.learned || 0 }}</text>
        <text class="stat-label">累计已学</text>
      </view>
      <view class="card stat-item">
        <text class="stat-num">{{ catalogWordCount }}</text>
        <text class="stat-label">六册教材词汇</text>
      </view>
    </view>

    <view class="card activity-card">
      <view class="section-heading">
        <text class="section-title">近 7 日活动</text>
        <text class="section-caption">按本地日期统计</text>
      </view>
      <view class="activity-grid">
        <view v-for="day in activityDays" :key="day.day" class="activity-day">
          <view class="activity-track"><view class="activity-bar" :style="{ height: activityHeight(day.count) + 'rpx' }" /></view>
          <text class="activity-count">{{ day.count }}</text>
          <text class="activity-label">{{ day.label }}</text>
        </view>
      </view>
    </view>

    <view class="card book-card" @tap="goToBooks">
      <view class="book-info">
        <text class="book-tag">正在学习</text>
        <text class="book-title">{{ currentBookTitle }}</text>
        <text class="book-meta">{{ currentMeta ? currentMeta.lessons.length + ' 课 · ' + currentMeta.wordCount + ' 词' : '已保存的词书' }} · 点击切换</text>
      </view>
    </view>
    <button class="secondary-btn" @tap="goToLists">打开生词本</button>
    </template>
  </view>
</template>

<style scoped>
.dashboard-page { padding-bottom: calc(32rpx + env(safe-area-inset-bottom)); }
.dashboard-page .card { background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); border-radius: 20rpx; box-shadow: none; }
.dashboard-page button { min-height: 96rpx; }
.status-card { padding: 44rpx 32rpx; text-align: center; }
.status-card .secondary-btn { min-height: 96rpx; margin-top: 20rpx; }
.hero-section {
  margin-top: 16rpx;
  margin-bottom: 32rpx;
  display: flex;
  flex-direction: column;
}
.hero-eyebrow {
  font-size: 24rpx;
  color: var(--kotoba-muted);
  margin-bottom: 8rpx;
}
.hero-title {
  font-size: 44rpx;
  font-weight: 700;
  color: var(--kotoba-ink);
  margin-bottom: 8rpx;
}
.hero-subtitle {
  font-size: 26rpx;
  color: var(--kotoba-muted);
}
.today-panel {
  border-left: 8rpx solid var(--kotoba-green);
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}
.panel-label {
  font-size: 24rpx;
  color: var(--kotoba-green);
  font-weight: 600;
}
.streak-badge {
  font-size: 24rpx;
  background: #eaf0e3;
  color: var(--kotoba-green);
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
  color: var(--kotoba-ink);
  margin-right: 12rpx;
}
.due-desc {
  font-size: 26rpx;
  color: var(--kotoba-muted);
}
.action-row {
  display: flex;
  gap: 16rpx;
}
.action-row button { flex: 1; min-height: 96rpx; }
.quick-actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 20rpx; }
.quick-btn { flex: 1; min-width: 260rpx; min-height: 96rpx; margin: 0; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; margin-bottom: 20rpx; }
.section-title { font-size: 28rpx; font-weight: 700; color: var(--kotoba-ink); }
.section-caption { font-size: 22rpx; color: var(--kotoba-muted); }
.activity-card { padding-bottom: 28rpx; }
.activity-grid { display: flex; align-items: flex-end; justify-content: space-between; gap: 16rpx; min-height: 136rpx; }
.activity-day { display: flex; flex: 1; min-width: 0; flex-direction: column; align-items: center; gap: 8rpx; }
.activity-track { display: flex; width: 100%; height: 84rpx; align-items: flex-end; justify-content: center; border-bottom: 1rpx solid var(--kotoba-line); }
.activity-bar { width: 28rpx; min-height: 8rpx; border-radius: 8rpx 8rpx 0 0; background: var(--kotoba-green); }
.activity-count, .activity-label { font-size: 22rpx; color: var(--kotoba-muted); }
.activity-count { color: var(--kotoba-green); font-weight: 600; }
.activity-label { white-space: nowrap; }
.stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.stat-item {
  flex: 1 1 42%;
  min-width: 220rpx;
  text-align: center;
  padding: 24rpx;
  margin-bottom: 0;
}
.stat-num {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: var(--kotoba-ink);
  margin-bottom: 4rpx;
}
.stat-label {
  font-size: 24rpx;
  color: var(--kotoba-muted);
}
.book-card {
  border: 1rpx solid var(--kotoba-line);
}
.book-tag {
  display: inline-block;
  font-size: 22rpx;
  color: var(--kotoba-green);
  margin-bottom: 8rpx;
}
.book-title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--kotoba-ink);
  margin-bottom: 8rpx;
  overflow-wrap: anywhere;
}
.book-meta {
  font-size: 24rpx;
  color: var(--kotoba-muted);
  overflow-wrap: anywhere;
}
</style>
