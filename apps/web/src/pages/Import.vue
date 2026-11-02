<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ArrowRight, BookOpen, FileText, Upload } from 'lucide-vue-next';
import { parseImport, type ImportRow } from '@jp/importers';
import PersonalVocabularyEditor from '../components/PersonalVocabularyEditor.vue';
import { useApp } from '../store';
import { parsePersonalLibrary, previewPersonalLibraryMerge, summarizePersonalLibrary, type ExistingContentPolicy, type PersonalLibrary, type PersonalLibraryMergeResult } from '../services/personal-library';

const app = useApp();
const route = useRoute();
const router = useRouter();
type ImportMode = 'personal' | 'file';
const mode = ref<ImportMode>(route.query.mode === 'file' ? 'file' : 'personal');
const accountId = computed(() => app.currentUser?.id ?? 'local');

const personalTitle = ref('');
const personalDescription = ref('');
const personalNameError = ref('');
const createError = ref('');
const creating = ref(false);
const createdBookId = ref<string | null>(null);
const createdTitle = ref('');
const createdBook = computed(() => app.data.books.find(book => book.id === createdBookId.value));
const createdWordCount = computed(() => {
  if (!createdBookId.value) return 0;
  const lessonIds = new Set(app.data.lessons.filter(lesson => lesson.bookId === createdBookId.value).map(lesson => lesson.id));
  return app.data.words.filter(word => lessonIds.has(word.lessonId)).length;
});

const fileInput = ref<HTMLInputElement | null>(null);
const rows = ref<ImportRow[]>([]);
const fileTitle = ref('');
const fileTitleError = ref('');
const fileError = ref('');
const fileName = ref('');
const reading = ref(false);
const importing = ref(false);
const personalLibrary = ref<PersonalLibrary | null>(null);
const personalLibraryCounts = ref<ReturnType<typeof summarizePersonalLibrary> | null>(null);
const existingContentPolicy = ref<ExistingContentPolicy>('keep-local');
const personalLibraryResult = ref<PersonalLibraryMergeResult | null>(null);
const personalLibraryMerge = computed(() => {
  if (!personalLibrary.value) return null;
  try { return previewPersonalLibraryMerge(app.data, personalLibrary.value, app.metaBooks.map(book => book.id)); }
  catch { return null; }
});
const groups = computed(() => [...new Set(rows.value.map(row => row.lesson))]
  .map(lesson => ({ lesson, count: rows.value.filter(row => row.lesson === lesson).length })));
let pageRevision = 0;

function isCurrentPage(revision: number, owner: string) {
  return revision === pageRevision && owner === accountId.value;
}

function resetAccountState() {
  pageRevision += 1;
  mode.value = route.query.mode === 'file' ? 'file' : 'personal';
  personalTitle.value = '';
  personalDescription.value = '';
  personalNameError.value = '';
  createError.value = '';
  creating.value = false;
  createdBookId.value = null;
  createdTitle.value = '';
  rows.value = [];
  fileTitle.value = '';
  fileTitleError.value = '';
  fileError.value = '';
  fileName.value = '';
  reading.value = false;
  importing.value = false;
  personalLibrary.value = null;
  personalLibraryCounts.value = null;
  existingContentPolicy.value = 'keep-local';
  personalLibraryResult.value = null;
  if (fileInput.value) fileInput.value.value = '';
}
watch(accountId, resetAccountState, { immediate: true, flush: 'sync' });
watch(() => route.query.mode, value => { mode.value = value === 'file' ? 'file' : 'personal'; });

function validatePersonalTitle() {
  personalNameError.value = personalTitle.value.trim() ? '' : '请输入词书名称。';
}
function clearPersonalErrors() {
  personalNameError.value = '';
  createError.value = '';
}

async function createPersonalBook() {
  if (creating.value || app.busy) return;
  const normalizedTitle = personalTitle.value.trim();
  if (!normalizedTitle) {
    personalNameError.value = '请输入词书名称。';
    return;
  }
  const revision = pageRevision;
  const owner = accountId.value;
  creating.value = true;
  createError.value = '';
  personalNameError.value = '';
  try {
    const id = await app.addBook([], normalizedTitle, personalDescription.value.trim());
    if (!isCurrentPage(revision, owner)) return;
    if (!id) {
      createError.value = app.error || '创建失败，请检查后重试。';
      return;
    }
    createdBookId.value = id;
    createdTitle.value = normalizedTitle;
  } catch (error) {
    if (isCurrentPage(revision, owner)) {
      createError.value = app.error || (error instanceof Error ? error.message : '创建失败，请重试。');
    }
  } finally {
    if (isCurrentPage(revision, owner)) creating.value = false;
  }
}

async function choose(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  rows.value = [];
  personalLibrary.value = null;
  personalLibraryCounts.value = null;
  personalLibraryResult.value = null;
  fileName.value = '';
  fileError.value = '';
  fileTitleError.value = '';
  if (!file) return;
  const revision = pageRevision;
  const owner = accountId.value;
  reading.value = true;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB');
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'json') throw new Error('请选择 CSV 或 JSON 文件');
    const text = await file.text();
    if (!isCurrentPage(revision, owner)) return;
    fileName.value = file.name;
    if (ext === 'json') {
      const library = parsePersonalLibrary(text);
      if (!isCurrentPage(revision, owner)) return;
      if (library) {
        previewPersonalLibraryMerge(app.data, library, app.metaBooks.map(book => book.id));
        if (!isCurrentPage(revision, owner)) return;
        personalLibrary.value = library;
        personalLibraryCounts.value = summarizePersonalLibrary(library);
        return;
      }
    }
    rows.value = parseImport(text, ext);
    if (!fileTitle.value) fileTitle.value = file.name.replace(/\.(csv|json)$/i, '');
  } catch (error) {
    if (isCurrentPage(revision, owner)) {
      fileError.value = error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (isCurrentPage(revision, owner)) reading.value = false;
  }
}

function validateFileTitle() {
  fileTitleError.value = fileTitle.value.trim() ? '' : '请输入词书名称。';
}

async function confirmFileImport() {
  if (importing.value || app.busy) return;
  const normalizedTitle = fileTitle.value.trim();
  if (personalLibrary.value) {
    const revision = pageRevision;
    const owner = accountId.value;
    importing.value = true;
    fileError.value = '';
    try {
      const result = await app.importPersonalLibrary(personalLibrary.value, existingContentPolicy.value, owner === 'local' ? null : owner);
      if (!isCurrentPage(revision, owner)) return;
      if (!result) {
        fileError.value = app.error || '合并失败，请检查文件后重试。';
        return;
      }
      personalLibraryResult.value = result;
    } catch (error) {
      if (isCurrentPage(revision, owner)) fileError.value = app.error || (error instanceof Error ? error.message : '合并失败，请重试。');
    } finally {
      if (isCurrentPage(revision, owner)) importing.value = false;
    }
    return;
  }
  if (!rows.value.length) return;
  if (!normalizedTitle) {
    fileTitleError.value = '请输入词书名称。';
    return;
  }
  const revision = pageRevision;
  const owner = accountId.value;
  importing.value = true;
  fileError.value = '';
  fileTitleError.value = '';
  try {
    const id = await app.addBook(rows.value, normalizedTitle);
    if (!isCurrentPage(revision, owner)) return;
    if (!id) {
      fileError.value = app.error || '导入失败，请检查后重试。';
      return;
    }
    await router.push('/books/' + id);
  } catch (error) {
    if (isCurrentPage(revision, owner)) {
      fileError.value = app.error || (error instanceof Error ? error.message : '导入失败，请重试。');
    }
  } finally {
    if (isCurrentPage(revision, owner)) importing.value = false;
  }
}
</script>

<template>
  <section class="page-heading">
    <div>
      <p class="eyebrow">MAKE IT YOURS</p>
      <h1>带上你的日语词书</h1>
      <p class="muted">从空白开始整理，或导入已有词表。</p>
    </div>
  </section>

  <div class="entry-layout">
    <div class="entry-main">
      <div class="mode-switch" role="group" aria-label="选择创建词书的方式">
        <button type="button" :aria-pressed="mode === 'personal'" @click="mode = 'personal'">自己整理</button>
        <button type="button" :aria-pressed="mode === 'file'" @click="mode = 'file'">文件导入</button>
      </div>

      <section v-show="mode === 'personal'" class="personal-mode" aria-label="自己整理词书">
        <section v-if="!createdBookId" class="entry-card">
          <div class="section-title">
            <h2>从一本空词书开始</h2>
            <span>逐词添加 · 表格粘贴 · 随时修改</span>
          </div>
          <form class="personal-form" @submit.prevent="createPersonalBook">
            <label for="personal-book-title">词书名称</label>
            <input
              id="personal-book-title"
              v-model="personalTitle"
              required
              maxlength="100"
              autocomplete="off"
              :aria-invalid="!!personalNameError"
              :aria-describedby="personalNameError ? 'personal-title-error' : undefined"
              @input="clearPersonalErrors"
              @blur="validatePersonalTitle"
            />
            <p v-if="personalNameError" id="personal-title-error" class="error" role="alert">{{ personalNameError }}</p>

            <label for="personal-book-description">简介 <span>选填</span></label>
            <textarea
              id="personal-book-description"
              v-model="personalDescription"
              rows="2"
              maxlength="500"
              placeholder="例如：旅行时想复习的表达"
            />
            <p class="local-note">词书和词条保存在本机浏览器中。</p>
            <p v-if="createError" class="error" role="alert">{{ createError }}</p>
            <button class="primary create-button" type="submit" :disabled="app.busy || creating">
              {{ creating ? '正在创建…' : '创建词书' }}
              <ArrowRight :size="17" aria-hidden="true" />
            </button>
          </form>
        </section>

        <section v-else class="created-content">
          <div class="created-summary">
            <div class="created-heading">
              <div>
                <p class="eyebrow">词书已创建</p>
                <h2>{{ createdBook?.title || createdTitle }}</h2>
              </div>
              <RouterLink class="open-book-link" :to="'/books/' + createdBookId">进入词书 <ArrowRight :size="16" aria-hidden="true" /></RouterLink>
            </div>
            <p class="book-count" role="status" aria-live="polite">当前 {{ createdWordCount }} 词</p>
            <p class="local-note">词书和词条保存在本机浏览器中。</p>
          </div>
          <PersonalVocabularyEditor v-if="createdBook" :book-id="createdBook.id" />
        </section>
      </section>

      <section v-show="mode === 'file'" class="file-mode" aria-label="文件导入">
        <section>
          <label class="upload-zone">
            <Upload :size="30" aria-hidden="true" />
            <strong>{{ reading ? '正在解析…' : '选择 CSV 或 JSON 文件' }}</strong>
            <span>支持普通词表和 Kotobud 个人词库包 · UTF-8 编码 · 最大 5 MB</span>
            <input ref="fileInput" type="file" accept=".csv,.json" :disabled="reading || importing || app.busy" @change="choose" />
          </label>
          <div v-if="fileError" class="error" role="alert">{{ fileError }}</div>
          <section v-if="personalLibraryResult" class="library-import-success" role="status" aria-live="polite">
            <div class="library-success-icon"><BookOpen :size="21" aria-hidden="true"/></div>
            <p class="eyebrow">合并完成</p>
            <h2>个人词库已合并到本机</h2>
            <p>新增 {{ personalLibraryResult.newBooks }} 本词书、{{ personalLibraryResult.newLessons }} 个课次、{{ personalLibraryResult.newWords }} 个词和 {{ personalLibraryResult.newContexts }} 条原句。</p>
            <p>已有内容：{{ personalLibraryResult.existingWords }} 个词、{{ personalLibraryResult.existingContexts }} 条原句。重复内容没有另建词书。</p>
            <p class="local-note">学习记录与当前学习进度不会随文件迁移；合并也不会更改当前学习词书。</p>
            <RouterLink class="button primary" to="/books">查看词书 <ArrowRight :size="16" aria-hidden="true"/></RouterLink>
          </section>
          <section v-else-if="personalLibrary && personalLibraryCounts && personalLibraryMerge" class="library-package-preview" aria-label="个人词库包预览">
            <div class="section-title">
              <div><p class="eyebrow">KOTOBUD PERSONAL LIBRARY</p><h2>合并个人词库</h2></div>
              <span class="package-filename">{{ fileName }}</span>
            </div>
            <p class="package-summary">文件包含 {{ personalLibraryCounts.bookCount }} 本自建词书、{{ personalLibraryCounts.lessonCount }} 个课次、{{ personalLibraryCounts.wordCount }} 个词和 {{ personalLibraryCounts.contextCount }} 条收藏原句。</p>
            <div class="package-books" aria-label="词书列表">
              <span v-for="book in personalLibrary.books" :key="book.id">{{ book.title }}</span>
              <span v-if="!personalLibrary.books.length">仅包含内置词条的收藏原句</span>
            </div>
            <div class="merge-counts" aria-label="合并数量预览">
              <div><strong>{{ personalLibraryMerge.newBooks }}</strong><span>新增词书</span></div>
              <div><strong>{{ personalLibraryMerge.newLessons }}</strong><span>新增课次</span></div>
              <div><strong>{{ personalLibraryMerge.newWords }}</strong><span>新增词条</span></div>
              <div><strong>{{ personalLibraryMerge.existingWords }}</strong><span>已有词条</span></div>
              <div><strong>{{ personalLibraryMerge.newContexts }}</strong><span>新增原句</span></div>
              <div><strong>{{ personalLibraryMerge.existingContexts }}</strong><span>已有原句</span></div>
            </div>
            <fieldset class="content-policy">
              <legend>遇到已有内容时</legend>
              <label class="policy-choice">
                <input v-model="existingContentPolicy" type="radio" value="keep-local" />
                <span><strong>保留本机版本（推荐）</strong><small>保留这台设备的版本，补入文件中的新增内容。</small></span>
              </label>
              <label class="policy-choice">
                <input v-model="existingContentPolicy" type="radio" value="use-package" />
                <span><strong>使用文件版本</strong><small>采用文件中的版本，保留这台设备另外整理的内容。</small></span>
              </label>
            </fieldset>
            <p class="local-note">合并不会删除本机额外内容，学习记录和当前词书保持不变。</p>
            <button class="primary confirm-button" type="button" :disabled="app.busy || importing" @click="confirmFileImport">
              {{ importing ? '正在合并…' : '合并到本机' }} <ArrowRight :size="17" aria-hidden="true" />
            </button>
          </section>
          <div v-else-if="personalLibrary" class="error" role="alert">无法预览这个文件中的合并内容。请选择其他词库包，或重新导出后重试。</div>
          <form v-else-if="rows.length" class="preview" @submit.prevent="confirmFileImport">
            <div class="section-title">
              <h2>导入预览</h2>
              <span>{{ fileName }}</span>
            </div>
            <label for="file-book-title">词书名称</label>
            <input
              id="file-book-title"
              v-model="fileTitle"
              required
              maxlength="100"
              autocomplete="off"
              :aria-invalid="!!fileTitleError"
              :aria-describedby="fileTitleError ? 'file-title-error' : undefined"
              @input="fileTitleError = ''"
              @blur="validateFileTitle"
            />
            <p v-if="fileTitleError" id="file-title-error" class="error" role="alert">{{ fileTitleError }}</p>
            <p>检测到 <strong>{{ groups.length }} 个课次</strong>，共 <strong>{{ rows.length }} 个单词</strong></p>
            <div class="preview-lessons">
              <div v-for="group in groups" :key="group.lesson"><span>{{ group.lesson }}</span><span>{{ group.count }} 词</span></div>
            </div>
            <h3>单词预览</h3>
            <div class="sample-words">
              <div v-for="(row, index) in rows.slice(0, 5)" :key="index"><strong>{{ row.term }}</strong><span>{{ row.reading }}</span><span>{{ row.meaning }}</span></div>
            </div>
            <p class="local-note">文件在浏览器中解析，确认后保存在本机浏览器中。</p>
            <button class="primary confirm-button" type="submit" :disabled="app.busy || importing">
              {{ importing ? '正在导入…' : '确认导入' }} <ArrowRight :size="17" aria-hidden="true" />
            </button>
          </form>
        </section>

        <aside class="format-help">
          <FileText :size="24" aria-hidden="true" />
          <h2>简单的格式，就可以开始</h2>
          <p>每行一个词，用 lesson 列标明所属课次。相同课次会自动归组。</p>
          <code>lesson,term,reading,meaning,partOfSpeech<br />第1课,約束,やくそく,约定,名词</code>
          <p>JSON 支持相同字段的对象数组。词性、例句和音频地址为选填。</p>
          <a href="/examples/demo.csv" download>下载 CSV 示例 ↗</a>
          <a href="/examples/demo.json" download>下载 JSON 示例 ↗</a>
          <a href="/examples/detailed.json" download>下载多义项示例 ↗</a>
          <small>文件只在你的浏览器中解析，确认后才会保存。</small>
        </aside>
      </section>
    </div>
  </div>
</template>

<style scoped>
.entry-layout,
.entry-main,
.personal-mode,
.file-mode,
.entry-card,
.created-content,
.created-summary {
  min-width: 0;
  box-sizing: border-box;
}
.entry-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  width: 100%;
}
.entry-main { min-width: 0; }
.personal-mode { max-width: 760px; }
.mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  max-width: 760px;
  margin-bottom: 18px;
  padding: 4px;
  border: 1px solid #dce4d8;
  border-radius: 10px;
  background: #f1f4ec;
}
.mode-switch button,
.create-button,
.confirm-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 9px 14px;
  color: #3b5b43;
  background: transparent;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.mode-switch button[aria-pressed="true"] {
  background: #fffef9;
  border-color: #dce4d8;
  box-shadow: 0 2px 5px rgb(54 93 73 / 8%);
  color: #31583e;
  font-weight: 600;
}
.mode-switch button:focus-visible,
.entry-layout button:focus-visible,
.entry-layout a:focus-visible,
.entry-layout input:focus-visible,
.entry-layout textarea:focus-visible {
  outline: 2px solid #31583e;
  outline-offset: 2px;
}
.entry-card,
.created-summary {
  max-width: 760px;
  padding: 22px;
  border: 1px solid #dce4d8;
  border-radius: 10px;
  background: #fbfcf8;
}
.section-title,
.created-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.section-title h2,
.created-heading h2 {
  margin: 0;
  color: #304a38;
  font-size: 19px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.section-title > span {
  color: #687667;
  font-size: 12px;
  line-height: 1.6;
}
.personal-form {
  display: grid;
  gap: 8px;
  margin-top: 20px;
}
.personal-form input,
.personal-form textarea { margin-top: 0; }
.personal-form label,
.file-mode form > label {
  color: #405243;
  font-size: 13px;
  font-weight: 550;
}
.personal-form label span {
  margin-left: 5px;
  color: #687667;
  font-size: 12px;
  font-weight: 400;
}
.entry-layout input:not([type="file"]),
.entry-layout textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  border: 1px solid #dce4d8;
  border-radius: 7px;
  padding: 10px 12px;
  background: #fff;
  color: #293b30;
  font: inherit;
  font-size: 15px;
}
.entry-layout textarea {
  min-height: 92px;
  resize: vertical;
  line-height: 1.6;
}
.entry-layout input[aria-invalid="true"] {
  border-color: #b66554;
}
.personal-form .error,
.preview .error { margin: 0; }
.local-note {
  margin: 4px 0 2px;
  color: #687667;
  font-size: 12px;
  line-height: 1.7;
}
.create-button,
.confirm-button {
  justify-self: start;
  border-color: #31583e;
  background: #31583e;
  color: #fff;
  font-weight: 600;
}
.create-button:disabled,
.confirm-button:disabled {
  opacity: .58;
  cursor: default;
}
.error {
  margin: 12px 0;
  color: #9a3d31;
  font-size: 13px;
  line-height: 1.6;
}
.created-content { display: grid; gap: 20px; }
.created-summary { max-width: none; }
.personal-mode :deep(.personal-vocabulary-editor),
.personal-mode :deep(.list-heading),
.personal-mode :deep(.list-filters),
.personal-mode :deep(.word-row) { min-width: 0; }
.personal-mode :deep(.list-heading) { flex-wrap: wrap; }
.personal-mode :deep(.list-heading .field-help) { overflow-wrap: anywhere; }
.personal-mode :deep(.result-count) { white-space: normal; }
.created-heading { align-items: center; }
.created-heading .eyebrow { margin: 0 0 4px; }
.book-count {
  margin: 13px 0 0;
  color: #405243;
  font-size: 14px;
}
.open-book-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #cbd8c5;
  border-radius: 7px;
  padding: 8px 12px;
  color: #31583e;
  text-decoration: none;
  font-size: 13px;
  white-space: nowrap;
}
.open-book-link:hover { background: #eef4e9; }
.file-mode {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(240px, 1fr);
  align-items: start;
  gap: 32px;
}
.file-mode > section { min-width: 0; }
.file-mode .upload-zone {
  box-sizing: border-box;
  min-width: 0;
  padding: 30px 18px;
}
.file-mode .upload-zone strong { overflow-wrap: anywhere; }
.file-mode .upload-zone input {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 44px;
}
.file-mode .preview { min-width: 0; }
.file-mode .preview .section-title { align-items: baseline; }
.file-mode .preview .section-title > span {
  max-width: 100%;
  color: #687667;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.file-mode .preview-lessons > div { min-width: 0; gap: 10px; }
.file-mode .preview-lessons > div > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.file-mode .preview-lessons > div > span:last-child { flex-shrink: 0; white-space: nowrap; }
.file-mode .sample-words > div {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr);
}
.file-mode .sample-words strong,
.file-mode .sample-words span { overflow-wrap: anywhere; }
.format-help { min-width: 0; overflow-wrap: anywhere; }
.format-help h2 { font-size: 19px; line-height: 1.5; }
.format-help code { max-width: 100%; white-space: pre-wrap; }
.library-package-preview,.library-import-success{min-width:0;margin-top:18px;padding:22px;border:1px solid #dce4d8;border-radius:12px;background:#fbfcf8}.library-package-preview .eyebrow{margin:0 0 5px;font-size:10px;letter-spacing:.13em}.library-package-preview .section-title{align-items:center}.package-filename{max-width:100%;overflow-wrap:anywhere;color:#687667;font-size:12px}.package-summary{margin:14px 0 10px;color:#4b5d4e;font-size:13px;line-height:1.75}.package-books{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0 18px}.package-books span{max-width:100%;padding:5px 9px;border:1px solid #dfe7dc;border-radius:99px;background:#f2f6ee;color:#50664e;font-size:11px;overflow-wrap:anywhere}.merge-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;overflow:hidden;border:1px solid #e2e9df;border-radius:10px;background:#e2e9df}.merge-counts>div{min-width:0;display:flex;flex-direction:column;gap:4px;padding:12px;background:#fffefb}.merge-counts strong{color:#31583e;font-size:19px;font-weight:600}.merge-counts span{color:#687667;font-size:11px;line-height:1.5;overflow-wrap:anywhere}.content-policy{min-width:0;margin:18px 0 0;padding:0;border:0}.content-policy legend{margin-bottom:8px;color:#405243;font-size:13px;font-weight:600}.policy-choice{display:flex;align-items:flex-start;gap:11px;min-height:54px;padding:11px;border:1px solid #e1e8dd;border-radius:9px;background:#fffefb;cursor:pointer}.policy-choice+.policy-choice{margin-top:8px}.policy-choice:has(input:checked){border-color:#8ea987;background:#f0f5ec}.policy-choice input[type="radio"]{flex:none;width:18px;height:18px;margin:2px 0 0;accent-color:#31583e}.policy-choice span{min-width:0}.policy-choice strong{display:block;color:#405243;font-size:12px;line-height:1.6}.policy-choice small{display:block;margin-top:3px;color:#687667;font-size:11px;line-height:1.65}.library-package-preview .local-note{margin:12px 0}.library-package-preview .confirm-button{min-height:46px}.library-import-success{text-align:center;padding:28px 24px}.library-success-icon{display:grid;place-items:center;width:48px;height:48px;margin:0 auto 13px;border-radius:15px;background:#e4efdc;color:#406c4b}.library-import-success .eyebrow{margin-bottom:6px}.library-import-success h2{margin:0;color:#304a38;font-size:20px;line-height:1.5}.library-import-success p:not(.eyebrow){margin:10px 0 0;color:#4b5d4e;font-size:13px;line-height:1.75}.library-import-success .local-note{margin-bottom:16px;color:#687667;font-size:11px}.library-import-success .button{min-height:44px}
@media (max-width: 760px) {
  .file-mode { grid-template-columns: minmax(0, 1fr); gap: 22px; }
}
@media (max-width: 520px) {
  .personal-form { gap: 6px; margin-top: 16px; }
  .personal-form textarea { min-height: 72px; }
  .entry-card,
  .created-summary { padding: 17px 15px; }
  .mode-switch { gap: 5px; }
  .mode-switch button { padding-inline: 8px; }
  .entry-layout input:not([type="file"]),
  .entry-layout textarea { font-size: 16px; }
  .file-mode .upload-zone { padding: 24px 13px; }
  .file-mode .upload-zone input { font-size: 16px; }
  .format-help { padding: 19px 16px; }
  .library-package-preview,.library-import-success{padding:18px 15px}.merge-counts{grid-template-columns:repeat(2,minmax(0,1fr))}
  .create-button,
  .confirm-button { width: 100%; }
  .open-book-link { white-space: normal; }
}
</style>
