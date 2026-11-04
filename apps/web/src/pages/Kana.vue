<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue';
import { ArrowLeft, ArrowRight, Volume2 } from 'lucide-vue-next';
import KanaStrokeOrder from '../components/KanaStrokeOrder.vue';
import { kanaById, kanaMemory, kanaRows, toKatakana, type KanaGroup, type KanaScript } from '../services/kana-study';

withDefaults(defineProps<{ backLabel?: string }>(), { backLabel: '返回词书' });

const audioClips = import.meta.glob<string>('../assets/kana-audio/*.mp3', {
  eager: true, import: 'default', query: '?url&no-inline',
});
const sharedClips: Record<string, string> = { wo: 'o', di: 'ji', du: 'zu' };
const scripts = [{ id: 'hiragana', label: '平假名' }, { id: 'katakana', label: '片假名' }] as const;
const groups = [
  { id: 'basic', label: '清音', hint: '沿着 a、i、u、e、o 的顺序，一行一行练习。末尾是拨音「ん」。' },
  { id: 'voiced', label: '浊音・半浊音', hint: '先认原来的假名，再记右上角的两笔浊点或小圆圈半浊点。' },
  { id: 'combined', label: '拗音', hint: 'い段假名后接小号的 ゃ、ゅ、ょ，合起来读一拍。' },
] as const;
const script = ref<KanaScript>('hiragana');
const group = ref<KanaGroup>('basic');
const selected = ref('a');
const detailHeading = ref<HTMLElement>();
const chart = ref<HTMLElement>();
const entry = computed(() => kanaById.get(selected.value)!);
const rows = computed(() => kanaRows(group.value));
const groupEntries = computed(() => rows.value.flat().filter(row => row !== undefined));
const glyph = computed(() => entry.value[script.value]);
const hint = computed(() => groups.find(option => option.id === group.value)?.hint);
const columns = computed(() => group.value === 'combined' ? ['ya', 'yu', 'yo'] : ['a', 'i', 'u', 'e', 'o']);
const position = computed(() => groupEntries.value.findIndex(row => row.id === selected.value));
const exampleReading = computed(() => script.value === 'hiragana' ? entry.value.reading : toKatakana(entry.value.reading));
const playing = ref(false);
const audioError = ref(false);
let audio: HTMLAudioElement | undefined;

function stopAudio() {
  audio?.pause();
  audio = undefined;
  playing.value = false;
}
function select(id: string) {
  stopAudio();
  audioError.value = false;
  selected.value = id;
}
function chooseScript(id: KanaScript) {
  if (script.value === id) return;
  stopAudio();
  audioError.value = false;
  script.value = id;
}
function chooseGroup(id: KanaGroup) {
  if (group.value === id) return;
  group.value = id;
  select(groupEntries.value[0].id);
}
async function selectFromChart(id: string) {
  select(id);
  if (window.matchMedia('(max-width: 950px)').matches) {
    await nextTick();
    detailHeading.value?.focus({ preventScroll: true });
    detailHeading.value?.scrollIntoView({ block: 'start' });
  }
}
function move(offset: number) {
  const next = groupEntries.value[position.value + offset];
  if (next) select(next.id);
}
function returnToChart() {
  const cell = chart.value?.querySelector<HTMLButtonElement>('.kana-cell[aria-pressed="true"]');
  cell?.focus({ preventScroll: true });
  cell?.scrollIntoView({ block: 'center' });
}
async function pronounce() {
  stopAudio();
  audioError.value = false;
  const id = sharedClips[entry.value.id] ?? entry.value.id;
  const url = audioClips[`../assets/kana-audio/${id}.mp3`];
  if (!url) { audioError.value = true; return; }
  const clip = new Audio(url);
  audio = clip;
  playing.value = true;
  clip.onended = () => { if (audio === clip) stopAudio(); };
  const failed = () => { if (audio === clip) { stopAudio(); audioError.value = true; } };
  clip.onerror = failed;
  try { await clip.play(); } catch { failed(); }
}
onUnmounted(stopAudio);
</script>

<template>
  <RouterLink to="/books" class="back"><ArrowLeft :size="16" aria-hidden="true" /> {{backLabel}}</RouterLink>
  <header class="page-heading kana-heading">
    <div><p class="eyebrow">KANA / かな</p><h1>五十音学习</h1><p class="muted">听读音，看笔顺，再用一个词记住它。</p></div>
    <div class="kana-options" role="group" aria-label="假名类型">
      <button v-for="option in scripts" :key="option.id" type="button" :aria-pressed="script === option.id"
        @click="chooseScript(option.id)">{{ option.label }}</button>
    </div>
  </header>
  <div class="kana-options kana-groups" role="group" aria-label="发音分类">
    <button v-for="option in groups" :key="option.id" type="button" :aria-pressed="group === option.id"
      @click="chooseGroup(option.id)">{{ option.label }}</button>
  </div>
  <div class="kana-layout">
    <section ref="chart" class="kana-panel kana-chart" aria-label="假名表">
      <p class="kana-hint">{{ hint }}</p>
      <div class="kana-grid" :style="{ '--kana-columns': columns.length }">
        <span v-for="column in columns" :key="column" class="kana-column" aria-hidden="true">{{ column }}</span>
        <template v-for="(row, rowIndex) in rows" :key="rowIndex">
          <template v-for="(_, columnIndex) in columns" :key="columnIndex">
            <button v-if="row[columnIndex]" type="button" class="kana-cell"
              :aria-pressed="selected === row[columnIndex]?.id" @click="selectFromChart(row[columnIndex]!.id)">
              <span lang="ja">{{ row[columnIndex]?.[script] }}</span><small>{{ row[columnIndex]?.romaji }}</small>
            </button>
            <span v-else aria-hidden="true"></span>
          </template>
        </template>
      </div>
    </section>
    <section class="kana-panel kana-detail" aria-labelledby="kana-detail-heading">
      <div class="kana-detail-top">
        <h2 id="kana-detail-heading" ref="detailHeading" tabindex="-1"><span lang="ja">{{ glyph }}</span><small>{{ entry.romaji }}</small></h2>
        <button type="button" class="primary kana-audio" :disabled="playing" @click="pronounce">
          <Volume2 :size="18" aria-hidden="true" /> {{ playing ? '播放中' : '听发音' }}
        </button>
      </div>
      <p v-if="audioError" class="error" role="status">音频暂时无法播放，请重试。</p>
      <KanaStrokeOrder :text="glyph" />
      <div class="kana-study-notes">
        <div><h3>例词</h3><p><strong lang="ja">{{ entry.word }}</strong> <span lang="ja">{{ exampleReading }}</span></p><p>{{ entry.meaning }}</p></div>
        <div><h3>记忆方法</h3><p>{{ kanaMemory(entry, script) }}</p></div>
      </div>
      <div class="kana-pagination">
        <button type="button" :disabled="position === 0" @click="move(-1)"><ArrowLeft :size="16" aria-hidden="true" /> 上一个</button>
        <span>{{ position + 1 }} / {{ groupEntries.length }}</span>
        <button type="button" :disabled="position + 1 === groupEntries.length" @click="move(1)">下一个 <ArrowRight :size="16" aria-hidden="true" /></button>
      </div>
      <button type="button" class="kana-back-to-chart" @click="returnToChart">回到假名表</button>
    </section>
  </div>
  <p class="kana-source">笔顺路径取自 <a href="https://github.com/KanjiVG/kanjivg" target="_blank" rel="noopener">KanjiVG</a> · © Ulrich Apel · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a></p>
</template>

<style scoped>
.kana-heading { align-items: end; }
.kana-options { display: flex; flex-wrap: wrap; gap: 8px; }
.kana-options button, .kana-pagination button { min-height: 44px; padding: 8px 13px; }
.kana-options button[aria-pressed="true"], .kana-cell[aria-pressed="true"] {
  background: var(--surface-selected, #edf2e8); border-color: var(--green); color: var(--green);
}
.kana-groups { margin-bottom: 16px; }
.kana-layout { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); align-items: start; gap: 20px; }
.kana-panel { min-width: 0; padding: 20px; border: 1px solid var(--border-soft); border-radius: var(--radius-panel); background: var(--paper); }
.kana-hint { color: var(--muted); margin: 0 0 12px; font-size: 14px; }
.kana-grid { display: grid; grid-template-columns: repeat(var(--kana-columns), minmax(0, 1fr)); gap: 7px; }
.kana-column { text-align: center; color: var(--muted); font-size: 13px; }
.kana-cell { display: grid; place-content: center; gap: 1px; padding: 5px 0; min-height: 52px; min-width: 0; }
.kana-cell span { font-size: clamp(17px, 2vw, 25px); line-height: 1.2; }
.kana-cell small, .kana-detail-top small, .kana-pagination span { color: var(--muted); }
.kana-detail-top { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
.kana-detail-top h2 { display: flex; align-items: baseline; gap: 10px; margin: 0; scroll-margin-top: 15px; }
.kana-detail-top h2 span { font-size: 34px; }
.kana-detail-top small { font-size: 15px; }
.kana-audio { min-height: 44px; white-space: nowrap; }
.kana-study-notes { display: grid; gap: 13px; margin: 15px 0; padding-top: 14px; border-top: 1px solid var(--border-soft); }
.kana-study-notes h3 { font-size: 13px; color: var(--green); margin: 0 0 4px; }
.kana-study-notes p { margin: 0; line-height: 1.6; }
.kana-study-notes p span { color: var(--muted); margin-left: 3px; }
.kana-pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kana-pagination span { font-size: 12px; white-space: nowrap; }
.kana-back-to-chart { display: none; }
.kana-source { color: var(--muted); font-size: 12px; margin-top: 15px; }
.kana-source a { text-decoration: underline; text-underline-offset: 2px; }
@media (max-width: 950px) {
  .kana-layout { grid-template-columns: 1fr; }
  .kana-back-to-chart { display: inline-flex; margin-top: 10px; min-height: 44px; }
}
@media (max-width: 560px) {
  .kana-heading { align-items: start; }
  .kana-panel { padding: 14px; }
  .kana-grid { gap: 5px; }
}
</style>
