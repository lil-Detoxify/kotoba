<script setup lang="ts">
import markUrl from '../assets/brand/kotobud-mark.svg';
import wordmarkUrl from '../assets/brand/kotobud-wordmark.svg';

withDefaults(defineProps<{ tagline?: boolean }>(), { tagline: true });
</script>

<template>
  <span class="brand-identity">
    <img class="brand-identity-mark" :src="markUrl" alt="" width="40" height="40" aria-hidden="true">
    <span class="brand-identity-copy">
      <img class="brand-identity-wordmark" :src="wordmarkUrl" alt="Kotobud" width="1009" height="195">
      <small v-if="tagline" class="brand-identity-tagline">每天，认识一点日语。</small>
    </span>
  </span>
</template>
