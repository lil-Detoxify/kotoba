<script setup lang="ts">
import { computed, ref, shallowRef, watch, onUnmounted } from 'vue';
import MiniSentenceAudio from './MiniSentenceAudio.vue';
import { miniAnswerSound } from '../services/answer-sound';
import { taskForScene, createSceneTaskRun, currentSceneTaskStep, confirmSceneTaskAnswer,
  advanceSceneTask, summarizeSceneTask, retrySceneTaskMistakes,
  previousSceneTaskSteps, correctSceneTaskOption, type SceneTaskRun } from '../services/learning-scenes';
const props = withDefaults(defineProps<{ sceneId: string; voice?: 'female' | 'male' }>(), { voice: 'female' });
const emit = defineEmits<{ active: [value: boolean] }>();
const task = computed(() => taskForScene(props.sceneId));
const run = shallowRef<SceneTaskRun | null>(null);
const selected = ref('');
const help = ref(false);
const recap = ref(false);
const step = computed(() => task.value && run.value ? currentSceneTaskStep(task.value, run.value) : undefined);
const answer = computed(() => step.value && run.value ? run.value.answers[step.value.id] : undefined);
const chosen = computed(() => step.value?.options.find(option => option.id === answer.value?.optionId));
const correct = computed(() => step.value && correctSceneTaskOption(step.value));
const summary = computed(() => task.value && run.value ? summarizeSceneTask(task.value, run.value) : undefined);
const prior = computed(() => task.value && step.value ? previousSceneTaskSteps(task.value, step.value.id) : []);
function correctExampleFor(previous: Parameters<typeof correctSceneTaskOption>[0]): string {
  return correctSceneTaskOption(previous)?.ja ?? '';
}
function currentCorrectExample(): string { return correct.value?.ja ?? ''; }
function reset() { miniAnswerSound.stop(); run.value = null; selected.value = ''; help.value = false; recap.value = false; }
function start() { reset(); if (task.value) run.value = createSceneTaskRun(task.value); }
function confirm() {
  if (!task.value || !run.value || !selected.value || answer.value) return;
  run.value = confirmSceneTaskAnswer(task.value, run.value, selected.value);
  const confirmed = step.value && run.value.answers[step.value.id];
  if (confirmed) void miniAnswerSound.play(confirmed.correct);
}
function next() {
  if (!task.value || !run.value || !answer.value) return;
  miniAnswerSound.stop();
  run.value = advanceSceneTask(task.value, run.value);
  selected.value = ''; help.value = false; recap.value = false;
}
function retry() {
  if (!task.value || !run.value) return;
  miniAnswerSound.stop();
  run.value = retrySceneTaskMistakes(task.value, run.value);
  selected.value = ''; help.value = false; recap.value = false;
}
watch(() => props.sceneId, reset);
watch(() => !!run.value, active => emit('active', active), { immediate: true });
onUnmounted(() => miniAnswerSound.stop());
</script>

<template>
  <view v-if="task" class="card scene-task">
    <view v-if="!run" class="task-entry">
      <text class="eyebrow">YOUR TURN / 轮到你回应</text>
      <text class="section-title">把对话接下去</text>
      <text class="body-copy">{{ task.setting }}。你来当{{ task.role }}，用 {{ task.steps.length }} 步走完这段情境。</text>
      <button class="primary-btn task-start" @tap="start">开始回应练习</button>
      <text class="small-note">短任务只反馈本次表现，不改变词书复习进度。</text>
    </view>
    <view v-else-if="summary?.complete" class="task-result">
      <text class="eyebrow">这一段，已经走完</text>
      <text class="section-title">{{ summary.correct }} / {{ summary.total }} 步回应合适</text>
      <text v-if="run.mode === 'mistakes'" class="small-note">初轮答对 {{ summary.firstCorrect }} / {{ summary.firstTotal }} 步</text>
      <view class="result-lines"><text v-for="id in run.stepIds" :key="id" class="result-line">{{ run.answers[id]?.correct ? '答对' : '再练一次' }} · {{ task.steps.find(item => item.id === id)?.context }}</text></view>
      <button v-if="summary.mistakeIds.length" class="primary-btn task-retry" @tap="retry">只练习答错的步骤</button>
      <button class="secondary-btn" @tap="start">重新走一遍</button>
      <button class="secondary-btn task-exit" @tap="reset">返回场景内容</button>
    </view>
    <view v-else-if="step" class="task-round">
      <view class="task-topline"><text>{{ run.mode === 'mistakes' ? '错步重练' : '回应练习' }} · {{ run.index + 1 }} / {{ run.stepIds.length }}</text><button class="text-button task-exit" @tap="reset">退出练习</button></view>
      <text class="section-title">{{ task.title }}</text>
      <text class="body-copy">{{ step.context }}</text>
      <view v-if="run.mode === 'mistakes' && prior.length" class="recap">
        <button class="secondary-btn recap-toggle" :aria-expanded="recap" @tap="recap = !recap">{{ recap ? '收起前文' : '看看前文，接回这个情境' }}</button>
        <view v-if="recap" class="recap-lines"><view v-for="previous in prior" :key="previous.id"><text>{{ previous.speaker }}：{{ previous.prompt.ja }}</text><MiniSentenceAudio :text="previous.prompt.ja" :voice="voice" /><text>你：{{ correctExampleFor(previous) }}</text><MiniSentenceAudio v-if="correctExampleFor(previous)" :text="correctExampleFor(previous)" :voice="voice" /></view></view>
      </view>
      <view class="task-prompt"><text class="speaker">{{ step.speaker }}说</text><text class="japanese">{{ step.prompt.ja }}</text><MiniSentenceAudio v-if="answer" :text="step.prompt.ja" :voice="voice" /><text v-if="help" class="reading">{{ step.prompt.reading }}</text><text v-if="help" class="translation">{{ step.prompt.zh }}</text></view>
      <view class="choice-heading"><text>你会怎样回应？</text><button class="text-button task-help" :aria-pressed="help" @tap="help = !help">{{ help ? '收起读音与中文' : '显示读音与中文' }}</button></view>
      <view class="task-options"><button v-for="option in step.options" :key="option.id" class="task-option" :class="{ selected: selected === option.id, correct: answer && option.id === step.correctOptionId }" :disabled="!!answer" :aria-pressed="selected === option.id" @tap="selected = option.id"><text class="option-ja">{{ option.ja }}</text><text v-if="help" class="reading">{{ option.reading }}</text><text v-if="help" class="translation">{{ option.zh }}</text></button></view>
      <button v-if="!answer" class="primary-btn task-confirm" :disabled="!selected" @tap="confirm">确认回应</button>
      <view v-else class="task-feedback" :class="{ incorrect: !answer.correct }" role="status">
        <text class="feedback-title">{{ answer.correct ? '这句回应很合适' : '看看更合适的回应' }}</text>
        <text>{{ chosen?.feedback }}</text><text class="correct-response">{{ correct?.ja }}</text><MiniSentenceAudio v-if="currentCorrectExample()" :text="currentCorrectExample()" :voice="voice" /><text class="reading">{{ correct?.reading }}</text><text>{{ correct?.zh }}</text><text class="feedback-tip">{{ step.tip }}</text>
      </view>
      <button v-if="answer" class="primary-btn task-next" @tap="next">{{ run.index + 1 === run.stepIds.length ? '完成这一段' : '接着回应' }}</button>
    </view>
  </view>
</template>

<style scoped>
.scene-task { padding: 32rpx; color: var(--kotoba-ink); background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); border-radius: 24rpx; }
.scene-task text { overflow-wrap: anywhere; }
.eyebrow, .small-note, .speaker { display: block; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.7; }
.section-title { display: block; margin: 12rpx 0 20rpx; color: var(--kotoba-green); font-size: 36rpx; font-weight: 700; line-height: 1.5; }
.body-copy { display: block; font-size: 28rpx; line-height: 1.8; margin-bottom: 24rpx; }
.scene-task button { min-height: 48px; margin: 16rpx 0; line-height: 1.5; font-size: 28rpx; white-space: normal; }
.task-topline, .choice-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8rpx; color: var(--kotoba-muted); font-size: 24rpx; }
.text-button { padding: 12rpx 16rpx; margin: 0 !important; border: 0; color: var(--kotoba-green); background: transparent; font-size: 24rpx !important; }
.text-button::after { border: 0; }
.task-prompt { padding: 24rpx; margin: 24rpx 0; background: var(--kotoba-sage); border-radius: 18rpx; }
.japanese { display: block; margin-top: 12rpx; font-family: "Songti SC", "Noto Serif CJK JP", serif; font-size: 38rpx; line-height: 1.75; }
.reading, .translation { display: block; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.75; margin-top: 8rpx; }
.task-option { width: 100%; text-align: left; padding: 24rpx; color: var(--kotoba-ink); background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); border-radius: 18rpx; }
.task-option.selected { border-color: var(--kotoba-green); background: var(--kotoba-sage); }
.task-option.correct { border-color: var(--kotoba-green); }
.task-option[disabled] { opacity: .85; color: var(--kotoba-ink); }
.option-ja { display: block; font-size: 31rpx; line-height: 1.7; }
.task-feedback { display: flex; flex-direction: column; gap: 12rpx; padding: 24rpx; border: 1rpx solid var(--kotoba-line); border-radius: 18rpx; background: var(--kotoba-sage); color: var(--kotoba-green); font-size: 26rpx; line-height: 1.75; }
.task-feedback.incorrect { background: #faf3eb; color: #694b37; border-color: #e5d2bb; }
.feedback-title { font-weight: 700; font-size: 30rpx; }.correct-response { font-size: 33rpx; }.feedback-tip { margin-top: 8rpx; }
.recap-lines { font-size: 25rpx; line-height: 1.8; padding: 16rpx; border-left: 2px solid var(--kotoba-line); }.recap-lines text { display: block; }.recap-lines view { margin-bottom: 12rpx; }
.result-lines { margin: 24rpx 0; }.result-line { display: block; padding: 16rpx 0; border-bottom: 1rpx solid var(--kotoba-line); font-size: 26rpx; line-height: 1.7; }
</style>
