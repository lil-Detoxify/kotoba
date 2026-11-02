<script setup lang="ts">
import type { PetFrame } from '../pet/model';

defineProps<{ frame: PetFrame; pixel?: boolean }>();
</script>

<template>
  <span class="pet-sprite" :class="{ pixel }" :style="{
    backgroundImage: `url(${frame.src})`,
    backgroundPosition: 'center',
  }" aria-hidden="true" />
</template>

<style scoped>
.pet-sprite{display:block;flex:none;aspect-ratio:1;background-size:contain;background-repeat:no-repeat}
.pet-sprite.pixel{image-rendering:pixelated}
</style>
