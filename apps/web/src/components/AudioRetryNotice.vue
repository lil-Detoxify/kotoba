<script setup lang="ts">
import {RotateCcw} from 'lucide-vue-next';
defineProps<{error:string;disabled?:boolean}>();
defineEmits<{retry:[]}>();
</script>
<template>
  <div v-if="error" class="audio-retry-notice" role="alert">
    <span>{{error}}</span>
    <button type="button" :disabled="disabled" @click="$emit('retry')"><RotateCcw :size="15" aria-hidden="true"/>重试发音</button>
  </div>
</template>
<style scoped>
.audio-retry-notice{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 14px;margin:12px 0;color:#8a5545;font-size:13px;line-height:1.6}
.audio-retry-notice>span{min-width:0;overflow-wrap:anywhere}
.audio-retry-notice button{min-height:44px;padding:8px 12px;color:var(--green);font-size:13px;border-color:var(--border-soft);border-radius:var(--radius-control);background:var(--surface-muted);flex:none;transition:background var(--motion-fast) var(--ease-ui),border-color var(--motion-fast) var(--ease-ui)}
.audio-retry-notice button:not(:disabled):hover{background:var(--surface-selected);border-color:var(--border-strong)}
</style>
