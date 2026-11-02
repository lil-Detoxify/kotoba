<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { LearningDay } from '../services/learning-analytics';
const props = defineProps<{ days: LearningDay[] }>();
const selected = ref<number | null>(null);
watch(() => props.days, () => { selected.value = null; });
const peak = computed(() => Math.max(4, ...props.days.map(day => day.words)));
const scaleMax = computed(() => Math.ceil(peak.value / 4) * 4);
const points = computed(() => props.days.map((day, i) => ({ ...day, x: 36 + i / Math.max(1, props.days.length - 1) * 274, y: 183 - day.words / scaleMax.value * 151 })));
const path = computed(() => points.value.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' '));
const ticks = computed(() => [0, 1, 2, 3, 4].map(i => ({ value: scaleMax.value / 4 * i, y: 183 - i / 4 * 151 })));
const active = computed(() => points.value[selected.value ?? points.value.length - 1]);
</script>
<template>
  <div class="trend-readout" aria-live="polite"><span>{{ active?.label ?? '今天' }}</span><strong>{{ active?.words ?? 0 }} <small>词</small></strong><span>{{ active?.reviews ?? 0 }} 次评价</span></div>
  <svg class="trend-svg" viewBox="0 0 330 218" role="group" aria-label="每天学习词数折线图，可用 Tab 查看每一天">
    <g v-for="tick in ticks" :key="tick.value"><line x1="36" :y1="tick.y" x2="310" :y2="tick.y" stroke="#dee4d8" stroke-dasharray="3 5"/><text x="26" :y="tick.y + 4" text-anchor="end">{{ tick.value }}</text></g>
    <path :d="path + ' L310,183 L36,183 Z'" fill="#b2c49b" opacity=".18"/>
    <path :d="path" fill="none" stroke="#426847" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <g v-for="(point, i) in points" :key="point.day" tabindex="0" role="button" :aria-label="`${point.label}，学习 ${point.words} 词，评价 ${point.reviews} 次`" @focus="selected = i" @blur="selected = null" @mouseenter="selected = i" @mouseleave="selected = null" @click="selected = i" @keydown.enter="selected = i" @keydown.space.prevent="selected = i">
      <circle :cx="point.x" :cy="point.y" r="12" fill="transparent"/><circle :cx="point.x" :cy="point.y" :r="selected === i ? 5 : 3" fill="#f7f8f4" stroke="#426847" stroke-width="2"/>
      <text v-if="i === 0 || i === points.length - 1 || i === Math.floor((points.length - 1) / 2)" :x="point.x" y="211" text-anchor="middle">{{ point.label }}</text>
    </g>
  </svg>
  <details class="chart-data"><summary>查看每日数据</summary><div class="chart-table-wrap"><table><caption class="sr-only">每天学习词数与评价次数</caption><thead><tr><th>日期</th><th>学习词数</th><th>评价次数</th></tr></thead><tbody><tr v-for="day in days" :key="day.day"><th scope="row">{{ day.day }}</th><td>{{ day.words }}</td><td>{{ day.reviews }}</td></tr></tbody></table></div></details>
</template>
<style scoped>
.trend-readout{display:flex;align-items:baseline;gap:12px;font-size:12px;color:#677363;min-height:39px}.trend-readout strong{font-size:24px;color:#324f39;font-variant-numeric:tabular-nums}.trend-readout small{font-size:12px;font-weight:400}.trend-svg{width:100%;display:block;margin-top:8px;overflow:visible}.trend-svg text{fill:#687561;font-size:12px}.trend-svg g[tabindex]:focus{outline:none}.trend-svg g[tabindex]:focus circle:last-of-type{stroke:#182f1d;stroke-width:4}.chart-data{font-size:11px;margin-top:18px;color:#687561}.chart-data summary{cursor:pointer;min-height:44px;padding:12px 0}.chart-table-wrap{max-height:220px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px 5px;border-bottom:1px solid #e1e5dc;text-align:right}th:first-child{text-align:left}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
