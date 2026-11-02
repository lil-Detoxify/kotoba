<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from "vue";
import { createMiniEntrance, REST_ENTRANCE } from "../services/mini-motion";
import { useMiniMotionAllowed } from "../services/page-motion";

withDefaults(defineProps<{ kicker: string; title: string; description: string; featured?: boolean }>(), { featured: false });
const allowed = useMiniMotionAllowed();
const frame = shallowRef({ ...REST_ENTRANCE });
const motion = createMiniEntrance((next) => { frame.value = next; });
let mounted = false;
const surfaceStyle = computed(() => ({ opacity: .7 + .3 * frame.value.surface, transform: `translateY(${14 * (1 - frame.value.surface)}rpx)` }));
const copyStyle = computed(() => ({ opacity: .65 + .35 * frame.value.copy, transform: `translateY(${10 * (1 - frame.value.copy)}rpx)` }));
const descriptionStyle = computed(() => ({ opacity: .65 + .35 * frame.value.description, transform: `translateY(${8 * (1 - frame.value.description)}rpx)` }));
const sealStyle = computed(() => ({ opacity: .6 + .4 * frame.value.seal, transform: `rotate(${frame.value.turn}deg) scale(${.94 + .06 * frame.value.seal})` }));
onMounted(() => { mounted = true; if (allowed.value) motion.enter(true); });
watch(allowed, (enabled) => { if (!mounted) return; if (enabled) motion.enter(true); else motion.stop(); });
onUnmounted(() => { mounted = false; motion.dispose(); });
</script>

<template>
  <view class="mini-heading" :class="{ 'mini-heading-featured': featured }" :style="surfaceStyle">
    <view class="mini-heading-copy">
      <view :style="copyStyle"><text class="mini-kicker">{{ kicker }}</text>
      <view class="mini-title-row"><text class="mini-heading-title">{{ title }}</text><text class="mini-heading-spark" aria-hidden="true">✳</text></view></view>
      <text class="mini-heading-description" :style="descriptionStyle">{{ description }}</text>
    </view>
    <view class="mini-brand-mark" :style="sealStyle" aria-hidden="true"><view class="mini-seal-ring" /><view class="mini-seal-ring mini-seal-inner" /><text class="mini-seal-character">言</text><text class="mini-seal-caption">ことば</text></view>
  </view>
</template>
