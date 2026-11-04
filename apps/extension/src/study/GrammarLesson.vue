<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Leaf, RotateCcw, X } from 'lucide-vue-next';
import { playAnswerSound, stopAnswerSound } from '../answer-sound';
import {
  GRAMMAR_BOOK_ID, grammarLessons, getGrammarBook, createGrammarProgress, loadGrammarProgress, saveGrammarProgress,
  beginGrammarPractice, answerGrammarQuestion, advanceGrammarPractice, grammarWrongQuestions,
  type GrammarProgress,
} from '../../../web/src/services/grammar';

const props = defineProps<{ owner: string }>();
const route = useRoute();
const router = useRouter();
const account = computed(() => props.owner);
const book = computed(() => getGrammarBook(route.params.bookId));
const lessons = computed(() => book.value?.lessons ?? []);
const lesson = computed(() => lessons.value.find(item => String(item.order) === route.params.order));
const progress = shallowRef<GrammarProgress>(createGrammarProgress(grammarLessons[0]));
const selected = ref('');
const showReading = ref(false);
const saveError = ref(false);
const heading = ref<HTMLElement>();
const feedback = ref<HTMLElement>();
const point = computed(() => lesson.value?.points.find(item => item.id === progress.value.currentPointId) ?? lesson.value?.points[0]);
const pointIndex = computed(() => lesson.value?.points.findIndex(item => item.id === point.value?.id) ?? 0);
const session = computed(() => progress.value.session);
const question = computed(() => lesson.value?.questions.find(item => item.id === session.value?.questionIds[session.value.index]));
const submitted = computed(() => question.value ? session.value?.answers[question.value.id] : undefined);
const correct = computed(() => !!submitted.value && submitted.value === question.value?.answer);
const wrong = computed(() => lesson.value ? grammarWrongQuestions(lesson.value, progress.value) : []);
const wrongPoints = computed(() => lesson.value?.points.filter(item => wrong.value.some(question => question.pointId === item.id)) ?? []);
const roundCorrect = computed(() => lesson.value?.questions.filter(item => session.value?.answers[item.id] === item.answer).length ?? 0);
const firstCorrect = computed(() => lesson.value?.questions.filter(item => progress.value.firstAnswers[item.id] === item.answer).length ?? 0);
const firstCount = computed(() => Object.keys(progress.value.firstAnswers).length);
const nextLesson = computed(() => {
  const current = lesson.value;
  if (!current) return;
  return lessons.value.find(item => item.order === current.order + 1);
});
const bookHref = computed(() => `/books/${book.value?.id ?? GRAMMAR_BOOK_ID}?group=${Math.floor(((lesson.value?.order ?? 1) - (book.value?.lessons[0]?.order ?? 1)) / 6)}`);

function persist(updated: GrammarProgress) {
  progress.value = updated;
  if (lesson.value) saveError.value = !saveGrammarProgress(lesson.value, account.value, updated);
}
async function focusHeading() {
  await nextTick();
  heading.value?.focus({ preventScroll: true });
  heading.value?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function openPoint(id: string) {
  if (!lesson.value?.points.some(item => item.id === id)) return;
  stopAnswerSound(); showReading.value = false; selected.value = '';
  persist({ ...progress.value, phase: 'read', currentPointId: id });
  void focusHeading();
}
function startPractice(wrongOnly = false) {
  if (!lesson.value) return;
  stopAnswerSound(); selected.value = '';
  persist(beginGrammarPractice(lesson.value, progress.value, wrongOnly));
  void focusHeading();
}
function understand() {
  if (!lesson.value || !point.value) return;
  const understood = [...new Set([...progress.value.understood, point.value.id])];
  persist({ ...progress.value, understood });
  const next = lesson.value.points[pointIndex.value + 1];
  if (next) openPoint(next.id); else startPractice();
}
function submit() {
  if (!lesson.value || !question.value || !selected.value) return;
  const updated = answerGrammarQuestion(lesson.value, progress.value, question.value.id, selected.value);
  if (updated === progress.value) return;
  persist(updated);
  void playAnswerSound(selected.value === question.value.answer);
  void nextTick(() => {
    feedback.value?.focus({ preventScroll: true });
    feedback.value?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}
function nextQuestion() {
  stopAnswerSound(); selected.value = '';
  persist(advanceGrammarPractice(progress.value));
  void focusHeading();
}
function changeLesson(event: Event) {
  const order = (event.target as HTMLSelectElement).value;
  if (book.value) void router.push(`/grammar/${book.value.id}/${order}`);
}
function selectPoint(event: Event) { openPoint((event.target as HTMLSelectElement).value); }
watch([lesson, account], () => {
  stopAnswerSound(); selected.value = ''; showReading.value = false; saveError.value = false;
  if (lesson.value) progress.value = loadGrammarProgress(lesson.value, account.value);
}, { immediate: true });
onUnmounted(stopAnswerSound);
</script>

<template>
  <template v-if="lesson && point">
    <RouterLink :to="bookHref" class="back"><ArrowLeft :size="16" aria-hidden="true"/> 返回本册语法</RouterLink>
    <header class="grammar-heading"><div><p class="eyebrow">GRAMMAR / 标日{{book?.label}}</p><h1>语法学习</h1><p class="muted" lang="ja">第 {{lesson.order}} 课 · {{lesson.title}}</p></div><label class="lesson-picker">切换课次<select :value="lesson.order" @change="changeLesson"><option v-for="item in lessons" :key="item.order" :value="item.order">第 {{item.order}} 课</option></select></label></header>
    <p v-if="saveError" class="error" role="status">本机进度暂未保存，请保留当前页面。</p>
    <div class="grammar-layout">
      <aside class="grammar-outline" aria-label="本课语法点"><p class="outline-heading">本课语法 <span>{{progress.understood.length}} / {{lesson.points.length}}</span></p><button v-for="(item,index) in lesson.points" :key="item.id" type="button" :class="{active:progress.phase==='read'&&point.id===item.id}" :aria-current="progress.phase==='read'&&point.id===item.id?'step':undefined" @click="openPoint(item.id)"><span class="outline-number"><Check v-if="progress.understood.includes(item.id)" :size="14" aria-hidden="true"/><template v-else>{{index+1}}</template></span><span lang="ja">{{item.title}}</span></button><button class="outline-practice" type="button" @click="startPractice()">{{session&&session.index<session.questionIds.length?'继续本课练习':'本课练习'}}<ArrowRight :size="16" aria-hidden="true"/></button><p class="outline-note">进度保存在本机</p></aside>
      <div class="grammar-main">
        <label v-if="progress.phase==='read'" class="mobile-point-picker">语法点<select :value="point.id" @change="selectPoint"><option v-for="(item,index) in lesson.points" :key="item.id" :value="item.id">{{index+1}}. {{item.title}}</option></select></label>
        <button v-if="progress.phase==='read'&&session&&session.index<session.questionIds.length" type="button" class="mobile-resume" @click="startPractice()">继续本课练习 <ArrowRight :size="16" aria-hidden="true"/></button>
        <article v-if="progress.phase==='read'" class="grammar-paper">
          <p class="eyebrow">语法 {{pointIndex+1}} / {{lesson.points.length}}</p><h2 ref="heading" tabindex="-1" lang="ja">{{point.title}}</h2><p class="point-meaning">{{point.meaning}}</p><p class="connection" lang="ja">{{point.connection}}</p><p class="point-explanation">{{point.explanation}}</p>
          <section class="grammar-examples" aria-labelledby="examples-title"><div class="subheading"><h3 id="examples-title">用例展示</h3><button class="reading-toggle" type="button" :aria-pressed="showReading" @click="showReading=!showReading">{{showReading?'隐藏读音':'显示读音'}}</button></div><div v-for="example in point.examples" :key="example.ja" class="grammar-example"><p class="example-ja" lang="ja">{{example.ja}}</p><p v-if="showReading" class="example-reading" lang="ja">{{example.reading}}</p><p class="example-zh">{{example.zh}}</p><details class="sentence-parts"><summary>句子拆解 <ChevronRight :size="14" aria-hidden="true"/></summary><div class="parts"><span v-for="(part,index) in example.parts" :key="index"><strong lang="ja">{{part.text}}</strong><small>{{part.label}}</small></span></div></details></div></section>
          <div class="grammar-tip"><Leaf :size="18" aria-hidden="true"/><div><h3>容易混淆的地方</h3><p>{{point.tip}}</p></div></div>
          <footer class="point-actions"><button v-if="pointIndex>0" type="button" @click="openPoint(lesson.points[pointIndex-1].id)"><ArrowLeft :size="16" aria-hidden="true"/> 上一个</button><button type="button" class="primary" @click="understand">{{pointIndex===lesson.points.length-1?'开始本课练习':'理解了，继续'}}<ArrowRight :size="16" aria-hidden="true"/></button></footer>
        </article>
        <section v-else-if="progress.phase==='practice' && question && session" class="grammar-paper grammar-practice" aria-label="语法练习"><div class="practice-top"><span class="eyebrow">本课练习 · {{session.index+1}} / {{session.questionIds.length}}</span><button type="button" class="quiet" @click="openPoint(question.pointId)">返回讲解</button></div><div class="quiz-progress" aria-hidden="true"><i :style="{width:session.index/session.questionIds.length*100+'%'}"></i></div><h2 ref="heading" tabindex="-1">{{question.prompt}}</h2><p v-if="question.sentence" class="quiz-sentence" lang="ja">{{question.sentence.before}}<span class="answer-slot">{{submitted?question.answer:'　　'}}</span>{{question.sentence.after}}</p><div class="grammar-options" role="group" aria-label="选择答案"><button v-for="option in question.options" :key="option" type="button" :disabled="!!submitted" :aria-pressed="selected===option||submitted===option" :class="{chosen:!submitted&&selected===option,right:submitted&&option===question.answer,wrong:submitted===option&&option!==question.answer}" @click="selected=option"><span>{{option}}</span><Check v-if="submitted&&option===question.answer" :size="18" aria-hidden="true"/><X v-else-if="submitted===option" :size="18" aria-hidden="true"/></button></div><div v-if="submitted" ref="feedback" tabindex="-1" class="grammar-feedback" :class="{incorrect:!correct}" role="status"><h3>{{correct?'答对了':'再看一眼这个用法'}}</h3><p v-if="!correct">正确答案：<strong>{{question.answer}}</strong></p><p>{{question.explanation}}</p><button type="button" class="feedback-link" @click="openPoint(question.pointId)">回看对应讲解 <ArrowRight :size="14" aria-hidden="true"/></button></div><button v-if="submitted" type="button" class="primary quiz-action" @click="nextQuestion">{{session.index===session.questionIds.length-1?'查看本课小结':'下一题'}}<ArrowRight :size="16" aria-hidden="true"/></button><button v-else type="button" class="primary quiz-action" :disabled="!selected" @click="submit">确认答案</button></section>
        <section v-else class="grammar-paper grammar-summary"><span class="summary-check"><Check :size="30" aria-hidden="true"/></span><p class="eyebrow">第 {{lesson.order}} 课 · 练习完成</p><h2 ref="heading" tabindex="-1">本课练习已完成。</h2><p class="summary-count">{{roundCorrect}}<span> / {{session?.questionIds.length??lesson.questions.length}} 题答对</span></p><p v-if="firstCorrect!==roundCorrect||session?.questionIds.length!==firstCount" class="muted">首次作答记录：{{firstCorrect}} / {{firstCount}}，重练不会覆盖首次成绩。</p><div v-if="wrong.length" class="summary-wrong"><h3>再回顾 {{wrongPoints.length}} 个语法点</h3><button v-for="item in wrongPoints" :key="item.id" type="button" @click="openPoint(item.id)"><span>{{item.title}}</span><ArrowRight :size="16" aria-hidden="true"/></button></div><div class="summary-actions"><button v-if="wrong.length" class="primary" type="button" @click="startPractice(true)"><RotateCcw :size="16" aria-hidden="true"/> 重练错题</button><RouterLink v-else-if="nextLesson" class="button primary" :to="`/grammar/${nextLesson.bookId ?? book?.id}/${nextLesson.order}`">继续第 {{nextLesson.order}} 课 <ArrowRight :size="16" aria-hidden="true"/></RouterLink><button type="button" @click="openPoint(lesson.points[0].id)">回看本课</button><RouterLink :to="bookHref" class="button">返回本册语法</RouterLink></div></section>
        <details class="grammar-source"><summary>教材对应</summary><p>《新版中日交流标准日本语》{{book?.label}} · 第二版，第 {{lesson.sourcePages.join('、')}} 页。讲解、例句与练习由 KotoBud 重新编写。</p></details>
      </div>
    </div>
  </template>
  <div v-else class="empty"><h1>这一课还在准备中。</h1><RouterLink :to="bookHref" class="button">查看已开放的语法课</RouterLink></div>
</template>

<style scoped>
.grammar-heading{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:30px 34px;margin-bottom:30px;border:1px solid var(--line);border-radius:24px;background:var(--surface-selected,#edf2e8)}.grammar-heading h1{font-size:32px;margin-bottom:8px;text-wrap:balance}.grammar-heading .muted{margin:0}.lesson-picker{min-width:108px;color:var(--muted);font-size:12px}.lesson-picker select{font-size:14px}.grammar-layout{display:grid;grid-template-columns:232px minmax(0,1fr);gap:30px;align-items:start;margin-bottom:40px}.grammar-outline{position:sticky;top:24px}.outline-heading{display:flex;justify-content:space-between;align-items:center;margin:8px 10px 18px;font-size:13px;font-weight:600}.outline-heading span{color:var(--muted);font-weight:400}.grammar-outline button{display:flex;justify-content:flex-start;width:100%;gap:10px;border-color:transparent;background:transparent;text-align:left;line-height:1.65;padding:13px 10px;font-size:13px;border-radius:10px;margin:3px 0}.grammar-outline button.active{background:var(--surface-selected,#edf2e8);color:var(--green);font-weight:600}.grammar-outline button:hover{background:var(--surface-selected,#edf2e8)}.outline-number{display:grid;place-items:center;flex:0 0 22px;height:22px;border:1px solid var(--line);border-radius:50%;font-size:11px;font-variant-numeric:tabular-nums}.grammar-outline .outline-practice{justify-content:space-between;border-top:1px solid var(--line);border-radius:0;margin-top:20px;padding-top:22px;color:var(--green)}.outline-note{font-size:11px;color:var(--muted);margin:18px 10px}.grammar-main{min-width:0}.grammar-paper{padding:32px;border:1px solid var(--line);border-radius:20px;background:var(--paper)}.grammar-paper h2{font-size:27px;line-height:1.7;margin:0 0 10px;overflow-wrap:anywhere}.grammar-paper [tabindex="-1"]:focus{outline:none}.point-meaning{color:var(--muted);font-size:15px;margin-bottom:24px}.connection{padding:16px 18px;margin:0 0 24px;border-left:3px solid var(--green);background:var(--surface-selected,#edf2e8);font-size:18px;line-height:1.8;overflow-wrap:anywhere}.point-explanation{font-size:15px;line-height:1.95;margin-bottom:28px}.subheading{display:flex;align-items:center;justify-content:space-between;gap:12px}.subheading h3{font-size:15px;margin:0}.reading-toggle{border:0;padding:8px;font-size:12px;color:var(--green);background:transparent;flex-shrink:0}.grammar-example{padding:20px 0;border-bottom:1px solid var(--line)}.example-ja{font-size:22px;line-height:1.9;margin:0 0 4px;overflow-wrap:anywhere}.example-reading{font-size:13px;color:var(--muted);margin:0 0 8px}.example-zh{font-size:14px;color:var(--muted);margin:0}.sentence-parts{margin-top:10px}.sentence-parts summary{display:inline-flex;align-items:center;gap:5px;min-height:44px;cursor:pointer;font-size:12px;color:var(--green);list-style:none}.sentence-parts summary::-webkit-details-marker{display:none}.sentence-parts[open] summary svg{transform:rotate(90deg)}.parts{display:flex;flex-wrap:wrap;gap:12px 18px;padding:10px 0}.parts>span{display:flex;flex-direction:column;gap:5px}.parts strong{font-size:16px;font-weight:500}.parts small{font-size:11px;color:var(--muted)}.grammar-tip{display:flex;gap:12px;margin-top:24px;color:var(--green)}.grammar-tip svg{margin-top:4px}.grammar-tip h3{font-size:14px;margin-bottom:7px}.grammar-tip p{font-size:14px;line-height:1.85;margin:0;color:var(--muted)}.point-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:12px;margin-top:30px}.point-actions>button:first-child:not(.primary){margin-right:auto}.grammar-source{padding:18px 4px;color:var(--muted);font-size:12px}.grammar-source summary{cursor:pointer;min-height:44px;display:flex;align-items:center}.grammar-source p{font-size:12px;line-height:1.8}.mobile-point-picker,.mobile-resume{display:none}.practice-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.practice-top .eyebrow{margin:0}.quiet{border:0;background:transparent;color:var(--muted);padding:8px;font-size:12px}.quiz-progress{height:3px;background:var(--line);margin-bottom:30px;overflow:hidden;border-radius:3px}.quiz-progress i{display:block;background:var(--green);height:100%;transition:width .18s}.grammar-practice h2{font-size:22px}.quiz-sentence{font-size:24px;line-height:2;margin:24px 0;overflow-wrap:anywhere}.answer-slot{display:inline;padding:0 7px;border-bottom:2px solid var(--green);color:var(--green)}.grammar-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:25px 0}.grammar-options button{justify-content:space-between;min-height:62px;text-align:left;font-size:15px;line-height:1.7;padding:14px 16px;overflow-wrap:anywhere;border-radius:12px}.grammar-options button.chosen{border-color:var(--green);background:var(--surface-selected,#edf2e8)}.grammar-options button:disabled{opacity:1;cursor:default}.grammar-options button.right{color:var(--green);border-color:var(--green);background:var(--surface-selected,#edf2e8)}.grammar-options button.wrong{border-color:#ad7970;color:#82564d;background:#f7efeb}.grammar-feedback{margin:22px 0;padding:18px 20px;border-radius:12px;background:var(--surface-selected,#edf2e8)}.grammar-feedback.incorrect{background:#f7efeb}.grammar-feedback h3{font-size:16px}.grammar-feedback p{font-size:14px;margin-bottom:6px}.feedback-link{border:0;background:transparent;padding:7px 0;color:var(--green);font-size:12px}.quiz-action{width:100%;margin-top:12px}.grammar-summary{text-align:center;padding-top:38px;padding-bottom:38px}.summary-check{display:grid;place-items:center;background:var(--surface-selected,#edf2e8);color:var(--green);width:66px;height:66px;border-radius:50%;margin:0 auto 24px}.summary-count{font-size:54px;font-variant-numeric:tabular-nums;margin:24px 0;color:var(--green)}.summary-count span{font-size:15px;color:var(--muted)}.summary-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:28px}.summary-wrong{padding-top:20px;margin-top:26px;border-top:1px solid var(--line);text-align:left}.summary-wrong h3{font-size:15px}.summary-wrong button{border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;width:100%;text-align:left;justify-content:space-between;line-height:1.8}.grammar-summary .muted{font-size:12px}
@media(max-width:1100px){.grammar-layout{grid-template-columns:190px minmax(0,1fr);gap:20px}.grammar-paper{padding:26px}}
@media(max-width:760px){.grammar-heading{padding:24px;align-items:flex-start}.grammar-heading h1{font-size:27px}.grammar-heading .muted{font-size:13px}.lesson-picker{min-width:82px}.grammar-layout{display:block}.grammar-outline{display:none}.mobile-resume{display:flex;width:100%;margin:0 0 18px;color:var(--green)}.mobile-point-picker{display:block;margin:0 0 18px;color:var(--muted)}.grammar-paper{padding:23px 20px}.grammar-paper h2{font-size:23px}.connection{font-size:16px;padding:14px}.example-ja{font-size:20px}.grammar-options{grid-template-columns:1fr}.quiz-sentence{font-size:22px}.grammar-heading{flex-direction:row;gap:12px;padding:22px 20px}.grammar-heading>div{min-width:0;flex:1}.grammar-heading .eyebrow{font-size:9px;letter-spacing:1px}.grammar-heading .muted{font-size:12px}.lesson-picker{width:88px;min-width:88px;display:block;font-size:11px}.lesson-picker select{padding:10px 8px;margin-top:6px}.point-actions{gap:10px}.point-actions button{font-size:13px}.summary-actions{flex-direction:column}.summary-count{font-size:44px}}
@media(prefers-reduced-motion:reduce){.grammar-outline button,.reading-toggle,.grammar-options button,.quiz-progress i{transition:none}}
</style>
