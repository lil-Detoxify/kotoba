<script setup lang="ts">
import { computed } from 'vue';
import type { LearningMethod } from '../services/learning-analytics';
const props = defineProps<{ methods: LearningMethod[]; total: number }>();
const maximum = computed(() => Math.max(1, ...props.methods.map(method => method.count)));
</script>
<template>
  <div class="method-total"><strong>{{ total }}</strong><span>次学习评价</span></div>
  <ul class="method-bars" aria-label="按学习方式比较评价次数的条形图">
    <li v-for="method in methods" :key="method.id">
      <div class="method-label"><span>{{ method.title }}</span><strong>{{ method.count }}<small> 次</small></strong></div>
      <div class="method-track" aria-hidden="true"><i :class="'method-' + method.id" :style="{ width: method.count / maximum * 100 + '%' }"></i></div>
    </li>
  </ul>
  <p class="method-summary">{{ total ? '同一个词多次评价，会分别计数。' : '这段时间还没有学习记录，三项均为 0 次。' }}</p>
</template>
<style scoped>
.method-total{display:flex;align-items:baseline;gap:10px;min-height:39px;color:#677363;font-size:12px}.method-total strong{font-size:24px;color:#324f39;font-variant-numeric:tabular-nums}.method-bars{list-style:none;margin:24px 0 0;padding:0;display:grid;gap:25px}.method-label{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:#40543b;margin-bottom:10px}.method-label strong{font-size:15px;font-variant-numeric:tabular-nums}.method-label small{font-size:11px;font-weight:400}.method-track{height:13px;overflow:hidden;border-radius:4px;background:#edf0e7}.method-track i{display:block;height:100%;border-radius:4px}.method-new{background:#496d52}.method-review{background:#ba8756}.method-difficult{background:repeating-linear-gradient(135deg,#728da0,#728da0 5px,#8ea5b5 5px,#8ea5b5 8px)}.method-summary{font-size:11px;line-height:1.65;color:#687561;margin:24px 0 0}
</style>
