<script setup lang="ts">
import { Volume2 } from 'lucide-vue-next';
import { useAutoPronunciationPreference } from '../auto-pronunciation-preference';

const { enabled, setEnabled } = useAutoPronunciationPreference();
</script>

<template>
  <div class="auto-pronunciation-settings" aria-labelledby="auto-pronunciation-title">
    <div class="auto-pronunciation-heading">
      <span class="auto-pronunciation-icon" aria-hidden="true"><Volume2 :size="18" /></span>
      <div>
        <span class="settings-kicker">02 / LEARNING AUDIO</span>
        <h3 id="auto-pronunciation-title">自动发音</h3>
        <p>学习和复习时，进入新词自动朗读一次。</p>
      </div>
    </div>

    <div class="auto-pronunciation-toggle-row">
      <div><strong>自动发音</strong><small>必要时输入或填空揭晓后发音</small></div>
      <button
        class="auto-pronunciation-toggle"
        type="button"
        role="switch"
        aria-label="自动发音"
        :aria-checked="enabled"
        @click="setEnabled(!enabled)"
      >{{ enabled ? '已开启' : '已关闭' }}</button>
    </div>
  </div>
</template>

<style scoped>
.auto-pronunciation-settings { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.auto-pronunciation-heading { display: flex; align-items: flex-start; gap: 11px; }
.auto-pronunciation-icon { display: grid; flex: 0 0 36px; width: 36px; height: 36px; place-items: center; border-radius: 11px 4px 11px 4px; background: var(--green-soft); color: var(--green); }
.auto-pronunciation-heading h3 { margin: 0; color: var(--ink); font-size: 14px; }
.auto-pronunciation-heading p { margin: 5px 0 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.auto-pronunciation-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
.auto-pronunciation-toggle-row strong { display: block; color: var(--ink-soft); font-size: 12px; }
.auto-pronunciation-toggle-row small { display: block; margin-top: 4px; color: var(--muted); font-size: 10px; line-height: 1.5; }
.auto-pronunciation-toggle { flex: none; min-width: 72px; min-height: 44px; padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--paper); color: var(--muted); font-size: 11px; font-weight: 650; cursor: pointer; }
.auto-pronunciation-toggle[aria-checked="true"] { border-color: var(--green); background: var(--green); color: var(--paper); }
.auto-pronunciation-toggle:focus-visible { outline: 3px solid var(--green); outline-offset: 3px; }
</style>
