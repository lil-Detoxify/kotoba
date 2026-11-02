<script setup lang="ts">
import {computed} from 'vue';
import {ChevronDown} from 'lucide-vue-next';
import type {Word} from '@jp/models';
import type {SessionSummary as StudySessionSummary} from '../services/study-feedback';
import {meaningPresentation} from '../services/meaning-presentation';

const props=defineProps<{
  summary:StudySessionSummary;
  busy:boolean;
  showPracticeAction?:boolean;
}>();

const emit=defineEmits<{practice:[words:Word[]]}>();

const quizPercent=computed(()=>{
  const {accuracy,correct,total}=props.summary.quiz;
  return accuracy??(total?Math.round(correct/total*100):null);
});

function wordMeaning(word:Word){
  return meaningPresentation(word).summary;
}

function wordLabel(word:Word){
  return word.reading?`${word.term}（${word.reading}）`:word.term;
}
</script>

<template>
  <section class="session-summary" :aria-busy="busy" aria-labelledby="session-summary-title">
    <div class="summary-heading">
      <h2 id="session-summary-title">本次学习</h2>
      <p class="summary-counts">
        <span>新学 <strong>{{summary.newCount}}</strong> 词</span>
        <span>温习 <strong>{{summary.reviewCount}}</strong> 词</span>
      </p>
      <p v-if="summary.skippedCount>0" class="skipped-note">另有 {{summary.skippedCount}} 词跳过，未计入学习结果。</p>
    </div>

    <p v-if="!summary.newWords.length&&!summary.reviewWords.length" class="summary-empty">
      这一轮没有记录到新学或温习的词。慢慢来，下次可以从几词开始。
    </p>

    <section v-if="summary.newWords.length" class="word-group" aria-labelledby="new-words-title">
      <h3 id="new-words-title">新学的词 <span>{{summary.newWords.length}}</span></h3>
      <ul class="word-list">
        <li v-for="word in summary.newWords.slice(0,4)" :key="word.id" class="word-item">
          <div class="word-label"><strong lang="ja">{{word.term}}</strong><span v-if="word.reading">{{word.reading}}</span></div>
          <p>{{wordMeaning(word)}}</p>
        </li>
      </ul>
      <details v-if="summary.newWords.length>4" class="more-words">
        <summary><span>查看其余 {{summary.newWords.length-4}} 词</span><ChevronDown :size="18" aria-hidden="true" class="more-words-chevron"/></summary>
        <ul class="word-list">
          <li v-for="word in summary.newWords.slice(4)" :key="word.id" class="word-item">
            <div class="word-label"><strong lang="ja">{{word.term}}</strong><span v-if="word.reading">{{word.reading}}</span></div>
            <p>{{wordMeaning(word)}}</p>
          </li>
        </ul>
      </details>
    </section>

    <section v-if="summary.reviewWords.length" class="word-group" aria-labelledby="review-words-title">
      <h3 id="review-words-title">温习的词 <span>{{summary.reviewWords.length}}</span></h3>
      <ul class="word-list">
        <li v-for="word in summary.reviewWords.slice(0,4)" :key="word.id" class="word-item">
          <div class="word-label"><strong lang="ja">{{word.term}}</strong><span v-if="word.reading">{{word.reading}}</span></div>
          <p>{{wordMeaning(word)}}</p>
        </li>
      </ul>
      <details v-if="summary.reviewWords.length>4" class="more-words">
        <summary><span>查看其余 {{summary.reviewWords.length-4}} 词</span><ChevronDown :size="18" aria-hidden="true" class="more-words-chevron"/></summary>
        <ul class="word-list">
          <li v-for="word in summary.reviewWords.slice(4)" :key="word.id" class="word-item">
            <div class="word-label"><strong lang="ja">{{word.term}}</strong><span v-if="word.reading">{{word.reading}}</span></div>
            <p>{{wordMeaning(word)}}</p>
          </li>
        </ul>
      </details>
    </section>

    <section v-if="summary.quiz.total>0" class="result-section quiz-result" aria-label="答题结果">
      <h3>答题结果</h3>
      <p><span><strong>{{summary.quiz.correct}} / {{summary.quiz.total}}</strong> 题答对</span><span>正确率 <strong>{{quizPercent}}%</strong></span><span v-if="summary.quiz.incorrect">{{summary.quiz.incorrect}} 题未答对</span></p>
    </section>

    <section v-if="summary.self.total>0" class="result-section self-result" aria-label="自主评价结果">
      <h3>自主评价 <span>共 {{summary.self.total}} 词</span></h3>
      <p><span>忘记 <strong>{{summary.self.forgotten}}</strong></span><span>模糊 <strong>{{summary.self.uncertain}}</strong></span><span>记得 <strong>{{summary.self.remembered}}</strong></span></p>
    </section>

    <section v-if="summary.practiceWords.length" class="practice-section" aria-labelledby="practice-title">
      <div class="practice-copy">
        <h3 id="practice-title">需要再看 {{summary.practiceWords.length}} 词</h3>
        <p class="practice-preview">{{summary.practiceWords.slice(0,3).map(wordLabel).join('、')}}<span v-if="summary.practiceWords.length>3"> 等 {{summary.practiceWords.length}} 词</span></p>
      </div>
      <button
        v-if="showPracticeAction!==false"
        type="button"
        class="practice-button"
        :disabled="busy"
        @click="emit('practice',summary.practiceWords)"
      >再练这些词</button>
    </section>
  </section>
</template>

<style scoped>
.session-summary{padding:22px clamp(16px,4vw,24px);background:var(--paper);border:1px solid var(--border-soft);border-radius:var(--radius-panel);box-shadow:var(--shadow-panel);color:#283b32;text-align:left}
.summary-heading h2,.word-group h3,.result-section h3,.practice-copy h3{margin:0;color:var(--green);font-weight:600}
.summary-heading h2{font-size:19px;line-height:1.5}
.summary-counts{display:flex;flex-wrap:wrap;gap:8px 22px;margin:8px 0 0;font-size:15px;line-height:1.6}
.summary-counts strong{font-size:20px;font-variant-numeric:tabular-nums}
.skipped-note,.summary-empty{margin:5px 0 0;color:var(--muted);font-size:14px;line-height:1.7}
.summary-empty{padding:15px 0 0}
.word-group,.result-section,.practice-section{margin-top:17px;padding-top:14px;border-top:1px solid var(--line)}
.word-group h3,.result-section h3,.practice-copy h3{font-size:15px;line-height:1.6}
.word-group h3 span,.self-result h3 span{margin-left:7px;color:var(--muted);font-size:14px;font-weight:400}
.word-list{margin:5px 0 0;padding:0;list-style:none}
.word-item{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(0,1.7fr);gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px;line-height:1.6}
.word-item:last-child{border-bottom:0}
.word-label{display:flex;flex-direction:column;align-items:flex-start;min-width:0}
.word-label strong{overflow-wrap:anywhere;font-size:15px;font-weight:600}
.word-label span,.word-item p{margin:1px 0 0;color:var(--muted)}
.word-item p{min-width:0;overflow-wrap:anywhere}
.more-words summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;width:fit-content;max-width:100%;padding:6px 10px;border:1px solid transparent;border-radius:var(--radius-control);color:var(--green);font-size:14px;font-weight:600;cursor:pointer;transition:background var(--motion-fast) var(--ease-ui),border-color var(--motion-fast) var(--ease-ui)}
.more-words summary:hover{background:var(--surface-muted);border-color:var(--border-soft)}
.more-words[open] summary{background:var(--surface-selected);border-color:var(--border-strong)}
.more-words summary:focus-visible{outline:3px solid #b08037;outline-offset:2px;border-radius:var(--radius-control)}
.more-words[open] summary{margin-bottom:2px}
.more-words-chevron{flex:none;transition:transform var(--motion-fast) var(--ease-ui)}
.more-words[open] .more-words-chevron{transform:rotate(180deg)}
.result-section p{display:flex;flex-wrap:wrap;gap:8px 18px;margin:4px 0 0;color:var(--muted);font-size:14px;line-height:1.7}
.result-section p strong{color:#283b32;font-size:16px;font-variant-numeric:tabular-nums}
.self-result p span{white-space:nowrap}
.practice-section{display:flex;align-items:center;justify-content:space-between;gap:14px}
.practice-copy{min-width:0}
.practice-preview{margin:3px 0 0;color:var(--muted);font-size:14px;line-height:1.6;overflow-wrap:anywhere}
.practice-button{flex:none;min-height:44px;padding:9px 15px;border:1px solid var(--green);border-radius:var(--radius-control);background:var(--green);color:#fff;font:inherit;font-size:14px;cursor:pointer;transition:background var(--motion-fast) var(--ease-ui),border-color var(--motion-fast) var(--ease-ui),box-shadow var(--motion-fast) var(--ease-ui)}
.practice-button:not(:disabled):hover{background:#274b38}
.practice-button:disabled{opacity:.58;cursor:wait}
.practice-button:focus-visible{outline:3px solid #b08037;outline-offset:3px}
@media(max-width:420px){.session-summary{padding-block:17px}.word-item{grid-template-columns:minmax(82px,.75fr) minmax(0,1.6fr);gap:9px}.practice-section{align-items:stretch;flex-direction:column;gap:9px}.practice-button{width:100%}}
</style>
