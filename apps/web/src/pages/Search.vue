<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { gsap } from 'gsap';
import { ArrowLeft, Bookmark, BookOpen, Check, CircleAlert, LoaderCircle, RotateCcw, Search as SearchIcon, Volume2 } from 'lucide-vue-next';
import { stateFor } from '@jp/core';
import type { Word } from '@jp/models';
import { useApp } from '../store';
import { usePronunciation } from '../composables/usePronunciation';
import MeaningPreview from '../components/MeaningPreview.vue';
import ReadingContextComposer from '../components/ReadingContextComposer.vue';
import ReadingContextList from '../components/ReadingContextList.vue';
import DictionarySearchResults from '../components/DictionarySearchResults.vue';
import DictionaryComparisonPanel from '../components/DictionaryComparisonPanel.vue';
import VocabularySourcePicker from '../components/VocabularySourcePicker.vue';
import { groupVocabularySearchResults } from '../services/vocabulary-search-groups';
import type { DictionaryQuery } from '../services/dictionary-comparison';
import { partOfSpeechLabel } from '@jp/dictionary';
import {
  dictionaryResultKey,
  dictionaryWord,
  searchDictionary,
  type DictionarySearchResult,
} from '../services/dictionary-search';
import {
  loadTextbookSearchCatalog,
  mergeVocabularyEntries,
  saveSearchEntryToDifficult,
  searchVocabularyCandidates,
  type TextbookSearchLoad,
  type VocabularySearchEntry,
  type VocabularySearchResult,
} from '../services/vocabulary-search';

const app = useApp();
const route = useRoute();
const router = useRouter();
const pronunciation = usePronunciation();
const root = ref<HTMLElement | null>(null);
const query = ref('');
const inputError = ref('');
const results = shallowRef<VocabularySearchResult[]>([]);
const selectedSources = shallowRef<Record<string, string>>({});
const visibleResults = computed(() => groupVocabularySearchResults(results.value, app.data.currentBookId).map(group => ({
  ...group,
  entry: group.entries.find(entry => entry.id === selectedSources.value[group.key]) ?? group.preferred,
})));
const dictionaryResults = shallowRef<DictionarySearchResult[]>([]);
const dictionaryLoading = ref(false);
const dictionaryError = ref('');
const savingDictionaryResultKey = ref('');
const savedDictionaryResultKeys = ref<string[]>([]);
const catalog = shallowRef<TextbookSearchLoad | null>(null);
const catalogLoaded = ref(false);
const catalogLoading = ref(false);
const searchError = ref('');
const actionError = ref('');
const actionMessage = ref('');
const savingWordId = ref('');
const openingContextWordId = ref('');
const contextFormWordId = ref('');
const playingWordId = ref('');
const comparisonTarget = shallowRef<DictionaryQuery | null>(null);
function compareDictionaryResult(result: DictionarySearchResult) {
  comparisonTarget.value = { term: result.term, reading: result.reading, partOfSpeech: partOfSpeechLabel(result.entry.senses.flatMap(sense => sense.pos)) };
}
let searchSequence = 0;
let accountEpoch = 0;
let playbackEpoch = 0;
let motionVersion = 0;
let resultMotion: gsap.Context | undefined;
let catalogPromise: Promise<TextbookSearchLoad> | null = null;

const isQueryEmpty = computed(() => !query.value.trim());
const unavailableBookCount = computed(() => catalog.value?.failedBookIds.length ?? 0);

function parseRouteQuery(value: unknown): string {
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? String(value[0] ?? '') : '';
}

function currentUserId(): string | null {
  return app.currentUser?.id ?? null;
}

function stateOwnerId(): string {
  return currentUserId() ?? 'local';
}

function belongsToCurrentAccount(userId: string | null, epoch: number): boolean {
  return accountEpoch === epoch && currentUserId() === userId;
}

function localEntries(): VocabularySearchEntry[] {
  const textbookIds = new Set<string>(app.metaBooks.map(book => book.id));
  const booksById = new Map(app.data.books.map(book => [book.id, book]));
  const lessonsById = new Map(app.data.lessons.map(lesson => [lesson.id, lesson]));
  return app.data.words.map(word => {
    const lesson = lessonsById.get(word.lessonId);
    const bookId = lesson?.bookId ?? word.lessonId.split('-l-')[0] ?? '';
    const book = booksById.get(bookId);
    return {
      ...word,
      bookId,
      bookTitle: book?.title ?? (textbookIds.has(bookId) ? bookId : '我的词条'),
      lessonTitle: lesson?.title ?? '未分类',
      source: textbookIds.has(bookId) ? 'textbook' : 'custom',
    };
  });
}

function updateResults() {
  const value = query.value;
  if (!value.trim() || value.length > 80) {
    results.value = [];
    return;
  }
  const combined = mergeVocabularyEntries(catalog.value?.entries ?? [], localEntries());
  results.value = searchVocabularyCandidates(combined, value);
}

function selectSource(key: string, id: string) {
  if (app.busy || savingWordId.value || openingContextWordId.value || contextFormWordId.value) return;
  if (!visibleResults.value.some(group => group.key === key && group.entries.some(entry => entry.id === id))) return;
  selectedSources.value = { ...selectedSources.value, [key]: id };
  comparisonTarget.value = null;
  playbackEpoch++;
  pronunciation.stop();
  playingWordId.value = '';
}

function showSearchError(value: string) {
  searchError.value = value.length > 80 ? '搜索词最多 80 个字符，请缩短后重试。' : '';
}

async function runSearch(rawValue: unknown, retry = false) {
  const sequence = ++searchSequence;
  contextFormWordId.value = '';
  openingContextWordId.value = '';
  query.value = parseRouteQuery(rawValue);
  selectedSources.value = {};
  inputError.value = '';
  actionError.value = '';
  actionMessage.value = '';
  showSearchError(query.value);

  if (!query.value.trim() || query.value.length > 80) {
    results.value = [];
    dictionaryResults.value = [];
    dictionaryLoading.value = false;
    dictionaryError.value = '';
    catalogLoading.value = false;
    return;
  }

  void runDictionarySearch(query.value, sequence);
  updateResults();
  if (catalogLoaded.value && !retry) return;

  catalogLoading.value = true;
  try {
    const loaded = await loadCatalog(retry);
    if (sequence !== searchSequence) return;
    catalog.value = loaded;
    catalogLoaded.value = true;
    updateResults();
  } catch (error) {
    if (sequence !== searchSequence) return;
    searchError.value = error instanceof Error ? error.message : '内置词库暂时无法读取。';
  } finally {
    if (sequence === searchSequence) catalogLoading.value = false;
  }
}

async function runDictionarySearch(value: string, sequence: number) {
  dictionaryLoading.value = true;
  dictionaryError.value = '';
  dictionaryResults.value = [];
  try {
    const found = await searchDictionary(value);
    if (sequence !== searchSequence) return;
    dictionaryResults.value = found;
  } catch {
    if (sequence !== searchSequence) return;
    dictionaryError.value = '通用词典暂时无法读取，请稍后重试。';
  } finally {
    if (sequence === searchSequence) dictionaryLoading.value = false;
  }
}

async function saveDictionaryEntry(result: DictionarySearchResult) {
  if (savingDictionaryResultKey.value) return;
  const resultKey = dictionaryResultKey(result);
  const capturedUserId = currentUserId();
  const capturedEpoch = accountEpoch;
  const stillOwner = () => belongsToCurrentAccount(capturedUserId, capturedEpoch);
  savingDictionaryResultKey.value = resultKey;
  actionError.value = '';
  actionMessage.value = '';
  try {
    const status = await app.addDictionaryWord(dictionaryWord(result.entry, result.term, result.reading), capturedUserId);
    if (!stillOwner() || status.status === 'stale') return;
    if (status.status === 'saved' || status.status === 'existing') {
      savedDictionaryResultKeys.value = [...new Set([...savedDictionaryResultKeys.value, resultKey])];
      actionMessage.value = status.status === 'existing' ? '这个词条已在个人词库中。' : '已收藏到个人词库。';
      return;
    }
    throw new Error('收藏失败，请重试。');
  } catch (error) {
    if (stillOwner()) actionError.value = error instanceof Error ? error.message : '收藏到个人词库失败，请重试。';
  } finally {
    if (stillOwner() && savingDictionaryResultKey.value === resultKey) savingDictionaryResultKey.value = '';
  }
}

async function loadCatalog(retry: boolean): Promise<TextbookSearchLoad> {
  if (catalogPromise) return catalogPromise;
  const request = loadTextbookSearchCatalog({ retry });
  catalogPromise = request;
  try {
    return await request;
  } finally {
    if (catalogPromise === request) catalogPromise = null;
  }
}

function submitSearch() {
  const value = query.value.trim();
  if (value.length > 80) {
    inputError.value = '搜索词最多 80 个字符。';
    return;
  }
  inputError.value = '';
  void router.push(value ? { path: '/search', query: { q: value } } : { path: '/search' });
}

function searchExample(value: string) {
  query.value = value;
  submitSearch();
}

async function openReadingContext(entry: VocabularySearchEntry, restoreIgnored = false) {
  if (openingContextWordId.value || app.busy) return;
  const capturedUserId = currentUserId();
  const capturedEpoch = accountEpoch;
  const capturedSequence = searchSequence;
  const capturedQuery = query.value;
  const entryId = entry.id;
  const stillOwner = () => belongsToCurrentAccount(capturedUserId, capturedEpoch)
    && searchSequence === capturedSequence
    && query.value === capturedQuery
    && results.value.some(result => result.id === entryId);

  openingContextWordId.value = entryId;
  contextFormWordId.value = '';
  actionError.value = '';
  actionMessage.value = '';
  try {
    const loaded = await app.ensureBookLoaded(entry.bookId, false, capturedUserId);
    if (!stillOwner()) return;
    if (!loaded) throw new Error(app.error || '词书暂时无法读取，请重试。');

    const word = app.data.words.find(item => item.id === entryId);
    const lesson = word && app.data.lessons.find(item => item.id === word.lessonId);
    if (!word || !lesson || lesson.bookId !== entry.bookId) {
      throw new Error('这个词条当前不可用，请重新搜索后重试。');
    }
    if (resultState(entry)?.isIgnored && !restoreIgnored) {
      throw new Error('此词已忽略，请使用“恢复并收藏原句”。');
    }
    if (!stillOwner()) return;
    contextFormWordId.value = entryId;
  } catch (error) {
    if (stillOwner()) actionError.value = error instanceof Error ? error.message : '原句表单暂时无法打开，请重试。';
  } finally {
    if (openingContextWordId.value === entryId) openingContextWordId.value = '';
  }
}

function finishReadingContext() {
  contextFormWordId.value = '';
}

function readingContextSaved() {
  contextFormWordId.value = '';
  actionError.value = '';
  actionMessage.value = '已收藏原句，可在该词条的原句记录中查看。';
}

function clearSearch() {
  query.value = '';
  inputError.value = '';
  searchError.value = '';
  results.value = [];
  void router.push({ path: '/search' });
}

function resultState(entry: VocabularySearchEntry) {
  return stateFor(app.data, entry.id, stateOwnerId());
}

function entryWord(entry: VocabularySearchResult): Word {
  const {
    bookId: _bookId,
    bookTitle: _bookTitle,
    lessonTitle: _lessonTitle,
    source: _source,
    inflection: _inflection,
    ...word
  } = entry;
  return word;
}

async function saveToDifficult(entry: VocabularySearchEntry, restoreIgnored = false) {
  if (savingWordId.value || app.busy) return;
  const capturedUserId = currentUserId();
  const capturedEpoch = accountEpoch;
  const stillOwner = () => belongsToCurrentAccount(capturedUserId, capturedEpoch);
  const beforeLoadState = resultState(entry);
  if (beforeLoadState?.isIgnored && !restoreIgnored) {
    actionMessage.value = '该词处于忽略状态；请明确选择恢复并加入生词本。';
    return;
  }
  if (beforeLoadState?.isDifficult && !beforeLoadState.isIgnored) {
    actionMessage.value = '这个词已经在生词本里了。';
    return;
  }

  savingWordId.value = entry.id;
  actionError.value = '';
  actionMessage.value = '';
  try {
    const status = await saveSearchEntryToDifficult(entry, {
      expectedUserId: capturedUserId,
      restoreIgnored,
      isCurrent: stillOwner,
      ensureBookLoaded: bookId => app.ensureBookLoaded(bookId, false, capturedUserId),
      findWord: wordId => app.data.words.find(item => item.id === wordId),
      getState: (wordId, userId) => stateFor(app.data, wordId, userId ?? 'local'),
      flag: (wordId, key, value, userId) => app.flag(wordId, key, value, userId),
    });
    if (!stillOwner() || status === 'stale') return;
    if (status === 'ignored') throw new Error('该词仍处于忽略状态，请先恢复后再加入生词本。');
    if (status === 'unavailable') throw new Error(app.error || '词书或生词本状态没有保存，请重试。');
    actionMessage.value = restoreIgnored ? '已恢复并加入生词本。' : '已加入生词本，可在生词本中查看。';
  } catch (error) {
    if (!stillOwner()) return;
    actionError.value = error instanceof Error ? error.message : '加入生词本失败，请重试。';
  } finally {
    if (stillOwner()) savingWordId.value = '';
  }
}

async function playEntry(entry: VocabularySearchEntry) {
  const userId = currentUserId();
  const epoch = accountEpoch;
  const playback = ++playbackEpoch;
  playingWordId.value = entry.id;
  const success = await pronunciation.play(entryWord(entry));
  if (playback !== playbackEpoch || !belongsToCurrentAccount(userId, epoch)) return;
  if (playingWordId.value === entry.id && !success) playingWordId.value = '';
}

async function retryCatalog() {
  if (catalogLoading.value || isQueryEmpty.value) return;
  await runSearch(query.value, true);
}

async function animateResults() {
  const version = ++motionVersion;
  await nextTick();
  if (version !== motionVersion || !root.value || typeof window === 'undefined'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  resultMotion?.revert();
  const cards = Array.from(root.value.querySelectorAll<HTMLElement>('.vocab-search-result')).slice(0, 8);
  if (!cards.length) return;
  resultMotion = gsap.context(() => {
    gsap.from(cards, {
      autoAlpha: 0,
      y: 8,
      duration: 0.24,
      stagger: 0.025,
      ease: 'power2.out',
      clearProps: 'all',
    });
  }, root.value);
}

watch(() => route.query.q, value => { void runSearch(value); }, { immediate: true });
watch(query, () => {
  selectedSources.value = {};
  comparisonTarget.value = null;
  contextFormWordId.value = '';
  openingContextWordId.value = '';
});
watch(() => app.currentUser?.id, () => {
  selectedSources.value = {};
  comparisonTarget.value = null;
  accountEpoch++;
  playbackEpoch++;
  pronunciation.stop();
  playingWordId.value = '';
  savingWordId.value = '';
  savingDictionaryResultKey.value = '';
  savedDictionaryResultKeys.value = [];
  openingContextWordId.value = '';
  contextFormWordId.value = '';
  actionError.value = '';
  actionMessage.value = '';
  if (query.value.trim() && query.value.length <= 80) updateResults();
}, { flush: 'sync' });
watch(() => app.data.words, () => {
  if (query.value.trim() && query.value.length <= 80) updateResults();
}, { flush: 'post' });
watch(results, () => { void animateResults(); }, { flush: 'post' });

function handleVisibilityChange() {
  if (document.visibilityState !== 'hidden') return;
  playbackEpoch++;
  pronunciation.stop();
  playingWordId.value = '';
}

onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange));

onUnmounted(() => {
  searchSequence++;
  motionVersion++;
  playbackEpoch++;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  resultMotion?.revert();
  pronunciation.stop();
});
</script>

<template>
  <section ref="root" class="vocab-search-page" aria-labelledby="vocab-search-title">
    <RouterLink to="/" class="vocab-search-back"><ArrowLeft :size="15" />回到今日</RouterLink>
    <header class="page-heading vocab-search-heading">
      <div>
        <p class="eyebrow">A WORD, FOUND</p>
        <h1 id="vocab-search-title">查词与词汇发现</h1>
        <p class="muted">搜索标日教材、JLPT 分级词书与本账户的自定义词条。查询只读，不会改变当前词书和复习进度。</p>
      </div>
      <span class="vocab-search-count"><BookOpen :size="15" />内置词库 · {{ catalog?.entries.length ?? '—' }}</span>
    </header>

    <form class="vocab-search-form" role="search" aria-label="搜索词汇" @submit.prevent="submitSearch">
      <SearchIcon :size="19" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        maxlength="80"
        autocomplete="off"
        aria-label="日语词形、读音或中文释义"
        placeholder="输入日语词形/活用形、假名读音或中文释义"
        @input="inputError = ''; showSearchError(query)"
        @keydown.enter.prevent="submitSearch"
      />
      <button v-if="query" class="vocab-search-clear" type="button" aria-label="清空搜索词" @click="clearSearch">清空</button>
      <button class="primary vocab-search-submit" type="submit"><SearchIcon :size="16" />搜索</button>
    </form>
    <div class="vocab-search-examples" aria-label="活用形搜索示例" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:-8px 0 18px">
      <span style="color:#778276;font-size:11px">试试活用形</span>
      <button type="button" aria-label="搜索食べました" @click="searchExample('食べました')" style="min-height:44px;padding:7px 11px;border:1px solid #d9e2d5;border-radius:18px;background:#fbfcf8;color:#536b58;font-size:11px">食べました</button>
      <button type="button" aria-label="搜索行った" @click="searchExample('行った')" style="min-height:44px;padding:7px 11px;border:1px solid #d9e2d5;border-radius:18px;background:#fbfcf8;color:#536b58;font-size:11px">行った</button>
      <button type="button" aria-label="搜索高くなかった" @click="searchExample('高くなかった')" style="min-height:44px;padding:7px 11px;border:1px solid #d9e2d5;border-radius:18px;background:#fbfcf8;color:#536b58;font-size:11px">高くなかった</button>
    </div>
    <p v-if="inputError" class="vocab-search-inline-error" role="alert">{{ inputError }}</p>
    <p v-else-if="searchError" class="vocab-search-inline-error" role="alert">{{ searchError }}</p>

    <div v-if="catalogLoading" class="vocab-search-status" role="status">
      <LoaderCircle class="spin" :size="16" />正在载入内置词库…本地词条仍可先查看。
    </div>
    <div v-if="catalog?.indexError || unavailableBookCount || catalog?.cachedBookIds.length" class="vocab-search-catalog-alert" :class="{ 'is-error': unavailableBookCount > 0 || !!catalog?.indexError }" role="status">
      <CircleAlert :size="17" />
      <span>
        <template v-if="unavailableBookCount">{{ unavailableBookCount }} 本词书暂时无法读取。</template>
        <template v-if="catalog?.cachedBookIds.length">已使用 {{ catalog.cachedBookIds.length }} 册本地缓存。</template>
        <template v-if="catalog?.indexError">{{ catalog.indexError }}</template>
        当前仍显示可用的缓存与本地词条。
      </span>
      <button type="button" :disabled="catalogLoading" @click="retryCatalog"><RotateCcw :size="14" />重试内置词库</button>
    </div>

    <DictionarySearchResults
      v-if="query.trim() && query.length <= 80"
      :results="dictionaryResults"
      :loading="dictionaryLoading"
      :error="dictionaryError"
      :saving-result-key="savingDictionaryResultKey"
      :saved-result-keys="savedDictionaryResultKeys"
      @save="saveDictionaryEntry"
      @compare="compareDictionaryResult"
      @retry="runDictionarySearch(query, searchSequence)"
    />

    <div v-if="!query.trim()" class="vocab-search-prompt" role="status">
      <div class="vocab-search-prompt-seal"><SearchIcon :size="21" /></div>
      <strong>从一个词开始</strong>
      <p>可输入日语原形或常见动词、い形容词活用形，也可搜索假名读音和中文释义。</p>
    </div>
    <div v-if="query.trim() && catalogLoading && !results.length" class="vocab-search-loading" role="status">
      <LoaderCircle class="spin" :size="24" />
      <span>正在整理内置词条与本地词书…</span>
    </div>
    <div v-if="query.trim() && !catalogLoading && !results.length" class="vocab-search-empty" role="status" aria-live="polite">
      <div class="vocab-search-prompt-seal"><SearchIcon :size="19" /></div>
      <strong>{{ unavailableBookCount || catalog?.indexError ? '暂时没有可用的匹配词条' : '没有找到匹配词条' }}</strong>
      <p>{{ unavailableBookCount || catalog?.indexError ? '已检查当前可用的缓存和本地词条。你可以重试词库加载，或换一个关键词。' : '试试日语原形、常见动词或い形容词活用形，也可以输入假名读音或更短的中文关键词。' }}</p>
      <button v-if="unavailableBookCount || catalog?.indexError" type="button" class="button" :disabled="catalogLoading" @click="retryCatalog"><RotateCcw :size="15" />重试</button>
    </div>
    <div v-if="query.trim() && results.length" class="vocab-search-results-wrap" :aria-busy="catalogLoading" aria-live="polite">
      <div class="vocab-search-results-heading">
        <p class="eyebrow">VOCABULARY RESULTS</p>
        <span>“{{ query.trim() }}” · {{ visibleResults.length }} 个词{{ visibleResults.length === 40 ? '（最多显示 40 个词）' : '' }}</span>
      </div>
      <div class="vocab-search-results">
        <article v-for="{key, entries, entry} in visibleResults" :key="key" class="vocab-search-result">
          <div class="vocab-search-result-main">
            <div class="vocab-search-word-heading">
              <h2 lang="ja">{{ entry.term }}</h2>
              <span lang="ja">{{ entry.reading }}</span>
              <button class="vocab-search-audio" type="button" :disabled="pronunciation.speaking.value" :aria-label="`播放${entry.term}的日语发音`" @click="playEntry(entry)">
                <Volume2 v-if="playingWordId !== entry.id || !pronunciation.speaking.value" :size="16" />
                <LoaderCircle v-else class="spin" :size="16" />
              </button>
            </div>
            <div v-if="entry.inflection" class="vocab-search-inflection" style="margin:6px 0 0;color:#61785d;font-size:11px;line-height:1.65;overflow-wrap:anywhere;word-break:break-word">
              <div><span style="color:#778276">活用匹配候选</span>：{{ entry.inflection.query }} → {{ entry.inflection.baseTerm }}</div>
              <div style="color:#778276">匹配形式 · {{ entry.inflection.formLabel }}</div>
            </div>
            <MeaningPreview class="vocab-search-meaning" :word="entry" />
            <p class="vocab-search-source"><BookOpen :size="13" />{{ entry.bookTitle }}<i>/</i>{{ entry.lessonTitle }}<span>{{ entry.source === 'textbook' ? '内置' : '自定义' }}</span></p>
            <VocabularySourcePicker
              v-if="entries.length > 1"
              :entries="entries"
              :selected-id="entry.id"
              :disabled="app.busy || !!savingWordId || !!openingContextWordId || !!contextFormWordId"
              :disabled-reason="contextFormWordId ? '先保存或取消正在编辑的原句，再切换词书释义。' : ''"
              @select="id => selectSource(key, id)"
            />
            <button type="button" class="vocab-search-compare" :aria-label="`对照${entry.term}的词典释义`" @click="comparisonTarget={term:entry.term,reading:entry.reading,partOfSpeech:entry.partOfSpeech}"><BookOpen :size="14" aria-hidden="true"/>词典对照</button>
          </div>
          <div class="vocab-search-result-action reading-context-actions-column">
            <div v-if="resultState(entry)?.isIgnored" class="vocab-search-ignored" role="group" aria-label="已忽略词条">
              <p role="status">此词已忽略；恢复后才会显示在生词本。</p>
              <button type="button" class="vocab-search-save" :disabled="!!savingWordId || app.busy" @click="saveToDifficult(entry, true)">
                <LoaderCircle v-if="savingWordId === entry.id" class="spin" :size="15" />
                <RotateCcw v-else :size="15" />
                {{ savingWordId === entry.id ? '保存中…' : '恢复并加入生词本' }}
              </button>
              <button type="button" class="vocab-search-context-save" :disabled="!!openingContextWordId || app.busy" @click="openReadingContext(entry, true)">
                <LoaderCircle v-if="openingContextWordId === entry.id" class="spin" :size="15" />
                <Bookmark v-else :size="15" />
                {{ openingContextWordId === entry.id ? '准备中…' : '恢复并收藏原句' }}
              </button>
            </div>
            <template v-else>
              <p v-if="resultState(entry)?.isDifficult" class="vocab-search-saved"><Check :size="15" />已在生词本</p>
              <button
                v-else
                type="button"
                class="vocab-search-save"
                :disabled="!!savingWordId || app.busy"
                @click="saveToDifficult(entry, !!resultState(entry)?.isIgnored)"
              >
                <LoaderCircle v-if="savingWordId === entry.id" class="spin" :size="15" />
                <RotateCcw v-else-if="resultState(entry)?.isIgnored" :size="15" />
                <Bookmark v-else :size="15" />
                {{ savingWordId === entry.id ? '保存中…' : resultState(entry)?.isIgnored ? '恢复并加入生词本' : '加入生词本' }}
              </button>
              <button type="button" class="vocab-search-context-save" :disabled="!!openingContextWordId || app.busy" @click="openReadingContext(entry)">
                <LoaderCircle v-if="openingContextWordId === entry.id" class="spin" :size="15" />
                <Bookmark v-else :size="15" />
                {{ openingContextWordId === entry.id ? '准备中…' : '收藏原句' }}
              </button>
            </template>
          </div>
          <div v-if="contextFormWordId === entry.id" class="vocab-search-context-panel">
            <ReadingContextComposer
              :word="entryWord(entry)"
              :collect-to-difficult="true"
              :restore-ignored="!!resultState(entry)?.isIgnored"
              :initial-matched-text="entry.inflection?.query || entry.term"
              @saved="readingContextSaved"
              @cancel="finishReadingContext"
            />
          </div>
          <div v-if="app.readingContextsForWord(entry.id).length" class="vocab-search-reading-contexts">
            <ReadingContextList :word-id="entry.id" :compact="true" :editable="true" />
          </div>
        </article>
      </div>
    </div>

    <p v-if="actionMessage" class="vocab-search-action-message" role="status"><Check :size="15" />{{ actionMessage }}</p>
    <p v-if="actionError" class="vocab-search-inline-error" role="alert">{{ actionError }}</p>
    <p v-if="pronunciation.error.value" class="vocab-search-inline-error" role="alert">{{ pronunciation.error.value }}</p>
    <DictionaryComparisonPanel :open="!!comparisonTarget" :term="comparisonTarget?.term??''" :reading="comparisonTarget?.reading??''" :part-of-speech="comparisonTarget?.partOfSpeech" @close="comparisonTarget=null" />
  </section>
</template>

<style scoped>
.vocab-search-compare{display:inline-flex;align-items:center;gap:7px;min-height:44px;margin:5px 0 0;padding:6px 0;border:0;background:transparent;color:var(--green);font-size:13px;text-decoration:underline;text-underline-offset:4px;text-decoration-color:var(--line)}.vocab-search-compare:hover{background:transparent;text-decoration-color:var(--green)}.vocab-search-compare:focus-visible{outline:3px solid var(--focus-ring);outline-offset:3px}
.vocab-search-result { flex-wrap: wrap; }
.reading-context-actions-column { flex-direction: column; align-items: flex-end; gap: 8px; }
.vocab-search-context-save { min-height: 44px; padding: 8px 11px; border-color: #d0dfce; background: #fbfcf8; color: #45664b; font-size: 12px; white-space: nowrap; }
.vocab-search-context-panel { flex: 0 0 auto; width: 100%; max-width: 100%; min-width: 0; }
.vocab-search-reading-contexts { flex: 0 0 auto; width: 100%; max-width: 100%; min-width: 0; }
@media (max-width: 760px) {
  .vocab-search-result { flex-wrap: nowrap; }
  .reading-context-actions-column { align-items: flex-start; }
}
</style>
