<script setup lang="ts">
import type { MiniStudyCheckpoint } from "../services/study-checkpoint";

defineProps<{ checkpoint: MiniStudyCheckpoint; busy?: boolean }>();
const emit = defineEmits<{ resume: []; dismiss: [] }>();
</script>

<template>
  <view class="resume-card card">
    <view class="resume-copy">
      <text class="resume-title">继续上次学习</text>
      <text class="resume-count">还有 {{ checkpoint.wordIds.length }} 词</text>
    </view>
    <view class="resume-actions">
      <button class="resume-primary" :disabled="busy" @tap="emit('resume')">继续上次学习</button>
      <button class="resume-dismiss" :disabled="busy" @tap="emit('dismiss')">暂不继续</button>
    </view>
  </view>
</template>

<style scoped>
.resume-card { padding: 26rpx; border: 1rpx solid #cbd9c2; background: #f2f6ed; }
.resume-copy { display: flex; align-items: baseline; justify-content: space-between; gap: 18rpx; margin-bottom: 18rpx; }
.resume-title { color: var(--kotoba-ink); font-size: 29rpx; font-weight: 700; }
.resume-count { flex-shrink: 0; color: var(--kotoba-green); font-size: 25rpx; }
.resume-actions { display: flex; gap: 14rpx; }
.resume-actions button { min-width: 0; min-height: 48px; margin: 0; flex: 1; padding: 8rpx 16rpx; font-size: 25rpx; }
.resume-primary { color: #fff; background: var(--kotoba-green); border: 1rpx solid var(--kotoba-green); }
.resume-dismiss { color: var(--kotoba-green); background: #fffefb; border: 1rpx solid #cbd9c2; }
</style>
