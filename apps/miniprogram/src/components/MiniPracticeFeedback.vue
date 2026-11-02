<script setup lang="ts">
import { computed } from 'vue';
import type { QuizType } from '@jp/models';
import type { PracticeFeedbackReport } from '../../../web/src/services/practice-feedback';
import MiniPanel from './MiniPanel.vue';

const props = defineProps<{
  report: PracticeFeedbackReport;
  bookTitle: string;
  bookId?: string;
  range: 7 | 30;
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  practice: [type: QuizType];
  load: [];
}>();

const quizRows = computed(() => props.report.quiz.filter(row => row.total > 0));
const hasFeedback = computed(() => quizRows.value.length > 0 || props.report.self.total > 0);

function practice(type: QuizType, wordCount: number) {
  if (!props.bookId || props.loading || wordCount < 1) return;
  emit('practice', type);
}

function loadBook() {
  if (!props.bookId || props.loading) return;
  emit('load');
}
</script>

<template>
  <MiniPanel
    icon="data"
    kicker="EXERCISE FEEDBACK"
    title="各题型表现"
    :description="`${bookTitle || '当前词书'} · 近 ${range} 天`"
  >
    <view v-if="!bookId" class="feedback-empty">
      <text class="empty-title">先选择一本词书</text>
      <text class="empty-copy">选择或添加词书后，这里会显示题型表现和重练建议。</text>
    </view>

    <view v-else-if="!hasFeedback" class="feedback-empty">
      <text class="empty-title">近 {{ range }} 天还没有练习反馈</text>
      <text class="empty-copy">完成题型练习或自我评价后，这里会显示答题表现和待重练词。</text>
    </view>

    <view v-else class="feedback-content">
      <text v-if="!quizRows.length" class="no-quiz-note">近 {{ range }} 天还没有客观题记录；下方单独显示自我评价。</text>

      <view v-if="quizRows.length" class="quiz-list" aria-label="题型答题表现">
        <view v-for="row in quizRows" :key="row.id" class="quiz-row">
          <view class="quiz-summary">
            <view class="quiz-copy">
              <text class="quiz-title">{{ row.title }}</text>
              <text class="quiz-counts">答对 {{ row.correct }} / {{ row.total }} · 答错 {{ row.incorrect }} 次</text>
            </view>
            <view class="accuracy">
              <text class="accuracy-value">{{ row.accuracy === null ? '—' : `${row.accuracy}%` }}</text>
              <text class="accuracy-label">正确率</text>
            </view>
          </view>

          <view v-if="row.previewWords.length" class="word-preview" aria-label="错词预览">
            <text v-for="word in row.previewWords.slice(0, 4)" :key="word.id" class="word-chip" lang="ja">{{ word.term }}</text>
            <text v-if="row.practiceWordIds.length > 4" class="more-words">另有 {{ row.practiceWordIds.length - 4 }} 个错词</text>
          </view>

          <view class="row-notes">
            <text v-if="row.unresolvedWordIds.length" class="row-note">
              还有 {{ row.unresolvedWordIds.length }} 个历史错词，需要载入词书后才能重练。
            </text>
            <text v-else-if="!row.practiceWordIds.length && row.accuracy === 100" class="row-note">
              这些词近期已全部答对。
            </text>
            <text v-else-if="!row.practiceWordIds.length" class="row-note">暂无可重练词。</text>
          </view>

          <view v-if="row.practiceWordIds.length || row.unresolvedWordIds.length" class="row-actions">
            <button
              v-if="row.practiceWordIds.length"
              class="action-button practice-button"
              type="button"
              :disabled="loading"
              :aria-label="`重练${row.title}错词，共${row.practiceWordIds.length}个`"
              @tap="practice(row.id, row.practiceWordIds.length)"
            >
              {{ loading ? '处理中…' : `重练错词（${row.practiceWordIds.length}）` }}
            </button>
            <view v-if="row.unresolvedWordIds.length" class="load-action">
              <button
                class="action-button load-button"
                type="button"
                :disabled="loading"
                @tap="loadBook"
              >
                {{ loading ? '载入中…' : `载入${bookTitle || '词书'}` }}
              </button>
              <text class="load-hint">载入后查看完整词条并重练。</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="report.self.total" class="self-feedback">
        <view class="self-heading">
          <view class="self-copy">
            <text class="self-title">自我评价</text>
            <text class="self-note">单独统计，不计入答题正确率</text>
          </view>
          <text class="self-total">{{ report.self.total }} 次</text>
        </view>
        <view class="self-counts">
          <view class="self-count">
            <text class="self-label">记得</text>
            <text class="self-value">{{ report.self.remembered }}</text>
          </view>
          <view class="self-count">
            <text class="self-label">模糊</text>
            <text class="self-value">{{ report.self.uncertain }}</text>
          </view>
          <view class="self-count">
            <text class="self-label">忘记</text>
            <text class="self-value">{{ report.self.forgotten }}</text>
          </view>
        </view>
      </view>
    </view>

    <text v-if="error" class="feedback-error" role="alert">{{ error }}</text>
  </MiniPanel>
</template>

<style scoped>
.feedback-empty { display: flex; flex-direction: column; gap: 8rpx; padding: 8rpx 0; }
.empty-title { color: var(--kotoba-ink); font-size: 27rpx; font-weight: 700; line-height: 1.5; }
.empty-copy, .no-quiz-note { color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.7; }
.feedback-content { display: flex; min-width: 0; flex-direction: column; gap: 12rpx; }
.no-quiz-note { display: block; }
.quiz-list { min-width: 0; border-top: 1rpx solid var(--kotoba-line); }
.quiz-row { display: flex; min-width: 0; flex-direction: column; gap: 12rpx; padding: 20rpx 0; border-bottom: 1rpx solid var(--kotoba-line); }
.quiz-summary { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: 12rpx; }
.quiz-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.quiz-title { color: var(--kotoba-ink); font-size: 26rpx; font-weight: 700; line-height: 1.5; overflow-wrap: anywhere; }
.quiz-counts { color: var(--kotoba-muted); font-size: 22rpx; line-height: 1.55; overflow-wrap: anywhere; }
.accuracy { display: flex; flex: none; min-width: 70rpx; flex-direction: column; align-items: flex-end; gap: 2rpx; }
.accuracy-value { color: var(--kotoba-green); font-size: 31rpx; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.3; }
.accuracy-label { color: var(--kotoba-muted); font-size: 21rpx; line-height: 1.45; }
.word-preview { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 10rpx; }
.word-chip { display: inline-block; max-width: 100%; padding: 6rpx 12rpx; border-radius: 10rpx; background: var(--kotoba-sage); color: var(--kotoba-green); font-size: 23rpx; line-height: 1.5; overflow-wrap: anywhere; }
.more-words, .row-note, .load-hint { color: var(--kotoba-muted); font-size: 22rpx; line-height: 1.6; overflow-wrap: anywhere; }
.row-notes { display: flex; flex-direction: column; gap: 6rpx; }
.row-actions { display: flex; min-width: 0; flex-direction: column; gap: 12rpx; }
.load-action { display: flex; min-width: 0; flex-direction: column; gap: 8rpx; }
.action-button { box-sizing: border-box; display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: center; margin: 0; padding: 10rpx 18rpx; border: 1rpx solid var(--kotoba-line); border-radius: 14rpx; font-size: 24rpx; line-height: 1.4; white-space: normal; }
.action-button::after { border: 0; }
.practice-button { border-color: var(--kotoba-green); background: var(--kotoba-green); color: var(--kotoba-paper); font-weight: 700; }
.load-button { background: var(--kotoba-sage); color: var(--kotoba-green); font-weight: 600; }
.action-button[disabled] { opacity: .58; }
.feedback-error { display: block; color: var(--kotoba-error); font-size: 23rpx; line-height: 1.6; overflow-wrap: anywhere; }
.self-feedback { display: flex; flex-direction: column; gap: 14rpx; padding: 16rpx 0 4rpx; border-top: 1rpx solid var(--kotoba-line); }
.self-heading { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.self-copy { display: flex; min-width: 0; flex-direction: column; gap: 4rpx; }
.self-title { color: var(--kotoba-green); font-size: 25rpx; font-weight: 700; }
.self-note, .self-total { color: var(--kotoba-muted); font-size: 21rpx; line-height: 1.5; }
.self-total { flex: none; }
.self-counts { display: flex; min-width: 0; }
.self-count { display: flex; min-width: 0; flex: 1; align-items: baseline; justify-content: center; gap: 10rpx; padding: 8rpx 4rpx; border-left: 1rpx solid var(--kotoba-line); }
.self-count:first-child { border-left: 0; }
.self-label { color: var(--kotoba-muted); font-size: 22rpx; }
.self-value { color: var(--kotoba-green); font-size: 29rpx; font-variant-numeric: tabular-nums; }
</style>
