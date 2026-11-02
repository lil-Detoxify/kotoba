<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue';
import { ArrowRight, Check, MessageCircle, RotateCcw, Volume2, X } from 'lucide-vue-next';
import { useApp } from '../store';
import { playAnswerSound, stopAnswerSound } from '../services/answer-sound';
import type { usePronunciation } from '../composables/usePronunciation';
import {
  advanceSceneTask, confirmSceneTaskAnswer, correctSceneTaskOption, createSceneTaskRun,
  currentSceneTaskStep, previousSceneTaskSteps, retrySceneTaskMistakes, summarizeSceneTask,
  taskForScene, type SceneTaskRun,
} from '../services/scene-task';

const props = defineProps<{ sceneId: string; pronunciation: ReturnType<typeof usePronunciation> }>();
const emit = defineEmits<{ active: [value: boolean] }>();
const app = useApp();
const pronunciation = props.pronunciation;
const task = computed(() => taskForScene(props.sceneId));
const run = shallowRef<SceneTaskRun>();
const selectedId = ref('');
const showHelp = ref(false);
const stepHeading = ref<HTMLElement>();
const feedbackPanel = ref<HTMLElement>();
const completionHeading = ref<HTMLElement>();
let viewGeneration = 0;

const step = computed(() => task.value && run.value ? currentSceneTaskStep(task.value, run.value) : undefined);
const answer = computed(() => step.value && run.value ? run.value.answers[step.value.id] : undefined);
const chosenOption = computed(() => step.value?.options.find(option => option.id === answer.value?.optionId));
const correctOption = computed(() => step.value ? correctSceneTaskOption(step.value) : undefined);
const summary = computed(() => task.value && run.value ? summarizeSceneTask(task.value, run.value) : undefined);
const priorSteps = computed(() => task.value && step.value ? previousSceneTaskSteps(task.value, step.value.id) : []);
const actualStepNumber = computed(() => task.value && step.value ? task.value.steps.indexOf(step.value) + 1 : 0);

function reset() {
  viewGeneration++;
  stopAnswerSound();
  pronunciation.stop();
  run.value = undefined;
  selectedId.value = '';
  showHelp.value = false;
}

async function focusCurrent() {
  const generation = viewGeneration;
  await nextTick();
  if (generation !== viewGeneration) return;
  if (summary.value?.complete) completionHeading.value?.focus();
  else stepHeading.value?.focus();
}

function start() {
  if (!task.value) return;
  reset();
  run.value = createSceneTaskRun(task.value);
  void focusCurrent();
}

function confirmAnswer() {
  if (!task.value || !run.value || !selectedId.value || answer.value) return;
  const previous = run.value;
  const confirmed = confirmSceneTaskAnswer(task.value, previous, selectedId.value);
  if (confirmed === previous) return;
  run.value = confirmed;
  pronunciation.stop();
  const savedAnswer = confirmed.answers[confirmed.stepIds[confirmed.index]];
  if (savedAnswer) void playAnswerSound(savedAnswer.correct);
  const generation = viewGeneration;
  void nextTick().then(() => { if (generation === viewGeneration) feedbackPanel.value?.focus(); });
}

function nextStep() {
  if (!task.value || !run.value || !answer.value) return;
  const next = advanceSceneTask(task.value, run.value);
  if (next === run.value) return;
  viewGeneration++;
  stopAnswerSound();
  pronunciation.stop();
  run.value = next;
  selectedId.value = '';
  showHelp.value = false;
  void focusCurrent();
}

function retryMistakes() {
  if (!task.value || !run.value) return;
  const retry = retrySceneTaskMistakes(task.value, run.value);
  if (retry === run.value) return;
  viewGeneration++;
  stopAnswerSound();
  pronunciation.stop();
  run.value = retry;
  selectedId.value = '';
  showHelp.value = false;
  void focusCurrent();
}

async function speak(text: string, reading = '') {
  stopAnswerSound();
  await pronunciation.playSentence(text, reading);
}

watch(() => [props.sceneId, app.currentUser?.id ?? null], reset, { flush: 'sync' });
watch(() => Boolean(run.value), active => emit('active', active), { immediate: true, flush: 'sync' });
onUnmounted(reset);
</script>

<template>
  <section v-if="task" class="scene-task" :aria-label="`${task.title}回应练习`">
    <template v-if="!run">
      <div class="task-entry-copy">
        <p class="eyebrow">YOUR TURN TO RESPOND</p>
        <h2><MessageCircle :size="21" aria-hidden="true"/>把对话接下去</h2>
        <p class="entry-description">{{ task.title }}。你来当{{ task.role }}，用 {{ task.steps.length }} 步回应走完这段情境。</p>
        <p class="task-progress-note">本次任务练习不改变词书复习进度。</p>
      </div>
      <button type="button" class="primary task-start" @click="start">开始回应练习 <ArrowRight :size="17" aria-hidden="true"/></button>
    </template>

    <template v-else-if="step && !summary?.complete">
      <div class="task-topline">
        <span class="task-position">{{ run.mode === 'mistakes' ? '错步重练' : '回应练习' }} · {{ run.index + 1 }} / {{ run.stepIds.length }}<small v-if="run.mode === 'mistakes'"> · 原情境第 {{ actualStepNumber }} 步</small></span>
        <button type="button" class="task-exit" @click="reset"><X :size="16" aria-hidden="true"/>退出练习</button>
      </div>
      <h2 ref="stepHeading" class="task-step-title" tabindex="-1">{{ task.title }}</h2>
      <p class="task-role">你是{{ task.role }}</p>
      <p class="task-context">{{ step.context }}</p>

      <details v-if="run.mode === 'mistakes' && priorSteps.length" class="task-recap">
        <summary>看看前文，接回这个情境</summary>
        <div v-for="previous in priorSteps" :key="previous.id" class="recap-line">
          <p><span>{{ previous.speaker }}</span><span lang="ja">{{ previous.prompt.ja }}</span></p>
          <p><span>你</span><span lang="ja">{{ correctSceneTaskOption(previous)?.ja }}</span></p>
        </div>
      </details>

      <div class="task-prompt">
        <div class="task-prompt-heading"><span class="task-speaker">{{ step.speaker }}说</span><button type="button" class="task-audio" :aria-label="`朗读对方的话：${step.prompt.ja}`" :disabled="pronunciation.sentenceSpeaking.value || !pronunciation.canPlaySentence(step.prompt.ja)" @click="speak(step.prompt.ja, step.prompt.reading)"><Volume2 :size="16" aria-hidden="true"/>听听对方的话</button></div>
        <p lang="ja" class="task-japanese">{{ step.prompt.ja }}</p>
        <template v-if="showHelp">
          <p lang="ja" class="task-reading">{{ step.prompt.reading }}</p>
          <p class="task-translation">{{ step.prompt.zh }}</p>
        </template>
        <small class="task-audio-source">{{ pronunciation.sentenceSourceLabel(step.prompt.ja) }}</small>
      </div>
      <p v-if="pronunciation.sentenceError.value" class="task-audio-error" role="status">{{ pronunciation.sentenceError.value }}</p>

      <div class="task-choice-heading">
        <p :id="`task-choice-${task.id}`">你会怎样回应？</p>
        <button type="button" class="task-help" :aria-pressed="showHelp" @click="showHelp = !showHelp">{{ showHelp ? '收起读音与中文' : '显示读音与中文' }}</button>
      </div>
      <fieldset class="task-options" :aria-labelledby="`task-choice-${task.id}`" :disabled="Boolean(answer)">
        <label v-for="option in step.options" :key="option.id" class="task-option" :class="{
          selected: selectedId === option.id,
          correct: answer && option.id === step.correctOptionId,
          incorrect: answer && !answer.correct && option.id === answer.optionId,
        }">
          <input v-model="selectedId" type="radio" :name="`response-${task.id}-${step.id}`" :value="option.id"/>
          <span class="task-option-copy">
            <span lang="ja" class="task-japanese">{{ option.ja }}</span>
            <template v-if="showHelp"><span lang="ja" class="task-reading">{{ option.reading }}</span><span class="task-translation">{{ option.zh }}</span></template>
            <span v-if="answer && option.id === step.correctOptionId" class="task-option-status"><Check :size="14" aria-hidden="true"/>适合这一步</span>
            <span v-else-if="answer && !answer.correct && option.id === answer.optionId" class="task-option-status">这次选择</span>
          </span>
        </label>
      </fieldset>

      <div v-if="answer && chosenOption" ref="feedbackPanel" class="task-feedback" :class="{ 'needs-practice': !answer.correct }" tabindex="-1" role="status" aria-live="polite">
        <strong>{{ answer.correct ? '回应合适' : '换个回应会更合适' }}</strong>
        <p>{{ chosenOption.feedback }}</p>
        <p v-if="!answer.correct && correctOption" class="task-better-response">可以这样说：<span lang="ja">{{ correctOption.ja }}</span></p>
        <div v-if="correctOption" class="task-response-audio"><button type="button" class="task-audio" :aria-label="`朗读合适回应：${correctOption.ja}`" :disabled="pronunciation.sentenceSpeaking.value || !pronunciation.canPlaySentence(correctOption.ja)" @click="speak(correctOption.ja, correctOption.reading)"><Volume2 :size="16" aria-hidden="true"/>听听合适回应</button><small class="task-audio-source">{{ pronunciation.sentenceSourceLabel(correctOption.ja) }}</small></div>
        <p class="task-tip">{{ step.tip }}</p>
      </div>
      <div class="task-bottomline">
        <p class="task-progress-note">本次任务练习不改变词书复习进度。</p>
        <button v-if="!answer" type="button" class="primary" :disabled="!selectedId" @click="confirmAnswer">确认回应 <Check :size="16" aria-hidden="true"/></button>
        <button v-else type="button" class="primary" @click="nextStep">{{ run.index + 1 < run.stepIds.length ? '继续下一步' : '看看任务结果' }} <ArrowRight :size="16" aria-hidden="true"/></button>
      </div>
    </template>

    <template v-else-if="summary?.complete">
      <div class="task-completion">
        <p class="eyebrow">A LITTLE MORE CONFIDENT</p>
        <h2 ref="completionHeading" tabindex="-1">{{ run.mode === 'mistakes' ? '这轮重练，完成了。' : '这段情境，走完了。' }}</h2>
        <p class="task-score">{{ run.mode === 'mistakes' ? '本轮重练' : '本次回应' }} {{ summary.correct }} / {{ summary.total }} 步合适<span v-if="run.mode === 'mistakes'"> · 首轮 {{ summary.firstCorrect }} / {{ summary.firstTotal }} 步</span></p>
        <p class="task-can-do"><span>这次练习了</span>{{ task.canDo }}</p>
        <p v-if="summary.mistakeIds.length" class="task-completion-note">还有 {{ summary.mistakeIds.length }} 步可以再试一次，前文会保留在回顾中。</p>
        <p v-else class="task-completion-note">可以再走一遍，试着收起中文，直接用日语回应。</p>
        <div class="task-completion-actions">
          <button v-if="summary.mistakeIds.length" type="button" class="primary" @click="retryMistakes">只重练错的 {{ summary.mistakeIds.length }} 步 <ArrowRight :size="16" aria-hidden="true"/></button>
          <button type="button" :class="{ primary: !summary.mistakeIds.length }" @click="start"><RotateCcw :size="16" aria-hidden="true"/>重新走一遍</button>
          <button type="button" @click="reset">回到场景内容</button>
        </div>
        <p class="task-progress-note">本次任务练习不改变词书复习进度。</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.task-prompt-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px}.task-prompt-heading .task-speaker{margin:0}.task-audio{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:7px 10px;background:transparent;border-color:var(--line,#dfe5db);color:var(--green,#365e44)}.task-audio-source{display:block;margin-top:7px;font-size:10px;line-height:1.6;color:var(--muted,#63715e)}.task-response-audio{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}.task-response-audio .task-audio-source{margin:0}.task-audio-error{font-size:12px;line-height:1.7;color:var(--muted,#63715e);margin:8px 0 0}
.scene-task{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0 0 32px;padding:24px;background:var(--paper,#fffefb);border:1px solid #bccbb0;border-radius:12px;min-width:0}
.scene-task:has(.task-topline),.scene-task:has(.task-completion){display:block}
.scene-task .eyebrow{margin:0 0 8px;color:var(--muted,#63715e)}
.task-entry-copy{min-width:0;max-width:620px}.task-entry-copy h2{display:flex;align-items:center;gap:9px;margin:0;color:var(--text,#314e3d);font-size:20px;line-height:1.5}
.entry-description{margin:10px 0 0;color:var(--muted,#63715e);font-size:14px;line-height:1.8;overflow-wrap:anywhere}
.task-start{flex-shrink:0}.scene-task button{min-height:44px;gap:7px}.scene-task button:focus-visible,.task-option:focus-within,.task-recap summary:focus-visible{outline:3px solid #b08037;outline-offset:3px}
.task-topline{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px}.task-position{color:var(--muted,#63715e);font-size:13px;line-height:1.6}.task-position small{font-size:12px}.task-exit,.task-help{font-size:12px;padding:8px 12px;background:transparent}
.task-step-title{font-size:22px;margin:0 0 6px;line-height:1.6;scroll-margin-top:20px}.task-step-title:focus,.task-completion h2:focus,.task-feedback:focus{outline:none}
.task-role{font-size:13px;color:var(--muted,#63715e);margin:0 0 18px}.task-context{font-size:15px;line-height:1.8;margin:0 0 20px;color:var(--text,#314e3d);overflow-wrap:anywhere}
.task-prompt{padding:18px 20px;border-left:3px solid #829975;background:var(--sage-light,#edf1e6)}.task-speaker{display:block;font-size:12px;color:var(--muted,#63715e);margin-bottom:7px}
.task-japanese{display:block;margin:0;font-size:18px;line-height:1.8;color:var(--text,#314e3d);overflow-wrap:anywhere}.task-reading,.task-translation{display:block;font-size:13px;line-height:1.8;margin:5px 0 0;color:var(--muted,#63715e);overflow-wrap:anywhere}
.task-choice-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:20px 0 10px}.task-choice-heading p{font-size:14px;margin:0;color:var(--text,#314e3d);font-weight:600}
.task-options{border:0;margin:0;padding:0;display:grid;gap:10px;min-width:0}.task-option{min-height:56px;display:flex;align-items:flex-start;gap:12px;padding:12px 15px;border:1px solid var(--line,#dfe5db);border-radius:8px;background:var(--paper,#fffefb);cursor:pointer;transition:background .15s,border-color .15s}
.task-option:hover{border-color:#9db58e}.task-option.selected{border-color:#8ca67d;background:#f3f6ee}.scene-task .task-option input[type=radio]{width:18px;height:18px;flex-shrink:0;margin:8px 0 0;padding:0;border:0;background:transparent;accent-color:var(--green)}.task-option-copy{display:block;min-width:0;flex:1}.task-option-copy .task-japanese{font-size:16px}.task-option-status{display:inline-flex;align-items:center;gap:5px;margin-top:5px;font-size:12px;color:var(--text,#314e3d)}
.task-options:disabled .task-option{cursor:default}.task-option.correct{border-color:#8fa477;background:#eaf0e1}.task-option.incorrect{border-color:#b99c71;background:#f8f2e7}.task-options:disabled input{opacity:.65}
.task-feedback{margin-top:20px;padding:17px 20px;border-top:1px solid #becdb3;background:#f0f4e9;scroll-margin-top:20px}.task-feedback.needs-practice{border-color:#cfb58e;background:#faf5eb}.task-feedback strong{font-size:15px;color:var(--text,#314e3d)}.task-feedback p{font-size:14px;line-height:1.8;margin:7px 0 0;overflow-wrap:anywhere}.task-feedback .task-better-response span{display:block;margin-top:5px;font-size:17px}.task-feedback .task-tip{border-top:1px solid var(--line,#dfe5db);padding-top:10px;margin-top:11px;color:var(--muted,#63715e);font-size:13px}
.task-bottomline{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:18px}.task-progress-note{margin:11px 0 0;color:var(--muted,#63715e);font-size:12px;line-height:1.7}.task-bottomline .task-progress-note{margin:0}.task-bottomline>button{flex-shrink:0}
.task-recap{margin:0 0 20px;border-block:1px solid var(--line,#dfe5db);padding:8px 0}.task-recap summary{min-height:44px;align-content:center;cursor:pointer;font-size:13px;color:var(--muted,#63715e)}.recap-line{padding:8px 0;border-top:1px solid var(--line,#dfe5db)}.recap-line p{display:flex;gap:12px;margin:3px 0;font-size:13px;line-height:1.8}.recap-line p>span:first-child{color:var(--muted,#63715e);width:42px;flex-shrink:0}.recap-line p>span:last-child{min-width:0;overflow-wrap:anywhere}
.task-completion h2{font-size:24px;line-height:1.6;margin:0 0 12px;scroll-margin-top:20px}.task-score{color:var(--text,#314e3d);font-size:15px;margin:0 0 22px;line-height:1.8}.task-score span{color:var(--muted,#63715e);font-size:13px}.task-can-do{display:flex;gap:12px;align-items:flex-start;padding:16px 0;border-block:1px solid var(--line,#dfe5db);font-size:16px;line-height:1.8;margin:0 0 16px;overflow-wrap:anywhere}.task-can-do>span{font-size:12px;min-width:72px;color:var(--muted,#63715e);line-height:2.4}.task-completion-note{color:var(--muted,#63715e);font-size:14px;line-height:1.8;margin:0 0 20px}.task-completion-actions{display:flex;gap:10px;flex-wrap:wrap}
@media(max-width:640px){.scene-task{padding:18px;align-items:stretch;flex-direction:column;gap:17px}.task-entry-copy h2{font-size:19px}.task-start{align-self:flex-start}.task-topline{align-items:flex-start;gap:8px}.task-position{padding-top:9px}.task-position small{display:block}.task-exit{flex-shrink:0}.task-step-title{font-size:20px}.task-prompt{padding:15px}.task-japanese{font-size:17px}.task-choice-heading{align-items:flex-start;flex-direction:column;gap:6px}.task-choice-heading p{padding-top:3px}.task-help{align-self:flex-start}.task-option{padding:11px 13px}.task-bottomline{align-items:stretch;flex-direction:column-reverse;gap:11px}.task-feedback{padding:15px}.task-completion h2{font-size:21px}.task-can-do{flex-direction:column;gap:3px}.task-completion-actions{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}}
@media(prefers-reduced-motion:reduce){.task-option{transition:none}}
</style>
