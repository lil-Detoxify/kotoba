<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ReadingContext, Word } from '@jp/models';
import { useApp } from '../store';
import ReadingContextComposer from './ReadingContextComposer.vue';
import {meaningPresentation} from '../services/meaning-presentation';

export interface PersonalReadingContextEntry {
  word: Word;
  context: ReadingContext;
  bookTitle: string;
  lessonTitle: string;
  ignored: boolean;
  canPractice: boolean;
}

const props = withDefaults(defineProps<{
  entries: PersonalReadingContextEntry[];
  busy?: boolean;
}>(), { busy: false });

const emit = defineEmits<{
  practice: [entry: PersonalReadingContextEntry];
}>();

const app = useApp();
const owner = computed(() => app.currentUser?.id ?? null);
const editing = ref<{ entry: PersonalReadingContextEntry; ticket: number; ownerId: string | null } | null>(null);
const removingId = ref('');
const error = ref('');
const notice = ref('');
let operation = 0;

const blocked = computed(() => props.busy || app.busy || !!removingId.value);

function safeSourceUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function sentenceParts(sentence: string, matchedText?: string) {
  if (!matchedText) return [{ text: sentence, matched: false }];
  const at = sentence.indexOf(matchedText);
  if (at < 0) return [{ text: sentence, matched: false }];
  return [
    ...(at ? [{ text: sentence.slice(0, at), matched: false }] : []),
    { text: matchedText, matched: true },
    ...(at + matchedText.length < sentence.length
      ? [{ text: sentence.slice(at + matchedText.length), matched: false }]
      : []),
  ];
}

function startEdit(entry: PersonalReadingContextEntry) {
  if (blocked.value || editing.value) return;
  error.value = '';
  notice.value = '';
  const ticket = ++operation;
  editing.value = { entry, ticket, ownerId: owner.value };
}

function cancelEdit(ticket: number) {
  if (editing.value?.ticket !== ticket || ticket !== operation) return;
  operation++;
  editing.value = null;
  error.value = '';
}

function saved(ticket: number) {
  if (editing.value?.ticket !== ticket || ticket !== operation || editing.value.ownerId !== owner.value) return;
  editing.value = null;
  error.value = '';
  notice.value = '原句已保存。';
}

function practice(entry: PersonalReadingContextEntry) {
  if (blocked.value || editing.value || !entry.canPractice || entry.ignored) return;
  emit('practice', entry);
}

async function remove(entry: PersonalReadingContextEntry) {
  if (blocked.value || editing.value) return;
  const ticket = ++operation;
  const wordId = entry.word.id;
  const contextId = entry.context.id;
  const expectedUserId = owner.value;
  const stillOwner = () => ticket === operation && expectedUserId === owner.value;
  removingId.value = `${wordId}:${contextId}`;
  error.value = '';
  notice.value = '';
  try {
    const removed = await app.removeReadingContext(wordId, contextId, expectedUserId);
    if (!stillOwner()) return;
    if (!removed) {
      error.value = '原句未能移除，请刷新后重试。';
      return;
    }
    notice.value = '原句已移除。';
  } catch {
    if (stillOwner()) error.value = '原句移除失败，请稍后重试。';
  } finally {
    if (stillOwner()) removingId.value = '';
  }
}

watch(owner, () => {
  operation++;
  editing.value = null;
  removingId.value = '';
  error.value = '';
  notice.value = '';
});
watch(()=>props.entries,entries=>{
  if(editing.value&&!entries.some(entry=>entry.word.id===editing.value?.entry.word.id&&entry.context.id===editing.value?.entry.context.id)){
    operation++;editing.value=null;
  }
});
</script>

<template>
  <section v-if="entries.length" class="personal-reading-contexts" aria-label="个人阅读原句">
    <article
      v-for="entry in entries"
      :key="`${entry.word.id}:${entry.context.id}`"
      class="personal-reading-context"
    >
      <header class="personal-reading-context-word">
        <span class="personal-reading-context-term" lang="ja">{{ entry.word.term }}</span>
        <span class="personal-reading-context-reading" lang="ja">{{ entry.word.reading }}</span>
        <span class="personal-reading-context-meaning">{{ meaningPresentation(entry.word).summary }}</span>
      </header>

      <p class="personal-reading-context-sentence" lang="ja">
        <template v-for="(part, index) in sentenceParts(entry.context.sentence, entry.context.matchedText)" :key="index">
          <mark v-if="part.matched">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
        </template>
      </p>
      <p v-if="entry.context.translation" class="personal-reading-context-translation">{{ entry.context.translation }}</p>

      <p class="personal-reading-context-location">
        <span>{{ entry.bookTitle }}</span>
        <span v-if="entry.lessonTitle"> · {{ entry.lessonTitle }}</span>
      </p>
      <div class="personal-reading-context-source">
        <span v-if="entry.context.sourceTitle">{{ entry.context.sourceTitle }}</span>
        <a
          v-if="safeSourceUrl(entry.context.sourceUrl)"
          :href="safeSourceUrl(entry.context.sourceUrl)"
          target="_blank"
          rel="noopener noreferrer"
        >{{ entry.context.sourceUrl }}</a>
        <span v-else-if="entry.context.sourceUrl">{{ entry.context.sourceUrl }}</span>
        <span v-if="!entry.context.sourceTitle && !entry.context.sourceUrl">来源未注明</span>
      </div>

      <div class="personal-reading-context-actions">
        <button
          type="button"
          v-if="entry.canPractice&&!entry.ignored"
          class="personal-reading-context-practice"
          :disabled="blocked || !!editing || !entry.canPractice || entry.ignored"
          @click="practice(entry)"
        >
          原句填空
        </button>
        <span v-else class="personal-reading-context-location">{{entry.ignored?'已忽略，恢复后可练习':'复习时可展示'}}</span>
        <button type="button" :disabled="blocked || !!editing" @click="startEdit(entry)">修改</button>
        <button
          type="button"
          :disabled="blocked || !!editing"
          @click="remove(entry)"
        >
          {{ removingId === `${entry.word.id}:${entry.context.id}` ? '正在移除…' : '移除' }}
        </button>
      </div>

      <ReadingContextComposer
        v-if="editing?.entry.word.id === entry.word.id && editing?.entry.context.id === entry.context.id"
        :key="`${editing.ownerId ?? 'guest'}:${entry.word.id}:${entry.context.id}:${editing.ticket}`"
        class="personal-reading-context-composer"
        :word="editing.entry.word"
        :existing="editing.entry.context"
        :collect-to-difficult="false"
        @saved="editing && saved(editing.ticket)"
        @cancel="editing && cancelEdit(editing.ticket)"
      />
    </article>

    <p v-if="notice" class="personal-reading-context-status" role="status">{{ notice }}</p>
    <p v-if="error" class="personal-reading-context-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.personal-reading-contexts {
  display: grid;
  min-width: 0;
  gap: 12px;
  color: #293e30;
}

.personal-reading-context {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-inset);
  background: var(--surface-muted);
}

.personal-reading-context-word {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
}

.personal-reading-context-term {
  color: var(--green, #365d49);
  font-size: 16px;
  font-weight: 650;
  overflow-wrap: anywhere;
}

.personal-reading-context-reading {
  color: var(--muted, #68756a);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.personal-reading-context-meaning {
  min-width: 0;
  color: var(--muted, #68756a);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.personal-reading-context-sentence {
  min-width: 0;
  margin: 9px 0 0;
  color: #293e30;
  font-size: 17px;
  line-height: 1.75;
  overflow-wrap: anywhere;
  word-break: normal;
}

.personal-reading-context-sentence mark {
  border-radius: 4px;
  background: var(--surface-selected);
  color: inherit;
  padding: 0 1px;
}

.personal-reading-context-translation {
  margin: 4px 0 0;
  color: var(--muted, #68756a);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.personal-reading-context-location,
.personal-reading-context-source {
  min-width: 0;
  margin: 8px 0 0;
  color: var(--muted, #68756a);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.personal-reading-context-location {
  color: var(--green, #536b57);
}

.personal-reading-context-source {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
}

.personal-reading-context-source a {
  min-width: 0;
  color: var(--muted, #68756a);
  text-decoration: underline;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.personal-reading-context-actions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.personal-reading-context-actions button {
  min-width: 74px;
  min-height: 44px;
  padding: 8px 11px;
  border-radius: var(--radius-control);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.personal-reading-context-actions .personal-reading-context-practice {
  color: var(--green, #365d49);
}

.personal-reading-context-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.personal-reading-context-status,
.personal-reading-context-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.personal-reading-context-status {
  color: var(--green, #496d52);
}

.personal-reading-context-error {
  color: #8a3d2c;
}

.personal-reading-context :deep(.reading-context-composer) {
  margin-top: 11px;
  padding: 12px 0 0;
  border: 0;
  border-top: 1px solid var(--border-soft);
  border-radius: 0;
  background: transparent;
}

@media (max-width: 420px) {
  .personal-reading-context {
    padding: 12px;
  }

  .personal-reading-context-sentence {
    font-size: 16px;
  }

  .personal-reading-context-actions {
    gap: 6px;
  }
}
</style>
