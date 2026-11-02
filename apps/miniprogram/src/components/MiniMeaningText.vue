<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Word } from '@jp/models';
import { meaningPresentation } from '../../../web/src/services/meaning-presentation';

const props = withDefaults(defineProps<{
  word: Pick<Word, 'lessonId' | 'meaning'>;
  expandable?: boolean;
}>(), {
  expandable: false,
});

const expanded = ref(false);
const presentation = computed(() => meaningPresentation(props.word));
const displayedMeaning = computed(() => props.expandable && expanded.value
  ? props.word.meaning
  : presentation.value.summary);

watch(() => [props.word.lessonId, props.word.meaning] as const, () => {
  expanded.value = false;
});
</script>

<template>
  <view class="mini-meaning-text">
    <text class="meaning-copy">{{ displayedMeaning }}</text>
    <button
      v-if="expandable && presentation.hasMore"
      class="meaning-toggle"
      hover-class="meaning-pressed"
      :aria-label="expanded ? '收起释义' : '展开完整释义'"
      :aria-expanded="expanded"
      @tap.stop="expanded = !expanded"
    >{{ expanded ? '收起' : '完整释义' }}</button>
  </view>
</template>

<style scoped>
.mini-meaning-text {
  min-width: 0;
  color: var(--kotoba-ink, #23392e);
}

.meaning-copy {
  color: inherit;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.meaning-toggle {
  display: inline-flex;
  min-height: 36px;
  margin: 2rpx 0 0 8rpx;
  padding: 4rpx 12rpx;
  border: 1rpx solid #d9e2d5;
  border-radius: 999rpx;
  color: var(--kotoba-green, #315944);
  background: #f6f8f1;
  font-size: 21rpx;
  line-height: 1.4;
  vertical-align: middle;
}

.meaning-pressed { opacity: .78; }
</style>
