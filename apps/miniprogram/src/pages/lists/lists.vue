<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import type { Data, Word } from "@jp/models";
import { defaultTextbooks } from "../../services/textbooks";
import { setDifficult } from "../../services/word-flags";

const data = ref<Data | null>(null);
const loading = ref(false);
const error = ref("");
const saving = ref("");
const visibleLimit = ref(30);
const difficultWords = computed(() => {
  const snapshot = data.value;
  if (!snapshot) return [];
  return snapshot.words.filter((word) => snapshot.states.some((state) => state.wordId === word.id && state.isDifficult && !state.isIgnored));
});

function lessonLabel(word: Word) {
  return data.value?.lessons.find((lesson) => lesson.id === word.lessonId)?.title || "";
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    data.value = await defaultTextbooks.prepareStudy(undefined, "difficult");
    visibleLimit.value = 30;
  } catch {
    error.value = "生词本暂时无法读取，请重试。";
  } finally {
    loading.value = false;
  }
}

async function remove(wordId: string) {
  if (saving.value) return;
  saving.value = wordId;
  try {
    data.value = await setDifficult(wordId, false);
  } catch {
    error.value = "取消标记失败，请重试。";
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
  <view class="container">
    <view class="section-header">
      <text class="section-title">生词本</text>
      <text class="section-desc">把值得多见几次的词留在这里</text>
    </view>
    <view v-if="loading" class="card status-card">
      <text>正在读取生词…</text>
    </view>
    <view v-else-if="error" class="card status-card">
      <text>{{ error }}</text>
      <button class="secondary-btn" @tap="refresh">重新读取</button>
    </view>
    <view v-else-if="!difficultWords.length" class="card status-card">
      <text>还没有标记生词。</text>
      <text class="hint">学习时标记困难的词，它们会出现在这里。</text>
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
        >取消标记</button>
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
.section-header { margin-bottom: 24rpx; }
.section-title { display: block; margin-bottom: 6rpx; color: #111827; font-size: 40rpx; font-weight: 700; }
.section-desc { color: #6B7280; font-size: 26rpx; }
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
