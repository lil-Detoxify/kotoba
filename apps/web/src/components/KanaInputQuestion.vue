<script setup lang="ts">
import AudioRetryNotice from './AudioRetryNotice.vue';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { Check, Volume2, X } from 'lucide-vue-next';
import { analyzeKanaAnswer } from '../services/kana-answer-diff';

type InputQuestion = {
  type: 'kana-input' | 'dictation';
  prompt: string;
  meaning: string;
  correct: string;
};

type InputAttempt = {
  selected: string | null;
  correct: string;
  isCorrect: boolean;
};

const props = defineProps<{
  question: InputQuestion;
  value: string;
  attempt: InputAttempt | null;
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

const answerInput = ref<HTMLInputElement | null>(null);
const composing = ref(false);
const retryValue = ref('');
const retryInput = ref<HTMLInputElement | null>(null);
const retryResult = ref<ReturnType<typeof analyzeKanaAnswer> | null>(null);
const retryComposing = ref(false);
const retryDiff = computed(() => retryResult.value ?? (
  props.attempt && !props.attempt.isCorrect
    ? analyzeKanaAnswer(props.attempt.selected, props.attempt.correct)
    : null
));
const isDictation = computed(() => props.question.type === 'dictation');
const canAnswer = computed(() => !isDictation.value || (props.heard && !props.audioError));
const isDisabled = computed(() => props.busy || !!props.attempt || !canAnswer.value);

function focusAnswer() {
  if (props.attempt || !canAnswer.value) return;
  answerInput.value?.focus();
}

function handleInput(event: Event) {
  if (composing.value) return;
  emit('update:value', (event.target as HTMLInputElement).value);
}

function handleCompositionEnd(event: CompositionEvent) {
  composing.value = false;
  emit('update:value', (event.target as HTMLInputElement).value);
}

function handleEnter(event: KeyboardEvent) {
  if (composing.value || event.isComposing || event.keyCode === 229 || props.attempt) return;
  event.preventDefault();
  event.stopPropagation();
  if (isDisabled.value || !props.value.trim()) return;
  emit('submit', props.value.trim());
}

function submitUnknown() {
  if (!isDisabled.value) emit('submit', null);
}

function submitRetry() {
  if (props.busy || !retryValue.value.trim()) return;
  retryResult.value = analyzeKanaAnswer(retryValue.value.trim(), props.attempt?.correct ?? props.question.correct);
}

function handleRetryEnter(event: KeyboardEvent) {
  if (retryComposing.value || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  event.stopPropagation();
  submitRetry();
}

function handleRetryCompositionEnd(event: CompositionEvent) {
  retryComposing.value = false;
  retryValue.value = (event.target as HTMLInputElement).value;
  retryResult.value = null;
}

function retryAgain() {
  if (props.busy) return;
  retryValue.value = '';
  retryResult.value = null;
  void nextTick(() => retryInput.value?.focus());
}

function resetRetry() {
  retryValue.value = '';
  retryResult.value = null;
  retryComposing.value = false;
}

onMounted(() => {
  void nextTick(focusAnswer);
});

watch(
  () => [props.question, props.heard, props.audioError, props.attempt] as const,
  () => void nextTick(focusAnswer),
);

watch(
  () => [props.question, props.attempt] as const,
  resetRetry,
);
</script>

<template>
  <section class="kana-input-question" :class="{ 'is-dictation': isDictation }">
    <p class="question-label">{{ isDictation ? '听写' : '假名键入' }}</p>

    <div v-if="isDictation" class="dictation-controls" aria-label="听写音频控制">
      <button
        type="button"
        class="dictation-play"
        :disabled="busy"
        @click="speaking ? emit('stop') : emit('play', false)"
      >
        <Volume2 :size="19" aria-hidden="true" />
        <span>{{ speaking ? '停止播放' : '播放读音' }}</span>
      </button>
      <button
        type="button"
        class="dictation-slow"
        :disabled="busy"
        @click="emit('play', true)"
      >
        慢速播放
      </button>
      <p v-if="!heard && !audioError" class="dictation-hint">播放后即可输入答案</p>
    </div>

    <p v-if="!isDictation" class="question-prompt" lang="ja">{{ question.prompt }}</p>
    <AudioRetryNotice id="kana-audio-error" :error="audioError" :disabled="busy" @retry="emit('play',false)" />

    <div class="answer-area">
      <label for="kana-answer-input">你的假名答案</label>
      <input
        id="kana-answer-input"
        ref="answerInput"
        class="kana-answer-input"
        :value="attempt ? (attempt.selected ?? '') : value"
        type="text"
        lang="ja"
        inputmode="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :readonly="!!attempt"
        :disabled="isDisabled && !attempt"
        :aria-describedby="audioError ? 'kana-audio-error' : undefined"
        @input="handleInput"
        @compositionstart="composing = true"
        @compositionend="handleCompositionEnd"
        @keydown.enter="handleEnter"
      />
      <p v-if="!attempt" class="answer-hint">平假名和片假名都可以。</p>
    </div>

    <div v-if="!attempt" class="answer-actions">
      <button
        type="button"
        class="kana-input-submit"
        :disabled="busy || !canAnswer || !value.trim()"
        @click="emit('submit', value.trim())"
      >
        对照答案
      </button>
      <button type="button" class="unknown-answer" :disabled="isDisabled" @click="submitUnknown">
        还没想起来
      </button>
    </div>

    <div v-else class="input-feedback" :class="{ incorrect: !attempt.isCorrect }" role="status">
      <div class="feedback-title">
        <Check v-if="attempt.isCorrect" :size="19" aria-hidden="true" />
        <X v-else :size="19" aria-hidden="true" />
        <strong>{{ attempt.isCorrect ? '答对了' : '再记住一次' }}</strong>
      </div>
      <p v-if="attempt.isCorrect" class="submitted-answer">
        你的答案：<span lang="ja">{{ attempt.selected || '还没想起来' }}</span>
      </p>
      <p v-if="attempt.isCorrect" class="correct-answer">继续巩固这份记忆。</p>
    </div>

    <section v-if="attempt && !attempt.isCorrect" class="kana-retry" aria-label="假名答案练习重试">
      <div v-if="!retryResult?.matches" class="kana-difference" aria-live="polite">
        <p class="kana-difference-row" lang="ja">
          <span class="kana-difference-label">你的答案</span>
          <span class="kana-difference-text">
            <span v-for="(part, index) in retryDiff?.submitted" :key="`submitted-${index}`" :class="`kana-part is-${part.kind}`">{{ part.text }}</span>
          </span>
        </p>
        <p class="kana-difference-row" lang="ja">
          <span class="kana-difference-label">正确读音</span>
          <span class="kana-difference-text">
            <span v-for="(part, index) in retryDiff?.correct" :key="`correct-${index}`" :class="`kana-part is-${part.kind}`">{{ part.text }}</span>
          </span>
        </p>
        <p class="kana-difference-hint">{{ retryDiff?.hint }}</p>
      </div>
      <p v-else class="kana-retry-success" role="status">这次写对了</p>

      <p class="kana-retry-note">练习重试不改变首次作答结果。</p>
      <form class="kana-retry-form" @submit.prevent.stop="submitRetry">
        <label for="kana-retry-input">再练习一次</label>
        <input
          id="kana-retry-input"
          ref="retryInput"
          class="kana-retry-input"
          :value="retryValue"
          type="text"
          lang="ja"
          inputmode="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :disabled="busy"
          @input="retryValue = ($event.target as HTMLInputElement).value; retryResult = null"
          @compositionstart="retryComposing = true"
          @compositionend="handleRetryCompositionEnd"
          @keydown.enter="handleRetryEnter"
        />
        <div class="kana-retry-actions">
          <button type="button" class="kana-retry-play" :disabled="busy" @click="emit('play', false)">
            <Volume2 :size="17" aria-hidden="true" />再听一次
          </button>
          <button v-if="retryResult" type="button" class="kana-retry-again" :disabled="busy" @click="retryAgain">再试一次</button>
          <button v-else type="submit" class="kana-retry-submit" :disabled="busy || !retryValue.trim()">对照答案</button>
        </div>
      </form>
    </section>
  </section>
</template>

<style scoped>
.kana-input-question {
  min-width: 0;
  color: #293e30;
}

.question-label {
  margin: 0 0 13px;
  color: #68756a;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.question-prompt {
  margin: 0 0 24px;
  overflow-wrap: anywhere;
  color: #293e30;
  font-family: "Yu Mincho", "Noto Serif CJK JP", serif;
  font-size: clamp(27px, 7vw, 38px);
  line-height: 1.5;
  text-align: center;
}

.dictation-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 4px 0 24px;
}

.dictation-play,
.dictation-slow,
.unknown-answer {
  min-height: 44px;
  border-radius: var(--radius-control);
  font: inherit;
  cursor: pointer;
}

.dictation-play {
  gap: 8px;
  border-color: var(--border-soft);
  background: var(--surface-muted);
  color: var(--green, #365d49);
  font-size: 14px;
  font-weight: 600;
}

.dictation-slow,
.unknown-answer {
  color: #526555;
  font-size: 13px;
}

.dictation-hint,
.answer-hint {
  flex-basis: 100%;
  margin: 0;
  color: #69746b;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

.audio-error {
  margin: -10px 0 18px;
  color: #873c2c;
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}

.answer-area {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}

.answer-area label {
  display: block;
  margin-bottom: 7px;
  color: #526555;
  font-size: 13px;
  font-weight: 600;
}

.kana-answer-input {
  min-height: 52px;
  margin: 0 !important;
  border-color: var(--border-soft);
  border-radius: var(--radius-control);
  font-size: 20px;
  line-height: 1.4;
}

.kana-answer-input:disabled {
  color: #737d72;
  opacity: 0.75;
}

.kana-answer-input:read-only {
  background: #f5f7f1;
}

.answer-hint {
  margin-top: 7px;
  text-align: left;
}

.answer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 9px;
  margin: 18px auto 0;
}

.kana-input-submit {
  min-width: 132px;
  min-height: 46px;
  font-weight: 600;
}

.input-feedback {
  max-width: 480px;
  margin: 18px auto 0;
  padding: 14px 16px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-inset);
  background: var(--surface-selected);
  color: #315944;
}

.input-feedback.incorrect {
  border-color: #ead8c9;
  background: #faf3eb;
  color: #694b37;
}

.feedback-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
}

.submitted-answer,
.correct-answer {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.submitted-answer span,
.correct-answer strong {
  font-size: 17px;
}

.kana-retry {
  max-width: 480px;
  margin: 14px auto 0;
  color: #526555;
}

.kana-difference {
  padding: 9px 0 0;
  border-top: 1px solid var(--border-soft);
}

.kana-difference-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 5px 0;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.kana-difference-label {
  flex: 0 0 76px;
  color: #69746b;
  font-size: 12px;
}

.kana-difference-text {
  min-width: 0;
  font-size: 17px;
}

.kana-part {
  border-radius: 3px;
}

.kana-part.is-extra,
.kana-part.is-missing {
  padding: 0 2px;
  background: #f4e1ce;
  color: #704525;
  text-decoration: underline wavy #a86635;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.kana-part.is-changed {
  padding: 0 2px;
  background: #f6e9b8;
  color: #604f20;
  text-decoration: underline #8b742b;
  text-underline-offset: 3px;
}

.kana-difference-hint,
.kana-retry-note {
  margin: 5px 0 0;
  color: #69746b;
  font-size: 12px;
  line-height: 1.55;
}

.kana-retry-note {
  margin-top: 7px;
}

.kana-retry-success {
  margin: 0 0 8px;
  color: #315944;
  font-size: 14px;
  font-weight: 700;
}

.kana-retry-form {
  margin-top: 9px;
}

.kana-retry-form label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
}

.kana-retry-input {
  min-height: 46px;
  margin: 0 !important;
  border-color: var(--border-soft);
  border-radius: var(--radius-control);
  font-size: 18px;
  line-height: 1.4;
}

.kana-retry-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.kana-retry-actions button {
  min-height: 44px;
  border-radius: var(--radius-control);
  font: inherit;
  cursor: pointer;
}

.kana-retry-play {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--green, #365d49);
}

.kana-retry-submit,
.kana-retry-again {
  color: #315944;
  font-weight: 600;
}

@media (max-width: 420px) {
  .question-label {
    margin-bottom: 10px;
  }

  .question-prompt {
    margin-bottom: 19px;
  }

  .answer-actions {
    gap: 7px;
  }

  .kana-input-submit,
  .unknown-answer {
    flex: 1 1 145px;
  }
}
</style>
