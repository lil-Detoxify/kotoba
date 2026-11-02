<script setup lang="ts">
import type { ReadingContext, Word } from "@jp/models";
import MiniMeaningText from "./MiniMeaningText.vue";
import MiniSentenceAudio from "./MiniSentenceAudio.vue";

export interface MiniPersonalReadingContextEntry {
  word: Word;
  context: ReadingContext;
  bookTitle: string;
  lessonTitle: string;
  ignored: boolean;
  canPractice: boolean;
}

const props = withDefaults(defineProps<{
  entries: MiniPersonalReadingContextEntry[];
  voice?: "female" | "male";
  busy?: boolean;
}>(), { voice: "female", busy: false });

const emit = defineEmits<{
  practice: [entry: MiniPersonalReadingContextEntry];
}>();

function practice(entry: MiniPersonalReadingContextEntry) {
  if (props.busy || entry.ignored) return;
  emit("practice", entry);
}
</script>

<template>
  <view class="personal-context-list">
    <view v-for="entry in entries" :key="`${entry.word.id}:${entry.context.id}`" class="card personal-context-card">
      <view class="context-word-heading">
        <text class="word-term" lang="ja">{{ entry.word.term }}</text>
        <text class="word-reading" lang="ja">{{ entry.word.reading }}</text>
      </view>
      <MiniMeaningText class="word-meaning" :word="entry.word" />
      <text class="context-location">{{ entry.bookTitle }}<template v-if="entry.lessonTitle"> · {{ entry.lessonTitle }}</template></text>

      <text class="context-sentence" lang="ja">{{ entry.context.sentence }}</text>
      <MiniSentenceAudio :text="entry.context.sentence" :voice="voice" />
      <text v-if="entry.context.translation" class="context-translation">{{ entry.context.translation }}</text>
      <text class="context-source">
        {{ entry.context.sourceTitle || "来源未注明" }}<template v-if="entry.context.sourceUrl"> · {{ entry.context.sourceUrl }}</template>
      </text>

      <view class="context-actions">
        <text v-if="entry.ignored" class="practice-status">已忽略，恢复后可复习</text>
        <button
          v-else
          class="practice-button"
          hover-class="practice-pressed"
          :disabled="busy"
          @tap="practice(entry)"
        >{{ entry.canPractice ? "用此句填空" : "读句后用卡片复习" }}</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.personal-context-list { display: grid; min-width: 0; gap: 20rpx; }
.personal-context-card { min-width: 0; margin: 0; padding: 26rpx; border-left: 5rpx solid #aac19b; border-radius: 22rpx; }
.context-word-heading { display: flex; min-width: 0; flex-wrap: wrap; align-items: baseline; gap: 8rpx 14rpx; }
.word-term { color: var(--kotoba-ink); font-size: 36rpx; font-weight: 700; overflow-wrap: anywhere; }
.word-reading { color: var(--kotoba-green); font-size: 25rpx; overflow-wrap: anywhere; }
.word-meaning { display: block; margin-top: 6rpx; color: var(--kotoba-muted); font-size: 25rpx; line-height: 1.6; }
.context-location, .context-source { display: block; min-width: 0; margin-top: 8rpx; color: var(--kotoba-muted); font-size: 22rpx; line-height: 1.6; overflow-wrap: anywhere; }
.context-sentence { display: block; min-width: 0; margin-top: 18rpx; color: var(--kotoba-ink); font-family: "Songti SC", "Noto Serif CJK JP", serif; font-size: 32rpx; line-height: 1.8; overflow-wrap: anywhere; }
.context-translation { display: block; margin-top: 8rpx; color: var(--kotoba-muted); font-size: 25rpx; line-height: 1.7; overflow-wrap: anywhere; }
.context-actions { display: flex; min-height: 88rpx; align-items: center; margin-top: 14rpx; }
.practice-button { min-width: 220rpx; min-height: 48px; margin: 0; padding: 12rpx 24rpx; border: 1rpx solid var(--kotoba-green); border-radius: 14rpx; color: #fff; background: var(--kotoba-green); font-size: 25rpx; line-height: 1.5; }
.practice-button[disabled] { opacity: .65; }
.practice-status { color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.6; }
.practice-pressed { opacity: .8; }
</style>
