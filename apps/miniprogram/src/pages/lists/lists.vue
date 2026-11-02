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
import MiniPersonalReadingContexts, { type MiniPersonalReadingContextEntry } from "../../components/MiniPersonalReadingContexts.vue";
import MiniMeaningText from "../../components/MiniMeaningText.vue";
import MiniWordAudio from "../../components/MiniWordAudio.vue";
import type { Data, Word } from "@jp/models";
import { defaultTextbooks, textbookCatalog } from "../../services/textbooks";
import { setDifficult, setIgnored } from "../../services/word-flags";
import { miniPersonalClozeExampleFor } from "../../services/personal-reading-practice";
useMiniPageActivity();

const data = ref<Data | null>(null);
const loading = ref(false);
const error = ref("");
const saving = ref("");
const feedback = ref("");
type ListMode = "difficult" | "ignored" | "sentences";
const listMode = ref<ListMode>("difficult");
const selectedBook = ref("");
const selectedLesson = ref("");
const visibleLimit = ref(30);
let refreshToken = 0;
const baseWords = computed(() => {
  const snapshot = data.value;
  if (!snapshot) return [];
  return snapshot.words.filter((word) => listMode.value === "sentences" ? !!word.readingContexts?.length : snapshot.states.some((state) => state.wordId === word.id && (listMode.value === "ignored"
    ? state.isIgnored
    : state.isDifficult && !state.isIgnored)));
});
const bookOptions = computed(() => [{ id: "", title: "全部词书" }, ...(data.value?.books.filter(book => baseWords.value.some(word => data.value?.lessons.some(lesson => lesson.id === word.lessonId && lesson.bookId === book.id))) || [])]);
const lessonOptions = computed(() => [{ id: "", title: "全部课次" }, ...(data.value?.lessons.filter(lesson => (!selectedBook.value || lesson.bookId === selectedBook.value) && baseWords.value.some(word => word.lessonId === lesson.id)) || [])]);
const difficultWords = computed(() => baseWords.value.filter(word => (!selectedLesson.value || word.lessonId === selectedLesson.value)
  && (!selectedBook.value || data.value?.lessons.some(lesson => lesson.id === word.lessonId && lesson.bookId === selectedBook.value))));
const personalContextEntries = computed<MiniPersonalReadingContextEntry[]>(() => {
  const snapshot = data.value;
  if (!snapshot || listMode.value !== "sentences") return [];
  return baseWords.value
    .filter(word => (!selectedLesson.value || word.lessonId === selectedLesson.value)
      && (!selectedBook.value || snapshot.lessons.some(lesson => lesson.id === word.lessonId && lesson.bookId === selectedBook.value)))
    .flatMap(word => {
      const lesson = snapshot.lessons.find(item => item.id === word.lessonId);
      const book = snapshot.books.find(item => item.id === lesson?.bookId);
      const bookTitle = book?.title || textbookCatalog.find(item => item.id === lesson?.bookId)?.title || "我的词条";
      const ignored = !!snapshot.states.find(state => state.wordId === word.id)?.isIgnored;
      return (word.readingContexts || []).map(context => ({
        word,
        context,
        bookTitle,
        lessonTitle: lesson?.title || "",
        ignored,
        canPractice: !!miniPersonalClozeExampleFor(word, context.id),
      }));
    })
    .sort((left, right) => (Date.parse(right.context.updatedAt) || 0) - (Date.parse(left.context.updatedAt) || 0));
});
const visibleItemCount = computed(() => listMode.value === "sentences" ? personalContextEntries.value.length : difficultWords.value.length);
function pickerValue(event: unknown): number {
  return Number((event as { detail?: { value?: unknown } })?.detail?.value);
}
function chooseBook(event: unknown) {
  const option = bookOptions.value[pickerValue(event)];
  if (option) { selectedBook.value = option.id; selectedLesson.value = ""; visibleLimit.value = 30; }
}
function chooseLesson(event: unknown) {
  const option = lessonOptions.value[pickerValue(event)];
  if (option) { selectedLesson.value = option.id; visibleLimit.value = 30; }
}

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
    } else if (listMode.value === "ignored") {
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

function selectList(mode: ListMode) {
  if (mode === listMode.value) return;
  feedback.value = "";
  listMode.value = mode;
  selectedBook.value = ""; selectedLesson.value = "";
  void refresh();
}

async function remove(wordId: string) {
  if (saving.value) return;
  saving.value = wordId;
  feedback.value = "";
  try {
    data.value = listMode.value === "ignored"
      ? await setIgnored(wordId, false)
      : await setDifficult(wordId, false);
    feedback.value = listMode.value === "ignored" ? "已恢复学习，这个词会重新参与学习与复习。" : "已取消困难标记，原有学习记录保留。";
  } catch {
    error.value = listMode.value === "ignored" ? "恢复学习失败，请重试。" : "取消标记失败，请重试。";
  } finally {
    saving.value = "";
  }
}

function studyDifficult() {
  const scope = selectedLesson.value ? `&lessonId=${encodeURIComponent(selectedLesson.value)}` : selectedBook.value ? `&scopeBookId=${encodeURIComponent(selectedBook.value)}` : "";
  uni.navigateTo({ url: `/pages/study/study?mode=difficult${scope}` });
}

function practiceReadingContext(entry: MiniPersonalReadingContextEntry) {
  const readingContextIds = encodeURIComponent(JSON.stringify({ [entry.word.id]: entry.context.id }));
  const exercise = entry.canPractice ? "cloze" : "card";
  uni.navigateTo({ url: `/pages/study/study?mode=difficult&exercise=${exercise}&readingContextIds=${readingContextIds}` });
}

function showMore() {
  visibleLimit.value += 30;
}

onShow(() => {
  void refresh();
});
</script>

<template>
  <MiniPage class="lists-page">
    <MiniHeader kicker="COLLECTION / 留住日语里的小片刻" :title="listMode === 'sentences' ? '我的原句' : listMode === 'ignored' ? '已忽略' : '生词本'" :description="listMode === 'sentences' ? '把阅读时遇见的句子，留在熟悉的词旁。' : listMode === 'ignored' ? '暂时跳过的词，可以随时恢复学习。' : '把值得多见几次的词留在这里，按自己的节奏慢慢巩固。'" />
    <view class="list-tabs">
      <button class="secondary-btn tab-btn" :class="{ selected: listMode === 'difficult' }" @tap="selectList('difficult')">生词本</button>
      <button class="secondary-btn tab-btn" :class="{ selected: listMode === 'ignored' }" @tap="selectList('ignored')">已忽略</button>
      <button class="secondary-btn tab-btn" :class="{ selected: listMode === 'sentences' }" @tap="selectList('sentences')">我的原句</button>
    </view>
    <view v-if="!loading && data" class="list-filters">
      <picker :range="bookOptions" range-key="title" :value="Math.max(0, bookOptions.findIndex(book => book.id === selectedBook))" @change="chooseBook"><view class="filter-value">{{ bookOptions.find(book => book.id === selectedBook)?.title || '全部词书' }} ▾</view></picker>
      <picker :range="lessonOptions" range-key="title" :value="Math.max(0, lessonOptions.findIndex(lesson => lesson.id === selectedLesson))" @change="chooseLesson"><view class="filter-value">{{ lessonOptions.find(lesson => lesson.id === selectedLesson)?.title || '全部课次' }} ▾</view></picker>
    </view>
    <MiniNotice :message="feedback" tone="success" />
    <MiniSkeleton v-if="loading" label="正在读取生词…" />
    <view v-else-if="error" class="card status-card">
      <text>{{ error }}</text>
      <button class="secondary-btn" @tap="refresh">重新读取</button>
    </view>
    <view v-else-if="!visibleItemCount" class="card status-card">
      <view class="empty-collection" aria-hidden="true"><text>言</text></view>
      <text>{{ listMode === 'sentences' ? '这里还没有收藏的原句。' : listMode === "ignored" ? "没有已忽略的单词。" : "还没有标记生词。" }}</text>
      <text class="hint">{{ selectedBook || selectedLesson ? '可以换一个筛选范围再看看。' : listMode === 'sentences' ? '在词卡或查词结果中打开“我的原句”，收藏你遇见的句子。' : listMode === "ignored" ? "学习时忽略的词会出现在这里。" : "学习时标记困难的词，它们会出现在这里。" }}</text>
    </view>
    <template v-else>
      <view class="toolbar">
        <text>{{ listMode === 'sentences' ? `${personalContextEntries.length} 条原句` : `${difficultWords.length} 个词` }}</text>
        <button v-if="listMode === 'difficult'" class="primary-btn study-btn" @tap="studyDifficult">开始巩固</button>
      </view>
      <MiniPersonalReadingContexts
        v-if="listMode === 'sentences'"
        :entries="personalContextEntries.slice(0, visibleLimit)"
        :voice="data?.userSettings?.preferences?.pronunciationVoice === 'male' ? 'male' : 'female'"
        @practice="practiceReadingContext"
      />
      <template v-else>
        <view v-for="word in difficultWords.slice(0, visibleLimit)" :key="word.id" class="card word-card motion-enter">
          <view class="word-info">
            <text class="word-term">{{ word.term }}</text>
            <text class="word-reading">{{ word.reading }}</text>
            <MiniMeaningText class="word-meaning" :word="word" />
            <text class="lesson-label">{{ lessonLabel(word) }}</text>
            <MiniWordAudio :word="word" :voice="data?.userSettings?.preferences?.pronunciationVoice === 'male' ? 'male' : 'female'" />
          </view>
          <button
            class="secondary-btn remove-btn"
            :loading="saving === word.id"
            :disabled="!!saving"
            @tap="remove(word.id)"
          >{{ listMode === "ignored" ? "恢复学习" : "取消标记" }}</button>
        </view>
      </template>
      <button
        v-if="visibleLimit < visibleItemCount"
        class="secondary-btn more-btn"
        @tap="showMore"
      >显示更多（{{ visibleItemCount - visibleLimit }}）</button>
    </template>
  </MiniPage>
</template>

<style scoped>
.list-filters { display: flex; flex-wrap: wrap; gap: 16rpx; margin-bottom: 24rpx; }.list-filters > picker { flex: 1; min-width: 240rpx; }.filter-value { min-height: 44px; padding: 16rpx; border: 1rpx solid var(--kotoba-line); border-radius: 12rpx; background: var(--kotoba-paper); color: var(--kotoba-green); font-size: 24rpx; overflow-wrap: anywhere; }
.word-card.with-contexts { flex-direction: column; align-items: stretch; }.with-contexts > .word-info { flex: auto; }
.lists-page { padding-bottom: calc(32rpx + env(safe-area-inset-bottom)); }
.section-header { margin-bottom: 24rpx; }
.section-title { display: block; margin-bottom: 6rpx; color: var(--kotoba-ink); font-size: 40rpx; font-weight: 700; }
.section-desc { color: var(--kotoba-muted); font-size: 26rpx; }
.list-tabs { display: flex; gap: 16rpx; margin-bottom: 20rpx; }
.tab-btn { flex: 1; min-height: 88rpx; margin: 0; }
.tab-btn.selected { border-color: var(--kotoba-green); background: #e4eedf; color: var(--kotoba-green); font-weight: 700; }
.status-card { padding: 44rpx 32rpx; text-align: center; }
.hint { display: block; margin-top: 12rpx; color: var(--kotoba-muted); font-size: 24rpx; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; color: var(--kotoba-muted); font-size: 25rpx; }
.study-btn { min-height: 96rpx; margin: 0; padding: 0 24rpx; }
.word-card { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; padding: 24rpx; }
.word-info { display: flex; min-width: 0; flex-direction: column; gap: 8rpx; overflow-wrap: anywhere; }
.word-term { color: var(--kotoba-ink); font-size: 34rpx; font-weight: 700; }
.word-reading { color: var(--kotoba-green); font-size: 25rpx; }
.word-meaning { color: var(--kotoba-muted); font-size: 27rpx; }
.lesson-label { color: var(--kotoba-muted); font-size: 22rpx; }
.remove-btn { min-height: 96rpx; margin-left: 16rpx; padding: 0 14rpx; flex-shrink: 0; font-size: 22rpx; }
.more-btn { display: block; min-height: 96rpx; margin: 20rpx auto; }
.list-tabs { gap: 8rpx; padding: 8rpx; border: 1rpx solid #dce6d4; border-radius: 20rpx; background: #eef3e8; }
.tab-btn { background: transparent; color: var(--kotoba-muted); border-color: transparent; border-radius: 14rpx; font-size: 26rpx; }
.tab-btn.selected { background: var(--kotoba-paper); border-color: #c3d5b8; box-shadow: 0 4rpx 12rpx rgba(49,89,68,.06); }
.word-card { gap: 18rpx; border-left: 5rpx solid #aac19b; border-radius: 24rpx; }
.word-info { flex: 1; }
.word-term { font-size: 38rpx; }
.remove-btn { min-width: 144rpx; min-height: 88rpx; padding: 12rpx; margin: 0; border-radius: 14rpx; background: #f4f7ef; font-size: 24rpx; }
.empty-collection { width: 100rpx; height: 112rpx; display: flex; align-items: center; justify-content: center; margin: 0 auto 26rpx; color: var(--kotoba-green); background: var(--kotoba-sage); border-radius: 28rpx 6rpx 28rpx 6rpx; font: 50rpx/1 "Songti SC", serif; }
.status-card { font-size: 29rpx; line-height: 1.7; }
.toolbar { padding: 16rpx 0; font-size: 26rpx; }
</style>
