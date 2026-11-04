<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RotateCcw } from 'lucide-vue-next';
import strokeData from '../kana-strokes.json';

const props = defineProps<{ text: string }>();
const source: Record<string, string[]> = strokeData.paths;
const shapes = computed(() => {
  let count = 0;
  return Array.from(props.text, (char, index) => ({
    char, x: index * 97,
    strokes: source[char].map(path => ({ path, order: ++count })),
  }));
});
const strokeCount = computed(() => shapes.value.reduce((total, shape) => total + shape.strokes.length, 0));
const animation = ref(0);
const step = ref<number>();
const paper = ref<HTMLElement>();
const autoplay = ref(false);
const manualPlayback = ref(false);
const reducedMotion = ref(false);
const canAnimate = computed(() => manualPlayback.value || !reducedMotion.value);
let observer: IntersectionObserver | undefined;
let motionPreference: MediaQueryList | undefined;

function measureStroke(element: unknown) {
  if (element instanceof SVGPathElement) {
    // Use measured SVG units rather than normalized pathLength for Safari.
    element.style.setProperty('--stroke-length', String(Math.ceil(element.getTotalLength()) + 1));
  }
}
function waitUntilVisible() {
  autoplay.value = false;
  observer?.disconnect();
  if (observer && paper.value) observer.observe(paper.value);
  else autoplay.value = true;
}
function updateMotionPreference() { reducedMotion.value = motionPreference?.matches ?? false; }
onMounted(() => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  updateMotionPreference();
  motionPreference.addEventListener('change', updateMotionPreference);
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .25)) {
        autoplay.value = true;
        observer?.disconnect();
      }
    }, { threshold: .25 });
  }
  waitUntilVisible();
});
onUnmounted(() => {
  observer?.disconnect();
  motionPreference?.removeEventListener('change', updateMotionPreference);
});
watch(() => props.text, () => {
  step.value = undefined;
  manualPlayback.value = false;
  animation.value++;
  waitUntilVisible();
}, { flush: 'post' });
function replay() {
  manualPlayback.value = true;
  autoplay.value = true;
  step.value = undefined;
  animation.value++;
}
function nextStroke() {
  manualPlayback.value = true;
  step.value = (step.value ?? 0) % strokeCount.value + 1;
  animation.value++;
}
</script>

<template>
  <div class="stroke-panel" :class="{ 'manual-playback': manualPlayback }">
    <div ref="paper" class="stroke-paper">
      <svg :key="animation" :viewBox="`0 0 ${109 + (shapes.length - 1) * 97} 109`" role="img"
        :aria-label="`${text}的笔顺，共 ${strokeCount} 笔`">
        <g v-for="shape in shapes" :key="shape.char" :transform="`translate(${shape.x} 0)`">
          <path d="M54.5 7v95 M7 54.5h95" class="stroke-grid" />
          <path v-for="stroke in shape.strokes" :key="`guide-${stroke.order}`" :d="stroke.path" class="stroke-guide" />
          <path v-for="stroke in shape.strokes" :key="stroke.order" :ref="measureStroke" :d="stroke.path"
            class="stroke-ink" :class="{ drawing: canAnimate && (step === undefined ? autoplay : step === stroke.order), 'step-current': step === stroke.order }"
            :visibility="step === undefined || stroke.order <= step ? 'visible' : 'hidden'"
            :style="{ '--stroke-delay': `${step === undefined ? (stroke.order - 1) * 510 : 0}ms` }" />
        </g>
      </svg>
    </div>
    <div class="stroke-actions">
      <span aria-live="polite">{{ step ? `第 ${step} / ${strokeCount} 笔` : `共 ${strokeCount} 笔` }}</span>
      <button type="button" @click="nextStroke">逐笔看</button>
      <button type="button" @click="replay"><RotateCcw :size="15" aria-hidden="true" /> 重播</button>
    </div>
  </div>
</template>

<style scoped>
.stroke-paper {
  display: grid; place-items: center; height: 190px;
  border: 1px solid var(--border-soft); border-radius: 12px; background: var(--surface-selected, #edf2e8);
}
.stroke-paper svg { display: block; width: auto; height: min(100%, 166px); max-width: 95%; }
.stroke-grid { fill: none; stroke: var(--muted); stroke-opacity: .25; stroke-width: .6; stroke-dasharray: 2 3; }
.stroke-guide, .stroke-ink { fill: none; stroke-width: 4.1; stroke-linecap: round; stroke-linejoin: round; }
.stroke-guide { stroke: var(--green); stroke-opacity: .16; }
.stroke-ink { stroke: var(--green); }
.stroke-ink.drawing { stroke-dasharray: var(--stroke-length) var(--stroke-length); stroke-dashoffset: var(--stroke-length); animation: draw-kana 470ms ease-out var(--stroke-delay) forwards; }
.manual-playback .stroke-ink.drawing { animation: draw-kana 470ms ease-out var(--stroke-delay) forwards !important; }
.stroke-ink.step-current { stroke: #426d33; stroke-width: 5.2; }
.stroke-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 6px; }
.stroke-actions span { margin-right: auto; color: var(--muted); font-size: 13px; }
.stroke-actions button { min-height: 44px; padding: 6px 10px; font-size: 13px; }
@keyframes draw-kana { to { stroke-dashoffset: 0; } }
</style>
