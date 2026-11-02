<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { PET_MANIFESTS, resolvePetAnimation } from '../pet/manifest';
import PetSprite from './PetSprite.vue';
import { pet, initializePetRuntime, notifyPet, setPetPosition, setPetVisible } from '../pet/runtime';
import { clampPetPosition, effectiveReducedMotion, petPositionForViewport, petSize } from '../pet/settings';
import type { PetLocalPosition } from '../pet/model';

const route = useRoute();
const viewport = ref({ width: 1280, height: 800 });
const scrolledPastTop = ref(false);
const studyPosition = ref<PetLocalPosition | null>(null);
const manifest = computed(() => PET_MANIFESTS[pet.settings.variant]);
const animation = computed(() => resolvePetAnimation(manifest.value, pet.snapshot.state));
const frameIndex = ref(0);
const frame = computed(() => animation.value.frames[frameIndex.value] ?? animation.value.frames[0]);
const reduced = computed(() => effectiveReducedMotion(pet.settings, pet.systemPrefersReduced));
const isStudy = computed(() => route.path === '/study');
const canDisplay = computed(() => pet.settings.enabled && route.path !== '/settings' &&
  (isStudy.value ? pet.settings.studyVisibility === 'companion' && studyPosition.value !== null :
    viewport.value.width > 760 || !scrolledPastTop.value));
const position = computed(() => isStudy.value ? studyPosition.value ?? { x: 0, y: 0 } : petPositionForViewport(pet.position, viewport.value));
const size = computed(() => petSize(viewport.value));
const stateLabel: Record<string, string> = {
  idle: '今天背词了吗？', sleeping: '在打盹', studying: '一起学习', correct: '轻轻点头',
  wrong: '再想一想', review: '一起复习', streak: '继续保持', complete: '辛苦了',
};

let media: MediaQueryList | undefined;
let frameTimer: ReturnType<typeof setTimeout> | undefined;
let drag: { pointerId: number; startX: number; startY: number; origin: PetLocalPosition; moved: boolean } | null = null;
let lastActivitySent = 0;
let positionFrame = 0;
let studyObserver: MutationObserver | undefined;

function scheduleStudyPosition(): void {
  if (!isStudy.value || positionFrame) return;
  positionFrame = requestAnimationFrame(() => {
    positionFrame = 0;
    const anchor = document.querySelector<HTMLElement>('[data-pet-study-anchor]');
    if (!anchor) { studyPosition.value = null; return; }
    const rect = anchor.getBoundingClientRect();
    studyPosition.value = { x: rect.left, y: rect.top };
  });
}

function onResize(): void {
  viewport.value = { width: window.innerWidth, height: window.innerHeight };
  scheduleStudyPosition();
  if (pet.position?.viewportWidth && (pet.position.viewportWidth <= 760) === (viewport.value.width <= 760)) {
    const clamped = clampPetPosition(pet.position, viewport.value);
    if (clamped.x !== pet.position.x || clamped.y !== pet.position.y) setPetPosition({ ...clamped, viewportWidth: viewport.value.width });
  }
}
function onVisibility(): void { setPetVisible(document.visibilityState === 'visible'); }
function onMotionChange(): void { pet.systemPrefersReduced = !!media?.matches; }
function onScroll(): void { scrolledPastTop.value = window.scrollY > 80; scheduleStudyPosition(); if (isStudy.value) onActivity(); }
function onActivity(): void {
  const now = Date.now();
  if (pet.snapshot.state === 'sleeping' || now - lastActivitySent > 15_000) {
    lastActivitySent = now;
    notifyPet({ type: 'activity' });
  }
}
function scheduleFrame(): void {
  if (frameTimer) clearTimeout(frameTimer);
  frameTimer = undefined;
  if (!canDisplay.value || !pet.visible || reduced.value || animation.value.frames.length < 2) return;
  const delay = Math.max(1000 / Math.max(1, animation.value.fps), frame.value.durationMs);
  frameTimer = setTimeout(() => {
    if (frameIndex.value + 1 < animation.value.frames.length) frameIndex.value++;
    else if (animation.value.loop) frameIndex.value = 0;
    else return;
    scheduleFrame();
  }, delay);
}
watch([animation, reduced, canDisplay, () => pet.visible], () => {
  frameIndex.value = 0;
  scheduleFrame();
}, { immediate: true });
watch(() => route.path, async () => {
  studyPosition.value = null;
  await nextTick();
  scheduleStudyPosition();
});

onMounted(() => {
  initializePetRuntime();
  onResize();
  onScroll();
  onVisibility();
  media = window.matchMedia('(prefers-reduced-motion: reduce)');
  onMotionChange();
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerdown', onActivity);
  document.addEventListener('keydown', onActivity);
  media.addEventListener('change', onMotionChange);
  studyObserver = new MutationObserver(scheduleStudyPosition);
  studyObserver.observe(document.querySelector('main') ?? document.body, { childList: true, subtree: true });
  scheduleStudyPosition();
});
onUnmounted(() => {
  if (frameTimer) clearTimeout(frameTimer);
  if (positionFrame) cancelAnimationFrame(positionFrame);
  studyObserver?.disconnect();
  window.removeEventListener('resize', onResize);
  window.removeEventListener('scroll', onScroll);
  document.removeEventListener('visibilitychange', onVisibility);
  document.removeEventListener('pointerdown', onActivity);
  document.removeEventListener('keydown', onActivity);
  media?.removeEventListener('change', onMotionChange);
  setPetVisible(false);
});

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  if (isStudy.value) return;
  drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: position.value, moved: false };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function onPointerMove(event: PointerEvent): void {
  if (isStudy.value) return;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (Math.hypot(dx, dy) > 5) drag.moved = true;
  if (drag.moved) setPetPosition({ ...clampPetPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy }, viewport.value), viewportWidth: viewport.value.width }, false);
}
function onPointerEnd(event: PointerEvent): void {
  if (isStudy.value) { notifyPet({ type: 'tap' }); return; }
  if (!drag || event.pointerId !== drag.pointerId) return;
  const moved = drag.moved;
  drag = null;
  if (moved) setPetPosition({ ...position.value, viewportWidth: viewport.value.width });
  else notifyPet({ type: 'tap' });
}
function onPointerCancel(): void { drag = null; }
</script>

<template>
  <aside v-if="canDisplay" class="pet-dock" :class="[pet.snapshot.state, pet.settings.variant, { reduced, paused: !pet.visible, 'in-study': isStudy }]"
    :style="{ left: `${position.x}px`, top: `${position.y}px`, width: `${size.width}px`, height: `${size.height}px` }"
    aria-label="叶团猫宠物">
    <button type="button" class="pet-handle" :aria-label="`${manifest.name}，${stateLabel[pet.snapshot.state]}；点击互动${isStudy ? '' : '，拖动改变位置'}`"
      :title="isStudy ? '点击叶团猫互动' : '拖动叶团猫，点击与它互动'" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerEnd" @pointercancel="onPointerCancel">
      <PetSprite class="pet-figure" :frame="frame" :pixel="pet.settings.variant === 'pixel'" />
      <span class="pet-caption" aria-live="polite">{{ stateLabel[pet.snapshot.state] }}</span>
    </button>
  </aside>
</template>

<style scoped>
.pet-dock{position:fixed;z-index:9;pointer-events:none;filter:drop-shadow(0 8px 9px #273c3520)}
.pet-dock.in-study{z-index:3}
.in-study .pet-handle{cursor:pointer}
.pet-handle{pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:100%;height:100%;padding:0;border:0;background:transparent;color:var(--green);gap:0}
.pet-handle:active{cursor:grabbing;transform:none}
.pet-handle:hover{background:transparent}
.pet-figure{display:block;width:100%;max-height:calc(100% - 19px);transform-origin:50% 85%;animation:pet-breathe 3.2s steps(7,end) infinite}
.pet-caption{display:block;min-width:75px;padding:1px 6px;border:1px solid #dfe5db;border-radius:20px;background:#fffefbed;color:#365d49;text-align:center;font-size:10px;line-height:16px;letter-spacing:.04em;white-space:nowrap}
.sleeping .pet-figure{animation:pet-sleep 8s steps(2,end) infinite}
.studying .pet-figure,.review .pet-figure{animation:pet-breathe 2.8s steps(8,end) infinite}
.correct .pet-figure{animation:pet-nod .7s steps(10,end) 2}
.wrong .pet-figure{animation:pet-tilt .7s steps(10,end) 2}
.streak .pet-figure{animation:pet-streak .7s steps(8,end) 2}
.complete .pet-figure{animation:pet-stretch 1.1s steps(10,end) 2}
.reduced .pet-figure,.paused .pet-figure{animation:none!important}
.paused{visibility:hidden}
@keyframes pet-breathe{50%{transform:translateY(-2px) scale(1.015)}}
@keyframes pet-sleep{50%{transform:translateY(1px)}}
@keyframes pet-nod{50%{transform:rotate(-6deg) translateY(-4px)}}
@keyframes pet-tilt{50%{transform:rotate(5deg)}}
@keyframes pet-streak{45%{transform:translateY(-6px) rotate(-3deg)}}
@keyframes pet-stretch{50%{transform:scale(1.035) translateY(-3px)}}
@media(prefers-reduced-motion:reduce){.pet-figure{animation:none!important}}
@media(max-width:760px){.pet-caption{font-size:9px;line-height:14px}.pet-figure{max-height:calc(100% - 16px)}.pet-dock{filter:drop-shadow(0 4px 5px #273c351a)}}
</style>
