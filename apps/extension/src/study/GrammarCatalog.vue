<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-vue-next';
import { getGrammarBook, loadGrammarProgress } from '../../../web/src/services/grammar';

const props = defineProps<{owner: string}>();
const route = useRoute();
const router = useRouter();
const book = computed(() => getGrammarBook(route.params.id));
const progressRevision = ref(0);
const groups = computed(() => {
  progressRevision.value;
  const lessons = book.value?.lessons ?? [];
  return Array.from({length: Math.ceil(lessons.length / 6)}, (_, index) => ({
    index, lessons: lessons.slice(index * 6, index * 6 + 6).map(lesson => {
      const progress = loadGrammarProgress(lesson, props.owner);
      const answered = Object.keys(progress.session?.answers ?? {}).length;
      return { lesson, status: progress.phase === 'summary' ? '练习完成' : answered ? '继续练习' : progress.understood.length ? '继续学习' : '开始学习' };
    }),
  }));
});
const expanded = computed(() => /^\d+$/.test(String(route.query.group ?? '')) ? Number(route.query.group) : -1);
function toggle(index: number) {
  void router.replace({ path: route.path, query: expanded.value === index ? {} : {group: String(index)} });
}
watch(() => [route.fullPath, props.owner], () => { progressRevision.value++; });
</script>
<template>
  <template v-if="book">
    <RouterLink to="/books" class="back"><ArrowLeft :size="16" aria-hidden="true" /> 基础学习</RouterLink>
    <header class="study-heading"><p class="eyebrow">GRAMMAR / 本册语法</p><h1>标日{{book.label}} · 语法</h1><p class="muted">第 {{book.lessons[0].order}}–{{book.lessons.at(-1)?.order}} 课 · 按课次展开</p></header>
    <section class="grammar-groups" aria-label="本册语法课次">
      <div v-for="group in groups" :key="group.index" class="grammar-group">
        <h2><button type="button" :aria-expanded="expanded === group.index" :aria-controls="`group-${group.index}`" @click="toggle(group.index)"><span>第 {{group.lessons[0].lesson.order}}–{{group.lessons.at(-1)?.lesson.order}} 课</span><ChevronDown :size="18" aria-hidden="true" :class="{expanded:expanded === group.index}" /></button></h2>
        <div v-if="expanded === group.index" :id="`group-${group.index}`">
          <RouterLink v-for="item in group.lessons" :key="item.lesson.order" :to="`/grammar/${book.id}/${item.lesson.order}`" class="grammar-lesson-link"><div><span class="lesson-number">第 {{item.lesson.order}} 课</span><strong lang="ja">{{item.lesson.title}}</strong><small>{{item.lesson.points.length}} 个语法点 · {{item.status}}</small></div><ChevronRight :size="18" aria-hidden="true" /></RouterLink>
        </div>
      </div>
    </section>
    <p class="study-storage-note">进度保存在本机，重练保留首次作答成绩。</p>
  </template>
  <div v-else class="study-message"><h1>这本词书暂未开放语法</h1><RouterLink to="/books">返回基础学习</RouterLink></div>
</template>
