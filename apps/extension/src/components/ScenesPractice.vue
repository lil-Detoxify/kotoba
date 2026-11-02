<script setup lang="ts">
import { computed, nextTick, onDeactivated, onUnmounted, ref, shallowRef, useId, watch } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  CloudSun,
  MapPin,
  MessageCircle,
  RotateCcw,
  ShoppingBag,
  Utensils,
} from 'lucide-vue-next';
import { playAnswerSound, stopAnswerSound } from '../answer-sound';
import type { ExtensionSnapshot, ExtensionWord } from '../model';
import { resolveExtensionSceneWords } from '../learning-content';
import {
  advanceSceneTask,
  confirmSceneTaskAnswer,
  correctSceneTaskOption,
  createSceneTaskRun,
  currentSceneTaskStep,
  previousSceneTaskSteps,
  retrySceneTaskMistakes,
  summarizeSceneTask,
  taskForScene,
  type SceneTask,
  type SceneTaskRun,
} from '../../../web/src/services/scene-task';
import { learningScenes } from '../../../web/src/services/learning-scenes';
import MeaningPreview from '../../../web/src/components/MeaningPreview.vue';
import SentenceAudioControl from './SentenceAudioControl.vue';

const props = defineProps<{ catalog: ExtensionWord[]; snapshot: ExtensionSnapshot; owner: string; voice: 'female' | 'male'; initialSceneId?: string }>();
const emit = defineEmits<{ practice: [value: { sceneId: string; exercise: 'card' | 'sentence-cloze' }] }>();

const selectedSceneId = ref<string>();
const showLanguageDetails = ref(false);
const taskRun = shallowRef<SceneTaskRun>();
const selectedOptionId = ref('');
const showTaskHelp = ref(false);
const instanceId = useId();
const stepHeading = ref<HTMLElement>();
const feedbackPanel = ref<HTMLElement>();
const completionHeading = ref<HTMLElement>();
let viewGeneration = 0;

const sceneIcons = {
  shopping: ShoppingBag,
  dining: Utensils,
  directions: MapPin,
  lodging: BedDouble,
  meeting: CalendarDays,
  weather: CloudSun,
} as const;

const activeScene = computed(() => learningScenes.find(scene => scene.id === selectedSceneId.value));
const wordsByScene = computed(() => {
  const resolved: Record<string, Array<{ word: ExtensionWord; item: import('../../../web/src/services/learning-scenes').SceneItem }>> = {};
  for (const scene of learningScenes) {
    resolved[scene.id] = resolveExtensionSceneWords(scene.id, props.catalog, props.snapshot);
  }
  return resolved;
});
const activeWords = computed(() => selectedSceneId.value ? wordsByScene.value[selectedSceneId.value] ?? [] : []);
const activeTask = computed(() => selectedSceneId.value ? taskForScene(selectedSceneId.value) : undefined);
const task = computed<SceneTask | undefined>(() => activeTask.value);
const step = computed(() => task.value && taskRun.value ? currentSceneTaskStep(task.value, taskRun.value) : undefined);
const answer = computed(() => step.value && taskRun.value ? taskRun.value.answers[step.value.id] : undefined);
const chosenOption = computed(() => step.value?.options.find(option => option.id === answer.value?.optionId));
const correctOption = computed(() => step.value ? correctSceneTaskOption(step.value) : undefined);
const summary = computed(() => task.value && taskRun.value ? summarizeSceneTask(task.value, taskRun.value) : undefined);
const priorSteps = computed(() => task.value && step.value ? previousSceneTaskSteps(task.value, step.value.id) : []);
const actualStepNumber = computed(() => task.value && step.value ? task.value.steps.findIndex(entry => entry.id === step.value?.id) + 1 : 0);

function resetTask() {
  viewGeneration++;
  stopAnswerSound();
  taskRun.value = undefined;
  selectedOptionId.value = '';
  showTaskHelp.value = false;
}

function openScene(sceneId: string) {
  selectedSceneId.value = sceneId;
  showLanguageDetails.value = false;
}

function backToGallery() {
  selectedSceneId.value = undefined;
}

function startVocabulary(exercise: 'card' | 'sentence-cloze') {
  if (!activeScene.value || !activeWords.value.length) return;
  resetTask();
  emit('practice', { sceneId: activeScene.value.id, exercise });
}

async function focusCurrent() {
  const generation = viewGeneration;
  await nextTick();
  if (generation !== viewGeneration) return;
  if (summary.value?.complete) completionHeading.value?.focus();
  else stepHeading.value?.focus();
}

function startTask() {
  if (!task.value) return;
  resetTask();
  taskRun.value = createSceneTaskRun(task.value);
  void focusCurrent();
}

function confirmAnswer() {
  if (!task.value || !taskRun.value || !selectedOptionId.value || answer.value) return;
  const previous = taskRun.value;
  const confirmed = confirmSceneTaskAnswer(task.value, previous, selectedOptionId.value);
  if (confirmed === previous) return;
  taskRun.value = confirmed;
  const savedAnswer = confirmed.answers[confirmed.stepIds[confirmed.index]];
  if (savedAnswer) void playAnswerSound(savedAnswer.correct);
  const generation = viewGeneration;
  void nextTick().then(() => {
    if (generation === viewGeneration) feedbackPanel.value?.focus();
  });
}

function nextStep() {
  if (!task.value || !taskRun.value || !answer.value) return;
  const next = advanceSceneTask(task.value, taskRun.value);
  if (next === taskRun.value) return;
  viewGeneration++;
  stopAnswerSound();
  taskRun.value = next;
  selectedOptionId.value = '';
  showTaskHelp.value = false;
  void focusCurrent();
}

function retryMistakes() {
  if (!task.value || !taskRun.value) return;
  const retry = retrySceneTaskMistakes(task.value, taskRun.value);
  if (retry === taskRun.value) return;
  viewGeneration++;
  stopAnswerSound();
  taskRun.value = retry;
  selectedOptionId.value = '';
  showTaskHelp.value = false;
  void focusCurrent();
}

function clozePreview(item: { example: { ja: string; cloze: { answer: string } } }) {
  return item.example.ja.replace(item.example.cloze.answer, '＿＿');
}

watch(() => selectedSceneId.value, () => resetTask(), { flush: 'sync' });
watch(() => props.initialSceneId, sceneId => {
  selectedSceneId.value = sceneId && learningScenes.some(scene => scene.id === sceneId) ? sceneId : undefined;
}, { immediate: true });
watch(() => props.owner, () => resetTask(), { flush: 'sync' });
onDeactivated(stopAnswerSound);
onUnmounted(resetTask);
</script>

<template>
  <section class="scenes-practice" aria-label="生活场景练习">
    <template v-if="!activeScene">
      <header class="scene-gallery-heading">
        <p class="eyebrow">JAPANESE IN REAL LIFE</p>
        <h2>生活场景</h2>
        <p>从熟悉的词书出发，练习在真实情境里表达。</p>
      </header>
      <div class="scene-gallery" aria-label="生活场景专题">
        <button v-for="scene in learningScenes" :key="scene.id" class="scene-card" type="button" @click="openScene(scene.id)">
          <span class="scene-card-top"><span class="scene-icon"><component :is="sceneIcons[scene.icon]" :size="20" aria-hidden="true" /></span><span class="scene-open">打开专题 <ArrowRight :size="14" aria-hidden="true" /></span></span>
          <span class="scene-card-title">{{ scene.title }}</span>
          <span class="scene-description">{{ scene.description }}</span>
          <span class="can-do-list"><span v-for="goal in scene.canDo" :key="goal">{{ goal }}</span></span>
          <span class="scene-card-footer"><strong>{{ wordsByScene[scene.id]?.length ?? 0 }} 个相关词</strong><span>{{ taskForScene(scene.id)?.steps.length ?? 0 }} 步回应</span></span>
        </button>
      </div>
      <p class="scene-footnote">场景词条沿用原词书与学习记录；对话练习不会改变复习进度。</p>
    </template>

    <template v-else>
      <button class="scene-back" type="button" @click="backToGallery"><ArrowLeft :size="16" aria-hidden="true" />生活场景</button>
      <header class="scene-detail-heading">
        <p class="eyebrow">A LITTLE JAPANESE, OUT THERE</p>
        <h2>{{ activeScene.title }}</h2>
        <p>{{ activeScene.description }}</p>
        <div class="scene-start-actions">
          <button class="scene-start-cards" type="button" :disabled="!activeWords.length" @click="startVocabulary('card')">先认识这些词 <ArrowRight :size="15" aria-hidden="true" /></button>
          <button class="scene-start-cloze" type="button" :disabled="!activeWords.length" @click="startVocabulary('sentence-cloze')">例句填空 <ArrowRight :size="15" aria-hidden="true" /></button>
        </div>
        <p v-if="activeWords.length" class="scene-practice-note">词汇练习会更新这些词的复习安排；下方的对话回应练习不会改变词书进度。</p>
        <p v-if="!activeWords.length" class="scene-empty-words" role="status">当前词书中没有可进入词汇练习的场景词。</p>
      </header>

      <section class="scene-can-do" aria-labelledby="scene-can-do-title">
        <h3 id="scene-can-do-title">这次想练习的</h3>
        <ul><li v-for="goal in activeScene.canDo" :key="goal">{{ goal }}</li></ul>
      </section>

      <section v-if="task" class="scene-task" :aria-label="`${task.title}回应练习`">
        <template v-if="!taskRun">
          <div class="task-entry-copy">
            <p class="eyebrow">YOUR TURN TO RESPOND</p>
            <h3><MessageCircle :size="19" aria-hidden="true" />把对话接下去</h3>
            <p>{{ task.title }}。你来当{{ task.role }}，用 {{ task.steps.length }} 步回应走完这段情境。</p>
            <p class="task-progress-note">本次任务练习不改变词书复习进度。</p>
          </div>
          <button type="button" class="primary task-start" @click="startTask">开始回应练习 <ArrowRight :size="16" aria-hidden="true" /></button>
        </template>

        <template v-else-if="step && !summary?.complete">
          <div class="task-topline">
            <span class="task-position">{{ taskRun.mode === 'mistakes' ? '错步重练' : '回应练习' }} · {{ taskRun.index + 1 }} / {{ taskRun.stepIds.length }}<small v-if="taskRun.mode === 'mistakes'"> · 原情境第 {{ actualStepNumber }} 步</small></span>
            <button type="button" class="task-exit" @click="resetTask">退出练习</button>
          </div>
          <h3 ref="stepHeading" class="task-step-title" tabindex="-1">{{ task.title }}</h3>
          <p class="task-role">你是{{ task.role }}</p>
          <p class="task-context">{{ step.context }}</p>

          <details v-if="taskRun.mode === 'mistakes' && priorSteps.length" class="task-recap">
            <summary>看看前文，接回这个情境</summary>
            <div v-for="previous in priorSteps" :key="previous.id" class="recap-line">
              <p><span>{{ previous.speaker }}</span><span lang="ja">{{ previous.prompt.ja }}</span></p>
              <p><span>你</span><span lang="ja">{{ correctSceneTaskOption(previous)?.ja }}</span></p>
            </div>
          </details>

          <div class="task-prompt">
            <span class="task-speaker">{{ step.speaker }}说</span>
            <p lang="ja" class="task-japanese">{{ step.prompt.ja }}</p>
            <SentenceAudioControl :sentence="step.prompt.ja" :voice="voice" label="朗读这句" />
            <template v-if="showTaskHelp"><p lang="ja" class="task-reading">{{ step.prompt.reading }}</p><p class="task-translation">{{ step.prompt.zh }}</p></template>
          </div>

          <div class="task-choice-heading">
            <p :id="`task-choice-${instanceId}-${task.id}`">你会怎样回应？</p>
            <button type="button" class="task-help" :aria-pressed="showTaskHelp" @click="showTaskHelp = !showTaskHelp">{{ showTaskHelp ? '收起读音与翻译' : '显示读音与翻译' }}</button>
          </div>
          <fieldset class="task-options" :aria-labelledby="`task-choice-${instanceId}-${task.id}`" :disabled="Boolean(answer)">
            <label v-for="option in step.options" :key="option.id" class="task-option" :class="{
              selected: selectedOptionId === option.id,
              correct: answer && option.id === step.correctOptionId,
              incorrect: answer && !answer.correct && option.id === answer.optionId,
            }">
              <input v-model="selectedOptionId" type="radio" :name="`scene-response-${instanceId}-${task.id}-${step.id}`" :value="option.id" />
              <span class="task-option-copy">
                <span lang="ja" class="task-japanese">{{ option.ja }}</span>
                <template v-if="showTaskHelp"><span lang="ja" class="task-reading">{{ option.reading }}</span><span class="task-translation">{{ option.zh }}</span></template>
                <span v-if="answer && option.id === step.correctOptionId" class="task-option-status"><Check :size="14" aria-hidden="true" />适合这一步</span>
                <span v-else-if="answer && !answer.correct && option.id === answer.optionId" class="task-option-status">这次选择</span>
              </span>
            </label>
          </fieldset>

          <div v-if="answer && chosenOption" ref="feedbackPanel" class="task-feedback" :class="{ 'needs-practice': !answer.correct }" tabindex="-1" role="status" aria-live="polite">
            <strong>{{ answer.correct ? '回应合适' : '换个回应会更合适' }}</strong>
            <p>{{ chosenOption.feedback }}</p>
            <p v-if="!answer.correct && correctOption" class="task-better-response">可以这样说：<span lang="ja">{{ correctOption.ja }}</span></p>
            <p class="task-tip">{{ step.tip }}</p>
          </div>
          <div class="task-bottomline">
            <p class="task-progress-note">本次任务练习不改变词书复习进度。</p>
            <button v-if="!answer" type="button" class="primary task-confirm" :disabled="!selectedOptionId" @click="confirmAnswer">确认回应 <Check :size="16" aria-hidden="true" /></button>
            <button v-else type="button" class="primary task-next" @click="nextStep">{{ taskRun.index + 1 < taskRun.stepIds.length ? '继续下一步' : '看看任务结果' }} <ArrowRight :size="16" aria-hidden="true" /></button>
          </div>
        </template>

        <template v-else-if="summary?.complete">
          <div class="task-completion">
            <p class="eyebrow">A LITTLE MORE CONFIDENT</p>
            <h3 ref="completionHeading" tabindex="-1">{{ taskRun.mode === 'mistakes' ? '这轮重练，完成了。' : '这段情境，走完了。' }}</h3>
            <p class="task-score">{{ taskRun.mode === 'mistakes' ? '本轮重练' : '本次回应' }} {{ summary.correct }} / {{ summary.total }} 步合适<span v-if="taskRun.mode === 'mistakes'"> · 首轮 {{ summary.firstCorrect }} / {{ summary.firstTotal }} 步</span></p>
            <p class="task-can-do"><span>这次练习了</span>{{ task.canDo }}</p>
            <p v-if="summary.mistakeIds.length" class="task-completion-note">还有 {{ summary.mistakeIds.length }} 步可以再试一次，前文会保留在回顾中。</p>
            <p v-else class="task-completion-note">可以再走一遍，试着收起中文，直接用日语回应。</p>
            <div class="task-completion-actions">
              <button v-if="summary.mistakeIds.length" type="button" class="primary task-retry" @click="retryMistakes">只重练错的 {{ summary.mistakeIds.length }} 步 <ArrowRight :size="16" aria-hidden="true" /></button>
              <button type="button" :class="{ primary: !summary.mistakeIds.length }" @click="startTask"><RotateCcw :size="16" aria-hidden="true" />重新走一遍</button>
              <button type="button" class="task-exit" @click="resetTask">回到场景内容</button>
            </div>
            <p class="task-progress-note">本次任务练习不改变词书复习进度。</p>
          </div>
        </template>
      </section>

      <section class="scene-content-section" aria-labelledby="scene-dialogue-title">
        <div class="scene-section-heading">
          <div><p class="eyebrow">A SHORT CONVERSATION</p><h3 id="scene-dialogue-title">一段短对话</h3></div>
          <button type="button" class="scene-language-toggle" :aria-pressed="showLanguageDetails" @click="showLanguageDetails = !showLanguageDetails">{{ showLanguageDetails ? '收起读音与翻译' : '显示读音与翻译' }}</button>
        </div>
        <article v-for="(line, index) in activeScene.dialogue" :key="`${line.speaker}-${index}`" class="dialogue-line">
          <span class="speaker">{{ line.speaker }}</span>
          <div class="dialogue-copy"><p lang="ja" class="japanese-line">{{ line.ja }}</p><SentenceAudioControl :sentence="line.ja" :voice="voice" label="朗读对话" /><p v-if="showLanguageDetails" class="reading-line">{{ line.reading }}</p><p v-if="showLanguageDetails" class="translation-line">{{ line.zh }}</p></div>
        </article>
      </section>

      <section class="scene-content-section" aria-labelledby="scene-expressions-title">
        <div class="scene-section-heading"><div><p class="eyebrow">USEFUL PHRASES</p><h3 id="scene-expressions-title">常用表达</h3></div></div>
        <article v-for="expression in activeScene.expressions" :key="expression.ja" class="expression-note">
          <p lang="ja" class="japanese-line">{{ expression.ja }}</p>
          <SentenceAudioControl :sentence="expression.ja" :voice="voice" label="朗读表达" />
          <p v-if="showLanguageDetails" class="reading-line">{{ expression.reading }}</p>
          <p v-if="showLanguageDetails" class="translation-line">{{ expression.zh }}</p>
          <p class="expression-tip">{{ expression.note }}</p>
        </article>
      </section>

      <section class="scene-content-section scene-vocabulary" aria-labelledby="scene-vocabulary-title">
        <div class="scene-section-heading"><div><p class="eyebrow">WORDS FROM YOUR BOOKS</p><h3 id="scene-vocabulary-title">本场景会遇到的词</h3></div><span class="vocab-count">{{ activeWords.length }} 个词</span></div>
        <div v-if="!activeWords.length" class="scene-empty-words">这个专题暂时没有可展示的词条。</div>
        <article v-for="entry in activeWords" :key="entry.word.id" class="scene-word">
          <div class="word-heading"><h4 lang="ja">{{ entry.word.term }}</h4><span v-if="showLanguageDetails" class="word-reading">{{ entry.word.reading }}</span><span class="word-source">{{ entry.word.bookTitle || '原词书' }}</span></div>
          <MeaningPreview v-if="showLanguageDetails && entry.word.meaning" class="word-meaning" :word="entry.word" />
          <p lang="ja" class="word-example">{{ entry.item.example.ja }}</p>
          <SentenceAudioControl :sentence="entry.item.example.ja" :voice="voice" label="朗读例句" />
          <template v-if="showLanguageDetails"><p class="example-reading">{{ entry.item.example.reading }}</p><p class="example-translation">{{ entry.item.example.zh }}</p></template>
          <div class="cloze-preview"><span>例句练习预览</span><p lang="ja">{{ clozePreview(entry.item) }}</p></div>
        </article>
        <p class="scene-vocab-note">开始词汇练习时会保留原词的学习身份；例句任务只是场景预览。</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.scenes-practice{display:flex;flex-direction:column;gap:16px;min-width:0;padding-bottom:18px;color:var(--ink)}
.scene-gallery-heading{margin:0 0 2px}.scene-gallery-heading .eyebrow,.scene-detail-heading .eyebrow,.scene-section-heading .eyebrow,.scene-task .eyebrow{margin:0 0 6px;color:var(--muted);font-size:10px;letter-spacing:.1em}.scene-gallery-heading h2,.scene-detail-heading h2{margin:0;color:var(--ink);font-size:21px;line-height:1.4}.scene-gallery-heading>p:last-child,.scene-detail-heading>p{margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.7}
.scene-gallery{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.scene-card{display:flex;flex-direction:column;align-items:stretch;gap:9px;min-width:0;min-height:0;padding:14px;border:1px solid var(--line-strong);border-radius:11px;background:var(--paper);text-align:left;cursor:pointer;transition:border-color .15s,background .15s}.scene-card:hover,.scene-card:focus-visible{border-color:#9ab28d;background:#fbfcf7}.scene-card:focus-visible,.scene-back:focus-visible,.scenes-practice button:focus-visible,.task-option:focus-within,.task-recap summary:focus-visible{outline:3px solid rgba(168,120,50,.64);outline-offset:3px}.scene-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.scene-icon{display:grid;width:38px;height:38px;place-items:center;border-radius:10px;background:var(--green-soft);color:var(--green)}.scene-open{display:inline-flex;align-items:center;gap:4px;color:var(--muted);font-size:10px}.scene-card-title{color:var(--ink);font-size:16px;font-weight:700;line-height:1.5}.scene-description{color:var(--muted);font-size:11px;line-height:1.7}.can-do-list{display:grid;gap:4px;color:var(--ink-soft);font-size:11px;line-height:1.6}.can-do-list>span::before{content:'✓';margin-right:6px;color:#789261}.scene-card-footer{display:flex;justify-content:space-between;gap:8px;padding-top:9px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}.scene-card-footer strong{color:var(--green);font-weight:650}.scene-footnote{margin:0;color:var(--muted);font-size:10px;line-height:1.65}
.scene-back{display:inline-flex;align-items:center;align-self:flex-start;gap:6px;min-height:44px;padding:7px 4px;border:0;background:transparent;color:var(--green);font-size:12px;cursor:pointer}.scene-detail-heading{min-width:0}.scene-start-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.scene-start-actions button,.task-start,.task-confirm,.task-next,.task-retry,.task-completion-actions>button,.task-exit,.task-help,.scene-language-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:0;min-height:44px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:9px;background:var(--paper);color:var(--green);font-size:11px;line-height:1.4;font-weight:600;cursor:pointer}.scene-start-actions button:first-child,.task-start,.task-confirm,.task-next,.task-retry,.task-completion-actions>button.primary{border-color:var(--green);background:var(--green);color:var(--paper)}.scene-start-actions button:disabled{opacity:.5;cursor:not-allowed}.scene-practice-note{margin:7px 0 0;color:var(--muted);font-size:10px;line-height:1.65}.scene-empty-words{margin:9px 0 0;padding:12px;border-radius:8px;background:#f6f4ed;color:var(--muted);font-size:11px;line-height:1.65}
.scene-can-do{padding:14px;border-radius:10px;background:var(--green-soft)}.scene-can-do h3{margin:0 0 8px;color:var(--ink);font-size:13px}.scene-can-do ul{display:grid;gap:5px;padding:0;margin:0;list-style:none}.scene-can-do li{color:var(--ink-soft);font-size:11px;line-height:1.65}.scene-can-do li::before{content:'•';margin-right:7px;color:#789261}
.scene-task{min-width:0;padding:15px;border:1px solid #bccbb0;border-radius:11px;background:var(--paper)}.task-entry-copy{min-width:0}.task-entry-copy h3{display:flex;align-items:center;gap:7px;margin:0;color:var(--green);font-size:16px}.task-entry-copy>p:not(.eyebrow){margin:7px 0 0;color:var(--ink-soft);font-size:12px;line-height:1.7}.task-progress-note{margin:8px 0 0;color:var(--muted);font-size:10px;line-height:1.6}.task-start{margin-top:12px}.task-topline{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.task-position{color:var(--muted);font-size:11px;line-height:1.6}.task-position small{font-size:10px}.task-exit{background:transparent;color:var(--muted)}.task-step-title{margin:0 0 4px;font-size:17px;line-height:1.5}.task-step-title:focus,.task-completion h3:focus,.task-feedback:focus{outline:none}.task-role{margin:0 0 12px;color:var(--muted);font-size:11px}.task-context{margin:0 0 12px;color:var(--ink-soft);font-size:12px;line-height:1.75;overflow-wrap:anywhere}.task-recap{margin-bottom:12px;border-block:1px solid var(--line)}.task-recap summary{min-height:44px;align-content:center;color:var(--green);font-size:11px;cursor:pointer}.recap-line{padding:7px 0;border-top:1px solid var(--line)}.recap-line p{display:flex;gap:8px;margin:3px 0;font-size:11px;line-height:1.7}.recap-line p>span:first-child{flex:0 0 32px;color:var(--muted)}.recap-line p>span:last-child{min-width:0;overflow-wrap:anywhere}.task-prompt{padding:12px;border-left:3px solid #829975;border-radius:0 7px 7px 0;background:var(--green-pale)}.task-speaker{display:block;margin-bottom:4px;color:var(--muted);font-size:10px}.task-japanese{display:block;margin:0;color:var(--ink);font-size:15px;line-height:1.8;overflow-wrap:anywhere}.task-reading,.task-translation{display:block;margin:3px 0 0;color:var(--muted);font-size:11px;line-height:1.7;overflow-wrap:anywhere}.task-choice-heading{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:12px 0 8px}.task-choice-heading>p{margin:0;color:var(--ink);font-size:12px;font-weight:650}.task-help{padding-inline:8px;background:transparent;color:var(--green);font-size:10px}.task-options{display:grid;gap:7px;min-width:0;padding:0;margin:0;border:0}.task-option{display:flex;align-items:flex-start;gap:9px;min-height:52px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);cursor:pointer}.task-option.selected{border-color:#8ca67d;background:var(--green-pale)}.task-option.correct{border-color:#8fa477;background:#eaf0e1}.task-option.incorrect{border-color:#b99c71;background:#f8f2e7}.task-option input[type=radio]{flex:none;width:18px;height:18px;margin:5px 0 0;accent-color:var(--green)}.task-option-copy{display:block;min-width:0;flex:1}.task-option-copy .task-japanese{font-size:13px}.task-option-status{display:inline-flex;align-items:center;gap:4px;margin-top:4px;color:var(--green);font-size:10px}.task-options:disabled .task-option{cursor:default}.task-options:disabled input{opacity:.7}.task-feedback{margin-top:12px;padding:12px;border-top:1px solid #becdb3;background:#f0f4e9}.task-feedback.needs-practice{border-color:#cfb58e;background:#faf5eb}.task-feedback>strong{color:var(--ink);font-size:12px}.task-feedback p{margin:6px 0 0;color:var(--ink-soft);font-size:11px;line-height:1.7;overflow-wrap:anywhere}.task-feedback .task-better-response span{display:block;margin-top:3px;color:var(--ink);font-size:14px}.task-feedback .task-tip{padding-top:7px;border-top:1px solid var(--line);color:var(--muted)}.task-bottomline{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px}.task-bottomline .task-progress-note{margin:0}.task-bottomline>button{flex:none}.task-completion h3{margin:0 0 8px;font-size:19px;line-height:1.5}.task-score{margin:0 0 12px;color:var(--green);font-size:13px;line-height:1.7}.task-score span{color:var(--muted);font-size:11px}.task-can-do{display:flex;gap:8px;padding:10px 0;border-block:1px solid var(--line);margin:0 0 10px;color:var(--ink-soft);font-size:11px;line-height:1.7}.task-can-do>span{flex:none;color:var(--muted)}.task-completion-note{margin:0 0 11px;color:var(--muted);font-size:11px;line-height:1.7}.task-completion-actions{display:grid;grid-template-columns:1fr;gap:7px}.task-completion-actions>button{width:100%}
.scene-content-section{min-width:0;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--paper)}.scene-section-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.scene-section-heading h3{margin:0;color:var(--ink);font-size:14px}.scene-language-toggle{flex:none;padding-inline:8px;background:transparent;color:var(--green);font-size:10px}.dialogue-line{display:grid;grid-template-columns:42px minmax(0,1fr);gap:8px;padding:10px 0;border-top:1px solid #edf0e9}.dialogue-line:first-of-type{border-top:0}.speaker{padding-top:3px;color:var(--muted);font-size:10px}.dialogue-copy{min-width:0}.japanese-line,.reading-line,.translation-line{margin:0;overflow-wrap:anywhere;line-height:1.75}.japanese-line{color:var(--ink);font-size:14px}.reading-line{margin-top:3px;color:var(--muted);font-size:10px}.translation-line{margin-top:3px;color:var(--ink-soft);font-size:11px}.expression-note{padding:10px 0;border-top:1px solid #edf0e9}.expression-note:first-of-type{border-top:0}.expression-tip{margin:6px 0 0;color:var(--muted);font-size:10px;line-height:1.7}.vocab-count{flex:none;color:var(--muted);font-size:10px}.scene-word{min-width:0;padding:11px 0;border-top:1px solid #edf0e9}.scene-word:first-of-type{border-top:0}.word-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:7px}.word-heading h4{margin:0;color:var(--ink);font-size:16px}.word-reading{color:var(--muted);font-size:10px}.word-source{margin-left:auto;color:var(--muted);font-size:9px}.word-meaning,.example-reading,.example-translation{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.7;overflow-wrap:anywhere}.word-example{margin:7px 0 0;color:var(--ink-soft);font-size:12px;line-height:1.8;overflow-wrap:anywhere}.example-translation{color:var(--ink-soft)}.cloze-preview{margin-top:7px;padding:8px 9px;border-radius:7px;background:#f3f5ee}.cloze-preview>span{color:var(--muted);font-size:9px}.cloze-preview p{margin:3px 0 0;color:var(--ink-soft);font-size:11px;line-height:1.7;overflow-wrap:anywhere}.scene-vocab-note{margin:6px 0 0;color:var(--muted);font-size:9px;line-height:1.6}
@media(max-width:360px){.scene-detail-heading h2{font-size:19px}.scene-start-actions{grid-template-columns:1fr}.scene-section-heading{align-items:flex-start;flex-direction:column}.scene-language-toggle{align-self:flex-start}.task-bottomline{align-items:stretch;flex-direction:column-reverse}.task-bottomline>button{width:100%}.task-choice-heading{align-items:flex-start;flex-direction:column}.task-help{align-self:flex-start}}
@media(prefers-reduced-motion:reduce){.scene-card{transition:none}}
</style>
