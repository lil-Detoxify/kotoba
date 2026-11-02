<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { BookShare, LearningDay } from "../services/learning-analytics";
import { statisticsPalette as palette } from "../services/statistics-palette";
const props = defineProps<{ kind: "trend" | "donut"; days?: LearningDay[]; shares?: BookShare[]; total?: number }>();
const instance = getCurrentInstance();
const canvasId = `learning-${props.kind}`;
const unavailable = ref(false);
let mounted = false;
let generation = 0;
async function draw() {
  const ticket = ++generation;
  await nextTick();
  if (!mounted) return;
  try {
    uni.createSelectorQuery().in(instance?.proxy).select(".statistics-canvas").boundingClientRect((rect: any) => {
      if (!mounted || ticket !== generation) return;
      if (!rect?.width || !rect?.height) { unavailable.value = true; return; }
      const width = rect.width;
      const height = rect.height;
      const ctx = uni.createCanvasContext(canvasId, instance?.proxy);
      ctx.clearRect(0, 0, width, height);
      ctx.setFontSize(11);
      ctx.setFillStyle(palette.muted);
      if (props.kind === "trend") {
        const days = props.days ?? [];
        const step = Math.max(1, Math.ceil(Math.max(1, ...days.map(day => day.words)) / 4));
        const max = step * 4;
        const left = 28, right = width - 18, top = 16, bottom = height - 30;
        for (let i = 0; i <= 4; i++) {
          const y = bottom - (bottom - top) * i / 4;
          ctx.setStrokeStyle(palette.line);
          ctx.setLineWidth(1);
          ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
          ctx.setTextAlign("left"); ctx.fillText(String(Math.round(max * i / 4)), 0, y + 4);
        }
        const points = days.map((day, i) => ({ x: left + (right - left) * i / Math.max(1, days.length - 1), y: bottom - day.words / max * (bottom - top) }));
        ctx.setStrokeStyle(palette.ink); ctx.setLineWidth(2);
        ctx.beginPath();
        points.forEach((point, i) => { if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); });
        ctx.stroke();
        ctx.setFillStyle(palette.ink);
        for (const point of points) { ctx.beginPath(); ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.setFillStyle(palette.muted);
        for (const i of [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])]) {
          if (!days[i]) continue;
          ctx.setTextAlign(i === 0 ? "left" : i === days.length - 1 ? "right" : "center");
          ctx.fillText(days[i].label, points[i].x, height - 8);
        }
      } else {
        const x = width / 2, y = height / 2, radius = Math.min(width, height) * .34;
        const total = props.total ?? 0;
        ctx.setLineWidth(24); ctx.setStrokeStyle(palette.line);
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
        let angle = -Math.PI / 2;
        for (const [i, share] of (props.shares ?? []).entries()) {
          const end = angle + (total > 0 ? share.count / total * Math.PI * 2 : 0);
          ctx.setStrokeStyle(palette.shares[i % palette.shares.length]);
          ctx.beginPath(); ctx.arc(x, y, radius, angle, end); ctx.stroke(); angle = end;
        }
        ctx.setTextAlign("center"); ctx.setFillStyle(palette.ink); ctx.setFontSize(26);
        ctx.fillText(String(total), x, y + 5);
        ctx.setFontSize(11); ctx.setFillStyle(palette.muted); ctx.fillText("词书内去重词汇", x, y + 28);
      }
      ctx.draw(false, () => { if (mounted && ticket === generation) unavailable.value = false; });
    }).exec();
  } catch { if (mounted && ticket === generation) unavailable.value = true; }
}
onMounted(() => { mounted = true; void draw(); uni.onWindowResize(draw); });
watch(() => [props.days, props.shares, props.total], () => { void draw(); }, { deep: true });
onUnmounted(() => { mounted = false; generation++; uni.offWindowResize(draw); });
</script>
<template>
  <view>
    <canvas :id="canvasId" :canvas-id="canvasId" class="statistics-canvas" :aria-label="kind === 'trend' ? '每天学习词数折线图，下方可查看每日数据' : '词书占比环形图，下方列出词数与百分比'" @error="unavailable = true" />
    <text v-if="unavailable" class="canvas-note">图表暂不可用，数据可在下方查看。</text>
  </view>
</template>
<style scoped>
.statistics-canvas { width: 100%; height: 190px; }
.canvas-note { display: block; font-size: 24rpx; color: var(--kotoba-muted); }
</style>
