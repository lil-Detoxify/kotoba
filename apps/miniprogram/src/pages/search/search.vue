<script lang="ts">
import { createFriendShare, createTimelineShare } from "../../services/share";
export default {
  onShareAppMessage: createFriendShare,
  onShareTimeline: createTimelineShare,
};
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import type { Data, Word } from "@jp/models";
import MiniPage from "../../components/MiniPage.vue";
import MiniHeader from "../../components/MiniHeader.vue";
import MiniPanel from "../../components/MiniPanel.vue";
import MiniSkeleton from "../../components/MiniSkeleton.vue";
import MiniNotice from "../../components/MiniNotice.vue";
import MiniDictionaryComparison from "../../components/MiniDictionaryComparison.vue";
import MiniMeaningText from "../../components/MiniMeaningText.vue";
import MiniReadingContexts from "../../components/MiniReadingContexts.vue";
import MiniWordAudio from "../../components/MiniWordAudio.vue";
import { collectMiniDictionaryWord } from "../../services/dictionary-personal-word";
import { miniDictionary, type DictionaryQuery, type DictionarySearchResult } from "../../services/dictionary-comparison";
import { useMiniPageActivity } from "../../services/page-motion";
import { defaultRepository } from "../../adapters";
import { defaultTextbooks, textbookCatalog } from "../../services/textbooks";
import { defaultVocabularySearch, loadVocabularySearchHit, type VocabularySearchHit, type VocabularySearchProgress, type VocabularySearchResponse } from "../../services/vocabulary-search";
import { setDifficult, setIgnored } from "../../services/word-flags";
import { defaultPrivacyConsent } from "../../services/privacy-consent";

useMiniPageActivity();

const MAX_QUERY_LENGTH = 80;
const query = ref("");
const loading = ref(false);
const progress = ref<VocabularySearchProgress | null>(null);
const response = ref<VocabularySearchResponse | null>(null);
const error = ref("");
const localDataWarning = ref("");
const feedback = ref("");
const savingWordId = ref("");
const addedIds = ref(new Set<string>());
const dictionaryResults = ref<DictionarySearchResult[]>([]);
const dictionaryLoading = ref(false);
const dictionaryError = ref("");
const dictionaryQueried = ref(false);
const dictionaryNetworkSkipped = ref(false);
const comparisonQuery = ref<DictionaryQuery | null>(null);
const comparisonOpen = ref(false);
const contextWord = ref<Word | null>(null);
const audioVoice = ref<'female' | 'male'>('female');
const collectedResults = ref(new Set<string>());
const failedBookTitles = computed(() => response.value?.failedBookIds.length
  ? response.value.failedBookIds.map(id => textbookCatalog.find(book => book.id === id)?.title ?? id).join("、")
  : "");

let searchEpoch = 0;
let actionEpoch = 0;
let alive = true;
let activeSearchKey: string | undefined;
let lastShownKey: string | undefined;
let interruptedSearch = false;
let interruptedAction = false;

function isCurrentSearch(epoch: number, key: string): boolean {
  return alive && epoch === searchEpoch && defaultRepository.getActiveKey() === key;
}

function isCurrentAction(epoch: number, key: string): boolean {
  return alive && epoch === actionEpoch && defaultRepository.getActiveKey() === key;
}

function onInput(event: unknown) {
  const detail = event && typeof event === "object" ? (event as { detail?: unknown }).detail : undefined;
  const value = detail && typeof detail === "object" ? (detail as { value?: unknown }).value : undefined;
  const next = typeof value === "string" ? value.slice(0, MAX_QUERY_LENGTH) : "";
  if (next === query.value) return;
  query.value = next;
  contextWord.value = null;
  searchEpoch++;
  loading.value = false;
  progress.value = null;
  response.value = null;
  error.value = "";
  feedback.value = "";
  dictionaryResults.value = [];
  dictionaryLoading.value = false;
  dictionaryError.value = "";
  dictionaryQueried.value = false;
  closeComparison();
  if (!next.trim()) localDataWarning.value = "";
}

async function search(value = query.value) {
  const epoch = ++searchEpoch;
  const key = defaultRepository.getActiveKey();
  activeSearchKey = key;
  const rawQuery = value.trim();
  if (!rawQuery) {
    loading.value = false;
    progress.value = null;
    error.value = "请输入日语、假名或中文释义。";
    response.value = null;
    return;
  }
  if (rawQuery.length > MAX_QUERY_LENGTH) {
    loading.value = false;
    progress.value = null;
    error.value = `查词内容最多 ${MAX_QUERY_LENGTH} 个字符。`;
    return;
  }
  query.value = rawQuery;
  error.value = "";
  localDataWarning.value = "";
  feedback.value = "";
  response.value = null;
  loading.value = true;
  dictionaryResults.value = [];
  dictionaryError.value = "";
  dictionaryQueried.value = false;
  dictionaryLoading.value = false;
  closeComparison();
  progress.value = { total: 6, completed: 0, failedBookIds: [] };

  let data: Data;
  try {
    data = await defaultRepository.read(key);
    audioVoice.value = data.userSettings?.preferences?.pronunciationVoice === 'male' ? 'male' : 'female';
    if (!isCurrentSearch(epoch, key)) return;
  } catch {
    if (!isCurrentSearch(epoch, key)) return;
    data = {
      books: [], lessons: [], words: [], states: [], logs: [], seeded: false
    };
    localDataWarning.value = "本地词条暂时无法读取；仍会尝试搜索教材词汇。";
  }

  try {
    const consented = await defaultPrivacyConsent.isConsented();
    if (!isCurrentSearch(epoch, key)) return;
    void searchGeneralDictionary(rawQuery, epoch, key, consented);
    const result = await defaultVocabularySearch.search(rawQuery, data, (next) => {
      if (!isCurrentSearch(epoch, key)) return;
      progress.value = next;
    }, consented);
    if (!isCurrentSearch(epoch, key)) return;
    response.value = result;
    addedIds.value = new Set(result.results.filter(hit => hit.state?.isDifficult && !hit.state.isIgnored).map(hit => hit.id));
  } catch {
    if (!isCurrentSearch(epoch, key)) return;
    error.value = "查词暂时失败，请检查网络后重试。";
  } finally {
    if (isCurrentSearch(epoch, key)) loading.value = false;
  }
}

function submitSearch() { void search(); }

async function searchGeneralDictionary(rawQuery: string, epoch: number, key: string, consented: boolean) {
  dictionaryQueried.value = true;
  dictionaryNetworkSkipped.value = !consented;
  if (!consented) return;
  dictionaryLoading.value = true;
  try {
    const results = await miniDictionary.search(rawQuery);
    if (isCurrentSearch(epoch, key)) dictionaryResults.value = results;
  } catch {
    if (isCurrentSearch(epoch, key)) dictionaryError.value = "通用词典暂时无法读取，教材结果仍可查阅。";
  } finally { if (isCurrentSearch(epoch, key)) dictionaryLoading.value = false; }
}
function openComparison(word: DictionaryQuery) {
  comparisonQuery.value = { term: word.term, reading: word.reading, partOfSpeech: word.partOfSpeech };
  comparisonOpen.value = true;
}
function closeComparison() { comparisonOpen.value = false; comparisonQuery.value = null; }

function confirmRestoreIgnored(): Promise<boolean> {
  return new Promise(resolve => {
    uni.showModal({
      title: "恢复这个词？",
      content: "这个词当前已被忽略。恢复后会重新参加学习，并加入生词本。",
      confirmText: "恢复并加入",
      cancelText: "先不恢复",
      success: result => resolve(Boolean(result.confirm)),
      fail: () => resolve(false)
    });
  });
}

function openPrivacyNotice() {
  uni.navigateTo({ url: "/pages/privacy/privacy" });
}

async function addToDifficult(hit: VocabularySearchHit) {
  if (savingWordId.value) return;
  const epoch = ++actionEpoch;
  const key = defaultRepository.getActiveKey();
  savingWordId.value = hit.id;
  feedback.value = "";
  error.value = "";
  try {
    const loaded = await loadVocabularySearchHit(hit, key, { repository: defaultRepository, textbooks: defaultTextbooks });
    if (!isCurrentAction(epoch, key)) return;
    const currentState = loaded.states.find(state => state.wordId === hit.id);
    if (currentState?.isIgnored) {
      const confirmed = await confirmRestoreIgnored();
      if (!isCurrentAction(epoch, key)) return;
      if (!confirmed) return;
      const restored = await setIgnored(hit.id, false, defaultRepository);
      if (!isCurrentAction(epoch, key)) return;
      updateHitState(hit.id, restored.states.find(state => state.wordId === hit.id));
    }
    if (defaultRepository.getActiveKey() !== key) return;
    const updated = await setDifficult(hit.id, true, defaultRepository);
    if (!isCurrentAction(epoch, key)) return;
    updateHitState(hit.id, updated.states.find(state => state.wordId === hit.id));
    addedIds.value = new Set(addedIds.value).add(hit.id);
    feedback.value = "已加入生词本，原有学习记录保持不变。";
  } catch {
    if (isCurrentAction(epoch, key)) error.value = "加入生词本失败，请确认词书可读取后重试。";
  } finally {
    if (isCurrentAction(epoch, key)) savingWordId.value = "";
  }
}

function updateHitState(wordId: string, state: VocabularySearchHit["state"]): void {
  const current = response.value;
  if (!current || !state) return;
  response.value = {
    ...current,
    results: current.results.map(hit => hit.id === wordId ? { ...hit, state } : hit)
  };
}

async function openContexts(hit: VocabularySearchHit) {
  if (savingWordId.value) return;
  if (contextWord.value?.id === hit.id) { contextWord.value = null; return; }
  const epoch = ++actionEpoch, key = defaultRepository.getActiveKey();
  savingWordId.value = hit.id;
  try {
    const loaded = await loadVocabularySearchHit(hit, key, { repository: defaultRepository, textbooks: defaultTextbooks });
    if (isCurrentAction(epoch, key)) contextWord.value = loaded.words.find(word => word.id === hit.id) || null;
  } catch { if (isCurrentAction(epoch, key)) error.value = "原句暂时无法打开，请重试。"; }
  finally { if (isCurrentAction(epoch, key)) savingWordId.value = ""; }
}
async function collectResult(result: DictionarySearchResult) {
  if (savingWordId.value || result.language === 'empty') return;
  const epoch = ++actionEpoch, key = defaultRepository.getActiveKey();
  savingWordId.value = result.id;
  try {
    await collectMiniDictionaryWord(result);
    if (isCurrentAction(epoch, key)) { collectedResults.value = new Set(collectedResults.value).add(`${result.id}:${result.term}:${result.reading}`); feedback.value = '已收藏到“我的查词词书”，可在词书中学习。'; }
  } catch (cause) { if (isCurrentAction(epoch, key)) error.value = cause instanceof Error ? cause.message : '收藏失败，请重试。'; }
  finally { if (isCurrentAction(epoch, key)) savingWordId.value = ''; }
}

function resultButtonLabel(hit: VocabularySearchHit): string {
  if (addedIds.value.has(hit.id) || (hit.state?.isDifficult && !hit.state.isIgnored)) return "已在生词本";
  if (hit.state?.isIgnored) return "恢复并加入生词本";
  return "加入生词本";
}

function submitFromInput(event: unknown) {
  onInput(event);
  submitSearch();
}

onLoad(options => {
  let initial = options?.q;
  if (typeof initial === "string") {
    // Native routes can retain the escaping applied by navigateTo; H5 may
    // already decode it. Decode once before applying the text length limit.
    try { initial = decodeURIComponent(initial); } catch { /* Keep literal or malformed percent text. */ }
    query.value = initial.slice(0, MAX_QUERY_LENGTH);
    if (query.value.trim()) void search(query.value);
  }
});

onShow(() => {
  const key = defaultRepository.getActiveKey();
  if (lastShownKey !== undefined && key !== lastShownKey) {
    searchEpoch++;
    actionEpoch++;
    loading.value = false;
    savingWordId.value = "";
    response.value = null;
    dictionaryResults.value = [];
    dictionaryLoading.value = false;
    dictionaryQueried.value = false;
    closeComparison();
    addedIds.value = new Set();
    collectedResults.value = new Set();
    error.value = "";
    feedback.value = "";
    activeSearchKey = key;
    if (query.value.trim()) void search(query.value);
  } else if (interruptedSearch || interruptedAction || response.value?.networkSkipped) {
    interruptedSearch = false;
    interruptedAction = false;
    if (query.value.trim()) void search(query.value);
  }
  lastShownKey = key;
});

onHide(() => {
  contextWord.value = null;
  interruptedSearch = loading.value || dictionaryLoading.value;
  interruptedAction = Boolean(savingWordId.value);
  searchEpoch++;
  actionEpoch++;
  loading.value = false;
  progress.value = null;
  savingWordId.value = "";
  dictionaryLoading.value = false;
  closeComparison();
  feedback.value = "";
});

onUnload(() => {
  alive = false;
  closeComparison();
  searchEpoch++;
  actionEpoch++;
});
</script>

<template>
  <MiniPage class="search-page">
    <MiniHeader kicker="DICTIONARY / 即时查词" title="查一查日语词汇" description="从教材词汇到通用词典，结合中、英、日文解释理解一个词。" />

    <MiniPanel icon="data" kicker="01 / VOCABULARY" title="搜索词条" description="支持日语汉字、假名、读音与中文释义。最多 80 个字符。">
      <view class="search-row">
        <input
          class="search-input"
          :value="query"
          maxlength="80"
          confirm-type="search"
          placeholder="例如：日本人、にほんじん、日本人"
          placeholder-class="search-placeholder"
          aria-label="输入日语词汇或中文释义"
          @input="onInput"
          @confirm="submitFromInput"
        />
        <button class="primary-btn search-submit" :disabled="loading" @tap="submitSearch">查词</button>
      </view>
      <text class="query-count">{{ query.length }} / 80</text>
      <text v-if="loading" class="load-progress">正在准备教材词汇 {{ progress?.completed || 0 }} / {{ progress?.total || 6 }}…</text>
    </MiniPanel>

    <MiniSkeleton v-if="loading" label="正在搜索教材和本机词书…" />
    <view v-if="error" class="card status-card error-card" role="alert">
      <text>{{ error }}</text>
      <button v-if="query.trim()" class="secondary-btn retry-btn" @tap="submitSearch">重新查询</button>
    </view>
    <MiniNotice v-if="feedback" :message="feedback" tone="success" />
    <MiniNotice v-if="localDataWarning" :message="localDataWarning" tone="info" />

    <view v-if="response" class="results-section">
      <view v-if="response.networkSkipped" class="card network-note" role="status">
        <text class="note-title">仅搜索本机词汇</text>
        <text>尚未同意隐私说明，本次没有请求在线教材；可以前往隐私说明页查看并选择。</text>
        <button class="secondary-btn retry-btn" @tap="openPrivacyNotice">查看隐私说明</button>
      </view>
      <view v-else-if="response.status === 'local-only'" class="card network-note" role="status">
        <text class="note-title">教材暂时离线</text>
        <text>目前只显示本机已保存或自定义词书中的匹配结果。</text>
      </view>
      <view v-else-if="response.status === 'partial'" class="card network-note" role="status">
        <text class="note-title">部分教材暂不可用</text>
        <text>已搜索可用词书；失败词书：{{ failedBookTitles }}。可以重试缺失部分。</text>
        <button class="secondary-btn retry-btn" :disabled="loading" @tap="submitSearch">重试</button>
      </view>

      <view class="results-heading">
        <text class="results-count">教材与词书 · {{ response.results.length }} 条</text>
        <text class="results-caption">按匹配程度与课本顺序排列</text>
      </view>
      <view v-if="!response.results.length" class="card empty-results">
        <text class="empty-title">没有找到匹配词条</text>
        <text class="empty-copy">试试汉字、平假名、片假名或更短的中文释义。</text>
      </view>

      <view v-for="hit in response.results" :key="hit.id" class="card result-card motion-enter" :class="{ 'context-open': contextWord?.id === hit.id }">
        <view class="result-copy">
          <text class="result-term">{{ hit.word.term }}</text>
          <text class="result-reading">{{ hit.word.reading }}</text>
          <MiniMeaningText class="result-meaning" :word="hit.word" />
          <view class="source-row">
            <text class="source-book">{{ hit.bookTitle }}</text>
            <text class="source-divider">·</text>
            <text>{{ hit.lessonTitle }}</text>
            <text class="source-kind">{{ hit.source === 'textbook' ? '教材' : '本机自定义' }}</text>
          </view>
          <text v-if="hit.state?.isIgnored && !addedIds.has(hit.id)" class="word-state ignored-state">已忽略</text>
          <text v-else-if="hit.state?.isDifficult || addedIds.has(hit.id)" class="word-state saved-state">已在生词本</text>
        </view>
        <view class="result-actions"><button class="secondary-btn compare-word-btn" @tap="openComparison(hit.word)">词典对照</button><button class="secondary-btn compare-word-btn" :disabled="!!savingWordId" @tap="openContexts(hit)">{{ contextWord?.id === hit.id ? '收起原句' : '我的原句' }}</button><button
          class="secondary-btn add-word-btn"
          :loading="savingWordId === hit.id"
          :disabled="!!savingWordId || addedIds.has(hit.id) || (hit.state?.isDifficult && !hit.state.isIgnored)"
          @tap="addToDifficult(hit)"
        >{{ resultButtonLabel(hit) }}</button></view>
        <MiniWordAudio :word="hit.word" :voice="audioVoice" />
        <MiniReadingContexts v-if="contextWord?.id === hit.id" :word="contextWord" />
      </view>
    </view>

    <view v-if="dictionaryQueried && !dictionaryNetworkSkipped" class="results-section">
      <view class="results-heading"><text class="results-count">通用词典 · {{ dictionaryResults.length }} 条</text><text class="results-caption">Tomoshi / JMdict</text></view>
      <MiniSkeleton v-if="dictionaryLoading" label="正在查询通用词典…" />
      <view v-else-if="dictionaryError" class="card status-card"><text>{{ dictionaryError }}</text><button class="secondary-btn retry-btn" @tap="searchGeneralDictionary(query, searchEpoch, defaultRepository.getActiveKey(), true)">重试通用词典</button></view>
      <view v-else-if="!dictionaryResults.length" class="card empty-results"><text class="empty-title">通用词典暂未找到匹配</text><text class="empty-copy">使用日语汉字或假名查询，中文释义可在上方教材结果中查找。</text></view>
      <view v-for="result in dictionaryResults" :key="result.id" class="card result-card">
        <view class="result-copy"><text class="result-term">{{ result.term }}</text><text class="result-reading">{{ result.reading }}</text><text class="result-meaning">{{ result.meaning || '展开词典，查看对应义项' }}</text><text class="source-row">{{ result.partOfSpeech }} · {{ result.language === 'en' ? '英文原义' : '中文译释' }}</text></view>
        <view class="result-actions"><button class="secondary-btn compare-word-btn" @tap="openComparison(result)">词典对照</button><button class="secondary-btn compare-word-btn" :disabled="!!savingWordId || result.language === 'empty' || collectedResults.has(`${result.id}:${result.term}:${result.reading}`)" @tap="collectResult(result)">{{ collectedResults.has(`${result.id}:${result.term}:${result.reading}`) ? '已收藏' : '收藏到个人词库' }}</button><MiniWordAudio :word="result" :voice="audioVoice" /></view>
      </view>
    </view>

    <view v-if="!response && !loading && !error && !dictionaryQueried" class="card search-hint">
      <text>输入词语后按键盘确认，或点击“查词”。</text>
      <text class="hint-detail">教材释义支持中文检索；通用词典支持日语汉字与假名。</text>
    </view>
    <MiniDictionaryComparison :open="comparisonOpen" :query="comparisonQuery" @close="closeComparison" />
  </MiniPage>
</template>

<style scoped>
.result-card.context-open { flex-wrap: wrap; }.context-open > .reading-contexts { flex-basis: 100%; }
.result-card { flex-wrap: wrap; }.result-card > .word-audio { flex-basis: 100%; }
.search-page { padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
.search-row { display: flex; align-items: stretch; gap: 14rpx; margin-top: 10rpx; }
.search-input { flex: 1; min-width: 0; height: 88rpx; box-sizing: border-box; padding: 0 24rpx; border: 1rpx solid #d8e3d2; border-radius: 18rpx; background: #fffefa; color: var(--kotoba-ink); font-size: 28rpx; }
.search-placeholder { color: #89968b; font-size: 25rpx; }
.search-submit { width: 148rpx; min-height: 88rpx; margin: 0; padding: 0 18rpx; }
.query-count { display: block; margin-top: 10rpx; text-align: right; color: var(--kotoba-muted); font-size: 22rpx; }
.load-progress { display: block; margin-top: 12rpx; color: var(--kotoba-green); font-size: 24rpx; }
.status-card, .network-note, .empty-results, .search-hint { padding: 30rpx; border: 1rpx solid var(--kotoba-line); border-radius: 22rpx; background: var(--kotoba-paper); color: var(--kotoba-muted); font-size: 26rpx; line-height: 1.65; }
.error-card { color: #8d4b3d; }
.retry-btn { display: block; min-height: 76rpx; margin: 18rpx 0 0; padding: 0 20rpx; font-size: 24rpx; }
.note-title, .empty-title { display: block; margin-bottom: 6rpx; color: var(--kotoba-ink); font-size: 28rpx; font-weight: 700; }
.results-section { margin-top: 24rpx; }
.network-note { margin-bottom: 18rpx; border-color: #e6ddc1; background: #fbf7e9; }
.results-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; margin: 28rpx 4rpx 16rpx; }
.results-count { color: var(--kotoba-ink); font-size: 30rpx; font-weight: 700; }
.results-caption { color: var(--kotoba-muted); font-size: 22rpx; }
.empty-results { text-align: center; }
.empty-copy { display: block; }
.result-card { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; margin-bottom: 16rpx; padding: 26rpx; border-radius: 24rpx 8rpx 24rpx 24rpx; border-left: 5rpx solid #a6bd96; }
.result-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8rpx; overflow-wrap: anywhere; }
.result-term { color: var(--kotoba-ink); font-size: 38rpx; font-weight: 700; line-height: 1.3; }
.result-reading { color: var(--kotoba-green); font-size: 25rpx; }
.result-meaning { color: var(--kotoba-muted); font-size: 27rpx; line-height: 1.55; }
.source-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7rpx; color: var(--kotoba-muted); font-size: 21rpx; }
.source-book { color: var(--kotoba-ink); }
.source-kind { margin-left: 4rpx; padding: 4rpx 9rpx; border-radius: 8rpx; background: #edf3e8; color: var(--kotoba-green); }
.word-state { font-size: 21rpx; }
.ignored-state { color: #8b6b35; }
.saved-state { color: var(--kotoba-green); }
.add-word-btn { flex-shrink: 0; width: 160rpx; min-height: 76rpx; margin: 0; padding: 8rpx 14rpx; border-radius: 14rpx; background: #f2f6ed; font-size: 22rpx; line-height: 1.35; }
.result-actions { display: flex; flex: none; flex-direction: column; gap: 16rpx; }
.compare-word-btn { flex: none; width: 160rpx; min-height: 44px; margin: 0; padding: 12rpx 14rpx; border: 1rpx solid #c5d8b8; border-radius: 14rpx; background: #eaf3e2; color: var(--kotoba-green); font-size: 24rpx; }
.search-hint { display: flex; flex-direction: column; gap: 10rpx; margin-top: 22rpx; }
.hint-detail { color: var(--kotoba-muted); font-size: 23rpx; }
@media (max-width: 360px) {
  .search-submit { width: 126rpx; }
  .result-card { align-items: stretch; flex-direction: column; }
  .add-word-btn { width: 100%; }
  .compare-word-btn { width: 100%; }
  .results-heading { align-items: flex-start; flex-direction: column; gap: 4rpx; }
}
</style>
