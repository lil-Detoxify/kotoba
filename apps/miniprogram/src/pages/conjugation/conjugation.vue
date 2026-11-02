<script lang="ts">
import { createFriendShare, createTimelineShare } from "../../services/share";
export default {
  onShareAppMessage: createFriendShare,
  onShareTimeline: createTimelineShare,
};
</script>

<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { miniAnswerSound } from "../../services/answer-sound";
import { defaultRepository } from "../../adapters";
import MiniHeader from "../../components/MiniHeader.vue";
import MiniNotice from "../../components/MiniNotice.vue";
import MiniPage from "../../components/MiniPage.vue";
import MiniSentenceAudio from "../../components/MiniSentenceAudio.vue";
import { useMiniPageActivity } from "../../services/page-motion";
import {
  CONJUGATION_FORMS,
  VERB_GROUP_LABELS,
  conjugate,
  conjugationVerbs,
  createConjugationRound,
  confirmConjugation,
  advanceConjugation,
  retryConjugation,
  type ConjugationForm,
  type ConjugationRound,
  type VerbGroup,
} from "../../services/conjugation";

useMiniPageActivity();

const selectedForm = ref<ConjugationForm>("te");
const selectedGroup = ref<VerbGroup | "all">("all");
const requestedVerbId = ref("");
const focusedVerbId = ref("");
const invalidVerbId = ref("");
const round = shallowRef<ConjugationRound | null>(null);
const answerInput = ref("");
const showHint = ref(false);
const composing = ref(false);
const retrying = ref(false);
const audioVoice = ref<"female" | "male">("female");
let inputDraft = "";
let lastCompositionEnd = 0;
let voiceRequest = 0;

const groups: Array<{ id: VerbGroup | "all"; label: string }> = [
  { id: "all", label: "全部类型" },
  { id: "godan", label: VERB_GROUP_LABELS.godan },
  { id: "ichidan", label: VERB_GROUP_LABELS.ichidan },
  { id: "irregular", label: VERB_GROUP_LABELS.irregular },
];

const focusedVerb = computed(() => conjugationVerbs.find((verb) => verb.id === focusedVerbId.value));
const choices = computed(() => {
  if (invalidVerbId.value) return [];
  if (focusedVerb.value) return [focusedVerb.value];
  return conjugationVerbs.filter((verb) => selectedGroup.value === "all" || verb.group === selectedGroup.value);
});
const questionCount = computed(() => focusedVerb.value ? 4 : Math.min(12, choices.value.length));
const visibleVerbs = computed(() => choices.value);
const question = computed(() => round.value?.questions[round.value.index]);
const result = computed(() => question.value ? round.value?.results[question.value.id] : undefined);
const expected = computed(() => question.value ? conjugate(question.value.verb, question.value.form) : undefined);
const finished = computed(() => !!round.value && round.value.questions.length > 0 && round.value.index >= round.value.questions.length);
const correctCount = computed(() => Object.values(round.value?.results ?? {}).filter((item) => item.correct).length);
const incorrect = computed(() => round.value?.questions.filter((item) => round.value?.results[item.id]?.correct === false) ?? []);
const progressPercent = computed(() => round.value?.questions.length
  ? Math.max(0, Math.min(100, round.value.index / round.value.questions.length * 100))
  : 0);
const currentForm = computed(() => CONJUGATION_FORMS.find((item) => item.id === selectedForm.value));
const example = computed(() => question.value && expected.value
  ? question.value.verb.examples[question.value.form].ja.replace("{answer}", expected.value.written)
  : "");

function formLabel(id: ConjugationForm): string {
  return CONJUGATION_FORMS.find((item) => item.id === id)?.label ?? id;
}

function hintFor(group: VerbGroup): string {
  if (group === "godan") return "先看原形的最后一个假名，再确定这次变化的词尾。注意行く和ある的特例。";
  if (group === "ichidan") return "去掉末尾的る，再接上目标变化的词尾。";
  return "这是不规则动词，需要记住する或来る的变化。";
}

function eventProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function eventValue(event: unknown): string | undefined {
  for (const source of [eventProperty(event, "detail"), eventProperty(event, "target")]) {
    const value = eventProperty(source, "value");
    if (typeof value === "string") return value;
  }
  return undefined;
}

function onInput(event: unknown): void {
  if (result.value) return;
  const value = eventValue(event);
  if (value === undefined) return;
  inputDraft = value;
  if (!composing.value) answerInput.value = value;
}

function onCompositionStart(): void {
  composing.value = true;
}

function onCompositionEnd(): void {
  composing.value = false;
  lastCompositionEnd = Date.now();
  if (!result.value) answerInput.value = inputDraft;
}

function onBlur(event: unknown): void {
  if (!composing.value) return;
  const value = eventValue(event);
  if (value !== undefined) inputDraft = value;
  onCompositionEnd();
}

function clearAnswer(): void {
  answerInput.value = "";
  inputDraft = "";
  showHint.value = false;
  composing.value = false;
  lastCompositionEnd = 0;
}

function submitAnswer(questionId: string, value = answerInput.value): void {
  if (!round.value || composing.value) return;
  const updated = confirmConjugation(round.value, questionId, value);
  if (updated === round.value) return;
  round.value = updated;
  void miniAnswerSound.play(updated.results[questionId].correct);
  uni.hideKeyboard();
}

function onConfirm(event: unknown, questionId: string): void {
  if (eventProperty(event, "isComposing") || eventProperty(event, "keyCode") === 229 || composing.value) return;
  // IME Enter can end composition and emit confirm in the same turn.
  if (Date.now() - lastCompositionEnd < 150) return;
  submitAnswer(questionId, eventValue(event) ?? answerInput.value);
}

function startRound(): void {
  if (!choices.value.length) return;
  miniAnswerSound.stop();
  clearAnswer();
  retrying.value = false;
  const forms = focusedVerb.value
    ? CONJUGATION_FORMS.map((item) => item.id)
    : [selectedForm.value];
  round.value = createConjugationRound(choices.value, forms, focusedVerb.value ? 4 : 12);
}

function returnToBrowse(): void {
  miniAnswerSound.stop();
  round.value = null;
  clearAnswer();
  retrying.value = false;
}

function advanceQuestion(questionId: string): void {
  if (!round.value) return;
  const updated = advanceConjugation(round.value, questionId);
  if (updated === round.value) return;
  miniAnswerSound.stop();
  round.value = updated;
  clearAnswer();
}

function retryWrong(): void {
  if (!round.value || !finished.value || !incorrect.value.length) return;
  miniAnswerSound.stop();
  round.value = retryConjugation(round.value);
  retrying.value = true;
  clearAnswer();
}

function chooseVerb(verbId: string): void {
  focusedVerbId.value = verbId;
  invalidVerbId.value = "";
}

function showAllVerbs(): void {
  requestedVerbId.value = "";
  focusedVerbId.value = "";
  invalidVerbId.value = "";
  selectedGroup.value = "all";
}

async function loadAudioVoice(): Promise<void> {
  const ticket = ++voiceRequest;
  const key = defaultRepository.getActiveKey();
  try {
    const snapshot = await defaultRepository.read(key);
    if (ticket === voiceRequest && key === defaultRepository.getActiveKey()) {
      audioVoice.value = snapshot.userSettings?.preferences?.pronunciationVoice === "male" ? "male" : "female";
    }
  } catch {
    if (ticket === voiceRequest) audioVoice.value = "female";
  }
}

onLoad((query) => {
  const verbId = typeof query?.verbId === "string" ? query.verbId.trim() : "";
  if (!verbId) return;
  requestedVerbId.value = verbId;
  if (conjugationVerbs.some((verb) => verb.id === verbId)) focusedVerbId.value = verbId;
  else invalidVerbId.value = verbId;
});
onShow(() => { miniAnswerSound.setForeground(true); void loadAudioVoice(); });
onHide(() => { voiceRequest++; miniAnswerSound.stop(); });
onUnload(() => { voiceRequest++; miniAnswerSound.stop(); });
</script>

<template>
  <MiniPage class="conjugation-page">
    <MiniHeader
      kicker="VERBS IN USE / 動詞"
      title="动词活用"
      description="从原形出发，把动词放进另一句话。"
    />

    <view v-if="round && question" class="card exercise-card motion-enter">
      <view class="exercise-topline">
        <view class="exercise-count">
          <text class="eyebrow">{{ retrying ? "再练一遍" : "本轮练习" }}</text>
          <text>{{ round.index + 1 }} / {{ round.questions.length }}</text>
        </view>
        <button class="text-button" hover-class="practice-pressed" @tap="returnToBrowse">返回浏览</button>
      </view>
      <view class="progress-track" :aria-label="`已完成 ${round.index} 题，共 ${round.questions.length} 题`">
        <view class="progress-fill" :style="{ width: `${progressPercent}%` }" />
      </view>

      <view class="question-word">
        <text class="word-meta">{{ VERB_GROUP_LABELS[question.verb.group] }} · {{ question.verb.meaning }}</text>
        <text class="word-term" lang="ja">{{ question.verb.term }}</text>
        <text class="word-reading" lang="ja">{{ question.verb.reading }}</text>
      </view>

      <text class="target-prompt">请写出它的 <text class="target-form">{{ formLabel(question.form) }}</text></text>
      <text class="sentence-prompt" lang="ja">{{ question.verb.examples[question.form].ja.replace("{answer}", "＿＿") }}</text>

      <view class="answer-area">
        <text class="answer-label">你的答案</text>
        <input
          class="answer-input"
          type="text"
          lang="ja"
          :value="answerInput"
          :disabled="!!result"
          :maxlength="40"
          :ignore-composition-event="false"
          :adjust-position="true"
          :cursor-spacing="24"
          confirm-type="done"
          :confirm-hold="true"
          placeholder="输入汉字或假名"
          aria-label="你的答案"
          @input="onInput"
          @confirm="onConfirm($event, question.id)"
          @blur="onBlur"
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
        />
        <text class="answer-hint">输入完整的动词变化，可用假名或汉字假名。</text>
      </view>

      <view v-if="!result" class="answer-actions">
        <button class="primary-button" hover-class="practice-pressed" :disabled="!answerInput.trim() || composing" @tap="submitAnswer(question.id)">核对答案</button>
        <button class="text-button hint-button" hover-class="practice-pressed" :aria-expanded="showHint" @tap="showHint = !showHint">{{ showHint ? "收起提示" : "给我一点提示" }}</button>
      </view>
      <text v-if="showHint && !result" class="hint-copy">{{ hintFor(question.verb.group) }}</text>

      <view v-if="result && expected" class="answer-feedback" :class="{ incorrect: !result.correct }" role="status">
        <text class="feedback-title">{{ result.correct ? "答对了" : "再看一下这个变化" }}</text>
        <text class="expected-answer" lang="ja">{{ expected.written }} <text class="expected-reading">{{ expected.reading }}</text></text>
        <text class="rule-copy">{{ expected.rule }}</text>
        <view class="example-block">
          <text class="example-ja" lang="ja">{{ example }}</text>
          <MiniSentenceAudio v-if="result" :text="example" :voice="audioVoice" />
          <text class="example-zh">{{ question.verb.examples[question.form].zh }}</text>
        </view>
        <button class="primary-button next-button" hover-class="practice-pressed" @tap="advanceQuestion(question.id)">{{ round.index + 1 === round.questions.length ? "完成本轮" : "下一题" }}</button>
      </view>
    </view>

    <view v-else-if="round && finished" class="card completion-card motion-enter">
      <text class="completion-kicker">PRACTICE COMPLETE</text>
      <text class="completion-title">这一轮变化，练完了。</text>
      <text class="completion-copy">{{ round.questions.length }} 题中答对 {{ correctCount }} 题{{ incorrect.length ? `，还有 ${incorrect.length} 题可以再看一眼。` : "，继续把这些变化用起来。" }}</text>

      <view v-if="incorrect.length" class="correction-list">
        <view v-for="item in incorrect" :key="item.id" class="correction-row">
          <view class="correction-source">
            <text class="correction-word" lang="ja">{{ item.verb.term }}</text>
            <text class="correction-form">{{ formLabel(item.form) }}</text>
          </view>
          <view class="correction-answer">
            <text class="correction-word" lang="ja">{{ conjugate(item.verb, item.form).written }}</text>
            <text class="correction-form" lang="ja">{{ conjugate(item.verb, item.form).reading }}</text>
          </view>
        </view>
      </view>

      <view class="completion-actions">
        <button v-if="incorrect.length" class="primary-button" hover-class="practice-pressed" @tap="retryWrong">只重练错题 · {{ incorrect.length }} 题</button>
        <button class="secondary-button" hover-class="practice-pressed" @tap="startRound">重新开始</button>
        <button class="text-button" hover-class="practice-pressed" @tap="returnToBrowse">返回浏览</button>
      </view>
    </view>

    <view v-else class="browse-view">
      <MiniNotice
        v-if="invalidVerbId"
        message="暂时没有这个动词的活用内容。"
        tone="error"
      />
      <view v-if="invalidVerbId" class="card invalid-card">
        <text class="invalid-copy">返回全部动词后，可以继续浏览和选择练习内容。</text>
        <button class="secondary-button" hover-class="practice-pressed" @tap="showAllVerbs">返回全部动词</button>
      </view>

      <view v-if="focusedVerb" class="card focus-card">
        <view class="focus-copy">
          <text class="focus-label">当前单词</text>
          <text class="focus-term" lang="ja">{{ focusedVerb.term }}</text>
          <text class="focus-reading" lang="ja">{{ focusedVerb.reading }} · {{ focusedVerb.meaning }}</text>
        </view>
        <button class="text-button focus-clear" hover-class="practice-pressed" @tap="showAllVerbs">返回全部动词</button>
        <text class="focus-note">开始后练习这个动词的四种变化，共 4 题。</text>
      </view>

      <view class="card setup-card">
        <text class="section-eyebrow">练习设置</text>
        <text class="section-title">这次练习什么</text>
        <text class="section-copy">可用假名或汉字假名作答。每轮最多 12 题，完成后可以继续下一轮。</text>

        <view class="filter-section">
        <text class="filter-label">{{ focusedVerb ? '浏览变化（练习包含四形）' : '目标变化' }}</text>
          <view class="filter-options" role="group" aria-label="目标变化">
            <button
              v-for="form in CONJUGATION_FORMS"
              :key="form.id"
              class="filter-button"
              :class="{ selected: selectedForm === form.id }"
              :aria-pressed="selectedForm === form.id"
              hover-class="practice-pressed"
              @tap="selectedForm = form.id"
            >{{ form.label }}</button>
          </view>
          <text v-if="currentForm" class="filter-description">{{ currentForm.description }}</text>
        </view>

        <view v-if="!focusedVerb && !invalidVerbId" class="filter-section group-filter">
          <text class="filter-label">动词类型</text>
          <view class="filter-options" role="group" aria-label="动词类型">
            <button
              v-for="group in groups"
              :key="group.id"
              class="filter-button group-button"
              :class="{ selected: selectedGroup === group.id }"
              :aria-pressed="selectedGroup === group.id"
              hover-class="practice-pressed"
              @tap="selectedGroup = group.id"
            >{{ group.label }}</button>
          </view>
        </view>

        <button class="primary-button start-button" hover-class="practice-pressed" :disabled="!questionCount" @tap="startRound">
          开始练习 · {{ questionCount }} 题
        </button>
      </view>

      <view class="list-heading">
        <view>
          <text class="section-eyebrow">VERB LIST</text>
          <text class="list-title">{{ focusedVerb ? "这个动词的变化" : "常用动词" }}</text>
        </view>
        <text class="list-count">{{ visibleVerbs.length }} / {{ conjugationVerbs.length }}</text>
      </view>

      <view class="verb-list">
        <view v-for="verb in visibleVerbs" :key="verb.id" class="card verb-card">
          <view class="verb-heading">
            <view class="verb-copy">
              <text class="verb-term" lang="ja">{{ verb.term }}</text>
              <text class="verb-reading" lang="ja">{{ verb.reading }}</text>
              <text class="verb-meaning">{{ verb.meaning }}</text>
            </view>
            <text class="group-tag">{{ VERB_GROUP_LABELS[verb.group] }}</text>
          </view>
          <view class="form-preview">
            <text class="preview-label">{{ currentForm?.label }}</text>
            <text class="preview-answer" lang="ja">{{ conjugate(verb, selectedForm).written }}</text>
            <text class="preview-reading" lang="ja">{{ conjugate(verb, selectedForm).reading }}</text>
          </view>
          <button class="secondary-button verb-select" hover-class="practice-pressed" @tap="chooseVerb(verb.id)">只练这个动词 · 4 题</button>
        </view>
      </view>

    </view>
    <text class="practice-footnote">本次是用法练习，不改变词书复习进度。</text>
  </MiniPage>
</template>

<style scoped>
.conjugation-page { padding-bottom: calc(36rpx + env(safe-area-inset-bottom)); }
.card { box-sizing: border-box; min-width: 0; margin: 0 0 22rpx; padding: 28rpx; border: 1rpx solid var(--kotoba-line); border-radius: 26rpx; background: var(--kotoba-paper); box-shadow: 0 10rpx 28rpx rgba(35,57,46,.04); }
.eyebrow, .section-eyebrow, .completion-kicker { display: block; color: var(--kotoba-green); font-size: 20rpx; font-weight: 700; letter-spacing: 2rpx; }
.setup-card { margin-bottom: 30rpx; }
.section-title { display: block; margin-top: 8rpx; color: var(--kotoba-ink); font-size: 34rpx; font-weight: 700; line-height: 1.4; }
.section-copy, .filter-description, .practice-footnote { display: block; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.7; }
.section-copy { margin: 8rpx 0 24rpx; }
.filter-section { margin-top: 20rpx; }
.filter-label { display: block; margin-bottom: 10rpx; color: var(--kotoba-ink); font-size: 25rpx; font-weight: 600; }
.filter-options { display: flex; flex-wrap: wrap; gap: 12rpx; min-width: 0; }
.filter-button { flex: 1 1 21%; min-width: 0; min-height: 92rpx; margin: 0; padding: 10rpx 12rpx; border: 1rpx solid var(--kotoba-line); border-radius: 16rpx; color: var(--kotoba-muted); background: #fffcf5; font-size: 24rpx; line-height: 1.35; }
.filter-button.selected { border-color: #9ab28e; color: var(--kotoba-green); background: #e8efdf; font-weight: 700; }
.group-filter { margin-top: 24rpx; }
.group-button { flex-basis: 42%; }
.filter-description { margin-top: 10rpx; }
.primary-button, .secondary-button, .text-button { box-sizing: border-box; min-width: 0; min-height: 96rpx; margin: 0; padding: 14rpx 20rpx; border-radius: 16rpx; font-size: 26rpx; line-height: 1.4; text-align: center; white-space: normal; }
.primary-button { border: 1rpx solid var(--kotoba-green); color: #fff; background: var(--kotoba-green); font-weight: 700; }
.secondary-button { border: 1rpx solid #cbd9c4; color: var(--kotoba-green); background: #f2f6ec; font-weight: 600; }
.text-button { border: 1rpx solid transparent; color: var(--kotoba-green); background: transparent; }
.start-button, .next-button { width: 100%; margin-top: 24rpx; }
.focus-card { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx 18rpx; margin-bottom: 18rpx; border-left: 6rpx solid #9bb78f; }
.focus-copy { flex: 1 1 200rpx; min-width: 0; }
.focus-label { display: block; margin-bottom: 4rpx; color: var(--kotoba-muted); font-size: 22rpx; }
.focus-term { display: block; color: var(--kotoba-ink); font-size: 38rpx; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
.focus-reading { display: block; color: var(--kotoba-muted); font-size: 24rpx; overflow-wrap: anywhere; }
.focus-clear { flex: 0 1 auto; padding: 10rpx; }
.focus-note { flex-basis: 100%; color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.6; }
.invalid-card { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; }
.invalid-copy { flex: 1 1 100%; color: var(--kotoba-error); font-size: 24rpx; line-height: 1.7; }
.invalid-card button { width: 100%; }
.list-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 14rpx; margin: 26rpx 2rpx 16rpx; }
.list-title { display: block; margin-top: 4rpx; color: var(--kotoba-ink); font-size: 32rpx; font-weight: 700; }
.list-count { flex: none; color: var(--kotoba-muted); font-size: 23rpx; }
.verb-card { margin-bottom: 16rpx; padding: 24rpx; }
.verb-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12rpx; min-width: 0; }
.verb-copy { display: flex; flex: 1; flex-wrap: wrap; align-items: baseline; gap: 0 12rpx; min-width: 0; }
.verb-term { color: var(--kotoba-ink); font-size: 33rpx; font-weight: 700; line-height: 1.35; }
.verb-reading, .verb-meaning { color: var(--kotoba-muted); font-size: 23rpx; overflow-wrap: anywhere; }
.group-tag { flex: none; max-width: 40%; padding: 7rpx 12rpx; border-radius: 999rpx; color: var(--kotoba-green); background: #edf3e7; font-size: 21rpx; line-height: 1.4; text-align: center; }
.form-preview { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4rpx 12rpx; margin: 16rpx 0 10rpx; padding: 14rpx 16rpx; border-radius: 14rpx; background: #f5f6ef; }
.preview-label { flex-basis: 100%; color: var(--kotoba-muted); font-size: 20rpx; }
.preview-answer { color: var(--kotoba-ink); font-size: 29rpx; font-weight: 600; overflow-wrap: anywhere; }
.preview-reading { color: var(--kotoba-muted); font-size: 23rpx; overflow-wrap: anywhere; }
.verb-select { width: 100%; }
.exercise-card { padding: 28rpx; }
.exercise-topline { display: flex; align-items: center; justify-content: space-between; gap: 10rpx; }
.exercise-count { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6rpx 14rpx; color: var(--kotoba-muted); font-size: 23rpx; }
.exercise-topline .text-button { flex: 0 0 auto; padding: 8rpx 10rpx; }
.progress-track { height: 12rpx; margin: 16rpx 0 30rpx; overflow: hidden; border-radius: 999rpx; background: #e3e9de; }
.progress-fill { height: 100%; border-radius: inherit; background: var(--kotoba-green); transition: width 220ms ease; }
.question-word { padding: 24rpx 18rpx; border-radius: 20rpx 6rpx 20rpx 20rpx; background: #edf3e7; text-align: center; }
.word-meta { display: block; color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.6; }
.word-term { display: block; margin-top: 6rpx; color: var(--kotoba-ink); font-family: "Songti SC", "Noto Serif CJK JP", serif; font-size: 50rpx; line-height: 1.45; overflow-wrap: anywhere; }
.word-reading { display: block; margin-top: 2rpx; color: var(--kotoba-muted); font-size: 27rpx; }
.target-prompt { display: block; margin: 26rpx 0 12rpx; color: var(--kotoba-ink); font-size: 27rpx; }
.target-form { margin-left: 5rpx; color: var(--kotoba-green); font-weight: 700; }
.sentence-prompt { display: block; margin-bottom: 24rpx; color: var(--kotoba-ink); font-family: "Songti SC", "Noto Serif CJK JP", serif; font-size: 31rpx; line-height: 1.8; overflow-wrap: anywhere; }
.answer-label { display: block; margin-bottom: 10rpx; color: var(--kotoba-muted); font-size: 24rpx; font-weight: 600; }
.answer-input { box-sizing: border-box; display: block; width: 100%; min-width: 0; height: 108rpx; min-height: 54px; padding: 14rpx 18rpx; border: 1rpx solid #aab9a5; border-radius: 16rpx; color: var(--kotoba-ink); background: var(--kotoba-paper); font-size: 36rpx; line-height: 1.5; }
.answer-input:focus { border-color: var(--kotoba-green); outline: 2rpx solid var(--kotoba-green); outline-offset: 2rpx; }
.answer-input[disabled] { background: var(--kotoba-bg); color: var(--kotoba-muted); }
.answer-hint { display: block; margin-top: 10rpx; color: var(--kotoba-muted); font-size: 22rpx; line-height: 1.6; }
.answer-actions { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 22rpx; }
.answer-actions .primary-button { flex: 1 1 100%; }
.hint-button { flex: 1 1 100%; }
.hint-copy { display: block; margin-top: 12rpx; padding: 16rpx 2rpx 2rpx; border-top: 1rpx solid var(--kotoba-line); color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.7; overflow-wrap: anywhere; }
.answer-feedback { margin-top: 22rpx; padding: 22rpx; border: 1rpx solid #c8d9bc; border-radius: 18rpx; color: var(--kotoba-ink); background: #eef4e9; }
.answer-feedback.incorrect { border-color: #e0d2b3; background: #f8f3e7; }
.feedback-title { display: block; color: var(--kotoba-green); font-size: 28rpx; font-weight: 700; }
.answer-feedback.incorrect .feedback-title { color: #795722; }
.expected-answer { display: block; margin: 12rpx 0 8rpx; color: var(--kotoba-ink); font-size: 39rpx; font-weight: 700; line-height: 1.5; overflow-wrap: anywhere; }
.expected-reading { display: inline; margin-left: 8rpx; color: var(--kotoba-muted); font-size: 25rpx; font-weight: 400; }
.rule-copy { display: block; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.8; overflow-wrap: anywhere; }
.example-block { margin-top: 18rpx; padding-top: 16rpx; border-top: 1rpx solid #d8e2cf; }
.example-ja, .example-zh { display: block; overflow-wrap: anywhere; }
.example-ja { color: var(--kotoba-ink); font-family: "Songti SC", "Noto Serif CJK JP", serif; font-size: 29rpx; line-height: 1.8; }
.example-zh { margin-top: 4rpx; color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.7; }
.next-button { margin-top: 20rpx; }
.completion-card { padding: 32rpx 28rpx; text-align: center; }
.completion-kicker { margin-bottom: 10rpx; }
.completion-title { display: block; color: var(--kotoba-ink); font-size: 37rpx; font-weight: 700; line-height: 1.5; }
.completion-copy { display: block; margin-top: 10rpx; color: var(--kotoba-muted); font-size: 25rpx; line-height: 1.7; }
.correction-list { margin-top: 20rpx; text-align: left; }
.correction-row { display: flex; justify-content: space-between; gap: 12rpx; padding: 16rpx 0; border-top: 1rpx solid var(--kotoba-line); }
.correction-source, .correction-answer { flex: 1; min-width: 0; }
.correction-answer { text-align: right; }
.correction-word, .correction-form { display: block; overflow-wrap: anywhere; }
.correction-word { color: var(--kotoba-ink); font-size: 29rpx; font-weight: 600; }
.correction-form { margin-top: 3rpx; color: var(--kotoba-muted); font-size: 22rpx; }
.completion-actions { display: flex; flex-direction: column; gap: 12rpx; margin-top: 22rpx; }
.completion-actions button { width: 100%; }
.practice-footnote { margin: 20rpx 4rpx 0; text-align: center; }
.practice-pressed { opacity: .8; }
button[disabled] { opacity: .48; }
@media (min-width: 700px) {
  .conjugation-page { max-width: 920rpx; margin: 0 auto; }
  .verb-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16rpx; }
  .verb-card { margin-bottom: 0; }
}
</style>
