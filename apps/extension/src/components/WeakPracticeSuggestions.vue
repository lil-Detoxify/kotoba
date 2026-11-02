<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, RotateCcw } from 'lucide-vue-next';
import type { ExtensionWord } from '../model';
import MeaningPreview from '../../../web/src/components/MeaningPreview.vue';

const props = defineProps<{
  suggestions: Array<{ word: ExtensionWord; reason: string }>;
  bookTitle?: string;
  busy?: boolean;
}>();

const emit = defineEmits<{ practice: [] }>();
const visibleSuggestions = computed(() => props.suggestions.slice(0, 5));

function reasonLabel(reason: string) {
  return reason.replace(/「忘记」/g, '「没记住」');
}

</script>

<template>
  <section v-if="visibleSuggestions.length" class="weak-practice-suggestions" :aria-busy="!!busy" aria-labelledby="weak-practice-title">
    <header class="weak-practice-heading">
      <p class="weak-practice-kicker">近 30 天 · 复习记录</p>
      <h2 id="weak-practice-title">再巩固一些词</h2>
      <p v-if="bookTitle" class="weak-practice-book">当前词书 · {{ bookTitle }}</p>
      <p v-else class="weak-practice-book">按当前学习词书整理</p>
      <p class="weak-practice-note">评价原因参考近 30 天记录，已标记的生词也会列出。</p>
    </header>

    <ul class="weak-practice-list">
      <li v-for="suggestion in visibleSuggestions" :key="suggestion.word.id" class="weak-practice-item">
        <div class="weak-word-main">
          <div class="weak-word-label"><strong lang="ja">{{ suggestion.word.term }}</strong><span v-if="suggestion.word.reading" lang="ja">{{ suggestion.word.reading }}</span></div>
          <MeaningPreview class="weak-word-meaning" :word="suggestion.word" />
        </div>
        <p class="weak-word-reason">{{ reasonLabel(suggestion.reason) }}</p>
      </li>
    </ul>

    <p v-if="suggestions.length > visibleSuggestions.length" class="weak-practice-more">另有 {{ suggestions.length - visibleSuggestions.length }} 词，重练时一并加入。</p>
    <button class="weak-practice-button" type="button" :disabled="busy" @click="emit('practice')">
      <RotateCcw :size="15" aria-hidden="true" />再巩固 {{ suggestions.length }} 词<ArrowRight :size="15" aria-hidden="true" />
    </button>
  </section>
</template>

<style scoped>
.weak-practice-suggestions{min-width:0;padding:16px;border:1px solid var(--line-strong);border-radius:16px;background:var(--green-pale);color:var(--ink);text-align:left}
.weak-practice-heading{display:grid;gap:4px}.weak-practice-kicker{margin:0;color:var(--muted);font-size:12px;font-weight:650;letter-spacing:.035em}.weak-practice-heading h2{margin:0;color:var(--ink);font-family:"Yu Mincho","Hiragino Mincho ProN",serif;font-size:19px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}.weak-practice-book,.weak-practice-note{margin:0;color:var(--muted);font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.weak-practice-list{display:grid;gap:7px;margin:12px 0 0;padding:0;list-style:none}.weak-practice-item{min-width:0;padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.76)}.weak-word-main{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);align-items:start;gap:8px}.weak-word-label{display:grid;gap:2px;min-width:0}.weak-word-label strong{color:var(--ink);font-size:15px;font-weight:650;line-height:1.4;overflow-wrap:anywhere}.weak-word-label span{color:var(--muted);font-size:13px;line-height:1.4;overflow-wrap:anywhere}.weak-word-meaning{min-width:0;margin:0;color:var(--ink-soft);font-size:14px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word}.weak-word-reason{margin:7px 0 0;padding-top:6px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.45;overflow-wrap:anywhere}.weak-practice-more{margin:9px 0 0;color:var(--muted);font-size:13px;line-height:1.5}
.weak-practice-button{display:flex;width:100%;min-height:46px;align-items:center;justify-content:center;gap:8px;margin-top:12px;padding:10px 12px;border:1px solid var(--green);border-radius:11px;background:var(--green);color:var(--paper);font:inherit;font-size:14px;font-weight:700;line-height:1.4;text-align:center;overflow-wrap:anywhere;cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease}.weak-practice-button:hover:not(:disabled){border-color:var(--green-deep);background:var(--green-deep)}.weak-practice-button:disabled{opacity:.62;cursor:wait}.weak-practice-button svg{flex:none}
@media(max-width:360px){.weak-practice-suggestions{padding:14px;border-radius:14px}.weak-practice-item{padding:9px}.weak-word-main{grid-template-columns:minmax(0,.75fr) minmax(0,1.25fr);gap:7px}}
@media(prefers-reduced-motion:reduce){.weak-practice-button{transition:none}}
</style>
