<script setup lang="ts">
import { computed } from "vue";
import { getStudyMascotAsset, type StudyMascotPose } from "../services/mascot";
import { miniUi } from "../services/ui-preferences";
import { useMiniPageActive } from "../services/page-motion";
const active = useMiniPageActive();

const props = defineProps<{ pose: StudyMascotPose; static?: boolean }>();
const asset = computed(() => getStudyMascotAsset(props.pose));
const accessibilityLabel = computed(() => ({
  studying: "叶团猫正在陪你学习",
  review: "叶团猫正在陪你复习",
  correct: "叶团猫为你答对喝彩",
  wrong: "叶团猫陪你记住这道题",
  complete: "叶团猫庆祝本组学习完成",
})[props.pose]);
</script>

<template>
  <view
    class="study-mascot"
    :class="[`pose-${pose}`, { 'is-static': props.static || !active || !miniUi.state.ready || miniUi.state.mode === 'reduced' || !miniUi.state.foreground }]"
    aria-role="img"
    :aria-label="accessibilityLabel"
  >
    <image
      class="study-mascot-image"
      :src="asset"
      mode="scaleToFill"
    />
  </view>
</template>

<style scoped>
.study-mascot {
  position: relative;
  display: block;
  flex: none;
  width: 100%;
  height: 100%;
  overflow: hidden;
  transform-origin: center bottom;
}
.study-mascot-image { display: block; width: 100%; height: 100%; pointer-events: none; }
.pose-studying { animation: mascot-breathe 3.2s ease-in-out infinite; }
.pose-correct { animation: mascot-bounce 520ms ease-out; }
.pose-wrong { animation: mascot-wiggle 420ms ease-in-out; }
.pose-complete { animation: mascot-celebrate 680ms ease-out; }
.is-static { animation: none !important; transform: none; }
@media (prefers-reduced-motion: reduce) { .study-mascot { animation: none !important; } }
@keyframes mascot-breathe { 50% { transform: translateY(-3rpx); } }
@keyframes mascot-bounce { 45% { transform: translateY(-8rpx) scale(1.04); } }
@keyframes mascot-wiggle { 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
@keyframes mascot-celebrate { 35% { transform: translateY(-10rpx) scale(1.06); } 70% { transform: translateY(2rpx) scale(.98); } }
</style>
