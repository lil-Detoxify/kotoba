<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronDown, ArrowUpRight, BookOpen } from 'lucide-vue-next';
import { useApp } from '../store';
import { bookCategory } from '../services/book-presentation';
import LearningTrend from '../components/LearningTrend.vue';
import LearningMethodChart from '../components/LearningMethodChart.vue';
import BookShareChart from '../components/BookShareChart.vue';
import { learningAnalytics, libraryProgress } from '../services/learning-analytics';
import { meaningPresentation } from '../services/meaning-presentation';
import { weakPracticeSuggestions } from '../services/study-feedback';
import PracticeFeedback from '../components/PracticeFeedback.vue';
const app = useApp();
const router = useRouter();
const practiceStarting=ref(false);
const practiceError=ref('');
const range = ref<7 | 30>(7);
const analytics = computed(() => learningAnalytics(app.data, app.now, range.value, app.currentUser?.id));
const progress = computed(() => libraryProgress(app.data, app.metaBooks, app.currentUser?.id));
const currentBookProgress = computed(() => progress.value.books.find(book => book.id === app.data.currentBookId));
const currentBook = computed(() => app.data.books.find(book => book.id === app.data.currentBookId));
const weakSuggestions = computed(() => {
  const bookId = app.data.currentBookId;
  if (!bookId || !currentBook.value) return [];
  return weakPracticeSuggestions(app.data, app.now, app.currentUser?.id, bookId, 5);
});
const stageNames = { new: '尚未学习', learning: '学习中', review: '复习中', mastered: '已掌握' };
const openBooks = ref(new Set<string>());
watch(() => [app.currentUser?.id, app.data.currentBookId], () => {
  openBooks.value = new Set(app.data.currentBookId ? [app.data.currentBookId] : []);
}, { immediate: true });
function toggleBook(id: string, event: Event) {
  const next = new Set(openBooks.value);
  if ((event.target as HTMLDetailsElement).open) next.add(id); else next.delete(id);
  openBooks.value = next;
}
async function startFocusedPractice(): Promise<void> {
  if (app.busy || practiceStarting.value || !weakSuggestions.value.length) return;
  const wordIds = weakSuggestions.value.map(suggestion => suggestion.word.id);
  practiceStarting.value=true;practiceError.value='';
  try {
    if (await app.startFocusedPractice(wordIds)) await router.push('/study');
    else practiceError.value=app.error||'这些词暂时无法开始练习，请重试。';
  } catch(error){practiceError.value=error instanceof Error?error.message:'练习暂时无法开始，请重试。'}
  finally{practiceStarting.value=false;}
}
</script>
<template>
  <section class="page-heading"><div><p class="eyebrow">YOUR LITTLE STEPS</p><h1>每一点积累，都算数。</h1><p class="muted">看看你已经走过的路。</p></div><span class="streak">连续学习 {{ app.stats.streak }} 天</span></section>
  <section class="metric-row"><div><span>累计学习</span><strong>{{ progress.learned.toLocaleString() }}<small>词</small></strong></div><div><span>累计评价</span><strong>{{ app.stats.totalReviews.toLocaleString() }}<small>次</small></strong></div><div><span>当前待复习</span><strong>{{ app.stats.due }}<small>词</small></strong></div><div><span>词库学习进度</span><strong>{{ progress.percent }}<small>%</small></strong></div></section>
  <section class="weak-practice-section" aria-labelledby="weak-practice-heading">
    <div class="weak-practice-heading"><div><p class="eyebrow">FOCUSED PRACTICE</p><h2 id="weak-practice-heading">值得再巩固的词</h2></div><button type="button" class="primary weak-practice-action" :disabled="app.busy || practiceStarting || !weakSuggestions.length" @click="startFocusedPractice">{{practiceStarting?'准备练习…':'开始巩固练习'}}</button></div>
    <p class="weak-practice-note"><template v-if="currentBook">{{currentBook.title}} · </template>根据近 30 天的忘记、模糊评价和生词标记整理。</p>
    <p v-if="practiceError" class="error" role="alert">{{practiceError}}</p>
    <p v-if="!currentBook" class="weak-practice-empty">先选择一本词书，再查看值得巩固的词。</p>
    <ul v-else-if="weakSuggestions.length" class="weak-practice-list"><li v-for="suggestion in weakSuggestions" :key="suggestion.word.id" class="weak-practice-item"><div><div class="weak-practice-word"><strong lang="ja">{{ suggestion.word.term }}</strong><span class="weak-practice-reading">{{ suggestion.word.reading }}</span></div><p class="weak-practice-meaning">{{ meaningPresentation(suggestion.word).summary }}</p></div><p class="weak-practice-reason">{{ suggestion.reason }}</p></li></ul>
    <p v-else class="weak-practice-empty">还没有可整理的近期记录，继续学习后这里会显示建议。</p>
  </section>
  <section class="learning-overview" aria-labelledby="recent-learning-heading">
    <div class="overview-header"><div><p class="eyebrow">A RHYTHM OF YOUR OWN</p><h2 id="recent-learning-heading">最近的学习节奏</h2></div><div class="range-switch" role="group" aria-label="统计时间范围"><button type="button" :aria-pressed="range === 7" @click="range = 7">近 7 天</button><button type="button" :aria-pressed="range === 30" @click="range = 30">近 30 天</button></div></div>
    <div class="period-summary"><span><strong>{{ analytics.activeDays }}</strong> 天有学习</span><span><strong>{{ analytics.distinctWords }}</strong> 个不同词汇</span><span><strong>{{ analytics.reviews }}</strong> 次评价</span></div>
    <PracticeFeedback :range="range" :book-id="app.data.currentBookId" :book-title="currentBook?.title ?? ''" />
    <div class="analytics-grid">
      <section class="analytics-panel trend-panel"><div class="chart-heading"><p class="panel-kicker">01 / TREND</p><span class="chart-type">折线图</span></div><h3>每天的学习词数</h3><p class="chart-note">每天按词去重，包含新学与复习。</p><LearningTrend :days="analytics.days"/><p v-if="analytics.reviews === 0" class="empty-trend">还没有记录。从今天的第一个词开始。</p></section>
      <section class="analytics-panel learning-method-panel"><div class="chart-heading"><p class="panel-kicker">02 / ACTIVITY</p><span class="chart-type">条形图</span></div><h3>新学与复习的投入</h3><p class="chart-note">近 {{ range }} 天，各学习方式的评价次数。</p><LearningMethodChart :methods="analytics.methods" :total="analytics.reviews"/></section>
      <section class="analytics-panel book-composition-panel"><div class="chart-heading"><p class="panel-kicker">03 / COLLECTIONS</p><span class="chart-type">环形饼图</span></div><h3>词汇来自哪些词书</h3><p class="chart-note">近 {{ range }} 天学过的词汇，按词书内去重。</p><BookShareChart :shares="analytics.shares" :total="analytics.shareTotal"/><p class="chart-note bottom-note">{{ analytics.shares.some(s => s.id === 'other') ? '较少学习的词书合并为「其他词书」。' : '数字与百分比对应同一时间范围。' }}</p></section>
    </div>
  </section>
  <section class="memory-stages" aria-labelledby="memory-heading">
    <div class="memory-heading"><div><p class="panel-kicker">04 / MEMORY</p><h2 id="memory-heading">记忆的不同阶段</h2><p v-if="currentBookProgress" class="memory-book">正在学习 · {{ currentBookProgress.title }} <span>已学 {{ currentBookProgress.learned }} / {{ currentBookProgress.total.toLocaleString() }} 词</span></p></div><small>掌握：记忆稳定性达到 30 天，仍会安排复习。</small></div>
    <template v-if="currentBookProgress">
      <div class="memory-track" aria-hidden="true"><i v-for="(_, key) in stageNames" :key="key" :class="'stage-' + key" :style="{ width: (currentBookProgress.stages[key] / Math.max(currentBookProgress.total, 1) * 100) + '%' }"></i></div>
      <ul class="stage-legend"><li v-for="(name, key) in stageNames" :key="key"><span class="stage-dot" :class="'stage-' + key"></span><span>{{ name }}</span><strong>{{ currentBookProgress.stages[key].toLocaleString() }}</strong><small>{{ Math.round(currentBookProgress.stages[key] / Math.max(currentBookProgress.total, 1) * 100) }}%</small></li></ul>
    </template>
    <p v-else class="memory-book">先选择一本词书，就能查看它的记忆阶段。</p>
  </section>
  <section class="book-progress-section" aria-labelledby="book-progress-heading"><div class="section-title"><div><p class="eyebrow">ONE CHAPTER AT A TIME</p><h2 id="book-progress-heading">词书与课次进度</h2></div><span class="muted">当前词书默认展开</span></div><p class="progress-hint">其他词书收纳在下方，点击书名可查看课次。</p>
    <details v-for="book in progress.books" :key="book.id" class="progress-drawer" :class="{ 'active-book': book.id === app.data.currentBookId }" :open="openBooks.has(book.id)" @toggle="toggleBook(book.id, $event)">
      <summary><span class="drawer-icon"><BookOpen :size="18"/></span><span class="drawer-title"><strong>{{ book.title }}</strong><small>{{ book.lessons.length }} {{ bookCategory(book) === 'jlpt' ? '组' : '课' }} <span v-if="book.id === app.data.currentBookId">· 正在学习</span></small></span><span class="drawer-progress"><span>已学 {{ book.learned }} / {{ book.total.toLocaleString() }} 词</span><span class="progress"><i :style="{ width: book.percent + '%' }"></i></span></span><strong class="drawer-percent">{{ book.percent }}%</strong><ChevronDown :size="18" class="drawer-chevron"/></summary>
      <div class="drawer-content"><div v-for="lesson in book.lessons" :key="lesson.id" class="lesson-stat"><span>{{ lesson.title }}</span><span class="lesson-stat-count">{{ lesson.learned }} / {{ lesson.total }} 词</span><div class="progress"><i :style="{ width: lesson.percent + '%' }"></i></div><small>{{ lesson.percent }}%</small></div><p v-if="!book.lessons.length" class="muted">词书中还没有课次。</p><RouterLink :to="'/books/' + book.id" class="drawer-book-link">前往词书 <ArrowUpRight :size="15"/></RouterLink></div>
    </details>
  </section>
</template>
<style scoped>
.learning-overview{margin:30px 0}.overview-header{display:flex;align-items:center;justify-content:space-between;gap:15px}.overview-header .eyebrow{font-size:9px;margin-bottom:9px}.overview-header h2{margin:0;font-size:22px}.range-switch{display:flex;gap:4px;background:#e9ede3;border-radius:8px;padding:4px;flex-shrink:0}.range-switch button{min-height:44px;min-width:74px;padding:8px 12px;background:transparent;border:0;font-size:12px;color:#62705b}.range-switch button[aria-pressed=true]{background:#fffef8;color:#355440;box-shadow:0 1px 4px #33462215}.range-switch button:focus-visible{outline:2px solid #496d52;outline-offset:2px}.period-summary{display:flex;gap:24px;color:#76816d;font-size:12px;margin:21px 0}.period-summary strong{font-size:17px;color:#3e573e;font-weight:600;margin-right:3px;font-variant-numeric:tabular-nums}.analytics-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.analytics-panel{background:#fffefa;border:1px solid #e0e5d9;border-radius:12px;padding:23px 23px 18px;min-width:0}.panel-kicker{font-size:9px;color:#7a876b;letter-spacing:.16em;margin:0 0 12px}.analytics-panel h3{font-size:18px;margin:0}.chart-note{font-size:11px;line-height:1.65;color:#748069;margin:8px 0 12px}.bottom-note{margin-bottom:0}.empty-trend{font-size:12px;color:#748069;margin:0}.memory-stages{border:1px solid #e0e5d9;border-radius:12px;padding:23px;background:#f0f3e9;margin:26px 0 38px}.memory-heading{display:flex;justify-content:space-between;align-items:center;gap:20px}.memory-heading h2{margin:0;font-size:19px}.memory-heading small{color:#748069;font-size:11px;max-width:26ch;line-height:1.6}.memory-track{height:10px;display:flex;background:#e6ebde;border-radius:8px;overflow:hidden;margin:23px 0 19px}.memory-track i{display:block;height:100%;flex-shrink:0}.stage-new{background:#d4ddc6}.stage-learning{background:#c79863}.stage-review{background:#779181}.stage-mastered{background:#365e43}.stage-legend{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.stage-legend li{display:flex;align-items:center;gap:7px;font-size:12px;flex-wrap:wrap}.stage-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}.stage-legend strong{font-variant-numeric:tabular-nums;font-size:14px}.stage-legend small{color:#748069;font-size:10px}.book-progress-section .section-title{margin-bottom:8px}.book-progress-section .section-title h2{margin:0;font-size:23px}.book-progress-section .section-title .muted{font-size:11px}.book-progress-section .eyebrow{font-size:9px;margin-bottom:9px}.progress-hint{font-size:12px;color:#748069;margin:0 0 22px}.progress-drawer{border:1px solid #e0e5d9;border-radius:10px;background:#fffefa;margin:10px 0;overflow:clip}.progress-drawer.active-book{border-color:#b3c1a7}.progress-drawer summary{display:flex;align-items:center;gap:14px;padding:18px 20px;cursor:pointer;list-style:none;min-height:84px}.progress-drawer summary::-webkit-details-marker{display:none}.progress-drawer summary:hover{background:#f0f3e9}.progress-drawer summary:focus-visible{outline:2px solid #496d52;outline-offset:-3px;border-radius:10px}.drawer-icon{display:grid;place-items:center;width:35px;height:39px;flex-shrink:0;background:#eaf0e1;border-radius:6px;color:#5e7750}.drawer-title{flex:1;min-width:0}.drawer-title strong{font-size:15px;line-height:1.6;overflow-wrap:anywhere;display:block}.drawer-title small{font-size:10px;color:#7a866d}.drawer-title small span{color:#557249}.drawer-progress{width:170px;flex-shrink:0;font-size:11px;color:#6f7c63}.drawer-progress>.progress{display:block;margin-top:8px;height:4px}.drawer-percent{font-size:13px;font-weight:500;min-width:36px;text-align:right;color:#4c6442}.drawer-chevron{flex-shrink:0;color:#7a866d}.progress-drawer[open] .drawer-chevron{transform:rotate(180deg)}.drawer-content{border-top:1px solid #e4e9dd;padding:12px 22px 19px}.lesson-stat{display:grid;grid-template-columns:minmax(0,1.2fr) 80px minmax(60px,1fr) 36px;align-items:center;gap:15px;font-size:12px;padding:11px 0;border-bottom:1px solid #edf0e8}.lesson-stat>span:first-child{overflow-wrap:anywhere}.lesson-stat-count{color:#7a866d;font-size:10px;text-align:right}.lesson-stat small{text-align:right;color:#667b58}.lesson-stat .progress{height:4px}.drawer-book-link{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#496d52;margin-top:15px;min-height:34px}.drawer-book-link:focus-visible{outline:2px solid #496d52;outline-offset:3px}
.memory-book{font-size:12px;line-height:1.6;color:#536747;margin:10px 0 0;overflow-wrap:anywhere}.memory-book span{display:inline-block;color:#748069;margin-left:12px;font-size:11px}
.chart-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.chart-heading .panel-kicker{margin:0;font-size:8px}.chart-type{font-size:10px;color:#526847;background:#edf1e5;border-radius:4px;padding:4px 6px;white-space:nowrap}
@media(max-width:1250px){.analytics-grid{grid-template-columns:1fr}.drawer-progress{width:130px}.stage-legend{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:15px}}
@media(max-width:760px){.learning-overview{margin-top:25px}.overview-header{align-items:flex-start;flex-wrap:wrap}.overview-header h2{font-size:21px}.range-switch{padding:3px}.period-summary{gap:13px;flex-wrap:wrap;font-size:10px;margin:18px 0}.period-summary strong{font-size:15px}.analytics-panel{padding:19px 16px 14px}.analytics-grid{gap:16px}.memory-stages{padding:19px 16px;margin:20px 0 28px}.memory-heading{align-items:flex-start;flex-direction:column;gap:9px}.memory-heading small{max-width:none;font-size:10px}.memory-heading .panel-kicker{margin-bottom:8px}.stage-legend li{font-size:11px;gap:5px}.stage-legend strong{font-size:13px}.book-progress-section .section-title{align-items:flex-start;gap:12px}.book-progress-section .section-title h2{font-size:21px}.book-progress-section .section-title .muted{font-size:9px;max-width:9ch;padding-top:20px}.progress-drawer summary{padding:14px 12px;gap:9px;flex-wrap:wrap}.drawer-icon{width:29px;height:34px}.drawer-title strong{font-size:13px}.drawer-progress{order:4;width:calc(100% - 38px);flex-basis:calc(100% - 38px);display:flex;align-items:center;gap:15px;margin-left:38px;font-size:10px}.drawer-progress>.progress{flex:1;margin:0;min-width:20px}.drawer-percent{font-size:11px;min-width:27px}.drawer-chevron{width:15px}.drawer-content{padding:8px 13px 15px}.lesson-stat{grid-template-columns:minmax(0,1fr) 58px 28px;gap:9px;font-size:11px;padding:10px 0}.lesson-stat>.progress{grid-column:1/4;grid-row:2;height:3px}.lesson-stat small{grid-column:3;grid-row:1}.lesson-stat-count{font-size:9px}.drawer-book-link{min-height:44px}.progress-hint{font-size:11px}}
.weak-practice-section{margin:28px 0 34px;padding:0 0 26px;border-bottom:1px solid #e0e5d9}
.weak-practice-heading{display:flex;align-items:center;justify-content:space-between;gap:18px}
.weak-practice-heading .eyebrow{font-size:9px;margin-bottom:8px}
.weak-practice-heading h2{margin:0;font-size:22px}
.weak-practice-action{min-height:44px;white-space:nowrap}
.weak-practice-note{font-size:12px;color:#748069;margin:12px 0 4px}
.weak-practice-list{list-style:none;padding:0;margin:10px 0 18px}
.weak-practice-item{display:grid;grid-template-columns:minmax(0,1fr) minmax(170px,.45fr);align-items:center;gap:20px;padding:14px 0;border-bottom:1px solid #edf0e8}
.weak-practice-item:last-child{border-bottom:0}
.weak-practice-word{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.weak-practice-word strong{font-size:16px;font-weight:600;color:#354e3c}
.weak-practice-reading{font-size:11px;color:#748069}
.weak-practice-meaning{font-size:12px;color:#52634c;margin:4px 0 0;line-height:1.6}
.weak-practice-reason{margin:0;font-size:11px;line-height:1.6;color:#748069}
.weak-practice-empty{margin:10px 0 18px;font-size:12px;color:#748069}
@media(max-width:760px){.weak-practice-section{margin:24px 0 28px;padding-bottom:20px}.weak-practice-heading{align-items:flex-start;flex-direction:column;gap:12px}.weak-practice-heading h2{font-size:21px}.weak-practice-action{width:100%}.weak-practice-item{grid-template-columns:minmax(0,1fr);gap:4px;padding:13px 0}}
</style>
