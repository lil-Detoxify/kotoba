<script setup lang="ts">
import { computed } from "vue";
import MiniMeaningText from "./MiniMeaningText.vue";
import type { LessonPracticeRecommendation } from "../../../web/src/services/lesson-practice-recommendation";
import type { SessionSummary } from "../services/study-feedback";

const props = defineProps<{ summary: SessionSummary; recommendation?: LessonPracticeRecommendation }>();
const emit = defineEmits<{
  practice: [ids: string[]];
  recommend: [recommendation: LessonPracticeRecommendation];
}>();

const recommendationTitle = computed(() => props.recommendation?.kind === "scene"
  ? props.recommendation.scene.title
  : props.recommendation?.kind === "conjugation" ? `${props.recommendation.verb.term}的活用` : "");
const recommendationDescription = computed(() => props.recommendation?.kind === "scene"
  ? `这里会用到本轮学过的 ${props.recommendation.words.length} 个词。`
  : "試著把剛學過的動詞換一種說法。");
const recommendationAction = computed(() => props.recommendation?.kind === "scene" ? "看看这个场景" : "练习动词活用");
const recommendationWords = computed(() => props.recommendation?.words.slice(0, 3) ?? []);
const remainingRecommendationWords = computed(() => Math.max(0, (props.recommendation?.words.length ?? 0) - recommendationWords.value.length));

function practice() {
  emit("practice", props.summary.practiceWords.map(word => word.id));
}

function openRecommendation() {
  if (props.recommendation) emit("recommend", props.recommendation);
}
</script>

<template>
  <view class="study-summary" aria-label="本次学习总结">
    <text class="summary-heading">本次学习</text>
    <view class="summary-counts">
      <view><text class="count-value">{{ summary.newCount }}</text><text class="count-label">新学</text></view>
      <view><text class="count-value">{{ summary.reviewCount }}</text><text class="count-label">复习</text></view>
      <view><text class="count-value">{{ summary.skippedCount }}</text><text class="count-label">跳过</text></view>
    </view>
    <text v-if="summary.quiz.total" class="summary-line">客观题正确 {{ summary.quiz.correct }} / {{ summary.quiz.total }}</text>
    <text v-if="summary.self.total" class="summary-line">手动评价：忘记 {{ summary.self.forgotten }} · 模糊 {{ summary.self.uncertain }} · 记得 {{ summary.self.remembered }}</text>
    <view v-if="summary.recap.length" class="recap-list">
      <text class="recap-heading">本次回顾</text>
      <view v-for="word in summary.recap.slice(0, 4)" :key="word.id" class="recap-row">
        <view class="recap-title"><text class="recap-term">{{ word.term }}</text><text class="recap-reading">{{ word.reading }}</text></view>
        <MiniMeaningText class="recap-meaning" :word="word" />
      </view>
    </view>
    <button v-if="summary.practiceWords.length" class="practice-button" @tap="practice">再巩固这些词（{{ summary.practiceWords.length }}）</button>
    <view v-if="recommendation" class="recommendation-card">
      <text class="recommendation-kicker">把刚学的词用起来</text>
      <text class="recommendation-title">{{ recommendationTitle }}</text>
      <text class="recommendation-description">{{ recommendationDescription }}</text>
      <view class="recommendation-words">
        <view v-for="word in recommendationWords" :key="word.id" class="recommendation-word">
          <text>{{ word.term }}</text><text class="recommendation-reading">{{ word.reading }}</text>
        </view>
        <text v-if="remainingRecommendationWords" class="recommendation-more">另有 {{ remainingRecommendationWords }} 个</text>
      </view>
      <button class="recommendation-button" hover-class="practice-pressed" @tap="openRecommendation">{{ recommendationAction }}</button>
    </view>
  </view>
</template>

<style scoped>
.study-summary { width: 100%; margin: 24rpx 0; padding: 24rpx 0; border-top: 1rpx solid #cbd9c2; text-align: left; }
.summary-heading { display: block; color: var(--kotoba-ink); font-size: 30rpx; font-weight: 700; }
.summary-counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10rpx; margin: 20rpx 0 16rpx; }
.summary-counts > view { display: flex; align-items: baseline; gap: 9rpx; min-width: 0; }
.count-value { color: var(--kotoba-green); font-size: 34rpx; font-weight: 700; }
.count-label { color: var(--kotoba-muted); font-size: 24rpx; }
.summary-line { display: block; margin-top: 8rpx; color: var(--kotoba-ink); font-size: 24rpx; line-height: 1.65; }
.recap-list { margin-top: 20rpx; }
.recap-heading { display: block; margin-bottom: 8rpx; color: var(--kotoba-muted); font-size: 23rpx; }
.recap-row { padding: 12rpx 0; border-top: 1rpx solid #dce5d5; }
.recap-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6rpx 14rpx; }
.recap-term { color: var(--kotoba-ink); font-size: 29rpx; font-weight: 700; }
.recap-reading { color: var(--kotoba-green); font-size: 24rpx; }
.recap-meaning { display: block; margin-top: 4rpx; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.55; }
.practice-button { width: 100%; min-height: 48px; margin: 18rpx 0 0; padding: 8rpx 16rpx; color: #fff; background: var(--kotoba-green); border: 1rpx solid var(--kotoba-green); font-size: 26rpx; }
.recommendation-card { margin-top: 20rpx; padding: 20rpx; border: 1rpx solid #dce5d5; border-radius: 18rpx; background: #f4f7ef; }
.recommendation-kicker, .recommendation-title, .recommendation-description { display: block; overflow-wrap: anywhere; }
.recommendation-kicker { color: var(--kotoba-green); font-size: 22rpx; font-weight: 650; }
.recommendation-title { margin-top: 5rpx; color: var(--kotoba-ink); font-size: 28rpx; font-weight: 700; line-height: 1.5; }
.recommendation-description { margin-top: 5rpx; color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.6; }
.recommendation-words { display: flex; flex-wrap: wrap; gap: 8rpx; margin-top: 12rpx; }
.recommendation-word { display: flex; max-width: 100%; align-items: baseline; gap: 6rpx; padding: 4rpx 12rpx; border: 1rpx solid #dce5d5; border-radius: 999rpx; color: var(--kotoba-ink); background: var(--kotoba-paper); font-size: 22rpx; overflow-wrap: anywhere; }
.recommendation-reading, .recommendation-more { color: var(--kotoba-muted); }
.recommendation-button { display: block; min-width: 210rpx; min-height: 48px; margin: 16rpx 0 0; padding: 10rpx 18rpx; border: 1rpx solid #adc59f; border-radius: 14rpx; color: var(--kotoba-green); background: #fffdf8; font-size: 24rpx; line-height: 1.5; }
.practice-pressed { opacity: .8; }
</style>
