<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight } from 'lucide-vue-next';
import type { QuizType } from '@jp/models';
import type { PracticeFeedbackReport } from '../../../web/src/services/practice-feedback';

const props = defineProps<{
  report: PracticeFeedbackReport;
  bookTitle: string;
  bookId?: string;
  range: 7 | 30;
}>();
const emit = defineEmits<{ practice: [payload: { bookId: string; type: QuizType; range: 7 | 30 }] }>();
const quizRows = computed(() => props.report.quiz.filter(row => row.total > 0));

function retryIncorrect(type: QuizType, wordCount: number) {
  if (!props.bookId || wordCount < 1) return;
  emit('practice', { bookId: props.bookId, type, range: props.range });
}
</script>

<template>
  <section class="practice-feedback" aria-labelledby="practice-feedback-title">
    <header class="feedback-heading">
      <div>
        <p class="eyebrow">EXERCISE FEEDBACK</p>
        <h2 id="practice-feedback-title">各题型表现</h2>
        <p class="feedback-scope">{{ bookTitle || '当前词书' }} · 近 {{ range }} 天</p>
      </div>
    </header>

    <p v-if="!bookId" class="feedback-empty">先添加或选择一本词书，再查看题型表现和重练建议。</p>
    <template v-else-if="!quizRows.length && !report.self.total">
      <p class="feedback-empty">近 {{ range }} 天还没有练习反馈。完成题型练习或自我评价后，这里会显示正确率和待重练词。</p>
    </template>
    <template v-else>
      <p v-if="!quizRows.length" class="feedback-empty">近 {{ range }} 天还没有选择题记录；下方自我评价单独统计。</p>
      <div v-if="quizRows.length" class="quiz-feedback-list" aria-label="题型答题表现">
        <article v-for="row in quizRows" :key="row.id" class="quiz-feedback-row">
          <div class="quiz-type">
            <strong>{{ row.title }}</strong>
            <small>答对 {{ row.correct }} / {{ row.total }} · 答错 {{ row.incorrect }} 次</small>
          </div>
          <div class="quiz-accuracy">
            <strong>{{ row.accuracy === null ? '—' : `${row.accuracy}%` }}</strong>
            <small>答题正确率</small>
          </div>
          <div class="quiz-preview" aria-label="待重练词汇预览">
            <template v-if="row.previewWords.length">
              <span v-for="word in row.previewWords.slice(0, 4)" :key="word.id" lang="ja">{{ word.term }}</span>
              <small v-if="row.practiceWordIds.length > 4">另有 {{ row.practiceWordIds.length - 4 }} 个错词</small>
            </template>
            <small v-if="row.unresolvedWordIds.length">{{ row.unresolvedWordIds.length }} 个历史词条当前无法练习</small>
            <small v-else-if="!row.practiceWordIds.length && row.accuracy === 100">这些词近期已全部答对</small>
            <small v-else-if="!row.practiceWordIds.length">暂无可重练词</small>
          </div>
          <button
            v-if="bookId && row.practiceWordIds.length > 0"
            class="retry-button"
            type="button"
            :aria-label="`重练${row.title}错词，共${row.practiceWordIds.length}个`"
            @click="retryIncorrect(row.id, row.practiceWordIds.length)"
          >
            <span>重练错词 {{ row.practiceWordIds.length }}</span><ArrowRight :size="15" aria-hidden="true" />
          </button>
        </article>
      </div>

      <section v-if="report.self.total" class="self-feedback" aria-labelledby="self-feedback-title">
        <div class="self-heading">
          <div><h3 id="self-feedback-title">自我评价</h3><p>与你的答题正确率分开统计。</p></div>
          <span>{{ report.self.total }} 次</span>
        </div>
        <dl class="self-counts">
          <div><dt>记得</dt><dd>{{ report.self.remembered }}</dd></div>
          <div><dt>模糊</dt><dd>{{ report.self.uncertain }}</dd></div>
          <div><dt>忘记</dt><dd>{{ report.self.forgotten }}</dd></div>
        </dl>
      </section>
    </template>
  </section>
</template>

<style scoped>
.practice-feedback { display: flex; min-width: 0; flex-direction: column; gap: 12px; }
.feedback-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.feedback-heading .eyebrow { margin: 0 0 5px; color: var(--muted); font-size: 9px; letter-spacing: .13em; }
.feedback-heading h2 { margin: 0; color: var(--green); font-size: 17px; line-height: 1.45; }
.feedback-scope { margin: 4px 0 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
.quiz-feedback-list { min-width: 0; border-top: 1px solid var(--line); }
.quiz-feedback-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(72px, .42fr) minmax(0, 1.1fr) auto; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.quiz-type, .quiz-accuracy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.quiz-type strong { color: var(--ink); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.quiz-type small, .quiz-accuracy small { color: var(--muted); font-size: 10px; line-height: 1.55; }
.quiz-accuracy strong { color: var(--green); font-size: 17px; font-variant-numeric: tabular-nums; }
.quiz-preview { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 6px; }
.quiz-preview > span { max-width: 100%; padding: 4px 7px; overflow-wrap: anywhere; border-radius: 6px; background: var(--green-soft); color: var(--green); font-size: 11px; }
.quiz-preview small { color: var(--muted); font-size: 10px; line-height: 1.5; }
.retry-button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 5px; padding: 7px 9px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper); color: var(--green); font: inherit; font-size: 11px; cursor: pointer; white-space: nowrap; }
.retry-button:hover { border-color: var(--green); background: var(--green-soft); }
.retry-button:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
.feedback-empty { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.self-feedback { display: grid; grid-template-columns: minmax(130px, .8fr) minmax(0, 1fr); align-items: center; gap: 12px; padding: 12px; border-radius: 10px; background: var(--green-soft); }
.self-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.self-heading h3 { margin: 0; color: var(--green); font-size: 12px; }
.self-heading p { margin: 4px 0 0; color: var(--muted); font-size: 10px; line-height: 1.55; }
.self-heading > span { flex: none; color: var(--muted); font-size: 10px; }
.self-counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; }
.self-counts > div { display: flex; align-items: baseline; justify-content: center; gap: 6px; padding: 5px; border-left: 1px solid var(--line-strong); }
.self-counts dt { color: var(--muted); font-size: 10px; }
.self-counts dd { margin: 0; color: var(--green); font-size: 16px; font-variant-numeric: tabular-nums; }
@media (max-width: 600px) {
  .quiz-feedback-row { grid-template-columns: minmax(0, 1fr) auto; gap: 9px 10px; }
  .quiz-preview { grid-column: 1 / -1; }
  .retry-button { grid-column: 1 / -1; width: 100%; }
  .self-feedback { grid-template-columns: 1fr; gap: 8px; }
  .self-counts > div:first-child { border-left: 0; }
}
</style>
