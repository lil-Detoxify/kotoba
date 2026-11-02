<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, onUnmounted, shallowRef, watch } from "vue";
import { createMiniEntrance, REST_ENTRANCE } from "../services/mini-motion";
import { useMiniMotionAllowed } from "../services/page-motion";

defineProps<{ kicker: string; title: string; icon: string; description?: string; accent?: boolean }>();
const instance = getCurrentInstance();
const allowed = useMiniMotionAllowed();
const frame = shallowRef({ ...REST_ENTRANCE });
const motion = createMiniEntrance((next) => { frame.value = next; });
const surfaceStyle = computed(() => ({ opacity: .72 + .28 * frame.value.surface, transform: `translateY(${18 * (1 - frame.value.surface)}rpx) scale(${.988 + .012 * frame.value.surface})` }));
let observer: UniApp.IntersectionObserver | undefined;
let seen = false;
let mounted = false;
function reveal() { if (seen) return; seen = true; if (allowed.value) motion.enter(); }
onMounted(() => {
  mounted = true;
  try {
    observer = uni.createIntersectionObserver(instance?.proxy, { thresholds: [0, .05] });
    observer.relativeToViewport({ bottom: -12 }).observe(".mini-panel", (entry) => {
      if (!mounted) return;
      if (entry.intersectionRatio > 0) reveal();
      else motion.stop();
    });
  } catch { observer?.disconnect(); observer = undefined; reveal(); }
});
watch(allowed, (enabled) => { if (!enabled) motion.stop(); });
onUnmounted(() => { mounted = false; observer?.disconnect(); motion.dispose(); });
</script>

<template>
  <view class="card mini-panel" :class="{ 'mini-panel-accent': accent }" :style="surfaceStyle">
    <view class="panel-heading">
      <view class="mini-panel-icon" aria-hidden="true"><image :src="`/static/ui/${icon}.png`" mode="aspectFit" /></view>
      <view class="mini-panel-heading-copy"><text class="panel-topline">{{ kicker }}</text><text class="panel-title">{{ title }}</text><text v-if="description" class="panel-caption">{{ description }}</text></view>
    </view>
    <slot />
  </view>
</template>
