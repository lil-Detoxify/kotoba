<script setup lang="ts">
import { HOME_DISPLAY_OPTIONS, useHomeDisplayPreference, type HomeDisplay } from '../home-display-preference';

const { display, setDisplay } = useHomeDisplayPreference();

function choose(value: HomeDisplay): void {
  setDisplay(value);
}
</script>

<template>
  <section class="home-display-preferences" aria-labelledby="home-display-title">
    <div class="home-display-heading">
      <div>
        <h3 id="home-display-title">首页展示</h3>
        <p>选择首页优先展示的内容，保存在当前设备。</p>
      </div>
    </div>

    <div class="home-display-options" role="group" aria-label="首页展示内容">
      <button
        v-for="option in HOME_DISPLAY_OPTIONS"
        :key="option.value"
        type="button"
        class="home-display-option"
        :aria-pressed="display === option.value"
        @click="choose(option.value)"
      >
        <span class="home-display-option-copy">
          <strong>{{ option.label }}</strong>
          <small>{{ option.description }}</small>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.home-display-preferences { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.home-display-heading h3 { margin: 0; color: var(--ink); font-size: 14px; }
.home-display-heading p { margin: 5px 0 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.home-display-options { display: grid; gap: 7px; min-width: 0; }
.home-display-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 52px;
  padding: 9px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--paper);
  color: var(--ink-soft);
  text-align: left;
  cursor: pointer;
}
.home-display-option[aria-pressed="true"] { border-color: var(--green); background: var(--green-pale); color: var(--green); }
.home-display-option-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.home-display-option strong { font-size: 12px; font-weight: 650; }
.home-display-option small { color: var(--muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.home-display-option:hover { background: var(--surface-soft, #eef3e8); }
.home-display-option:active { background: var(--line); }
.home-display-option:focus-visible { outline: 3px solid var(--green); outline-offset: 3px; }
</style>
