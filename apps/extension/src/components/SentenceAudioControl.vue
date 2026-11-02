<script setup lang="ts">
import { ref, watch } from 'vue';
import { Volume2, X } from 'lucide-vue-next';
import { useExtensionSentenceAudio } from '../sentence-audio';

const props = withDefaults(defineProps<{
  sentence: string;
  voice?: 'female' | 'male';
  label?: string;
}>(), { voice: 'female', label: '朗读句子' });

const { playing, loading, error, play, stop } = useExtensionSentenceAudio();
const lastSlow = ref(false);

function start(slow: boolean): void {
  lastSlow.value = slow;
  void play(props.sentence, props.voice, slow);
}

watch(() => [props.sentence, props.voice] as const, () => {
  stop();
  lastSlow.value = false;
});
</script>

<template>
  <div class="sentence-audio-control" role="group" aria-label="句子朗读">
    <button type="button" :disabled="loading" @click="start(false)"><Volume2 :size="14" aria-hidden="true" />{{ loading && !lastSlow ? '加载中…' : label }}</button>
    <button type="button" :disabled="loading" @click="start(true)">{{ loading && lastSlow ? '加载中…' : '慢速' }}</button>
    <button v-if="playing || loading" type="button" aria-label="停止句子播放" @click="stop"><X :size="14" aria-hidden="true" />停止</button>
    <small>Google WaveNet · {{ voice === 'female' ? '女声 A' : '男声 C' }}</small>
    <span v-if="error" class="sentence-audio-error" role="status">{{ error }} <button type="button" @click="start(lastSlow)">重试</button></span>
  </div>
</template>

<style scoped>
.sentence-audio-control{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;min-width:0}
.sentence-audio-control>button{display:inline-flex;min-height:40px;align-items:center;justify-content:center;gap:5px;padding:6px 9px;border:1px solid var(--line-strong);border-radius:8px;background:var(--paper);color:var(--green);font:inherit;font-size:11px;line-height:1.35;cursor:pointer}
.sentence-audio-control>button:disabled{opacity:.6;cursor:wait}
.sentence-audio-control>small{color:var(--muted);font-size:10px;line-height:1.5}
.sentence-audio-error{flex-basis:100%;color:var(--muted);font-size:11px;line-height:1.6;overflow-wrap:anywhere}
.sentence-audio-error button{min-height:36px;margin-left:4px;border:0;background:transparent;color:var(--green);font:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
</style>
