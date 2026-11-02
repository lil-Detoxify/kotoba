<script setup lang="ts">
import {computed} from 'vue';
import type {Word} from '@jp/models';
import {meaningPresentation} from '../services/meaning-presentation';
const props=defineProps<{word:Pick<Word,'lessonId'|'meaning'>}>();
const presentation=computed(()=>meaningPresentation(props.word));
</script>
<template>
  <div class="meaning-preview">
    <span>{{presentation.summary}}</span>
    <details v-if="presentation.hasMore">
      <summary>其他释义</summary>
      <ul><li v-for="part in presentation.parts" :key="part">{{part}}</li></ul>
    </details>
  </div>
</template>
<style scoped>
.meaning-preview{min-width:0;line-height:1.7;overflow-wrap:anywhere}
.meaning-preview details{margin-top:3px}
.meaning-preview summary{width:fit-content;cursor:pointer;font-size:11px;color:#6b7d63;padding:5px 0;line-height:1.6}
.meaning-preview summary:focus-visible{outline:2px solid var(--green);outline-offset:3px;border-radius:3px}
.meaning-preview ul{margin:7px 0 0;padding-left:17px;font-size:12px;line-height:1.75;color:#5d6e55}
.meaning-preview li{padding:2px 0}
</style>
