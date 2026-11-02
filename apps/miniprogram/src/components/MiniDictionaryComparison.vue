<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { miniDictionary, type DictionaryQuery, type DictionarySourceId, type ComparisonEntry } from '../services/dictionary-comparison';
import { miniDictionaryPreferences as preferences } from '../services/dictionary-preferences';
import { defaultPrivacyConsent } from '../services/privacy-consent';
const props = defineProps<{ open: boolean; query: DictionaryQuery | null }>();
const emit = defineEmits<{ close: [] }>();
interface SourceState { expanded: boolean; loading: boolean; loaded: boolean; entries: ComparisonEntry[]; error: string }
const blank = (): SourceState => ({ expanded: false, loading: false, loaded: false, entries: [], error: '' });
const states = ref<Record<DictionarySourceId, SourceState>>({ tomoshi: blank(), jmdict: blank(), 'wiktionary-ja': blank() });
const consented = ref(true);
const sources = computed(() => preferences.enabledSources.value);
let epoch = 0;
const tickets = new Map<DictionarySourceId, number>();
async function loadSource(id: DictionarySourceId) {
  const query = props.query;
  const state = states.value[id];
  if (!props.open || !query || state.loading) return;
  const currentEpoch = epoch;
  const ticket = (tickets.get(id) ?? 0) + 1;
  tickets.set(id, ticket);
  state.loading = true;
  state.error = '';
  try {
    const entries = await miniDictionary.querySource(id, query);
    if (currentEpoch !== epoch || ticket !== tickets.get(id)) return;
    state.entries = entries;
    state.loaded = true;
  } catch {
    if (currentEpoch !== epoch || ticket !== tickets.get(id)) return;
    state.error = '这个来源暂时无法读取，请稍后重试。';
  } finally { if (currentEpoch === epoch && ticket === tickets.get(id)) state.loading = false; }
}
function toggleSource(id: DictionarySourceId) {
  const state = states.value[id];
  state.expanded = !state.expanded;
  if (state.expanded && !state.loaded) void loadSource(id);
}
function close() { epoch++; emit('close'); }
function openPrivacy() { close(); uni.navigateTo({ url: '/pages/privacy/privacy' }); }
watch(() => [props.open, props.query?.term, props.query?.reading, props.query?.partOfSpeech], async () => {
  const current = ++epoch;
  states.value = { tomoshi: blank(), jmdict: blank(), 'wiktionary-ja': blank() };
  if (!props.open || !props.query) return;
  await preferences.load();
  const allowed = await defaultPrivacyConsent.isConsented();
  if (current !== epoch) return;
  consented.value = allowed;
  if (!allowed) return;
  const preferred = preferences.state.preferences.preferredSource;
  states.value[preferred].expanded = true;
  void loadSource(preferred);
}, { immediate: true });
onUnmounted(() => { epoch++; });
</script>

<template>
  <view v-if="open && query" class="comparison-overlay" @tap="close" @touchmove.stop.prevent>
    <view class="comparison-sheet" role="dialog" aria-label="词典对照" @tap.stop>
      <view class="sheet-header"><view><text class="sheet-kicker">DICTIONARY / 词典对照</text><text class="sheet-term">{{ query.term }}</text><text class="sheet-reading">{{ query.reading }}</text></view><button class="close-button" aria-label="关闭词典对照" @tap="close">关闭</button></view>
      <scroll-view class="sheet-scroll" scroll-y :show-scrollbar="false" @touchmove.stop>
        <view class="sheet-content">
          <view v-if="!consented" class="source-status"><text>同意隐私说明后，可以按需读取在线词典。</text><button class="retry-button" @tap="openPrivacy">查看隐私说明</button></view>
          <template v-else>
            <text class="comparison-note">中文译释与英文原义共享 JMdict 词条，日文解释来自独立的维基词典。</text>
            <view v-for="source in sources" :key="source.id" class="dictionary-source">
              <button class="source-toggle" :aria-label="`${source.name}，${states[source.id].expanded ? '收起' : '展开'}`" @tap="toggleSource(source.id)"><view><text class="source-name">{{ source.name }}</text><text class="source-language">{{ source.language }}</text></view><text class="toggle-mark">{{ states[source.id].expanded ? '－' : '＋' }}</text></button>
              <view v-if="states[source.id].expanded" class="source-body">
                <text class="source-description">{{ source.description }}</text>
                <text v-if="states[source.id].loading" class="source-status">正在读取释义…</text>
                <view v-else-if="states[source.id].error" class="source-status"><text>{{ states[source.id].error }}</text><button class="retry-button" @tap="loadSource(source.id)">重试此来源</button></view>
                <text v-else-if="states[source.id].loaded && !states[source.id].entries.length" class="source-status">这个来源暂未收录对应词条，可查看其他来源。</text>
                <view v-for="entry in states[source.id].entries" :key="entry.id" class="comparison-entry">
                  <text class="entry-term">{{ entry.term }}<text v-if="entry.readings.length" class="entry-reading"> · {{ entry.readings.join('、') }}</text></text>
                  <text v-if="entry.match === 'lemma'" class="match-note">按原形「{{ entry.matchedTerm }}」查阅{{ entry.readingVerified ? '' : ' · 读音未核对' }}</text>
                  <text v-else-if="!entry.readingVerified" class="match-note">按词形匹配，读音尚未核对</text>
                  <text v-if="source.id === 'wiktionary-ja' && entry.readings.length > 1" class="match-note">原词条含多个读音，以下义项按原页保留</text>
                  <view v-for="(sense, index) in entry.senses" :key="index" class="sense-row"><text class="sense-number">{{ index + 1 }}</text><view class="sense-copy"><text v-if="sense.pos" class="sense-pos">{{ sense.pos }}</text><text class="sense-definition" selectable>{{ sense.definition }}</text><text v-for="(example, exampleIndex) in sense.examples || []" :key="exampleIndex" class="sense-example" selectable>{{ example }}</text></view></view>
                  <text v-if="entry.sourceUrl" class="source-link" selectable>{{ entry.sourceUrl }}</text>
                </view>
                <view class="source-credit"><text>{{ source.version }}</text><text class="source-link" selectable>{{ source.attributionUrl }}</text><text class="source-link" selectable>许可：{{ source.licenseUrl }}</text></view>
              </view>
            </view>
          </template>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<style scoped>
.comparison-overlay { position: fixed; z-index: 1500; inset: 0; display: flex; align-items: flex-end; background: rgba(31,50,39,.36); }
.comparison-sheet { display: flex; flex-direction: column; width: 100%; height: 88vh; box-sizing: border-box; border-radius: 32rpx 32rpx 0 0; background: var(--kotoba-paper, #fffefa); color: var(--kotoba-ink, #263c30); overflow: hidden; }
.sheet-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24rpx; padding: 30rpx 30rpx 22rpx; border-bottom: 1rpx solid var(--kotoba-line, #dce5d4); }
.sheet-header > view { flex: 1; min-width: 0; }
.sheet-kicker { display: block; margin-bottom: 12rpx; font-size: 22rpx; color: var(--kotoba-muted, #728273); letter-spacing: 2rpx; }
.sheet-term { font-size: 40rpx; line-height: 1.4; font-weight: 600; word-break: break-all; }
.sheet-reading { display: block; margin-top: 4rpx; color: var(--kotoba-green, #315944); font-size: 25rpx; }
.close-button { flex: none; min-width: 100rpx; min-height: 44px; margin: 0; padding: 12rpx 20rpx; border: 1rpx solid #d0ddc8; border-radius: 14rpx; background: #eef4e8; color: #315944; font-size: 25rpx; }
.sheet-scroll { flex: 1; height: 0; min-height: 0; }
.sheet-content { padding: 24rpx 30rpx calc(44rpx + env(safe-area-inset-bottom)); }
.comparison-note, .source-description { display: block; font-size: 24rpx; line-height: 1.65; color: var(--kotoba-muted, #728273); }
.comparison-note { margin-bottom: 24rpx; }
.dictionary-source { margin-bottom: 20rpx; border: 1rpx solid #d8e3cf; border-radius: 22rpx; overflow: hidden; }
.source-toggle { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; min-height: 96rpx; margin: 0; padding: 24rpx; border-radius: 0; background: #f0f5e9; color: var(--kotoba-ink, #263c30); line-height: 1.4; text-align: left; }
.source-toggle::after { border: 0; }
.source-name { font-size: 29rpx; font-weight: 600; }
.source-language { display: block; margin-top: 4rpx; font-size: 24rpx; color: #55755b; }
.toggle-mark { font-size: 34rpx; color: #315944; }
.source-body { padding: 24rpx; }
.source-status { display: block; padding: 24rpx 0; color: #6a7b6b; font-size: 26rpx; line-height: 1.65; }
.retry-button { min-height: 44px; margin: 18rpx 0 0; border-radius: 14rpx; background: #edf4e7; color: #315944; font-size: 25rpx; }
.comparison-entry { margin-top: 26rpx; padding-top: 20rpx; border-top: 1rpx solid #e1e7da; }
.entry-term { display: block; font-size: 30rpx; font-weight: 600; }
.entry-reading { font-size: 24rpx; color: #607764; font-weight: 400; }
.match-note { display: block; margin-top: 10rpx; color: #826e43; font-size: 23rpx; line-height: 1.5; }
.sense-row { display: flex; align-items: flex-start; gap: 14rpx; padding-top: 22rpx; }
.sense-number { flex: none; width: 30rpx; font-size: 24rpx; line-height: 1.65; color: #729074; }
.sense-copy { flex: 1; min-width: 0; }
.sense-pos { display: block; margin-bottom: 6rpx; font-size: 23rpx; color: #6d836d; }
.sense-definition { display: block; font-size: 28rpx; line-height: 1.7; overflow-wrap: anywhere; }
.sense-example { display: block; margin-top: 14rpx; padding-left: 16rpx; border-left: 3rpx solid #c4d5b7; color: #607764; font-size: 25rpx; line-height: 1.7; overflow-wrap: anywhere; }
.source-credit { margin-top: 30rpx; padding-top: 20rpx; border-top: 1rpx solid #e1e7da; font-size: 22rpx; color: #728273; line-height: 1.6; }
.source-link { display: block; margin-top: 10rpx; font-size: 22rpx; color: #607764; overflow-wrap: anywhere; word-break: break-all; }
</style>
