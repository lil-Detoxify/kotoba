<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next';

defineProps<{
  usage: {
    collocation: { ja: string; reading: string; zh: string };
    tip?: string;
    contrast?: {
      term: string;
      reading: string;
      collocation: { ja: string; reading: string; zh: string };
      note: string;
    };
  };
  showReading: boolean;
  showTranslation: boolean;
}>();
</script>

<template>
  <section class="usage-notes" aria-label="词语用法">
    <div class="usage-collocation" aria-label="常用搭配">
      <span class="usage-label">常用搭配</span>
      <strong lang="ja">{{ usage.collocation.ja }}</strong>
      <small v-if="showReading && usage.collocation.reading" lang="ja">{{ usage.collocation.reading }}</small>
      <p v-if="showTranslation && usage.collocation.zh">{{ usage.collocation.zh }}</p>
    </div>
    <p v-if="usage.tip" class="usage-tip">{{ usage.tip }}</p>
    <details v-if="usage.contrast" class="usage-contrast" :aria-label="`易混对照：${usage.contrast.term}`">
      <summary>易混对照 · {{ usage.contrast.term }} <ChevronDown :size="16" aria-hidden="true"/></summary>
      <div class="contrast-body">
        <p class="contrast-word"><strong lang="ja">{{ usage.contrast.term }}</strong><small v-if="showReading" lang="ja">{{ usage.contrast.reading }}</small></p>
        <p class="contrast-collocation" lang="ja">{{ usage.contrast.collocation.ja }}</p>
        <p v-if="showReading && usage.contrast.collocation.reading" class="contrast-reading" lang="ja">{{ usage.contrast.collocation.reading }}</p>
        <p v-if="showTranslation && usage.contrast.collocation.zh" class="contrast-translation">{{ usage.contrast.collocation.zh }}</p>
        <p class="contrast-note">{{ usage.contrast.note }}</p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.usage-contrast summary{scroll-margin-block:90px 150px}
.usage-notes{margin-top:18px;padding-left:14px;border-left:2px solid var(--border-strong)}.usage-collocation{display:grid;grid-template-columns:auto minmax(0,1fr);gap:5px 13px;align-items:baseline}.usage-label{color:var(--muted);font-size:11px}.usage-collocation strong{color:var(--green);font-size:17px;font-weight:500;line-height:1.65;overflow-wrap:anywhere}.usage-collocation small,.usage-collocation p{grid-column:2;margin:0;color:#6b7960;font-size:12px;line-height:1.65;overflow-wrap:anywhere}.usage-tip{margin:10px 0 0;color:#65745c;font-size:12px;line-height:1.75}.usage-contrast{margin:8px 0 0;border-top:1px solid var(--border-soft)}.usage-contrast summary{min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 9px;border:1px solid transparent;border-radius:var(--radius-control);color:#52684d;font-size:13px;line-height:1.6;cursor:pointer;list-style:none;transition:background var(--motion-fast) var(--ease-ui),border-color var(--motion-fast) var(--ease-ui),color var(--motion-fast) var(--ease-ui)}.usage-contrast summary:hover{background:var(--surface-muted);border-color:var(--border-soft)}.usage-contrast[open] summary{background:var(--surface-selected);border-color:var(--border-strong);color:var(--green)}.usage-contrast summary::-webkit-details-marker{display:none}.usage-contrast summary:focus-visible{outline:3px solid var(--focus-ring);outline-offset:2px;border-radius:var(--radius-control)}.usage-contrast summary svg{flex:none;transition:transform var(--motion-fast) var(--ease-ui)}.usage-contrast[open] summary svg{transform:rotate(180deg)}.contrast-body{padding:8px 9px 9px 10px}.contrast-word{display:flex;align-items:baseline;gap:10px;margin:0 0 5px}.contrast-word strong{font-size:15px;font-weight:550;color:#425742}.contrast-word small,.contrast-reading{color:#748069;font-size:11px}.contrast-word small{font-size:11px}.contrast-collocation,.contrast-reading,.contrast-translation,.contrast-note{margin:3px 0;color:#53634f;font-size:12px;line-height:1.7;overflow-wrap:anywhere}.contrast-note{margin-top:7px;color:#748069;font-size:11px}
@media(prefers-reduced-motion:reduce){.usage-contrast summary,.usage-contrast summary svg{transition:none}}
@media(max-width:560px){.usage-notes{padding-left:11px}.usage-collocation{gap:4px 9px}.usage-collocation strong{font-size:16px}.usage-contrast summary{font-size:12px}}
</style>
