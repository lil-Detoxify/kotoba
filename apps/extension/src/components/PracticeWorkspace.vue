<script setup lang="ts">
import { computed, onDeactivated, onUnmounted } from 'vue';
import { ArrowLeft } from 'lucide-vue-next';
import type { ExtensionSnapshot, ExtensionWord } from '../model';
import { stopAnswerSound } from '../answer-sound';
import ScenesPractice from './ScenesPractice.vue';
import ConjugationPractice from './ConjugationPractice.vue';

const props = defineProps<{ catalog: ExtensionWord[]; snapshot: ExtensionSnapshot; owner: string; initialTool: 'scenes' | 'conjugation'; verbId?: string; sceneId?: string }>();
const emit = defineEmits<{ close: []; practice: [value: { sceneId: string; exercise: 'card' | 'sentence-cloze' }]; 'update:initialTool': [value: 'scenes' | 'conjugation'] }>();
const tool = computed(() => props.initialTool);
function choose(value: 'scenes' | 'conjugation') { stopAnswerSound(); emit('update:initialTool', value); }
onDeactivated(stopAnswerSound);
onUnmounted(stopAnswerSound);
</script>

<template>
  <section class="practice-workspace" aria-label="在日语中练习">
    <button class="back-button practice-back" type="button" @click="emit('close')"><ArrowLeft :size="15" aria-hidden="true" />返回学习</button>
    <header class="practice-heading"><p class="eyebrow">WORDS INTO LIFE</p><h1>把日语，用起来。</h1><p>从一个场景、一句回应，到动词的另一种变化。</p></header>
    <div class="practice-tabs" role="group" aria-label="练习内容"><button type="button" :aria-pressed="tool === 'scenes'" @click="choose('scenes')">场景学习</button><button type="button" :aria-pressed="tool === 'conjugation'" @click="choose('conjugation')">动词活用</button></div>
    <ScenesPractice v-if="tool === 'scenes'" :catalog="catalog" :snapshot="snapshot" :owner="owner" :voice="snapshot.preferences.voice" :initial-scene-id="sceneId" @practice="emit('practice', $event)" />
    <ConjugationPractice v-else :owner="owner" :verb-id="verbId" :voice="snapshot.preferences.voice" />
  </section>
</template>

<style scoped>
.practice-workspace{min-width:0;padding-bottom:20px}.practice-back{min-height:44px}.practice-heading{margin:20px 0}.practice-heading h1{margin:7px 0;font-size:25px;line-height:1.45;color:var(--ink);text-wrap:balance}.practice-heading>p:last-child{margin:9px 0 0;font-size:12px;line-height:1.7;color:var(--muted)}.practice-tabs{display:flex;gap:8px;margin-bottom:20px}.practice-tabs button{flex:1;min-height:44px;padding:9px;border:1px solid var(--line-strong);border-radius:10px;background:var(--paper);color:var(--ink-soft);font-size:13px;cursor:pointer}.practice-tabs button[aria-pressed=true]{border-color:var(--green);background:var(--green-soft);color:var(--green);font-weight:650}
</style>
