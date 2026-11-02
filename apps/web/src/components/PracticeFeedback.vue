<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { ArrowRight, RotateCcw } from 'lucide-vue-next';
import type { QuizType } from '@jp/models';
import { practiceFeedback } from '../services/practice-feedback';
import { useApp } from '../store';
import { useRouter } from 'vue-router';

const props = defineProps<{ range: 7 | 30; bookId?: string; bookTitle: string }>();
const app = useApp();
const router = useRouter();
const owner = computed(() => app.currentUser?.id ?? 'local');
const feedback = computed(() => practiceFeedback(app.data, app.now ?? new Date(), props.range, owner.value, props.bookId));
const quizRows = computed(() => feedback.value.quiz.filter(row => row.total > 0));
const startingId = ref<QuizType | null>(null);
const error = ref('');
const unresolvedNotFound = ref(false);
let revision = 0;

watch(() => [props.range, props.bookId, owner.value], () => {
  revision += 1;
  startingId.value = null;
  error.value = '';
  unresolvedNotFound.value = false;
}, { flush: 'sync' });

async function retryIncorrect(rowId: QuizType) {
  const row = quizRows.value.find(item => item.id === rowId);
  if (!row || !props.bookId || startingId.value || app.busy) return;
  const currentRevision = revision;
  const selectedBookId = props.bookId;
  const selectedOwner = owner.value;
  startingId.value = rowId;
  error.value = '';
  unresolvedNotFound.value = false;
  const isCurrent = () => currentRevision === revision && selectedOwner === owner.value && selectedBookId === props.bookId;
  try {
    if (row.unresolvedWordIds.length) {
      const loaded = await app.ensureBookLoaded(selectedBookId, false, app.currentUser?.id ?? null);
      if (!isCurrent()) return;
      if (!loaded) {
        error.value = app.error || '词书暂时无法读取，请重试。';
        return;
      }
      await app.refresh();
      if (!isCurrent()) return;
    }
    const latest = quizRows.value.find(item => item.id === rowId);
    if (!latest) return;
    if (!latest.practiceWordIds.length) {
      if (latest.unresolvedWordIds.length) {
        unresolvedNotFound.value = true;
        error.value = '这些历史词条暂未找到，可以前往词书查看。';
      } else error.value = latest.accuracy === 100
        ? '这些词最近已答对。'
        : '当前没有需要重练的词。';
      return;
    }
    if (!await app.startFocusedPractice([...latest.practiceWordIds], latest.id)) {
      if (isCurrent()) error.value = app.error || '这些词暂时无法开始练习，请重试。';
      return;
    }
    if (isCurrent()) await router.push('/study');
  } catch (cause) {
    if (isCurrent()) error.value = cause instanceof Error ? cause.message : '练习暂时无法开始，请重试。';
  } finally {
    if (isCurrent()) startingId.value = null;
  }
}

onUnmounted(() => { revision += 1; });
</script>

<template>
  <section class="practice-feedback" aria-labelledby="practice-feedback-heading">
    <div class="feedback-heading">
      <div><p class="eyebrow">HOW PRACTICE IS GOING</p><h2 id="practice-feedback-heading">各题型表现</h2><p class="feedback-scope">{{ bookTitle || '当前词书' }} · 近 {{ range }} 天</p></div>
    </div>

    <p v-if="!bookId" class="feedback-empty">先选择一本词书，再查看题型表现和重练建议。</p>
    <template v-else>
      <div v-if="quizRows.length" class="quiz-feedback-list" aria-label="题型答题表现">
        <article v-for="row in quizRows" :key="row.id" class="quiz-feedback-row">
          <div class="quiz-type"><strong>{{ row.title }}</strong><small>{{ row.correct }} / {{ row.total }} 答对</small></div>
          <div class="quiz-accuracy"><strong>{{ row.accuracy === null ? '—' : `${row.accuracy}%` }}</strong><small>答题正确率</small></div>
          <div class="quiz-preview" aria-label="待重练词汇预览">
            <template v-if="row.previewWords.length">
              <span v-for="word in row.previewWords.slice(0, 4)" :key="word.id" lang="ja">{{ word.term }}</span>
              <small v-if="row.practiceWordIds.length > 4">另有 {{ row.practiceWordIds.length - 4 }} 个词</small>
              <small v-if="row.unresolvedWordIds.length">另有 {{ row.unresolvedWordIds.length }} 个历史词待载入</small>
            </template>
            <small v-else-if="row.unresolvedWordIds.length">{{ row.unresolvedWordIds.length }} 个历史词待载入</small>
            <small v-else-if="row.accuracy === 100">这些词最近已答对</small>
            <small v-else>当前没有需要重练的词</small>
          </div>
          <button class="retry-button" type="button" :aria-label="`再练未答对的词：${row.title}`" :disabled="startingId !== null || app.busy || (!row.practiceWordIds.length && !row.unresolvedWordIds.length)" @click="retryIncorrect(row.id)">
            <span>{{ startingId === row.id ? '准备中…' : '再练未答对的词' }}</span><ArrowRight :size="15" aria-hidden="true"/>
          </button>
        </article>
      </div>
      <p v-else class="feedback-empty">近 {{ range }} 天还没有选择题记录。</p>

      <div v-if="feedback.self.total" class="self-feedback">
        <div class="self-heading"><div><h3>自主评价</h3><p>来自你在学习时的自我判断，与答题正确率分开统计。</p></div><span>{{ feedback.self.total }} 次</span></div>
        <div class="self-counts"><div><strong>{{ feedback.self.forgotten }}</strong><span>忘记</span></div><div><strong>{{ feedback.self.uncertain }}</strong><span>模糊</span></div><div><strong>{{ feedback.self.remembered }}</strong><span>记住</span></div></div>
      </div>
      <p v-if="error" class="feedback-error" role="alert"><RotateCcw :size="15" aria-hidden="true"/>{{ error }} <RouterLink v-if="unresolvedNotFound && bookId" :to="`/books/${bookId}`">前往词书</RouterLink></p>
    </template>
  </section>
</template>

<style scoped>
.practice-feedback{margin:0 0 24px;padding:19px 0 20px;border-top:1px solid #e4e9df;border-bottom:1px solid #e4e9df}.feedback-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.feedback-heading .eyebrow{margin:0 0 5px;color:#7a876b;font-size:9px;letter-spacing:.15em}.feedback-heading h2{margin:0;color:#304a38;font-size:20px;line-height:1.4}.feedback-scope{margin:5px 0 0;color:#748069;font-size:11px;line-height:1.6}.quiz-feedback-list{border-top:1px solid var(--border-soft)}.quiz-feedback-row{display:grid;grid-template-columns:minmax(130px,.75fr) minmax(100px,.45fr) minmax(180px,1fr) auto;align-items:center;gap:18px;padding:14px 0;border-bottom:1px solid var(--border-soft)}.quiz-type,.quiz-accuracy{display:flex;min-width:0;flex-direction:column;gap:4px}.quiz-type strong{color:#3e573e;font-size:13px;font-weight:600}.quiz-type small,.quiz-accuracy small{color:#748069;font-size:11px;line-height:1.5}.quiz-accuracy strong{color:#365d49;font-size:18px;font-variant-numeric:tabular-nums}.quiz-preview{display:flex;align-items:center;flex-wrap:wrap;gap:7px;min-width:0}.quiz-preview>span{padding:4px 7px;border-radius:6px;background:var(--surface-muted);color:#53694c;font-size:11px}.quiz-preview small{color:#748069;font-size:11px;line-height:1.6}.retry-button{min-height:44px;padding:8px 12px;border-color:var(--border-soft);border-radius:var(--radius-control);background:var(--surface-muted);color:#3e5b43;font-size:12px;white-space:nowrap;transition:background var(--motion-fast) var(--ease-ui),border-color var(--motion-fast) var(--ease-ui),color var(--motion-fast) var(--ease-ui)}.retry-button:not(:disabled):hover{background:var(--surface-selected);border-color:var(--border-strong)}.retry-button:disabled{opacity:.48}.feedback-empty{margin:6px 0 0;color:#748069;font-size:12px;line-height:1.7}.self-feedback{display:grid;grid-template-columns:minmax(180px,.8fr) minmax(0,1fr);align-items:center;gap:20px;margin-top:15px;padding:14px 16px;border:1px solid var(--border-soft);border-radius:var(--radius-inset);background:var(--surface-muted)}.self-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.self-heading h3{margin:0;color:#405743;font-size:13px}.self-heading p{margin:4px 0 0;color:#748069;font-size:11px;line-height:1.6}.self-heading>span{flex:none;color:#63705f;font-size:11px}.self-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.self-counts>div{display:flex;align-items:baseline;justify-content:center;gap:6px;padding:8px 5px;border-left:1px solid #dfe6d9}.self-counts strong{color:#365d49;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}.self-counts span{color:#6e7a69;font-size:10px}.feedback-error{display:flex;align-items:flex-start;gap:7px;margin:12px 0 0;color:#873c2c;font-size:12px;line-height:1.6}.feedback-error svg{flex:none;margin-top:2px}
@media(max-width:800px){.quiz-feedback-row{grid-template-columns:minmax(0,1fr) minmax(80px,.4fr);gap:10px 14px}.quiz-preview{grid-column:1}.retry-button{grid-column:2;grid-row:2;justify-self:end}.self-feedback{grid-template-columns:1fr;gap:10px}.self-counts>div:first-child{border-left:0}}
@media(max-width:480px){.quiz-feedback-row{grid-template-columns:minmax(0,1fr) auto;gap:9px 10px;padding:13px 0}.quiz-type strong{font-size:12px}.quiz-accuracy{align-items:flex-end}.quiz-accuracy strong{font-size:16px}.quiz-preview{grid-column:1/-1;grid-row:2}.retry-button{grid-column:1/-1;grid-row:3;width:100%;justify-content:center;white-space:normal}.self-feedback{padding:13px 12px}.self-counts>div{flex-direction:column;align-items:center;gap:1px}}
</style>
