<script setup lang="ts">
import { computed, watch } from 'vue';
import SentenceCloze from '../../../web/src/components/SentenceCloze.vue';
import type { ClozeQuestion } from '../../../web/src/services/sentence-cloze';
import { useExtensionSentenceAudio } from '../sentence-audio';

const props = defineProps<{
  question: ClozeQuestion;
  value: string;
  revealed: boolean;
  matches: boolean;
  busy: boolean;
  sourceLabel?: string;
  voice: 'female' | 'male';
}>();

const emit = defineEmits<{
  'update:value': [value: string];
  reveal: [];
  grade: [rating: 1 | 2 | 3];
}>();

const { playing, loading, error, play, stop } = useExtensionSentenceAudio();
const audioSourceLabel = computed(() => `Google WaveNet · ${props.voice === 'female' ? '女声 A' : '男声 C'}`);

function playSentence(slow: boolean): void {
  void play(props.question.ja, props.voice, slow);
}

watch(() => [props.question.ja, props.voice] as const, stop);
</script>

<template>
  <SentenceCloze
    :question="question"
    :value="value"
    :revealed="revealed"
    :matches="matches"
    :busy="busy"
    :audio-available="true"
    :audio-source-label="audioSourceLabel"
    :speaking="playing || loading"
    :audio-error="error"
    :source-label="sourceLabel"
    @update:value="emit('update:value', $event)"
    @reveal="emit('reveal')"
    @grade="emit('grade', $event)"
    @play="playSentence"
    @stop="stop"
  />
  <button v-if="error && revealed" class="cloze-audio-retry" type="button" @click="playSentence(false)">重试句子朗读</button>
</template>

<style scoped>
.cloze-audio-retry{min-height:40px;padding:5px 8px;border:0;background:transparent;color:var(--green);font:inherit;font-size:11px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
</style>
