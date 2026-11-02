<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Bookmark, BookOpen, Check, ChevronRight, LoaderCircle, RotateCcw } from 'lucide-vue-next';
import { dictionaryFavoriteId, dictionaryResultKey as resultKey, searchExtensionDictionary, type DictionarySearchResult } from '../dictionary';

const props = defineProps<{ query: string; owner: string; savingKey: string; savedKeys: string[]; savedWordIds: string[] }>();
const emit = defineEmits<{ compare: [result: DictionarySearchResult]; save: [result: DictionarySearchResult] }>();
const results = ref<DictionarySearchResult[]>([]);
const loading = ref(false);
const error = ref('');
const favoriteIds = ref<Record<string, string>>({});
let generation = 0;

function isSaved(result: DictionarySearchResult): boolean {
  return props.savedKeys.includes(resultKey(result)) || props.savedWordIds.includes(favoriteIds.value[resultKey(result)]);
}
async function load() {
  const current = ++generation;
  results.value = [];
  favoriteIds.value = {};
  error.value = '';
  if (!props.query.trim()) { loading.value = false; return; }
  loading.value = true;
  try {
    const entries = await searchExtensionDictionary(props.query);
    if (current !== generation) return;
    const visible = entries.slice(0, 40);
    const identities = await Promise.all(visible.map(async result => [resultKey(result), await dictionaryFavoriteId(result)] as const));
    if (current !== generation) return;
    favoriteIds.value = Object.fromEntries(identities);
    results.value = visible;
  } catch {
    if (current !== generation) return;
    error.value = '通用词典暂时无法读取，离线词库仍可使用。';
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch([() => props.query, () => props.owner], () => { void load(); }, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { generation++; });
</script>

<template>
  <section v-if="query" class="general-dictionary-results" aria-label="通用词典查询">
    <div class="general-dictionary-heading"><div><BookOpen :size="16" aria-hidden="true" /><h3>通用词典</h3></div><span>日语词形与读音 · 联网查阅</span></div>
    <p v-if="loading" class="dictionary-status" role="status"><LoaderCircle class="spin" :size="16" aria-hidden="true" />正在查阅…</p>
    <div v-else-if="error" class="dictionary-status" role="status"><p>{{ error }}</p><button type="button" @click="load"><RotateCcw :size="15" aria-hidden="true" />重试词典</button></div>
    <p v-else-if="!results.length" class="dictionary-status">暂无对应的词形或读音，可以继续使用上方词库结果，或添加自己的词条。</p>
    <article v-for="result in results" :key="resultKey(result)" class="word-card dictionary-result">
      <div class="word-card-top"><h4 lang="ja">{{ result.term }}</h4><span class="source-tag">{{ result.language === 'zh' ? '中文译释' : result.language === 'en' ? '英文原义' : '词典词条' }}</span></div>
      <p class="word-reading" lang="ja">{{ result.reading }}</p>
      <p class="word-meaning">{{ result.meaning || '展开来源查阅详细义项' }}</p>
      <div class="dictionary-result-actions">
        <button type="button" class="dictionary-entry-button" @click="emit('compare', result)"><BookOpen :size="15" aria-hidden="true" />词典对照<ChevronRight :size="15" aria-hidden="true" /></button>
        <button type="button" class="saved-button" :disabled="!!savingKey || isSaved(result) || !result.meaning || !result.reading" @click="emit('save', result)">
          <Check v-if="isSaved(result)" :size="15" aria-hidden="true" /><LoaderCircle v-else-if="savingKey === resultKey(result)" class="spin" :size="15" aria-hidden="true" /><Bookmark v-else :size="15" aria-hidden="true" />{{ isSaved(result) ? '已收好' : '收藏' }}
        </button>
      </div>
      <p class="dictionary-source-note">Tomoshi 中文译释 / JMdict 英文原义</p>
    </article>
  </section>
</template>

<style scoped>
.general-dictionary-results { margin-top: 24px; border-top: 1px solid var(--line-strong); padding-top: 18px; }
.general-dictionary-heading { display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px; color: var(--green); }
.general-dictionary-heading > div { display: flex; align-items: center; gap: 7px; }
.general-dictionary-heading h3 { margin: 0; font-size: 15px; }
.general-dictionary-heading > span, .dictionary-source-note { color: var(--muted); font-size: 11px; line-height: 1.6; }
.dictionary-status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; line-height: 1.7; }
.dictionary-status p { flex-basis: 100%; margin: 0; }
.dictionary-status button { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper); color: var(--green); cursor: pointer; }
.dictionary-result h4 { margin: 0; font: 600 24px/1.5 'Yu Mincho', serif; overflow-wrap: anywhere; }
.dictionary-result-actions { display: flex; gap: 8px; justify-content: space-between; flex-wrap: wrap; }
.dictionary-source-note { margin: 12px 0 0; }
</style>
