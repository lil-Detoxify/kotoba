<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import type { Data, Word } from "@jp/models";
import { defaultTextbooks, textbookCatalog } from "../../services/textbooks";
import { setDifficult, setIgnored } from "../../services/word-flags";

const data = ref<Data | null>(null);
const loading = ref(false);
const error = ref("");
const saving = ref("");
const listMode = ref<"difficult" | "ignored">("difficult");
const visibleLimit = ref(30);
let refreshToken = 0;
const difficultWords = computed(() => {
  const snapshot = data.value;
  if (!snapshot) return [];
  return snapshot.words.filter((word) => snapshot.states.some((state) => state.wordId === word.id && (listMode.value === "ignored"
    ? state.isIgnored
    : state.isDifficult && !state.isIgnored)));
});

function lessonLabel(word: Word) {
  return data.value?.lessons.find((lesson) => lesson.id === word.lessonId)?.title || "";
}

async function refresh() {
  const token = ++refreshToken;
  loading.value = true;
  error.value = "";
  try {
    let snapshot = await defaultTextbooks.hydrate();
    if (listMode.value === "difficult") {
      snapshot = await defaultTextbooks.prepareStudy(undefined, "difficult");
    } else {
      const ignoredStates = snapshot.states.filter((state) => state.isIgnored);
      const bookIds = new Set(ignoredStates.map((state) => state.bookId
        || textbookCatalog.find((book) => state.wordId.startsWith(`${book.id}-w-`))?.id).filter((id): id is string => !!id));
      for (const bookId of bookIds) snapshot = await defaultTextbooks.ensureBookLoaded(bookId);
    }
    if (token !== refreshToken) return;
    data.value = snapshot;
    visibleLimit.value = 30;
  } catch {
    if (token === refreshToken) error.value = listMode.value === "ignored" ? "已忽略列表暂时无法读取，请重试。" : "生词本暂时无法读取，请重试。";
  } finally {
    if (token === refreshToken) loading.value = false;
  }
}

function selectList(mode: "difficult" | "ignored") {
  if (mode === listMode.value) return;
  listMode.value = mode;
  void refresh();
}

async function remove(wordId: string) {
  if (saving.value) return;
  saving.value = wordId;
  try {
    data.value = listMode.value === "ignored"
      ? await setIgnored(wordId, false)
      : await setDifficult(wordId, false);
  } catch {
    error.value = listMode.value === "ignored" ? "恢复学习失败，请重试。" : "取消标记失败，请重试。";
  } finally {
    saving.value = "";
  }
}

function studyDifficult() {
  uni.navigateTo({ url: "/pages/study/study?mode=difficult" });
}

function showMore() {
  visibleLimit.value += 30;
}

onShow(() => {
  void refresh();
});
</script>

<template>
  <view class="container lists-page">
    <view class="section-header">
      <text class="section-title">{{ listMode === "ignored" ? "已忽略" : "生词本" }}</text>
      <text class="section-desc">{{ listMode === "ignored" ? "暂时跳过的词，可以随时恢复学习" : "把值得多见几次的词留在这里" }}</text>
    </view>
    <view class="list-tabs">
      <button class="secondary-btn tab-btn" :class="{ selected: listMode === 'difficult' }" @tap="selectList('difficult')">生词本</button>
      <button class="secondary-btn tab-btn" :class="{ selected: listMode === 'ignored' }" @tap="selectList('ignored')">已忽略</button>
    </view>
    <view v-if="loading" class="card status-card">
      <text>正在读取生词…</text>
    </view>
    <view v-else-if="error" class="card status-card">
      <text>{{ error }}</text>
      <button class="secondary-btn" @tap="refresh">重新读取</button>
    </view>
    <view v-else-if="!difficultWords.length" class="card status-card">
      <text>{{ listMode === "ignored" ? "没有已忽略的单词。" : "还没有标记生词。" }}</text>
      <text class="hint">{{ listMode === "ignored" ? "学习时忽略的词会出现在这里。" : "学习时标记困难的词，它们会出现在这里。" }}</text>
    </view>
    <template v-else>
      <view class="toolbar">
        <text>{{ difficultWords.length }} 个词</text>
        <button class="primary-btn study-btn" @tap="studyDifficult">开始巩固</button>
      </view>
      <view v-for="word in difficultWords.slice(0, visibleLimit)" :key="word.id" class="card word-card">
        <view class="word-info">
          <text class="word-term">{{ word.term }}</text>
          <text class="word-reading">{{ word.reading }}</text>
          <text class="word-meaning">{{ word.meaning }}</text>
          <text class="lesson-label">{{ lessonLabel(word) }}</text>
        </view>
        <button
          class="secondary-btn remove-btn"
          :loading="saving === word.id"
          :disabled="!!saving"
          @tap="remove(word.id)"
        >{{ listMode === "ignored" ? "恢复学习" : "取消标记" }}</button>
      </view>
      <button
        v-if="visibleLimit < difficultWords.length"
        class="secondary-btn more-btn"
        @tap="showMore"
      >显示更多（{{ difficultWords.length - visibleLimit }}）</button>
    </template>
  </view>
</template>

<style scoped>
.lists-page { padding-bottom: calc(32rpx + env(safe-area-inset-bottom)); }
.section-header { margin-bottom: 24rpx; }
.section-title { display: block; margin-bottom: 6rpx; color: #111827; font-size: 40rpx; font-weight: 700; }
.section-desc { color: #6B7280; font-size: 26rpx; }
.list-tabs { display: flex; gap: 16rpx; margin-bottom: 20rpx; }
.tab-btn { flex: 1; min-height: 88rpx; margin: 0; }
.tab-btn.selected { border-color: #365D49; background: #EAF0EA; color: #365D49; font-weight: 700; }
.status-card { padding: 44rpx 32rpx; text-align: center; }
.hint { display: block; margin-top: 12rpx; color: #9CA3AF; font-size: 24rpx; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; color: #6B7280; font-size: 25rpx; }
.study-btn { min-height: 96rpx; margin: 0; padding: 0 24rpx; }
.word-card { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; padding: 24rpx; }
.word-info { display: flex; min-width: 0; flex-direction: column; gap: 8rpx; overflow-wrap: anywhere; }
.word-term { color: #273C35; font-size: 34rpx; font-weight: 700; }
.word-reading { color: #365D49; font-size: 25rpx; }
.word-meaning { color: #4B5563; font-size: 27rpx; }
.lesson-label { color: #9CA3AF; font-size: 22rpx; }
.remove-btn { min-height: 96rpx; margin-left: 16rpx; padding: 0 14rpx; flex-shrink: 0; font-size: 22rpx; }
.more-btn { display: block; min-height: 96rpx; margin: 20rpx auto; }
</style>
