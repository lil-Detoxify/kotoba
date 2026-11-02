<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BookShare } from '../services/learning-analytics';
const props = defineProps<{ shares: BookShare[]; total: number }>();
const palette = ['#496d52', '#ba8756', '#728da0', '#9380a2', '#b4bb9a'];
const selected = ref<number | null>(null);
watch(() => props.shares, () => { selected.value = null; });
const circumference = 2 * Math.PI * 65;
const segments = computed(() => {
  let offset = 0;
  return props.shares.map((share, i) => {
    const length = props.total ? share.count / props.total * circumference : 0;
    const segment = { ...share, color: palette[i], length, offset };
    offset += length;
    return segment;
  });
});
const active = computed(() => selected.value === null ? undefined : props.shares[selected.value]);
</script>
<template>
  <div v-if="total" class="composition-layout">
    <div class="donut-wrap"><svg viewBox="0 0 180 180" role="img" aria-label="各词书学习词数占比，具体数值见词书列表"><circle cx="90" cy="90" r="65" fill="none" stroke="#e7eadf" stroke-width="19"/><circle v-for="(segment, i) in segments" :key="segment.id" cx="90" cy="90" r="65" fill="none" :stroke="segment.color" :stroke-width="selected === i ? 23 : 19" :stroke-dasharray="`${segment.length} ${circumference - segment.length}`" :stroke-dashoffset="-segment.offset" transform="rotate(-90 90 90)"/><text x="90" y="87" text-anchor="middle" class="donut-number">{{ active?.count ?? total }}</text><text x="90" y="108" text-anchor="middle" class="donut-unit">{{ active ? active.percent + '% 的词汇' : '学习词汇 / 词' }}</text></svg></div>
    <ul class="composition-legend"><li v-for="(share, i) in shares" :key="share.id"><button type="button" :class="{ selected: selected === i }" @mouseenter="selected = i" @mouseleave="selected = null" @focus="selected = i" @blur="selected = null" @click="selected = i"><span class="composition-index" :style="{ borderColor: palette[i] }">{{ i + 1 }}</span><span class="composition-name">{{ share.title }}<small>{{ share.count }} 词</small></span><strong>{{ share.percent }}%</strong></button></li></ul>
  </div>
  <div v-else class="composition-empty"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="#e0e6d7" stroke-width="12" stroke-dasharray="5 4"/></svg><p>这段时间还没有学习记录</p><small>完成一次学习后，就能看到词书分布。</small></div>
</template>
<style scoped>
.composition-layout{display:grid;grid-template-columns:1fr;align-items:center;gap:10px;min-height:239px}.donut-wrap{width:150px;margin:auto}.donut-wrap svg{width:100%;display:block}.donut-number{font:600 28px 'Segoe UI',sans-serif;fill:#324f39}.donut-unit{font-size:10px;fill:#687561}.composition-legend{list-style:none;margin:0;padding:0}.composition-legend li{margin:0}.composition-legend button{display:flex;align-items:center;gap:8px;min-height:44px;width:100%;padding:8px 0;border:0;background:transparent;text-align:left;color:#344b36;border-radius:4px}.composition-legend button:hover,.composition-legend button.selected{background:#edf0e6}.composition-legend button:focus-visible{outline:2px solid #496d52;outline-offset:3px}.composition-index{flex-shrink:0;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;color:#2d422e;background:#fffef8;border:3px solid;font-size:9px}.composition-name{font-size:11px;line-height:1.5;overflow-wrap:anywhere;flex:1;min-width:0}.composition-name small{display:block;font-size:10px;color:#687561;font-weight:400}.composition-legend strong{font-size:12px;font-variant-numeric:tabular-nums;padding-right:3px}.composition-empty{min-height:239px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#677363;text-align:center}.composition-empty svg{width:90px}.composition-empty p{font-size:13px;margin:10px 0 5px}.composition-empty small{font-size:11px}
@media(max-width:1250px){.composition-layout{grid-template-columns:150px minmax(0,1fr)}.donut-wrap{width:100%}}
@media(max-width:760px){.composition-layout{grid-template-columns:130px minmax(0,1fr);min-height:180px}}
@media(max-width:360px){.composition-layout{grid-template-columns:100px minmax(0,1fr);gap:5px}}
</style>
