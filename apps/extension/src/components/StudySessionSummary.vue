<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, BookOpen, Check, LoaderCircle, RotateCcw } from 'lucide-vue-next';
import type { SessionSummary } from '../../../web/src/services/study-feedback';
import type { LessonPracticeRecommendation } from '../../../web/src/services/lesson-practice-recommendation';
import MeaningPreview from '../../../web/src/components/MeaningPreview.vue';

const props = defineProps<{
  summary: SessionSummary;
  durationMs: number;
  skipped: number;
  remaining: number;
  todayCount: number;
  dailyGoal: number;
  busy?: boolean;
  practiceLabel?: string;
  recommendation?: LessonPracticeRecommendation;
}>();

const emit = defineEmits<{
  home: [];
  resume: [];
  retry: [];
  recommend: [recommendation: LessonPracticeRecommendation];
}>();

const durationLabel = computed(() => {
  const seconds = Math.floor(Math.max(0, props.durationMs) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes > 0) return remainder ? `${minutes}分${String(remainder).padStart(2, '0')}秒` : `${minutes}分钟`;
  return `${remainder}秒`;
});

const goal = computed(() => Math.max(0, Math.trunc(props.dailyGoal)));
const progress = computed(() => goal.value ? Math.min(100, Math.round(Math.max(0, props.todayCount) / goal.value * 100)) : 0);
const quizAccuracy = computed(() => {
  if (!props.summary.quiz.total) return null;
  return props.summary.quiz.accuracy ?? Math.round(props.summary.quiz.correct / props.summary.quiz.total * 100);
});
const recapWords = computed(() => props.summary.recap.slice(0, 4));
const practiceWords = computed(() => props.summary.practiceWords.slice(0, 5));
const remainingPracticeWords = computed(() => props.summary.practiceWords.slice(5));
const recommendationWords = computed(() => props.recommendation?.words.slice(0, 3) ?? []);
const recommendationMoreCount = computed(() => Math.max(0, (props.recommendation?.words.length ?? 0) - recommendationWords.value.length));
const recommendationHeading = computed(() => props.recommendation?.kind === 'scene'
  ? props.recommendation.scene.title
  : props.recommendation ? `${props.recommendation.verb.term}的活用` : '');
const recommendationAction = computed(() => props.recommendation?.kind === 'scene' ? '看看这个场景' : '练习动词活用');

</script>

<template>
  <section class="study-session-summary" :aria-busy="!!busy" aria-labelledby="study-session-summary-title">
    <header class="summary-header">
      <div class="summary-heading-row">
        <span class="summary-mark" aria-hidden="true"><Check :size="17" /></span>
        <div class="summary-heading-copy">
          <p class="summary-kicker">本次学习记录</p>
          <h2 id="study-session-summary-title">这一轮完成了</h2>
        </div>
      </div>
      <p v-if="practiceLabel" class="summary-context">{{ practiceLabel }}</p>
      <p class="summary-persisted-note">统计依据已保存的复习记录。</p>
    </header>

    <div class="summary-metrics" role="group" aria-label="本轮学习概况">
      <div><strong>{{ summary.newCount }}</strong><span>新学</span></div>
      <div><strong>{{ summary.reviewCount }}</strong><span>温习</span></div>
      <div><strong>{{ durationLabel }}</strong><span>用时</span></div>
    </div>

    <section class="summary-daily" aria-label="今日学习进度">
      <div class="summary-daily-label"><span>今日评分目标</span><strong>{{ todayCount }} / {{ goal || '—' }}<small v-if="goal"> 次</small></strong></div>
      <div class="summary-progress-track" role="progressbar" aria-label="今日目标完成进度" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
        <i :style="{ width: `${progress}%` }" />
      </div>
    </section>

    <div v-if="skipped > 0 || summary.skippedCount > 0" class="summary-notes" aria-label="未计入学习结果的词">
      <p v-if="skipped > 0"><BookOpen :size="14" aria-hidden="true" />本轮跳过 {{ skipped }} 词，未计入学习结果。</p>
      <p v-if="summary.skippedCount > 0"><BookOpen :size="14" aria-hidden="true" />另有 {{ summary.skippedCount }} 词没有新的复习记录，未计入统计。</p>
    </div>

    <section v-if="summary.quiz.total > 0" class="summary-result" aria-labelledby="summary-quiz-title">
      <h3 id="summary-quiz-title">答题结果</h3>
      <div class="summary-result-values">
        <p><strong>{{ summary.quiz.correct }}</strong><span>答对</span></p>
        <p><strong>{{ summary.quiz.incorrect }}</strong><span>未答对</span></p>
        <p><strong>{{ quizAccuracy }}%</strong><span>正确率</span></p>
      </div>
      <p class="summary-result-footnote">共 {{ summary.quiz.total }} 题，按已保存的答题记录统计。</p>
    </section>

    <section v-if="summary.self.total > 0" class="summary-result" aria-labelledby="summary-self-title">
      <h3 id="summary-self-title">自主评价 <span>共 {{ summary.self.total }} 词</span></h3>
      <div class="summary-self-values">
        <p><strong>{{ summary.self.remembered }}</strong><span>记得</span></p>
        <p><strong>{{ summary.self.uncertain }}</strong><span>模糊</span></p>
        <p><strong>{{ summary.self.forgotten }}</strong><span>没记住</span></p>
      </div>
    </section>

    <section v-if="recapWords.length" class="summary-word-section" aria-labelledby="summary-recap-title">
      <div class="summary-section-heading"><h3 id="summary-recap-title">本轮回顾</h3><span>{{ recapWords.length }} 词</span></div>
      <ul class="summary-word-list">
        <li v-for="word in recapWords" :key="word.id" class="summary-word">
          <div class="summary-word-label"><strong lang="ja">{{ word.term }}</strong><span v-if="word.reading" lang="ja">{{ word.reading }}</span></div>
          <MeaningPreview :word="word" />
        </li>
      </ul>
    </section>

    <section v-if="summary.practiceWords.length" class="summary-word-section summary-practice-section" aria-labelledby="summary-practice-title">
      <div class="summary-section-heading"><h3 id="summary-practice-title">待巩固</h3><span>{{ summary.practiceWords.length }} 词</span></div>
      <p class="summary-section-note">这些词来自本轮已保存的答题或自主评价记录。</p>
      <ul class="summary-word-list">
        <li v-for="word in practiceWords" :key="word.id" class="summary-word">
          <div class="summary-word-label"><strong lang="ja">{{ word.term }}</strong><span v-if="word.reading" lang="ja">{{ word.reading }}</span></div>
          <MeaningPreview :word="word" />
        </li>
      </ul>
      <details v-if="remainingPracticeWords.length" class="summary-more-words">
        <summary>查看其余 {{ remainingPracticeWords.length }} 词</summary>
        <ul class="summary-word-list">
          <li v-for="word in remainingPracticeWords" :key="word.id" class="summary-word">
            <div class="summary-word-label"><strong lang="ja">{{ word.term }}</strong><span v-if="word.reading" lang="ja">{{ word.reading }}</span></div>
            <MeaningPreview :word="word" />
          </li>
        </ul>
      </details>
    </section>

    <p v-if="!recapWords.length && !summary.practiceWords.length" class="summary-empty">这一轮还没有可回顾的已保存词条。</p>

    <section v-if="recommendation" class="summary-recommendation" aria-label="本轮学习推荐">
      <p class="summary-recommendation-kicker">把刚学的词用起来</p>
      <h3>{{ recommendationHeading }}</h3>
      <p class="summary-recommendation-copy">这个{{ recommendation.kind === 'scene' ? '场景' : '动词练习' }}会用到本轮已评分的 {{ recommendation.words.length }} 个词。</p>
      <div class="summary-recommendation-words"><span v-for="word in recommendationWords" :key="word.id"><strong lang="ja">{{ word.term }}</strong><small lang="ja">{{ word.reading }}</small></span><small v-if="recommendationMoreCount">还有 {{ recommendationMoreCount }} 个</small></div>
      <button class="summary-recommendation-action" type="button" :disabled="busy" @click="emit('recommend', recommendation)">{{ recommendationAction }}<ArrowRight :size="15" aria-hidden="true" /></button>
    </section>

    <footer class="summary-actions">
      <button class="summary-primary" type="button" :disabled="busy" @click="remaining > 0 ? emit('resume') : emit('home')">
        <LoaderCircle v-if="busy" class="summary-spin" :size="16" aria-hidden="true" />
        <ArrowRight v-else-if="remaining > 0" :size="16" aria-hidden="true" />
        <BookOpen v-else :size="16" aria-hidden="true" />
        {{ remaining > 0 ? `继续剩余 ${remaining} 词` : '返回学习首页' }}
      </button>
      <button v-if="remaining === 0 && summary.practiceWords.length > 0" class="summary-retry" type="button" :disabled="busy" @click="emit('retry')">
        <RotateCcw :size="15" aria-hidden="true" />重练待巩固 {{ summary.practiceWords.length }} 词
      </button>
      <p v-else-if="remaining > 0 && summary.practiceWords.length > 0" class="summary-retry-note">完成剩余 {{ remaining }} 词后，就可以再巩固这些词。重练会更新复习安排。</p>
      <p v-else-if="summary.practiceWords.length > 0" class="summary-retry-note">重练会更新复习安排。</p>
    </footer>
  </section>
</template>

<style scoped>
.study-session-summary{min-width:0;padding:17px;border:1px solid var(--line-strong);border-radius:17px;background:linear-gradient(145deg,var(--paper),var(--green-pale));color:var(--ink);text-align:left}
.summary-header{display:grid;gap:8px}.summary-heading-row{display:flex;align-items:center;gap:10px;min-width:0}.summary-mark{display:grid;width:34px;height:34px;flex:none;place-items:center;border:1px solid #d5e2d1;border-radius:11px;background:var(--green-soft);color:var(--green)}.summary-heading-copy{min-width:0}.summary-kicker{margin:0 0 2px;color:var(--muted);font-size:12px;font-weight:650;letter-spacing:.04em}.summary-heading-copy h2{margin:0;color:var(--ink);font-family:"Yu Mincho","Hiragino Mincho ProN",serif;font-size:20px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}.summary-context{margin:0;color:var(--ink-soft);font-size:14px;line-height:1.5;overflow-wrap:anywhere}.summary-persisted-note{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
.summary-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:15px}.summary-metrics>div{display:flex;min-width:0;min-height:60px;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 3px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.78)}.summary-metrics strong{max-width:100%;color:var(--green);font-size:20px;font-variant-numeric:tabular-nums;line-height:1.2;overflow-wrap:anywhere}.summary-metrics span{color:var(--muted);font-size:13px;line-height:1.35}
.summary-daily{margin-top:14px}.summary-daily-label{display:flex;justify-content:space-between;gap:8px;margin-bottom:7px;color:var(--ink-soft);font-size:14px;line-height:1.4}.summary-daily-label strong{color:var(--green);font-variant-numeric:tabular-nums;white-space:nowrap}.summary-daily-label small{font-size:inherit;font-weight:500}.summary-progress-track{height:7px;overflow:hidden;border-radius:999px;background:#e3e9df}.summary-progress-track>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#789b70,#b0955a);transition:width 220ms ease}
.summary-mark{border-color:var(--line-strong)}.summary-progress-track{background:var(--line)}.summary-progress-track>i{background:linear-gradient(90deg,var(--chart-5),var(--gold))}
.summary-notes{display:grid;gap:5px;margin-top:12px;padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.58)}.summary-notes p{display:flex;align-items:flex-start;gap:7px;margin:0;color:var(--muted);font-size:13px;line-height:1.5}.summary-notes svg{flex:none;margin-top:2px;color:var(--green)}
.summary-result,.summary-word-section{margin-top:15px;padding-top:13px;border-top:1px solid var(--line-strong)}.summary-result h3,.summary-section-heading h3{margin:0;color:var(--ink-soft);font-size:15px;font-weight:700;line-height:1.45}.summary-result h3 span,.summary-section-heading>span{color:var(--muted);font-size:13px;font-weight:500}.summary-result h3 span{margin-left:6px}.summary-result-values,.summary-self-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:9px}.summary-result-values p,.summary-self-values p{display:flex;min-width:0;flex-direction:column;align-items:center;gap:2px;margin:0;padding:8px 3px;border-radius:9px;background:rgba(255,255,255,.65);text-align:center}.summary-result-values strong,.summary-self-values strong{color:var(--green);font-size:18px;font-variant-numeric:tabular-nums;line-height:1.3}.summary-result-values span,.summary-self-values span{color:var(--muted);font-size:13px;line-height:1.35;overflow-wrap:anywhere}.summary-result-footnote{margin:7px 0 0;color:var(--muted);font-size:13px;line-height:1.5}
.summary-section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.summary-section-note{margin:4px 0 0;color:var(--muted);font-size:13px;line-height:1.5}.summary-word-list{display:grid;gap:0;margin:7px 0 0;padding:0;list-style:none}.summary-word{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);align-items:start;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)}.summary-word:last-child{border-bottom:0}.summary-word-label{display:grid;gap:2px;min-width:0}.summary-word-label strong{color:var(--ink);font-size:15px;font-weight:650;line-height:1.4;overflow-wrap:anywhere}.summary-word-label span{color:var(--muted);font-size:13px;line-height:1.45;overflow-wrap:anywhere}.summary-word>p,.summary-word>.meaning-preview{min-width:0;margin:0;color:var(--ink-soft);font-size:14px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word}.summary-more-words summary{display:flex;align-items:center;min-height:44px;width:fit-content;max-width:100%;padding:3px 4px;color:var(--green);font-size:14px;font-weight:650;line-height:1.4;cursor:pointer}.summary-more-words[open] summary{margin-bottom:2px}.summary-empty{margin:14px 0 0;padding-top:13px;border-top:1px solid var(--line-strong);color:var(--muted);font-size:14px;line-height:1.6}
.summary-recommendation{display:grid;gap:7px;margin-top:15px;padding:13px;border:1px solid var(--line-strong);border-radius:12px;background:rgba(255,255,255,.72)}.summary-recommendation-kicker{margin:0;color:var(--green);font-size:12px;font-weight:700;letter-spacing:.025em}.summary-recommendation h3{margin:0;color:var(--ink);font-size:16px;line-height:1.45;overflow-wrap:anywhere}.summary-recommendation-copy{margin:0;color:var(--muted);font-size:13px;line-height:1.55}.summary-recommendation-words{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.summary-recommendation-words>span{display:grid;gap:1px;min-width:0;padding:5px 8px;border:1px solid var(--line);border-radius:8px;background:var(--paper)}.summary-recommendation-words strong{color:var(--ink);font-size:13px;line-height:1.35;overflow-wrap:anywhere}.summary-recommendation-words small{color:var(--muted);font-size:11px;line-height:1.35}.summary-recommendation-action{display:flex;width:100%;min-height:42px;align-items:center;justify-content:center;gap:7px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:9px;background:var(--green-soft);color:var(--green);font:inherit;font-size:13px;font-weight:700;cursor:pointer}.summary-recommendation-action:hover:not(:disabled){border-color:var(--green);background:var(--paper)}.summary-recommendation-action:disabled{opacity:.62;cursor:wait}.summary-recommendation-action svg{flex:none}
.summary-actions{display:grid;gap:8px;margin-top:16px}.summary-primary,.summary-retry{display:flex;width:100%;min-height:46px;align-items:center;justify-content:center;gap:8px;padding:10px 12px;border:1px solid var(--green);border-radius:11px;font:inherit;font-size:14px;font-weight:700;line-height:1.4;text-align:center;overflow-wrap:anywhere;cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease,transform 140ms ease}.summary-primary{background:var(--green);color:var(--paper)}.summary-primary:hover:not(:disabled){border-color:var(--green-deep);background:var(--green-deep)}.summary-retry{border-color:var(--line-strong);background:rgba(255,255,255,.72);color:var(--green)}.summary-retry:hover:not(:disabled){background:var(--green-soft)}.summary-primary:disabled,.summary-retry:disabled{opacity:.62;cursor:wait}.summary-primary svg,.summary-retry svg{flex:none}.summary-retry-note{margin:0;color:var(--muted);font-size:13px;line-height:1.5;text-align:center}.summary-spin{animation:summary-spin 1s linear infinite}@keyframes summary-spin{to{transform:rotate(360deg)}}
@media(max-width:360px){.study-session-summary{padding:14px;border-radius:15px}.summary-metrics{gap:5px}.summary-metrics>div{min-height:57px}.summary-metrics strong{font-size:18px}.summary-word{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:7px}}
@media(prefers-reduced-motion:reduce){.summary-progress-track>i,.summary-primary,.summary-retry,.summary-recommendation-action{transition:none}.summary-spin{animation:none}}
</style>
