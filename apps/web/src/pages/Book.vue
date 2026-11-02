<script setup lang="ts">
import { bookSourceUrl } from '../services/book-presentation';
import MeaningPreview from '../components/MeaningPreview.vue';
import PersonalVocabularyEditor from '../components/PersonalVocabularyEditor.vue';
import ClozePracticePanel from '../components/ClozePracticePanel.vue';
import BookStudyEntry from '../components/BookStudyEntry.vue';
import {dailyStudyPlan} from '../services/daily-study-plan';
import {nextUnlearnedLesson} from '../services/next-unlearned-lesson';
import {createSentenceCloze} from '../services/sentence-cloze';
import {loadBookLearningExamples} from '../services/book-learning-examples';
import { useStudyPlanPreference, type DailyPace } from '../services/study-plan-preference';
import {computed,ref,watch,nextTick} from 'vue';import {useRoute,useRouter} from 'vue-router';import {ArrowLeft,ArrowRight,ChevronDown} from 'lucide-vue-next';import {useApp} from '../store';import {progress,selectRange,stateFor} from '@jp/core';
const app=useApp();const route=useRoute();const router=useRouter();const book=computed(()=>app.data.books.find(b=>b.id===route.params.id));const studyPlan=useStudyPlanPreference();const dailyPace=computed(()=>book.value?studyPlan.getPace(book.value.id):1);const dailyPlanMessage=ref('');const lessons=computed(()=>app.data.lessons.filter(l=>l.bookId===book.value?.id).sort((a,b)=>a.order-b.order));const selected=ref<string[]>([]);const from=ref(1);const to=ref(2);watch(lessons,value=>{if(value.length){from.value=value[0].order;to.value=value[Math.min(1,value.length-1)].order}},{immediate:true});const editing=ref(false);const title=ref('');const desc=ref('');const deleting=ref(false);const expanded=ref('');
watch(()=>route.params.id,async id=>{
  if(typeof id!=='string')return;
  const [,loaded]=await Promise.all([app.ensureBookLoaded(id),loadBookLearningExamples(id)]);
  if(!loaded&&route.params.id===id)exampleError.value='用例暂时未能读取，刷新页面可重试。';
},{immediate:true});
const personalBook=computed(()=>!!book.value&&!app.metaBooks.some(item=>item.id===book.value!.id));
const editingVocabulary=ref(false);
watch(()=>book.value?.id,()=>{editingVocabulary.value=personalBook.value&&!app.data.words.some(word=>app.data.lessons.some(lesson=>lesson.bookId===book.value?.id&&lesson.id===word.lessonId))},{immediate:true});
watch(()=>route.query.lesson,value=>{if(typeof value==='string'&&lessons.value.some(l=>l.id===value))selected.value=[value]},{immediate:true});
const sourceHref = computed(() => book.value ? bookSourceUrl(book.value) : undefined);
const unitLabel = computed(() => sourceHref.value ? '组' : '课');
const dailyPlan=computed(()=>dailyStudyPlan(app.data,book.value?.id??'',dailyPace.value,app.now??new Date(),app.currentUser?.id??'local'));
const nextLesson=computed(()=>book.value?nextUnlearnedLesson(app.data,book.value.id,app.currentUser?.id??'local'):undefined);
const learningStarting=ref(false);
const resumeEntry=computed(()=>{
  const saved=app.studySession;
  if(!book.value||!app.hasResumableSession||!saved?.bookIds.includes(book.value.id))return;
  const lesson=saved.lessonIds?.length===1?app.data.lessons.find(item=>item.id===saved.lessonIds![0]):undefined;
  return {remaining:Math.max(0,saved.wordIds.length-saved.index),scope:saved.sceneId?'上次的场景练习':lesson?.title??'上次选择的学习内容'};
});
async function locateNextLesson(){
  if(!nextLesson.value||app.busy||learningStarting.value)return;
  const id=nextLesson.value.id;
  selected.value=[id];
  await nextTick();
  const row=Array.from(document.querySelectorAll<HTMLElement>('.lesson-row')).find(item=>item.dataset.lessonId===id);
  row?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus({preventScroll:true});
  row?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
const words=(id:string)=>app.data.words.filter(w=>w.lessonId===id);const lessonProgress=(id:string)=>progress(app.data,words(id));const count=computed(()=>app.data.words.filter(w=>selected.value.includes(w.lessonId)&&!stateFor(app.data,w.id)?.firstSeenAt&&!stateFor(app.data,w.id)?.isIgnored).length);
const exampleStarting=ref(false);const exampleError=ref('');
const eligibleBookWords=computed(()=>{
  const scope=new Set(lessons.value.map(lesson=>lesson.id));
  return app.data.words.filter(word=>scope.has(word.lessonId)&&!stateFor(app.data,word.id,app.currentUser?.id??'local')?.isIgnored);
});
const bookExamples=computed(()=>eligibleBookWords.value.filter(word=>!!createSentenceCloze(word)));
const selectedExamples=computed(()=>bookExamples.value.filter(word=>selected.value.includes(word.lessonId)));
const selectedExampleTotal=computed(()=>eligibleBookWords.value.filter(word=>selected.value.includes(word.lessonId)).length);
async function startExamples(){
  const bookId=book.value?.id;if(!bookId||exampleStarting.value||learningStarting.value||app.busy||!selectedExamples.value.length)return;
  exampleStarting.value=true;exampleError.value='';
  try{
    if(await app.startSentencePractice([...selected.value],bookId)){if(route.params.id===bookId)await router.push('/study');}
    else exampleError.value=app.error||'用例暂时无法开始，请重试。';
  }catch(error){exampleError.value=error instanceof Error?error.message:'用例暂时无法开始，请重试。';}
  finally{exampleStarting.value=false;}
}
watch(()=>route.params.id,()=>{exampleError.value=''});
function changeDailyPace(value:DailyPace){dailyPlanMessage.value='';if(book.value)studyPlan.setPace(book.value.id,value)}
async function startDailyPlan(){
  const id=book.value?.id;
  if(!id||learningStarting.value||app.busy||exampleStarting.value||!dailyPlan.value.remaining)return;
  learningStarting.value=true;dailyPlanMessage.value='';
  try{
    if(await app.startDailyLearning(id)){if(route.params.id===id)await router.push('/study');}
    else if(route.params.id===id)dailyPlanMessage.value=app.error||'今天的计划已完成，也可以自由选课继续。';
  }catch(error){dailyPlanMessage.value=error instanceof Error?error.message:'学习暂时无法开始，请重试。';}
  finally{learningStarting.value=false;}
}
async function continueBookLearning(){
  const id=book.value?.id;
  if(!id||!resumeEntry.value||learningStarting.value||app.busy||exampleStarting.value)return;
  learningStarting.value=true;dailyPlanMessage.value='';
  try{
    if(await app.continueLearning()){if(route.params.id===id)await router.push('/study');}
    else if(route.params.id===id)dailyPlanMessage.value=app.error||'上次的学习已经完成，可以按今日计划开始。';
  }catch(error){dailyPlanMessage.value=error instanceof Error?error.message:'上次的学习暂时无法继续，请重试。';}
  finally{learningStarting.value=false;}
}
function edit(){title.value=book.value?.title??'';desc.value=book.value?.description??'';editing.value=true}async function save(){if(book.value&&await app.editBook(book.value.id,title.value,desc.value))editing.value=false}async function remove(){if(book.value&&await app.removeBook(book.value.id))router.push('/books')}
async function start(){
  const id=book.value?.id;
  if(!id||learningStarting.value||app.busy||exampleStarting.value||!count.value)return;
  learningStarting.value=true;dailyPlanMessage.value='';
  try{if(await app.start('new',[...selected.value],id)){if(route.params.id===id)await router.push('/study');}else dailyPlanMessage.value=app.error||'所选课次暂时没有待学新词。';}
  catch(error){dailyPlanMessage.value=error instanceof Error?error.message:'学习暂时无法开始，请重试。';}
  finally{learningStarting.value=false;}
}
</script>
<template><template v-if="book"><RouterLink to="/books" class="back"><ArrowLeft :size="16"/> 我的词书</RouterLink><section class="page-heading"><div><p class="eyebrow">JAPANESE COLLECTION</p><h1>{{book.title}}</h1><p class="muted">{{book.description||'选一课，从这里开始。'}}</p><p v-if="sourceHref" class="muted"><a :href="sourceHref" target="_blank" rel="noopener">词表来源与分级说明 ↗</a></p></div><div class="actions"><button v-if="personalBook" type="button" :aria-expanded="editingVocabulary" @click="editingVocabulary=!editingVocabulary">{{editingVocabulary?'返回选课':'编辑词表'}}</button><button @click="edit">编辑</button><button class="danger-text" @click="deleting=true">删除词书</button></div></section><form v-if="editing" class="form-panel" @submit.prevent="save"><label>词书名称<input v-model="title" required maxlength="100"/></label><label>简介<textarea v-model="desc"/></label><div class="actions"><button class="primary" :disabled="app.busy">保存</button><button type="button" @click="editing=false">取消</button></div></form><div v-if="deleting" class="error" role="alert"><p>删除「{{book.title}}」及其学习记录？此操作无法撤销。</p><button :disabled="app.busy" @click="remove">确认删除</button> <button @click="deleting=false">取消</button></div><PersonalVocabularyEditor v-if="personalBook&&editingVocabulary" :book-id="book.id"/><template v-if="!editingVocabulary"><BookStudyEntry :key="book.id" :plan="dailyPlan" :pace="dailyPace" :unit-label="unitLabel" :resume="resumeEntry" :busy="app.busy||learningStarting||exampleStarting" @daily="startDailyPlan" @resume="continueBookLearning" @pace="changeDailyPace"/><p v-if="dailyPlanMessage" class="daily-plan-message" role="status">{{dailyPlanMessage}}</p><div class="section-title"><h2>自由选择{{ sourceHref ? '分组' : '课次' }} <small>{{lessons.length}} {{ unitLabel }}</small></h2><div class="next-lesson-tools"><span class="muted">无需按顺序解锁</span><button v-if="nextLesson" type="button" class="next-lesson-action" :disabled="app.busy||learningStarting||exampleStarting" @click="locateNextLesson">定位下一未学{{unitLabel}} <ArrowRight :size="16"/></button></div></div><details :key="book.id" class="batch-selection"><summary>批量选课 <ChevronDown :size="16" aria-hidden="true"/></summary><div class="selection-tools"><div class="actions"><button type="button" @click="selected=lessons.map(l=>l.id)">全选</button><button @click="selected=lessons.filter(l=>!selected.includes(l.id)).map(l=>l.id)">反选</button></div><div class="actions"><label>从 <select v-model="from"><option v-for="l in lessons" :value="l.order">{{l.order}} {{ unitLabel }}</option></select></label><label>到 <select v-model="to"><option v-for="l in lessons" :value="l.order">{{l.order}} {{ unitLabel }}</option></select></label><button @click="selected=selectRange(lessons,from,to)">选择范围</button></div></div></details><ClozePracticePanel :book-available="bookExamples.length" :selected-available="selectedExamples.length" :selected-total="selectedExampleTotal" :selected-lessons="selected.length" :unit-label="unitLabel" :busy="app.busy||exampleStarting||learningStarting" :error="exampleError" @start="startExamples"/><div class="lessons"><div v-for="l in lessons" :key="l.id" :data-lesson-id="l.id" class="lesson-row" :class="{selected:selected.includes(l.id)}"><label class="lesson-select"><input type="checkbox" v-model="selected" :value="l.id"/><span class="lesson-number">{{String(l.order).padStart(2,'0')}}</span><span><strong>{{l.title}}</strong><small>{{words(l.id).length}} 词 · 已学 {{lessonProgress(l.id).learned}} · 掌握 {{lessonProgress(l.id).mastered}}</small></span></label><div class="lesson-progress"><div class="progress"><i :style="{width:lessonProgress(l.id).percent+'%'}"></i></div><small>{{lessonProgress(l.id).percent}}%</small></div><button @click="expanded=expanded===l.id?'':l.id">{{expanded===l.id?'收起':'查看词汇'}}</button><div v-if="expanded===l.id" class="lesson-words"><div v-for="w in words(l.id)" :key="w.id"><strong lang="ja">{{w.term}}</strong><span>{{w.reading}}</span><MeaningPreview :word="w" /></div></div></div></div><div v-if="!lessons.length" class="empty">这是一本空词书。可以从上方添加词汇，或粘贴表格开始。<RouterLink to="/import">去导入 →</RouterLink></div><div class="selection-footer"><span>已选 <strong>{{selected.length}}</strong> {{ unitLabel }} · {{count}} 个未学单词<small class="selection-round-note">可以按每日计划学习，也可自由选择课次。</small></span><button class="primary" :disabled="!count||app.busy||learningStarting||exampleStarting" @click="start">开始学习所选{{ sourceHref ? '分组' : '课程' }} <ArrowRight :size="17"/></button></div></template></template><div v-else class="empty">找不到这本词书。<RouterLink to="/books">返回词书</RouterLink></div></template>

<style scoped>
.selection-round-note{display:block;margin-top:5px;color:var(--muted);font-size:11px;line-height:1.5}
.daily-plan-message{margin:-10px 0 18px;color:var(--muted);font-size:12px;line-height:1.5}
.book-study-entry{margin-bottom:26px}
.next-lesson-tools{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px 14px;min-width:0}
.next-lesson-action{min-height:44px;color:var(--green);font-size:13px}
.batch-selection{margin-bottom:20px;border-block:1px solid var(--line)}
.batch-selection>summary{display:flex;align-items:center;justify-content:space-between;min-height:48px;padding:10px 2px;color:var(--green);font-size:14px;cursor:pointer;list-style:none}
.batch-selection>summary::-webkit-details-marker{display:none}
.batch-selection>summary svg{transition:transform .18s ease}
.batch-selection[open]>summary svg{transform:rotate(180deg)}
.batch-selection>summary:focus-visible{outline:3px solid var(--focus-ring,#a77830);outline-offset:3px}
.batch-selection .selection-tools{margin:0;padding:10px 0 16px;border:0}
@media(max-width:620px){.next-lesson-tools{justify-content:flex-start}.section-title{align-items:flex-start;flex-direction:column;gap:8px}.batch-selection .selection-tools{align-items:stretch;flex-direction:column;gap:12px}.batch-selection .actions{flex-wrap:wrap;gap:8px}.batch-selection label{flex:1;min-width:100px}.batch-selection select{width:100%}}
@media(prefers-reduced-motion:reduce){.batch-selection>summary svg{transition:none}}
</style>
