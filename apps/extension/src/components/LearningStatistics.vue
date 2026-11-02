<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChartNoAxesCombined, ChevronDown, Leaf } from 'lucide-vue-next';
import type { QuizType } from '@jp/models';
import type { ExtensionSnapshot, ExtensionWord } from '../model';
import { extensionLearningAnalytics, extensionLibraryProgress } from '../learning-analytics';
import { extensionPracticeFeedback } from '../library-reports';
import { extensionContentWords } from '../personal-library';
import { listLearningBooks } from '../learning';
import { fullBookTitle } from '../book-presentation';
import PracticeFeedbackPanel from './PracticeFeedbackPanel.vue';
const props = defineProps<{ catalog: ExtensionWord[]; snapshot: ExtensionSnapshot; nowMs?: number }>();
const emit = defineEmits<{ practice: [payload: { bookId: string; type: QuizType; range: 7 | 30 }] }>();
const range = ref<7 | 30>(7);
const now = computed(() => new Date(props.nowMs ?? Date.now()));
const openBookIds = ref<string[]>([]);
const analytics = computed(() => extensionLearningAnalytics(props.catalog, props.snapshot, now.value, range.value));
const progress = computed(() => extensionLibraryProgress(props.catalog, props.snapshot));
const feedbackBooks = computed(() => listLearningBooks(extensionContentWords(props.snapshot, props.catalog), props.snapshot.learning.books)
  .map(book => ({ ...book, title: fullBookTitle(book) })));
const currentBook = computed(() => {
  const id = props.snapshot.learning.userSettings?.currentBookId || props.snapshot.preferences.selectedBookIds[0];
  return progress.value.books.find(book => book.id === id) || progress.value.books.find(book => book.id === 'biaori-beginner-upper') || progress.value.books[0];
});
const feedbackBookId = ref('');
const feedbackBook = computed(() => feedbackBooks.value.find(book => book.id === feedbackBookId.value));
const feedbackReport = computed(() => extensionPracticeFeedback(props.snapshot, props.catalog, now.value, range.value, feedbackBookId.value || undefined));
watch([
  () => props.snapshot.identity?.partitionKey,
  () => currentBook.value?.id,
  () => feedbackBooks.value.map(book => book.id).join('\u0000'),
], () => {
  feedbackBookId.value = currentBook.value?.id || feedbackBooks.value[0]?.id || '';
}, { immediate: true, flush: 'sync' });
watch(() => [props.snapshot.identity?.partitionKey, currentBook.value?.id], () => { openBookIds.value = currentBook.value ? [currentBook.value.id] : []; }, { immediate: true });
const yStep = computed(() => Math.max(1, Math.ceil(Math.max(1, ...analytics.value.days.map(day => day.words)) / 4)));
const chartPoints = computed(() => analytics.value.days.map((day, i) => ({ ...day, x: 30 + 270 * i / Math.max(1, analytics.value.days.length - 1), y: 145 - day.words / (yStep.value * 4) * 120 })));
const chartLine = computed(() => chartPoints.value.map(point => `${point.x},${point.y}`).join(' '));
const methodsMax = computed(() => Math.max(1, ...analytics.value.methods.map(method => method.count)));
const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
const circumference = 2 * Math.PI * 52;
const arcs = computed(() => {
  let offset = 0;
  return analytics.value.shares.map((share, i) => {
    const length = share.count / Math.max(1, analytics.value.shareTotal) * circumference;
    const arc = { ...share, length, offset, color: colors[i] }; offset += length; return arc;
  });
});
const stages = [{ key: 'new', title: '尚未学习' }, { key: 'learning', title: '学习中' }, { key: 'review', title: '复习中' }, { key: 'mastered', title: '已掌握' }] as const;
function stagePercent(key: typeof stages[number]['key']) { return currentBook.value ? currentBook.value.stages[key] / Math.max(1, currentBook.value.total) * 100 : 0; }
function toggleBook(id: string) { openBookIds.value = openBookIds.value.includes(id) ? openBookIds.value.filter(key => key !== id) : [...openBookIds.value, id]; }
</script>
<template>
  <section class="extension-statistics">
    <div class="analytics-summary"><div><strong>{{ progress.learned }}</strong><span>累计已学词汇</span></div><div><strong>{{ analytics.reviews }}</strong><span>近 {{ range }} 天评价</span></div></div>
    <div class="analytics-range" role="group" aria-label="统计时间范围"><button v-for="value in [7, 30] as const" :key="value" type="button" :aria-pressed="range === value" @click="range = value">近 {{ value }} 天</button></div>
    <p class="analytics-period">{{ analytics.activeDays }} 天有学习 · {{ analytics.distinctWords }} 个不同词汇</p>
    <div class="analytics-section practice-feedback-scope">
      <label v-if="feedbackBooks.length" class="practice-feedback-book"><span>练习统计词书</span><select v-model="feedbackBookId"><option v-for="book in feedbackBooks" :key="book.id" :value="book.id">{{ book.title }}</option></select></label>
      <PracticeFeedbackPanel :report="feedbackReport" :book-title="feedbackBook?.title ?? ''" :book-id="feedbackBookId || undefined" :range="range" @practice="emit('practice', $event)" />
    </div>
    <section class="analytics-section" aria-labelledby="trend-title"><div class="analytics-heading"><ChartNoAxesCombined :size="18" aria-hidden="true" /><div><p class="eyebrow">01 / TREND · 折线图</p><h2 id="trend-title">每天的学习词数</h2><p>每天按词去重，包含新学与复习。</p></div></div>
      <svg class="analytics-trend" viewBox="0 0 320 185" role="img" aria-label="每天学习词数折线图，可展开下方每日数据查看数值">
        <g v-for="tick in 5" :key="tick"><line x1="30" x2="300" :y1="145 - (tick - 1) * 30" :y2="145 - (tick - 1) * 30" class="chart-grid" /><text x="3" :y="149 - (tick - 1) * 30">{{ (tick - 1) * yStep }}</text></g>
        <polyline :points="chartLine" class="chart-line" />
        <circle v-for="point in chartPoints" :key="point.day" :cx="point.x" :cy="point.y" :r="range === 7 ? 3 : 1.8" class="chart-point"><title>{{ point.label }}：{{ point.words }} 词，{{ point.reviews }} 次评价</title></circle>
        <text v-for="index in [0, Math.floor((chartPoints.length - 1) / 2), chartPoints.length - 1]" :key="index" :x="chartPoints[index]?.x" y="174" :text-anchor="index === 0 ? 'start' : index === chartPoints.length - 1 ? 'end' : 'middle'">{{ chartPoints[index]?.label }}</text>
      </svg>
      <p v-if="!analytics.reviews" class="analytics-caption">还没有学习记录，从第一个词开始。</p>
      <details class="analytics-days"><summary>查看每日数据</summary><table><caption class="sr-only">最近 {{ range }} 天学习记录</caption><thead><tr><th>日期</th><th>词数</th><th>评价次数</th></tr></thead><tbody><tr v-for="day in analytics.days" :key="day.day"><th scope="row">{{ day.label }}</th><td>{{ day.words }}</td><td>{{ day.reviews }}</td></tr></tbody></table></details>
    </section>
    <section class="analytics-section" aria-labelledby="activity-title"><div class="analytics-heading"><ChartNoAxesCombined :size="18" aria-hidden="true" /><div><p class="eyebrow">02 / ACTIVITY · 条形图</p><h2 id="activity-title">新学与复习的投入</h2><p>近 {{ range }} 天，各学习方式的评价次数。</p></div></div><div v-for="method in analytics.methods" :key="method.id" class="analytics-method"><div><span>{{ method.title }}</span><strong>{{ method.count }} 次</strong></div><div class="analytics-track"><i :style="{ width: method.count / methodsMax * 100 + '%' }" /></div></div></section>
    <section class="analytics-section collection-chart" aria-labelledby="collections-title"><div class="analytics-heading"><ChartNoAxesCombined :size="18" aria-hidden="true" /><div><p class="eyebrow">03 / COLLECTIONS · 环形饼图</p><h2 id="collections-title">词汇来自哪些词书</h2><p>近 {{ range }} 天学过的词汇，按词书内去重。</p></div></div><svg class="analytics-donut" viewBox="0 0 180 180" role="img" :aria-label="`词书占比环形图，共 ${analytics.shareTotal} 个词书内去重词汇，下方列出明细`"><circle cx="90" cy="90" r="52" class="donut-background" /><circle v-for="arc in arcs" :key="arc.id" cx="90" cy="90" r="52" fill="none" stroke-width="24" :stroke="arc.color" :stroke-dasharray="`${arc.length} ${circumference - arc.length}`" :stroke-dashoffset="-arc.offset" transform="rotate(-90 90 90)" /><text x="90" y="91" class="donut-total">{{ analytics.shareTotal }}</text><text x="90" y="111">词书内去重词汇</text></svg><ul class="analytics-share-list"><li v-for="(share, index) in analytics.shares" :key="share.id"><i :style="{ background: colors[index] }" aria-hidden="true" /><span>{{ share.title }}</span><strong>{{ share.count }} 词 · {{ share.percent }}%</strong></li></ul><p v-if="!analytics.shareTotal" class="analytics-caption">开始学习后，这里会展示词书占比。</p></section>
    <section class="analytics-section memory-section" aria-labelledby="memory-title"><div class="analytics-heading"><Leaf :size="18" aria-hidden="true" /><div><p class="eyebrow">04 / MEMORY</p><h2 id="memory-title">记忆的不同阶段</h2><p>掌握：记忆稳定性达到 30 天，仍会安排复习。</p></div></div><template v-if="currentBook"><h3>正在学习 · {{ currentBook.title }}</h3><p class="analytics-caption">已学 {{ currentBook.learned }} / {{ currentBook.total }} 词</p><div class="memory-progress"><i v-for="stage in stages" :key="stage.key" :class="`stage-${stage.key}`" :style="{ width: stagePercent(stage.key) + '%' }" /></div><dl class="memory-stages"><div v-for="stage in stages" :key="stage.key"><dt>{{ stage.title }}</dt><dd>{{ currentBook.stages[stage.key] }} 词 · {{ Math.round(stagePercent(stage.key)) }}%</dd></div></dl></template><p v-else class="analytics-caption">先选择一本词书，就能查看它的记忆阶段。</p></section>
    <div class="analytics-books-heading"><h2>词书与课次进度</h2><p>当前词书默认展开，其余点开查看</p></div>
    <section v-for="book in progress.books" :key="book.id" class="analytics-book"><button class="analytics-book-toggle" type="button" :aria-expanded="openBookIds.includes(book.id)" @click="toggleBook(book.id)"><span><strong>{{ book.title }}</strong><small>{{ book.id === currentBook?.id ? '正在学习 · ' : '' }}已学 {{ book.learned }} / {{ book.total }} 词</small></span><span class="analytics-book-indicator">{{ book.percent }}%<ChevronDown :size="16" aria-hidden="true" /></span></button><div v-if="openBookIds.includes(book.id)" class="analytics-lessons"><div v-for="lesson in book.lessons" :key="lesson.id" class="analytics-lesson"><p><span>{{ lesson.title }}</span><span>{{ lesson.learned }} / {{ lesson.total }} 词</span></p><div class="analytics-track"><i :style="{ width: lesson.percent + '%' }" /></div></div><p v-if="!book.lessons.length" class="analytics-caption">词书中还没有课次。</p></div></section>
  </section>
</template>

<style scoped>
.practice-feedback-scope { padding-top: 15px; }
.practice-feedback-book { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 14px; color: var(--muted); font-size: 12px; }
.practice-feedback-book span { flex: none; }
.practice-feedback-book select { min-width: 0; min-height: 40px; max-width: 70%; padding: 6px 30px 6px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; }
.practice-feedback-book select:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
</style>
