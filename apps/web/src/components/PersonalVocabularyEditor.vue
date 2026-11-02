<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Word } from '@jp/models';
import {ChevronDown} from 'lucide-vue-next';
import { useApp } from '../store';
import MeaningPreview from './MeaningPreview.vue';
import {
  cleanPersonalWord,
  parsePastedVocabulary,
  personalWordKey,
  type PersonalWordDraft,
} from '../services/personal-vocabulary';

const props = defineProps<{ bookId: string }>();
const app = useApp();
const newLessonValue = '__new_lesson__';
type AddMode = 'single' | 'paste';

const accountId = computed(() => app.currentUser?.id ?? 'local');
const book = computed(() => app.data.books.find((item) => item.id === props.bookId));
const bookLessons = computed(() => app.data.lessons
  .filter((lesson) => lesson.bookId === props.bookId)
  .slice()
  .sort((a, b) => a.order - b.order));
const lessonById = computed(() => new Map(bookLessons.value.map((lesson) => [lesson.id, lesson])));
const lessonOrderById = computed(() => new Map(bookLessons.value.map((lesson) => [lesson.id, lesson.order])));
const bookWords = computed(() => {
  const lessonIds = new Set(bookLessons.value.map((lesson) => lesson.id));
  return app.data.words
    .filter((word) => lessonIds.has(word.lessonId))
    .slice()
    .sort((a, b) => (lessonOrderById.value.get(a.lessonId) ?? Number.MAX_SAFE_INTEGER)
      - (lessonOrderById.value.get(b.lessonId) ?? Number.MAX_SAFE_INTEGER) || a.order - b.order);
});

const blankDraft = (): PersonalWordDraft => ({ term: '', reading: '', meaning: '' });
const addMode = ref<AddMode>('single');
const singleDraft = ref<PersonalWordDraft>(blankDraft());
const pastedText = ref('');
const lessonChoice = ref('__new_lesson__');
const newLessonTitle = ref('');
const editorOpen = ref(false);
const adding = ref(false);
const addError = ref('');
const addSuccess = ref('');
const listFilter = ref('');
const listLessonId = ref('');
const listLimit=ref(50);
const editingWordId = ref<string | null>(null);
const editDraft = ref<PersonalWordDraft>(blankDraft());
const editError = ref('');
const editSuccess = ref('');
const savingWord = ref(false);
let scopeRevision = 0;
const editorTouched = ref(false);

const parsedPaste = computed(() => pastedText.value.trim()
  ? parsePastedVocabulary(pastedText.value)
  : { words: [] as PersonalWordDraft[], errors: [] as Array<{ row: number; message: string }>, duplicateCount: 0 });
const targetLessonKeys = computed(() => new Set(bookWords.value
  .filter((word) => lessonChoice.value !== newLessonValue && word.lessonId === lessonChoice.value)
  .map((word) => personalWordKey(word.term, word.reading))));
const pasteExistingDuplicateCount = computed(() => parsedPaste.value.words
  .filter((word) => targetLessonKeys.value.has(personalWordKey(word.term, word.reading))).length);
const pastePreview = computed(() => parsedPaste.value.words.slice(0, 12));
const singleAlreadyExists = computed(() => !!singleDraft.value.term.trim()
  && !!singleDraft.value.reading.trim()
  && targetLessonKeys.value.has(personalWordKey(singleDraft.value.term, singleDraft.value.reading)));
const lessonTargetReady = computed(() => {
  if (!bookLessons.value.length) return true;
  if (lessonChoice.value !== newLessonValue) return bookLessons.value.some((lesson) => lesson.id === lessonChoice.value);
  return !!newLessonTitle.value.trim();
});
const canSubmitAdd = computed(() => {
  if (app.busy || adding.value || !lessonTargetReady.value) return false;
  if (addMode.value === 'single') {
    return !!singleDraft.value.term.trim() && !!singleDraft.value.reading.trim() && !!singleDraft.value.meaning.trim();
  }
  return !!pastedText.value.trim()
    && parsedPaste.value.words.length > 0
    && parsedPaste.value.errors.length === 0;
});
const filteredWords = computed(() => {
  const query = listFilter.value.trim().toLocaleLowerCase();
  return bookWords.value.filter((word) => {
    if (listLessonId.value && word.lessonId !== listLessonId.value) return false;
    if (!query) return true;
    return [word.term, word.reading, word.meaning].some((value) => value.toLocaleLowerCase().includes(query));
  });
});
const editingWord = computed(() => bookWords.value.find((word) => word.id === editingWordId.value));
const visibleWords=computed(()=>filteredWords.value.slice(0,listLimit.value));
watch([listFilter,listLessonId],()=>{listLimit.value=50;});

function resetForScope() {
  scopeRevision += 1;
  editorTouched.value = false;
  addMode.value = 'single';
  singleDraft.value = blankDraft();
  pastedText.value = '';
  lessonChoice.value = bookLessons.value[0]?.id ?? newLessonValue;
  newLessonTitle.value = `第${bookLessons.value.length + 1}课`;
  editorOpen.value = bookWords.value.length === 0;
  listFilter.value = '';
  listLessonId.value = '';
  listLimit.value=50;
  editingWordId.value = null;
  editDraft.value = blankDraft();
  editError.value = '';
  editSuccess.value = '';
  addError.value = '';
  addSuccess.value = '';
  adding.value = false;
  savingWord.value = false;
}

watch([() => props.bookId, accountId], resetForScope, { immediate: true, flush: 'sync' });
watch(() => bookWords.value.length, (count) => {
  if (!editorTouched.value) editorOpen.value = count === 0;
});
watch(() => bookLessons.value.map((lesson) => lesson.id).join('|'), () => {
  if (lessonChoice.value !== newLessonValue && !bookLessons.value.some((lesson) => lesson.id === lessonChoice.value)) {
    lessonChoice.value = bookLessons.value[0]?.id ?? newLessonValue;
  }
  if (listLessonId.value && !bookLessons.value.some((lesson) => lesson.id === listLessonId.value)) listLessonId.value = '';
});

function syncEditorOpen(event: Event) {
  editorOpen.value = (event.currentTarget as HTMLDetailsElement).open;
}

function clearAddFeedback() {
  addError.value = '';
  addSuccess.value = '';
}

function setAddMode(mode: AddMode) {
  addMode.value = mode;
  clearAddFeedback();
}

function lessonOptions(): { lessonId?: string; lessonTitle?: string } {
  if (!bookLessons.value.length) return { lessonTitle: '第1课' };
  if (lessonChoice.value === newLessonValue) return { lessonTitle: newLessonTitle.value.trim() };
  return { lessonId: lessonChoice.value };
}

async function submitAdd() {
  if (!canSubmitAdd.value) return;
  editorTouched.value = true;
  const revision = scopeRevision;
  const targetBookId = props.bookId;
  const targetAccountId = accountId.value;
  const duplicatesInPaste = addMode.value === 'paste' ? parsedPaste.value.duplicateCount : 0;
  adding.value = true;
  addError.value = '';
  addSuccess.value = '';
  try {
    const words = addMode.value === 'single'
      ? [cleanPersonalWord(singleDraft.value)]
      : parsedPaste.value.words.map(cleanPersonalWord);
    const result = await app.addPersonalWords(targetBookId, words, lessonOptions());
    if (revision !== scopeRevision || targetBookId !== props.bookId || targetAccountId !== accountId.value) return;
    if (!result) {
      addError.value = app.error || '添加未完成，请检查内容后重试。';
      return;
    }
    const skipped = result.skipped + duplicatesInPaste;
    addSuccess.value = skipped
      ? `已添加 ${result.added} 条，跳过重复 ${skipped} 条。可以继续输入。`
      : `已添加 ${result.added} 条。可以继续输入。`;
    if (addMode.value === 'single') singleDraft.value = blankDraft();
    else pastedText.value = '';
    if (result.lessonId) {
      lessonChoice.value = result.lessonId;
      listLessonId.value = result.lessonId;
    }
  } catch (error) {
    if (revision === scopeRevision && targetBookId === props.bookId && targetAccountId === accountId.value) {
      addError.value = error instanceof Error ? error.message : '添加未完成，请重试。';
    }
  } finally {
    if (revision === scopeRevision) adding.value = false;
  }
}

function toggleEdit(word: Word) {
  editError.value = '';
  editSuccess.value = '';
  if (editingWordId.value === word.id) {
    editingWordId.value = null;
    return;
  }
  editingWordId.value = word.id;
  editDraft.value = cleanPersonalWord({ term: word.term, reading: word.reading, meaning: word.meaning });
}

async function saveEdit(word: Word) {
  if (app.busy || savingWord.value || editingWordId.value !== word.id) return;
  const revision = scopeRevision;
  const targetBookId = props.bookId;
  const targetAccountId = accountId.value;
  savingWord.value = true;
  editError.value = '';
  editSuccess.value = '';
  try {
    const draft = cleanPersonalWord(editDraft.value);
    const saved = await app.editPersonalWord(word.id, draft);
    if (revision !== scopeRevision || targetBookId !== props.bookId || targetAccountId !== accountId.value) return;
    if (!saved) {
      editError.value = app.error || '修改未保存，请重试。';
      return;
    }
    editingWordId.value = null;
    editSuccess.value = `已保存「${draft.term}」，学习进度保留。`;
  } catch (error) {
    if (revision === scopeRevision && targetBookId === props.bookId && targetAccountId === accountId.value) {
      editError.value = error instanceof Error ? error.message : '修改未保存，请重试。';
    }
  } finally {
    if (revision === scopeRevision) savingWord.value = false;
  }
}
</script>

<template>
  <section class="personal-vocabulary-editor" aria-label="个人词库编辑">
    <details class="editor-disclosure" :open="editorOpen" @toggle="syncEditorOpen">
        <summary class="editor-summary" @click="editorTouched = true">
        <span><strong>添加词汇</strong><small>词条内容保存在当前设备。</small></span>
        <ChevronDown class="editor-chevron" :size="18" aria-hidden="true"/>
      </summary>
      <div class="editor-content">
        <div class="mode-switch" role="group" aria-label="添加方式">
          <button type="button" :aria-pressed="addMode === 'single'" @click="setAddMode('single')">逐词添加</button>
          <button type="button" :aria-pressed="addMode === 'paste'" @click="setAddMode('paste')">表格粘贴</button>
        </div>

        <form class="add-form" @submit.prevent="submitAdd">
          <div v-if="addMode === 'single'" class="field-grid">
            <label>词形
              <input v-model="singleDraft.term" required autocomplete="off" @input="clearAddFeedback" />
            </label>
            <label>读音
              <input v-model="singleDraft.reading" required autocomplete="off" @input="clearAddFeedback" />
            </label>
            <label>中文释义
              <input v-model="singleDraft.meaning" required autocomplete="off" @input="clearAddFeedback" />
            </label>
          </div>

          <div v-else class="paste-editor">
            <label>词表内容
              <textarea v-model="pastedText" rows="5" spellcheck="false" placeholder="每行依次填写：词形、读音、中文释义，以制表符分隔" @input="clearAddFeedback"></textarea>
            </label>
            <p class="field-help">TSV 示例（不需要表头）：</p>
            <pre class="tsv-example">食べる&#9;たべる&#9;吃<br>学校&#9;がっこう&#9;学校</pre>
            <div v-if="pastedText.trim()" class="parse-summary" aria-live="polite">
              <span>可预览 {{ parsedPaste.words.length }} 条</span>
              <span>表内重复 {{ parsedPaste.duplicateCount }} 条</span>
              <span>与目标课次重复 {{ pasteExistingDuplicateCount }} 条</span>
            </div>
            <ul v-if="parsedPaste.errors.length" class="error-list" role="alert" aria-label="粘贴内容错误">
              <li v-for="error in parsedPaste.errors" :key="`${error.row}-${error.message}`">第 {{ error.row }} 行：{{ error.message }}</li>
            </ul>
            <div v-if="pastePreview.length" class="paste-preview" aria-label="粘贴内容预览">
              <div class="preview-heading"><strong>预览</strong><span>最多显示前 12 条</span></div>
              <div v-for="(word, index) in pastePreview" :key="`${word.term}-${word.reading}-${index}`" class="preview-row">
                <strong lang="ja">{{ word.term }}</strong><span lang="ja">{{ word.reading }}</span><span>{{ word.meaning }}</span>
              </div>
              <p v-if="parsedPaste.words.length > 12" class="field-help">其余 {{ parsedPaste.words.length - 12 }} 条已省略预览。</p>
            </div>
          </div>

          <div class="lesson-target">
            <p v-if="!bookLessons.length" class="field-help" role="status">这是空词书；添加时会自动创建第1课。</p>
            <template v-else>
              <label>添加到课次
                <select v-model="lessonChoice" @change="clearAddFeedback">
                  <option v-for="lesson in bookLessons" :key="lesson.id" :value="lesson.id">{{ lesson.title }}</option>
                  <option :value="newLessonValue">新建课次</option>
                </select>
              </label>
              <label v-if="lessonChoice === newLessonValue">新课次名称
                <input v-model="newLessonTitle" required autocomplete="off" placeholder="例如：第1课" @input="clearAddFeedback" />
              </label>
            </template>
          </div>

          <p v-if="singleAlreadyExists && addMode === 'single'" class="field-help" role="status">这组词形和读音已在目标课次中；保存时会跳过重复词。</p>
          <p v-if="addError" class="inline-error" role="alert">{{ addError }}</p>
          <p v-if="addSuccess" class="inline-success" role="status">{{ addSuccess }}</p>
          <div class="form-actions">
            <button class="primary" type="submit" :disabled="!canSubmitAdd">{{ adding ? '正在添加…' : '添加词条' }}</button>
            <span v-if="app.busy" class="field-help">正在保存，请稍候。</span>
          </div>
        </form>
      </div>
    </details>

    <div class="existing-vocabulary">
      <div class="list-heading">
        <div><h3>现有词表</h3><p class="field-help">{{ book?.title || '当前词书' }} · {{ bookWords.length }} 条</p></div>
        <span class="result-count">显示 {{ visibleWords.length }} / {{ filteredWords.length }} 条</span>
      </div>
      <div class="list-filters">
        <label>筛选词形、读音或释义
          <input v-model="listFilter" type="search" autocomplete="off" placeholder="输入关键词" />
        </label>
        <label>课次
          <select v-model="listLessonId">
            <option value="">全部课次</option>
            <option v-for="lesson in bookLessons" :key="lesson.id" :value="lesson.id">{{ lesson.title }}</option>
          </select>
        </label>
      </div>
      <p v-if="editSuccess" class="inline-success" role="status">{{ editSuccess }}</p>
      <p v-if="!bookWords.length" class="empty-state">词表还是空的。添加词条后会显示在这里。</p>
      <p v-else-if="!filteredWords.length" class="empty-state">没有符合筛选条件的词条。</p>
      <div v-else class="word-list">
        <article v-for="word in visibleWords" :key="word.id" class="word-row">
          <div class="word-info">
            <div class="word-heading"><strong lang="ja">{{ word.term }}</strong><span lang="ja">{{ word.reading }}</span></div>
            <MeaningPreview :word="word" />
            <small class="word-meta">{{ lessonById.get(word.lessonId)?.title || '未分类课次' }}<span v-if="word.partOfSpeech"> · {{ word.partOfSpeech }}</span></small>
          </div>
          <button class="edit-toggle" type="button" :aria-expanded="editingWordId === word.id" @click="toggleEdit(word)">{{ editingWordId === word.id ? '收起修改' : '修改' }}</button>
          <form v-if="editingWordId === word.id" class="edit-form" @submit.prevent="saveEdit(word)">
            <div class="field-grid">
              <label>词形
                <input v-model="editDraft.term" required autocomplete="off" />
              </label>
              <label>读音
                <input v-model="editDraft.reading" required autocomplete="off" />
              </label>
              <label>中文释义
                <input v-model="editDraft.meaning" required autocomplete="off" />
              </label>
            </div>
            <p class="field-help">只修改词形、读音和中文释义，学习进度会保留。</p>
            <p v-if="word.senses && word.senses.length > 1" class="field-help">这是多义词；只修改首条释义，其他释义和附加信息会保留。</p>
            <p v-if="editError" class="inline-error" role="alert">{{ editError }}</p>
            <div class="form-actions">
              <button class="primary" type="submit" :disabled="app.busy || savingWord || !editDraft.term.trim() || !editDraft.reading.trim() || !editDraft.meaning.trim()">{{ savingWord ? '正在保存…' : '保存修改' }}</button>
              <button type="button" :disabled="savingWord" @click="toggleEdit(word)">取消</button>
            </div>
          </form>
        </article>
      </div>
      <button v-if="filteredWords.length>visibleWords.length" type="button" @click="listLimit+=50">再显示 50 条</button>
    </div>
  </section>
</template>

<style scoped>
.personal-vocabulary-editor{color:#33463a}
.editor-disclosure{border:1px solid var(--line,#dce4d8);border-radius:10px;background:var(--paper,#fbfcf8)}
.editor-summary{display:flex;align-items:center;justify-content:space-between;min-height:56px;padding:10px 16px;cursor:pointer;color:var(--green,#31583e)}
.editor-disclosure[open] .editor-chevron{transform:rotate(180deg)}
.editor-summary span{display:grid;gap:2px}
.editor-summary strong{font-size:16px;font-weight:650}
.editor-summary small,.field-help,.word-meta{color:#687667;font-size:12px;line-height:1.6}
.editor-content{padding:16px;border-top:1px solid var(--line,#dce4d8)}
.mode-switch{display:flex;gap:8px;margin-bottom:16px}
button{min-height:44px;padding:9px 14px;border:1px solid var(--line,#dce4d8);border-radius:8px;background:transparent;color:var(--green,#31583e);font:inherit;font-size:13px;cursor:pointer}
button:disabled{opacity:.55;cursor:default}
.mode-switch button[aria-pressed=true],button.primary{border-color:var(--green,#31583e);background:var(--green,#31583e);color:#fff}
.field-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
label{display:grid;gap:6px;color:#405243;font-size:12px;line-height:1.5}
input,select,textarea{width:100%;min-height:44px;padding:9px 11px;border:1px solid var(--line,#dce4d8);border-radius:7px;background:#fff;color:#293b30;font:inherit;font-size:14px}
textarea{min-height:120px;resize:vertical;line-height:1.6}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,.editor-summary:focus-visible{outline:2px solid var(--green,#31583e);outline-offset:2px}
.paste-editor{display:grid;gap:8px}
.field-help{margin:0}
.tsv-example{margin:0;padding:10px 12px;border-left:2px solid var(--green,#31583e);background:#f4f7f0;color:#4e5d4e;font:inherit;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}
.parse-summary{display:flex;flex-wrap:wrap;gap:8px 18px;color:#526553;font-size:12px}
.error-list{display:grid;gap:4px;margin:0;padding:10px 12px 10px 28px;border-radius:7px;background:#fbefed;color:#9a3d31;font-size:12px;line-height:1.6}
.paste-preview{display:grid;gap:0;margin-top:4px;border-top:1px solid var(--line,#dce4d8)}
.preview-heading,.preview-row{display:grid;grid-template-columns:minmax(80px,1fr) minmax(80px,1fr) minmax(120px,2fr);gap:10px;padding:8px 4px;border-bottom:1px solid var(--line,#e5e9e1);font-size:12px;line-height:1.55}
.preview-heading{color:#677568}
.preview-row strong{font-weight:600}
.lesson-target{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin-top:16px}
.lesson-target label{min-width:min(100%,240px)}
.lesson-target .field-help{padding-bottom:12px}
.add-form>.field-grid{margin-bottom:2px}
.form-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:12px}
.inline-error,.inline-success{margin:10px 0 0;padding:9px 11px;border-radius:7px;font-size:12px;line-height:1.6}
.inline-error{background:#fbefed;color:#9a3d31}
.inline-success{background:#eef4e9;color:#365a3d}
.existing-vocabulary{margin-top:22px}
.list-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.list-heading h3{margin:0;color:#304a38;font-size:16px;font-weight:650}
.list-heading .field-help{margin-top:3px}
.result-count{color:#657463;font-size:12px;white-space:nowrap}
.list-filters{display:grid;grid-template-columns:minmax(0,2fr) minmax(180px,1fr);gap:12px;margin-bottom:8px}
.empty-state{margin:0;padding:16px 0;color:#687667;font-size:13px;line-height:1.6}
.word-list{border-top:1px solid var(--line,#dce4d8)}
.word-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;padding:14px 0;border-bottom:1px solid var(--line,#dce4d8)}
.word-info{min-width:0}
.word-heading{display:flex;flex-wrap:wrap;align-items:baseline;gap:7px 12px;margin-bottom:4px}
.word-heading strong{color:#293e30;font-size:17px;font-weight:650;overflow-wrap:anywhere}
.word-heading span{color:#657463;font-size:13px;overflow-wrap:anywhere}
.word-meta{display:block;margin-top:4px}
.edit-toggle{align-self:start;min-width:80px}
.edit-form{grid-column:1/-1;padding:12px 0 2px;border-top:1px dashed var(--line,#dce4d8)}
.edit-form .field-help{margin-top:8px}
.edit-form .inline-error{margin-top:8px}
.edit-form .form-actions{margin-top:10px}
@media(max-width:680px){.field-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.preview-heading,.preview-row{grid-template-columns:minmax(70px,1fr) minmax(70px,1fr) minmax(100px,1.5fr)}}
@media(max-width:520px){.editor-content{padding:13px}.field-grid,.list-filters{grid-template-columns:1fr}.lesson-target{display:grid;grid-template-columns:1fr}.lesson-target label{min-width:0}.lesson-target .field-help{padding-bottom:0}.word-row{grid-template-columns:minmax(0,1fr);gap:10px}.edit-toggle{justify-self:start}.preview-heading,.preview-row{grid-template-columns:minmax(70px,1fr) minmax(70px,1fr);gap:7px}.preview-heading span:last-child,.preview-row span:last-child{grid-column:1/-1}.list-heading{align-items:flex-start}input,select,textarea{font-size:16px}}
</style>
