<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ClozeQuestion } from '../services/learning-examples';

const props = defineProps<{
  question: ClozeQuestion;
  value: string;
  revealed: boolean;
  matches: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  'update:value': [value: string];
  reveal: [];
  grade: [rating: 1 | 2 | 3];
}>();

const composing = ref(false);
let draft = props.value;
let lastCompositionEnd = 0;

function eventProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

function eventValue(event: unknown): string | undefined {
  for (const source of [eventProperty(event, 'detail'), eventProperty(event, 'target')]) {
    const value = eventProperty(source, 'value');
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function handleInput(event: unknown) {
  const value = eventValue(event);
  if (value === undefined || props.revealed || props.busy) return;
  draft = value;
  if (!composing.value) emit('update:value', value);
}

function handleCompositionEnd() {
  composing.value = false;
  lastCompositionEnd = Date.now();
  if (!props.revealed && !props.busy) emit('update:value', draft);
}

function handleBlur(event: unknown) {
  if (!composing.value) return;
  const value = eventValue(event);
  if (value !== undefined) draft = value;
  handleCompositionEnd();
}

function reveal() {
  if (props.busy || props.revealed || composing.value) return;
  uni.hideKeyboard();
  emit('reveal');
}

function handleConfirm(event: unknown) {
  if (eventProperty(event, 'isComposing') || eventProperty(event, 'keyCode') === 229 || composing.value) return;
  if (Date.now() - lastCompositionEnd < 150) return;
  const value = eventValue(event);
  if (value !== undefined) emit('update:value', value);
  reveal();
}

function grade(rating: 1 | 2 | 3) {
  if (!props.busy && props.revealed) emit('grade', rating);
}

watch(() => props.value, (value) => { if (!composing.value) draft = value; });
watch(() => props.question, () => {
  draft = props.value;
  composing.value = false;
  lastCompositionEnd = 0;
});
</script>

<template>
  <view class="mini-sentence-cloze" aria-label="例句填空">
    <text class="cloze-label">例句填空</text>
    <text class="cloze-translation">{{ question.zh }}</text>

    <view class="cloze-sentence" lang="ja">
      <text>{{ question.before }}</text>
      <text class="cloze-blank">{{ revealed ? question.answer : '　　' }}</text>
      <text>{{ question.after }}</text>
    </view>

    <view class="cloze-entry">
      <text class="cloze-input-label">填写空缺部分</text>
      <input
        class="cloze-input"
        type="text"
        lang="ja"
        :value="value"
        :disabled="!!busy || revealed"
        :maxlength="120"
        :ignore-composition-event="false"
        :adjust-position="true"
        :cursor-spacing="24"
        confirm-type="done"
        :confirm-hold="true"
        placeholder="日文写法或假名均可"
        aria-label="填写例句空缺部分"
        @input="handleInput"
        @confirm="handleConfirm"
        @blur="handleBlur"
        @compositionstart="composing = true"
        @compositionend="handleCompositionEnd"
      />
    </view>

    <view v-if="!revealed" class="cloze-actions">
      <button class="cloze-primary" hover-class="practice-pressed" :disabled="!!busy || composing" @tap="reveal">对照示例</button>
      <button class="cloze-secondary" hover-class="practice-pressed" :disabled="!!busy || composing" @tap="reveal">暂时想不起</button>
    </view>

    <view v-else class="cloze-reveal" role="status">
      <text class="cloze-feedback">{{ matches ? '与示例一致' : '看看原句的用法' }}</text>
      <text class="cloze-original" lang="ja">{{ question.ja }}</text>
      <view class="cloze-answer-meta">
        <text>补全部分：{{ question.answer }}</text>
        <text v-if="question.reading">读音：{{ question.reading }}</text>
      </view>
      <text class="cloze-rating-note">对照示例后，按自己的记忆程度评价。</text>
      <view class="cloze-ratings" aria-label="记忆程度评价">
        <button class="rating-forgot" hover-class="practice-pressed" :disabled="!!busy" @tap="grade(1)">忘记了</button>
        <button class="rating-fuzzy" hover-class="practice-pressed" :disabled="!!busy" @tap="grade(2)">模糊</button>
        <button class="rating-remembered" hover-class="practice-pressed" :disabled="!!busy" @tap="grade(3)">记得</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.mini-sentence-cloze { min-width: 0; color: var(--kotoba-ink); }
.cloze-label { display: block; margin-bottom: 20rpx; color: var(--kotoba-muted); font-size: 24rpx; font-weight: 600; letter-spacing: 2rpx; }
.cloze-translation { display: block; margin-bottom: 24rpx; color: var(--kotoba-muted); font-size: 28rpx; line-height: 1.8; }
.cloze-sentence { margin: 0 0 32rpx; font-size: 40rpx; line-height: 1.9; overflow-wrap: anywhere; }
.cloze-blank { margin: 0 6rpx; border-bottom: 2px solid var(--kotoba-green); color: var(--kotoba-green); }
.cloze-input-label { display: block; margin-bottom: 14rpx; color: var(--kotoba-muted); font-size: 26rpx; font-weight: 600; }
.cloze-input { box-sizing: border-box; width: 100%; min-height: 54px; height: 54px; padding: 12px; border: 1rpx solid #aab9a5; border-radius: 16rpx; color: var(--kotoba-ink); background: var(--kotoba-paper); font-size: 20px; line-height: 1.5; }
.cloze-input:focus-within { border-color: var(--kotoba-green); outline: 2px solid var(--kotoba-green); outline-offset: 2px; }
.cloze-input[disabled] { background: var(--kotoba-bg); color: var(--kotoba-muted); }
.cloze-actions, .cloze-ratings { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 28rpx; }
.cloze-actions button, .cloze-ratings button { min-height: 48px; margin: 0; padding: 16rpx 20rpx; border: 1rpx solid var(--kotoba-line); border-radius: 16rpx; font-size: 28rpx; line-height: 1.5; }
.cloze-actions button { flex: 1 1 220rpx; }
.cloze-primary { border-color: var(--kotoba-green) !important; color: var(--kotoba-paper); background: var(--kotoba-green); font-weight: 600; }
.cloze-secondary { color: var(--kotoba-green); background: var(--kotoba-paper); }
.cloze-reveal { padding-top: 28rpx; }
.cloze-feedback { display: block; margin-bottom: 20rpx; color: var(--kotoba-green); font-size: 28rpx; font-weight: 600; }
.cloze-original { display: block; padding-left: 22rpx; border-left: 2px solid #b5c6a5; font-size: 36rpx; line-height: 1.8; overflow-wrap: anywhere; }
.cloze-answer-meta { display: flex; flex-direction: column; gap: 8rpx; margin-top: 22rpx; color: var(--kotoba-muted); font-size: 26rpx; line-height: 1.7; }
.cloze-rating-note { display: block; margin-top: 26rpx; color: var(--kotoba-muted); font-size: 26rpx; line-height: 1.7; }
.cloze-ratings button { flex: 1 1 120rpx; padding: 16rpx 12rpx; }
.rating-forgot { color: #785d44; background: #f3eee8; }
.rating-fuzzy { color: #686744; background: #f2f2e8; }
.rating-remembered { color: var(--kotoba-green); background: var(--kotoba-sage); }
.practice-pressed { opacity: .8; }
</style>
