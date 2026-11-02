<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {WordState} from '@jp/models';
import {normalizeVocabularySearchText} from '@jp/shared';
import {useApp} from '../store';
import MeaningPreview from '../components/MeaningPreview.vue';
import ReadingContextList from '../components/ReadingContextList.vue';
import PersonalReadingContexts,{type PersonalReadingContextEntry} from '../components/PersonalReadingContexts.vue';
import {contextClozeExample} from '../services/personal-learning-example';
import {fullBookTitle} from '../services/book-presentation';

const route=useRoute();const router=useRouter();const app=useApp();
const ignored=computed(()=>route.path==='/ignored');
const originals=computed(()=>!ignored.value&&route.query.view==='contexts');
const book=ref('');const lesson=ref('');const sentenceSearch=ref('');
const starting=ref(false);const error=ref('');
const owner=computed(()=>app.currentUser?.id??'local');
const statesByWord=computed(()=>{
  const states=new Map<string,WordState>();const userId=owner.value;
  for(const state of app.data.states){
    if((state.userId===userId||state.userId==='local')&&!states.has(state.wordId))states.set(state.wordId,state);
  }
  return states;
});
const wordState=(wordId:string)=>statesByWord.value.get(wordId);
watch(book,()=>lesson.value='');
watch(()=>app.currentUser?.id,()=>{book.value='';lesson.value='';sentenceSearch.value='';error.value=''});
const lessons=computed(()=>app.data.lessons.filter(l=>!book.value||l.bookId===book.value));
const lessonIds=computed(()=>new Set(lessons.value.map(l=>l.id)));
const scopedWords=computed(()=>app.data.words.filter(w=>(!book.value||lessonIds.value.has(w.lessonId))&&(!lesson.value||w.lessonId===lesson.value)));
const words=computed(()=>scopedWords.value.filter(w=>{const s=wordState(w.id);return ignored.value?s?.isIgnored:s?.isDifficult}));
const allContextCount=computed(()=>app.data.words.reduce((total,w)=>total+app.readingContextsForWord(w.id).length,0));
const contexts=computed<PersonalReadingContextEntry[]>(()=>{
  const needle=normalizeVocabularySearchText(sentenceSearch.value);
  return scopedWords.value.flatMap(word=>{
    const savedContexts=app.readingContextsForWord(word.id);
    if(!savedContexts.length)return [];
    const sourceLesson=app.data.lessons.find(l=>l.id===word.lessonId);
    const sourceBook=app.data.books.find(b=>b.id===sourceLesson?.bookId);
    return savedContexts.map(context=>({
      word,context,bookTitle:sourceBook?fullBookTitle(sourceBook):'我的词条',lessonTitle:sourceLesson?.title??'',
      ignored:!!wordState(word.id)?.isIgnored,canPractice:!!contextClozeExample(word,context),
    }));
  }).filter(entry=>!needle||normalizeVocabularySearchText([entry.word.term,entry.word.reading,entry.context.sentence,entry.context.translation,entry.context.sourceTitle,entry.context.sourceUrl,entry.bookTitle].filter(Boolean).join(' ')).includes(needle))
    .sort((a,b)=>(Date.parse(b.context.updatedAt)||0)-(Date.parse(a.context.updatedAt)||0));
});
const practiceContexts=computed(()=>{
  const seen=new Set<string>();
  return contexts.value.filter(entry=>{
    if(entry.ignored||!entry.canPractice||seen.has(entry.word.id))return false;
    seen.add(entry.word.id);return true;
  });
});
function clearFilters(){book.value='';lesson.value='';sentenceSearch.value=''}
async function study(){
  if(starting.value||app.busy)return;
  starting.value=true;error.value='';
  try{if(await app.start('difficult',lesson.value?[lesson.value]:lessons.value.map(l=>l.id)))await router.push('/study');else error.value=app.error||'暂时没有可学习的生词。'}
  catch{error.value='学习暂时无法开始，请重试。'}finally{starting.value=false}
}
async function practice(entries:PersonalReadingContextEntry[]){
  if(starting.value||app.busy)return;
  starting.value=true;error.value='';const userId=app.currentUser?.id??null;
  try{
    const started=await app.startReadingContextPractice(entries.map(entry=>({wordId:entry.word.id,contextId:entry.context.id})));
    if(userId!==(app.currentUser?.id??null))return;
    if(started)await router.push('/study');else error.value=app.error||'这些原句暂时不能用于填空，可以先在复习中阅读。';
  }catch{if(userId===(app.currentUser?.id??null))error.value='原句练习暂时无法开始，请重试。'}finally{starting.value=false}
}
</script>

<template>
  <section class="page-heading">
    <div><p class="eyebrow">{{originals?'SENTENCES YOU KEPT':'A LITTLE MORE ATTENTION'}}</p><h1>{{ignored?'忽略列表':originals?'我的原句':'我的生词本'}}</h1><p class="muted">{{ignored?'暂时跳过的词，随时可以恢复学习。':originals?'复习时优先展示你的原句，也可以用词形完整的句子练习填空。':'值得多见几次的词，留在这里慢慢熟悉。'}}</p></div>
    <button v-if="originals" class="primary" :disabled="!practiceContexts.length||app.busy||starting" @click="practice(practiceContexts)">{{starting?'准备中…':'用原句练习 →'}}</button>
    <button v-else-if="!ignored" class="primary" :disabled="!words.some(w=>!wordState(w.id)?.isIgnored)||app.busy||starting" @click="study">开始学习生词 →</button>
  </section>
  <div class="tabs personal-list-tabs" role="navigation" aria-label="生词与原句">
    <RouterLink to="/difficult" :aria-current-value="!ignored&&!originals?'page':'false'" :class="{'list-tab-selected':!ignored&&!originals}">生词本</RouterLink>
    <RouterLink to="/difficult?view=contexts" :aria-current-value="originals?'page':'false'" :class="{'list-tab-selected':originals}">我的原句<span v-if="allContextCount" class="context-count">{{allContextCount}}</span></RouterLink>
    <RouterLink to="/ignored" :aria-current-value="ignored?'page':'false'" :class="{'list-tab-selected':ignored}">忽略列表</RouterLink>
  </div>
  <div class="selection-tools context-selection-tools" :class="{'is-originals':originals}">
    <div class="actions">
      <label>词书<select v-model="book"><option value="">全部词书</option><option v-for="b in app.data.books" :key="b.id" :value="b.id">{{b.title}}</option></select></label>
      <label>课次<select v-model="lesson"><option value="">全部课次</option><option v-for="l in lessons" :key="l.id" :value="l.id">{{l.title}}</option></select></label>
      <label v-if="originals" class="context-search">搜索原句<input v-model="sentenceSearch" type="search" placeholder="句子、关联词或来源" maxlength="200" /></label>
    </div>
    <span>{{originals?contexts.length+' 条原句 · '+practiceContexts.length+' 个词可练':words.length+' 个词'}}</span>
  </div>
  <p v-if="error" class="error" role="alert">{{error}}</p>
  <template v-if="originals">
    <div v-if="!contexts.length" class="empty">
      <template v-if="!allContextCount">还没有收藏原句。遇到想记住的一句话时，可以在查词结果中收藏。<RouterLink to="/search">去查词，收藏原句 →</RouterLink></template>
      <template v-else>没有匹配的原句。试试其他关键词或词书。<button type="button" @click="clearFilters">清除筛选</button></template>
    </div>
    <PersonalReadingContexts :entries="contexts" :busy="starting" @practice="practice([$event])" />
  </template>
  <template v-else>
    <div v-if="!words.length" class="empty">{{ignored?'没有被忽略的单词。':'还没有生词。在学习时点击书签，就能收藏到这里。'}}</div>
    <div v-for="w in words" :key="w.id" class="word-row"><div><h3 lang="ja">{{w.term}} <small>{{w.reading}}</small></h3><MeaningPreview :word="w" /><small>{{app.data.lessons.find(l=>l.id===w.lessonId)?.title}}{{!ignored&&wordState(w.id)?.isIgnored?' · 已忽略，不参与练习':''}}</small><ReadingContextList :word-id="w.id" compact editable /></div><button :disabled="app.busy" @click="app.flag(w.id,ignored?'isIgnored':'isDifficult',false)">{{ignored?'恢复学习':'取消生词'}}</button></div>
  </template>
</template>

<style scoped>
.personal-list-tabs{gap:26px;flex-wrap:wrap}
.personal-list-tabs a{min-height:44px;transition:color var(--motion-fast) ease,border-color var(--motion-fast) ease}
.personal-list-tabs a.router-link-active{border-bottom-color:transparent;color:var(--muted)}
.personal-list-tabs a.list-tab-selected{border-bottom:2px solid var(--green);color:var(--green)}
.context-count{margin-left:7px;font-size:11px;font-variant-numeric:tabular-nums}
.context-selection-tools{align-items:flex-end;flex-wrap:wrap;padding:20px 24px;border:1px solid var(--line);border-radius:var(--radius-inset);background:var(--paper);gap:16px}
.context-selection-tools .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;flex:1;min-width:0}
.context-selection-tools.is-originals .actions{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(200px,1.2fr)}
.context-selection-tools label{display:grid;gap:7px;min-width:0;align-items:start;font-size:12px}
.context-selection-tools select,.context-selection-tools input{width:100%;max-width:100%;min-width:0;margin-top:0;min-height:44px;border-radius:var(--radius-control);background:var(--surface-muted)}
.context-search{min-width:0}
.context-selection-tools>span{font-size:12px;line-height:1.6;color:var(--muted)}
.empty button{margin-top:14px}
@media(max-width:760px){.context-selection-tools{padding:16px}.context-selection-tools .actions,.context-selection-tools.is-originals .actions{width:100%;flex-basis:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.context-selection-tools .context-search{grid-column:1/-1}.personal-list-tabs{gap:20px}}
</style>
