<script setup lang="ts">
import { computed, nextTick, onDeactivated, onUnmounted, ref, shallowRef, watch } from 'vue';
import { ArrowRight, Check, RotateCcw } from 'lucide-vue-next';
import { playAnswerSound, stopAnswerSound } from '../answer-sound';
import SentenceAudioControl from './SentenceAudioControl.vue';
import {
  CONJUGATION_FORMS,
  VERB_GROUP_LABELS,
  conjugationVerbs,
  conjugate,
  createConjugationRound,
  confirmConjugation,
  advanceConjugation,
  retryConjugation,
  type ConjugationForm,
  type ConjugationRound,
  type VerbGroup,
} from '../../../web/src/services/conjugation';

const props = defineProps<{ owner: string; verbId?: string; voice: 'female' | 'male' }>();

const form = ref<ConjugationForm | 'mixed'>('te');
const group = ref<VerbGroup | 'all'>('all');
const round = shallowRef<ConjugationRound | null>(null);
const answerInput = ref('');
const answerField = ref<HTMLInputElement>();
const feedbackHeading = ref<HTMLElement>();
const completeHeading = ref<HTMLElement>();
const showHint = ref(false);
const composing = ref(false);
const retrying = ref(false);

const focusedVerb = computed(() => props.verbId ? conjugationVerbs.find(verb => verb.id === props.verbId) : undefined);
const missingTarget = computed(() => Boolean(props.verbId && !focusedVerb.value));
const choices = computed(() => props.verbId
  ? (focusedVerb.value ? [focusedVerb.value] : [])
  : conjugationVerbs.filter(verb => group.value === 'all' || verb.group === group.value));
const targets = computed<ConjugationForm[]>(() => form.value === 'mixed'
  ? CONJUGATION_FORMS.map(item => item.id)
  : [form.value]);
const questionCount = computed(() => Math.min(12, choices.value.length * targets.value.length));
const question = computed(() => round.value?.questions[round.value.index]);
const result = computed(() => question.value ? round.value?.results[question.value.id] : undefined);
const expected = computed(() => question.value ? conjugate(question.value.verb, question.value.form) : undefined);
const sentence = computed(() => question.value && expected.value
  ? question.value.verb.examples[question.value.form].ja.replace('{answer}', expected.value.written)
  : '');
const finished = computed(() => Boolean(round.value && round.value.questions.length > 0 && round.value.index >= round.value.questions.length));
const correctCount = computed(() => Object.values(round.value?.results ?? {}).filter(item => item.correct).length);
const incorrect = computed(() => round.value?.questions.filter(item => round.value?.results[item.id]?.correct === false) ?? []);
const formLabel = (id: ConjugationForm) => CONJUGATION_FORMS.find(item => item.id === id)!.label;

function clearAnswer() {
  answerInput.value = '';
  showHint.value = false;
  composing.value = false;
}

function resetPractice() {
  stopAnswerSound();
  round.value = null;
  clearAnswer();
  retrying.value = false;
}

async function focusInput() {
  await nextTick();
  answerField.value?.focus({ preventScroll: true });
  answerField.value?.scrollIntoView({ block: 'nearest' });
}

function start() {
  if (!questionCount.value) return;
  stopAnswerSound();
  clearAnswer();
  retrying.value = false;
  round.value = createConjugationRound(choices.value, targets.value);
  void focusInput();
}

function configure() {
  resetPractice();
}

function submit(questionId: string) {
  if (composing.value || !round.value) return;
  const updated = confirmConjugation(round.value, questionId, answerInput.value);
  if (updated === round.value) return;
  round.value = updated;
  void playAnswerSound(updated.results[questionId].correct);
  void nextTick(() => {
    feedbackHeading.value?.focus({ preventScroll: true });
    feedbackHeading.value?.scrollIntoView({ block: 'nearest' });
  });
}

function enter(event: KeyboardEvent, questionId: string) {
  if (event.isComposing || composing.value || event.keyCode === 229) return;
  event.preventDefault();
  submit(questionId);
}

function next(questionId: string) {
  if (!round.value) return;
  const updated = advanceConjugation(round.value, questionId);
  if (updated === round.value) return;
  stopAnswerSound();
  round.value = updated;
  clearAnswer();
  if (finished.value) void nextTick(() => completeHeading.value?.focus({ preventScroll: true }));
  else void focusInput();
}

function retry() {
  if (!round.value || !finished.value || !incorrect.value.length) return;
  stopAnswerSound();
  round.value = retryConjugation(round.value);
  clearAnswer();
  retrying.value = true;
  void focusInput();
}

watch(() => [props.owner, props.verbId] as const, resetPractice, { flush: 'sync' });
onDeactivated(stopAnswerSound);
onUnmounted(stopAnswerSound);
</script>

<template>
  <div class="conjugation-practice">
    <section v-if="!round" class="conjugation-setup" aria-labelledby="conjugation-setup-heading">
      <p class="practice-eyebrow">VERBS IN USE</p>
      <h2 id="conjugation-setup-heading">动词活用</h2>
      <p class="setup-intro">从原形出发，把动词放进另一句话。每轮最多 12 题。</p>

      <p v-if="focusedVerb" class="focused-verb">本次练习 <strong lang="ja">{{ focusedVerb.term }}</strong><span lang="ja">{{ focusedVerb.reading }}</span></p>
      <p v-else-if="missingTarget" class="practice-state" role="status">找不到这个动词，请从词语卡片重新打开练习。</p>

      <div class="practice-options">
        <label for="conjugation-form">目标变化
          <select id="conjugation-form" v-model="form">
            <option v-for="item in CONJUGATION_FORMS" :key="item.id" :value="item.id">{{ item.label }} · {{ item.description }}</option>
            <option value="mixed">综合练习 · 四种变化</option>
          </select>
        </label>
        <label v-if="!props.verbId" for="conjugation-group">动词类型
          <select id="conjugation-group" v-model="group">
            <option value="all">全部类型</option>
            <option v-for="(label, id) in VERB_GROUP_LABELS" :key="id" :value="id">{{ label }}</option>
          </select>
        </label>
      </div>

      <p class="practice-help">可用假名或汉字假名作答。{{ choices.length }} 个动词可供练习。</p>
      <button type="button" class="primary start-conjugation" :disabled="!questionCount" @click="start">
        开始练习 · {{ questionCount }} 题 <ArrowRight :size="16" aria-hidden="true" />
      </button>
    </section>

    <section v-else-if="question" class="conjugation-exercise" aria-labelledby="conjugation-question-heading">
      <div class="exercise-meta">
        <span>{{ retrying ? '错题再练' : '本轮练习' }} · {{ round.index + 1 }} / {{ round.questions.length }}</span>
        <button type="button" class="quiet-button" @click="configure">调整练习</button>
      </div>
      <progress :value="round.index" :max="round.questions.length" :aria-label="`已完成 ${round.index} 题，共 ${round.questions.length} 题`" />

      <div class="question-word">
        <span>{{ VERB_GROUP_LABELS[question.verb.group] }} · {{ question.verb.meaning }}</span>
        <h2 id="conjugation-question-heading" lang="ja">{{ question.verb.term }}</h2>
        <p lang="ja">{{ question.verb.reading }}</p>
      </div>
      <p class="target-form">请写出它的 <strong>{{ formLabel(question.form) }}</strong></p>
      <p class="sentence-context" lang="ja">{{ question.verb.examples[question.form].ja.replace('{answer}', '＿＿') }}</p>
      <SentenceAudioControl v-if="result" :sentence="sentence" :voice="voice" label="朗读完整例句" />

      <form class="conjugation-answer" @submit.prevent="submit(question.id)">
        <label for="conjugation-answer-input">你的答案</label>
        <input
          id="conjugation-answer-input"
          ref="answerField"
          v-model="answerInput"
          lang="ja"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          :spellcheck="false"
          :readonly="!!result"
          aria-describedby="conjugation-input-help"
          @compositionstart="composing = true"
          @compositionend="composing = false"
          @keydown.enter="enter($event, question.id)"
        />
        <p id="conjugation-input-help" class="practice-help">输入完整的动词变化，可用假名或汉字假名。</p>
        <button v-if="!result" type="submit" class="primary conjugation-submit" :disabled="!answerInput.trim() || composing">核对答案</button>
      </form>

      <button v-if="!result" type="button" class="quiet-button hint-toggle" :aria-expanded="showHint" @click="showHint = !showHint">
        {{ showHint ? '收起提示' : '给我一点提示' }}
      </button>
      <p v-if="showHint && !result" class="conjugation-hint">
        {{ question.verb.group === 'godan' ? '先看原形的最后一个假名，再确定变化的词尾。注意行く和ある的特例。' : question.verb.group === 'ichidan' ? '去掉末尾的る，再接上目标变化的词尾。' : '这是不规则动词，需要记住する或来る的变化。' }}
      </p>

      <div v-if="result && expected" class="conjugation-feedback" :class="{ 'answer-incorrect': !result.correct }" role="status">
        <h3 ref="feedbackHeading" tabindex="-1"><Check v-if="result.correct" :size="18" aria-hidden="true" />{{ result.correct ? '答对了' : '再看一下这个变化' }}</h3>
        <p class="expected-answer" lang="ja">{{ expected.written }} <span>{{ expected.reading }}</span></p>
        <p class="conjugation-rule">{{ expected.rule }}</p>
        <div class="feedback-example">
          <p lang="ja">{{ sentence }}</p>
          <p>{{ question.verb.examples[question.form].zh }}</p>
        </div>
        <button type="button" class="primary next-conjugation" @click="next(question.id)">
          {{ round.index + 1 === round.questions.length ? '完成本轮' : '下一题' }} <ArrowRight :size="16" aria-hidden="true" />
        </button>
      </div>
    </section>

    <section v-else-if="finished && round" class="conjugation-complete" aria-labelledby="conjugation-complete-heading">
      <span class="completion-mark"><Check :size="24" aria-hidden="true" /></span>
      <h2 id="conjugation-complete-heading" ref="completeHeading" tabindex="-1">这一轮变化，练完了。</h2>
      <p>{{ round.questions.length }} 题中答对 {{ correctCount }} 题{{ incorrect.length ? `，还有 ${incorrect.length} 题可以再看一眼。` : '，继续把这些变化用起来。' }}</p>

      <ul v-if="incorrect.length" class="conjugation-corrections" aria-label="本轮错题">
        <li v-for="item in incorrect" :key="item.id">
          <span><strong lang="ja">{{ item.verb.term }}</strong><small>{{ formLabel(item.form) }}</small></span>
          <span lang="ja">{{ conjugate(item.verb, item.form).written }}<small>{{ conjugate(item.verb, item.form).reading }}</small></span>
        </li>
      </ul>

      <div class="completion-actions">
        <button v-if="incorrect.length" type="button" class="primary retry-conjugation" @click="retry">
          <RotateCcw :size="16" aria-hidden="true" />再练错题 · {{ incorrect.length }} 题
        </button>
        <button type="button" :class="{ primary: !incorrect.length }" @click="start">继续下一轮</button>
        <button type="button" @click="configure">调整练习</button>
      </div>
    </section>

    <p class="conjugation-footnote">本次是独立用法练习，不改变词书复习进度。</p>
  </div>
</template>

<style scoped>
.conjugation-practice { min-width: 0; color: var(--ink); }
.conjugation-setup, .conjugation-exercise, .conjugation-complete { min-width: 0; margin: 18px 0; padding: 19px 15px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); }
.practice-eyebrow { margin: 0 0 7px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .09em; }
.conjugation-setup h2 { margin: 0; font-size: 20px; line-height: 1.4; }
.setup-intro, .practice-state { margin: 7px 0 18px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.focused-verb { display: flex; flex-wrap: wrap; align-items: baseline; gap: 7px; margin: 0 0 16px; font-size: 12px; color: var(--muted); }
.focused-verb strong { color: var(--ink); font-size: 18px; }
.practice-options { display: grid; grid-template-columns: minmax(0, 1fr); gap: 13px; }
.practice-options label { display: grid; min-width: 0; gap: 7px; color: var(--ink-soft); font-size: 12px; font-weight: 600; }
.practice-options select { width: 100%; min-width: 0; min-height: 44px; margin: 0; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper); color: var(--ink); font-size: 12px; }
.practice-help, .conjugation-footnote { color: var(--muted); font-size: 11px; line-height: 1.75; }
.practice-help { margin: 12px 0; }
.primary, .completion-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 0; min-height: 44px; padding: 9px 12px; border: 1px solid var(--green); border-radius: 9px; background: var(--green); color: #fffefa; font-size: 12px; font-weight: 650; line-height: 1.45; text-align: center; cursor: pointer; touch-action: manipulation; }
.primary:disabled { opacity: .55; cursor: not-allowed; }
.start-conjugation, .conjugation-submit, .next-conjugation { width: 100%; }
.exercise-meta { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 11px; }
.quiet-button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 8px; border: 0; border-radius: 7px; background: transparent; color: var(--green); font-size: 11px; cursor: pointer; touch-action: manipulation; }
.conjugation-exercise progress { display: block; width: 100%; height: 4px; margin: 8px 0 22px; border: 0; accent-color: var(--green); }
.question-word > span { color: var(--muted); font-size: 11px; line-height: 1.6; }
.question-word h2 { margin: 10px 0 0; font-size: 36px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.question-word p { margin: 3px 0 0; color: var(--muted); font-size: 14px; }
.target-form { margin: 20px 0 9px; font-size: 14px; }
.target-form strong { color: var(--green); }
.sentence-context { margin: 0 0 18px; color: var(--ink-soft); font-size: 16px; line-height: 1.8; overflow-wrap: anywhere; }
.conjugation-answer label { display: block; margin-bottom: 7px; color: var(--muted); font-size: 11px; }
.conjugation-answer input { display: block; width: 100%; min-width: 0; min-height: 52px; margin: 0; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 9px; background: #fff; color: var(--ink); font-size: 20px; }
.conjugation-answer input[readonly] { background: var(--green-pale); }
.conjugation-answer .practice-help { margin: 8px 0 11px; }
.hint-toggle { margin-top: 6px; }
.conjugation-hint { margin: 0; padding: 11px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; line-height: 1.75; }
.conjugation-feedback { min-width: 0; margin-top: 19px; padding: 16px 13px; border: 1px solid #c8d9bc; border-radius: 10px; background: #eef4e9; }
.conjugation-feedback.answer-incorrect { border-color: #e0d2b3; background: #f8f3e7; }
.conjugation-feedback h3 { display: flex; align-items: center; gap: 7px; margin: 0; color: var(--green); font-size: 14px; line-height: 1.5; }
.conjugation-feedback.answer-incorrect h3 { color: #795722; }
.conjugation-feedback h3:focus, .conjugation-complete h2:focus { outline: none; }
.expected-answer { margin: 13px 0 7px; color: var(--ink); font-size: 25px; line-height: 1.5; overflow-wrap: anywhere; }
.expected-answer span { margin-left: 8px; color: var(--muted); font-size: 12px; }
.conjugation-rule { margin: 8px 0; color: var(--ink-soft); font-size: 11px; line-height: 1.7; }
.feedback-example { min-width: 0; margin-top: 13px; padding-top: 12px; border-top: 1px solid #d8e2cf; }
.feedback-example p { margin: 0; color: var(--ink); font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }
.feedback-example p + p { margin-top: 4px; color: var(--muted); font-size: 11px; }
.next-conjugation { margin-top: 14px; }
.conjugation-complete { padding-top: 25px; text-align: center; }
.completion-mark { display: inline-grid; width: 52px; height: 52px; place-items: center; border-radius: 50%; background: var(--green-soft); color: var(--green); }
.conjugation-complete h2 { margin: 15px 0 8px; font-size: 21px; line-height: 1.5; }
.conjugation-complete > p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.75; }
.conjugation-corrections { padding: 0; margin: 19px 0; list-style: none; text-align: left; }
.conjugation-corrections li { display: flex; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); font-size: 14px; }
.conjugation-corrections li > span:last-child { text-align: right; }
.conjugation-corrections small { display: block; margin-top: 3px; color: var(--muted); font-size: 10px; line-height: 1.6; }
.completion-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; }
.completion-actions button:not(.primary) { border-color: var(--line-strong); background: var(--paper); color: var(--green); }
.conjugation-footnote { margin: 14px 0; text-align: center; }
.conjugation-practice button:focus-visible, .conjugation-practice select:focus-visible, .conjugation-practice input:focus-visible { outline: 3px solid rgba(168, 120, 50, .64); outline-offset: 3px; }
.conjugation-practice button:disabled { cursor: not-allowed; }
</style>
