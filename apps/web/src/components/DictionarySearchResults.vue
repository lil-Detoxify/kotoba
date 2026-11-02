<script setup lang="ts">
import { computed } from 'vue';
import { Bookmark, BookOpen, Check, ChevronDown, LoaderCircle } from 'lucide-vue-next';
import { partOfSpeechLabel } from '@jp/dictionary';
import type { DictionarySearchResult } from '../services/dictionary-search';
import { dictionaryResultKey } from '../services/dictionary-search';

const props = defineProps<{
  results: DictionarySearchResult[];
  loading: boolean;
  error: string;
  savingResultKey?: string;
  savedResultKeys?: string[];
}>();
const emit = defineEmits<{ save: [result: DictionarySearchResult]; compare: [result: DictionarySearchResult]; retry: [] }>();
const hasChinese = computed(() => props.results.some(result => result.language === 'zh'));
const hasEnglish = computed(() => props.results.some(result => result.language === 'en'));

</script>

<template>
  <section class="dictionary-results" aria-labelledby="dictionary-results-title" :aria-busy="loading">
    <div class="dictionary-results-heading">
      <div>
        <p class="eyebrow">DICTIONARY</p>
        <h2 id="dictionary-results-title">通用词典 <span>JMdict · Tomoshi</span></h2>
      </div>
      <span class="dictionary-results-count">{{ loading ? '查询中…' : `${results.length} 条` }}</span>
    </div>
    <p v-if="loading" class="dictionary-status" role="status"><LoaderCircle class="spin" :size="15" />正在查询通用词典…</p>
    <p v-else-if="error" class="dictionary-status is-error" role="alert">{{ error }}<button type="button" class="dictionary-retry" @click="emit('retry')">重试</button></p>
    <p v-else-if="!results.length" class="dictionary-status">未找到通用词典词条。</p>
    <p v-else-if="!hasChinese && hasEnglish" class="dictionary-language-note">暂无中文释义，显示词典提供的英文释义。</p>
    <div v-if="results.length" class="dictionary-result-list">
      <article v-for="result in results" :key="result.entry.id" class="dictionary-result">
        <div class="dictionary-result-top">
          <div class="dictionary-result-word">
            <h3 lang="ja">{{ result.term }}</h3>
            <span v-if="result.reading" lang="ja">{{ result.reading }}</span>
          </div>
          <div class="dictionary-result-actions"><button type="button" class="dictionary-compare" :aria-label="`对照${result.term}的词典释义`" @click="emit('compare',result)"><BookOpen :size="15" aria-hidden="true"/>词典对照</button><button
            type="button"
            class="dictionary-save"
            :disabled="savingResultKey === dictionaryResultKey(result) || savedResultKeys?.includes(dictionaryResultKey(result)) || result.language === 'empty'"
            @click="emit('save', result)"
          >
            <LoaderCircle v-if="savingResultKey === dictionaryResultKey(result)" class="spin" :size="14" />
            <Check v-else-if="savedResultKeys?.includes(dictionaryResultKey(result))" :size="14" />
            <Bookmark v-else :size="14" />
            {{ savingResultKey === dictionaryResultKey(result) ? '收藏中…' : savedResultKeys?.includes(dictionaryResultKey(result)) ? '已收藏' : result.language === 'empty' ? '暂无释义' : '收藏到个人词库' }}
          </button></div>
        </div>
        <p class="dictionary-result-meaning" :lang="result.language === 'en' ? 'en' : undefined"><small v-if="result.language === 'en'" class="dictionary-language-tag">English</small><small v-else-if="result.language === 'empty'" class="dictionary-language-tag">暂无中英文释义</small>{{ result.meaning }}</p>
        <details v-if="result.entry.senses.length" class="dictionary-senses">
          <summary>更多释义 <span>{{result.entry.senses.length}} 项 <ChevronDown :size="16" aria-hidden="true"/></span></summary>
          <div v-for="(sense, index) in result.entry.senses" :key="index" class="dictionary-sense">
            <span v-if="sense.pos.length" class="dictionary-pos">{{ partOfSpeechLabel(sense.pos) }}</span>
            <p v-if="sense.zh.length" class="sense-zh">{{ sense.zh.join('、') }}</p>
            <p v-if="sense.en.length" class="sense-en" lang="en">{{ sense.en.join(' · ') }}</p>
          </div>
        </details>
        <details v-if="result.entry.japanese.some(definition => definition.texts.length)" class="dictionary-japanese">
          <summary>日文释义 <ChevronDown :size="16" aria-hidden="true"/></summary>
          <div v-for="(definition, index) in result.entry.japanese" :key="index">
            <p v-for="text in definition.texts" :key="text" lang="ja">{{ text }}</p>
            <small>{{ definition.source === 'wiktionary' ? 'Wiktionary' : 'Tomoshi 派生释义' }}</small>
          </div>
        </details>
        <p class="dictionary-attribution">来源：<a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noopener noreferrer">JMdict / EDRDG</a> · <a href="https://github.com/tomoshi-app/tomoshi-dict-data" target="_blank" rel="noopener noreferrer">Tomoshi</a>；上游中文译文及部分日文释义含机器辅助内容。<a href="/dictionary/KOTOBA-NOTICE.md" target="_blank" rel="noopener noreferrer">来源声明</a></p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.dictionary-result-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.dictionary-compare{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:7px 10px;border:1px solid var(--border-soft);border-radius:var(--radius-control);background:transparent;color:var(--green);font-size:13px;white-space:nowrap}.dictionary-compare:focus-visible{outline:3px solid var(--focus-ring);outline-offset:3px}
.dictionary-results{margin:24px 0 0;padding:20px 0;border-top:1px solid var(--border-soft)}
.dictionary-results-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:12px}
.dictionary-results-heading .eyebrow{margin:0 0 4px;color:var(--muted);font-size:10px;letter-spacing:.12em}
.dictionary-results-heading h2{margin:0;color:var(--green);font-size:16px;font-weight:600}
.dictionary-results-heading h2 span{margin-left:8px;color:var(--muted);font-size:10px;font-weight:400}
.dictionary-results-count,.dictionary-language-note{color:var(--muted);font-size:11px}
.dictionary-status{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;line-height:1.7}
.dictionary-status .spin{animation:dictionary-results-spin 1s linear infinite}
@keyframes dictionary-results-spin{to{transform:rotate(360deg)}}
.dictionary-status.is-error{color:#a44d42}
.dictionary-retry{min-height:40px;padding:6px 10px;border:1px solid #ddc8c2;border-radius:var(--radius-control);background:#fffaf8;color:#8f493e;font-size:11px}
.dictionary-result-list{display:grid;gap:12px}
.dictionary-result{padding:15px 16px;border:1px solid var(--border-soft);border-radius:var(--radius-inset);background:var(--surface-muted);min-width:0}
.dictionary-result-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.dictionary-result-word{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}
.dictionary-result-word h3{margin:0;color:var(--green);font-size:20px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}
.dictionary-result-word span{color:var(--muted);font-size:13px}
.dictionary-save{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:7px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-control);background:var(--surface-selected);color:var(--green);font-size:11px;white-space:nowrap}
.dictionary-save:disabled{opacity:.72}
.dictionary-result-meaning{margin:8px 0 0;color:#354e38;font-size:14px;line-height:1.75;overflow-wrap:anywhere}
.dictionary-language-tag{display:inline-block;margin-right:7px;padding:1px 5px;border:1px solid var(--border-soft);border-radius:var(--radius-control);color:var(--muted);font-size:9px;line-height:1.5;vertical-align:1px}
.dictionary-senses{display:grid;gap:6px;margin-top:9px}
.dictionary-sense{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 8px;align-items:baseline}
.dictionary-pos{grid-row:span 2;color:#71806b;font-size:10px}
.dictionary-sense p{margin:0;color:#5b6855;font-size:11px;line-height:1.65;overflow-wrap:anywhere}
.sense-en{color:#65716a!important}
.dictionary-japanese{margin-top:10px;padding-top:8px;border-top:1px solid var(--border-soft)}
.dictionary-japanese summary,.dictionary-expand{color:#537456;font-size:11px;cursor:pointer}
.dictionary-japanese p{margin:7px 0 0;color:#53614f;font-size:12px;line-height:1.7;overflow-wrap:anywhere}
.dictionary-japanese small{display:block;margin-top:4px;color:#8a9282;font-size:10px}
.dictionary-expand{margin-top:9px;padding:4px 0;border:0;background:transparent}
.dictionary-attribution{margin:10px 0 0;color:#92998b;font-size:10px;line-height:1.6}
.dictionary-attribution a{color:#647c60;text-underline-offset:2px}
.dictionary-senses>summary,.dictionary-japanese>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;border-radius:var(--radius-control);color:var(--green);font-size:14px;cursor:pointer;list-style:none}
.dictionary-senses>summary span{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px}
.dictionary-senses>summary::-webkit-details-marker,.dictionary-japanese>summary::-webkit-details-marker{display:none}
.dictionary-senses>summary svg,.dictionary-japanese>summary svg{transition:transform var(--motion-fast) var(--ease-ui)}
.dictionary-senses[open]>summary svg,.dictionary-japanese[open]>summary svg{transform:rotate(180deg)}
.dictionary-senses>summary:focus-visible,.dictionary-japanese>summary:focus-visible{outline:3px solid var(--focus-ring);outline-offset:2px}
.dictionary-save{font-size:13px}.dictionary-language-tag{font-size:12px}.dictionary-retry{min-height:44px;font-size:13px}.dictionary-status{font-size:14px}
.dictionary-sense p{font-size:14px!important}.dictionary-pos{font-size:12px}.dictionary-attribution{font-size:12px}.dictionary-results-count,.dictionary-language-note{font-size:12px}
@media(max-width:560px){.dictionary-result{padding:13px}.dictionary-result-top{align-items:flex-start;flex-direction:column}.dictionary-save{min-height:44px}}
@media(prefers-reduced-motion:reduce){.dictionary-status .spin,.dictionary-senses>summary svg,.dictionary-japanese>summary svg{animation:none;transition:none}}
</style>
