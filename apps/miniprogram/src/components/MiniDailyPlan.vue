<script setup lang="ts">
import { computed } from "vue";
import type { DailyStudyPlan } from "../services/daily-study-plan";
import type { DailyPace } from "../services/study-plan-preference";

const props = defineProps<{
  plan: DailyStudyPlan;
  pace: DailyPace;
  unitLabel: "课" | "组";
  busy: boolean;
}>();

const emit = defineEmits<{
  pace: [value: DailyPace];
  daily: [];
}>();

function paceLabel(value: DailyPace): string {
  return `${value === 0.5 ? "半" : "一"}${props.unitLabel} / 天`;
}

const isComplete = computed(() => props.plan.remaining <= 0);
</script>

<template>
  <view class="daily-plan" aria-label="每日学习计划">
    <view class="daily-plan-heading">
      <text class="daily-plan-title">每日进度</text>
      <view class="pace-picker" role="group" aria-label="每日学习节奏">
        <button
          class="pace-button"
          :class="{ selected: pace === 0.5 }"
          :disabled="busy"
          :aria-pressed="pace === 0.5"
          @tap="emit('pace', 0.5)"
        >{{ paceLabel(0.5) }}</button>
        <button
          class="pace-button"
          :class="{ selected: pace === 1 }"
          :disabled="busy"
          :aria-pressed="pace === 1"
          @tap="emit('pace', 1)"
        >{{ paceLabel(1) }}</button>
      </view>
    </view>

    <view class="daily-plan-details">
      <text class="plan-lesson">
        {{ unitLabel === '组' ? '计划分组' : '计划课次' }}：{{ plan.lessonTitle || '本书课次已学完' }}
      </text>
      <view class="progress-copy">
        <text>今日已学 {{ plan.completed }} / {{ plan.target }} 词</text>
        <text>还需 {{ plan.remaining }} 词</text>
      </view>
    </view>

    <button
      class="daily-start-button"
      :class="{ 'daily-complete-button': isComplete }"
      :disabled="busy || isComplete"
      @tap="emit('daily')"
    >{{ isComplete ? '今日计划已完成' : plan.completed > 0 ? '继续今日计划' : '开始今日计划' }}</button>
  </view>
</template>

<style scoped>
.daily-plan { margin-top: 20rpx; padding: 24rpx; border: 1rpx solid #dce6d5; border-radius: 20rpx; background: #f4f7ef; }
.daily-plan-heading { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.daily-plan-title { color: var(--kotoba-ink); font-size: 28rpx; font-weight: 700; }
.pace-picker { display: flex; flex: 1; gap: 12rpx; }
.pace-button { flex: 1; min-width: 0; min-height: 96rpx; margin: 0; padding: 12rpx 16rpx; border: 1rpx solid var(--kotoba-line); border-radius: 14rpx; background: #fffdf7; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.35; }
.pace-button.selected { border-color: var(--kotoba-green); background: #e4eedf; color: var(--kotoba-green); font-weight: 700; }
.daily-plan-details { display: flex; flex-direction: column; gap: 12rpx; margin-top: 18rpx; }
.plan-lesson { color: var(--kotoba-ink); font-size: 24rpx; line-height: 1.55; overflow-wrap: anywhere; }
.progress-copy { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8rpx 20rpx; color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.5; }
.daily-start-button { min-height: 96rpx; margin: 18rpx 0 0; padding: 12rpx 20rpx; border: 1rpx solid var(--kotoba-green); border-radius: 14rpx; background: var(--kotoba-green); color: #fff; font-size: 25rpx; font-weight: 700; line-height: 1.4; }
.daily-complete-button[disabled] { border-color: #c8d9bf; background: #edf3e7; color: var(--kotoba-green); opacity: 1; }
@media (max-width: 360px) { .daily-plan-heading { flex-direction: column; align-items: stretch; }.pace-picker { flex: auto; } }
</style>
