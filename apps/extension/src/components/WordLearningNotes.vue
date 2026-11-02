<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowUpRight } from 'lucide-vue-next';
import UsageNotes from '../../../web/src/components/UsageNotes.vue';
import { usageFor } from '../../../web/src/services/learning-usage';
import { learningExampleFor, type LearningExample } from '../../../web/src/services/learning-example';
import { loadBookLearningExamples } from '../../../web/src/services/book-learning-examples';
import { conjugationFor } from '../../../web/src/services/conjugation';
import { loadWordUsageDeepening } from '../../../web/src/services/learning-usage-deepening';
import { sceneExampleFor } from '../../../web/src/services/learning-scenes';
import { wordReadingContexts } from '../../../web/src/services/reading-context';
import { bookIdForWord } from '../learning';
import type { ExtensionWord } from '../model';
import SentenceAudioControl from './SentenceAudioControl.vue';

const props = withDefaults(defineProps<{ word: ExtensionWord; sceneId?: string; expanded?: boolean; showExample?: boolean; voice?: 'female' | 'male' }>(), {
  showExample: true,
  voice: 'female',
});
const emit = defineEmits<{ conjugation: [verbId: string] }>();
const showReading = ref(false);
const showTranslation = ref(true);
const isExpanded = ref(!!props.expanded);
const usage = computed(() => usageFor(props.word));
const verb = computed(() => conjugationFor(props.word));
const sceneExample = computed(() => props.sceneId ? sceneExampleFor(props.sceneId, props.word) : undefined);
const wordExample = computed<LearningExample | undefined>(() => props.word.example ? {
  ja: props.word.example,
  reading: props.word.exampleReading || '',
  zh: props.word.exampleTranslation || '',
} : undefined);
const example = computed(() => props.showExample
  ? sceneExample.value ?? wordExample.value ?? learningExampleFor(props.word)
  : undefined);
const exampleLabel = computed(() => sceneExample.value
  ? '场景例句'
  : wordExample.value
    ? '词书例句'
    : 'Kotobud 学习例句');
const contexts = computed(() => wordReadingContexts(props.word));
const loadingContent = ref(false);
let contentGeneration = 0;

async function loadCurrentBookContent(): Promise<void> {
  if (!isExpanded.value) return;
  const word = props.word;
  const generation = ++contentGeneration;
  loadingContent.value = true;
  try {
    await Promise.all([
      loadBookLearningExamples(bookIdForWord(word)),
      loadWordUsageDeepening(word),
    ]);
  } finally {
    if (generation === contentGeneration && props.word.id === word.id) loadingContent.value = false;
  }
}

function toggleNotes(event: Event): void {
  isExpanded.value = (event.currentTarget as HTMLDetailsElement).open;
  if (isExpanded.value) void loadCurrentBookContent();
}

watch(() => [props.word.id, props.word.lessonId, props.word.term, props.word.reading, props.word.meaning] as const, () => {
  contentGeneration++;
  showReading.value = false;
  showTranslation.value = true;
  if (isExpanded.value) void loadCurrentBookContent();
});
watch(() => props.expanded, value => {
  if (value === undefined) return;
  isExpanded.value = value;
  if (value) void loadCurrentBookContent();
}, { immediate: true });
</script>

<template>
  <details v-if="usage || verb || example || contexts.length || word.meaning" class="word-learning-notes" :open="isExpanded" @toggle="toggleNotes">
    <summary>用法与搭配<span aria-hidden="true">＋</span></summary>
    <div v-if="isExpanded" class="word-notes-body">
      <p v-if="loadingContent" class="word-notes-loading" role="status">正在读取本词书的例句与用法…</p>
      <div class="word-notes-tools"><button type="button" :aria-pressed="showReading" @click="showReading = !showReading">{{ showReading ? '收起读音' : '显示读音' }}</button><button type="button" :aria-pressed="showTranslation" @click="showTranslation = !showTranslation">{{ showTranslation ? '隐藏翻译' : '显示翻译' }}</button></div>
      <section v-if="example" class="scene-word-example" aria-label="用例展示"><h3>用例展示<span>{{ exampleLabel }}</span></h3><p lang="ja">{{ example.ja }}</p><SentenceAudioControl :sentence="example.ja" :voice="voice" label="朗读用例" /><small v-if="showReading && example.reading" lang="ja">{{ example.reading }}</small><p v-if="showTranslation && example.zh" class="scene-example-translation">{{ example.zh }}</p></section>
      <UsageNotes v-if="usage" :usage="usage" :show-reading="showReading" :show-translation="showTranslation" />
      <p v-if="!loadingContent && !example && !usage && !verb && !contexts.length" class="word-notes-empty">暂无匹配当前词义的用例或搭配。</p>
      <section v-if="contexts.length" class="scene-word-example" aria-label="我的原句"><h3>我的原句<span>{{ contexts.length }} 条</span></h3><div v-for="context in contexts" :key="context.id"><p lang="ja">{{ context.sentence }}</p><SentenceAudioControl :sentence="context.sentence" :voice="voice" label="朗读原句" /><p v-if="showTranslation && context.translation" class="context-translation">{{ context.translation }}</p><small v-if="context.sourceTitle || context.sourceUrl"><a v-if="context.sourceUrl" :href="context.sourceUrl" target="_blank" rel="noopener noreferrer">{{ context.sourceTitle || '查看来源' }}</a><template v-else>{{ context.sourceTitle }}</template></small></div></section>
      <button v-if="verb" class="word-conjugation-link" type="button" @click="emit('conjugation', verb.id)">练习「{{ verb.term }}」的活用<ArrowUpRight :size="15" aria-hidden="true" /></button>
    </div>
  </details>
</template>

<style scoped>
.word-learning-notes{margin:14px 0;border-block:1px solid var(--line);min-width:0}.word-learning-notes>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;color:var(--green);font-size:12px;font-weight:600;cursor:pointer;list-style:none}.word-learning-notes>summary::-webkit-details-marker{display:none}.word-learning-notes>summary>span{font-weight:400}.word-notes-body{padding-bottom:12px}.word-notes-tools{display:flex;flex-wrap:wrap;gap:8px}.word-notes-tools button,.word-conjugation-link{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:7px 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--paper);color:var(--green);font-size:11px;cursor:pointer}.word-conjugation-link{margin-top:14px;background:var(--green-pale)}.scene-word-example h3{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 10px;color:var(--ink);font-size:13px}.scene-word-example h3 span{color:var(--muted);font-size:10px;font-weight:400}.scene-word-example>p{margin:8px 0;color:var(--ink);font-size:18px;line-height:1.8;overflow-wrap:anywhere}.scene-word-example small,.scene-word-example>.scene-example-translation{font-size:12px;line-height:1.7;color:var(--muted)}
.word-notes-loading,.word-notes-empty{margin:9px 0;color:var(--muted);font-size:12px;line-height:1.6}
.scene-word-example>div{padding:10px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.scene-word-example>div:last-child{border-bottom:0}.scene-word-example>div p{margin:4px 0;font-size:15px;line-height:1.8}.scene-word-example .context-translation{color:var(--muted);font-size:12px}.scene-word-example a{color:var(--green);text-underline-offset:3px}
</style>
