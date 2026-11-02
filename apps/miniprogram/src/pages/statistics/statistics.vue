<script lang="ts">
import { createFriendShare, createTimelineShare } from "../../services/share";
export default {
  onShareAppMessage: createFriendShare,
  onShareTimeline: createTimelineShare,
};
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onHide, onShow, onUnload } from "@dcloudio/uni-app";
import type { Data, QuizType } from "@jp/models";
import MiniPage from "../../components/MiniPage.vue";
import MiniHeader from "../../components/MiniHeader.vue";
import MiniPanel from "../../components/MiniPanel.vue";
import MiniSkeleton from "../../components/MiniSkeleton.vue";
import MiniStatisticsCanvas from "../../components/MiniStatisticsCanvas.vue";
import MiniNotice from "../../components/MiniNotice.vue";
import MiniPracticeFeedback from "../../components/MiniPracticeFeedback.vue";
import MiniMeaningText from "../../components/MiniMeaningText.vue";
import { defaultRepository } from "../../adapters";
import { defaultTextbooks, isBookLoaded, textbookCatalog } from "../../services/textbooks";
import { learningAnalytics, libraryProgress } from "../../services/learning-analytics";
import { statisticsPalette } from "../../services/statistics-palette";
import { miniPracticeFeedback, miniWeakPracticeSuggestions } from "../../services/study-feedback";
import { useMiniPageActivity } from "../../services/page-motion";
useMiniPageActivity();
const data = ref<Data | null>(null);
const range = ref<7 | 30>(7);
const now = ref(new Date());
const userId = ref<string | undefined>();
const loading = ref(true);
const error = ref("");
const openBooks = ref<string[]>([]);
const showDays = ref(false);
const analytics = computed(() => data.value ? learningAnalytics(data.value, now.value, range.value, userId.value) : null);
const progress = computed(() => data.value ? libraryProgress(data.value, textbookCatalog, userId.value) : null);
const currentBook = computed(() => progress.value?.books.find(book => book.id === data.value?.currentBookId));
const currentBookId = computed(() => data.value?.currentBookId || "");
const feedbackBookId = ref("");
const feedbackBooks = computed(() => data.value?.books ?? []);
const feedbackBook = computed(() => feedbackBooks.value.find(book => book.id === feedbackBookId.value));
const feedbackReport = computed(() => data.value ? miniPracticeFeedback(data.value, now.value, range.value, feedbackBookId.value) : null);
const feedbackLoading = ref(false);
const feedbackError = ref("");
const weakSuggestions = computed(() => data.value && currentBookId.value
  ? miniWeakPracticeSuggestions(data.value, now.value, currentBookId.value, 5) : []);
const currentBookNeedsLoad = computed(() => !!data.value && !!currentBookId.value
  && textbookCatalog.some(book => book.id === currentBookId.value)
  && !isBookLoaded(data.value, currentBookId.value));
const currentBookHasLocalWords = computed(() => {
  const snapshot = data.value;
  if (!snapshot || !currentBookId.value) return false;
  const lessonIds = new Set(snapshot.lessons.filter(lesson => lesson.bookId === currentBookId.value).map(lesson => lesson.id));
  return snapshot.words.some(word => lessonIds.has(word.lessonId));
});
const methodsMax = computed(() => Math.max(1, ...(analytics.value?.methods.map(method => method.count) ?? [])));
const stages = [{ key: "new", title: "尚未学习" }, { key: "learning", title: "学习中" }, { key: "review", title: "复习中" }, { key: "mastered", title: "已掌握" }] as const;
let epoch = 0;
let suggestionEpoch = 0;
let feedbackEpoch = 0;
let alive = true;

const snapshotKey = ref("");
const suggestionLoading = ref(false);
const suggestionError = ref("");

function enrichDirectory(snapshot: Data): Data {
  const existingBooks = new Set(snapshot.books.map(book => book.id));
  const existingLessons = new Set(snapshot.lessons.map(lesson => lesson.id));
  const stamp = new Date().toISOString();
  return { ...snapshot,
    books: [...snapshot.books, ...textbookCatalog.filter(book => !existingBooks.has(book.id)).map(book => ({ id: book.id, title: book.title, description: book.description, language: "ja", createdAt: stamp, updatedAt: stamp }))],
    lessons: [...snapshot.lessons, ...textbookCatalog.flatMap(book => book.lessons.filter(lesson => !existingLessons.has(lesson.id)).map(lesson => ({ id: lesson.id, bookId: book.id, title: lesson.title, order: lesson.order })))],
  };
}

async function refresh() {
  const ticket = ++epoch;
  suggestionEpoch++;
  suggestionLoading.value = false;
  suggestionError.value = "";
  feedbackEpoch++;
  feedbackLoading.value = false;
  feedbackError.value = "";
  const key = defaultRepository.getActiveKey();
  if (snapshotKey.value !== key) feedbackBookId.value = "";
  snapshotKey.value = "";
  loading.value = true; error.value = ""; data.value = null;
  try {
    const snapshot = await defaultRepository.read(key);
    if (!alive || ticket !== epoch || key !== defaultRepository.getActiveKey()) return;
    // Directory metadata enriches this read-only view; no textbook downloads or writes.
    data.value = enrichDirectory(snapshot);
    if (!data.value.books.some(book => book.id === feedbackBookId.value)) feedbackBookId.value = snapshot.currentBookId || "";
    snapshotKey.value = key;
    userId.value = key.startsWith("data_user_") ? key.slice("data_user_".length) : undefined;
    now.value = new Date();
    openBooks.value = snapshot.currentBookId ? [snapshot.currentBookId] : [];
  } catch { if (alive && ticket === epoch && key === defaultRepository.getActiveKey()) error.value = "学习记录暂时无法读取，请重试。原有记录未被覆盖。"; }
  finally { if (alive && ticket === epoch) loading.value = false; }
}

function chooseFeedbackBook(event: { detail: { value: string | number } }) {
  const book = feedbackBooks.value[Number(event.detail.value)];
  if (!book) return;
  feedbackEpoch++;
  feedbackLoading.value = false;
  feedbackError.value = "";
  feedbackBookId.value = book.id;
}

async function prepareFeedback(type?: QuizType) {
  const bookId = feedbackBookId.value;
  const selectedRange = range.value;
  const key = defaultRepository.getActiveKey();
  if (!bookId || feedbackLoading.value || snapshotKey.value !== key) return;
  const ticket = ++feedbackEpoch;
  const pageTicket = epoch;
  const current = () => alive && ticket === feedbackEpoch && pageTicket === epoch
    && key === defaultRepository.getActiveKey() && bookId === feedbackBookId.value && selectedRange === range.value;
  feedbackLoading.value = true;
  feedbackError.value = "";
  try {
    let snapshot = enrichDirectory(await defaultRepository.read(key));
    if (!current()) return;
    if (!type || miniPracticeFeedback(snapshot, new Date(), selectedRange, bookId).quiz.some(row => row.id === type && row.unresolvedWordIds.length)) {
      await defaultTextbooks.ensureBookLoaded(bookId, key);
      if (!current()) return;
      snapshot = enrichDirectory(await defaultRepository.read(key));
    }
    if (!current()) return;
    data.value = snapshot;
    now.value = new Date();
    if (type) {
      const row = miniPracticeFeedback(snapshot, now.value, selectedRange, bookId).quiz.find(item => item.id === type);
      if (!row?.practiceWordIds.length) {
        feedbackError.value = "记录已有更新，当前没有需要重练的错词。";
        return;
      }
      uni.navigateTo({ url: `/pages/study/study?mode=difficult&feedbackBookId=${encodeURIComponent(bookId)}&feedbackType=${type}&feedbackRange=${selectedRange}` });
    }
  } catch {
    if (current()) feedbackError.value = "练习内容暂时无法读取，请检查网络后重试。";
  } finally {
    if (ticket === feedbackEpoch && pageTicket === epoch) feedbackLoading.value = false;
  }
}

async function loadCurrentBookForSuggestions() {
  const snapshot = data.value;
  const bookId = currentBookId.value;
  const key = defaultRepository.getActiveKey();
  if (!snapshot || !bookId || !currentBookNeedsLoad.value || suggestionLoading.value) return;
  if (snapshotKey.value !== key) {
    void refresh();
    return;
  }

  const ticket = ++suggestionEpoch;
  const pageTicket = epoch;
  suggestionLoading.value = true;
  suggestionError.value = "";
  try {
    const loaded = await defaultTextbooks.ensureBookLoaded(bookId, key);
    if (!alive || ticket !== suggestionEpoch || pageTicket !== epoch || key !== defaultRepository.getActiveKey()) return;
    data.value = enrichDirectory(loaded);
    now.value = new Date();
  } catch {
    if (alive && ticket === suggestionEpoch && pageTicket === epoch && key === defaultRepository.getActiveKey()) {
      suggestionError.value = "词书正文暂时无法载入，请检查网络后重试。";
    }
  } finally {
    if (ticket === suggestionEpoch && pageTicket === epoch) suggestionLoading.value = false;
  }
}

function startWeakPractice() {
  const ids = weakSuggestions.value.map(suggestion => suggestion.word.id);
  if (!ids.length) return;
  if (snapshotKey.value !== defaultRepository.getActiveKey()) {
    void refresh();
    return;
  }
  uni.navigateTo({ url: `/pages/study/study?mode=difficult&practiceIds=${encodeURIComponent(JSON.stringify(ids))}` });
}
function toggleBook(id: string) {
  openBooks.value = openBooks.value.includes(id) ? openBooks.value.filter(key => key !== id) : [...openBooks.value, id];
}
function stagePercent(key: typeof stages[number]["key"]) {
  return currentBook.value ? currentBook.value.stages[key] / Math.max(1, currentBook.value.total) * 100 : 0;
}
onShow(() => { void refresh(); });
onHide(() => { epoch++; suggestionEpoch++; feedbackEpoch++; feedbackLoading.value = false; suggestionLoading.value = false; data.value = null; snapshotKey.value = ""; });
onUnload(() => { alive = false; epoch++; suggestionEpoch++; feedbackEpoch++; });
</script>
<template>
  <MiniPage class="statistics-page">
    <MiniHeader kicker="YOUR LITTLE STEPS" title="每一点积累，都算数" description="看看最近的学习节奏，也看看当前词书走到了哪里。" />
    <MiniSkeleton v-if="loading" label="正在读取学习统计…" />
    <view v-else-if="error" class="card error-card"><text>{{ error }}</text><button class="secondary-btn" @tap="refresh">重新读取</button></view>
    <template v-else-if="analytics && progress">
      <view class="summary-grid">
        <view class="card"><text class="summary-value">{{ progress.learned }}</text><text>累计已学词汇</text></view>
        <view class="card"><text class="summary-value">{{ analytics.reviews }}</text><text>近 {{ range }} 天评价次数</text></view>
      </view>
      <view class="range-switch"><button :class="{ selected: range === 7 }" :aria-pressed="range === 7" @tap="range = 7">近 7 天</button><button :class="{ selected: range === 30 }" :aria-pressed="range === 30" @tap="range = 30">近 30 天</button></view>
      <text class="period-summary">{{ analytics.activeDays }} 天有学习 · {{ analytics.distinctWords }} 个不同词汇</text>
      <view class="feedback-book-filter"><text>练习统计词书</text><picker :range="feedbackBooks" range-key="title" :value="Math.max(0, feedbackBooks.findIndex(book => book.id === feedbackBookId))" @change="chooseFeedbackBook"><view class="feedback-book-value">{{ feedbackBook?.title || '选择词书' }} ▾</view></picker></view>
      <MiniPracticeFeedback v-if="feedbackReport" :report="feedbackReport" :book-title="feedbackBook?.title || ''" :book-id="feedbackBookId" :range="range" :loading="feedbackLoading" :error="feedbackError" @load="prepareFeedback()" @practice="prepareFeedback($event)" />
      <MiniPanel kicker="FOCUSED PRACTICE" title="值得再巩固的词" icon="leaf" :description="currentBook ? `${currentBook.title} · 根据近 30 天的记录整理，最多 5 个。` : '根据近期忘记、模糊评价与生词标记整理建议。'">
        <view v-if="currentBookNeedsLoad" class="book-load-note">
          <text>{{ currentBookHasLocalWords ? '先查看本机已载入词条的建议，也可载入完整词书。' : '当前词书正文尚未载入；载入后才能整理建议。' }}</text>
          <button class="data-toggle" :disabled="suggestionLoading" @tap="loadCurrentBookForSuggestions">{{ suggestionLoading ? '正在载入词书…' : '载入当前词书建议' }}</button>
        </view>
        <MiniNotice v-if="suggestionError" :message="suggestionError" tone="error" />
        <view v-if="weakSuggestions.length" class="weak-practice-list">
          <view v-for="suggestion in weakSuggestions" :key="suggestion.word.id" class="weak-practice-item">
            <view class="weak-practice-copy"><view class="weak-practice-word"><text class="weak-term">{{ suggestion.word.term }}</text><text class="weak-reading">{{ suggestion.word.reading }}</text></view><MiniMeaningText class="weak-meaning" :word="suggestion.word" /></view>
            <text class="weak-reason">{{ suggestion.reason }}</text>
          </view>
          <button class="weak-practice-start" :disabled="suggestionLoading" @tap="startWeakPractice">巩固这些词</button>
        </view>
        <text v-else-if="!currentBookNeedsLoad" class="caption">{{ currentBook ? '近 30 天暂无需要巩固的词。继续学习后，这里会整理近期建议。' : '先选择一本词书，就能查看巩固建议。' }}</text>
      </MiniPanel>
      <MiniPanel kicker="01 / TREND · 折线图" title="每天的学习词数" icon="data" description="每天按词去重，包含新学与复习。">
        <MiniStatisticsCanvas kind="trend" :days="analytics.days" />
        <text v-if="!analytics.reviews" class="caption">还没有学习记录，从第一个词开始。</text>
        <button class="data-toggle" :aria-expanded="showDays" @tap="showDays = !showDays">{{ showDays ? '收起每日数据' : '查看每日数据' }}</button>
        <view v-if="showDays"><view v-for="day in analytics.days" :key="day.day" class="data-row"><text>{{ day.label }}</text><text>{{ day.words }} 词 · {{ day.reviews }} 次评价</text></view></view>
      </MiniPanel>
      <MiniPanel kicker="02 / ACTIVITY · 条形图" title="新学与复习的投入" icon="data" :description="`近 ${range} 天，各学习方式的评价次数。`">
        <view v-for="method in analytics.methods" :key="method.id" class="method-row"><view class="data-row"><text>{{ method.title }}</text><text>{{ method.count }} 次</text></view><view class="track"><view class="fill" :style="{ width: method.count / methodsMax * 100 + '%' }" /></view></view>
      </MiniPanel>
      <MiniPanel kicker="03 / COLLECTIONS · 环形饼图" title="词汇来自哪些词书" icon="data" :description="`近 ${range} 天学过的词汇，按词书内去重。`">
        <MiniStatisticsCanvas kind="donut" :shares="analytics.shares" :total="analytics.shareTotal" />
        <view v-for="(share, index) in analytics.shares" :key="share.id" class="data-row share-row"><view class="share-dot" :style="{ background: statisticsPalette.shares[index] }" aria-hidden="true" /><text class="share-title">{{ share.title }}</text><text>{{ share.count }} 词 · {{ share.percent }}%</text></view>
        <text v-if="!analytics.shareTotal" class="caption">开始学习后，这里会展示词书占比。</text>
      </MiniPanel>
      <MiniPanel kicker="04 / MEMORY" title="记忆的不同阶段" icon="leaf" description="掌握：记忆稳定性达到 30 天，仍会安排复习。">
        <template v-if="currentBook"><text class="current-title">正在学习 · {{ currentBook.title }}</text><text class="caption">已学 {{ currentBook.learned }} / {{ currentBook.total }} 词</text><view class="memory-track"><view v-for="stage in stages" :key="stage.key" :class="'stage-' + stage.key" :style="{ width: stagePercent(stage.key) + '%' }" /></view><view class="stage-grid"><view v-for="stage in stages" :key="stage.key"><text>{{ stage.title }}</text><text class="stage-count">{{ currentBook.stages[stage.key] }} 词 · {{ Math.round(stagePercent(stage.key)) }}%</text></view></view></template>
        <text v-else class="caption">先选择一本词书，就能查看它的记忆阶段。</text>
      </MiniPanel>
      <view class="section-heading"><text class="section-title">词书与课次进度</text><text class="caption">当前词书默认展开，其余点开查看</text></view>
      <view v-for="book in progress.books" :key="book.id" class="card progress-drawer">
        <button class="drawer-button" :aria-expanded="openBooks.includes(book.id)" @tap="toggleBook(book.id)"><view><text class="drawer-title">{{ book.title }}</text><text class="caption">{{ book.id === data?.currentBookId ? '正在学习 · ' : '' }}已学 {{ book.learned }} / {{ book.total }} 词</text></view><text class="drawer-indicator">{{ book.percent }}% · {{ openBooks.includes(book.id) ? '收起' : '展开' }}</text></button>
        <view v-if="openBooks.includes(book.id)" class="drawer-content"><view v-for="lesson in book.lessons" :key="lesson.id" class="lesson-row"><view class="data-row"><text>{{ lesson.title }}</text><text>{{ lesson.learned }} / {{ lesson.total }} 词</text></view><view class="track"><view class="fill" :style="{ width: lesson.percent + '%' }" /></view></view><text v-if="!book.lessons.length" class="caption">词书中还没有课次。</text></view>
      </view>
    </template>
  </MiniPage>
</template>
<style scoped>
.statistics-page { padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
.feedback-book-filter { display: flex; align-items: center; gap: 20rpx; margin: 0 0 20rpx; color: var(--kotoba-muted); font-size: 24rpx; }
.feedback-book-filter > picker { flex: 1; min-width: 0; }
.feedback-book-value { min-height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 12rpx 20rpx; border: 1rpx solid var(--kotoba-line); border-radius: 14rpx; background: var(--kotoba-paper); color: var(--kotoba-green); overflow-wrap: anywhere; }
.summary-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 20rpx; margin-bottom: 28rpx; }
.summary-grid .card { padding: 24rpx; font-size: 24rpx; color: var(--kotoba-muted); }
.summary-value { display: block; font-size: 48rpx; font-weight: 700; color: var(--kotoba-green); margin-bottom: 8rpx; }
.book-load-note { margin-bottom: 12rpx; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.7; }
.weak-practice-list { margin-top: 4rpx; }
.weak-practice-item { padding: 18rpx 0; border-bottom: 1rpx solid var(--kotoba-line); }
.weak-practice-copy { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6rpx 16rpx; }
.weak-practice-word { display: flex; align-items: baseline; gap: 14rpx; }
.weak-term { color: var(--kotoba-ink); font-size: 32rpx; font-weight: 700; }
.weak-reading { color: var(--kotoba-green); font-size: 24rpx; }
.weak-meaning { color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.6; }
.weak-reason { display: block; margin-top: 7rpx; color: var(--kotoba-muted); font-size: 22rpx; line-height: 1.6; }
.weak-practice-start { width: 100%; min-height: 48px; margin: 18rpx 0 0; color: #fff; background: var(--kotoba-green); border: 1rpx solid var(--kotoba-green); font-size: 27rpx; }
.range-switch { display: flex; gap: 16rpx; }
.range-switch button { margin: 0; flex: 1; min-height: 48px; font-size: 28rpx; color: var(--kotoba-green); background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); }
.range-switch .selected { color: white; background: var(--kotoba-green); }
.period-summary,.caption { display: block; font-size: 24rpx; line-height: 1.7; color: var(--kotoba-muted); }
.period-summary { margin: 20rpx 0 28rpx; }
.data-row { display: flex; justify-content: space-between; gap: 20rpx; font-size: 26rpx; line-height: 1.7; padding: 14rpx 0; }
.data-row text:first-child { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.data-row text:last-child { flex-shrink: 0; color: var(--kotoba-green); }
.data-toggle { width: 100%; margin: 12rpx 0 0; min-height: 48px; font-size: 26rpx; color: var(--kotoba-green); background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); }
.track,.memory-track { background: var(--kotoba-line); border-radius: 12rpx; overflow: hidden; height: 12rpx; }
.fill { height: 100%; background: var(--kotoba-green); }
.method-row { margin-bottom: 20rpx; }
.current-title { display: block; font-size: 28rpx; font-weight: 600; line-height: 1.6; }
.memory-track { display: flex; height: 18rpx; margin: 24rpx 0; }
.stage-new { background: #d4ddc6; }.stage-learning { background: #b67c44; }.stage-review { background: #779181; }.stage-mastered { background: var(--kotoba-green); }
.stage-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 20rpx; font-size: 26rpx; }
.stage-count { display: block; font-size: 24rpx; color: var(--kotoba-muted); margin-top: 6rpx; }
.section-heading { margin: 36rpx 0 20rpx; }.section-title { display: block; font-size: 34rpx; font-weight: 700; margin-bottom: 10rpx; }
.progress-drawer { margin-bottom: 18rpx; padding: 0; overflow: hidden; }
.drawer-button { display: flex; justify-content: space-between; align-items: center; gap: 18rpx; width: 100%; margin: 0; padding: 24rpx; min-height: 56px; border: 0; text-align: left; line-height: 1.6; background: var(--kotoba-paper); color: var(--kotoba-ink); }
.drawer-button view { flex: 1; min-width: 0; }.drawer-title { display: block; font-size: 28rpx; font-weight: 600; overflow-wrap: anywhere; }
.drawer-indicator { flex-shrink: 0; font-size: 24rpx; color: var(--kotoba-green); }.drawer-content { padding: 0 24rpx 24rpx; border-top: 1rpx solid var(--kotoba-line); }
.lesson-row { padding-bottom: 14rpx; }.lesson-row .data-row { font-size: 24rpx; }.share-row { border-bottom: 1rpx solid var(--kotoba-line); }
.share-row { align-items: center; gap: 12rpx; }.share-dot { width: 16rpx; height: 16rpx; border-radius: 50%; flex-shrink: 0; }.share-title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.error-card { padding: 32rpx; font-size: 28rpx; line-height: 1.8; }.error-card button { margin-top: 24rpx; }
</style>
