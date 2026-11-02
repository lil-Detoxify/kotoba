<script setup lang="ts">
import { ref, useId } from 'vue';
import { ArrowDown, ArrowUp } from 'lucide-vue-next';
import type { DictionarySourceId } from '../dictionary';
import { useDictionaryPreferences } from '../dictionary-preferences';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
const titleId = useId();
const preferredId = useId();
const message = ref('');
const {
  preferences, savedLocally, orderedSources, enabledSources,
  setPreferredSource, setSourceEnabled, moveSource, resetPreferences,
} = useDictionaryPreferences();

function changePreferred(event: Event): void {
  setPreferredSource((event.target as HTMLSelectElement).value as DictionarySourceId);
  message.value = '默认展开的来源已更新。';
}

function changeEnabled(id: DictionarySourceId, event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!setSourceEnabled(id, input.checked)) {
    input.checked = true;
    message.value = '请保留至少一个来源，方便继续查阅。';
    return;
  }
  message.value = input.checked ? '已显示这个来源。' : '已隐藏这个来源。';
}

function move(id: DictionarySourceId, direction: -1 | 1): void {
  moveSource(id, direction);
  message.value = '阅读顺序已更新。';
}

function reset(): void {
  resetPreferences();
  message.value = '已恢复中文优先的默认设置。';
}
</script>

<template>
  <section class="dictionary-preferences" :class="{ 'dictionary-preferences--compact': compact }" :aria-labelledby="titleId">
    <h3 :id="titleId">词典阅读偏好</h3>
    <p class="dictionary-preferences-intro">选择常看的来源和阅读顺序，保存在这台设备。</p>
    <div class="dictionary-preferences-default">
      <label :for="preferredId">默认展开</label>
      <select :id="preferredId" :value="preferences.preferredSource" @change="changePreferred">
        <option v-for="source in enabledSources" :key="source.id" :value="source.id">{{ source.name }}</option>
      </select>
    </div>
    <ol class="dictionary-preferences-list" aria-label="词典来源的阅读顺序">
      <li v-for="(source, index) in orderedSources" :key="source.id">
        <label class="dictionary-preferences-enabled">
          <input
            type="checkbox"
            :checked="!preferences.hidden.includes(source.id)"
            :aria-label="`显示 ${source.name}`"
            @change="changeEnabled(source.id, $event)"
          />
          <span>
            <strong>{{ source.name }}</strong><small>{{ source.language }}</small>
            <span v-if="!compact" class="dictionary-preferences-description">{{ source.description }}</span>
          </span>
        </label>
        <div class="dictionary-preferences-order">
          <button type="button" :disabled="index === 0" :aria-label="`将 ${source.name} 上移`" :title="`将 ${source.name} 上移`" @click="move(source.id, -1)">
            <ArrowUp :size="17" aria-hidden="true" />
          </button>
          <button type="button" :disabled="index === orderedSources.length - 1" :aria-label="`将 ${source.name} 下移`" :title="`将 ${source.name} 下移`" @click="move(source.id, 1)">
            <ArrowDown :size="17" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ol>
    <div class="dictionary-preferences-footer">
      <button type="button" @click="reset">恢复默认</button>
      <p aria-live="polite">{{ savedLocally ? message : '当前偏好已应用，但浏览器暂时无法保存；刷新后可能恢复默认。' }}</p>
    </div>
    <p v-if="!compact" class="dictionary-preferences-origin">Tomoshi 中文释义与 JMdict 英文义项同源；日文维基词典提供另一种释义视角。</p>
  </section>
</template>

<style scoped>
.dictionary-preferences { min-width: 0; color: inherit; }
.dictionary-preferences h3 { margin: 0 0 8px; font-size: 17px; }
.dictionary-preferences-intro { margin: 0 0 20px; color: var(--muted); font-size: 14px; line-height: 1.7; }
.dictionary-preferences-default { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 20px; margin-bottom: 20px; }
.dictionary-preferences-default label { color: inherit; }
.dictionary-preferences-default select { min-height: 44px; margin: 0; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; }
.dictionary-preferences-list { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--line); }
.dictionary-preferences-list li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--line); min-width: 0; }
.dictionary-preferences-enabled { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 44px; cursor: pointer; flex: 1; }
.dictionary-preferences-enabled input { flex: none; margin: 0; accent-color: var(--green); width: 18px; height: 18px; }
.dictionary-preferences-enabled > span { min-width: 0; overflow-wrap: anywhere; }
.dictionary-preferences-enabled strong { font-size: 14px; font-weight: 600; }
.dictionary-preferences-enabled small { color: var(--muted); margin-left: 8px; font-size: 12px; }
.dictionary-preferences-description { display: block; color: var(--muted); font-size: 12px; line-height: 1.6; margin-top: 5px; }
.dictionary-preferences-order { display: flex; gap: 8px; flex: none; }
.dictionary-preferences-order button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; background: transparent; transform: none; border: 1px solid var(--line-strong); border-radius: 8px; cursor: pointer; }
.dictionary-preferences button:hover { background: var(--surface-soft, #eef3e8); }
.dictionary-preferences button:not(:disabled):active { background: var(--line); transform: none; }
.dictionary-preferences button:focus-visible, .dictionary-preferences input:focus-visible, .dictionary-preferences select:focus-visible { outline: 3px solid var(--green); outline-offset: 3px; }
.dictionary-preferences-footer { display: flex; gap: 16px; align-items: center; margin-top: 16px; }
.dictionary-preferences-footer button { white-space: nowrap; min-height: 44px; padding: 8px 12px; flex: none; background: transparent; font-size: 13px; border: 1px solid var(--line-strong); border-radius: 8px; cursor: pointer; }
.dictionary-preferences-footer p { color: var(--muted); font-size: 12px; line-height: 1.7; margin: 0; }
.dictionary-preferences-origin { margin: 16px 0 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.dictionary-preferences--compact .dictionary-preferences-intro { font-size: 13px; margin-bottom: 16px; }
@media (max-width: 620px) {
  .dictionary-preferences-default { grid-template-columns: 1fr; gap: 8px; }
  .dictionary-preferences-default select { font-size: 16px; }
  .dictionary-preferences-list li { gap: 8px; }
  .dictionary-preferences-enabled strong { display: block; }
  .dictionary-preferences-enabled small { display: block; margin: 3px 0 0; }
  .dictionary-preferences-order { gap: 8px; }
  .dictionary-preferences-footer { align-items: flex-start; }
}
</style>
