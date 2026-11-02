<script setup lang="ts">
import { miniUi } from "../services/ui-preferences";
import { useMiniPageActive } from "../services/page-motion";
const active = useMiniPageActive();
</script>

<template>
  <view class="mini-page" :class="{
    'motion-standard': miniUi.state.ready && miniUi.state.mode === 'standard',
    'motion-reduced': !miniUi.state.ready || miniUi.state.mode === 'reduced',
    'motion-paused': !miniUi.state.foreground || !active,
  }"><slot /></view>
</template>
