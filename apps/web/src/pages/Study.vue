<script setup lang="ts">
import {computed,ref,shallowRef,watch,onMounted,onUnmounted,nextTick} from 'vue';
import {Bookmark,EyeOff,ArrowLeft,ArrowRight,Check,Volume2} from 'lucide-vue-next';
import {useApp} from '../store';
import {stateFor,progress,createQuestion,quizAttempt,quizRating,type Question} from '@jp/core';
import type {Grade} from 'ts-fsrs';import type {ChoiceQuizType,QuizAttempt,Word} from '@jp/models';import type {WebExerciseType} from '../services/study-session';import {PRONUNCIATION_VOICES,type PronunciationVoice} from '../services/pronunciationPreference';
import WordDefinition from '../components/WordDefinition.vue';import QuizQuestion from '../components/QuizQuestion.vue';import {usePronunciation} from '../composables/usePronunciation';
import {useStudyHistory} from '../composables/useStudyHistory';
import {notifyPet,pet} from '../pet/runtime';
import {gsap} from 'gsap';
import SentenceCloze from '../components/SentenceCloze.vue';
import SessionSummary from '../components/SessionSummary.vue';
import {createSentenceCloze,matchesClozeExample,type ClozeQuestion} from '../services/sentence-cloze';
import {sessionSummary} from '../services/study-feedback';
import {sceneFor,sceneExampleFor} from '../services/learning-scenes';
import KanaInputQuestion from '../components/KanaInputQuestion.vue';
import {createInputQuestion,inputAttempt,type InputQuestion} from '../services/kana-input';
import {meaningPresentation} from '../services/meaning-presentation';
import {playAnswerSound,stopAnswerSound} from '../services/answer-sound';
import {useWordAutoplayPreference} from '../services/word-autoplay-preference';
import {useRouter} from 'vue-router';
import {dailyStudyPlan} from '../services/daily-study-plan';
import {useStudyPlanPreference} from '../services/study-plan-preference';
import {completionNextAction} from '../services/completion-next-action';
import {personalExampleFor,personalClozeExampleFor} from '../services/personal-learning-example';
import AudioRetryNotice from '../components/AudioRetryNotice.vue';
import LessonPracticeSuggestion from '../components/LessonPracticeSuggestion.vue';
import {lessonPracticeRecommendation} from '../services/lesson-practice-recommendation';
const app=useApp();const pronunciation=usePronunciation();const voiceModel=pronunciation.voiceModel;const answer=ref(false);const started=ref(Date.now());const answeredIn=ref(0);const heard=ref(false);const uncertain=ref(false);
const activeScene=computed(()=>sceneFor(app.studySession?.sceneId));
const studyCard=ref<HTMLElement|null>(null);let cardMotion:gsap.core.Tween|undefined;let answerMotion:gsap.core.Timeline|undefined;
const exercise=ref<WebExerciseType>(app.sessionExercise??(app.mode==='new'?'card':'mixed'));const question=shallowRef<Question|null>(null);const attempt=shallowRef<QuizAttempt|null>(null);
const clozeQuestion=shallowRef<ClozeQuestion|null>(null);const clozeValue=ref('');
const inputQuestion=shallowRef<InputQuestion|null>(null);const inputValue=ref('');
const clozeMatches=computed(()=>!!clozeQuestion.value&&matchesClozeExample(clozeQuestion.value,clozeValue.value));
const clozeAvailableCount=computed(()=>app.queue.filter(word=>!!clozeForWord(word)).length);
const cardMode=computed(()=>exercise.value==='card'||exercise.value==='sentence-cloze'&&!clozeQuestion.value||['kana-input','dictation'].includes(exercise.value)&&!inputQuestion.value);
watch(exercise,value=>app.setSessionExercise?.(value));
watch(()=>app.sessionExercise,value=>{if(value&&value!==exercise.value)exercise.value=value});
const history=useStudyHistory({queue:()=>app.queue,index:()=>app.index,accountId:()=>app.currentUser?.id??null,busy:()=>app.busy});
const {currentWord,reviewing,reviewEntry,busy,invalidated,canPrevious}=history;
const word=computed(()=>reviewing.value||!app.sessionRoundComplete?history.word.value:undefined);
function personalWord(source:Word):Word{
 return {...source,readingContexts:app.data.words.find(item=>item.id===source.id)?.readingContexts??[]};
}
function personalDisplay(source:Word){
 const current=personalWord(source);const selected=app.studySession?.readingContextIds?.[source.id];
 return personalExampleFor(selected?{...current,readingContexts:current.readingContexts?.filter(context=>context.id===selected)}:current);
}
function studyExampleFor(source:Word|undefined){
 if(!source)return undefined;
 if(activeScene.value)return sceneExampleFor(activeScene.value.id,source);
 return app.mode!=='new'?personalDisplay(source)?.example:undefined;
}
function studyExampleLabel(source:Word|undefined){
 if(activeScene.value)return '场景例句';
 return source&&app.mode!=='new'&&personalDisplay(source)?'我的原句':undefined;
}
function personalCloze(source:Word){
 if(app.mode==='new'||activeScene.value)return undefined;
 const selected=app.studySession?.readingContextIds?.[source.id];
 const result=personalClozeExampleFor(personalWord(source),selected);
 return selected&&result?.context.id!==selected?undefined:result;
}
function clozeForWord(source:Word){
 if(activeScene.value)return createSentenceCloze(source,sceneExampleFor(activeScene.value.id,source));
 const personal=personalCloze(source);
 if(app.studySession?.readingContextIds?.[source.id]&&!personal)return null;
 return createSentenceCloze(source,personal?.example);
}
const clozeSourceLabel=computed(()=>activeScene.value?'场景例句':currentWord.value&&personalCloze(currentWord.value)?.example.ja===clozeQuestion.value?.ja?'我的原句':undefined);
const roundSize=computed(()=>app.sessionSize);
const roundDone=computed(()=>Math.min(roundSize.value,Math.max(0,app.index)));
const scopeName=computed(()=>app.studySession?.readingContextIds&&Object.keys(app.studySession.readingContextIds).length?'我的原句':activeScene.value?.title??(app.studySession?.lessonIds?.length===1?(app.studySession.lessonIds[0].startsWith('jlpt-n')?'本组':'本课'):'所选范围'));
const scopeProgress=computed(()=>{
 const lessonId=app.studySession?.lessonIds?.length===1?app.studySession.lessonIds[0]:undefined;
 if(app.mode==='new'&&lessonId){
  const result=progress(app.data,app.data.words.filter(w=>w.lessonId===lessonId),app.currentUser?.id??'local');
  return {label:scopeName.value+'已学',done:result.learned,total:result.total};
 }
 return {label:scopeName.value+' · 本次进度',done:app.index,total:app.sessionSize};
});
const state=computed(()=>word.value?stateFor(app.data,word.value.id,app.currentUser?.id??'local'):undefined);const lesson=computed(()=>app.data.lessons.find(l=>l.id===word.value?.lessonId));
const actionError=ref('');
const practiceStarting=ref(false);
const completionSummary=computed(()=>sessionSummary(app.data,app.queue,app.index,app.studySession?.reviewCounts,app.currentUser?.id??'local'));
const relatedPractice=computed(()=>{
 if(invalidated.value||!app.sessionRoundComplete||activeScene.value)return undefined;
 const completed=[...completionSummary.value.newWords,...completionSummary.value.reviewWords];
 const ignored=new Set(completed.filter(word=>stateFor(app.data,word.id,app.currentUser?.id??'local')?.isIgnored).map(word=>word.id));
 return lessonPracticeRecommendation(app.data,completed,{ignoredWordIds:ignored});
});
const router=useRouter();
const studyPlanPreference=useStudyPlanPreference();
const completionStarting=ref(false);
const completionBookId=computed(()=>app.studySession?.bookIds.length===1?app.studySession.bookIds[0]:app.data.currentBookId);
const completionPlan=computed(()=>completionBookId.value
 ?dailyStudyPlan(app.data,completionBookId.value,studyPlanPreference.getPace(completionBookId.value),app.now??new Date(),app.currentUser?.id??'local')
 :undefined);
const completionAction=computed(()=>completionNextAction({
 invalidated:invalidated.value,hasSession:app.sessionSize>0,
 practiceCount:invalidated.value?0:completionSummary.value.practiceWords.length,
 dueCount:app.stats?.due??0,dailyRemaining:completionPlan.value?.remaining??0,dailyTarget:completionPlan.value?.target??0,
}));
const companion=computed(()=>pet.settings.enabled&&pet.settings.studyVisibility==='companion');
const options:{value:WebExerciseType;label:string}[]=[{value:'card',label:'经典卡片'},{value:'mixed',label:'混合复习'},{value:'kana-meaning',label:'假名选中文'},{value:'kanji-reading',label:'汉字选假名'},{value:'audio-meaning',label:'听音选中文'},{value:'kana-input',label:'假名键入'},{value:'dictation',label:'听写'},{value:'sentence-cloze',label:'例句填空'}];
const fallback=ref('');
const autoplayEnabled=useWordAutoplayPreference().enabled;
const pageVisible=ref(typeof document==='undefined'||document.visibilityState!=='hidden');
const autoplayedPositions=new WeakMap<object,Set<string>>();
let autoplayGeneration=0;
let automaticPlayback=false;
const autoplayReady=computed(()=>{
 if(!autoplayEnabled.value||!pageVisible.value||reviewing.value||busy.value||!word.value||app.sessionRoundComplete||!pronunciation.available(word.value))return false;
 if(cardMode.value)return true;
 if(clozeQuestion.value)return answer.value;
 if(inputQuestion.value)return inputQuestion.value.type==='dictation'||!!attempt.value;
 if(question.value)return question.value.type!=='kanji-reading'||!!attempt.value;
 return false;
});
function autoplayPosition(){return app.index+'|'+currentWord.value?.id+'|'+exercise.value+'|'+(question.value?.type??inputQuestion.value?.type??(clozeQuestion.value?'cloze':'card'))}
function rememberPronunciation(){
 let positions=autoplayedPositions.get(app.queue);
 if(!positions){positions=new Set();autoplayedPositions.set(app.queue,positions)}
 positions.add(autoplayPosition());
}
function manualPronunciation(){autoplayGeneration++;automaticPlayback=false;if(!reviewing.value)rememberPronunciation()}
function handleVisibilityChange(){
 pageVisible.value=typeof document==='undefined'||document.visibilityState!=='hidden';
 if(!pageVisible.value){autoplayGeneration++;automaticPlayback=false;stopAnswerSound();pronunciation.stop();pronunciation.clearPrefetch?.()}
}
function prepareNearbyAudio(){
 if(!pageVisible.value||reviewing.value||app.sessionRoundComplete){pronunciation.clearPrefetch?.();return}
 void pronunciation.prefetch?.(app.queue.slice(app.index,app.index+3));
}
watch([()=>app.queue,()=>app.currentUser?.id??null],()=>pronunciation.clearPrefetch?.(),{flush:'sync'});
watch([()=>app.queue,()=>app.index,voiceModel,pageVisible,reviewing,()=>app.sessionRoundComplete],prepareNearbyAudio,{immediate:true,flush:'post'});
function prepare(){
 stopAnswerSound();
 pronunciation.stop();pronunciation.error.value='';answer.value=false;attempt.value=null;heard.value=false;uncertain.value=false;started.value=Date.now();question.value=null;fallback.value='';
 clozeQuestion.value=null;clozeValue.value='';
 inputQuestion.value=null;inputValue.value='';
 if(!currentWord.value||app.sessionRoundComplete||exercise.value==='card')return;
 if(exercise.value==='kana-input'||exercise.value==='dictation'){
  inputQuestion.value=createInputQuestion({...currentWord.value,meaning:meaningPresentation(currentWord.value).summary},exercise.value);
  if(!inputQuestion.value)fallback.value='这个词暂时没有明确的假名读音，先用经典卡片学习。';
  return;
 }
 if(exercise.value==='sentence-cloze'){
  clozeQuestion.value=clozeForWord(currentWord.value);
  if(!clozeQuestion.value)fallback.value=app.studySession?.readingContextIds?.[currentWord.value.id]?'这条原句已修改或移除，先用经典卡片复习。':'这个词暂未配填空用例，先用经典卡片学习。';
  return;
 }
 const pool=app.data.words.filter(w=>!stateFor(app.data,w.id)?.isIgnored);
 const types:ChoiceQuizType[]=exercise.value==='mixed'?['kana-meaning','kanji-reading','audio-meaning']:[exercise.value];
 const rotated=exercise.value==='mixed'?types.slice(app.index%3).concat(types.slice(0,app.index%3)):types;
 for(const type of rotated){if(type==='audio-meaning'&&!pronunciation.available(currentWord.value))continue;const candidate=createQuestion(currentWord.value,pool,type);if(candidate){question.value=candidate;return}}
 fallback.value=exercise.value==='audio-meaning'?'这个词没有音频，设备也未提供日语语音。请切换题型。':exercise.value==='kanji-reading'&&!/\p{Script=Han}/u.test(currentWord.value.term)?'这个词没有汉字，适合使用假名或听音题。':'没有足够的不重复选项，请切换经典卡片。';
}
watch([()=>currentWord.value?.id,exercise,()=>activeScene.value?.id],()=>{actionError.value='';prepare()},{immediate:true});
watch([()=>word.value?.id,reviewing],()=>{stopAnswerSound();pronunciation.stop();pronunciation.error.value='';answerMotion?.kill()},{flush:'sync'});
watch([()=>app.queue,()=>app.index,()=>word.value?.id,autoplayPosition,autoplayReady],(_value,_old,onCleanup)=>{
 if(!autoplayReady.value)return;
 const queue=app.queue;
 const position=autoplayPosition();
 if(autoplayedPositions.get(queue)?.has(position))return;
 const generation=++autoplayGeneration;
 // Let the short answer cue finish before the next word or revealed reading.
 const timer=setTimeout(()=>{
  if(generation!==autoplayGeneration||!autoplayReady.value||app.queue!==queue||autoplayPosition()!==position)return;
  rememberPronunciation();
  automaticPlayback=true;
  void play(false,true);
 },app.index>0||attempt.value?800:0);
 onCleanup(()=>{
  clearTimeout(timer);
  if(generation===autoplayGeneration&&automaticPlayback){automaticPlayback=false;pronunciation.stop()}
 });
},{flush:'post',immediate:true});
watch(()=>word.value?.id,async()=>{await nextTick();window.scrollTo({top:0})});
watch(()=>word.value?.id,async()=>{
 await nextTick();
 cardMotion?.kill();
 if(!studyCard.value||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 cardMotion=gsap.fromTo(studyCard.value,{autoAlpha:0,y:8},{autoAlpha:1,y:0,duration:.24,ease:'power2.out',clearProps:'opacity,visibility,transform'});
},{flush:'post',immediate:true});
watch([answer,attempt],async()=>{
 await nextTick();
 answerMotion?.kill();
 if(reviewing.value||!answer.value||!studyCard.value||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 answerMotion=gsap.timeline({defaults:{clearProps:'opacity,visibility,transform'}});
 const card=studyCard.value;
 const result=card.querySelector('.quiz-feedback');
 const choice=card.querySelector(attempt.value?.isCorrect?'.option-correct':'.option-wrong');
 const details=Array.from(card.querySelectorAll('.revealed-word,.quiz-next,.ratings,.dictionary-entry,.word-definition'));
 if(choice)answerMotion.fromTo(choice,{opacity:.7},{opacity:1,duration:.16,ease:'power2.out'},0);
 if(result)answerMotion.fromTo(result,{autoAlpha:0,y:6},{autoAlpha:1,y:0,duration:.24,ease:'power2.out'},0);
 if(details.length)answerMotion.fromTo(details.slice(0,2),{autoAlpha:0,y:6},{autoAlpha:1,y:0,duration:.24,ease:'power2.out'},0);
},{flush:'post'});
watch(pronunciation.hasJapaneseVoice,()=>{if(!reviewing.value&&!answer.value&&!attempt.value&&!question.value&&(exercise.value==='mixed'||exercise.value==='audio-meaning'))prepare()});
function previous(){if(history.previous())actionError.value=''}
function resume(){if(reviewing.value&&!busy.value)started.value+=history.resume()}
function revealCloze(){if(!reviewing.value&&!busy.value&&clozeQuestion.value)answer.value=true}
function submitInput(value:string|null){
 if(reviewing.value||app.sessionRoundComplete||!inputQuestion.value||attempt.value||busy.value)return;
 if(inputQuestion.value.type==='dictation'&&(!heard.value||pronunciation.error.value))return;
 if(value!==null&&!value.trim())return;
 attempt.value=inputAttempt(inputQuestion.value,value);answeredIn.value=Date.now()-started.value;answer.value=true;
 pronunciation.stop();void playAnswerSound(attempt.value.isCorrect);notifyPet({type:'answer',correct:attempt.value.isCorrect});
}
async function practiceSummary(){
 if(practiceStarting.value||busy.value)return;
 const ids=completionSummary.value.practiceWords.map(word=>word.id);
 practiceStarting.value=true;actionError.value='';
 try{
  const contextIds=app.studySession?.readingContextIds;
  const pairs=ids.filter(id=>contextIds?.[id]).map(wordId=>({wordId,contextId:contextIds![wordId]}));
  const started=exercise.value==='sentence-cloze'&&pairs.length===ids.length&&pairs.length
   ?await app.startReadingContextPractice(pairs)
   :await app.startFocusedPractice(ids,exercise.value,activeScene.value?.id);
  if(!started)actionError.value=app.error||'这些词暂时无法开始练习，请重试。';
 }
 catch(error){actionError.value=error instanceof Error?error.message:'练习暂时无法开始，请重试。'}
 finally{practiceStarting.value=false}
}
async function continueAfterCompletion(){
 if(busy.value||practiceStarting.value||completionStarting.value)return;
 const action=completionAction.value.action;
 if(action==='practice'){await practiceSummary();return}
 completionStarting.value=true;actionError.value='';
 try{
  if(action==='finish'||action==='books'){await router.push(action==='finish'?'/':'/books');return}
  const started=action==='review'?await app.start('review'):await app.startDailyLearning(completionBookId.value);
  if(!started)actionError.value=app.error||'学习任务有变化，回到今日查看最新安排。';
 }catch(error){actionError.value=error instanceof Error?error.message:'暂时无法开始，请重试。'}
 finally{completionStarting.value=false}
}
async function advance(save:()=>Promise<unknown>){
 actionError.value='';
 try{return await history.advance(save)}catch(error){actionError.value=error instanceof Error?error.message:'保存失败，请重试。';return false}
}
async function rate(rating:Grade){
 if(reviewing.value||app.sessionRoundComplete||busy.value||!answer.value)return;
 if(await advance(()=>app.rate(rating,Math.max(0,Date.now()-started.value)))){
  notifyPet({type:'answer',correct:rating>=3});
  if(rating===1||rating===3)void playAnswerSound(rating===3);
  if(app.sessionRoundComplete)notifyPet({type:'complete'});
 }
}
function choose(value:string|null){if(reviewing.value||app.sessionRoundComplete||!question.value||attempt.value||busy.value)return;if(question.value.type==='audio-meaning'&&(!heard.value||pronunciation.error.value))return;attempt.value=quizAttempt(question.value,value);answeredIn.value=Date.now()-started.value;answer.value=true;pronunciation.stop();void playAnswerSound(attempt.value.isCorrect);notifyPet({type:'answer',correct:attempt.value.isCorrect})}
async function next(){if(reviewing.value||app.sessionRoundComplete||!attempt.value||busy.value)return;const completedAttempt=attempt.value;const rating=quizRating(completedAttempt,uncertain.value);const responseTime=answeredIn.value;if(await advance(()=>app.rate(rating,responseTime,completedAttempt))&&app.sessionRoundComplete)notifyPet({type:'complete'})}
async function difficult(){if(!word.value||busy.value)return;actionError.value='';try{await app.flag(word.value.id,'isDifficult',!state.value?.isDifficult)}catch(error){actionError.value=error instanceof Error?error.message:'保存失败，请重试。'}}
async function ignore(){
 if(reviewing.value||app.sessionRoundComplete||!currentWord.value||attempt.value||busy.value)return;
 const id=currentWord.value.id;const queue=app.queue;const before=app.index;const accountId=app.currentUser?.id??null;
 if(await advance(async()=>{if(await app.flag(id,'isIgnored',true,accountId)&&app.queue===queue&&app.index===before&&(app.currentUser?.id??null)===accountId)app.index++})&&app.sessionRoundComplete)notifyPet({type:'complete'});
}
function finishStudy(){if(app.sessionRoundComplete)notifyPet({type:'complete'})}
async function play(slow=false,automatic=false){if(!word.value)return;if(!automatic)manualPronunciation();stopAnswerSound();const id=word.value.id;const queue=app.queue;const index=app.index;const accountId=app.currentUser?.id??null;const wasReviewing=reviewing.value;if(await pronunciation.play(word.value,slow)&&!wasReviewing&&!reviewing.value&&word.value?.id===id&&app.queue===queue&&app.index===index&&(app.currentUser?.id??null)===accountId)heard.value=true}
async function playExample(example:{ja:string;reading:string;slow:boolean}){manualPronunciation();stopAnswerSound();await pronunciation.playSentence(example.ja,example.reading,example.slow)}
async function playCloze(slow=false){if(clozeQuestion.value&&answer.value){manualPronunciation();stopAnswerSound();await pronunciation.playSentence(clozeQuestion.value.ja,clozeQuestion.value.sentenceReading,slow)}}
function changeVoice(event:Event){const value=(event.target as HTMLSelectElement).value as PronunciationVoice;pronunciation.setVoice(value);pronunciation.stop();pronunciation.error.value=''}
function key(e:KeyboardEvent){
 if(e.ctrlKey||e.altKey||e.metaKey||e.repeat||e.isComposing||e.keyCode===229||busy.value)return;const target=e.target as HTMLElement;
 if(e.key==='Enter'&&target.matches('.kana-answer-input')&&attempt.value&&inputQuestion.value&&!reviewing.value){e.preventDefault();next();return}
 if(target.closest('input,textarea,select,[contenteditable="true"]'))return;
 const k=e.key.toLowerCase();if(k==='arrowleft'){if(canPrevious.value){e.preventDefault();previous()}return}
 if(reviewing.value){if(k==='arrowright'||(k===' '&&!target.closest('button,a'))){e.preventDefault();resume()}else if(k==='s'){e.preventDefault();difficult()}return}
 if(!word.value)return;
 if(k===' '){if(target.closest('button,a'))return;e.preventDefault();if(attempt.value)next();else if(question.value?.type==='audio-meaning'||inputQuestion.value?.type==='dictation')play();else if(cardMode.value)answer.value=true;else if(inputQuestion.value)document.querySelector<HTMLInputElement>('.kana-answer-input')?.focus();else if(exercise.value==='sentence-cloze')revealCloze()}
 else if(['1','2','3','4'].includes(k)){e.preventDefault();if(question.value&&!attempt.value){const option=question.value.options[Number(k)-1];if(option)choose(option)}else if((cardMode.value||exercise.value==='sentence-cloze')&&Number(k)<=3)rate(Number(k) as Grade)}
 else if(k==='s'){e.preventDefault();difficult()}else if(k==='i'&&!attempt.value){e.preventDefault();ignore()}
}
onMounted(()=>{window.addEventListener('keydown',key);window.addEventListener('online',prepareNearbyAudio);window.addEventListener('offline',prepareNearbyAudio);document.addEventListener('visibilitychange',handleVisibilityChange);handleVisibilityChange();if(word.value)notifyPet({type:'start-study',mode:app.mode})});onUnmounted(()=>{autoplayGeneration++;automaticPlayback=false;pronunciation.clearPrefetch?.();stopAnswerSound();cardMotion?.kill();answerMotion?.kill();window.removeEventListener('keydown',key);window.removeEventListener('online',prepareNearbyAudio);window.removeEventListener('offline',prepareNearbyAudio);document.removeEventListener('visibilitychange',handleVisibilityChange);notifyPet({type:'leave-study'})});
</script>
<template>
  <RouterLink :to="activeScene?'/scenes/'+activeScene.id:'/books'" class="back" @click="finishStudy"><ArrowLeft :size="16"/> 结束本次学习</RouterLink>
  <template v-if="word">
    <div class="study-top">
      <span>{{activeScene?'生活场景 · '+activeScene.title:(app.mode==='new'?'学习新词':app.mode==='review'?'到期复习':'巩固练习')+' · '+lesson?.title}}</span>
      <span>{{reviewing?'回看已学词':'本次 '+(roundDone+1)+' / '+roundSize}}</span>
    </div>
    <div class="progress session-progress"><i :style="{width:(roundSize?roundDone/roundSize*100:0)+'%'}"></i></div>
    <p class="round-scope">{{scopeProgress.label}} {{scopeProgress.done}} / {{scopeProgress.total}} 词 <span>{{activeScene?'按场景词汇练习':'按所选范围学习'}}</span></p>
    <div class="exercise-toolbar">
      <label>学习方式<select v-model="exercise" :disabled="reviewing||!!attempt||busy"><option v-for="o in options" :key="o.value" :value="o.value">{{o.label}}</option></select></label>
      <label>声音<select v-model="voiceModel" aria-label="发音声音" @change="changeVoice"><option v-for="voice in PRONUNCIATION_VOICES" :key="voice.value" :value="voice.value">{{voice.label}}</option></select></label>
      <span>{{reviewing?(currentWord&&!app.sessionRoundComplete?'Space 返回当前词':'Space 返回完成页'):cardMode?'Space 查看释义 · 1–3 评价':inputQuestion?'Enter 对照答案 · 再按 Enter 保存':exercise==='sentence-cloze'?'Enter 对照示例 · 1–3 评价':'按 1–4 选择 · Space 继续'}}</span>
    </div>
    <p v-if="!reviewing&&exercise==='sentence-cloze'" class="cloze-coverage">{{clozeAvailableCount===roundSize?'本次 '+clozeAvailableCount+' 词均可用例句练习。':'本次 '+clozeAvailableCount+' / '+roundSize+' 词有填空用例，其余继续使用经典卡片。'}}</p>
    <div v-if="reviewing" class="history-status" role="status">正在回看 · 第{{(reviewEntry?.index??0)+1}}个词</div>
    <section ref="studyCard" class="study-card enhanced-study" :class="{ 'with-pet': companion }">
      <div class="card-top">
        <span class="eyebrow">{{reviewing?'回看已学单词':cardMode?'想一想，这个词是什么意思？':'从不同方向，记住一个词。'}}</span>
        <button :class="{marked:state?.isDifficult}" :aria-pressed="!!state?.isDifficult" :disabled="busy" @click="difficult"><Bookmark :size="18"/>{{state?.isDifficult?'已加入生词':'加入生词本'}}</button>
      </div>
      <p v-if="pronunciation.loading?.value" class="audio-loading" role="status">正在准备发音…</p>
      <span v-if="companion" class="pet-study-anchor" data-pet-study-anchor aria-hidden="true"></span>
      <template v-if="reviewing||cardMode">
        <p v-if="!reviewing&&fallback" class="cloze-fallback" role="status">{{fallback}}</p>
        <div class="word-face" lang="ja"><h1>{{word.term}}<sup v-if="word.accent">{{word.accent}}</sup></h1><p>{{word.reading}}</p></div>
        <div class="pronunciation-controls">
          <template v-if="pronunciation.available(word)"><button @click="play()"><Volume2 :size="17"/> 发音</button><button @click="play(true)">慢速</button><small>{{pronunciation.sourceLabel(word)}}</small></template>
          <span v-else class="muted">此词暂无可用日语发音</span>
        </div>
        <AudioRetryNotice :error="pronunciation.error.value" :disabled="busy" @retry="play()" />
        <WordDefinition v-if="reviewing||answer" :word="word" :example-override="studyExampleFor(word)" :example-label="studyExampleLabel(word)" :example-can-play="pronunciation.canPlaySentence" :example-source-label="pronunciation.sentenceSourceLabel" :example-speaking="pronunciation.sentenceSpeaking.value" :example-audio-error="pronunciation.sentenceError.value" @play-example="playExample" @stop-example="pronunciation.stop"/>
        <div v-else class="answer-placeholder">让记忆停留一会儿。</div>
        <template v-if="!reviewing">
          <button v-if="!answer" class="primary reveal" :disabled="busy" @click="answer=true">显示释义 <kbd>Space</kbd></button>
          <div v-else class="ratings sticky-ratings">
            <button :disabled="busy" class="again" @click="rate(1)"><span>忘记了</span><kbd>1</kbd></button>
            <button :disabled="busy" class="hard" @click="rate(2)"><span>模糊</span><kbd>2</kbd></button>
            <button :disabled="busy" class="good" @click="rate(3)"><span>记得</span><kbd>3</kbd></button>
          </div>
        </template>
      </template>
      <template v-else-if="exercise==='sentence-cloze'&&clozeQuestion">
        <SentenceCloze :source-label="clozeSourceLabel" :question="clozeQuestion" :value="clozeValue" :revealed="answer" :matches="clozeMatches" :busy="busy" :audio-available="pronunciation.canPlaySentence(clozeQuestion.ja)" :audio-source-label="pronunciation.sentenceSourceLabel(clozeQuestion.ja)" :speaking="pronunciation.sentenceSpeaking.value" :audio-error="pronunciation.sentenceError.value" @update:value="clozeValue=$event" @reveal="revealCloze" @grade="rate" @play="playCloze" @stop="pronunciation.stop"/>
        <WordDefinition v-if="answer" :word="word" :example-override="studyExampleFor(word)" :example-label="studyExampleLabel(word)" :show-example="false"/>
      </template>
      <template v-else-if="inputQuestion">
        <KanaInputQuestion :question="inputQuestion" :value="inputValue" :attempt="attempt" :busy="busy" :heard="heard" :audio-error="pronunciation.error.value" :speaking="pronunciation.speaking.value" @update:value="inputValue=$event" @submit="submitInput" @play="play" @stop="pronunciation.stop"/>
        <template v-if="attempt">
          <div class="revealed-word" lang="ja"><strong>{{word.term}}</strong><span>{{word.reading}}</span></div>
          <div class="quiz-next input-quiz-next">
            <label v-if="attempt.isCorrect"><input type="checkbox" v-model="uncertain"/> 这次还不熟，下次早点复习</label>
            <p v-else>本次记为「忘记」，将更早安排复习。</p>
            <button class="primary" :disabled="busy" @click="next">保存并继续 <kbd>Enter</kbd></button>
          </div>
          <WordDefinition :word="word" :example-override="studyExampleFor(word)" :example-label="studyExampleLabel(word)" :example-can-play="pronunciation.canPlaySentence" :example-source-label="pronunciation.sentenceSourceLabel" :example-speaking="pronunciation.sentenceSpeaking.value" :example-audio-error="pronunciation.sentenceError.value" @play-example="playExample" @stop-example="pronunciation.stop"/>
        </template>
      </template>
      <template v-else-if="question">
        <QuizQuestion :compact-meaning="word.lessonId.startsWith('jlpt-n')" :question="question" :attempt="attempt" :heard="heard" :busy="busy" :audio-error="pronunciation.error.value" :speaking="pronunciation.speaking.value" @choose="choose" @play="play"/>
        <template v-if="attempt">
          <div class="revealed-word" lang="ja"><strong>{{word.term}}</strong><span>{{word.reading}}</span><button v-if="pronunciation.available(word)" aria-label="播放单词发音" @click="play()"><Volume2 :size="18"/></button></div>
          <WordDefinition :word="word" :example-override="studyExampleFor(word)" :example-label="studyExampleLabel(word)" :example-can-play="pronunciation.canPlaySentence" :example-source-label="pronunciation.sentenceSourceLabel" :example-speaking="pronunciation.sentenceSpeaking.value" :example-audio-error="pronunciation.sentenceError.value" @play-example="playExample" @stop-example="pronunciation.stop"/>
          <div class="quiz-next">
            <label v-if="attempt.isCorrect"><input type="checkbox" v-model="uncertain"/> 这次是猜对的，下次早点复习</label>
            <p v-else>本次记为「忘记」，将更早安排复习。</p>
            <button class="primary" :disabled="busy" @click="next">保存并继续 <kbd>Space</kbd></button>
          </div>
        </template>
      </template>
      <div v-else class="empty"><p>{{fallback}}</p><button @click="exercise='card'">使用经典卡片</button></div>
    </section>
    <div class="study-history-nav" :class="{'is-reviewing':reviewing}" aria-label="学习回看导航">
      <button :disabled="!canPrevious" @click="previous"><ArrowLeft :size="17"/> 上一个</button>
      <button v-if="reviewing" class="primary" :disabled="busy" @click="resume">{{currentWord&&!app.sessionRoundComplete?'返回当前词':'返回完成页'}} <ArrowRight :size="17"/></button>
      <span v-else>已保存进度 · ← 回看</span>
    </div>
    <p v-if="reviewing" class="history-note">回看不会重复计入学习记录</p>
    <div v-else class="study-bottom">
      <button :disabled="busy||!!attempt" @click="ignore"><EyeOff :size="17"/> 忽略此词 <kbd>I</kbd></button>
      <span>{{attempt?'点击「保存并继续」记录本次答题':'标记生词 S · 已保存的进度不会丢失'}}</span>
    </div>
    <p v-if="actionError" class="study-action-error error" role="alert">{{actionError}}</p>
  </template>
  <section v-else class="completion">
    <span class="completion-icon"><Check :size="34"/></span><p class="eyebrow">おつかれさま</p>
    <h1>{{invalidated?'请重新选择学习课次。':app.sessionSize?'这一轮，已经完成。':'现在没有待学单词。'}}</h1>
    <p v-if="invalidated">账号已切换，本轮回看已清空。请在当前账号下重新开始学习。</p>
    <template v-else-if="app.sessionSize"><p class="round-result">本次 {{roundDone}} / {{roundSize}} 词 · {{scopeProgress.label}} {{scopeProgress.done}} / {{scopeProgress.total}} 词</p><p>{{completionSummary.newCount+completionSummary.reviewCount?'这一轮的学习记录已保存。':'所选范围已经处理完，跳过的词不会计入本次学习。'}}</p></template>
    <p v-else>可以选择其他课次，或稍后回来查看到期复习。</p>
    <section class="completion-next" aria-label="下一步建议">
      <p class="completion-next-description">{{completionAction.description}}</p>
      <div class="round-completion-actions">
        <button type="button" class="primary" :disabled="busy||practiceStarting||completionStarting" :aria-busy="practiceStarting||completionStarting" @click="continueAfterCompletion">{{completionAction.label}} <ArrowRight v-if="completionAction.action!=='finish'" :size="17"/></button>
        <RouterLink v-if="completionAction.action!=='finish'" to="/" class="button">今天先到这里</RouterLink>
        <RouterLink v-else to="/books" class="button">选择其他课次</RouterLink>
      </div>
      <p v-if="actionError" class="error" role="alert">{{actionError}}</p>
    </section>
    <LessonPracticeSuggestion v-if="relatedPractice" :recommendation="relatedPractice" />
    <SessionSummary v-if="!invalidated&&app.sessionSize" :summary="completionSummary" :busy="busy||practiceStarting||completionStarting" :show-practice-action="false" @practice="practiceSummary"/>
    <div v-if="companion" class="pet-study-lane"><span class="pet-study-anchor" data-pet-study-anchor aria-hidden="true"></span></div>
    <RouterLink v-if="activeScene||completionAction.action==='practice'||completionAction.action==='review'||completionAction.action==='daily'" :to="activeScene?'/scenes':'/books'" class="completion-alternative">{{activeScene?'更多生活场景':'选择其他课次'}} <ArrowRight :size="14"/></RouterLink>
  </section>
</template>

<style scoped>
.audio-loading{margin:0 0 12px;color:var(--muted);font-size:12px;line-height:1.6}
.cloze-fallback{font-size:12px;line-height:1.6;color:var(--muted);margin:0 0 12px}
.cloze-coverage{max-width:740px;margin:-7px auto 15px;color:var(--muted);font-size:12px;line-height:1.7}
.round-scope{display:flex;justify-content:space-between;gap:12px;max-width:860px;margin:10px auto 0;color:var(--muted);font-size:12px;line-height:1.5}
.round-scope span{white-space:nowrap}
.round-result{color:var(--green);font-weight:600;font-variant-numeric:tabular-nums}
.round-completion-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin-top:24px}
.round-completion-actions .button{margin:0}
.completion-next{max-width:740px;margin:20px auto 26px;padding:18px 0 24px;border-block:1px solid var(--line)}
.completion-next-description{margin:0;color:var(--muted);font-size:14px;line-height:1.7}
.completion-next .round-completion-actions{margin-top:16px}
.completion-next button{min-height:46px}
.completion-alternative{display:inline-flex;align-items:center;gap:7px;margin-top:20px;color:var(--green);font-size:13px}
.quiz-next.input-quiz-next{position:static;margin-top:18px}
@media(max-width:560px){.round-scope{font-size:11px;flex-wrap:wrap;gap:4px}.round-completion-actions{flex-direction:column;align-items:stretch;max-width:300px;margin:24px auto 0}.round-completion-actions .button,.round-completion-actions button{width:100%;min-height:46px}}
.history-status{max-width:740px;margin:0 auto 12px;padding:12px 16px;border-radius:8px;background:#eaf0e3;color:var(--green);font-size:13px}
.study-history-nav{max-width:740px;margin:16px auto 0;display:flex;align-items:center;justify-content:space-between;gap:12px}
.study-history-nav.is-reviewing{position:sticky;bottom:10px;z-index:3;background:#f7f8f4;padding:10px 0;border-top:1px solid var(--line)}
.study-history-nav button{min-height:44px;min-width:124px;justify-content:center}
.study-history-nav>span,.history-note{color:var(--muted);font-size:11px}
.history-note{max-width:740px;text-align:center;margin:12px auto 0}
.study-action-error{max-width:740px;margin:14px auto}
.study-history-nav button:focus-visible{outline:3px solid var(--focus-ring);outline-offset:3px}
.study-card.with-pet{position:relative}
.study-card .pet-study-anchor{top:60px;right:38px;bottom:auto}
.study-card.with-pet .word-face h1,.study-card.with-pet .word-face p,
.study-card.with-pet :deep(.quiz-prompt h1){max-width:calc(100% - 260px);margin-left:auto;margin-right:auto}
.pet-study-lane{position:relative;height:152px}
.pet-study-anchor{position:absolute;right:8px;bottom:4px;display:block;width:128px;height:148px;pointer-events:none}
.completion .pet-study-lane{max-width:320px;margin:12px auto}
@media(max-width:760px){
  .study-history-nav{gap:8px}
  .study-history-nav button{min-width:0;padding:10px 14px;font-size:13px}
  .study-card .pet-study-anchor{top:72px;right:18px}
  .study-card.with-pet .word-face h1,.study-card.with-pet .word-face p,
  .study-card.with-pet :deep(.quiz-prompt h1){max-width:calc(100% - 168px)}
  .pet-study-lane{height:96px}
  .pet-study-anchor{width:76px;height:92px;right:8px;bottom:4px}
}
</style>
