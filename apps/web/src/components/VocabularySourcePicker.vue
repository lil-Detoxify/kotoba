<script setup lang="ts">
import { ref } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';
import type { VocabularySearchResult } from '../services/vocabulary-search';

const props = defineProps<{
  entries: VocabularySearchResult[];
  selectedId: string;
  disabled?: boolean;
  disabledReason?: string;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();

const details = ref<HTMLDetailsElement | null>(null);
const summary = ref<HTMLElement | null>(null);

function selectEntry(id: string) {
  if (props.disabled) return;
  emit('select', id);
  if (details.value) details.value.open = false;
  summary.value?.focus();
}
</script>

<template>
  <details ref="details" class="vocabulary-source-picker">
    <summary ref="summary" class="source-picker-summary">
      <span>共 {{ entries.length }} 处收录</span>
      <ChevronDown :size="17" aria-hidden="true" />
    </summary>
    <div class="source-picker-list">
      <p v-if="disabledReason" class="source-picker-reason">{{ disabledReason }}</p>
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="source-picker-option"
        :class="{ selected: entry.id === selectedId }"
        :aria-pressed="entry.id === selectedId"
        :disabled="disabled"
        @click="selectEntry(entry.id)"
      >
        <span class="source-picker-copy">
          <span class="source-picker-book">{{ entry.bookTitle }}</span>
          <span class="source-picker-lesson">{{ entry.lessonTitle }}</span>
          <span class="source-picker-meaning">{{ entry.meaning }}</span>
        </span>
        <span v-if="entry.id === selectedId" class="source-picker-selected">
          <Check :size="15" aria-hidden="true" />
          <span>已选</span>
        </span>
      </button>
    </div>
  </details>
</template>

<style scoped>
.vocabulary-source-picker {
  min-width: 0;
  color: var(--muted, #68756a);
  font-size: 13px;
}

.source-picker-summary {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
  color: var(--green, #365d49);
  cursor: pointer;
  list-style: none;
}

.source-picker-summary::-webkit-details-marker {
  display: none;
}

.source-picker-summary:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 3px;
  border-radius: var(--radius-control);
}

.vocabulary-source-picker[open] .source-picker-summary svg {
  transform: rotate(180deg);
}

.source-picker-summary svg {
  flex: 0 0 auto;
  color: var(--muted, #68756a);
  transition: transform var(--motion-fast) var(--ease-ui);
}

.source-picker-list {
  min-width: 0;
  border-top: 1px solid var(--border-soft);
}

.source-picker-reason {
  margin: 0;
  padding: 9px 2px;
  color: var(--muted, #68756a);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.source-picker-option {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-bottom: 1px solid var(--border-soft);
  border-radius: var(--radius-control);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-ui);
}

.source-picker-option.selected {
  background: var(--surface-selected);
  color: var(--green, #365d49);
}

.source-picker-option:not(:disabled):hover {
  background: var(--surface-muted);
}

.source-picker-option.selected:not(:disabled):hover {
  background: var(--surface-selected);
}

.source-picker-option:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.source-picker-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  overflow-wrap: anywhere;
}

.source-picker-book {
  color: var(--green, #365d49);
  font-weight: 600;
  line-height: 1.4;
}

.source-picker-lesson {
  color: var(--muted, #68756a);
  font-size: 12px;
  line-height: 1.4;
}

.source-picker-meaning {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted, #68756a);
  line-height: 1.45;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.source-picker-selected {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  color: var(--green, #365d49);
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .source-picker-summary svg,
  .source-picker-option {
    transition: none;
  }
}
</style>
