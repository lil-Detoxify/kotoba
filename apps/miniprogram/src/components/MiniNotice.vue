<script setup lang="ts">
withDefaults(defineProps<{ message: string; tone?: "info" | "success" | "error" }>(), { tone: "info" });
</script>

<template>
  <view v-if="message" class="mini-notice" :class="`notice-${tone}`" :aria-label="message">
    <text class="notice-symbol" aria-hidden="true">{{ tone === 'error' ? '!' : tone === 'success' ? '✓' : '·' }}</text>
    <text class="notice-copy">{{ message }}</text>
  </view>
</template>
