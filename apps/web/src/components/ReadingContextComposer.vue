<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { ReadingContext, Word } from '@jp/models';
import { useApp } from '../store';

const props = withDefaults(defineProps<{
  word: Word;
  existing?: ReadingContext;
  collectToDifficult?: boolean;
  restoreIgnored?: boolean;
  initialMatchedText?: string;
}>(), {
  collectToDifficult: false,
  restoreIgnored: false,
  initialMatchedText: '',
});

const emit = defineEmits<{
  saved: [id: string];
  cancel: [];
}>();

const app = useApp();
const sentence = ref('');
const translation = ref('');
const sourceTitle = ref('');
const sourceUrl = ref('');
const errorMessage = ref('');
const busy = ref(false);
const userId = computed(() => app.currentUser?.id ?? null);
let revision = 0;

function resetForm() {
  revision += 1;
  sentence.value = props.existing?.sentence ?? '';
  translation.value = props.existing?.translation ?? '';
  sourceTitle.value = props.existing?.sourceTitle ?? '';
  sourceUrl.value = props.existing?.sourceUrl ?? '';
  errorMessage.value = '';
  busy.value = false;
}

watch([() => props.word.id, () => props.existing?.id, userId], resetForm, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { revision += 1; });

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

async function save() {
  if (busy.value || app.busy) return;
  const cleanSentence = sentence.value.trim();
  if (!cleanSentence) {
    errorMessage.value = '请填写原句。';
    return;
  }

  const expectedUserId = userId.value;
  const wordId = props.word.id;
  const ticket = revision;
  const stillCurrent = () => ticket === revision && (app.currentUser?.id ?? null) === expectedUserId && props.word.id === wordId;
  busy.value = true;
  errorMessage.value = '';
  try {
    const result = await app.saveReadingContext(wordId, {
      sentence: cleanSentence,
      translation: optionalValue(translation.value),
      sourceTitle: optionalValue(sourceTitle.value),
      sourceUrl: optionalValue(sourceUrl.value),
      matchedText: props.existing?.matchedText
        ?? optionalValue(props.initialMatchedText),
    }, {
      expectedUserId,
      collectToDifficult: props.collectToDifficult,
      restoreIgnored: props.restoreIgnored,
      ...(props.existing ? { contextId: props.existing.id } : {}),
    });

    if (result && stillCurrent()) {
      emit('saved', result.id);
    } else if (!result && stillCurrent()) {
      errorMessage.value = app.error || '原句没有保存，请重试。';
    }
  } catch (error) {
    if (stillCurrent()) {
      errorMessage.value = error instanceof Error ? error.message : app.error || '原句保存失败，请重试。';
    }
  } finally {
    if (stillCurrent()) busy.value = false;
  }
}

function cancel() {
  resetForm();
  emit('cancel');
}
</script>

<template>
  <form class="reading-context-composer" :aria-label="existing ? '编辑原句' : '收藏原句'" @submit.prevent="save">
    <label class="reading-context-field">
      <span>日语原句 <i>必填</i></span>
      <textarea v-model="sentence" required maxlength="2000" rows="3" placeholder="写下遇到这个词的完整句子" />
    </label>
    <label class="reading-context-field">
      <span>中文翻译 <small>选填</small></span>
      <textarea v-model="translation" maxlength="2000" rows="2" placeholder="补充你理解的意思" />
    </label>
    <details class="reading-context-source">
      <summary>来源信息 <small>选填</small></summary>
      <div class="reading-context-source-fields">
        <label class="reading-context-field">
          <span>来源名称</span>
          <input v-model="sourceTitle" type="text" maxlength="200" autocomplete="off" placeholder="例如：小说、新闻或播客" />
        </label>
        <label class="reading-context-field">
          <span>来源网址</span>
          <input v-model="sourceUrl" type="url" maxlength="2048" autocomplete="url" placeholder="https://…" />
        </label>
      </div>
    </details>
    <small class="reading-context-source-note">原句和来源保存在本机浏览器中。</small>
    <p v-if="errorMessage" class="reading-context-error" role="alert">{{ errorMessage }}</p>
    <div class="reading-context-actions">
      <button type="button" class="reading-context-cancel" :disabled="busy" @click="cancel">取消</button>
      <button type="submit" class="reading-context-submit" :disabled="busy || app.busy">
        {{ busy ? '保存中…' : existing ? '保存修改' : restoreIgnored ? '恢复并收藏原句' : '收藏原句' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.reading-context-composer {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-inset);
  background: var(--surface-muted);
}
.reading-context-field { display: grid; gap: 4px; min-width: 0; color: var(--muted); font-size: 13px; }
.reading-context-field > span { display: flex; align-items: baseline; gap: 7px; }
.reading-context-field i { color: #8b6148; font-size: 11px; font-style: normal; }
.reading-context-field small, .reading-context-source summary small { color: var(--muted); font-size: 11px; font-weight: 400; }
.reading-context-field textarea, .reading-context-field input { width: 100%; min-width: 0; margin: 0; padding: 10px 11px; border: 1px solid var(--border-strong); border-radius: var(--radius-control); background: var(--paper); color: #2d4034; font: inherit; font-size: 16px; line-height: 1.65; }
.reading-context-field textarea { resize: vertical; overflow-wrap: anywhere; word-break: break-word; }
.reading-context-field textarea::placeholder, .reading-context-field input::placeholder { color: var(--muted); }
.reading-context-source { padding-top: 2px; }
.reading-context-source summary { min-height: 44px; color: var(--green); cursor: pointer; font-size: 12px; }
.reading-context-source-fields { display: grid; gap: 10px; padding: 4px 0 8px; }
.reading-context-source-note { display: block; color: var(--muted); font-size: 11px; }
.reading-context-error { margin: 0; color: #914d3a; font-size: 12px; }
.reading-context-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.reading-context-actions button { min-height: 44px; padding: 8px 13px; border-radius: var(--radius-control); font-size: 13px; }
.reading-context-cancel { background: var(--paper); color: var(--muted); }
.reading-context-submit { border-color: var(--green); background: var(--green); color: white; }
.reading-context-submit:not(:disabled):hover { background: #36553d; }
@media (max-width: 520px) {
  .reading-context-composer { padding: 12px; }
  .reading-context-actions { display: grid; grid-template-columns: 1fr 1fr; }
}
</style>
