<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: "正在读取…" });
</script>

<template>
  <view class="card mini-skeleton" :aria-label="label">
    <view class="skeleton-line skeleton-short" />
    <view class="skeleton-line skeleton-title" />
    <view class="skeleton-line" />
    <text class="skeleton-label">{{ label }}</text>
  </view>
</template>
