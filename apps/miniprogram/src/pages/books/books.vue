<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import type { Data, Lesson } from "@jp/models";
import { defaultTextbooks, isBookLoaded, textbookCatalog } from "../../services/textbooks";

type CatalogBook = (typeof textbookCatalog)[number];

const data = ref<Data | null>(null);
const loading = ref(false);
const loadingBook = ref("");
const loadError = ref("");
const bookErrors = ref<Record<string, string>>({});
const selectedExercise = ref("card");

const exercises = [
  { id: "card", label: "卡片" },
  { id: "kana-meaning", label: "假名→释义" },
  { id: "kanji-reading", label: "汉字→读音" },
  { id: "audio-meaning", label: "听音→释义" },
  { id: "mixed", label: "混合" },
] as const;

const books = computed(() => textbookCatalog);
const currentBookId = computed(() => data.value?.currentBookId || "");
const loadedIds = computed(() => {
  const snapshot = data.value;
  return new Set(books.value.filter((book) => snapshot && isBookLoaded(snapshot, book.id)).map((book) => book.id));
});
const selectedExerciseLabel = computed(() => exercises.find((item) => item.id === selectedExercise.value)?.label || "卡片");

function lessonsFor(book: CatalogBook): Array<Lesson | CatalogBook["lessons"][number]> {
  const loaded = data.value?.lessons.filter((lesson) => lesson.bookId === book.id) || [];
  return loaded.length ? loaded : book.lessons;
}

async function refresh() {
  loading.value = true;
  loadError.value = "";
  try {
    data.value = await defaultTextbooks.hydrate();
  } catch {
    loadError.value = "词书目录暂时无法读取，请重试。原有记录未被覆盖。";
  } finally {
    loading.value = false;
  }
}

async function download(bookId: string) {
  if (loadingBook.value) return;
  loadingBook.value = bookId;
  bookErrors.value = { ...bookErrors.value, [bookId]: "" };
  try {
    data.value = await defaultTextbooks.ensureBookLoaded(bookId);
  } catch {
    bookErrors.value = { ...bookErrors.value, [bookId]: "下载失败，词书尚未切换。" };
  } finally {
    loadingBook.value = "";
  }
}

async function selectBook(bookId: string) {
  if (loadingBook.value) return;
  loadingBook.value = bookId;
  bookErrors.value = { ...bookErrors.value, [bookId]: "" };
  try {
    if (!loadedIds.value.has(bookId)) data.value = await defaultTextbooks.ensureBookLoaded(bookId);
    if (!data.value || !isBookLoaded(data.value, bookId)) throw new Error("词书尚未完整加载");
    data.value = await defaultTextbooks.selectBook(bookId);
  } catch {
    bookErrors.value = { ...bookErrors.value, [bookId]: "切换失败，词书尚未切换。" };
  } finally {
    loadingBook.value = "";
  }
}

function studyLesson(lessonId: string) {
  uni.navigateTo({
    url: `/pages/study/study?lessonId=${encodeURIComponent(lessonId)}&exercise=${encodeURIComponent(selectedExercise.value)}`,
  });
}

function openLists() {
  uni.navigateTo({ url: "/pages/lists/lists" });
}

onShow(() => {
  void refresh();
});
</script>

<template>
  <view class="container">
    <view class="section-header">
      <text class="section-title">我的词书</text>
      <text class="section-desc">选择教材后下载，再开始学习课次</text>
    </view>

    <view class="top-actions">
      <button class="secondary-btn list-link" @tap="openLists">打开生词本</button>
      <view class="exercise-picker">
        <text class="picker-label">练习：</text>
        <button
          v-for="exercise in exercises"
          :key="exercise.id"
          class="exercise-btn"
          :class="{ selected: selectedExercise === exercise.id }"
          @tap="selectedExercise = exercise.id"
        >{{ exercise.label }}</button>
      </view>
    </view>

    <view v-if="loading" class="card status-card"><text>正在读取词书目录…</text></view>
    <view v-else-if="loadError" class="card status-card">
      <text>{{ loadError }}</text>
      <button class="secondary-btn retry-btn" @tap="refresh">重新读取</button>
    </view>

    <view v-for="book in books" :key="book.id" class="card book-item">
      <view class="book-header">
        <view class="book-badge"><text class="badge-text">日语</text></view>
        <view class="book-meta">
          <text class="title">{{ book.title }}</text>
          <text class="desc">{{ book.description }}</text>
          <text class="count">{{ book.wordCount }} 词 · {{ book.lessons.length }} 课</text>
        </view>
      </view>

      <text v-if="bookErrors[book.id]" class="error-text">{{ bookErrors[book.id] }}</text>
      <button
        v-if="!loadedIds.has(book.id)"
        class="primary-btn"
        :loading="loadingBook === book.id"
        :disabled="!!loadingBook"
        @tap="download(book.id)"
      >{{ loadingBook === book.id ? "下载中…" : "下载词书" }}</button>
      <button v-else class="secondary-btn" :disabled="!!loadingBook" @tap="selectBook(book.id)">
        {{ currentBookId === book.id ? "正在使用" : "切换到这本词书" }}
      </button>

      <view v-if="loadedIds.has(book.id) && currentBookId === book.id" class="lesson-list">
        <view v-for="lesson in lessonsFor(book)" :key="lesson.id" class="lesson-item">
          <view class="lesson-heading">
            <text class="lesson-order">第 {{ lesson.order }} 课</text>
            <text class="lesson-title">{{ lesson.title }}</text>
          </view>
          <button class="lesson-study-btn" @tap="studyLesson(lesson.id)">
            开始本课 · {{ selectedExerciseLabel }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.section-header { margin-bottom: 24rpx; }
.section-title { display: block; font-size: 40rpx; font-weight: 700; color: #111827; margin-bottom: 6rpx; }
.section-desc { font-size: 26rpx; color: #6B7280; }
.status-card { text-align: center; padding: 36rpx; }
.retry-btn { margin-top: 20rpx; }
.top-actions { margin-bottom: 22rpx; }
.list-link { margin: 0; }
.exercise-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 8rpx; margin-top: 14rpx; }
.picker-label { font-size: 24rpx; color: #6B7280; }
.book-item { margin-bottom: 28rpx; }
.book-header { display: flex; align-items: flex-start; margin-bottom: 20rpx; }
.book-badge { background: #D9532F; color: #FFF; padding: 16rpx 20rpx; border-radius: 12rpx; margin-right: 20rpx; }
.badge-text { font-size: 24rpx; font-weight: 700; }
.book-meta { flex: 1; min-width: 0; }
.title, .desc, .count, .error-text, .lesson-title { overflow-wrap: anywhere; }
.title { display: block; font-size: 32rpx; font-weight: 700; color: #111827; }
.desc, .count { display: block; font-size: 24rpx; color: #6B7280; margin-top: 6rpx; }
.error-text { display: block; color: #B91C1C; font-size: 24rpx; margin-bottom: 12rpx; }
.lesson-list { margin-top: 24rpx; border-top: 1rpx solid #F3F4F6; }
.lesson-item { padding: 18rpx 0; border-bottom: 1rpx solid #F3F4F6; }
.lesson-heading { display: flex; align-items: center; gap: 14rpx; margin-bottom: 12rpx; flex-wrap: wrap; }
.lesson-order { font-size: 24rpx; color: #D9532F; font-weight: 600; }
.lesson-title { font-size: 28rpx; color: #1F2937; flex: 1; min-width: 240rpx; }
.exercise-btn, .lesson-study-btn { margin: 0; padding: 0 16rpx; min-height: 96rpx; line-height: 1.35; font-size: 22rpx; color: #365D49; background: #F7F8F4; border: 1rpx solid #DFE5DB; border-radius: 8rpx; }
.exercise-btn { min-height: 96rpx; }
.exercise-btn.selected { background: #DCEBDD; border-color: #365D49; }
.lesson-study-btn { width: 100%; font-size: 24rpx; }
</style>
