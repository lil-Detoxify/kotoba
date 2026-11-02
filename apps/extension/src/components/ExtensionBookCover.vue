<script setup lang="ts">
import { computed } from 'vue';
import type { ExtensionBook } from '../model';
import { bookPresentation } from '../book-presentation';
const props = defineProps<{ book: ExtensionBook }>();
const cover = computed(() => bookPresentation(props.book));
</script>
<template>
  <div class="extension-book-cover" :class="['cover-' + cover.scene, { 'cover-exam': cover.exam }]" aria-hidden="true">
    <div class="cover-spine" />
    <div class="cover-type"><span>{{ cover.series }}</span><strong>{{ cover.volume }}</strong></div>
    <img class="cover-art" :src="`./covers/${cover.scene}.png`" alt="" width="480" height="410" loading="lazy" />
    <div class="cover-imprint">日本語を、少しずつ。</div>
    <div class="cover-pages" />
  </div>
</template>
<style scoped>
.extension-book-cover { --cover-bg: #e8e9cd; --cover-ink: #324f3c; position: relative; flex: none; width: 72px; height: 94px; overflow: hidden; color: var(--cover-ink); background: var(--cover-bg); border-radius: 2px 6px 6px 2px; box-shadow: 3px 4px 0 -1px #c7c5b8; transform-origin: 50% 85%; transition: transform 180ms ease; }
.cover-train { --cover-bg: #dbe6e9; --cover-ink: #264956; }.cover-cafe { --cover-bg: #e5dfcb; --cover-ink: #554636; }.cover-bridge { --cover-bg: #dfdfe9; --cover-ink: #46466a; }.cover-table { --cover-bg: #eadccc; --cover-ink: #64412f; }.cover-museum { --cover-bg: #d9e4df; --cover-ink: #2e4e49; }.cover-garden { --cover-bg: #e4e6d1; --cover-ink: #3d5238; }
.cover-spine { position: absolute; z-index: 2; inset: 0 auto 0 0; width: 5px; background: #26352c15; border-right: 1px solid #ffffff66; }.cover-type { position: relative; z-index: 1; padding: 7px 5px 0 10px; }.cover-type span { display: block; font-size: 6px; line-height: 1.4; }.cover-type strong { display: block; margin: 4px 0; font-family: serif; font-size: 12px; line-height: 1.3; overflow-wrap: anywhere; }.cover-exam strong { font: 600 26px/1 Georgia, serif; }
.cover-art { position: absolute; left: 0; bottom: 10px; width: 100%; height: 47px; object-fit: contain; }.cover-exam .cover-art { height: 40px; }.cover-imprint { position: absolute; bottom: 6px; left: 10px; font-size: 5px; }.cover-pages { position: absolute; bottom: 2px; right: 3px; left: 5px; height: 2px; background: #faf8ef; }
@media (prefers-reduced-motion: reduce) { .extension-book-cover { transition: none; } }
</style>
