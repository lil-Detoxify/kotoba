<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowRight } from 'lucide-vue-next';
import type { LessonPracticeRecommendation } from '../services/lesson-practice-recommendation';

const props = defineProps<{ recommendation: LessonPracticeRecommendation }>();

const heading = computed(() => props.recommendation.kind === 'scene'
  ? props.recommendation.scene.title
  : `${props.recommendation.verb.term}的活用`);
const description = computed(() => props.recommendation.kind === 'scene'
  ? `这里会用到本轮学过的 ${props.recommendation.words.length} 个词`
  : '试着把刚学过的动词换一种说法');
const linkLabel = computed(() => props.recommendation.kind === 'scene' ? '看看这个场景' : '练习动词活用');
const previewWords = computed(() => props.recommendation.words.slice(0, 3));
const remainingWords = computed(() => Math.max(0, props.recommendation.words.length - previewWords.value.length));
</script>

<template>
  <section class="lesson-practice-suggestion" aria-label="本轮学习推荐">
    <div class="suggestion-copy">
      <p class="suggestion-title">把刚学的词用起来</p>
      <h3 class="suggestion-heading">{{ heading }}</h3>
      <p class="suggestion-description">{{ description }}</p>
      <div class="suggestion-words" aria-label="本轮关联词语">
        <span v-for="word in previewWords" :key="word.id" class="word-chip">
          <span>{{ word.term }}</span>
          <span class="word-reading">{{ word.reading }}</span>
        </span>
        <span v-if="remainingWords" class="word-more">还有 {{ remainingWords }} 个</span>
      </div>
    </div>
    <RouterLink class="suggestion-link" :to="recommendation.href">
      <span>{{ linkLabel }}</span>
      <ArrowRight :size="16" aria-hidden="true" />
    </RouterLink>
  </section>
</template>

<style scoped>
.lesson-practice-suggestion {
  text-align: left;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px 24px;
  margin-top: 14px;
  padding: 20px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-panel);
  background: var(--paper);
  box-shadow: var(--shadow-panel);
}

.suggestion-copy { min-width: 0; }
.suggestion-title {
  margin: 0 0 5px;
  color: var(--green);
  font-size: 13px;
  font-weight: 650;
}
.suggestion-heading {
  margin: 0;
  color: inherit;
  font-size: 17px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.suggestion-description {
  margin: 5px 0 10px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.suggestion-words {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.word-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  max-width: 100%;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 12px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.word-reading { color: var(--muted); }
.word-more {
  align-self: center;
  color: var(--muted);
  font-size: 12px;
}
.suggestion-link {
  display: inline-flex;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-control);
  padding: 8px 12px;
  background: var(--surface-muted);
  color: var(--green);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  text-decoration: none;
  overflow-wrap: anywhere;
  transition: background var(--motion-fast) var(--ease-ui), border-color var(--motion-fast) var(--ease-ui), color var(--motion-fast) var(--ease-ui);
}
.suggestion-link:hover { background: var(--surface-selected); border-color: var(--border-strong); }
.suggestion-link:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }

@media (max-width: 420px) {
  .lesson-practice-suggestion {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding: 16px;
  }
  .suggestion-link { justify-self: start; }
}
</style>
