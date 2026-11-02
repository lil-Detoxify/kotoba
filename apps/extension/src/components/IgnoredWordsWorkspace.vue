<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { ArrowLeft, BookOpen, LoaderCircle, RotateCcw, Search } from 'lucide-vue-next';
import { extensionApi } from '../client';
import { ignoredLibraryWords, type IgnoredWordEntry } from '../library-reports';
import { personalLibraryData } from '../personal-library';
import type { ExtensionSnapshot, ExtensionWord } from '../model';
import MeaningPreview from '../../../web/src/components/MeaningPreview.vue';

const props = defineProps<{
  snapshot: ExtensionSnapshot;
  catalog: ExtensionWord[];
}>();

const emit = defineEmits<{
  changed: [snapshot: ExtensionSnapshot];
  back: [];
}>();

const rows = computed(() => ignoredLibraryWords(props.snapshot, props.catalog));
const libraryData = computed(() => personalLibraryData(props.snapshot, props.catalog));
const selectedBookId = ref('');
const selectedLessonId = ref('');
const query = ref('');
const listLimit = ref(40);
const busyWordId = ref<string | null>(null);
const actionError = ref<{ wordId: string; message: string } | null>(null);
const actionMessage = ref('');
let viewGeneration = 0;

const bookOptions = computed(() => {
  const counts = new Map<string, number>();
  for (const row of rows.value) {
    counts.set(row.bookId, (counts.get(row.bookId) ?? 0) + 1);
  }

  const books = new Map<string, { id: string; title: string; count: number }>();
  for (const book of libraryData.value.books) {
    books.set(book.id, {
      id: book.id,
      title: book.title || '未命名词书',
      count: counts.get(book.id) ?? 0,
    });
  }
  for (const row of rows.value) {
    if (!books.has(row.bookId)) books.set(row.bookId, {
      id: row.bookId,
      title: row.bookTitle || '未命名词书',
      count: counts.get(row.bookId) ?? 0,
    });
  }
  return [...books.values()].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans'));
});

const lessonOptions = computed(() => {
  if (!selectedBookId.value) return [];
  type LessonOption = { id: string; title: string; count: number; order: number };
  const counts = new Map<string, number>();
  for (const row of rows.value) {
    if (row.bookId !== selectedBookId.value) continue;
    const lessonId = row.word.lessonId;
    counts.set(lessonId, (counts.get(lessonId) ?? 0) + 1);
  }

  const lessons = new Map<string, LessonOption>();
  for (const lesson of libraryData.value.lessons) {
    if (lesson.bookId !== selectedBookId.value) continue;
    lessons.set(lesson.id, {
      id: lesson.id,
      title: lesson.title || lesson.id,
      count: counts.get(lesson.id) ?? 0,
      order: lesson.order,
    });
  }
  for (const row of rows.value) {
    if (row.bookId !== selectedBookId.value || lessons.has(row.word.lessonId)) continue;
    const lessonId = row.word.lessonId;
    lessons.set(row.word.lessonId, {
      id: lessonId,
      title: row.lessonTitle || lessonId,
      count: counts.get(lessonId) ?? 0,
      order: Number.MAX_SAFE_INTEGER,
    });
  }
  return [...lessons.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-Hans'));
});

const filteredRows = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return rows.value.filter(row => {
    if (selectedBookId.value && row.bookId !== selectedBookId.value) return false;
    if (selectedLessonId.value && row.word.lessonId !== selectedLessonId.value) return false;
    if (!needle) return true;
    return `${row.word.term} ${row.word.reading} ${row.word.meaning}`.toLocaleLowerCase().includes(needle);
  });
});

const visibleRows = computed(() => filteredRows.value.slice(0, listLimit.value));
const hasFilters = computed(() => Boolean(selectedBookId.value || selectedLessonId.value || query.value.trim()));
const visibleCount = computed(() => Math.min(listLimit.value, filteredRows.value.length));

watch(selectedBookId, () => {
  selectedLessonId.value = '';
});

watch([selectedBookId, selectedLessonId, query], () => {
  listLimit.value = 40;
});

watch(bookOptions, options => {
  if (selectedBookId.value && !options.some(book => book.id === selectedBookId.value)) selectedBookId.value = '';
}, { flush: 'sync' });

watch(lessonOptions, options => {
  if (selectedLessonId.value && !options.some(lesson => lesson.id === selectedLessonId.value)) selectedLessonId.value = '';
}, { flush: 'sync' });

watch(() => props.snapshot.identity?.partitionKey, () => {
  viewGeneration++;
  selectedBookId.value = '';
  selectedLessonId.value = '';
  query.value = '';
  listLimit.value = 40;
  busyWordId.value = null;
  actionError.value = null;
  actionMessage.value = '';
}, { flush: 'sync' });

onUnmounted(() => { viewGeneration++; });

function resetFilters() {
  selectedBookId.value = '';
  selectedLessonId.value = '';
  query.value = '';
  listLimit.value = 40;
  actionError.value = null;
  actionMessage.value = '';
}

async function restore(row: IgnoredWordEntry) {
  if (busyWordId.value) return;
  const generation = viewGeneration;
  busyWordId.value = row.word.id;
  actionError.value = null;
  actionMessage.value = '';

  try {
    const next = await extensionApi.setLearningFlags(row.word.id, { isIgnored: false }, row.word);
    if (generation !== viewGeneration) return;
    emit('changed', next);
    actionMessage.value = `${row.word.term} 已恢复，学习进度已保留。`;
  } catch (error) {
    if (generation === viewGeneration) {
      actionError.value = {
        wordId: row.word.id,
        message: error instanceof Error && error.message ? error.message : '恢复失败，请重试。',
      };
    }
  } finally {
    if (generation === viewGeneration) busyWordId.value = null;
  }
}
</script>

<template>
  <section class="ignored-workspace" aria-labelledby="ignored-title">
    <header class="ignored-header">
      <button class="ignored-back" type="button" aria-label="返回上一页" @click="emit('back')">
        <ArrowLeft :size="18" aria-hidden="true" />
        <span>返回</span>
      </button>
      <div class="ignored-title-block">
        <span class="ignored-eyebrow">PERSONAL LIBRARY</span>
        <h1 id="ignored-title">已忽略的词</h1>
        <p>恢复后可以继续学习，原有进度会保留。</p>
      </div>
      <div class="ignored-total" aria-label="已忽略词总数">
        <strong>{{ rows.length }}</strong>
        <span>个单词</span>
      </div>
    </header>

    <div v-if="rows.length" class="ignored-controls">
      <div class="ignored-filters">
        <label class="ignored-field">
          <span>词书</span>
          <select v-model="selectedBookId" aria-label="按词书筛选">
            <option value="">全部词书</option>
            <option v-for="book in bookOptions" :key="book.id" :value="book.id">
              {{ book.title }}（{{ book.count }}）
            </option>
          </select>
        </label>
        <label class="ignored-field">
          <span>课时</span>
          <select v-model="selectedLessonId" aria-label="按课时筛选" :disabled="!selectedBookId">
            <option value="">{{ selectedBookId ? '全部课时' : '先选择词书' }}</option>
            <option v-for="lesson in lessonOptions" :key="lesson.id" :value="lesson.id">
              {{ lesson.title }}（{{ lesson.count }}）
            </option>
          </select>
        </label>
      </div>

      <label class="ignored-search">
        <Search :size="17" aria-hidden="true" />
        <span class="sr-only">搜索单词、假名或中文释义</span>
        <input v-model="query" type="search" autocomplete="off" placeholder="搜索单词、假名或中文释义" />
      </label>
      <div class="ignored-result-line">
        <p>当前匹配 <strong>{{ filteredRows.length }}</strong> 个，共忽略 {{ rows.length }} 个</p>
        <button v-if="hasFilters" class="ignored-reset" type="button" @click="resetFilters">重置筛选</button>
      </div>
    </div>

    <div v-if="actionMessage" class="ignored-feedback is-success" role="status" aria-live="polite">
      <BookOpen :size="16" aria-hidden="true" />
      <span>{{ actionMessage }}</span>
    </div>

    <ul v-if="visibleRows.length" class="ignored-list" aria-label="已忽略的单词">
      <li v-for="row in visibleRows" :key="row.word.id" class="ignored-card">
        <div class="ignored-word-copy">
          <p class="ignored-location">{{ row.bookTitle }}<span aria-hidden="true"> · </span>{{ row.lessonTitle }}</p>
          <h2>{{ row.word.term }}</h2>
          <p v-if="row.word.reading" class="ignored-reading">{{ row.word.reading }}</p>
          <MeaningPreview class="ignored-meaning" :word="row.word" />
        </div>
        <button
          class="ignored-restore"
          type="button"
          :disabled="Boolean(busyWordId)"
          :aria-label="busyWordId === row.word.id ? `正在恢复${row.word.term}` : `恢复${row.word.term}的学习`"
          @click="restore(row)"
        >
          <LoaderCircle v-if="busyWordId === row.word.id" class="ignored-spinner" :size="15" aria-hidden="true" />
          <RotateCcw v-else :size="15" aria-hidden="true" />
          <span>{{ busyWordId === row.word.id ? '正在恢复' : '恢复学习' }}</span>
        </button>
        <p v-if="actionError?.wordId === row.word.id" class="ignored-error" role="alert">{{ actionError.message }}</p>
      </li>
    </ul>

    <section v-else-if="rows.length && hasFilters" class="ignored-empty" aria-live="polite">
      <Search :size="22" aria-hidden="true" />
      <h2>没有符合条件的单词</h2>
      <p>调整搜索内容，或重置筛选后再试。</p>
      <button class="ignored-empty-action" type="button" @click="resetFilters">重置筛选</button>
    </section>
    <section v-else-if="!rows.length" class="ignored-empty">
      <BookOpen :size="22" aria-hidden="true" />
      <h2>这里还没有被忽略的词</h2>
      <p>学习时忽略的单词会集中显示在这里。</p>
      <button class="ignored-empty-action" type="button" @click="emit('back')">返回上一页</button>
    </section>

    <button
      v-if="visibleCount < filteredRows.length"
      class="ignored-load-more"
      type="button"
      @click="listLimit += 40"
    >
      再显示 {{ Math.min(40, filteredRows.length - visibleCount) }} 个
    </button>
  </section>
</template>

<style scoped>
.ignored-workspace {
  width: 100%;
  min-width: 0;
  color: var(--ink);
}

.ignored-header {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 5px 0 17px;
  border-bottom: 1px solid var(--line);
}

.ignored-back {
  display: inline-flex;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--green);
  font-size: 12px;
  cursor: pointer;
}

.ignored-back:hover { color: var(--green-deep); background: var(--green-pale); }

.ignored-title-block { min-width: 0; padding-top: 2px; }
.ignored-eyebrow { color: var(--gold); font-size: 9px; font-weight: 700; letter-spacing: .13em; }
.ignored-title-block h1 { margin: 3px 0 2px; font-size: 20px; line-height: 1.4; overflow-wrap: anywhere; }
.ignored-title-block p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.ignored-total { display: flex; min-width: 52px; flex-direction: column; align-items: flex-end; padding-top: 7px; }
.ignored-total strong { color: var(--green); font-size: 19px; font-variant-numeric: tabular-nums; line-height: 1.2; }
.ignored-total span { color: var(--muted); font-size: 10px; }

.ignored-controls { display: grid; gap: 10px; padding: 14px 0 5px; }
.ignored-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.ignored-field { display: grid; min-width: 0; gap: 5px; color: var(--ink-soft); font-size: 11px; font-weight: 650; }
.ignored-field select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 0 30px 0 10px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  appearance: auto;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  font-weight: 400;
}
.ignored-field select:disabled { color: var(--muted); background: #f3f5f0; }

.ignored-search {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: #fff;
  color: var(--muted);
}
.ignored-search:focus-within { border-color: var(--green); box-shadow: 0 0 0 2px rgba(49, 89, 68, .1); }
.ignored-search input { width: 100%; min-width: 0; min-height: 42px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 13px; }
.ignored-search input::placeholder { color: var(--muted); opacity: 1; }
.ignored-search input::-webkit-search-cancel-button { cursor: pointer; }

.ignored-result-line { display: flex; min-height: 30px; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 11px; }
.ignored-result-line p { margin: 0; }
.ignored-result-line strong { color: var(--green); font-variant-numeric: tabular-nums; }
.ignored-reset { min-height: 44px; padding: 4px 6px; border: 0; border-radius: 7px; background: transparent; color: var(--green); font-size: 11px; cursor: pointer; }
.ignored-reset:hover { background: var(--green-pale); }

.ignored-feedback { display: flex; align-items: flex-start; gap: 8px; margin: 10px 0; padding: 10px 11px; border: 1px solid #d6e5d2; border-radius: 9px; font-size: 12px; line-height: 1.55; }
.ignored-feedback svg { flex: none; margin-top: 1px; }
.ignored-feedback.is-success { background: var(--green-pale); color: var(--green); }

.ignored-list { display: grid; gap: 9px; padding: 0; margin: 8px 0 0; list-style: none; }
.ignored-card { display: grid; grid-template-columns: minmax(0, 1fr) 106px; align-items: center; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
.ignored-word-copy { min-width: 0; }
.ignored-location { margin: 0 0 5px; color: var(--muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.ignored-word-copy h2 { margin: 0; font-size: 19px; line-height: 1.3; overflow-wrap: anywhere; }
.ignored-reading { margin: 2px 0 0; color: var(--gold); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.ignored-meaning { margin: 4px 0 0; color: var(--ink-soft); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
.ignored-restore {
  display: inline-flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--green-pale);
  color: var(--green);
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
}
.ignored-restore:hover:not(:disabled) { border-color: var(--green); background: var(--green-soft); }
.ignored-restore:disabled { opacity: .6; cursor: wait; }
.ignored-restore svg { flex: none; }
.ignored-spinner { animation: ignored-spin 900ms linear infinite; }
.ignored-error { grid-column: 1 / -1; margin: 0; color: var(--red); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }

.ignored-empty { display: grid; justify-items: center; gap: 8px; padding: 30px 14px; margin-top: 12px; border: 1px dashed var(--line-strong); border-radius: 12px; background: #fbfcf8; color: var(--muted); text-align: center; }
.ignored-empty > svg { color: var(--green); }
.ignored-empty h2 { margin: 0; color: var(--ink); font-size: 15px; line-height: 1.45; }
.ignored-empty p { max-width: 260px; margin: 0; font-size: 12px; line-height: 1.6; }
.ignored-empty-action,.ignored-load-more { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--paper); color: var(--green); font-size: 12px; font-weight: 650; cursor: pointer; }
.ignored-empty-action { margin-top: 4px; }
.ignored-empty-action:hover,.ignored-load-more:hover { border-color: var(--green); background: var(--green-pale); }
.ignored-load-more { width: 100%; margin: 12px 0 8px; }

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@keyframes ignored-spin { to { transform: rotate(360deg); } }

@media (max-width: 359px) {
  .ignored-header { grid-template-columns: 60px minmax(0, 1fr) auto; gap: 6px; }
  .ignored-back { gap: 1px; font-size: 11px; }
  .ignored-title-block h1 { font-size: 18px; }
  .ignored-title-block p { font-size: 10px; }
  .ignored-card { grid-template-columns: minmax(0, 1fr) 99px; gap: 7px; padding: 10px; }
  .ignored-restore { gap: 4px; padding: 0 5px; font-size: 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .ignored-spinner { animation: none; }
}
</style>
