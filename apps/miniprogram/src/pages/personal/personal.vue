<script lang="ts">
import { createFriendShare, createTimelineShare } from "../../services/share";
export default {
  onShareAppMessage: createFriendShare,
  onShareTimeline: createTimelineShare,
};
</script>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import type { Book, Data, Word } from "@jp/models";
import MiniPage from "../../components/MiniPage.vue";
import MiniHeader from "../../components/MiniHeader.vue";
import MiniNotice from "../../components/MiniNotice.vue";
import MiniMeaningText from "../../components/MiniMeaningText.vue";
import { useMiniPageActivity } from "../../services/page-motion";
import {
  MINI_BUILTIN_BOOK_IDS,
  addMiniPersonalWords,
  createMiniPersonalBook,
  createMiniPersonalLesson,
  deleteMiniPersonalBook,
  deleteMiniPersonalWord,
  exportMiniPersonalLibrary,
  listMiniPersonalLibrary,
  mergeMiniPersonalLibrary,
  parseMiniPersonalLibrary,
  previewMiniPersonalLibrary,
  previewMiniWordImport,
  updateMiniPersonalBook,
  updateMiniPersonalWord,
} from "../../services/personal-library";
import type {
  MiniPersonalWordDraft,
  MiniPersonalWordImportPreview,
  PersonalLibrary,
  PersonalLibraryPreview,
} from "../../services/personal-library";
import {
  isMiniPersonalLibraryFileCancel,
  miniPersonalLibraryFiles,
} from "../../services/personal-library-files";
import type { SavedPersonalLibraryExportFile } from "../../services/personal-library-files";

useMiniPageActivity();

type Section = "books" | "create" | "backup";
const data = ref<Data | null>(null);
const loading = ref(false);
const busy = ref("");
const error = ref("");
const notice = ref("");
const queryBookId = ref("");
const selectedBookId = ref("");
const section = ref<Section>("books");
const newBookTitle = ref("");
const newBookDescription = ref("");
const bookTitle = ref("");
const bookDescription = ref("");
const selectedLessonId = ref("");
const newLessonTitle = ref("");
const term = ref("");
const reading = ref("");
const meaning = ref("");
const editingWordId = ref("");
const batchText = ref("");
const batchTargetLessonId = ref("");
const batchPreview = ref<MiniPersonalWordImportPreview | null>(null);
const packageText = ref("");
const packagePreview = ref<PersonalLibraryPreview | null>(null);
const pendingPackage = ref<PersonalLibrary | null>(null);
const exportText = ref("");
const savedExportFile = ref<SavedPersonalLibraryExportFile | null>(null);
const nativeFileInfo = ref("");
const builtinIds = new Set(MINI_BUILTIN_BOOK_IDS);
let refreshToken = 0;

const personalBooks = computed(() => (data.value?.books ?? []).filter((book) => !builtinIds.has(book.id)));
const activeBookId = computed(() => queryBookId.value || selectedBookId.value);
const activeBook = computed(() => personalBooks.value.find((book) => book.id === activeBookId.value));
const activeLessons = computed(() => (data.value?.lessons ?? [])
  .filter((lesson) => lesson.bookId === activeBookId.value)
  .slice()
  .sort((a, b) => a.order - b.order));
const activeLessonIds = computed(() => new Set(activeLessons.value.map((lesson) => lesson.id)));
const batchLessonOptions = computed(() => [{ id: "", title: "保留表格里的课次" }, ...activeLessons.value]);
const activeWords = computed(() => (data.value?.words ?? [])
  .filter((word) => activeLessonIds.value.has(word.lessonId))
  .slice()
  .sort((a, b) => a.order - b.order));
const activeLessonTitle = computed(() => activeLessons.value.find((lesson) => lesson.id === selectedLessonId.value)?.title ?? "");
const activeWordLearningCount = (wordId: string) => (data.value?.states.filter((state) => state.wordId === wordId).length ?? 0)
  + (data.value?.logs.filter((log) => log.wordId === wordId).length ?? 0);
const activeBookLearningCount = computed(() => {
  const ids = new Set(activeWords.value.map((word) => word.id));
  return (data.value?.states.filter((state) => ids.has(state.wordId)).length ?? 0)
    + (data.value?.logs.filter((log) => ids.has(log.wordId)).length ?? 0);
});
const batchCanImport = computed(() => !!batchPreview.value?.rows.length && !batchPreview.value.errors.length && !busy.value);
const canMergePackage = computed(() => !!pendingPackage.value && !!packagePreview.value && !busy.value);
const visibleBookId = computed(() => activeBook.value?.id ?? "");

function pickerIndex(event: unknown): number {
  return Number((event as { detail?: { value?: unknown } })?.detail?.value);
}

function chooseWordLesson(event: unknown) {
  const lesson = activeLessons.value[pickerIndex(event)];
  if (lesson) selectedLessonId.value = lesson.id;
}

function chooseBatchLesson(event: unknown) {
  const lesson = batchLessonOptions.value[pickerIndex(event)];
  if (lesson) batchTargetLessonId.value = lesson.id;
}

watch(visibleBookId, (bookId) => {
  const firstLesson = activeLessons.value[0]?.id ?? "";
  if (!activeLessons.value.some((lesson) => lesson.id === selectedLessonId.value)) selectedLessonId.value = firstLesson;
  bookTitle.value = activeBook.value?.title ?? "";
  bookDescription.value = activeBook.value?.description ?? "";
  if (bookId) {
    batchPreview.value = null;
    batchTargetLessonId.value = "";
    editingWordId.value = "";
  }
});

onLoad((query) => {
  const bookId = typeof query?.bookId === "string" ? query.bookId : "";
  queryBookId.value = bookId;
  if (bookId) {
    selectedBookId.value = bookId;
    section.value = "books";
  }
});

async function refresh() {
  const token = ++refreshToken;
  loading.value = true;
  error.value = "";
  try {
    const snapshot = await listMiniPersonalLibrary();
    if (token !== refreshToken) return;
    data.value = snapshot;
    if (!queryBookId.value && !personalBooks.value.some((book) => book.id === selectedBookId.value)) {
      selectedBookId.value = personalBooks.value[0]?.id ?? "";
    }
    if (queryBookId.value && !personalBooks.value.some((book) => book.id === queryBookId.value)) {
      error.value = "这本自建词书暂时无法打开；内置词书不能在此修改。";
    }
  } catch (cause) {
    if (token === refreshToken) error.value = cause instanceof Error ? cause.message : "个人词库暂时无法读取，请重试。";
  } finally {
    if (token === refreshToken) loading.value = false;
  }
}

onShow(() => { void refresh(); });

function selectSection(next: Section) {
  if (queryBookId.value && next !== "books") return;
  section.value = next;
  notice.value = "";
  error.value = "";
}

function selectBook(book: Book) {
  if (busy.value) return;
  selectedBookId.value = book.id;
  section.value = "books";
  error.value = "";
  notice.value = "";
}

async function createBook() {
  if (busy.value) return;
  busy.value = "create-book";
  error.value = "";
  notice.value = "";
  try {
    const created = await createMiniPersonalBook(newBookTitle.value, newBookDescription.value);
    newBookTitle.value = "";
    newBookDescription.value = "";
    selectedBookId.value = created.bookId;
    section.value = "books";
    await refresh();
    notice.value = "词书已创建，可以开始添加词条。";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "创建词书失败，请重试。";
  } finally { busy.value = ""; }
}

async function saveBook() {
  if (!activeBook.value || busy.value) return;
  busy.value = "save-book";
  error.value = "";
  notice.value = "";
  try {
    await updateMiniPersonalBook(activeBook.value.id, bookTitle.value, bookDescription.value);
    await refresh();
    notice.value = "词书信息已保存。";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存失败，请重试。";
  } finally { busy.value = ""; }
}

async function removeBook() {
  const book = activeBook.value;
  if (!book || busy.value) return;
  const confirmation = await uni.showModal({
    title: "删除这本词书？",
    content: `“${book.title}”中的 ${activeWords.value.length} 个词条、${activeLessons.value.length} 个课次及 ${activeBookLearningCount.value} 条学习/复习记录都会删除。其他词书不受影响。`,
    confirmText: "删除词书",
    cancelText: "保留",
  });
  if (!confirmation.confirm) return;
  busy.value = "delete-book";
  try {
    await deleteMiniPersonalBook(book.id, true);
    selectedBookId.value = "";
    await refresh();
    notice.value = `已删除“${book.title}”及其词条与学习记录。`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除失败，请重试。";
  } finally { busy.value = ""; }
}

async function saveLesson() {
  const book = activeBook.value;
  if (!book || busy.value) return;
  busy.value = "create-lesson";
  error.value = "";
  try {
    const lesson = await createMiniPersonalLesson(book.id, newLessonTitle.value);
    newLessonTitle.value = "";
    await refresh();
    selectedLessonId.value = lesson.id;
    notice.value = "课次已创建。";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "创建课次失败，请重试。";
  } finally { busy.value = ""; }
}

function resetWordForm() {
  term.value = "";
  reading.value = "";
  meaning.value = "";
  editingWordId.value = "";
}

function editWord(word: Word) {
  if (busy.value) return;
  editingWordId.value = word.id;
  selectedLessonId.value = word.lessonId;
  term.value = word.term;
  reading.value = word.reading;
  meaning.value = word.meaning;
  error.value = "";
  notice.value = "";
}

async function saveWord() {
  const book = activeBook.value;
  if (!book || busy.value) return;
  const draft: MiniPersonalWordDraft = { term: term.value, reading: reading.value, meaning: meaning.value };
  busy.value = editingWordId.value ? "update-word" : "add-word";
  error.value = "";
  notice.value = "";
  try {
    if (editingWordId.value) {
      await updateMiniPersonalWord(editingWordId.value, draft);
      notice.value = "词条已保存，原有学习记录保留。";
    } else {
      await addMiniPersonalWords(book.id, [draft], { lessonId: selectedLessonId.value || undefined });
      notice.value = `已添加到${activeLessonTitle.value || "默认分组"}。`;
    }
    resetWordForm();
    await refresh();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "保存词条失败，请重试。";
  } finally { busy.value = ""; }
}

async function removeWord(word: Word) {
  if (busy.value) return;
  const records = activeWordLearningCount(word.id);
  const confirmation = await uni.showModal({
    title: "删除这个词条？",
    content: `“${word.term}”及其 ${records} 条学习/复习记录会删除。`,
    confirmText: "删除词条",
    cancelText: "保留",
  });
  if (!confirmation.confirm) return;
  busy.value = `delete:${word.id}`;
  try {
    await deleteMiniPersonalWord(word.id, true);
    if (editingWordId.value === word.id) resetWordForm();
    await refresh();
    notice.value = "词条与相关学习记录已删除。";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "删除词条失败，请重试。";
  } finally { busy.value = ""; }
}

function makeBatchPreview() {
  batchPreview.value = null;
  error.value = "";
  try {
    batchPreview.value = previewMiniWordImport(batchText.value, "默认分组");
    if (!batchPreview.value.rows.length && !batchPreview.value.errors.length) error.value = "粘贴内容中没有可导入的词条。";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法预览这份词表。";
  }
}

async function importBatch() {
  const book = activeBook.value;
  const preview = batchPreview.value;
  if (!book || !preview || !batchCanImport.value) return;
  busy.value = "import-words";
  error.value = "";
  try {
    const destination = batchTargetLessonId.value
      ? { lessonId: batchTargetLessonId.value }
      : {};
    const result = await addMiniPersonalWords(book.id, preview.rows, destination);
    batchPreview.value = null;
    batchText.value = "";
    await refresh();
    notice.value = `导入完成：新增 ${result.added} 个，跳过重复 ${result.skipped + preview.duplicateCount} 个。`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "导入失败，请重试。";
  } finally { busy.value = ""; }
}

async function chooseBatchFile() {
  if (busy.value || !miniPersonalLibraryFiles.canImport) return;
  busy.value = "choose-import-file";
  error.value = "";
  nativeFileInfo.value = "";
  try {
    const imported = await miniPersonalLibraryFiles.chooseImportFile();
    if (!imported) return;
    batchText.value = imported.text;
    batchPreview.value = null;
    notice.value = `已读取「${imported.name}」，请先预览词表，再确认导入。`;
  } catch (cause) {
    if (isMiniPersonalLibraryFileCancel(cause)) return;
    error.value = cause instanceof Error ? cause.message : "读取文件失败，请重试。";
  } finally { busy.value = ""; }
}

async function choosePackageFile() {
  if (busy.value || !miniPersonalLibraryFiles.canImport) return;
  busy.value = "choose-package-file";
  error.value = "";
  nativeFileInfo.value = "";
  try {
    const imported = await miniPersonalLibraryFiles.chooseImportFile();
    if (!imported) return;
    if (!/\.json$/iu.test(imported.name)) throw new Error("个人词库备份请选 JSON 文件；CSV 可在词书页面批量导入。");
    packageText.value = imported.text;
    pendingPackage.value = null;
    packagePreview.value = null;
    notice.value = `已读取「${imported.name}」，请点击“校验并预览”后再合并。`;
  } catch (cause) {
    if (isMiniPersonalLibraryFileCancel(cause)) return;
    error.value = cause instanceof Error ? cause.message : "读取文件失败，请重试。";
  } finally { busy.value = ""; }
}

async function previewPackage() {
  pendingPackage.value = null;
  packagePreview.value = null;
  error.value = "";
  try {
    const parsed = parseMiniPersonalLibrary(packageText.value);
    if (!parsed) throw new Error("请选择 KotoBud 导出的个人词库 JSON 包。");
    busy.value = "preview-package";
    pendingPackage.value = parsed;
    packagePreview.value = await previewMiniPersonalLibrary(parsed);
  } catch (cause) {
    pendingPackage.value = null;
    packagePreview.value = null;
    error.value = cause instanceof Error ? cause.message : "词库包预览失败，请检查 JSON。";
  } finally { busy.value = ""; }
}

async function mergePackage(policy: "keep-local" | "use-package") {
  const library = pendingPackage.value;
  if (!library || !canMergePackage.value) return;
  if (policy === "use-package") {
    const confirmation = await uni.showModal({
      title: "使用备份中的同 ID 内容？",
      content: "同 ID 的词书、课次、词条与原句内容会以备份为准；本机学习进度、复习记录和队列仍保留。",
      confirmText: "使用备份内容",
      cancelText: "取消",
    });
    if (!confirmation.confirm) return;
  }
  busy.value = "merge-package";
  error.value = "";
  try {
    const result = await mergeMiniPersonalLibrary(library, policy);
    pendingPackage.value = null;
    packagePreview.value = null;
    packageText.value = "";
    await refresh();
    notice.value = `合并完成：新增 ${result.newBooks} 本词书、${result.newLessons} 个课次、${result.newWords} 个词条；原句新增 ${result.newContexts} 条。`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "词库包合并失败，请重试。";
  } finally { busy.value = ""; }
}

async function prepareExport() {
  if (busy.value) return;
  busy.value = "export";
  error.value = "";
  try {
    const library = await exportMiniPersonalLibrary();
    exportText.value = JSON.stringify(library, null, 2);
    savedExportFile.value = null;
    nativeFileInfo.value = "";
    notice.value = `备份已生成：${library.books.length} 本词书、${library.lessons.length} 个课次、${library.words.length} 个词条。`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "生成备份失败，请重试。";
  } finally { busy.value = ""; }
}

async function saveExportFile() {
  if (!exportText.value || busy.value) return;
  busy.value = "save-export-file";
  error.value = "";
  nativeFileInfo.value = "";
  savedExportFile.value = null;
  try {
    const file = await miniPersonalLibraryFiles.saveExportFile(exportText.value);
    savedExportFile.value = file;
    notice.value = `备份文件已保存到小程序本机目录：${file.name}。需要发送时再点“分享备份文件”。`;
  } catch (cause) {
    error.value = cause instanceof Error
      ? cause.message
      : "无法保存本机文件；备份 JSON 仍保留在文本框中，可以复制保存。";
  } finally { busy.value = ""; }
}

async function shareExportFile() {
  const file = savedExportFile.value;
  if (!file || busy.value || !miniPersonalLibraryFiles.canShare) return;
  busy.value = "share-export-file";
  error.value = "";
  nativeFileInfo.value = "";
  try {
    await miniPersonalLibraryFiles.shareExportFile(file);
    notice.value = `已分享备份文件：${file.name}。`;
  } catch (cause) {
    if (isMiniPersonalLibraryFileCancel(cause)) {
      nativeFileInfo.value = `分享已取消；${file.name} 仍保存在小程序本机目录。`;
    } else {
      error.value = cause instanceof Error ? cause.message : "分享没有完成；备份文件仍保存在小程序本机目录。";
    }
  } finally { busy.value = ""; }
}

function copyExport() {
  if (!exportText.value || busy.value) return;
  busy.value = "copy-export";
  error.value = "";
  uni.setClipboardData({
    data: exportText.value,
    success: () => { notice.value = "备份 JSON 已复制，可粘贴到安全的位置保存。"; busy.value = ""; },
    fail: () => { error.value = "复制失败，请长按文本框手动复制。"; busy.value = ""; },
  });
}
</script>

<template>
  <MiniPage class="personal-page">
    <MiniHeader kicker="PERSONAL LIBRARY / 自建词库" title="我的词库" description="自己整理词条、导入表格，也可以把个人词库备份后迁移到另一台设备。" />

    <view v-if="!queryBookId" class="section-tabs">
      <button class="secondary-btn section-tab" :class="{ selected: section === 'books' }" :disabled="!!busy" @tap="selectSection('books')">词书</button>
      <button class="secondary-btn section-tab" :class="{ selected: section === 'create' }" :disabled="!!busy" @tap="selectSection('create')">新建词书</button>
      <button class="secondary-btn section-tab" :class="{ selected: section === 'backup' }" :disabled="!!busy" @tap="selectSection('backup')">备份与迁移</button>
    </view>

    <MiniNotice :message="notice" tone="success" />
    <MiniNotice :message="error" tone="error" />
    <MiniNotice :message="nativeFileInfo" tone="info" />

    <view v-if="loading && !data" class="card status-card"><text>正在读取个人词库…</text></view>
    <view v-else-if="error && !data" class="card status-card">
      <text>{{ error }}</text>
      <button class="secondary-btn action-button" :disabled="!!busy" @tap="refresh">重新读取</button>
    </view>

    <template v-else-if="section === 'books'">
      <view v-if="!queryBookId" class="book-list card">
        <view class="section-heading">
          <view><text class="section-title">自建词书</text><text class="section-hint">{{ personalBooks.length }} 本 · 内置教材仍在词书页管理</text></view>
          <button class="small-primary" :disabled="!!busy" @tap="selectSection('create')">新建</button>
        </view>
        <view v-if="!personalBooks.length" class="empty-card">
          <text class="empty-title">还没有自建词书</text>
          <text class="muted-copy">从自己的词表开始，词条和原句会保存在当前账户。</text>
          <button class="primary-btn action-button" :disabled="!!busy" @tap="selectSection('create')">创建第一本</button>
        </view>
        <button v-for="book in personalBooks" :key="book.id" class="book-row" :class="{ 'book-row-active': activeBookId === book.id }" :disabled="!!busy" @tap="selectBook(book)">
          <view class="book-row-copy"><text class="book-name">{{ book.title }}</text><text class="book-description">{{ book.description || '还没有简介' }}</text></view>
          <text class="book-chevron">{{ activeBookId === book.id ? '正在编辑' : '编辑 ›' }}</text>
        </button>
      </view>

      <template v-if="activeBook">
        <view class="card book-editor">
          <view class="section-heading"><view><text class="section-title">词书信息</text><text class="section-hint">编辑名称与简介，不会改变学习记录</text></view><button class="danger-quiet" :disabled="!!busy" @tap="removeBook">删除词书</button></view>
          <text class="field-label">词书名称</text>
          <input v-model="bookTitle" class="text-input" maxlength="80" placeholder="例如：旅行日语" />
          <text class="field-label">简介</text>
          <textarea v-model="bookDescription" class="text-area compact-area" maxlength="500" placeholder="写下这本词书适合什么场景" />
          <button class="primary-btn action-button" :loading="busy === 'save-book'" :disabled="!!busy" @tap="saveBook">保存词书信息</button>
        </view>

        <view class="card lesson-editor">
          <view class="section-heading"><view><text class="section-title">课次</text><text class="section-hint">{{ activeLessons.length }} 个分组 · {{ activeWords.length }} 个词条</text></view></view>
          <view v-if="activeLessons.length" class="lesson-chips">
            <button v-for="lesson in activeLessons" :key="lesson.id" class="lesson-chip" :class="{ selected: selectedLessonId === lesson.id }" :disabled="!!busy" @tap="selectedLessonId = lesson.id">{{ lesson.title }}</button>
          </view>
          <view class="inline-create">
            <input v-model="newLessonTitle" class="text-input" maxlength="80" placeholder="新课次名称" />
            <button class="secondary-btn inline-button" :loading="busy === 'create-lesson'" :disabled="!!busy" @tap="saveLesson">新建课次</button>
          </view>
        </view>

        <view class="card word-editor">
          <view class="section-heading"><view><text class="section-title">{{ editingWordId ? '编辑词条' : '增加词条' }}</text><text class="section-hint">词形、读音和中文释义都要填写</text></view><button v-if="editingWordId" class="text-action" :disabled="!!busy" @tap="resetWordForm">取消编辑</button></view>
          <picker v-if="activeLessons.length" :range="activeLessons" range-key="title" :value="Math.max(0, activeLessons.findIndex((lesson) => lesson.id === selectedLessonId))" :disabled="!!busy || !!editingWordId" @change="chooseWordLesson">
            <view class="picker-value">课次：{{ activeLessonTitle || '选择课次' }}　⌄</view>
          </picker>
          <text class="field-label">词形</text><input v-model="term" class="text-input" maxlength="120" placeholder="例如：切符" />
          <text class="field-label">读音</text><input v-model="reading" class="text-input" maxlength="120" placeholder="例如：きっぷ" />
          <text class="field-label">中文释义</text><textarea v-model="meaning" class="text-area compact-area" maxlength="500" placeholder="例如：车票" />
          <button class="primary-btn action-button" :loading="busy === 'add-word' || busy === 'update-word'" :disabled="!!busy || !activeLessons.length" @tap="saveWord">{{ editingWordId ? '保存修改' : '添加到当前课次' }}</button>
        </view>

        <view class="card batch-editor">
          <view class="section-heading"><view><text class="section-title">批量导入词表</text><text class="section-hint">粘贴 CSV、制表符表格或 JSON；每行预览错误后再导入</text></view></view>
          <!-- #ifdef MP-WEIXIN -->
          <button class="secondary-btn action-button native-file-button" :loading="busy === 'choose-import-file'" :disabled="!!busy || !miniPersonalLibraryFiles.canImport" @tap="chooseBatchFile">{{ miniPersonalLibraryFiles.canImport ? '选择本机 CSV / JSON 词表' : '当前环境无法读取文件，请粘贴内容' }}</button>
          <!-- #endif -->
          <textarea v-model="batchText" class="text-area batch-area" maxlength="120000" placeholder="词形\t读音\t中文释义&#10;切符\tきっぷ\t车票" />
          <picker v-if="activeLessons.length" :range="batchLessonOptions" range-key="title" :value="Math.max(0, batchLessonOptions.findIndex((lesson) => lesson.id === batchTargetLessonId))" :disabled="!!busy" @change="chooseBatchLesson">
            <view class="picker-value">导入到：{{ batchTargetLessonId ? activeLessons.find((lesson) => lesson.id === batchTargetLessonId)?.title : '保留表格里的课次' }}　⌄</view>
          </picker>
          <button class="secondary-btn action-button" :disabled="!!busy || !batchText.trim()" @tap="makeBatchPreview">预览词表</button>
          <view v-if="batchPreview" class="preview-panel">
            <text class="preview-summary">{{ batchPreview.rows.length }} 行可导入 · {{ batchPreview.duplicateCount }} 行重复将跳过 · {{ batchPreview.errors.length }} 项错误</text>
            <view v-for="(row, index) in batchPreview.rows.slice(0, 8)" :key="`${row.term}-${index}`" class="preview-row"><text>{{ row.term }} · {{ row.reading }}</text><text>{{ row.meaning }}{{ row.lesson ? ` / ${row.lesson}` : '' }}</text></view>
            <text v-if="batchPreview.rows.length > 8" class="muted-copy">另有 {{ batchPreview.rows.length - 8 }} 行有效词条</text>
            <view v-for="issue in batchPreview.errors" :key="`${issue.row}-${issue.message}`" class="row-error">第 {{ issue.row }} 行：{{ issue.message }}</view>
            <button class="primary-btn action-button" :loading="busy === 'import-words'" :disabled="!batchCanImport" @tap="importBatch">确认导入 {{ batchPreview.rows.length }} 行</button>
          </view>
        </view>

        <view class="word-list-heading"><text class="section-title">词条</text><text class="section-hint">修改词条会保留 ID 与学习进度</text></view>
        <view v-if="!activeWords.length" class="card empty-card"><text class="empty-title">课次里还没有词条</text><text class="muted-copy">可以手动添加，也可以粘贴表格批量导入。</text></view>
        <view v-for="word in activeWords" :key="word.id" class="card word-row">
          <view class="word-copy"><text class="word-term">{{ word.term }}</text><text class="word-reading">{{ word.reading }}</text><MiniMeaningText class="word-meaning" :word="word" /><text class="word-location">{{ activeLessons.find((lesson) => lesson.id === word.lessonId)?.title }}<text v-if="activeWordLearningCount(word.id)"> · {{ activeWordLearningCount(word.id) }} 条学习记录</text></text></view>
          <view class="word-actions"><button class="secondary-btn word-action" :disabled="!!busy" @tap="editWord(word)">编辑</button><button class="danger-quiet word-action" :disabled="!!busy" @tap="removeWord(word)">删除</button></view>
        </view>
      </template>
      <view v-else-if="!queryBookId && !personalBooks.length" class="card empty-card"><text class="muted-copy">创建一本自建词书后，就能在这里管理词条。</text></view>
    </template>

    <view v-else-if="section === 'create'" class="card create-card">
      <text class="section-title">新建个人词书</text>
      <text class="section-hint">会同时创建“默认分组”，之后可继续添加课次。</text>
      <text class="field-label">词书名称</text><input v-model="newBookTitle" class="text-input" maxlength="80" placeholder="例如：旅行日语" />
      <text class="field-label">简介</text><textarea v-model="newBookDescription" class="text-area compact-area" maxlength="500" placeholder="可留空" />
      <button class="primary-btn action-button" :loading="busy === 'create-book'" :disabled="!!busy" @tap="createBook">创建词书</button>
    </view>

    <template v-else-if="section === 'backup'">
      <view class="card backup-card">
        <text class="section-title">导出个人词库</text>
        <text class="section-hint">仅包含自建词书、词条与已收藏的原句，不包含学习记录。复制 JSON 后可保存或迁移。</text>
        <button class="secondary-btn action-button" :loading="busy === 'export'" :disabled="!!busy" @tap="prepareExport">生成备份 JSON</button>
        <textarea v-if="exportText" v-model="exportText" class="text-area backup-area" maxlength="2000000" />
        <button v-if="exportText" class="primary-btn action-button" :loading="busy === 'copy-export'" :disabled="!!busy" @tap="copyExport">复制备份 JSON</button>
        <!-- #ifdef MP-WEIXIN -->
        <button v-if="exportText && miniPersonalLibraryFiles.canSave" class="secondary-btn action-button native-file-button" :loading="busy === 'save-export-file'" :disabled="!!busy" @tap="saveExportFile">保存备份文件到小程序目录</button>
        <button v-if="savedExportFile && miniPersonalLibraryFiles.canShare" class="secondary-btn action-button native-file-button" :loading="busy === 'share-export-file'" :disabled="!!busy" @tap="shareExportFile">分享备份文件</button>
        <text v-if="exportText && !miniPersonalLibraryFiles.canSave" class="muted-copy">当前环境无法保存本机文件；备份 JSON 仍可复制保存。</text>
        <text v-if="savedExportFile && !miniPersonalLibraryFiles.canShare" class="muted-copy">文件已保存；当前环境不支持文件分享，可使用复制的 JSON 迁移。</text>
        <!-- #endif -->
      </view>

      <view class="card backup-card">
        <text class="section-title">导入 / 迁移</text>
        <text class="section-hint">粘贴 KotoBud 导出的个人词库 JSON 包。先预览数量，再决定怎样处理相同 ID 的内容。</text>
        <!-- #ifdef MP-WEIXIN -->
        <button class="secondary-btn action-button native-file-button" :loading="busy === 'choose-package-file'" :disabled="!!busy || !miniPersonalLibraryFiles.canImport" @tap="choosePackageFile">选择本机 JSON 备份文件</button>
        <!-- #endif -->
        <textarea v-model="packageText" class="text-area backup-area" maxlength="2000000" placeholder="在这里粘贴个人词库备份 JSON" />
        <button class="secondary-btn action-button" :loading="busy === 'preview-package'" :disabled="!!busy || !packageText.trim()" @tap="previewPackage">校验并预览</button>
        <view v-if="packagePreview" class="preview-panel">
          <text class="preview-summary">新增 {{ packagePreview.newBooks }} 本词书、{{ packagePreview.newLessons }} 个课次、{{ packagePreview.newWords }} 个词条</text>
          <text class="preview-summary">同 ID 内容：{{ packagePreview.existingWords }} 个词条；原句新增 {{ packagePreview.newContexts }} 条、已有 {{ packagePreview.existingContexts }} 条</text>
          <view class="button-pair"><button class="primary-btn action-button" :loading="busy === 'merge-package'" :disabled="!canMergePackage" @tap="mergePackage('keep-local')">合并并保留本机内容</button><button class="secondary-btn action-button" :disabled="!canMergePackage" @tap="mergePackage('use-package')">同 ID 使用备份内容</button></view>
        </view>
      </view>
    </template>
  </MiniPage>
</template>

<style scoped>
.personal-page { padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
.section-tabs { display: flex; gap: 10rpx; margin: 0 0 20rpx; padding: 8rpx; border: 1rpx solid #dce6d4; border-radius: 20rpx; background: #eef3e8; }
.section-tab { flex: 1; min-height: 88rpx; margin: 0; padding: 0 8rpx; border-color: transparent; background: transparent; color: var(--kotoba-muted); font-size: 24rpx; }
.section-tab.selected { border-color: #c3d5b8; background: var(--kotoba-paper); color: var(--kotoba-green); font-weight: 700; box-shadow: 0 4rpx 12rpx rgba(49,89,68,.06); }
.card { margin-bottom: 18rpx; padding: 26rpx; border: 1rpx solid #e0e7d9; border-radius: 24rpx; background: var(--kotoba-paper); box-shadow: 0 10rpx 28rpx rgba(49,89,68,.045); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-bottom: 20rpx; }
.section-title { display: block; color: var(--kotoba-ink); font-size: 31rpx; font-weight: 700; line-height: 1.45; }
.section-hint,.muted-copy { display: block; margin-top: 6rpx; color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.55; }
.book-row { display: flex; width: 100%; min-height: 96rpx; align-items: center; justify-content: space-between; gap: 16rpx; margin: 10rpx 0 0; padding: 18rpx 16rpx; border: 1rpx solid #e2e9dc; border-radius: 18rpx; background: #fbfcf8; text-align: left; }
.book-row-active { border-color: #9bb88a; background: #edf4e8; }
.book-row-copy,.word-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5rpx; }
.book-name { color: var(--kotoba-ink); font-size: 29rpx; font-weight: 700; }
.book-description,.book-chevron,.word-location { color: var(--kotoba-muted); font-size: 22rpx; line-height: 1.45; }
.book-chevron { flex-shrink: 0; color: var(--kotoba-green); }
.empty-card,.status-card { padding: 34rpx 22rpx; text-align: center; }
.empty-title { display: block; color: var(--kotoba-ink); font-size: 29rpx; font-weight: 700; }
.action-button { display: block; width: 100%; min-height: 92rpx; margin: 18rpx 0 0; padding: 14rpx 20rpx; border-radius: 16rpx; font-size: 26rpx; }
.small-primary,.danger-quiet,.text-action { min-height: 72rpx; margin: 0; padding: 8rpx 18rpx; border-radius: 14rpx; font-size: 23rpx; }
.small-primary { border: 1rpx solid #a8bf99; background: #e8f0e2; color: var(--kotoba-green); }
.danger-quiet { border: 1rpx solid #e8cbc1; background: #fff8f4; color: #9a5140; }
.text-action { border: 0; background: transparent; color: var(--kotoba-green); }
.book-editor,.lesson-editor,.word-editor,.batch-editor,.create-card,.backup-card { padding: 28rpx; }
.field-label { display: block; margin: 18rpx 0 8rpx; color: #586a58; font-size: 24rpx; font-weight: 650; }
.text-input,.text-area,.picker-value { box-sizing: border-box; width: 100%; min-height: 88rpx; padding: 18rpx 20rpx; border: 1rpx solid #d8e2d1; border-radius: 15rpx; background: #fcfdf9; color: var(--kotoba-ink); font-size: 27rpx; line-height: 1.55; }
.text-area { display: block; min-height: 140rpx; }
.compact-area { min-height: 102rpx; }
.batch-area { min-height: 260rpx; font-family: monospace; font-size: 24rpx; }
.backup-area { min-height: 360rpx; margin-top: 16rpx; font-family: monospace; font-size: 21rpx; word-break: break-all; }
.lesson-chips { display: flex; flex-wrap: wrap; gap: 10rpx; margin: 12rpx 0 20rpx; }
.lesson-chip { min-height: 76rpx; margin: 0; padding: 10rpx 18rpx; border: 1rpx solid #d9e3d2; border-radius: 999rpx; background: #f6f8f2; color: #667366; font-size: 23rpx; }
.lesson-chip.selected { border-color: #9bb88a; background: #e8f0e2; color: var(--kotoba-green); font-weight: 700; }
.inline-create { display: flex; align-items: stretch; gap: 10rpx; }
.inline-create .text-input { flex: 1; min-width: 0; }
.inline-button { min-width: 160rpx; min-height: 88rpx; margin: 0; padding: 8rpx 14rpx; font-size: 23rpx; }
.picker-value { min-height: 82rpx; color: var(--kotoba-green); }
.preview-panel { margin-top: 18rpx; padding: 18rpx; border-radius: 16rpx; background: #f0f5eb; }
.preview-summary { display: block; margin: 4rpx 0 8rpx; color: var(--kotoba-green); font-size: 24rpx; font-weight: 650; line-height: 1.55; }
.preview-row { display: flex; justify-content: space-between; gap: 12rpx; padding: 10rpx 0; border-bottom: 1rpx solid #dfe8d8; color: var(--kotoba-ink); font-size: 22rpx; line-height: 1.45; }
.preview-row text:last-child { text-align: right; color: var(--kotoba-muted); }
.row-error { margin-top: 8rpx; color: #9a5140; font-size: 23rpx; line-height: 1.5; }
.word-list-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10rpx; margin: 24rpx 4rpx 12rpx; }
.word-row { display: flex; align-items: center; gap: 14rpx; padding: 22rpx; border-left: 5rpx solid #adc49e; }
.word-term { color: var(--kotoba-ink); font-size: 34rpx; font-weight: 700; }
.word-reading { color: var(--kotoba-green); font-size: 24rpx; }
.word-meaning { color: var(--kotoba-muted); font-size: 25rpx; line-height: 1.45; }
.word-actions { display: flex; flex-direction: column; gap: 8rpx; flex-shrink: 0; }
.word-action { min-width: 112rpx; min-height: 72rpx; margin: 0; padding: 8rpx; font-size: 22rpx; }
.button-pair { display: flex; flex-direction: column; gap: 8rpx; }
.button-pair .action-button { margin-top: 10rpx; }
</style>
