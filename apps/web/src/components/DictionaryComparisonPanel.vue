<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRef, useId, watch } from 'vue';
import { BookOpen, ChevronDown, ExternalLink, SlidersHorizontal, X } from 'lucide-vue-next';
import { useApp } from '../store';
import { useDictionaryComparison } from '../composables/useDictionaryComparison';
import type { ComparisonEntry, DictionarySourceId } from '../services/dictionary-comparison';
import { useDictionaryPreferences } from '../services/dictionary-preferences';
import DictionaryPreferences from './DictionaryPreferences.vue';

const props = defineProps<{ open: boolean; term: string; reading: string; partOfSpeech?: string }>();
const emit = defineEmits<{ close: [] }>();
const app = useApp();
const titleId = useId();
const preferencesId = useId();
const panelRoot = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const preferencesOpen = ref(false);
const expandedSources = ref<DictionarySourceId[]>([]);
const kotobankSearchUrl = computed(() => `https://kotobank.jp/search?word=${encodeURIComponent(props.term)}&t=all`);
const { preferences, enabledSources } = useDictionaryPreferences();
const { results, retrySource } = useDictionaryComparison({
  open: toRef(props, 'open'),
  query: computed(() => ({ term: props.term, reading: props.reading, partOfSpeech: props.partOfSpeech })),
  sourceIds: computed(() => enabledSources.value.map(source => source.id)),
  owner: computed(() => app.currentUser?.id ?? null),
});
let previousFocus: HTMLElement | null = null;
let previousOverflow = '';
let overflowLocked = false;

function close(): void { emit('close'); }

function sourceBodyId(id: DictionarySourceId): string { return `${titleId}-${id}`; }

function toggleSource(id: DictionarySourceId): void {
  expandedSources.value = expandedSources.value.includes(id)
    ? expandedSources.value.filter(source => source !== id)
    : [...expandedSources.value, id];
}

function resultSummary(id: DictionarySourceId): string {
  const result = results[id];
  if (result.status === 'loading') return '正在查阅…';
  if (result.status === 'error') return '暂时无法载入，可展开重试';
  if (result.status === 'empty') return '暂未收录对应词条';
  if (result.status === 'ready') return result.entries[0]?.senses[0]?.definition ?? `${result.entries.length} 条匹配`;
  return '等待查阅';
}

function matchingNote(entry: ComparisonEntry): string {
  if (entry.match === 'headword') return '按词形匹配，读音尚未核对';
  if (entry.match === 'lemma') return `原形匹配${entry.matchedTerm ? ` · ${entry.matchedTerm}` : ''}${entry.readingVerified === false ? ' · 读音尚未核对' : ''}`;
  return '词形与读音匹配';
}

function displayedSenses(sourceId: DictionarySourceId, entry: ComparisonEntry): ComparisonEntry['senses'] {
  return sourceId === 'tomoshi' ? entry.senses.filter(sense => sense.language !== 'ja') : entry.senses;
}

function japaneseSupplementSenses(sourceId: DictionarySourceId, entry: ComparisonEntry): ComparisonEntry['senses'] {
  return sourceId === 'tomoshi' ? entry.senses.filter(sense => sense.language === 'ja') : [];
}

function hasChineseTranslation(entry: ComparisonEntry): boolean {
  return entry.senses.some(sense => sense.language === 'zh-CN');
}

function safeExternalUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch { return undefined; }
}

function unlockPage(restoreFocus = true): void {
  if (!overflowLocked) return;
  document.removeEventListener('keydown', handleKeys, true);
  document.body.style.overflow = previousOverflow;
  overflowLocked = false;
  if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  previousFocus = null;
}

function handleKeys(event: KeyboardEvent): void {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== 'Tab' || !panelRoot.value) return;
  const focusable = Array.from(panelRoot.value.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex="0"]',
  )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) { event.preventDefault(); panelRoot.value.focus(); return; }
  if (!panelRoot.value.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

watch(() => props.open, async open => {
  if (!open) { unlockPage(); return; }
  preferencesOpen.value = false;
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  overflowLocked = true;
  document.addEventListener('keydown', handleKeys, true);
  await nextTick();
  if (props.open) closeButton.value?.focus({ preventScroll: true });
}, { immediate: true, flush: 'sync' });

watch([
  () => props.open, () => props.term, () => props.reading, () => app.currentUser?.id ?? null,
], () => {
  expandedSources.value = props.open ? [preferences.value.preferredSource] : [];
  if (props.open) void nextTick(() => {
    const scrollRoot = panelRoot.value?.querySelector<HTMLElement>('.dictionary-comparison-scroll');
    if (scrollRoot) scrollRoot.scrollTop = 0;
  });
}, { immediate: true, flush: 'sync' });

watch(() => preferences.value.preferredSource, id => {
  if (props.open && !expandedSources.value.includes(id)) expandedSources.value = [...expandedSources.value, id];
});
onBeforeUnmount(() => unlockPage());
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dictionary-comparison-overlay" @click.self="close">
      <aside
        ref="panelRoot"
        class="dictionary-comparison-panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @keydown.stop
      >
        <header class="dictionary-comparison-header">
          <span class="dictionary-comparison-heading"><BookOpen :size="19" aria-hidden="true" /><h2 :id="titleId">词典对照</h2></span>
          <button ref="closeButton" type="button" class="dictionary-comparison-close" aria-label="关闭词典对照，返回原页面" @click="close"><X :size="19" aria-hidden="true" /><span>关闭</span></button>
        </header>
        <div class="dictionary-comparison-scroll">
          <div class="dictionary-comparison-query">
            <div>
              <strong lang="ja">{{ term }}</strong>
              <p v-if="reading" lang="ja">{{ reading }}</p>
            </div>
            <button type="button" class="dictionary-comparison-manage" :aria-expanded="preferencesOpen" :aria-controls="preferencesId" @click="preferencesOpen = !preferencesOpen">
              <SlidersHorizontal :size="17" aria-hidden="true" /><span>选择来源</span>
            </button>
          </div>
          <p class="dictionary-comparison-intro">换一种释义视角，把词义看得更清楚。</p>
          <div v-if="preferencesOpen" :id="preferencesId" class="dictionary-comparison-preferences"><DictionaryPreferences compact /></div>

          <section v-for="source in enabledSources" :key="source.id" class="dictionary-comparison-source">
            <h3 class="dictionary-comparison-source-heading">
              <button type="button" :aria-expanded="expandedSources.includes(source.id)" :aria-controls="sourceBodyId(source.id)" @click="toggleSource(source.id)">
                <span class="dictionary-comparison-source-name"><strong>{{ source.name }}</strong><span>{{ source.language }}</span></span>
                <ChevronDown :size="20" :class="{ 'dictionary-comparison-chevron-open': expandedSources.includes(source.id) }" aria-hidden="true" />
              </button>
            </h3>
            <p v-if="!expandedSources.includes(source.id)" class="dictionary-comparison-summary" aria-live="polite">{{ resultSummary(source.id) }}</p>
            <div v-if="expandedSources.includes(source.id)" :id="sourceBodyId(source.id)" class="dictionary-comparison-source-body" :aria-busy="results[source.id].status === 'loading'">
              <p class="dictionary-comparison-source-description">{{ source.description }}</p>
              <div v-if="results[source.id].status === 'loading'" class="dictionary-comparison-loading" role="status">
                <span>正在查阅这个来源…</span><i aria-hidden="true"></i><i aria-hidden="true"></i>
              </div>
              <div v-else-if="results[source.id].status === 'error'" class="dictionary-comparison-state" role="status">
                <p>这个来源暂时无法载入，其他来源仍可继续查阅。</p>
                <button type="button" @click="retrySource(source.id)">重试这个来源</button>
              </div>
              <p v-else-if="results[source.id].status === 'empty'" class="dictionary-comparison-state" role="status">这个来源暂未收录对应词条，可以继续查看其他来源。</p>
              <template v-else-if="results[source.id].status === 'ready'">
                <article v-for="entry in results[source.id].entries" :key="entry.id" class="dictionary-comparison-entry">
                  <div class="dictionary-comparison-entry-heading">
                    <strong lang="ja">{{ entry.term }}</strong>
                    <span>{{ matchingNote(entry) }}</span>
                  </div>
                  <p v-if="entry.readings.length" class="dictionary-comparison-readings" lang="ja">{{ entry.readings.join(' · ') }}</p>
                  <p v-if="source.id === 'wiktionary-ja' && entry.readings.length > 1" class="dictionary-comparison-multiple-readings">原词条含多个读音，以下义项按原页保留。</p>
                  <ol v-if="displayedSenses(source.id, entry).length" class="dictionary-comparison-senses">
                    <li v-for="(sense, index) in displayedSenses(source.id, entry)" :key="index">
                      <span v-if="sense.pos" class="dictionary-comparison-pos">{{ sense.pos }}</span>
                      <p :lang="sense.language ?? (source.id === 'jmdict' ? 'en' : source.id === 'wiktionary-ja' ? 'ja' : 'zh-CN')">{{ sense.definition }}</p>
                      <ul v-if="sense.examples?.length" class="dictionary-comparison-examples" aria-label="用例">
                        <li v-for="(example, exampleIndex) in sense.examples" :key="exampleIndex" lang="ja">{{ example }}</li>
                      </ul>
                    </li>
                  </ol>
                  <p v-else-if="source.id === 'tomoshi' && japaneseSupplementSenses(source.id, entry).length && !hasChineseTranslation(entry)" class="dictionary-comparison-supplement-empty">暂无中文译释，可展开查看日文补充。</p>
                  <details v-if="japaneseSupplementSenses(source.id, entry).length" class="dictionary-comparison-supplement">
                    <summary>日文补充<ChevronDown :size="18" aria-hidden="true" /></summary>
                    <ol class="dictionary-comparison-senses">
                      <li v-for="(sense, index) in japaneseSupplementSenses(source.id, entry)" :key="index">
                        <span v-if="sense.pos" class="dictionary-comparison-pos">{{ sense.pos }}</span>
                        <p :lang="sense.language ?? 'ja'">{{ sense.definition }}</p>
                        <ul v-if="sense.examples?.length" class="dictionary-comparison-examples" aria-label="用例">
                          <li v-for="(example, exampleIndex) in sense.examples" :key="exampleIndex" lang="ja">{{ example }}</li>
                        </ul>
                      </li>
                    </ol>
                  </details>
                  <a v-if="safeExternalUrl(entry.sourceUrl)" :href="safeExternalUrl(entry.sourceUrl)" target="_blank" rel="noopener noreferrer" class="dictionary-comparison-original">查看原词条<ExternalLink :size="14" aria-hidden="true" /></a>
                </article>
              </template>
              <footer class="dictionary-comparison-credit">
                <span>{{ source.version }}</span>
                <a :href="source.attributionUrl" target="_blank" rel="noopener noreferrer">来源<ExternalLink :size="13" aria-hidden="true" /></a>
                <a :href="source.licenseUrl" target="_blank" rel="noopener noreferrer">使用许可<ExternalLink :size="13" aria-hidden="true" /></a>
              </footer>
            </div>
          </section>
          <p class="dictionary-comparison-origin">Tomoshi 中文释义据 JMdict 机器辅助整理，与英文义项同源；日文释义来自维基词典社区。不同来源分别保留原有义项。</p>
          <div class="dictionary-comparison-kotobank">
            <a :href="kotobankSearchUrl" target="_blank" rel="noopener noreferrer" class="dictionary-comparison-original">コトバンク<ExternalLink :size="14" aria-hidden="true" /></a>
            <span>在原网站查看其他辞典</span>
          </div>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.dictionary-comparison-overlay { position: fixed; inset: 0; z-index: 900; display: flex; justify-content: flex-end; background: rgb(22 40 30 / 32%); animation: comparison-scrim var(--motion-fast) ease-out; }
.dictionary-comparison-panel { width: min(620px, 100%); height: 100%; height: 100dvh; min-width: 0; display: flex; flex-direction: column; background: var(--paper); color: inherit; border-left: 1px solid var(--border-soft); border-radius: var(--radius-panel) 0 0 var(--radius-panel); box-shadow: var(--shadow-panel); }
.dictionary-comparison-panel:focus { outline: none; }
.dictionary-comparison-panel { animation: comparison-enter var(--motion-enter) var(--ease-ui); }
@keyframes comparison-scrim { from { opacity: 0; } to { opacity: 1; } }
@keyframes comparison-enter { from { transform: translateX(12px); } to { transform: translateX(0); } }
.dictionary-comparison-header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: max(18px, env(safe-area-inset-top)) 30px 18px; border-bottom: 1px solid var(--border-soft); }
.dictionary-comparison-heading { display: inline-flex; align-items: center; gap: 10px; color: var(--green); min-width: 0; }
.dictionary-comparison-heading h2 { font-size: 18px; margin: 0; }
.dictionary-comparison-close { min-width: 44px; min-height: 44px; padding: 8px 12px; background: transparent; border: 0; font-size: 13px; }
.dictionary-comparison-panel button { transform: none; }
.dictionary-comparison-panel button:not(:disabled):hover { background: var(--surface-muted); border-color: var(--border-strong); }
.dictionary-comparison-panel button:not(:disabled):active { background: var(--surface-selected); transform: none; }
.dictionary-comparison-panel button:focus-visible, .dictionary-comparison-panel a:focus-visible, .dictionary-comparison-panel summary:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 3px; }
.dictionary-comparison-scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; min-height: 0; padding: 28px 30px max(30px, env(safe-area-inset-bottom)); scroll-padding: 16px; }
.dictionary-comparison-query { display: flex; justify-content: space-between; align-items: center; gap: 20px; min-width: 0; }
.dictionary-comparison-query > div { min-width: 0; }
.dictionary-comparison-query strong { display: block; font: 500 34px/1.6 "Yu Mincho", "Noto Serif JP", serif; overflow-wrap: anywhere; }
.dictionary-comparison-query p { color: var(--muted); font-size: 15px; margin: 4px 0 0; overflow-wrap: anywhere; }
.dictionary-comparison-manage { flex: none; min-height: 44px; padding: 8px 11px; background: transparent; font-size: 13px; }
.dictionary-comparison-intro { color: var(--muted); font-size: 14px; line-height: 1.7; margin: 16px 0 22px; }
.dictionary-comparison-preferences { border-top: 1px solid var(--border-soft); padding: 20px 0 24px; }
.dictionary-comparison-source { border-top: 1px solid var(--border-soft); padding: 6px 0 18px; min-width: 0; }
.dictionary-comparison-source-heading { margin: 0; font: inherit; }
.dictionary-comparison-source-heading > button { display: flex; width: 100%; justify-content: space-between; gap: 16px; text-align: left; background: transparent; border: 0; border-radius: var(--radius-control); padding: 13px 0; min-height: 54px; }
.dictionary-comparison-source-name { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; min-width: 0; }
.dictionary-comparison-source-name strong { font-size: 17px; font-weight: 600; }
.dictionary-comparison-source-name > span { color: var(--muted); font-size: 12px; }
.dictionary-comparison-source-heading svg { color: var(--green); transition: transform var(--motion-fast) var(--ease-ui); }
.dictionary-comparison-chevron-open { transform: rotate(180deg); }
.dictionary-comparison-summary { margin: 4px 30px 0 0; color: var(--muted); font-size: 14px; line-height: 1.75; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dictionary-comparison-source-description { font-size: 12px; line-height: 1.7; color: var(--muted); margin: 0 0 16px; }
.dictionary-comparison-loading { display: grid; gap: 12px; padding: 12px 0 20px; color: var(--muted); font-size: 14px; }
.dictionary-comparison-loading i { display: block; width: 100%; height: 12px; background: var(--surface-muted); border-radius: var(--radius-control); }
.dictionary-comparison-loading i:last-child { width: 65%; }
.dictionary-comparison-state { color: var(--muted); font-size: 14px; line-height: 1.8; padding: 8px 0 16px; margin: 0; }
.dictionary-comparison-state p { margin: 0 0 14px; }
.dictionary-comparison-state button { background: transparent; font-size: 13px; }
.dictionary-comparison-entry { padding: 0 0 22px; margin-bottom: 20px; border-bottom: 1px solid var(--border-soft); min-width: 0; }
.dictionary-comparison-entry:last-of-type { border-bottom: 0; margin-bottom: 0; padding-bottom: 10px; }
.dictionary-comparison-entry-heading { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.dictionary-comparison-entry-heading strong { font-size: 18px; font-weight: 600; overflow-wrap: anywhere; }
.dictionary-comparison-entry-heading > span { color: var(--muted); font-size: 12px; line-height: 1.7; }
.dictionary-comparison-readings { color: var(--muted); font-size: 14px; line-height: 1.8; margin: 5px 0 18px; overflow-wrap: anywhere; }
.dictionary-comparison-multiple-readings { color: var(--muted); font-size: 12px; line-height: 1.8; margin: -6px 0 18px; }
.dictionary-comparison-senses { padding-left: 22px; margin: 16px 0 0; }
.dictionary-comparison-senses > li { padding-left: 5px; margin: 0 0 20px; }
.dictionary-comparison-senses > li::marker { color: var(--muted); font-size: 13px; }
.dictionary-comparison-senses > li:last-child { margin-bottom: 0; }
.dictionary-comparison-senses p { font-size: 16px; line-height: 1.85; margin: 5px 0 0; overflow-wrap: anywhere; }
.dictionary-comparison-supplement { margin-top: 16px; border-top: 1px solid var(--border-soft); }
.dictionary-comparison-supplement summary { display: flex; align-items: center; min-height: 44px; cursor: pointer; color: var(--green); font-size: 13px; list-style: none; }
.dictionary-comparison-supplement summary::-webkit-details-marker { display: none; }
.dictionary-comparison-supplement summary > svg { margin-left: auto; color: var(--green); transition: transform var(--motion-fast) var(--ease-ui); }
.dictionary-comparison-supplement[open] summary > svg { transform: rotate(180deg); }
.dictionary-comparison-supplement-empty { color: var(--muted); font-size: 13px; line-height: 1.8; margin: 14px 0 0; }
.dictionary-comparison-pos { display: inline-block; background: var(--surface-selected); color: var(--green); border-radius: var(--radius-control); padding: 2px 7px; font-size: 12px; line-height: 1.7; }
.dictionary-comparison-examples { list-style: none; border-left: 2px solid var(--border-soft); margin: 12px 0 0; padding: 0 0 0 12px; color: var(--muted); }
.dictionary-comparison-examples li { font-size: 15px; line-height: 1.8; margin-bottom: 7px; overflow-wrap: anywhere; }
.dictionary-comparison-original { display: inline-flex; align-items: center; gap: 7px; color: var(--green); font-size: 13px; text-decoration: underline; text-underline-offset: 4px; min-height: 44px; margin-top: 14px; }
.dictionary-comparison-kotobank { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 12px; }
.dictionary-comparison-kotobank .dictionary-comparison-original { margin-top: 8px; }
.dictionary-comparison-kotobank > span { color: var(--muted); font-size: 12px; }
.dictionary-comparison-credit { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 14px; border-top: 1px solid var(--border-soft); margin: 18px 0 0; padding: 12px 0 0; color: var(--muted); font-size: 12px; letter-spacing: 0; }
.dictionary-comparison-credit > span { width: 100%; line-height: 1.7; overflow-wrap: anywhere; }
.dictionary-comparison-credit a { display: inline-flex; align-items: center; gap: 5px; min-height: 44px; text-decoration: underline; text-underline-offset: 3px; }
.dictionary-comparison-origin { margin: 8px 0 0; border-top: 1px solid var(--border-soft); padding-top: 22px; color: var(--muted); font-size: 12px; line-height: 1.8; }
@media (max-width: 620px) {
  .dictionary-comparison-panel { width: 100%; border: 0; border-radius: 0; box-shadow: none; }
  .dictionary-comparison-header { padding-left: 20px; padding-right: 16px; }
  .dictionary-comparison-scroll { padding-left: 20px; padding-right: 20px; }
  .dictionary-comparison-query { gap: 12px; flex-wrap: wrap; }
  .dictionary-comparison-query strong { font-size: 30px; }
  .dictionary-comparison-manage { margin-left: auto; }
  .dictionary-comparison-senses { padding-left: 20px; }
  .dictionary-comparison-senses > li { padding-left: 2px; }
}
@media (prefers-reduced-motion: reduce) {
  .dictionary-comparison-overlay, .dictionary-comparison-panel { animation: none; }
  .dictionary-comparison-source-heading svg { transition: none; }
  .dictionary-comparison-supplement summary > svg { transition: none; }
}
</style>
