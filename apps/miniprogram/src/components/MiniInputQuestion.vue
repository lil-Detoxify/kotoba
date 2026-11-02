<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { QuizAttempt } from '@jp/models';
import { analyzeKanaAnswer, type KanaAnswerDiff } from '../services/kana-answer-diff';
import type { InputQuestion } from '../services/input-practice';

const props = defineProps<{
  question: InputQuestion;
  value: string;
  attempt: Pick<QuizAttempt, 'selected' | 'correct' | 'isCorrect'> | null;
  busy: boolean;
  heard: boolean;
  audioError: string;
  speaking: boolean;
}>();

const emit = defineEmits<{
  'update:value': [value: string];
  submit: [value: string | null];
  play: [slow: boolean];
  stop: [];
}>();

const composing = ref(false);
const pendingSubmit = ref(false);
const retryValue = ref('');
const retryResult = ref<KanaAnswerDiff | null>(null);
const retryComposing = ref(false);
let retryDraft = '';
let lastRetryCompositionEnd = 0;
let draft = props.value;
let lastCompositionEnd = 0;
const isDictation = computed(() => props.question.type === 'dictation');
const retryDiff = computed(() => retryResult.value ?? (
  props.attempt && !props.attempt.isCorrect
    ? analyzeKanaAnswer(props.attempt.selected, props.attempt.correct)
    : null
));
const canAnswer = computed(() => !isDictation.value || (props.heard && !props.audioError));
const disabled = computed(() => props.busy || !!props.attempt || pendingSubmit.value || !canAnswer.value);
const canSubmit = computed(() => !disabled.value && !composing.value && !!props.value.trim());

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
  if (value === undefined || props.attempt || props.busy) return;
  draft = value;
  if (!composing.value) emit('update:value', value);
}

function handleCompositionStart() {
  composing.value = true;
}

function handleCompositionEnd() {
  // Uni's composition event carries the composing fragment, while its input
  // event carries the complete field. Use the draft from that input event.
  composing.value = false;
  lastCompositionEnd = Date.now();
  if (!props.attempt && !props.busy) emit('update:value', draft);
}

function handleBlur(event: unknown) {
  if (!composing.value) return;
  const value = eventValue(event);
  if (value !== undefined) draft = value;
  handleCompositionEnd();
}

function submit(value: string | null) {
  if (disabled.value || composing.value) return;
  if (value !== null && !value.trim()) return;
  pendingSubmit.value = true;
  uni.hideKeyboard();
  emit('submit', value === null ? null : value.trim());
}

function handleConfirm(event: unknown) {
  if (eventProperty(event, 'isComposing') || eventProperty(event, 'keyCode') === 229 || composing.value) return;
  // A single IME Enter can end composition and also produce a confirm event.
  if (Date.now() - lastCompositionEnd < 150) return;
  const value = eventValue(event) ?? props.value;
  submit(value);
}

function handleRetryInput(event: unknown) {
  const value = eventValue(event);
  if (value === undefined || retryComposing.value || props.busy) return;
  retryDraft = value;
  retryValue.value = value;
  retryResult.value = null;
}

function handleRetryCompositionStart() {
  retryComposing.value = true;
}

function handleRetryCompositionEnd(event: unknown) {
  retryComposing.value = false;
  retryDraft = eventValue(event) ?? retryDraft;
  retryValue.value = retryDraft;
  retryResult.value = null;
  lastRetryCompositionEnd = Date.now();
}

function submitRetry() {
  if (props.busy || retryComposing.value || !retryValue.value.trim() || !props.attempt || props.attempt.isCorrect) return;
  retryResult.value = analyzeKanaAnswer(retryValue.value.trim(), props.attempt.correct);
}

function handleRetryConfirm(event: unknown) {
  const native = event && typeof event === 'object' ? event as { isComposing?: boolean; keyCode?: number; preventDefault?: () => void; stopPropagation?: () => void } : {};
  native.stopPropagation?.();
  if (native.isComposing || native.keyCode === 229 || retryComposing.value) return;
  native.preventDefault?.();
  if (Date.now() - lastRetryCompositionEnd < 150) return;
  submitRetry();
}

function retryAgain() {
  if (props.busy) return;
  retryDraft = '';
  retryValue.value = '';
  retryResult.value = null;
  lastRetryCompositionEnd = 0;
}

function resetRetry() {
  retryDraft = '';
  retryValue.value = '';
  retryResult.value = null;
  retryComposing.value = false;
  lastRetryCompositionEnd = 0;
}

watch(() => props.value, (value) => { if (!composing.value) draft = value; });
watch(() => props.question, () => {
  draft = props.value;
  composing.value = false;
  pendingSubmit.value = false;
  lastCompositionEnd = 0;
  resetRetry();
});
watch(() => props.attempt, resetRetry);
watch(() => props.busy, (busy, wasBusy) => {
  if (wasBusy && !busy && !props.attempt) pendingSubmit.value = false;
});
</script>

<template>
  <view class="mini-input-question" :class="{ 'is-dictation': isDictation }">
    <text class="question-label">{{ isDictation ? '听写' : '假名键入' }}</text>

    <view v-if="isDictation" class="dictation-controls" aria-label="听写音频控制">
      <button
        class="play-button"
        hover-class="practice-pressed"
        :disabled="busy"
        @tap="speaking ? emit('stop') : emit('play', false)"
      >{{ speaking ? '停止播放' : '播放读音' }}</button>
      <button
        class="slow-button"
        hover-class="practice-pressed"
        :disabled="busy"
        @tap="emit('play', true)"
      >慢速播放</button>
      <text v-if="!heard && !audioError" class="dictation-hint">听过读音后，再填写假名。</text>
    </view>

    <text v-else class="question-prompt" lang="ja">{{ question.prompt }}</text>
    <view v-if="audioError" class="audio-error" role="alert">
      <text>{{ audioError }}</text>
      <text class="error-help">请重新播放，再填写答案。</text>
    </view>

    <view v-if="!attempt" class="answer-area">
      <text class="answer-label">你的假名答案</text>
      <input
        class="answer-input"
        type="text"
        lang="ja"
        :value="value"
        :disabled="disabled"
        :maxlength="120"
        :ignore-composition-event="false"
        :adjust-position="true"
        :cursor-spacing="24"
        confirm-type="done"
        :confirm-hold="true"
        placeholder="输入平假名或片假名"
        aria-label="你的假名答案"
        @input="handleInput"
        @confirm="handleConfirm"
        @blur="handleBlur"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
      />
      <text v-if="!attempt" class="answer-hint">平假名和片假名都可以，长音与促音请完整输入。</text>
    </view>

    <view v-if="!attempt" class="answer-actions">
      <button
        class="submit-button"
        hover-class="practice-pressed"
        :disabled="!canSubmit"
        @tap="submit(value)"
      >对照答案</button>
      <button
        class="unknown-button"
        hover-class="practice-pressed"
        :disabled="disabled || composing"
        @tap="submit(null)"
      >还没想起来</button>
    </view>

    <view v-else class="input-feedback" :class="{ incorrect: !attempt.isCorrect }" role="status">
      <text class="feedback-title">{{ attempt.isCorrect ? '答对了' : '再记住一次' }}</text>
      <text v-if="attempt.isCorrect" class="submitted-answer">你的答案：{{ attempt.selected || '还没想起来' }}</text>
      <text v-if="attempt.isCorrect" class="feedback-note">继续巩固这份记忆。</text>
    </view>

    <view v-if="attempt && !attempt.isCorrect" class="kana-retry" aria-label="假名答案练习重试">
      <view v-if="!retryResult?.matches" class="kana-difference" aria-live="polite">
        <view class="difference-row" lang="ja">
          <text class="difference-label">你的答案</text>
          <text class="difference-text"><text v-for="(part, index) in retryDiff?.submitted" :key="`submitted-${index}`" class="kana-part" :class="`is-${part.kind}`">{{ part.text }}</text></text>
        </view>
        <view class="difference-row" lang="ja">
          <text class="difference-label">正确读音</text>
          <text class="difference-text"><text v-for="(part, index) in retryDiff?.correct" :key="`correct-${index}`" class="kana-part" :class="`is-${part.kind}`">{{ part.text }}</text></text>
        </view>
        <text class="difference-hint">{{ retryDiff?.hint }}</text>
      </view>
      <text v-else class="retry-success" role="status">这次写对了</text>

      <text class="retry-note">练习重试不改变首次作答结果。</text>
      <input
        class="retry-input"
        type="text"
        lang="ja"
        :value="retryValue"
        :disabled="busy"
        :maxlength="120"
        :ignore-composition-event="false"
        confirm-type="done"
        placeholder="再输入一次假名"
        aria-label="再练习一次"
        @input="handleRetryInput"
        @confirm="handleRetryConfirm"
        @compositionstart="handleRetryCompositionStart"
        @compositionend="handleRetryCompositionEnd"
      />
      <view class="retry-actions">
        <button class="retry-play" hover-class="practice-pressed" :disabled="busy" @tap="emit('play', false)">再听一次</button>
        <button v-if="retryResult" class="retry-again" hover-class="practice-pressed" :disabled="busy" @tap="retryAgain">再试一次</button>
        <button v-else class="retry-submit" hover-class="practice-pressed" :disabled="busy || !retryValue.trim()" @tap="submitRetry">对照答案</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.mini-input-question { min-width: 0; color: var(--kotoba-ink); }
.question-label { display: block; margin: 0 0 24rpx; color: var(--kotoba-muted); font-size: 24rpx; font-weight: 600; letter-spacing: 2rpx; }
.question-prompt { display: block; margin: 12rpx 0 40rpx; font-family: "Songti SC", "Noto Serif CJK JP", serif; font-size: 50rpx; line-height: 1.6; text-align: center; overflow-wrap: anywhere; }
.dictation-controls { display: flex; flex-wrap: wrap; gap: 16rpx; margin: 8rpx 0 32rpx; }
.play-button, .slow-button, .submit-button, .unknown-button { min-height: 48px; margin: 0; padding: 16rpx 20rpx; border: 1rpx solid var(--kotoba-line); border-radius: 16rpx; font-size: 28rpx; line-height: 1.5; }
.play-button, .slow-button { flex: 1; color: var(--kotoba-green); background: var(--kotoba-paper); }
.play-button { font-weight: 600; background: var(--kotoba-sage); }
.dictation-hint { display: block; flex-basis: 100%; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.7; text-align: center; }
.audio-error { margin: 0 0 28rpx; padding: 20rpx; border: 1rpx solid #e5c9be; border-radius: 14rpx; color: var(--kotoba-error); background: #fbefea; font-size: 26rpx; line-height: 1.7; }
.audio-error text, .error-help { display: block; }
.error-help { margin-top: 6rpx; }
.answer-label { display: block; margin-bottom: 14rpx; color: var(--kotoba-muted); font-size: 26rpx; font-weight: 600; }
.answer-input { box-sizing: border-box; width: 100%; min-height: 54px; height: 54px; padding: 12px; border: 1rpx solid #aab9a5; border-radius: 16rpx; color: var(--kotoba-ink); background: var(--kotoba-paper); font-size: 20px; line-height: 1.5; }
.answer-input:focus-within { border-color: var(--kotoba-green); outline: 2px solid var(--kotoba-green); outline-offset: 2px; }
.answer-input[disabled] { background: var(--kotoba-bg); color: var(--kotoba-muted); }
.answer-hint { display: block; margin-top: 14rpx; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.7; }
.answer-actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 32rpx; }
.submit-button, .unknown-button { flex: 1 1 220rpx; }
.submit-button { border-color: var(--kotoba-green); color: var(--kotoba-paper); background: var(--kotoba-green); font-weight: 600; }
.unknown-button { color: var(--kotoba-green); background: var(--kotoba-paper); }
.input-feedback { margin-top: 28rpx; padding: 24rpx; border: 1rpx solid var(--kotoba-line); border-radius: 16rpx; color: var(--kotoba-green); background: var(--kotoba-sage); }
.input-feedback.incorrect { border-color: #e5d2bb; color: #694b37; background: #faf3eb; }
.feedback-title { display: block; margin-bottom: 10rpx; font-size: 29rpx; font-weight: 600; }
.submitted-answer, .correct-answer { display: block; font-size: 30rpx; line-height: 1.7; overflow-wrap: anywhere; }
.feedback-note { display: block; margin-top: 8rpx; font-size: 26rpx; line-height: 1.7; }
.kana-retry { margin-top: 20rpx; padding: 20rpx; border: 1rpx solid var(--kotoba-line); border-radius: 16rpx; background: var(--kotoba-paper); }
.difference-row { display: grid; min-width: 0; grid-template-columns: 120rpx minmax(0, 1fr); gap: 12rpx; align-items: baseline; margin: 8rpx 0; }
.difference-label { color: var(--kotoba-muted); font-size: 23rpx; }
.difference-text { min-width: 0; color: var(--kotoba-ink); font-size: 30rpx; line-height: 1.7; overflow-wrap: anywhere; }
.kana-part.is-extra { color: #9d5548; text-decoration: underline wavy; text-underline-offset: 4rpx; }
.kana-part.is-changed { color: #9d5548; background: #f8e8df; }
.kana-part.is-missing { color: #805f25; background: #f7edcf; }
.difference-hint, .retry-note, .retry-success { display: block; margin-top: 12rpx; font-size: 23rpx; line-height: 1.65; }
.difference-hint, .retry-note { color: var(--kotoba-muted); }
.retry-success { color: var(--kotoba-green); font-weight: 650; }
.retry-input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 50px; height: 50px; margin-top: 14rpx; padding: 10px 12px; border: 1rpx solid #aab9a5; border-radius: 14rpx; color: var(--kotoba-ink); background: #fff; font-size: 20px; }
.retry-actions { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 14rpx; }
.retry-actions button { flex: 1 1 180rpx; min-width: 0; min-height: 46px; margin: 0; padding: 8rpx 16rpx; border: 1rpx solid var(--kotoba-line); border-radius: 14rpx; color: var(--kotoba-green); background: var(--kotoba-paper); font-size: 24rpx; line-height: 1.5; overflow-wrap: anywhere; }
.retry-actions .retry-submit { border-color: var(--kotoba-green); color: #fff; background: var(--kotoba-green); }
.practice-pressed { opacity: .8; }
</style>
