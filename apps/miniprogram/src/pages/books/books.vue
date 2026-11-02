<script lang="ts">
import { createFriendShare, createTimelineShare } from "../../services/share";
export default {
  onShareAppMessage: createFriendShare,
  onShareTimeline: createTimelineShare,
};
</script>

<script setup lang="ts">
import { useMiniPageActivity } from "../../services/page-motion";
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import MiniPage from "../../components/MiniPage.vue";
import MiniHeader from "../../components/MiniHeader.vue";
import MiniSkeleton from "../../components/MiniSkeleton.vue";
import MiniNotice from "../../components/MiniNotice.vue";
import MiniBookCover from "../../components/MiniBookCover.vue";
import type { Data, Lesson } from "@jp/models";
import { defaultTextbooks, isBookLoaded, textbookCatalog } from "../../services/textbooks";
import { calculateLearningStatistics, type LearningBookStatistics } from "../../services/learning-statistics";
import { bookCategory, fullBookTitle, type BookCategory } from "../../services/book-presentation";
import type { MiniStudyPreference } from "../../services/study-exercise-preference";
import MiniDailyPlan from "../../components/MiniDailyPlan.vue";
import { miniDailyStudyPlan } from "../../services/daily-study-plan";
import { miniStudyPlanPreference, type DailyPace } from "../../services/study-plan-preference";
useMiniPageActivity();

type CatalogBook = { id: string; title: string; description: string; wordCount: number; lessons: Array<{ id: string; title: string; order: number; wordCount: number }> };

const data = ref<Data | null>(null);
const loading = ref(false);
const loadingBook = ref("");
const loadError = ref("");
const bookErrors = ref<Record<string, string>>({});
const selectedExercise = ref<MiniStudyPreference>("auto");
const bookStatistics = ref<LearningBookStatistics[]>([]);
const bookFeedback = ref("");
const selectedCategory = ref<BookCategory | "all">("all");
const planLoading = ref(false);
const planSaving = ref(false);
const planNotice = ref("");

const exercises = [
  { id: "auto", label: "跟随设置" },
  { id: "card", label: "卡片" },
  { id: "kana-meaning", label: "假名→释义" },
  { id: "kanji-reading", label: "汉字→读音" },
  { id: "audio-meaning", label: "听音→释义" },
  { id: "mixed", label: "混合" },
  { id: "kana-input", label: "假名键入" },
  { id: "dictation", label: "听写" },
  { id: "cloze", label: "例句填空" },
] as const;

const books = computed<CatalogBook[]>(() => {
  const snapshot = data.value;
  const custom = snapshot?.books.filter(book => book.id !== "demo-jp" && !textbookCatalog.some(builtin => builtin.id === book.id)).map(book => {
    const lessons = snapshot.lessons.filter(lesson => lesson.bookId === book.id).map(lesson => ({ ...lesson, wordCount: snapshot.words.filter(word => word.lessonId === lesson.id).length }));
    return { ...book, lessons, wordCount: lessons.reduce((sum, lesson) => sum + lesson.wordCount, 0) };
  }) || [];
  return [...textbookCatalog, ...custom];
});
const visibleBooks = computed(() => selectedCategory.value === "all"
  ? books.value
  : books.value.filter((book) => bookCategory(book) === selectedCategory.value));
const categories = [
  { id: "all", label: "全部" },
  { id: "textbook", label: "教材" },
  { id: "jlpt", label: "JLPT" },
  { id: "custom", label: "我的词书" },
] as const;
function bookCount(category: BookCategory | "all"): number {
  return category === "all" ? books.value.length : books.value.filter((book) => bookCategory(book) === category).length;
}
const currentBookId = computed(() => data.value?.currentBookId || "");
const dailyPace = computed(() => miniStudyPlanPreference.getPace(currentBookId.value));
const dailyPlan = computed(() => {
  const snapshot = data.value;
  const bookId = currentBookId.value;
  if (!snapshot || !bookId || !loadedIds.value.has(bookId) || !miniStudyPlanPreference.state.ready) return null;
  return miniDailyStudyPlan(snapshot, bookId, dailyPace.value);
});
const dailyPlanBusy = computed(() => loading.value || !!loadingBook.value || planLoading.value || planSaving.value);
const loadedIds = computed(() => {
  const snapshot = data.value;
  return new Set(books.value.filter((book) => snapshot && (bookCategory(book) === "custom" || isBookLoaded(snapshot, book.id))).map((book) => book.id));
});
const selectedExerciseLabel = computed(() => exercises.find((item) => item.id === selectedExercise.value)?.label || "跟随设置");

function lessonsFor(book: CatalogBook): Array<Lesson | CatalogBook["lessons"][number]> {
  const loaded = data.value?.lessons.filter((lesson) => lesson.bookId === book.id) || [];
  return loaded.length ? loaded : book.lessons;
}

async function refresh() {
  loading.value = true;
  loadError.value = "";
  try {
    data.value = await defaultTextbooks.hydrate();
    // Progress is derived from the lightweight catalog and states/logs only;
    // rendering this page must never download textbook bodies.
    bookStatistics.value = calculateLearningStatistics(data.value, new Date()).books;
  } catch {
    loadError.value = "词书目录暂时无法读取，请重试。原有记录未被覆盖。";
  } finally {
    loading.value = false;
  }
}

async function loadPlanPreference() {
  planLoading.value = true;
  planNotice.value = "";
  try {
    await miniStudyPlanPreference.load();
  } catch {
    planNotice.value = "每日学习节奏暂时无法读取，请重试。";
  } finally {
    planLoading.value = false;
  }
}

function progressFor(book: CatalogBook): LearningBookStatistics {
  return bookStatistics.value.find((item) => item.bookId === book.id) || {
    bookId: book.id,
    title: fullBookTitle(book),
    learned: 0,
    mastered: 0,
    due: 0,
    difficult: 0,
    total: book.wordCount,
    progress: 0,
    percent: 0,
  };
}

async function download(bookId: string) {
  if (loading.value || loadingBook.value) return;
  bookFeedback.value = "";
  loadingBook.value = bookId;
  bookErrors.value = { ...bookErrors.value, [bookId]: "" };
  try {
    data.value = await defaultTextbooks.ensureBookLoaded(bookId);
    bookFeedback.value = "词书已下载，现在可以离线学习。";
  } catch {
    bookErrors.value = { ...bookErrors.value, [bookId]: "下载失败，词书尚未切换。" };
  } finally {
    loadingBook.value = "";
  }
}

async function selectBook(bookId: string) {
  if (loading.value || loadingBook.value || currentBookId.value === bookId) return;
  bookFeedback.value = "";
  loadingBook.value = bookId;
  bookErrors.value = { ...bookErrors.value, [bookId]: "" };
  try {
    if (!loadedIds.value.has(bookId)) data.value = await defaultTextbooks.ensureBookLoaded(bookId);
    if (!data.value || (textbookCatalog.some(book => book.id === bookId) ? !isBookLoaded(data.value, bookId) : !data.value.books.some(book => book.id === bookId))) throw new Error("词书尚未完整加载");
    data.value = await defaultTextbooks.selectBook(bookId);
    const selected = textbookCatalog.find((book) => book.id === bookId);
    bookFeedback.value = `已切换到${selected ? fullBookTitle(selected) : "所选词书"}。`;
  } catch {
    bookErrors.value = { ...bookErrors.value, [bookId]: "切换失败，词书尚未切换。" };
  } finally {
    loadingBook.value = "";
  }
}

function studyLesson(lessonId: string) {
  if (loading.value || loadingBook.value) return;
  const exerciseQuery = selectedExercise.value === "auto" ? "" : `&exercise=${encodeURIComponent(selectedExercise.value)}`;
  uni.navigateTo({
    url: `/pages/study/study?lessonId=${encodeURIComponent(lessonId)}${exerciseQuery}`,
  });
}

async function setDailyPace(value: DailyPace) {
  const bookId = currentBookId.value;
  if (!bookId || dailyPlanBusy.value || miniStudyPlanPreference.getPace(bookId) === value) return;
  planSaving.value = true;
  planNotice.value = "";
  try {
    await miniStudyPlanPreference.setPace(bookId, value);
    bookFeedback.value = "每日学习节奏已保存。";
  } catch {
    planNotice.value = "每日学习节奏保存失败，请重试。";
  } finally {
    planSaving.value = false;
  }
}

function startDailyPlan() {
  const plan = dailyPlan.value;
  const bookId = currentBookId.value;
  if (!plan || !bookId || dailyPlanBusy.value || plan.remaining <= 0) return;
  const exerciseQuery = selectedExercise.value === "auto" ? "" : `&exercise=${encodeURIComponent(selectedExercise.value)}`;
  uni.navigateTo({
    url: `/pages/study/study?dailyBookId=${encodeURIComponent(bookId)}${exerciseQuery}`,
  });
}

function openLists() {
  uni.navigateTo({ url: "/pages/lists/lists" });
}
function openPersonal(bookId?: string) { uni.navigateTo({ url: `/pages/personal/personal${bookId ? `?bookId=${encodeURIComponent(bookId)}` : ""}` }); }
function openConjugation() { uni.navigateTo({ url: "/pages/conjugation/conjugation" }); }
function selectExercise(value: MiniStudyPreference) {
  selectedExercise.value = value;
  bookFeedback.value = `练习方式已切换为${selectedExerciseLabel.value}。`;
}

onShow(() => {
  void Promise.all([refresh(), loadPlanPreference()]);
});
</script>

<template>
  <MiniPage class="books-page">
    <MiniHeader kicker="LIBRARY / 教材与 JLPT" title="我的词书" description="从一课开始，让每个词慢慢熟悉起来。选择教材后下载，再开始学习课次。" />

    <view class="top-actions card motion-enter">
      <button class="secondary-btn list-link" @tap="openLists">打开生词本</button>
      <text class="panel-topline exercise-caption">选择练习方式</text>
      <view class="exercise-picker">
        <text class="picker-label">练习：</text>
        <button
          v-for="exercise in exercises"
          :key="exercise.id"
          class="exercise-btn"
          :class="{ selected: selectedExercise === exercise.id }"
          :aria-label="`${exercise.label}${selectedExercise === exercise.id ? '，已选中' : ''}`"
          @tap="selectExercise(exercise.id)"
        >{{ exercise.label }}</button>
      </view>
      <view class="category-picker" role="group" aria-label="词书分类">
        <button
          v-for="category in categories"
          :key="category.id"
          class="category-btn"
          :class="{ selected: selectedCategory === category.id }"
          :aria-pressed="selectedCategory === category.id"
          @tap="selectedCategory = category.id"
        >{{ category.label }} · {{ bookCount(category.id) }}</button>
      </view>
    </view>

    <MiniNotice :message="bookFeedback" tone="success" />
    <button class="card personal-entry" @tap="openPersonal()"><text class="personal-plus">＋</text><view><text class="activity-entry-title">带上你的词书</text><text class="activity-entry-copy">新建词书，或导入 CSV / JSON</text></view><text aria-hidden="true">→</text></button>
    <MiniNotice :message="planNotice" tone="error" />
    <button v-if="planNotice && !miniStudyPlanPreference.state.ready" class="secondary-btn" :disabled="planLoading" @tap="loadPlanPreference">重新读取每日计划</button>
    <view class="card activity-entry motion-enter"><view><text class="activity-entry-title">动词活用</text><text class="activity-entry-copy">24 个常用动词，从ます形到ない形，一小轮练习。</text></view><button class="secondary-btn" @tap="openConjugation">开始活用练习</button></view>
    <MiniSkeleton v-if="loading" label="正在读取词书目录…" />
    <view v-else-if="loadError" class="card status-card">
      <text>{{ loadError }}</text>
      <button class="secondary-btn retry-btn" @tap="refresh">重新读取</button>
    </view>

    <view v-for="(book, bookIndex) in visibleBooks" :key="book.id" class="card book-item motion-enter" hover-class="book-item-pressed" :class="{ 'book-current': currentBookId === book.id }" :style="{ animationDelay: Math.min(bookIndex, 3) * 45 + 'ms' }">
      <view class="book-header">
        <MiniBookCover :book="book" />
        <view class="book-meta">
          <text class="title">{{ fullBookTitle(book) }}</text>
          <text class="desc">{{ book.description }}</text>
          <text class="count">{{ book.wordCount }} 词 · {{ book.lessons.length }} {{ bookCategory(book) === 'jlpt' ? '组' : '课' }}</text>
          <text v-if="currentBookId === book.id" class="current-book-label">✓ 当前词书</text>
        </view>
      </view>

      <view class="progress-section">
        <view class="progress-heading">
          <text class="progress-label">已学 {{ progressFor(book).learned }} / {{ progressFor(book).total }} 词</text>
          <text class="progress-percent">{{ progressFor(book).percent }}%</text>
        </view>
        <view class="progress-track" :aria-label="`${fullBookTitle(book)} 已学 ${progressFor(book).learned} / ${progressFor(book).total}`">
          <view class="progress-fill" :style="{ transform: `scaleX(${progressFor(book).percent / 100})` }" />
        </view>
        <text class="download-state">{{ loadedIds.has(book.id) ? "正文已下载，可离线学习" : "正文未下载，进度仍按目录统计" }}</text>
      </view>

      <text v-if="bookErrors[book.id]" class="error-text">{{ bookErrors[book.id] }}</text>
      <button
        v-if="!loadedIds.has(book.id)"
        class="primary-btn"
        :loading="loadingBook === book.id"
        :disabled="loading || !!loadingBook"
        @tap="download(book.id)"
      >{{ loadingBook === book.id ? "下载中…" : "下载词书" }}</button>
      <button
        v-else
        class="secondary-btn"
        :class="{ 'current-book-button': currentBookId === book.id }"
        :loading="loadingBook === book.id"
        :disabled="loading || !!loadingBook || currentBookId === book.id"
        @tap="selectBook(book.id)"
      >
        {{ loadingBook === book.id ? "切换中…" : currentBookId === book.id ? "正在使用" : "切换到这本词书" }}
      </button>

      <view v-if="loadedIds.has(book.id) && currentBookId === book.id" class="lesson-list">
        <button v-if="bookCategory(book) === 'custom'" class="secondary-btn edit-personal" @tap="openPersonal(book.id)">编辑词表与课次</button>
        <MiniDailyPlan
          v-if="dailyPlan && !planLoading && book.wordCount > 0"
          :plan="dailyPlan"
          :pace="dailyPace"
          :unit-label="bookCategory(book) === 'jlpt' ? '组' : '课'"
          :busy="dailyPlanBusy"
          @pace="setDailyPace"
          @daily="startDailyPlan"
        />
        <text v-if="!book.wordCount" class="empty-personal">这本词书还没有词汇，先添加几个词吧。</text>
        <view v-for="lesson in lessonsFor(book)" :key="lesson.id" class="lesson-item">
          <view class="lesson-heading">
            <text class="lesson-title">{{ lesson.title }}</text>
          </view>
          <button class="lesson-study-btn" :disabled="loading || !!loadingBook" @tap="studyLesson(lesson.id)">
            {{ bookCategory(book) === 'jlpt' ? '开始本组' : '开始本课' }} · {{ selectedExerciseLabel }}
          </button>
        </view>
      </view>
    </view>
  </MiniPage>
</template>

<style scoped>
.personal-entry { display: flex; width: 100%; gap: 20rpx; margin: 0 0 24rpx; padding: 28rpx; border: 1rpx dashed #a8bf9a !important; background: #f0f4e9 !important; text-align: left; color: var(--kotoba-green); }.personal-entry > view { flex: 1; }.personal-plus { font-size: 40rpx; }.edit-personal { width: 100%; margin-top: 24rpx; }.empty-personal { display: block; color: var(--kotoba-muted); font-size: 26rpx; margin: 24rpx 0; }
.activity-entry { display: flex; flex-direction: column; gap: 24rpx; padding: 32rpx; margin-bottom: 24rpx; }.activity-entry-title { display: block; color: var(--kotoba-green); font-size: 34rpx; font-weight: 700; }.activity-entry-copy { display: block; color: var(--kotoba-muted); font-size: 26rpx; line-height: 1.7; margin-top: 12rpx; }
.books-page { padding-bottom: calc(32rpx + env(safe-area-inset-bottom)); }
.books-page .card { background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); border-radius: 24rpx; box-shadow: 0 10rpx 28rpx rgba(35,57,46,.035); }
.books-page button { min-height: 96rpx; }
.section-header { margin-bottom: 24rpx; }
.section-title { display: block; font-size: 40rpx; font-weight: 700; color: var(--kotoba-ink); margin-bottom: 6rpx; }
.section-desc { font-size: 26rpx; color: var(--kotoba-muted); }
.status-card { text-align: center; padding: 36rpx; }
.retry-btn { margin-top: 20rpx; }
.top-actions { margin-bottom: 22rpx; }
.list-link { margin: 0; }
.exercise-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 8rpx; margin-top: 14rpx; }
.picker-label { font-size: 24rpx; color: var(--kotoba-muted); }
.book-item { margin-bottom: 28rpx; }
.book-item-pressed { transform: translateY(2rpx); }
.book-header { display: flex; align-items: flex-start; margin-bottom: 20rpx; gap: 16rpx; }
.book-meta { flex: 1; min-width: 0; }
.title, .desc, .count, .error-text, .lesson-title { overflow-wrap: anywhere; }
.title { display: block; font-size: 32rpx; font-weight: 700; color: var(--kotoba-ink); }
.desc, .count { display: block; font-size: 24rpx; color: var(--kotoba-muted); margin-top: 6rpx; }
.progress-section { margin: 18rpx 0 20rpx; }
.progress-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; margin-bottom: 10rpx; }
.progress-label, .download-state { color: var(--kotoba-muted); font-size: 24rpx; overflow-wrap: anywhere; }
.progress-percent { color: var(--kotoba-green); font-size: 24rpx; font-weight: 700; }
.progress-track { height: 16rpx; overflow: hidden; border-radius: 16rpx; background: #e1e6dc; }
.progress-fill { height: 100%; border-radius: inherit; background: var(--kotoba-green); }
.download-state { display: block; margin-top: 10rpx; color: var(--kotoba-muted); font-size: 22rpx; }
.error-text { display: block; color: #873c2c; font-size: 24rpx; margin-bottom: 12rpx; }
.lesson-list { margin-top: 24rpx; border-top: 1rpx solid var(--kotoba-line); }
.lesson-item { padding: 18rpx 0; border-bottom: 1rpx solid var(--kotoba-line); }
.lesson-heading { display: flex; align-items: center; gap: 14rpx; margin-bottom: 12rpx; flex-wrap: wrap; }
.lesson-order { font-size: 24rpx; color: var(--kotoba-green); font-weight: 600; }
.lesson-title { font-size: 28rpx; color: var(--kotoba-ink); flex: 1; min-width: 240rpx; }
.exercise-btn, .lesson-study-btn { margin: 0; padding: 0 16rpx; min-height: 96rpx; line-height: 1.35; font-size: 22rpx; color: var(--kotoba-green); background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); border-radius: 8rpx; }
.exercise-btn { min-height: 96rpx; }
.exercise-btn.selected { background: #e4eedf; border-color: var(--kotoba-green); font-weight: 700; }
.category-picker { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 20rpx; }
.category-btn { min-height: 68rpx !important; margin: 0; padding: 8rpx 22rpx; border: 1rpx solid var(--kotoba-line); border-radius: 999rpx; background: #fffcf5; color: var(--kotoba-muted); font-size: 23rpx; transition: background-color 180ms ease, border-color 180ms ease, transform 160ms ease; }
.category-btn.selected { background: #e4eedf; border-color: var(--kotoba-green); color: var(--kotoba-green); font-weight: 700; }
.lesson-study-btn { width: 100%; font-size: 24rpx; background: var(--kotoba-green); border-color: var(--kotoba-green); color: #fff; font-weight: 600; }
.top-actions { padding: 26rpx; }
.list-link { justify-content: space-between; background: #f2f6ec; border-color: #dbe6d1; font-size: 26rpx; }
.exercise-caption { margin: 24rpx 0 12rpx; letter-spacing: 1rpx; }
.exercise-picker { gap: 12rpx; margin: 0; }
.picker-label { display: none; }
.exercise-btn { flex: 1 1 28%; min-width: 140rpx; min-height: 88rpx !important; padding: 12rpx 14rpx; border-radius: 16rpx; font-size: 24rpx; transition: background-color 180ms ease, border-color 180ms ease, transform 160ms ease; }
.book-item { padding: 28rpx; border-radius: 28rpx !important; }
.book-current { border-color: #a2bb97 !important; box-shadow: 0 10rpx 30rpx rgba(49,89,68,.08) !important; }
.book-header { gap: 24rpx; }
.title { font-size: 32rpx; line-height: 1.4; }
.desc { font-size: 23rpx; line-height: 1.6; }
.current-book-label { display: inline-block; margin-top: 10rpx; color: var(--kotoba-green); font-size: 23rpx; font-weight: 600; }
.progress-track { height: 10rpx; }
.progress-fill { width: 100%; transform-origin: left center; transition: transform 400ms cubic-bezier(.2,.8,.2,1); }
.current-book-button[disabled] { background: #edf3e7; border-color: #c8d9bf; color: var(--kotoba-green); opacity: 1; }
.lesson-list { padding-top: 8rpx; }
.lesson-item { padding: 24rpx 0; }
.lesson-order { font-size: 23rpx; padding: 6rpx 12rpx; border-radius: 8rpx; background: #edf3e7; }
.lesson-study-btn { min-height: 88rpx !important; border-radius: 14rpx; }
</style>
