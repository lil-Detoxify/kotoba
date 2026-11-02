<script setup lang="ts">
import {ref,watch,computed} from 'vue';
import {ArrowUpRight} from 'lucide-vue-next';
import type {Word} from '@jp/models';
import DictionaryComparisonPanel from './DictionaryComparisonPanel.vue';
import {learningExampleFor,type LearningExample} from '../services/learning-example';
import {meaningPresentation} from '../services/meaning-presentation';
import {usageFor} from '../services/learning-usage';
import {loadWordUsageDeepening} from '../services/learning-usage-deepening';
import {sentenceUsageFor} from '../services/sentence-usage';
import ReadingContextList from './ReadingContextList.vue';
import UsageNotes from './UsageNotes.vue';
import {conjugationFor} from '../services/conjugation';

const props=withDefaults(defineProps<{word:Word;showExample?:boolean;exampleOverride?:LearningExample;exampleLabel?:string;exampleAudioAvailable?:boolean;exampleCanPlay?:(ja:string)=>boolean;exampleSourceLabel?:(ja:string)=>string;exampleSpeaking?:boolean;exampleAudioError?:string}>(),{showExample:true,exampleAudioAvailable:false,exampleSpeaking:false,exampleAudioError:''});
const emit=defineEmits<{playExample:[example:{ja:string;reading:string;slow:boolean}];stopExample:[]}>();
const comparisonOpen=ref(false);
const showReading=ref(false);
const showTranslation=ref(true);
const context=computed(()=>props.exampleOverride??learningExampleFor(props.word));
const usage=computed(()=>usageFor(props.word));
const practiceVerb=computed(()=>conjugationFor(props.word));
const sample=context;
const displayExample=computed(()=>props.exampleOverride??(props.word.example?{ja:props.word.example,reading:props.word.exampleReading||'',zh:props.word.exampleTranslation||''}:sample.value));
const sentenceUsage=computed(()=>!usage.value&&!context.value?.tip?sentenceUsageFor(props.word,displayExample.value):undefined);
const canPlayExample=computed(()=>!!displayExample.value&& (props.exampleCanPlay?.(displayExample.value.ja)??props.exampleAudioAvailable));
const exampleSource=computed(()=>displayExample.value?props.exampleSourceLabel?.(displayExample.value.ja)??'设备日语语音':'');
function playExample(slow=false){
  const ja=displayExample.value?.ja;
  if(!ja)return;
  const reading=displayExample.value?.reading||'';
  emit('playExample',{ja,reading,slow});
}
const localSenses=computed(()=>{
  const senses=props.word.senses?.length&&!props.word.id.startsWith('dictionary-')?props.word.senses:[{meaning:props.word.meaning,partOfSpeech:props.word.partOfSpeech,definitionJa:props.word.definitionJa}];
  return senses.map(sense=>({...sense,presentation:meaningPresentation({lessonId:props.word.lessonId,meaning:sense.meaning})}));
});
const collectedSenses=computed(()=>props.word.id.startsWith('dictionary-')?props.word.senses??[]:[]);
watch(()=>props.word.id,()=>{comparisonOpen.value=false;showReading.value=false;showTranslation.value=true},{immediate:true});
watch(()=>[props.word.term,props.word.reading,props.word.lessonId],()=>{void loadWordUsageDeepening(props.word)},{immediate:true});
</script>

<template>
  <section class="definition-panel" aria-label="单词详细释义">
    <div class="definition-heading"><h2>释义</h2><span>词书释义</span></div>
    <div v-for="(sense,i) in localSenses" :key="i" class="local-sense">
      <div><span v-if="sense.partOfSpeech" class="pos-tag">{{sense.partOfSpeech}}</span><span v-if="localSenses.length>1" class="sense-number">{{i+1}}.</span><h2>{{sense.presentation.summary}}</h2></div>
      <details v-if="sense.presentation.hasMore" class="full-gloss"><summary>查看完整释义 <span>{{sense.presentation.parts.length}} 项</span></summary><ul><li v-for="part in sense.presentation.parts" :key="part">{{part}}</li></ul></details>
      <p v-if="sense.definitionJa" lang="ja">{{sense.definitionJa}}</p>
      <p v-if="sense.example" lang="ja">{{sense.example}}</p>
      <p v-if="sense.exampleReading" class="muted">{{sense.exampleReading}}</p>
      <p v-if="sense.exampleTranslation">{{sense.exampleTranslation}}</p>
    </div>
    <p v-if="word.definitionZh">{{word.definitionZh}}</p>
    <details v-if="collectedSenses.length>1" class="full-gloss">
      <summary>收藏词条的完整释义 <span>{{collectedSenses.length}} 项</span></summary>
      <ol><li v-for="(sense,index) in collectedSenses" :key="index"><span v-if="sense.partOfSpeech">{{sense.partOfSpeech}} · </span>{{sense.meaning}}</li></ol>
    </details>

    <section v-if="showExample&&displayExample" class="example-section">
      <div class="definition-heading"><h3>用例展示</h3><span>{{exampleLabel??(exampleOverride?'场景例句':word.example?'词书例句':'Kotobud 学习例句')}}</span></div>
      <p class="example-ja" lang="ja">{{displayExample.ja}}</p>
      <p v-if="showReading&&displayExample.reading" class="example-reading" lang="ja">{{displayExample.reading}}</p>
      <p v-if="showTranslation&&displayExample.zh" class="example-translation">{{displayExample.zh}}</p>
      <div v-if="canPlayExample" class="example-audio" role="group" aria-label="用例朗读">
        <button type="button" @click="playExample()">朗读用例</button>
        <button type="button" @click="playExample(true)">慢速</button>
        <button v-if="exampleSpeaking" type="button" @click="emit('stopExample')">停止</button>
        <small>{{exampleSource}}</small>
      </div>
      <p v-else class="example-audio-note">设备暂未提供日语朗读语音</p>
      <p v-if="exampleAudioError" class="error" role="status">{{exampleAudioError}}</p>
      <div class="example-tools" role="group" aria-label="例句显示方式">
        <button v-if="displayExample.reading||usage?.collocation.reading" type="button" :aria-pressed="showReading" @click="showReading=!showReading">{{showReading?'收起读音':displayExample.reading?'显示读音':'显示搭配读音'}}</button>
        <button v-if="displayExample.zh" type="button" :aria-pressed="showTranslation" @click="showTranslation=!showTranslation">{{showTranslation?'隐藏翻译':'显示翻译'}}</button>
      </div>
      <template v-if="!usage">
        <div v-if="context?.collocation" class="collocation-line"><span>常用搭配</span><strong lang="ja">{{context.collocation.ja}}</strong><small v-if="showReading" lang="ja">{{context.collocation.reading}}</small><p v-if="showTranslation">{{context.collocation.zh}}</p></div>
        <p v-if="context?.tip" class="usage-tip">{{context.tip}}</p>
        <p v-else-if="sentenceUsage" class="usage-tip"><span class="sentence-usage-label">本句用法</span>{{sentenceUsage.note}}</p>
      </template>
    </section>

    <div v-if="usage&&(!showExample||!displayExample)" class="usage-display-tools" role="group" aria-label="搭配显示方式">
      <button v-if="usage.collocation.reading||usage.contrast?.reading||usage.contrast?.collocation.reading" type="button" :aria-pressed="showReading" @click="showReading=!showReading">{{showReading?'收起搭配读音':'显示搭配读音'}}</button>
      <button v-if="usage.collocation.zh||usage.contrast?.collocation.zh" type="button" :aria-pressed="showTranslation" @click="showTranslation=!showTranslation">{{showTranslation?'隐藏搭配翻译':'显示搭配翻译'}}</button>
    </div>
    <UsageNotes v-if="usage" :key="word.id" :usage="usage" :show-reading="showReading" :show-translation="showTranslation" />
    <RouterLink v-if="practiceVerb" class="conjugation-word-link" :to="`/conjugation?verb=${practiceVerb.id}&return=study`">练习「{{practiceVerb.term}}」的活用 <ArrowUpRight :size="15" aria-hidden="true"/></RouterLink>

    <ReadingContextList :word-id="word.id" :compact="exampleLabel==='我的原句'" />

    <button type="button" class="dictionary-section dictionary-drawer" aria-haspopup="dialog" @click="comparisonOpen=true">
      <span class="dictionary-summary-copy"><strong>词典对照</strong><small>中文译释 · 英文原义 · 日文解释</small></span>
      <span class="dictionary-toggle">更多释义 <ArrowUpRight :size="17" :stroke-width="1.6" aria-hidden="true"/></span>
    </button>
    <DictionaryComparisonPanel :open="comparisonOpen" :term="word.term" :reading="word.reading" :part-of-speech="word.partOfSpeech" @close="comparisonOpen=false" />
    <p v-if="word.note" class="word-note">笔记 · {{word.note}}</p>
  </section>
</template>

<style scoped>
.conjugation-word-link{display:inline-flex;align-items:center;gap:7px;min-height:44px;margin-top:8px;color:var(--green);font-size:13px;text-underline-offset:4px}.conjugation-word-link:focus-visible{outline:3px solid var(--focus-ring);outline-offset:3px;border-radius:4px}
.full-gloss{margin:8px 0 0}
.full-gloss summary{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;color:#667667;font-size:12px;line-height:1.6;padding:6px 0;border-radius:var(--radius-control);transition:color var(--motion-fast) var(--ease-ui)}
.full-gloss summary span{margin-left:0;font-variant-numeric:tabular-nums}
.full-gloss ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 24px;margin:10px 0 0;padding-left:18px;color:#58694f;font-size:13px;line-height:1.7}
.full-gloss li{overflow-wrap:anywhere}
@media(max-width:560px){.full-gloss ul{grid-template-columns:1fr}}
.example-section{margin:22px 0;padding:22px 0 0;border-top:1px solid var(--line)}
.example-section .example-ja{font-size:22px;line-height:1.8;letter-spacing:.015em;margin:14px 0 8px}
.example-translation{font-size:14px;line-height:1.7;color:#596a51;margin:8px 0}
.example-tools{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.example-audio{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:10px 0}
.example-audio button{min-height:44px;padding:7px 12px;font-size:12px;background:transparent;border-color:var(--line)}
.example-audio small,.example-audio-note{font-size:11px;color:var(--muted);line-height:1.6}
.example-tools button{min-height:44px;padding:8px 12px;font-size:12px;background:var(--surface-muted);border-color:var(--border-soft);border-radius:var(--radius-control);color:#52684d;transition:background var(--motion-fast) var(--ease-ui),border-color var(--motion-fast) var(--ease-ui),color var(--motion-fast) var(--ease-ui)}
.example-tools button:hover,.usage-display-tools button:hover{background:var(--surface-selected);border-color:var(--border-strong)}
.example-tools button,.example-audio button,.usage-display-tools button{scroll-margin-block:90px 150px}
.example-tools button[aria-pressed=true],.usage-display-tools button[aria-pressed="true"]{color:#365d3d;background:var(--surface-selected);border-color:var(--border-strong)}
.collocation-line{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px;align-items:baseline;margin-top:18px;padding-left:14px;border-left:2px solid var(--border-strong)}
.collocation-line>span{font-size:11px;color:var(--muted)}
.collocation-line strong{font-size:17px;font-weight:500;line-height:1.65;color:var(--green)}
.collocation-line small,.collocation-line p{grid-column:2;color:#6b7960;font-size:12px;line-height:1.6;margin:0}
.usage-tip{margin:16px 0 0;color:#65745c;font-size:12px;line-height:1.8}
.sentence-usage-label{display:block;color:var(--muted);font-size:10px;margin-bottom:4px}
.usage-display-tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.usage-display-tools button{min-height:44px;padding:8px 12px;border:1px solid var(--border-soft);border-radius:var(--radius-control);background:var(--surface-muted);color:#52684d;font-size:12px;transition:background var(--motion-fast) var(--ease-ui),border-color var(--motion-fast) var(--ease-ui),color var(--motion-fast) var(--ease-ui)}
.dictionary-drawer{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;margin:20px 0 0;border:1px solid var(--border-soft);border-radius:var(--radius-control);background:transparent;box-shadow:none;min-height:72px;padding:14px;text-align:left;transform:none;transition:background var(--motion-fast) var(--ease-ui),border-color var(--motion-fast) var(--ease-ui)}
.dictionary-summary-copy{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}
.dictionary-drawer strong{color:var(--green);font-size:14px;font-weight:600;line-height:1.35}
.dictionary-drawer small{color:var(--muted);font-size:11px;font-weight:400;line-height:1.4}
.dictionary-toggle{display:inline-flex;align-items:center;gap:8px;flex:none;color:var(--green);font-size:13px;font-weight:500;line-height:1.35;text-decoration-line:underline;text-decoration-color:#c5d4bd;text-decoration-thickness:1px;text-underline-offset:4px;white-space:nowrap}
.dictionary-drawer:hover{background:var(--surface-muted);border-color:var(--border-strong);box-shadow:none;transform:none}.dictionary-drawer:hover .dictionary-toggle{text-decoration-color:var(--green)}
.dictionary-drawer:focus-visible{outline:3px solid var(--focus-ring);outline-offset:3px;border-radius:var(--radius-control)}
@media(max-width:560px){.example-section .example-ja{font-size:19px}.collocation-line{gap:4px 10px}.collocation-line strong{font-size:16px}.dictionary-drawer summary>span:first-child{gap:8px}.example-tools button{min-height:44px}}
</style>
