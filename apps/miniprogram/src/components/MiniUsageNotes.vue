<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Word } from '@jp/models';
import { lessonBookId, loadBookLearningUsage, usageFor } from '../services/learning-usage';

const props = defineProps<{ word: Pick<Word, 'term' | 'reading' | 'lessonId' | 'meaning'> }>();

const usageRevision = ref(0);
const usage = computed(() => {
  usageRevision.value;
  return usageFor(props.word);
});
const contrast = computed(() => usage.value?.contrast);
const showReading = ref(false);
const showTranslation = ref(true);
const contrastExpanded = ref(false);
const loading = ref(false);
const loadFailed = ref(false);
let loadAttempt = 0;

async function loadUsage(attempt: number): Promise<void> {
  const bookId = lessonBookId(props.word.lessonId);
  if (!bookId) return;
  loading.value = true;
  loadFailed.value = false;
  try {
    const loaded = await loadBookLearningUsage(bookId);
    if (attempt !== loadAttempt) return;
    usageRevision.value += 1;
    loadFailed.value = !loaded;
  } catch {
    if (attempt === loadAttempt) loadFailed.value = true;
  } finally {
    if (attempt === loadAttempt) loading.value = false;
  }
}

function retryUsage(): void {
  void loadUsage(++loadAttempt);
}

watch(() => [props.word.term, props.word.reading, props.word.meaning, props.word.lessonId] as const, () => {
  showReading.value = false;
  showTranslation.value = true;
  contrastExpanded.value = false;
  loading.value = false;
  loadFailed.value = false;
  const attempt = ++loadAttempt;
  void loadUsage(attempt);
}, { immediate: true });
</script>

<template>
  <view v-if="usage || loading || loadFailed" class="mini-usage-notes" aria-label="词语用法" @tap.stop>
    <view v-if="loading && !usage" class="usage-status" aria-live="polite">正在加载用法资料…</view>
    <view v-else-if="loadFailed && !usage" class="usage-status usage-error" aria-live="polite">
      <text>用法资料暂不可用。</text>
      <button class="usage-retry" hover-class="usage-pressed" @tap="retryUsage">重试</button>
    </view>

    <template v-if="usage">
    <view class="usage-collocation">
      <text class="usage-label">常用搭配</text>
      <text class="usage-japanese" lang="ja">{{ usage.collocation.ja }}</text>
    </view>

    <view v-if="showReading && usage.collocation.reading" class="usage-detail">
      <text class="usage-detail-label">读音</text>
      <text class="usage-detail-value" lang="ja">{{ usage.collocation.reading }}</text>
    </view>
    <view v-if="showTranslation && usage.collocation.zh" class="usage-detail">
      <text class="usage-detail-label">译文</text>
      <text class="usage-detail-value">{{ usage.collocation.zh }}</text>
    </view>

    <text v-if="usage.tip" class="usage-tip">{{ usage.tip }}</text>

    <view class="usage-controls" aria-label="用法显示选项">
      <button
        class="usage-toggle"
        hover-class="usage-pressed"
        :aria-label="showReading ? '隐藏读音' : '显示读音'"
        :aria-pressed="showReading"
        @tap="showReading = !showReading"
      >{{ showReading ? '隐藏读音' : '显示读音' }}</button>
      <button
        class="usage-toggle"
        hover-class="usage-pressed"
        :aria-label="showTranslation ? '隐藏翻译' : '显示翻译'"
        :aria-pressed="showTranslation"
        @tap="showTranslation = !showTranslation"
      >{{ showTranslation ? '隐藏翻译' : '显示翻译' }}</button>
    </view>

    <view v-if="contrast" class="usage-contrast">
      <button
        class="contrast-toggle"
        hover-class="usage-pressed"
        :aria-label="`${contrastExpanded ? '收起' : '展开'}易混对照：${contrast.term}`"
        :aria-expanded="contrastExpanded"
        @tap="contrastExpanded = !contrastExpanded"
      >
        <text>易混对照 · {{ contrast.term }}</text>
        <text class="contrast-mark" aria-hidden="true">{{ contrastExpanded ? '－' : '＋' }}</text>
      </button>

      <view v-if="contrastExpanded" class="contrast-body">
        <view class="contrast-word">
          <text class="contrast-label">对照词</text>
          <text class="contrast-term" lang="ja">{{ contrast.term }}</text>
          <text v-if="showReading && contrast.reading" class="contrast-reading" lang="ja">{{ contrast.reading }}</text>
        </view>
        <text class="contrast-label">常用搭配</text>
        <text class="contrast-japanese" lang="ja">{{ contrast.collocation.ja }}</text>
        <text v-if="showReading && contrast.collocation.reading" class="contrast-detail" lang="ja">{{ contrast.collocation.reading }}</text>
        <text v-if="showTranslation && contrast.collocation.zh" class="contrast-detail">{{ contrast.collocation.zh }}</text>
        <text class="contrast-note">{{ contrast.note }}</text>
      </view>
    </view>
    </template>
  </view>
</template>

<style scoped>
.mini-usage-notes {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  margin-top: 20rpx;
  padding-left: 20rpx;
  border-left: 3rpx solid #b5c6a5;
  color: var(--kotoba-ink, #23392e);
}

.usage-label,
.usage-detail-label,
.contrast-label {
  color: var(--kotoba-muted, #56665b);
  font-size: 22rpx;
}

.usage-status {
  color: var(--kotoba-muted, #56665b);
  font-size: 23rpx;
  line-height: 1.6;
}

.usage-error { display: flex; align-items: center; gap: 12rpx; }

.usage-retry {
  min-height: 40px;
  margin: 0;
  padding: 6rpx 14rpx;
  border: 1rpx solid var(--kotoba-line, #d9e2d5);
  border-radius: 12rpx;
  color: var(--kotoba-green, #315944);
  background: var(--kotoba-paper, #fffefa);
  font-size: 22rpx;
  line-height: 1.4;
}

.usage-label,
.contrast-label { display: block; }

.usage-japanese {
  display: block;
  margin-top: 4rpx;
  font-size: 32rpx;
  font-weight: 600;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.usage-detail { margin-top: 8rpx; }
.usage-detail-label { margin-right: 12rpx; }
.usage-detail-value {
  color: var(--kotoba-ink, #23392e);
  font-size: 25rpx;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.usage-tip {
  display: block;
  margin-top: 14rpx;
  padding: 12rpx 16rpx;
  border-left: 4rpx solid #b5c6a5;
  border-radius: 0 12rpx 12rpx 0;
  color: var(--kotoba-muted, #56665b);
  background: #f6f8f1;
  font-size: 24rpx;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.usage-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.usage-toggle,
.contrast-toggle {
  min-height: 44px;
  margin: 0;
  padding: 8rpx 16rpx;
  border: 1rpx solid var(--kotoba-line, #d9e2d5);
  border-radius: 14rpx;
  color: var(--kotoba-green, #315944);
  background: var(--kotoba-paper, #fffefa);
  font-size: 24rpx;
  line-height: 1.5;
  text-align: left;
  white-space: normal;
}

.usage-toggle { flex: 1 1 220rpx; }
.usage-pressed { opacity: .78; }

.usage-contrast {
  margin-top: 12rpx;
  border-top: 1rpx solid #e6ecdf;
}

.contrast-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  border: 0;
  border-radius: 0;
  padding: 10rpx 2rpx;
  color: var(--kotoba-green, #315944);
  background: transparent;
}

.contrast-mark { flex: none; font-size: 26rpx; }

.contrast-body {
  padding: 4rpx 0 10rpx 14rpx;
  border-left: 2rpx solid #dbe5d4;
}

.contrast-word { margin-bottom: 10rpx; }
.contrast-term {
  display: inline-block;
  margin: 4rpx 12rpx 0 0;
  color: var(--kotoba-ink, #23392e);
  font-size: 29rpx;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.contrast-reading,
.contrast-detail,
.contrast-japanese,
.contrast-note {
  display: block;
  margin-top: 5rpx;
  color: var(--kotoba-muted, #56665b);
  font-size: 24rpx;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.contrast-japanese {
  color: var(--kotoba-ink, #23392e);
  font-size: 27rpx;
}

.contrast-note {
  margin-top: 10rpx;
  color: #64745f;
}
</style>
