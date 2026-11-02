<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft, ArrowRight, Check, RotateCcw, Volume2 } from 'lucide-vue-next';
import { useApp } from '../store';
import { usePronunciation } from '../composables/usePronunciation';
import { playAnswerSound, stopAnswerSound } from '../services/answer-sound';
import {
  CONJUGATION_FORMS, VERB_GROUP_LABELS, conjugationVerbs, conjugate,
  createConjugationRound, confirmConjugation, advanceConjugation, retryConjugation,
  type ConjugationForm, type ConjugationRound, type VerbGroup,
} from '../services/conjugation';

const app = useApp();
const route = useRoute();
const pronunciation = usePronunciation();
const form = ref<ConjugationForm | 'mixed'>('te');
const group = ref<VerbGroup | 'all'>('all');
const round = shallowRef<ConjugationRound | null>(null);
const answerInput = ref('');
const answerField = ref<HTMLInputElement>();
const feedbackHeading = ref<HTMLElement>();
const completeHeading = ref<HTMLElement>();
const showHint = ref(false);
const composing = ref(false);
const retrying = ref(false);
const focusedVerb = computed(() => conjugationVerbs.find(verb => verb.id === route.query.verb));
const returnToStudy = computed(() => route.query.return === 'study' && app.hasResumableSession);
const choices = computed(() => focusedVerb.value ? [focusedVerb.value] : conjugationVerbs.filter(verb => group.value === 'all' || verb.group === group.value));
const targets = computed<ConjugationForm[]>(() => form.value === 'mixed' ? CONJUGATION_FORMS.map(item => item.id) : [form.value]);
const questionCount = computed(() => Math.min(12, choices.value.length * targets.value.length));
const question = computed(() => round.value?.questions[round.value.index]);
const result = computed(() => question.value ? round.value?.results[question.value.id] : undefined);
const expected = computed(() => question.value ? conjugate(question.value.verb, question.value.form) : undefined);
const finished = computed(() => !!round.value && round.value.questions.length > 0 && round.value.index >= round.value.questions.length);
const correctCount = computed(() => Object.values(round.value?.results ?? {}).filter(item => item.correct).length);
const incorrect = computed(() => round.value?.questions.filter(item => round.value?.results[item.id]?.correct === false) ?? []);
const formLabel = (id: ConjugationForm) => CONJUGATION_FORMS.find(item => item.id === id)!.label;
const sentence = computed(() => question.value && expected.value ? question.value.verb.examples[question.value.form].ja.replace('{answer}', expected.value.written) : '');

function stopFeedback() { stopAnswerSound(); pronunciation.stop(); }
async function speak(text: string, reading = '') { stopAnswerSound(); await pronunciation.playSentence(text, reading); }
async function focusInput() { await nextTick(); answerField.value?.focus({ preventScroll: true }); answerField.value?.scrollIntoView({ block: 'nearest' }); }
function clearAnswer() { answerInput.value = ''; showHint.value = false; composing.value = false; }
function start() {
  stopFeedback(); clearAnswer(); retrying.value = false;
  round.value = createConjugationRound(choices.value, targets.value);
  void focusInput();
}
function configure() { stopFeedback(); round.value = null; clearAnswer(); retrying.value = false; }
function submit(questionId: string) {
  if (composing.value || !round.value) return;
  const updated = confirmConjugation(round.value, questionId, answerInput.value);
  if (updated === round.value) return;
  round.value = updated;
  void playAnswerSound(updated.results[questionId].correct);
  void nextTick(() => { feedbackHeading.value?.focus({ preventScroll: true }); feedbackHeading.value?.scrollIntoView({ block: 'nearest' }); });
}
function enter(event: KeyboardEvent, questionId: string) {
  if (event.isComposing || composing.value || event.keyCode === 229) return;
  event.preventDefault(); submit(questionId);
}
function next(questionId: string) {
  if (!round.value) return;
  const updated = advanceConjugation(round.value, questionId);
  if (updated === round.value) return;
  stopFeedback(); round.value = updated; clearAnswer();
  if (finished.value) void nextTick(() => completeHeading.value?.focus({ preventScroll: true }));
  else void focusInput();
}
function retry() {
  if (!round.value || !finished.value || !incorrect.value.length) return;
  stopFeedback(); round.value = retryConjugation(round.value); clearAnswer(); retrying.value = true;
  void focusInput();
}
watch(() => route.query.verb, configure);
watch(() => app.currentUser?.id ?? null, configure);
onUnmounted(stopFeedback);
</script>

<template>
  <div class="conjugation-page">
    <RouterLink class="back" :to="returnToStudy ? '/study' : '/books'"><ArrowLeft :size="16" aria-hidden="true"/>{{ returnToStudy ? '回到学习' : '我的词书' }}</RouterLink>
    <header class="page-heading conjugation-heading"><div><p class="eyebrow">VERBS IN USE</p><h1>动词活用</h1><p class="muted">从原形出发，把动词放进另一句话。</p></div><span class="verb-count">{{ conjugationVerbs.length }} 个常用动词 · 四种变化</span></header>

    <template v-if="!round">
      <section class="conjugation-setup" aria-labelledby="practice-options-heading">
        <h2 id="practice-options-heading">这次练习什么</h2>
        <p v-if="focusedVerb" class="focused-verb">练习「{{ focusedVerb.term }}」<span lang="ja">{{ focusedVerb.reading }}</span><RouterLink to="/conjugation">查看全部动词</RouterLink></p>
        <div class="practice-options">
          <label for="conjugation-form">目标变化<select id="conjugation-form" v-model="form"><option v-for="item in CONJUGATION_FORMS" :key="item.id" :value="item.id">{{ item.label }} · {{ item.description }}</option><option value="mixed">综合练习 · 四种变化</option></select></label>
          <label v-if="!focusedVerb" for="conjugation-group">动词类型<select id="conjugation-group" v-model="group"><option value="all">全部类型</option><option v-for="(label, id) in VERB_GROUP_LABELS" :key="id" :value="id">{{ label }}</option></select></label>
        </div>
        <p class="practice-help">可用假名或汉字假名作答。每轮最多 12 题，完成后可以继续下一轮。</p>
        <button type="button" class="primary start-conjugation" :disabled="!questionCount" @click="start">开始练习 · {{ questionCount }} 题 <ArrowRight :size="16" aria-hidden="true"/></button>
      </section>
      <details class="conjugation-guide"><summary>先看看变化规则</summary><div class="guide-grid"><section><h3>五段动词</h3><p>ます形把末尾改为い段，ない形改为あ段后加ない。以う结尾时改为わ。</p><p>て形／た形：う・つ・る → って／った，む・ぶ・ぬ → んで／んだ，く → いて／いた，ぐ → いで／いだ，す → して／した。</p></section><section><h3>一段动词</h3><p>去掉末尾る，再接ます、て、た或ない，例如食べる → 食べて。</p><p>不能只看る判断类型：帰る、入る、切る和走る都是五段动词。</p></section><section><h3>不规则与特例</h3><p>する → します／して／した／しない。来る → 来ます（きます）／来て（きて）／来た（きた）／来ない（こない）。</p><p>行く的て形／た形是行って／行った，ある的ない形是ない。</p></section></div></details>
    </template>

    <section v-else-if="question" class="conjugation-exercise" aria-labelledby="conjugation-question-heading">
      <div class="exercise-meta"><span>{{ retrying ? '再练一遍' : '本轮练习' }} · {{ round.index + 1 }} / {{ round.questions.length }}</span><button type="button" class="quiet-button" @click="configure">调整练习</button></div>
      <progress :value="round.index" :max="round.questions.length" :aria-label="`已完成 ${round.index} 题，共 ${round.questions.length} 题`"/>
      <div class="question-word"><span>{{ VERB_GROUP_LABELS[question.verb.group] }} · {{ question.verb.meaning }}</span><h2 id="conjugation-question-heading" lang="ja">{{ question.verb.term }}</h2><p lang="ja">{{ question.verb.reading }}</p></div>
      <p class="target-form">请写出它的 <strong>{{ formLabel(question.form) }}</strong></p>
      <p class="sentence-context" lang="ja">{{ question.verb.examples[question.form].ja.replace('{answer}', '＿＿') }}</p>
      <form class="conjugation-answer" @submit.prevent="submit(question.id)">
        <label for="conjugation-answer-input">你的答案</label>
        <input id="conjugation-answer-input" ref="answerField" v-model="answerInput" lang="ja" type="text" autocomplete="off" autocapitalize="off" :spellcheck="false" :readonly="!!result" aria-describedby="conjugation-input-help" @compositionstart="composing = true" @compositionend="composing = false" @keydown.enter="enter($event, question.id)"/>
        <p id="conjugation-input-help" class="practice-help">输入完整的动词变化，可用假名或汉字假名。</p>
        <button v-if="!result" type="submit" class="primary" :disabled="!answerInput.trim() || composing">核对答案</button>
      </form>
      <button v-if="!result" type="button" class="quiet-button hint-toggle" :aria-expanded="showHint" @click="showHint = !showHint">{{ showHint ? '收起提示' : '给我一点提示' }}</button>
      <p v-if="showHint && !result" class="conjugation-hint">{{ question.verb.group === 'godan' ? '先看原形的最后一个假名，再确定这次变化的词尾。注意行く和ある的特例。' : question.verb.group === 'ichidan' ? '去掉末尾的る，再接上目标变化的词尾。' : '这是不规则动词，需要记住する或来る的变化。' }}</p>
      <div v-if="result && expected" class="conjugation-feedback" :class="{ 'answer-incorrect': !result.correct }" role="status">
        <h3 ref="feedbackHeading" tabindex="-1"><Check v-if="result.correct" :size="18" aria-hidden="true"/>{{ result.correct ? '答对了' : '再看一下这个变化' }}</h3>
        <p class="expected-answer" lang="ja">{{ expected.written }} <span>{{ expected.reading }}</span></p>
        <p>{{ expected.rule }}</p>
        <div class="feedback-example"><p lang="ja">{{ sentence }}</p><p>{{ question.verb.examples[question.form].zh }}</p></div>
        <div class="conjugation-audio-actions"><button type="button" class="quiet-button" :disabled="pronunciation.sentenceSpeaking.value || !pronunciation.canPlaySentence(expected.written)" :title="pronunciation.sentenceSourceLabel(expected.written)" @click="speak(expected.written, expected.reading)"><Volume2 :size="16" aria-hidden="true"/>听听这个变化</button><button type="button" class="quiet-button" :disabled="pronunciation.sentenceSpeaking.value || !pronunciation.canPlaySentence(sentence)" :title="pronunciation.sentenceSourceLabel(sentence)" @click="speak(sentence)"><Volume2 :size="16" aria-hidden="true"/>朗读例句</button></div>
        <p class="audio-note">{{ pronunciation.sentenceSourceLabel(sentence) }}</p>
        <p v-if="pronunciation.sentenceError.value" class="audio-note">{{ pronunciation.sentenceError.value }}</p>
        <button type="button" class="primary next-conjugation" @click="next(question.id)">{{ round.index + 1 === round.questions.length ? '完成本轮' : '下一题' }} <ArrowRight :size="16" aria-hidden="true"/></button>
      </div>
    </section>

    <section v-else-if="finished && round" class="conjugation-complete" aria-labelledby="conjugation-complete-heading">
      <span class="completion-mark"><Check :size="27" aria-hidden="true"/></span><h2 id="conjugation-complete-heading" ref="completeHeading" tabindex="-1">这一轮变化，练完了。</h2>
      <p>{{ round.questions.length }} 题中答对 {{ correctCount }} 题{{ incorrect.length ? `，还有 ${incorrect.length} 题可以再看一眼。` : '，继续把这些变化用起来。' }}</p>
      <ul v-if="incorrect.length" class="conjugation-corrections"><li v-for="item in incorrect" :key="item.id"><span><strong lang="ja">{{ item.verb.term }}</strong><small>{{ formLabel(item.form) }}</small></span><span lang="ja">{{ conjugate(item.verb, item.form).written }}<small>{{ conjugate(item.verb, item.form).reading }}</small></span></li></ul>
      <div class="completion-actions"><button v-if="incorrect.length" type="button" class="primary" @click="retry"><RotateCcw :size="16" aria-hidden="true"/>再练错题 · {{ incorrect.length }} 题</button><button type="button" :class="{ primary: !incorrect.length }" @click="start">继续下一轮</button><button type="button" @click="configure">调整练习</button><RouterLink v-if="returnToStudy" class="button" to="/study">回到学习</RouterLink></div>
    </section>
    <p class="conjugation-footnote">本次是用法练习，不改变词书复习进度。</p>
  </div>
</template>

<style scoped>
.conjugation-audio-actions{display:flex;gap:8px 16px;align-items:center;flex-wrap:wrap}.conjugation-audio-actions>button{display:inline-flex;align-items:center;gap:6px}
.conjugation-page{--ink:#273c35}
.conjugation-page input,.conjugation-feedback h3{scroll-margin-block:110px 130px}
.conjugation-feedback h3:focus,.conjugation-complete h2:focus{outline:none}
.conjugation-page{max-width:880px;margin:0 auto;padding-bottom:40px}.conjugation-heading{gap:18px;align-items:end}.verb-count{color:var(--muted);font-size:12px;line-height:1.7}.conjugation-setup,.conjugation-exercise,.conjugation-complete{padding:30px;border:1px solid var(--line);border-radius:var(--radius-panel);background:var(--paper);box-shadow:var(--shadow-panel);margin:20px 0}.conjugation-setup h2{font-size:20px;margin:0 0 22px}.practice-options{display:grid;grid-template-columns:1.3fr 1fr;gap:20px}.practice-options label{display:grid;gap:8px;color:var(--ink);font-size:13px;font-weight:600}.practice-options select{width:100%;min-width:0;min-height:44px;margin:0;font-size:14px;border-radius:var(--radius-control);background:var(--surface-muted)}.practice-help,.conjugation-footnote{font-size:12px;line-height:1.8;color:var(--muted)}.practice-help{margin:14px 0}.start-conjugation{margin-top:4px;min-height:46px}.focused-verb{display:flex;align-items:baseline;flex-wrap:wrap;gap:10px;margin:0 0 22px;font-size:17px}.focused-verb>span{font-size:13px;color:var(--muted)}.focused-verb a{margin-left:auto;font-size:13px;color:var(--green);min-height:44px;display:inline-flex;align-items:center}.conjugation-guide{margin:24px 0;border-top:1px solid var(--line);padding-top:8px}.conjugation-guide summary{cursor:pointer;min-height:44px;display:flex;align-items:center;color:var(--green);font-size:14px}.guide-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;padding:8px 0}.guide-grid h3{font-size:15px;margin:0 0 10px}.guide-grid p{font-size:13px;line-height:1.9;color:var(--muted);margin:8px 0;overflow-wrap:anywhere}.exercise-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--muted);font-size:13px}.quiet-button{background:transparent;border:0;color:var(--green);min-height:44px;padding:8px;font-size:13px}.conjugation-exercise progress{width:100%;height:4px;display:block;border:0;margin:10px 0 30px;accent-color:var(--green)}.question-word>span{font-size:12px;color:var(--muted)}.question-word h2{margin:14px 0 0;font-size:42px;font-weight:600}.question-word p{font-size:16px;margin:4px 0 0;color:var(--muted)}.target-form{margin:24px 0 12px;font-size:16px}.target-form strong{color:var(--green);margin-left:5px}.sentence-context{color:var(--ink);font-size:18px;line-height:1.9;margin:0 0 22px;overflow-wrap:anywhere}.conjugation-answer label{display:block;color:var(--muted);font-size:12px;margin-bottom:8px}.conjugation-answer input{width:100%;box-sizing:border-box;font-size:20px;min-height:56px;margin:0;border-radius:var(--radius-control)}.conjugation-answer input[readonly]{background:#f2f5ef;color:#51634e}.conjugation-answer button{min-height:46px;width:100%}.hint-toggle{margin-top:8px}.conjugation-hint{font-size:13px;line-height:1.8;color:var(--muted);padding:12px 0;border-top:1px solid var(--line);margin:0}.conjugation-feedback{margin-top:22px;padding:22px;background:#eef4e9;border:1px solid #c8d9bc;border-radius:var(--radius-inset)}.conjugation-feedback.answer-incorrect{background:#f8f3e7;border-color:#e0d2b3}.conjugation-feedback h3{display:flex;align-items:center;gap:8px;margin:0;font-size:16px;color:var(--green)}.conjugation-feedback.answer-incorrect h3{color:#795722}.expected-answer{font-size:27px;color:var(--ink);margin:16px 0 8px;overflow-wrap:anywhere}.expected-answer>span{font-size:14px;color:var(--muted);margin-left:12px}.conjugation-feedback>p:not(.expected-answer){font-size:13px;line-height:1.85}.feedback-example{padding:16px 0;margin-top:16px;border-top:1px solid #d8e2cf}.feedback-example p{font-size:17px;line-height:1.8;margin:0;color:var(--ink);overflow-wrap:anywhere}.feedback-example p+p{font-size:13px;color:var(--muted);margin-top:4px}.next-conjugation{width:100%;min-height:46px;margin-top:16px}.conjugation-complete{text-align:center;padding:40px 30px}.completion-mark{display:inline-grid;place-items:center;width:62px;height:62px;border-radius:50%;background:#e7efdf;color:var(--green)}.conjugation-complete h2{font-size:27px;margin:20px 0 12px;line-height:1.5}.conjugation-complete>p{font-size:14px;color:var(--muted);line-height:1.8}.conjugation-corrections{list-style:none;padding:0;margin:24px 0;text-align:left}.conjugation-corrections li{display:flex;justify-content:space-between;gap:18px;border-top:1px solid var(--line);padding:14px 0;font-size:17px}.conjugation-corrections small{display:block;font-size:12px;line-height:1.7;color:var(--muted);margin-top:3px}.completion-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin-top:24px}.completion-actions button{min-height:46px}.conjugation-footnote{text-align:center;margin:20px 0}.conjugation-page button:focus-visible,.conjugation-page select:focus-visible,.conjugation-page input:focus-visible,.conjugation-page summary:focus-visible{outline:3px solid #b08037;outline-offset:3px}.audio-note{color:var(--muted);font-size:12px}.conjugation-page button{touch-action:manipulation}.conjugation-page button:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:760px){.conjugation-heading{display:block}.verb-count{display:block;margin-top:14px}.conjugation-setup,.conjugation-exercise,.conjugation-complete{padding:22px 18px}.practice-options{grid-template-columns:minmax(0,1fr);gap:18px}.guide-grid{grid-template-columns:minmax(0,1fr);gap:16px}.question-word h2{font-size:36px}.conjugation-feedback{padding:18px 15px}.conjugation-complete h2{font-size:24px}.completion-actions{flex-direction:column}.completion-actions button{width:100%}.sentence-context{font-size:17px}.focused-verb a{margin-left:0}}
</style>
