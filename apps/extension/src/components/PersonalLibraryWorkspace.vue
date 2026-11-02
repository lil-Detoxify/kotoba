<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { ArrowLeft, BookOpen, Check, Download, FileUp, LoaderCircle, Pencil, Plus, Search, Trash2 } from 'lucide-vue-next';
import type { Lesson, ReadingContext } from '@jp/models';
import { extensionApi } from '../client';
import type { ExtensionBook, ExtensionSnapshot, ExtensionWord } from '../model';
import type { PersonalLibraryMutation } from '../personal-library';
import { exportExtensionPersonalLibrary, extensionBuiltinBookIds, extensionContentWords, personalLibraryData } from '../personal-library';
import PersonalLibraryBackup from './PersonalLibraryBackup.vue';
import {
  parsePersonalLibrary,
  previewPersonalLibraryMerge,
  summarizePersonalLibrary,
  type ExistingContentPolicy,
  type PersonalLibrary,
  type PersonalLibraryPreview,
} from '../../../web/src/services/personal-library';
import { wordReadingContexts, type ReadingContextDraft } from '../../../web/src/services/reading-context';
import { contextClozeExample } from '../../../web/src/services/personal-learning-example';
import MeaningPreview from '../../../web/src/components/MeaningPreview.vue';

const props = defineProps<{
  snapshot: ExtensionSnapshot;
  catalog: ExtensionWord[];
  initialWordId?: string;
}>();

const emit = defineEmits<{
  changed: [snapshot: ExtensionSnapshot];
  back: [];
  'practice-context': [value: { wordId: string; contextId: string }];
}>();

type DeleteTarget = { type: 'book' | 'lesson' | 'word' | 'context'; id: string; label: string; wordId?: string };
type BookDraft = { title: string; description: string };
type WordDraft = { term: string; reading: string; meaning: string; partOfSpeech: string; example: string; exampleTranslation: string };
type ContextDraftForm = { sentence: string; translation: string; sourceTitle: string; sourceUrl: string; matchedText: string };

const libraryData = computed(() => personalLibraryData(props.snapshot, props.catalog));
const builtinBookIds = computed(() => extensionBuiltinBookIds(props.catalog));
const builtinBookIdSet = computed(() => new Set(builtinBookIds.value));
const manualBooks = computed(() => {
  const lessonBook = new Map(libraryData.value.lessons.map(lesson => [lesson.id, lesson.bookId]));
  const counts = new Map<string, number>();
  for (const word of libraryData.value.words) {
    const bookId = lessonBook.get(word.lessonId);
    if (bookId) counts.set(bookId, (counts.get(bookId) ?? 0) + 1);
  }
  return libraryData.value.books.filter(book => !builtinBookIdSet.value.has(book.id)).map(book => ({
    id: book.id,
    title: book.title,
    description: book.description,
    wordCount: counts.get(book.id) ?? 0,
    source: 'manual' as const,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
    ...(book.cover === undefined ? {} : { cover: book.cover }),
  }));
});
const manualBookIds = computed(() => new Set(manualBooks.value.map(book => book.id)));
const manualLessons = computed(() => libraryData.value.lessons.filter(lesson => manualBookIds.value.has(lesson.bookId)));
const contentWords = computed(() => {
  const merged = new Map<string, ExtensionWord>();
  for (const word of props.catalog) merged.set(word.id, word);
  for (const word of extensionContentWords(props.snapshot, props.catalog)) merged.set(word.id, word);
  for (const word of props.snapshot.learning.words) merged.set(word.id, word);
  return [...merged.values()];
});
const wordsById = computed(() => new Map(contentWords.value.map(word => [word.id, word])));
const selectedBookId = ref('');
const selectedLessonId = ref('');
const wordListLimit = ref(40);
const bookFormMode = ref<'create' | 'edit' | null>(null);
const bookEditId = ref('');
const bookDraft = ref<BookDraft>({ title: '', description: '' });
const lessonFormMode = ref<'create' | 'edit' | null>(null);
const lessonEditId = ref('');
const lessonDraft = ref('');
const wordFormMode = ref<'create' | 'edit' | null>(null);
const wordEditId = ref('');
const wordDraft = ref<WordDraft>({ term: '', reading: '', meaning: '', partOfSpeech: '', example: '', exampleTranslation: '' });
const pendingDelete = ref<DeleteTarget | null>(null);
const busy = ref(false);
const exporting = ref(false);
const actionError = ref('');
const actionMessage = ref('');
const contextSearch = ref('');
const contextQuery = ref('');
const selectedContextWordId = ref('');
const contextFormOpen = ref(false);
const contextEditId = ref('');
const contextDraft = ref<ContextDraftForm>({ sentence: '', translation: '', sourceTitle: '', sourceUrl: '', matchedText: '' });
const contextSection = ref<HTMLElement | null>(null);
const packageText = ref('');
const parsedPackage = ref<PersonalLibrary | null>(null);
const packagePreview = ref<PersonalLibraryPreview | null>(null);
const packagePolicy = ref<ExistingContentPolicy>('keep-local');
const packagePreviewError = ref('');
const packageInput = ref<HTMLInputElement | null>(null);
let viewGeneration = 0;
let handledInitialKey = '';
let contextSearchTimer: ReturnType<typeof setTimeout> | undefined;

const selectedBook = computed(() => manualBooks.value.find(book => book.id === selectedBookId.value));
const selectedLessons = computed(() => manualLessons.value.filter(lesson => lesson.bookId === selectedBookId.value).sort((a, b) => a.order - b.order));
const selectedLesson = computed(() => selectedLessons.value.find(lesson => lesson.id === selectedLessonId.value));
const selectedLessonWords = computed(() => contentWords.value
  .filter(word => word.lessonId === selectedLessonId.value)
  .sort((a, b) => a.order - b.order || a.term.localeCompare(b.term)));
const visibleLessonWords = computed(() => selectedLessonWords.value.slice(0, wordListLimit.value));
const contextSearchIndex = computed(() => contentWords.value.map(word => ({
  word,
  text: `${word.term} ${word.reading} ${word.meaning} ${word.bookTitle} ${word.lessonTitle}`.toLocaleLowerCase(),
})));
const personalLibrarySummary = computed(() => summarizePersonalLibrary(exportExtensionPersonalLibrary(props.snapshot, props.catalog)));
const contextCandidates = computed(() => {
  const query = contextQuery.value.trim().toLocaleLowerCase();
  if (!query) return [];
  return contextSearchIndex.value.filter(entry => entry.text.includes(query)).slice(0, 12).map(entry => entry.word);
});
const selectedContextWord = computed(() => wordsById.value.get(selectedContextWordId.value));
const selectedContexts = computed(() => {
  if (!selectedContextWordId.value) return [];
  const direct = wordReadingContexts(selectedContextWord.value);
  const builtin = (props.snapshot.learning.builtinContexts ?? [])
    .filter(entry => entry.wordId === selectedContextWordId.value)
    .flatMap(entry => entry.contexts);
  return [...new Map([...direct, ...builtin].map(context => [context.id, context])).values()]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
});
watch(manualBooks, books => {
  if (!books.some(book => book.id === selectedBookId.value)) selectedBookId.value = books[0]?.id ?? '';
}, { immediate: true });

watch([selectedBookId, selectedLessons], ([bookId, lessons]) => {
  if (!lessons.some(lesson => lesson.id === selectedLessonId.value && lesson.bookId === bookId)) {
    selectedLessonId.value = lessons[0]?.id ?? '';
  }
}, { immediate: true });

watch(selectedLessonId, () => { wordListLimit.value = 40; });
watch(contextSearch, value => {
  if (contextSearchTimer) clearTimeout(contextSearchTimer);
  contextSearchTimer = setTimeout(() => { contextQuery.value = value; }, 120);
});

watch(
  () => ({
    initialWordId: props.initialWordId,
    partitionKey: props.snapshot.identity?.partitionKey,
    word: props.initialWordId ? wordsById.value.get(props.initialWordId) : undefined,
  }),
  async ({ initialWordId, partitionKey, word }) => {
    if (!initialWordId || !word) return;
    const key = `${partitionKey ?? 'local'}:${initialWordId}`;
    if (handledInitialKey === key) return;
    handledInitialKey = key;
    selectContextWord(word);
    contextFormOpen.value = true;
    await nextTick();
    contextSection.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  { immediate: true },
);

watch(() => props.snapshot.identity?.partitionKey, () => {
  viewGeneration++;
  actionError.value = '';
  actionMessage.value = '';
  pendingDelete.value = null;
  busy.value = false;
  cancelBookForm();
  cancelLessonForm();
  cancelWordForm();
  resetContextForm();
  selectedContextWordId.value = '';
  contextSearch.value = '';
  contextQuery.value = '';
  if (contextSearchTimer) clearTimeout(contextSearchTimer);
  contextFormOpen.value = false;
  packageText.value = '';
  packagePreviewError.value = '';
  parsedPackage.value = null;
  packagePreview.value = null;
}, { flush: 'sync' });

onUnmounted(() => {
  viewGeneration++;
  if (contextSearchTimer) clearTimeout(contextSearchTimer);
});

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function mutate(action: PersonalLibraryMutation, success: string): Promise<ExtensionSnapshot | null> {
  if (busy.value) return null;
  const generation = viewGeneration;
  busy.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    const next = await extensionApi.mutatePersonalLibrary(action);
    if (generation !== viewGeneration) return null;
    emit('changed', next);
    actionMessage.value = success;
    return next;
  } catch (error) {
    if (generation === viewGeneration) actionError.value = errorText(error, '保存失败，请重试。');
    return null;
  } finally {
    if (generation === viewGeneration) busy.value = false;
  }
}

function startNewBook() {
  pendingDelete.value = null;
  bookDraft.value = { title: '', description: '' };
  bookEditId.value = '';
  bookFormMode.value = 'create';
}

function editBook(book: ExtensionBook) {
  pendingDelete.value = null;
  selectedBookId.value = book.id;
  bookDraft.value = { title: book.title, description: book.description ?? '' };
  bookEditId.value = book.id;
  bookFormMode.value = 'edit';
}

function cancelBookForm() {
  bookFormMode.value = null;
  bookEditId.value = '';
  bookDraft.value = { title: '', description: '' };
}

async function submitBook() {
  const title = bookDraft.value.title.trim();
  if (!title) { actionError.value = '请填写词书名称。'; return; }
  if (bookFormMode.value === 'edit' && bookEditId.value) {
    const result = await mutate({ type: 'update-book', bookId: bookEditId.value, title, description: bookDraft.value.description.trim() }, '词书已更新。');
    if (result) cancelBookForm();
    return;
  }
  const previousBookIds = new Set(manualBooks.value.map(book => book.id));
  const result = await mutate({ type: 'create-book', title, description: bookDraft.value.description.trim() }, '个人词书已创建。');
  if (!result) return;
  const created = personalLibraryData(result, props.catalog).books.filter(book => !builtinBookIdSet.value.has(book.id) && !previousBookIds.has(book.id))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  cancelBookForm();
  if (created) selectedBookId.value = created.id;
}

function startNewLesson() {
  if (!selectedBookId.value) { actionError.value = '请先创建并选择一本个人词书。'; return; }
  pendingDelete.value = null;
  lessonDraft.value = '';
  lessonEditId.value = '';
  lessonFormMode.value = 'create';
}

function editLesson(lesson: Lesson) {
  pendingDelete.value = null;
  selectedLessonId.value = lesson.id;
  lessonDraft.value = lesson.title;
  lessonEditId.value = lesson.id;
  lessonFormMode.value = 'edit';
}

function cancelLessonForm() {
  lessonFormMode.value = null;
  lessonEditId.value = '';
  lessonDraft.value = '';
}

async function submitLesson() {
  const title = lessonDraft.value.trim();
  if (!title) { actionError.value = '请填写课次名称。'; return; }
  if (lessonFormMode.value === 'edit' && lessonEditId.value) {
    const result = await mutate({ type: 'update-lesson', lessonId: lessonEditId.value, title }, '课次已更新。');
    if (result) cancelLessonForm();
    return;
  }
  const bookId = selectedBookId.value;
  const result = await mutate({ type: 'create-lesson', bookId, title }, '课次已创建。');
  if (!result) return;
  const created = personalLibraryData(result, props.catalog).lessons.filter(lesson => lesson.bookId === bookId).sort((a, b) => b.order - a.order)[0];
  cancelLessonForm();
  if (created) selectedLessonId.value = created.id;
}

function startNewWord() {
  if (!selectedLessonId.value) { actionError.value = '请先创建并选择一个课次。'; return; }
  pendingDelete.value = null;
  wordDraft.value = { term: '', reading: '', meaning: '', partOfSpeech: '', example: '', exampleTranslation: '' };
  wordEditId.value = '';
  wordFormMode.value = 'create';
}

function editWord(word: ExtensionWord) {
  if (word.source !== 'manual') return;
  pendingDelete.value = null;
  wordDraft.value = {
    term: word.term,
    reading: word.reading,
    meaning: word.meaning,
    partOfSpeech: word.partOfSpeech ?? '',
    example: word.example ?? '',
    exampleTranslation: word.exampleTranslation ?? '',
  };
  wordEditId.value = word.id;
  wordFormMode.value = 'edit';
}

function cancelWordForm() {
  wordFormMode.value = null;
  wordEditId.value = '';
  wordDraft.value = { term: '', reading: '', meaning: '', partOfSpeech: '', example: '', exampleTranslation: '' };
}

async function submitWord() {
  const term = wordDraft.value.term.trim();
  const reading = wordDraft.value.reading.trim();
  const meaning = wordDraft.value.meaning.trim();
  if (!term || !reading || !meaning) { actionError.value = '词形、读音和释义都需要填写。'; return; }
  const beforeIds = new Set(contentWords.value.map(word => word.id));
  const action: PersonalLibraryMutation = {
    type: 'save-word',
    ...(wordFormMode.value === 'edit' && wordEditId.value ? { wordId: wordEditId.value } : {}),
    lessonId: selectedLessonId.value,
    term,
    reading,
    meaning,
    ...(wordDraft.value.partOfSpeech.trim() ? { partOfSpeech: wordDraft.value.partOfSpeech.trim() } : {}),
    ...(wordDraft.value.example.trim() ? { example: wordDraft.value.example.trim() } : {}),
    ...(wordDraft.value.exampleTranslation.trim() ? { exampleTranslation: wordDraft.value.exampleTranslation.trim() } : {}),
  };
  const result = await mutate(action, wordFormMode.value === 'edit' ? '词条已更新。' : '词条已加入个人词书。');
  if (!result) return;
  const editedId = wordEditId.value;
  const saved = editedId
    ? extensionContentWords(result, props.catalog).find(word => word.id === editedId)
    : extensionContentWords(result, props.catalog).find(word => !beforeIds.has(word.id) && word.lessonId === selectedLessonId.value);
  cancelWordForm();
  if (saved) {
    selectContextWord(saved);
    contextFormOpen.value = true;
  }
}

function selectContextWord(word: ExtensionWord) {
  selectedContextWordId.value = word.id;
  contextSearch.value = `${word.term} ${word.reading}`.trim();
  contextEditId.value = '';
  contextDraft.value = { sentence: '', translation: '', sourceTitle: '', sourceUrl: '', matchedText: '' };
}

function chooseContextWord(word: ExtensionWord) {
  selectContextWord(word);
  contextFormOpen.value = true;
}

function resetContextForm() {
  contextEditId.value = '';
  contextDraft.value = { sentence: '', translation: '', sourceTitle: '', sourceUrl: '', matchedText: '' };
}

function editContext(context: ReadingContext) {
  contextEditId.value = context.id;
  contextDraft.value = {
    sentence: context.sentence,
    translation: context.translation ?? '',
    sourceTitle: context.sourceTitle ?? '',
    sourceUrl: context.sourceUrl ?? '',
    matchedText: context.matchedText ?? '',
  };
  contextFormOpen.value = true;
}

async function saveContext() {
  const wordId = selectedContextWordId.value;
  const sentence = contextDraft.value.sentence.trim();
  if (!wordId) { actionError.value = '请先从搜索结果中选择一个词条。'; return; }
  if (!sentence) { actionError.value = '请填写要保存的日文原句。'; return; }
  const draft: ReadingContextDraft = {
    sentence,
    ...(contextDraft.value.translation.trim() ? { translation: contextDraft.value.translation.trim() } : {}),
    ...(contextDraft.value.sourceTitle.trim() ? { sourceTitle: contextDraft.value.sourceTitle.trim() } : {}),
    ...(contextDraft.value.sourceUrl.trim() ? { sourceUrl: contextDraft.value.sourceUrl.trim() } : {}),
    ...(contextDraft.value.matchedText.trim() ? { matchedText: contextDraft.value.matchedText.trim() } : {}),
  };
  const result = await mutate({
    type: 'save-context',
    wordId,
    ...(contextEditId.value ? { contextId: contextEditId.value } : {}),
    draft,
  }, contextEditId.value ? '原句已更新。' : '原句已保存。');
  if (result) resetContextForm();
}

function askDelete(target: DeleteTarget) {
  pendingDelete.value = target;
  actionError.value = '';
  actionMessage.value = '';
}

function cancelDelete() { pendingDelete.value = null; }

async function confirmDelete() {
  const target = pendingDelete.value;
  if (!target) return;
  let action: PersonalLibraryMutation;
  if (target.type === 'book') action = { type: 'delete-book', bookId: target.id };
  else if (target.type === 'lesson') action = { type: 'delete-lesson', lessonId: target.id };
  else if (target.type === 'word') action = { type: 'delete-word', wordId: target.id };
  else action = { type: 'delete-context', wordId: target.wordId ?? selectedContextWordId.value, contextId: target.id };
  const message = target.type === 'book' ? '词书及其内容已删除。'
    : target.type === 'lesson' ? '课次及其中的词条已删除。'
      : target.type === 'word' ? '词条已删除。' : '原句已删除。';
  const result = await mutate(action, message);
  if (!result) return;
  pendingDelete.value = null;
  if (target.type === 'book' && selectedBookId.value === target.id) {
    selectedBookId.value = manualBooks.value.find(book => book.id !== target.id)?.id ?? '';
  }
  if (target.type === 'lesson' && selectedLessonId.value === target.id) {
    selectedLessonId.value = personalLibraryData(result, props.catalog).lessons.find(lesson => lesson.bookId === selectedBookId.value)?.id ?? '';
  }
  if (target.type === 'word' && selectedContextWordId.value === target.id) {
    selectedContextWordId.value = '';
    contextSearch.value = '';
    resetContextForm();
  }
  if (target.type === 'context') resetContextForm();
}

function previewPackage() {
  packagePreviewError.value = '';
  parsedPackage.value = null;
  packagePreview.value = null;
  try {
    const library = parsePersonalLibrary(packageText.value);
    if (!library) {
      packagePreviewError.value = '这不是个人词库包。普通 CSV 或词表 JSON 请返回“词书”页面，使用现有词书导入入口。';
      return;
    }
    const data = personalLibraryData(props.snapshot, props.catalog);
    const preview = previewPersonalLibraryMerge(data, library, builtinBookIds.value);
    parsedPackage.value = library;
    packagePreview.value = preview;
  } catch (error) {
    packagePreviewError.value = errorText(error, '无法读取该个人词库包。');
  }
}

async function readPackageFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  packagePreviewError.value = '';
  parsedPackage.value = null;
  packagePreview.value = null;
  if (file.size > 5_000_000) {
    packagePreviewError.value = '个人词库包超过 5 MB，请先拆分内容。';
    input.value = '';
    return;
  }
  try {
    packageText.value = await file.text();
    previewPackage();
  } catch (error) {
    packagePreviewError.value = errorText(error, '读取文件失败，请重试。');
  }
}

async function importPackage() {
  if (!parsedPackage.value || !packagePreview.value) { packagePreviewError.value = '请先读取并预览个人词库包。'; return; }
  const result = await mutate({ type: 'merge-package', library: parsedPackage.value, policy: packagePolicy.value }, '个人词库包已合并。');
  if (!result) return;
  parsedPackage.value = null;
  packagePreview.value = null;
  packageText.value = '';
  if (packageInput.value) packageInput.value.value = '';
}

async function exportPackage() {
  if (exporting.value) return;
  exporting.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    const library = exportExtensionPersonalLibrary(props.snapshot, props.catalog, new Date());
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kotobud-personal-library-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    actionMessage.value = '个人词库包已导出。';
  } catch (error) {
    actionError.value = errorText(error, '导出失败，请重试。');
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <main class="personal-library-workspace" aria-labelledby="personal-library-title">
    <header class="pl-header">
      <button class="pl-back" type="button" aria-label="返回上一页" @click="emit('back')">
        <ArrowLeft :size="17" aria-hidden="true" />返回
      </button>
      <div class="pl-title-row">
        <span class="pl-mark" aria-hidden="true"><BookOpen :size="20" /></span>
        <div class="pl-heading-copy">
          <p class="pl-eyebrow">KOTOBUD · PERSONAL LIBRARY</p>
          <h1 id="personal-library-title">个人词库</h1>
        </div>
      </div>
      <p class="pl-intro">整理自己的词书、课次和词条，也可以保存阅读时遇到的原句。</p>
    </header>

    <div v-if="actionError" class="pl-notice is-error" role="alert">{{ actionError }}</div>
    <div v-if="actionMessage" class="pl-notice is-success" role="status" aria-live="polite">{{ actionMessage }}</div>

    <section class="pl-summary" aria-label="个人词库概况">
      <div><strong>{{ personalLibrarySummary.bookCount }}</strong><span>本词书</span></div>
      <div><strong>{{ personalLibrarySummary.wordCount }}</strong><span>个词条</span></div>
      <div><strong>{{ personalLibrarySummary.contextCount }}</strong><span>条原句</span></div>
    </section>

    <section class="pl-section" aria-labelledby="pl-books-title">
      <div class="pl-section-heading">
        <div><p class="pl-eyebrow">01 · ORGANIZE</p><h2 id="pl-books-title">词书与课次</h2></div>
        <button class="pl-icon-action" type="button" :disabled="busy" aria-label="新建词书" @click="startNewBook"><Plus :size="17" aria-hidden="true" /></button>
      </div>
      <p class="pl-section-copy">先选词书，再整理其中的课次和词条。</p>

      <div v-if="bookFormMode" class="pl-form-card">
        <h3>{{ bookFormMode === 'edit' ? '编辑词书' : '新建个人词书' }}</h3>
        <form class="pl-form" @submit.prevent="submitBook">
          <label>词书名称<input v-model="bookDraft.title" maxlength="80" required autocomplete="off" /></label>
          <label>简介<textarea v-model="bookDraft.description" rows="2" maxlength="240" placeholder="可选，简单说明这本词书的主题" /></label>
          <div class="pl-form-actions"><button class="pl-primary" type="submit" :disabled="busy"><LoaderCircle v-if="busy" class="pl-spin" :size="15" /><Check v-else :size="15" />保存词书</button><button class="pl-secondary" type="button" :disabled="busy" @click="cancelBookForm">取消</button></div>
        </form>
      </div>

      <div v-if="manualBooks.length" class="pl-book-list" role="list" aria-label="个人词书">
        <article v-for="book in manualBooks" :key="book.id" class="pl-book-card" :class="{ 'is-active': selectedBookId === book.id }" role="listitem">
          <button class="pl-book-select" type="button" :aria-pressed="selectedBookId === book.id" @click="selectedBookId = book.id">
            <span class="pl-book-glyph" aria-hidden="true"><BookOpen :size="17" /></span>
            <span class="pl-book-copy"><strong>{{ book.title }}</strong><small>{{ book.description || `${manualLessons.filter(lesson => lesson.bookId === book.id).length} 个课次` }}</small></span>
          </button>
          <div class="pl-row-actions">
            <button class="pl-small-action" type="button" :disabled="busy" :aria-label="`编辑${book.title}`" @click="editBook(book)"><Pencil :size="15" aria-hidden="true" /></button>
            <button class="pl-small-action is-danger" type="button" :disabled="busy" :aria-label="`删除${book.title}`" @click="askDelete({ type: 'book', id: book.id, label: book.title })"><Trash2 :size="15" aria-hidden="true" /></button>
          </div>
          <div v-if="pendingDelete?.type === 'book' && pendingDelete.id === book.id" class="pl-confirm-delete">
            <p>删除这本词书会同时删除其中的课次和词条。</p>
            <button type="button" class="pl-danger-confirm" :disabled="busy" @click="confirmDelete">确认删除</button><button type="button" class="pl-secondary" :disabled="busy" @click="cancelDelete">取消</button>
          </div>
        </article>
      </div>
      <div v-else-if="!bookFormMode" class="pl-empty"><strong>还没有个人词书</strong><p>先创建一本词书，再添加课次和词条。</p><button class="pl-primary" type="button" @click="startNewBook"><Plus :size="15" />新建词书</button></div>

      <template v-if="selectedBook">
        <div class="pl-subsection-heading"><div><p class="pl-eyebrow">BOOK CONTENTS</p><h3>{{ selectedBook.title }}</h3></div><button class="pl-secondary pl-add-button" type="button" :disabled="busy" @click="startNewLesson"><Plus :size="15" />新建课次</button></div>
        <div v-if="lessonFormMode" class="pl-form-card pl-compact-form">
          <h4>{{ lessonFormMode === 'edit' ? '编辑课次' : '新建课次' }}</h4>
          <form class="pl-form" @submit.prevent="submitLesson">
            <label>课次名称<input v-model="lessonDraft" maxlength="80" required autocomplete="off" /></label>
            <div class="pl-form-actions"><button class="pl-primary" type="submit" :disabled="busy"><LoaderCircle v-if="busy" class="pl-spin" :size="15" /><Check v-else :size="15" />保存课次</button><button class="pl-secondary" type="button" :disabled="busy" @click="cancelLessonForm">取消</button></div>
          </form>
        </div>
        <div v-if="selectedLessons.length" class="pl-lesson-list">
          <article v-for="lesson in selectedLessons" :key="lesson.id" class="pl-lesson-card" :class="{ 'is-active': selectedLessonId === lesson.id }">
            <button class="pl-lesson-select" type="button" :aria-pressed="selectedLessonId === lesson.id" @click="selectedLessonId = lesson.id"><span class="pl-lesson-index">{{ lesson.order + 1 }}</span><span>{{ lesson.title }}</span></button>
            <div class="pl-row-actions"><button class="pl-small-action" type="button" :disabled="busy" :aria-label="`编辑${lesson.title}`" @click="editLesson(lesson)"><Pencil :size="15" aria-hidden="true" /></button><button class="pl-small-action is-danger" type="button" :disabled="busy" :aria-label="`删除${lesson.title}`" @click="askDelete({ type: 'lesson', id: lesson.id, label: lesson.title })"><Trash2 :size="15" aria-hidden="true" /></button></div>
            <div v-if="pendingDelete?.type === 'lesson' && pendingDelete.id === lesson.id" class="pl-confirm-delete"><p>删除课次会同时删除其中的词条。</p><button type="button" class="pl-danger-confirm" :disabled="busy" @click="confirmDelete">确认删除</button><button type="button" class="pl-secondary" :disabled="busy" @click="cancelDelete">取消</button></div>
          </article>
        </div>
        <p v-else class="pl-inline-empty">这本词书还没有课次。</p>
      </template>
    </section>

    <section v-if="selectedBook" class="pl-section" aria-labelledby="pl-words-title">
      <div class="pl-section-heading"><div><p class="pl-eyebrow">02 · VOCABULARY</p><h2 id="pl-words-title">{{ selectedLesson ? selectedLesson.title : '课次词条' }}</h2></div><button v-if="selectedLesson" class="pl-icon-action" type="button" :disabled="busy" aria-label="新建词条" @click="startNewWord"><Plus :size="17" aria-hidden="true" /></button></div>
      <p class="pl-section-copy">词形、读音和释义会保存在当前个人词书中。</p>
      <div v-if="wordFormMode" class="pl-form-card">
        <h3>{{ wordFormMode === 'edit' ? '编辑词条' : '添加词条' }}</h3>
        <form class="pl-form" @submit.prevent="submitWord">
          <div class="pl-two-fields"><label>词形<input v-model="wordDraft.term" maxlength="120" required autocomplete="off" /></label><label>读音<input v-model="wordDraft.reading" maxlength="160" required autocomplete="off" /></label></div>
          <label>释义<textarea v-model="wordDraft.meaning" rows="2" maxlength="600" required /></label>
          <label>词性<input v-model="wordDraft.partOfSpeech" maxlength="80" autocomplete="off" placeholder="可选，如：名词" /></label>
          <label>例句<textarea v-model="wordDraft.example" rows="2" maxlength="600" placeholder="可选" /></label>
          <label>例句翻译<textarea v-model="wordDraft.exampleTranslation" rows="2" maxlength="600" placeholder="可选" /></label>
          <div class="pl-form-actions"><button class="pl-primary" type="submit" :disabled="busy"><LoaderCircle v-if="busy" class="pl-spin" :size="15" /><Check v-else :size="15" />保存词条</button><button class="pl-secondary" type="button" :disabled="busy" @click="cancelWordForm">取消</button></div>
        </form>
      </div>
      <div v-if="selectedLessonWords.length" class="pl-word-list" aria-label="课次词条">
        <article v-for="word in visibleLessonWords" :key="word.id" class="pl-word-card">
          <div class="pl-word-copy"><strong lang="ja">{{ word.term }}</strong><span lang="ja">{{ word.reading }}</span><MeaningPreview class="pl-word-meaning-preview" :word="word" /><small v-if="word.partOfSpeech">{{ word.partOfSpeech }}</small></div>
          <div class="pl-row-actions"><button v-if="word.source === 'manual'" class="pl-small-action" type="button" :disabled="busy" :aria-label="`编辑${word.term}`" @click="editWord(word)"><Pencil :size="15" aria-hidden="true" /></button><button v-if="word.source === 'manual'" class="pl-small-action is-danger" type="button" :disabled="busy" :aria-label="`删除${word.term}`" @click="askDelete({ type: 'word', id: word.id, label: word.term })"><Trash2 :size="15" aria-hidden="true" /></button><button class="pl-context-link" type="button" @click="chooseContextWord(word)">原句</button></div>
          <div v-if="pendingDelete?.type === 'word' && pendingDelete.id === word.id" class="pl-confirm-delete"><p>确认从个人词书中删除「{{ word.term }}」？</p><button type="button" class="pl-danger-confirm" :disabled="busy" @click="confirmDelete">确认删除</button><button type="button" class="pl-secondary" :disabled="busy" @click="cancelDelete">取消</button></div>
        </article>
        <button v-if="visibleLessonWords.length < selectedLessonWords.length" class="pl-secondary pl-load-more" type="button" @click="wordListLimit = Math.min(wordListLimit + 40, selectedLessonWords.length)">再显示 {{ Math.min(40, selectedLessonWords.length - visibleLessonWords.length) }} 个词条</button>
      </div>
      <div v-else-if="selectedLesson && !wordFormMode" class="pl-empty pl-empty-small"><strong>这个课次还没有词条</strong><p>可以手动添加词条，或用个人词库包导入。</p><button class="pl-primary" type="button" @click="startNewWord"><Plus :size="15" />添加词条</button></div>
      <div v-else-if="!selectedLesson" class="pl-inline-empty">先选择或新建一个课次，再管理词条。</div>
    </section>

    <section ref="contextSection" class="pl-section" aria-labelledby="pl-context-title">
      <div class="pl-section-heading"><div><p class="pl-eyebrow">03 · READING NOTES</p><h2 id="pl-context-title">阅读原句</h2></div><span class="pl-count-pill">{{ selectedContexts.length }} 条</span></div>
      <p class="pl-section-copy">可为内置词条或个人词条保存句子、译文和来源。</p>
      <label class="pl-search-label">查找词条
        <span class="pl-search-control"><Search :size="16" aria-hidden="true" /><input v-model="contextSearch" type="search" autocomplete="off" placeholder="输入词形、读音或释义" /></span>
      </label>
      <div v-if="contextSearch.trim() && contextCandidates.length" class="pl-candidate-list" aria-label="匹配词条">
        <button v-for="word in contextCandidates" :key="word.id" class="pl-candidate" type="button" :aria-pressed="selectedContextWordId === word.id" @click="chooseContextWord(word)">
          <strong lang="ja">{{ word.term }}</strong><span lang="ja">{{ word.reading }}</span><small>{{ word.meaning }}</small>
        </button>
        <p v-if="contextCandidates.length === 12" class="pl-search-hint">仅显示前 12 个结果，请继续输入缩小范围。</p>
      </div>
      <p v-else-if="contextSearch.trim() && contextSearch.trim() !== contextQuery.trim()" class="pl-search-hint" role="status">正在查找匹配词条…</p>
      <p v-else-if="contextSearch.trim()" class="pl-inline-empty">没有匹配的词条，请试试词形或读音。</p>
      <p v-else class="pl-search-hint">输入关键词后，从最多 12 个匹配结果中选择词条。</p>

      <article v-if="selectedContextWord" class="pl-selected-word">
          <div><small>当前词条 · {{ selectedContextWord.bookTitle }} / {{ selectedContextWord.lessonTitle }}</small><strong lang="ja">{{ selectedContextWord.term }}<span lang="ja">{{ selectedContextWord.reading }}</span></strong><MeaningPreview class="pl-selected-word-meaning" :word="selectedContextWord" /></div>
        <button class="pl-secondary" type="button" @click="contextFormOpen = !contextFormOpen">{{ contextFormOpen ? '收起表单' : '记录原句' }}</button>
      </article>

      <div v-if="selectedContextWord && contextFormOpen" class="pl-form-card pl-context-form-card">
        <h3>{{ contextEditId ? '编辑原句' : '记录一条例句' }}</h3>
        <form class="pl-form" @submit.prevent="saveContext">
          <label>日文原句<textarea v-model="contextDraft.sentence" rows="3" maxlength="1200" required placeholder="粘贴或输入包含这个词的完整句子" /></label>
          <label>中文翻译<textarea v-model="contextDraft.translation" rows="2" maxlength="1200" placeholder="可选" /></label>
          <div class="pl-two-fields"><label>来源名称<input v-model="contextDraft.sourceTitle" maxlength="160" placeholder="可选" /></label><label>命中词形<input v-model="contextDraft.matchedText" maxlength="120" :placeholder="selectedContextWord.term" /></label></div>
          <label>来源链接<input v-model="contextDraft.sourceUrl" type="url" maxlength="1000" placeholder="可选，以 https:// 开头" /></label>
          <div class="pl-form-actions"><button class="pl-primary" type="submit" :disabled="busy"><LoaderCircle v-if="busy" class="pl-spin" :size="15" /><Check v-else :size="15" />{{ contextEditId ? '保存修改' : '保存原句' }}</button><button v-if="contextEditId" class="pl-secondary" type="button" :disabled="busy" @click="resetContextForm">取消编辑</button></div>
        </form>
      </div>

      <div v-if="selectedContextWord && selectedContexts.length" class="pl-context-list">
        <article v-for="context in selectedContexts" :key="context.id" class="pl-context-card">
          <p class="pl-context-sentence" lang="ja">{{ context.sentence }}</p>
          <p v-if="context.translation" class="pl-context-translation">{{ context.translation }}</p>
          <small v-if="context.sourceTitle || context.sourceUrl" class="pl-context-source"><span>{{ context.sourceTitle || '来源链接' }}</span><a v-if="context.sourceUrl" :href="context.sourceUrl" target="_blank" rel="noreferrer">打开来源</a></small>
          <div class="pl-context-practice-line"><button v-if="contextClozeExample(selectedContextWord, context)" class="pl-context-practice" type="button" :disabled="busy" @click="emit('practice-context', { wordId: selectedContextWord.id, contextId: context.id })">用这句填空</button><span v-else class="pl-context-practice-note">复习时可展示</span><div class="pl-row-actions"><button class="pl-small-action" type="button" :disabled="busy" aria-label="编辑原句" @click="editContext(context)"><Pencil :size="15" aria-hidden="true" /></button><button class="pl-small-action is-danger" type="button" :disabled="busy" aria-label="删除原句" @click="askDelete({ type: 'context', id: context.id, label: context.sentence, wordId: selectedContextWord.id })"><Trash2 :size="15" aria-hidden="true" /></button></div></div>
          <div v-if="pendingDelete?.type === 'context' && pendingDelete.id === context.id" class="pl-confirm-delete"><p>确认删除这条原句？</p><button type="button" class="pl-danger-confirm" :disabled="busy" @click="confirmDelete">确认删除</button><button type="button" class="pl-secondary" :disabled="busy" @click="cancelDelete">取消</button></div>
        </article>
      </div>
      <p v-else-if="selectedContextWord" class="pl-inline-empty">这个词条还没有保存的原句。</p>
    </section>

    <section class="pl-section" aria-labelledby="pl-package-title">
      <div class="pl-section-heading"><div><p class="pl-eyebrow">04 · PORTABLE COPY</p><h2 id="pl-package-title">个人词库包</h2></div><FileUp :size="19" class="pl-section-icon" aria-hidden="true" /></div>
      <p class="pl-section-copy">导出个人词书、词条和阅读原句，或从另一台设备的备份继续整理。</p>
      <div class="pl-package-actions"><button class="pl-secondary" type="button" :disabled="exporting" @click="exportPackage"><LoaderCircle v-if="exporting" class="pl-spin" :size="16" /><Download v-else :size="16" />导出个人词库包</button><label class="pl-secondary pl-file-button"><FileUp :size="16" aria-hidden="true" />选择 JSON 文件<input ref="packageInput" type="file" accept=".json,application/json" @change="readPackageFile" /></label></div>
      <label class="pl-package-label">也可以粘贴个人词库包 JSON
        <textarea v-model="packageText" rows="5" spellcheck="false" placeholder="粘贴 KotoBud 个人词库包内容" @input="parsedPackage = null; packagePreview = null; packagePreviewError = ''" />
      </label>
      <button class="pl-secondary pl-preview-button" type="button" :disabled="!packageText.trim()" @click="previewPackage">预览导入内容</button>
      <div v-if="packagePreviewError" class="pl-inline-error" role="alert">{{ packagePreviewError }}</div>
      <div v-if="packagePreview && parsedPackage" class="pl-preview-card" aria-live="polite">
        <h3>导入预览</h3>
        <p>共 {{ parsedPackage.books.length }} 本词书、{{ parsedPackage.lessons.length }} 个课次、{{ parsedPackage.words.length }} 个词条、{{ summarizePersonalLibrary(parsedPackage).contextCount }} 条原句。</p>
        <dl><div><dt>新增词书 / 课次</dt><dd>{{ packagePreview.newBooks }} / {{ packagePreview.newLessons }}</dd></div><div><dt>新增词条</dt><dd>{{ packagePreview.newWords }}</dd></div><div><dt>已存在词条</dt><dd>{{ packagePreview.existingWords }}</dd></div><div><dt>新增 / 已存在原句</dt><dd>{{ packagePreview.newContexts }} / {{ packagePreview.existingContexts }}</dd></div></dl>
        <fieldset class="pl-policy"><legend>重复内容的处理方式</legend><label><input v-model="packagePolicy" type="radio" value="keep-local" />保留本机内容，补入新内容</label><label><input v-model="packagePolicy" type="radio" value="use-package" />使用文件中的同 ID 内容</label></fieldset>
        <p class="pl-policy-note">第二种方式会用文件内容覆盖相同 ID 的词书、课次和词条信息。</p>
        <button class="pl-primary" type="button" :disabled="busy" @click="importPackage"><LoaderCircle v-if="busy" class="pl-spin" :size="15" /><Check v-else :size="15" />合并到个人词库</button>
      </div>
      <p class="pl-handoff-note">普通 CSV 或词表 JSON 请返回词书页面，使用现有词书导入入口。</p>
    </section>

    <PersonalLibraryBackup :snapshot="snapshot" :catalog="catalog" @changed="emit('changed', $event)" />
  </main>
</template>

<style scoped>
.personal-library-workspace{display:flex;flex-direction:column;gap:14px;min-width:0;width:100%;max-width:390px;margin:0 auto;padding-bottom:20px;color:var(--ink)}
.pl-header{padding:2px 0 4px}.pl-back{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:7px 9px 7px 0;border:0;background:transparent;color:var(--green);font-size:12px;cursor:pointer}.pl-title-row{display:flex;align-items:center;gap:11px;margin-top:7px}.pl-mark{display:grid;place-items:center;flex:none;width:42px;height:42px;border:1px solid var(--line-strong);border-radius:12px;background:var(--green-soft);color:var(--green)}.pl-heading-copy{min-width:0}.pl-eyebrow{margin:0 0 4px;color:var(--muted);font-size:9px;font-weight:650;letter-spacing:.09em}.pl-heading-copy h1{margin:0;font-size:24px;line-height:1.3;font-weight:650;letter-spacing:-.02em}.pl-intro{margin:9px 0 0;color:var(--muted);font-size:12px;line-height:1.7}
.pl-notice{padding:11px 12px;border:1px solid var(--line-strong);border-radius:9px;font-size:12px;line-height:1.55}.pl-notice.is-error,.pl-inline-error{border-color:var(--line-strong);background:var(--paper);color:var(--red)}.pl-notice.is-success{border-color:var(--line-strong);background:var(--green-pale);color:var(--green)}.pl-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.pl-summary>div{display:flex;flex-direction:column;gap:3px;min-width:0;padding:11px 9px;border:1px solid var(--line);border-radius:10px;background:var(--paper)}.pl-summary strong{font-size:20px;line-height:1.2;font-variant-numeric:tabular-nums}.pl-summary span{color:var(--muted);font-size:10px}
.pl-section{min-width:0;padding:15px 12px;border:1px solid var(--line);border-radius:13px;background:var(--paper);box-shadow:var(--shadow-soft,none)}.pl-section-heading{display:flex;align-items:center;justify-content:space-between;gap:9px;min-width:0}.pl-section-heading>div{min-width:0}.pl-section-heading h2{margin:0;font-size:17px;line-height:1.4;overflow-wrap:anywhere}.pl-section-heading h3{margin:0;font-size:14px}.pl-section-icon{flex:none;color:var(--green)}.pl-section-copy{margin:7px 0 12px;color:var(--muted);font-size:11px;line-height:1.65}.pl-icon-action{display:grid;place-items:center;flex:none;width:44px;height:44px;border:1px solid var(--line-strong);border-radius:9px;background:var(--green-pale);color:var(--green);cursor:pointer}.pl-icon-action:disabled,.pl-small-action:disabled{opacity:.55;cursor:not-allowed}.pl-book-list,.pl-lesson-list,.pl-word-list,.pl-context-list{display:flex;flex-direction:column;gap:7px;min-width:0}.pl-book-card,.pl-lesson-card,.pl-word-card,.pl-context-card{position:relative;display:flex;align-items:flex-start;gap:7px;flex-wrap:wrap;min-width:0;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--paper)}.pl-book-card.is-active,.pl-lesson-card.is-active{border-color:var(--green);background:var(--green-pale)}.pl-book-select,.pl-lesson-select{display:flex;align-items:center;gap:9px;flex:1;min-width:0;min-height:42px;padding:2px;border:0;background:transparent;color:var(--ink);text-align:left;cursor:pointer}.pl-book-glyph{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:8px;background:var(--green-soft);color:var(--green)}.pl-book-copy{display:flex;flex-direction:column;gap:4px;min-width:0}.pl-book-copy strong{font-size:12px;line-height:1.45;overflow-wrap:anywhere}.pl-book-copy small{color:var(--muted);font-size:10px;line-height:1.45;overflow-wrap:anywhere}.pl-row-actions{display:flex;align-items:center;gap:3px;flex:none;margin-left:auto}.pl-small-action{display:grid;place-items:center;flex:none;width:40px;height:40px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--green);cursor:pointer}.pl-small-action:hover{border-color:var(--line-strong);background:var(--green-pale)}.pl-small-action.is-danger{color:var(--red)}.pl-context-link{min-width:44px;min-height:40px;padding:6px 8px;border:1px solid var(--line-strong);border-radius:8px;background:var(--green-pale);color:var(--green);font-size:11px;cursor:pointer}.pl-lesson-select{gap:8px;font-size:12px;line-height:1.5}.pl-lesson-index{display:grid;place-items:center;flex:none;width:27px;height:27px;border-radius:8px;background:var(--green-soft);color:var(--green);font-size:10px;font-weight:650}.pl-word-card{align-items:flex-start}.pl-word-copy{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;padding:3px 0}.pl-word-copy>strong{font-size:16px;line-height:1.45;overflow-wrap:anywhere}.pl-word-copy>span{color:var(--muted);font-size:11px}.pl-word-copy p{margin:1px 0;color:var(--ink-soft);font-size:12px;line-height:1.6;overflow-wrap:anywhere}.pl-word-copy small{color:var(--muted);font-size:10px}
.pl-subsection-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:16px 0 9px;padding-top:13px;border-top:1px solid var(--line)}.pl-subsection-heading>div{min-width:0}.pl-subsection-heading h3{margin:0;font-size:14px;line-height:1.45;overflow-wrap:anywhere}.pl-secondary,.pl-primary,.pl-danger-confirm{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--paper);color:var(--green);font-size:11px;line-height:1.35;text-align:center;cursor:pointer}.pl-primary{border-color:var(--green);background:var(--green);color:var(--paper);font-weight:600}.pl-danger-confirm{border-color:var(--line-strong);background:var(--paper);color:var(--red)}.pl-secondary:disabled,.pl-primary:disabled,.pl-danger-confirm:disabled{opacity:.6;cursor:not-allowed}.pl-add-button{flex:none;white-space:nowrap}.pl-form-card{min-width:0;padding:12px;border:1px solid var(--line-strong);border-radius:10px;background:var(--green-pale)}.pl-form-card h3,.pl-form-card h4{margin:0 0 10px;font-size:13px}.pl-form-card h4{font-size:12px}.pl-compact-form{margin-bottom:9px}.pl-form{display:flex;flex-direction:column;gap:10px;min-width:0}.pl-form label,.pl-search-label,.pl-package-label{display:flex;flex-direction:column;gap:5px;min-width:0;color:var(--ink-soft);font-size:11px;font-weight:600}.pl-form input,.pl-form textarea,.pl-search-control,.pl-package-label textarea{width:100%;min-width:0;min-height:42px;padding:9px 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--paper);color:var(--ink);font-size:12px;font-weight:400;line-height:1.55}.pl-form textarea,.pl-package-label textarea{resize:vertical}.pl-form input::placeholder,.pl-form textarea::placeholder,.pl-package-label textarea::placeholder{color:var(--muted);opacity:1}.pl-two-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.pl-form-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:2px}.pl-form-actions>*{flex:1;min-width:104px}.pl-confirm-delete{display:flex;align-items:center;flex-wrap:wrap;gap:6px;width:100%;padding:9px 0 0;border-top:1px solid var(--line);font-size:11px}.pl-confirm-delete p{flex-basis:100%;margin:0 0 2px;color:var(--ink-soft);line-height:1.5}.pl-empty{display:flex;flex-direction:column;align-items:flex-start;gap:7px;padding:17px 12px;border:1px dashed var(--line-strong);border-radius:10px;background:var(--green-pale)}.pl-empty strong{font-size:12px}.pl-empty p,.pl-inline-empty{margin:0;color:var(--muted);font-size:11px;line-height:1.6}.pl-empty .pl-primary{margin-top:3px}.pl-empty-small{margin-top:3px}.pl-inline-empty{padding:11px 2px}.pl-spin{animation:pl-spin .9s linear infinite}@keyframes pl-spin{to{transform:rotate(360deg)}}.pl-primary:hover{background:var(--green-deep);border-color:var(--green-deep)}.pl-secondary:hover,.pl-icon-action:hover{background:var(--green-pale)}.pl-primary:active,.pl-secondary:active,.pl-icon-action:active,.pl-small-action:active{filter:brightness(.96)}
.pl-count-pill{flex:none;padding:5px 8px;border:1px solid var(--line);border-radius:999px;background:var(--green-pale);color:var(--green);font-size:10px}.pl-search-label{margin-top:4px}.pl-search-control{display:flex;align-items:center;gap:8px;padding:0 10px;color:var(--muted)}.pl-search-control input{flex:1;min-width:0;height:40px;border:0;outline:0;background:transparent;color:var(--ink);font-size:12px}.pl-search-control:focus-within{outline:3px solid var(--gold);outline-offset:2px}.pl-search-hint{margin:8px 0 0;color:var(--muted);font-size:10px;line-height:1.5}.pl-candidate-list{display:flex;flex-direction:column;gap:5px;max-height:270px;overflow:auto;margin-top:7px;padding-right:2px}.pl-candidate{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:2px 8px;min-width:0;min-height:48px;padding:8px 9px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);text-align:left;cursor:pointer}.pl-candidate[aria-pressed="true"]{border-color:var(--green);background:var(--green-pale)}.pl-candidate strong{overflow-wrap:anywhere;font-size:12px}.pl-candidate>span{min-width:0;overflow:hidden;color:var(--muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.pl-candidate small{grid-column:1/-1;overflow:hidden;color:var(--muted);font-size:10px;line-height:1.45;text-overflow:ellipsis;white-space:nowrap}.pl-selected-word{display:flex;align-items:center;justify-content:space-between;gap:9px;min-width:0;margin-top:11px;padding:10px;border-left:3px solid var(--green);border-radius:0 9px 9px 0;background:var(--green-pale)}.pl-selected-word>div{min-width:0}.pl-selected-word small{display:block;color:var(--muted);font-size:9px;line-height:1.5;overflow-wrap:anywhere}.pl-selected-word strong{display:block;margin-top:3px;font-size:15px;line-height:1.5;overflow-wrap:anywhere}.pl-selected-word strong span{margin-left:6px;color:var(--muted);font-size:10px;font-weight:400}.pl-selected-word p{margin:2px 0 0;color:var(--ink-soft);font-size:11px;line-height:1.5;overflow-wrap:anywhere}.pl-selected-word>.pl-secondary{flex:none;max-width:95px}.pl-context-form-card{margin-top:9px}.pl-context-list{margin-top:10px}.pl-context-card{display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:10px}.pl-context-sentence{margin:0;color:var(--ink);font-size:15px;line-height:1.8;overflow-wrap:anywhere;white-space:pre-wrap}.pl-context-translation{margin:0;color:var(--muted);font-size:11px;line-height:1.65;overflow-wrap:anywhere;white-space:pre-wrap}.pl-context-source{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--muted);font-size:10px;line-height:1.5}.pl-context-source span{min-width:0;overflow-wrap:anywhere}.pl-context-source a{flex:none;color:var(--green)}.pl-context-card>.pl-row-actions{align-self:flex-end}
.pl-package-actions{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.pl-package-actions>*{flex:1;min-width:120px}.pl-file-button{position:relative;overflow:hidden}.pl-file-button input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.pl-file-button:focus-within{outline:3px solid var(--gold);outline-offset:2px}.pl-package-label textarea{margin-top:1px;min-height:108px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;overflow-wrap:anywhere}.pl-preview-button{margin-top:9px}.pl-preview-card{margin-top:10px;padding:11px;border:1px solid var(--line-strong);border-radius:10px;background:var(--green-pale)}.pl-preview-card h3{margin:0;font-size:13px}.pl-preview-card>p{margin:7px 0;color:var(--muted);font-size:11px;line-height:1.6}.pl-preview-card dl{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:9px 0}.pl-preview-card dl>div{padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--paper)}.pl-preview-card dt{color:var(--muted);font-size:9px;line-height:1.45}.pl-preview-card dd{margin:4px 0 0;color:var(--green);font-size:13px;font-weight:650;font-variant-numeric:tabular-nums}.pl-policy{display:flex;flex-direction:column;gap:7px;min-width:0;padding:8px 9px;margin:9px 0;border:1px solid var(--line);border-radius:8px}.pl-policy legend{padding:0 4px;color:var(--ink-soft);font-size:10px;font-weight:600}.pl-policy label{display:flex;align-items:flex-start;min-height:44px;padding:7px 3px;gap:7px;color:var(--ink);font-size:10px;line-height:1.5}.pl-policy input{flex:none;margin:2px 0 0;accent-color:var(--green)}.pl-policy-note,.pl-handoff-note{margin:8px 0;color:var(--muted);font-size:10px;line-height:1.55}.pl-inline-error{padding:9px 10px;margin-top:8px;border:1px solid var(--line-strong);border-radius:8px;font-size:11px;line-height:1.5}.pl-handoff-note{padding-top:10px;border-top:1px solid var(--line)}
.personal-library-workspace :focus-visible{outline:3px solid var(--gold);outline-offset:2px}.pl-book-select:focus-visible,.pl-lesson-select:focus-visible{border-radius:7px}@media(max-width:340px){.personal-library-workspace{gap:11px}.pl-section{padding:12px 9px}.pl-two-fields{grid-template-columns:1fr}.pl-selected-word{align-items:flex-start;flex-direction:column}.pl-selected-word>.pl-secondary{max-width:none;width:100%}.pl-package-actions>*{min-width:100%}.pl-section-heading h2{font-size:16px}}@media(prefers-reduced-motion:reduce){.pl-spin{animation:none}.pl-back,.pl-small-action,.pl-primary,.pl-secondary{scroll-behavior:auto}}
.pl-word-copy :deep(.pl-word-meaning-preview){margin:1px 0;color:var(--ink-soft);font-size:12px;line-height:1.6;overflow-wrap:anywhere}.pl-selected-word :deep(.pl-selected-word-meaning){margin:2px 0 0;color:var(--ink-soft);font-size:11px;line-height:1.5;overflow-wrap:anywhere}
.pl-context-practice-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px}.pl-context-practice{display:inline-flex;min-height:40px;align-items:center;justify-content:center;padding:6px 10px;border:1px solid var(--green);border-radius:8px;background:var(--green-pale);color:var(--green);font:inherit;font-size:11px;font-weight:600;cursor:pointer}.pl-context-practice:disabled{opacity:.55;cursor:wait}.pl-context-practice-note{color:var(--muted);font-size:10px}.pl-context-practice-line .pl-row-actions{align-self:auto}
</style>
