<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';

const props = defineProps<{
  bookAvailable: number;
  selectedAvailable: number;
  selectedTotal: number;
  selectedLessons: number;
  unitLabel: string;
  busy: boolean;
  error: string;
}>();

const emit = defineEmits<{
  start: [];
}>();
</script>

<template>
  <section class="cloze-practice-panel">
    <div class="cloze-practice-copy">
      <div class="cloze-practice-heading">
        <h2>例句填空</h2>
        <p>本书 {{ props.bookAvailable }} 词可练</p>
      </div>

      <p v-if="props.selectedLessons > 0" class="cloze-practice-summary">
        已选 {{ props.selectedLessons }} {{ props.unitLabel }} · {{ props.selectedAvailable }} / {{ props.selectedTotal }} 词有用例
      </p>
      <p v-else class="cloze-practice-summary">
        选择课次，练习其中的用例。
      </p>

      <p
        v-if="props.selectedLessons > 0 && props.selectedAvailable === 0"
        class="cloze-practice-empty"
      >
        当前选择没有可练例句，可改选其他课次。
      </p>
      <p v-if="props.error" class="cloze-practice-error" role="alert">
        {{ props.error }}
      </p>
    </div>

    <button
      type="button"
      class="cloze-practice-action"
      :disabled="props.selectedAvailable === 0 || props.busy"
      @click="emit('start')"
    >
      <span>{{ props.busy ? '正在准备…' : '练习所选例句' }}</span>
      <ArrowRight v-if="!props.busy" :size="16" aria-hidden="true" />
    </button>
  </section>
</template>

<style scoped>
.cloze-practice-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 0 15px;
  border-block: 1px solid #dce4d6;
  color: #293e30;
}

.cloze-practice-copy {
  min-width: 0;
}

.cloze-practice-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 3px 12px;
}

.cloze-practice-heading h2 {
  margin: 0;
  color: #293e30;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
}

.cloze-practice-heading p,
.cloze-practice-summary,
.cloze-practice-empty,
.cloze-practice-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
}

.cloze-practice-heading p {
  color: #64735c;
}

.cloze-practice-summary {
  margin-top: 2px;
  color: #64735c;
}

.cloze-practice-empty {
  margin-top: 2px;
  color: #765f43;
}

.cloze-practice-error {
  margin-top: 4px;
  color: #9b443a;
}

.cloze-practice-action {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  margin: -4px 0 0;
  padding: 6px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--green, #315944);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
}

.cloze-practice-action:not(:disabled):hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.cloze-practice-action:focus-visible {
  outline: 2px solid var(--green, #315944);
  outline-offset: 3px;
}

.cloze-practice-action:disabled {
  color: #879487;
  cursor: default;
}

@media (max-width: 560px) {
  .cloze-practice-panel {
    flex-direction: column;
    gap: 7px;
  }

  .cloze-practice-action {
    margin: 0;
  }
}
</style>
