<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { defaultRepository } from "../../adapters";
import seedData from "../../seed.json";

const activeKey = ref("");
const totalWords = ref(0);
const totalLearned = ref(0);
const clearMessage = ref("");

async function loadSettings() {
  activeKey.value = defaultRepository.getActiveKey();
  const data = await defaultRepository.read();
  totalWords.value = data.words?.length || 0;
  totalLearned.value = data.states?.filter((s) => s.firstSeenAt || s.reviewCount > 0)?.length || 0;
}

async function resetDemoData() {
  await defaultRepository.transact((d) => {
    d.books = seedData.books as any;
    d.lessons = seedData.lessons as any;
    d.words = seedData.words as any;
    d.states = [];
    d.logs = [];
    d.currentBookId = seedData.books[0]?.id;
    d.seeded = true;
  });
  clearMessage.value = "已重置演示数据并清空学习状态";
  await loadSettings();
  setTimeout(() => {
    clearMessage.value = "";
  }, 2000);
}

onShow(() => {
  loadSettings();
});
</script>

<template>
  <view class="container">
    <view class="section-header">
      <text class="section-title">设置与关于</text>
      <text class="section-desc">KotoBud 小程序版基础配置</text>
    </view>

    <view class="card">
      <text class="group-title">运行状态</text>
      <view class="info-row">
        <text class="info-label">存储适配器</text>
        <text class="info-value">UniStorageAdapter (微信 Storage)</text>
      </view>
      <view class="info-row">
        <text class="info-label">活跃存储分区</text>
        <text class="info-value">{{ activeKey }}</text>
      </view>
      <view class="info-row">
        <text class="info-label">词库总数</text>
        <text class="info-value">{{ totalWords }} 词</text>
      </view>
      <view class="info-row">
        <text class="info-label">已学习词数</text>
        <text class="info-value">{{ totalLearned }} 词</text>
      </view>
    </view>

    <view class="card">
      <text class="group-title">数据维护</text>
      <button class="secondary-btn reset-btn" @tap="resetDemoData">重置演示词书与学习记录</button>
      <text v-if="clearMessage" class="toast-success">{{ clearMessage }}</text>
    </view>

    <view class="card about-card">
      <text class="about-app">KotoBud 言葉</text>
      <text class="about-version">版本 0.6.0 · WeChat Mini Program (Phase 1)</text>
      <text class="about-meta">Web / Windows / 微信小程序 多端日语背词体系</text>
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
.group-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 20rpx;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid #F3F4F6;
}
.info-row {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F9FAFB;
}
.info-row:last-child {
  border-bottom: none;
}
.info-label {
  font-size: 26rpx;
  color: #6B7280;
}
.info-value {
  font-size: 26rpx;
  font-weight: 500;
  color: #1F2937;
}
.reset-btn {
  width: 100%;
}
.toast-success {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: #059669;
  margin-top: 16rpx;
}
.about-card {
  text-align: center;
  padding: 48rpx 32rpx;
}
.about-app {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #D9532F;
  margin-bottom: 8rpx;
}
.about-version {
  display: block;
  font-size: 24rpx;
  color: #4B5563;
  margin-bottom: 8rpx;
}
.about-meta {
  font-size: 22rpx;
  color: #9CA3AF;
}
</style>
