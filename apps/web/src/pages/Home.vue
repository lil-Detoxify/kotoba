<script setup lang="ts">
import {computed,ref} from 'vue';
import {useRouter} from 'vue-router';
import {ArrowUpRight,ArrowRight,BookOpen,Flame,Settings2} from 'lucide-vue-next';
import {useApp} from '../store';
import {progress} from '@jp/core';
import {useHomeDisplayPreference} from '../services/home-display-preference';
import {useStudyPlanPreference} from '../services/study-plan-preference';
import {dailyStudyPlan} from '../services/daily-study-plan';
import {bookCategory,fullBookTitle} from '../services/book-presentation';
import {shouldShowLearningStart,useLearningStartPreference} from '../services/learning-start';
import WeekChart from '../components/WeekChart.vue';
import BookCover from '../components/BookCover.vue';
import {sceneFor} from '../services/learning-scenes';
import brandMarkUrl from '../assets/brand/kotobud-mark.svg';

const app=useApp();
const router=useRouter();
const {display:homeDisplay}=useHomeDisplayPreference();
const studyPlanPreference=useStudyPlanPreference();
const learningStartPreference=useLearningStartPreference();
const learningStartOwner=computed(()=>app.currentUser?.id??'local');
const showLearningStart=computed(()=>shouldShowLearningStart(app.data,{ready:app.ready,hasCheckpoint:!!app.hasResumableSession,dismissed:learningStartPreference.isDismissed(learningStartOwner.value)}));
const book=computed(()=>{
  if(!app.data||!Array.isArray(app.data.books)) return undefined;
  const current=app.data.books.find(b=>b.id===app.data.currentBookId)??app.data.books[0];
  return current?{...current,title:fullBookTitle(current)}:undefined;
});

const bp=computed(()=>{
  if(!app.data||!Array.isArray(app.data.lessons)||!Array.isArray(app.data.words)){
    return {total:0,learned:0,mastered:0,percent:0};
  }
  const currentBook=book.value;
  if(!currentBook) return {total:0,learned:0,mastered:0,percent:0};
  const ids=app.data.lessons.filter(l=>l.bookId===currentBook.id).map(l=>l.id);
  const words=app.data.words.filter(w=>ids.includes(w.lessonId));
  if(words.length) return progress(app.data,words);
  const meta=app.metaBooks?.find(b=>b.id===currentBook.id);
  const lessonIds=new Set((meta?.lessons??app.data.lessons.filter(l=>l.bookId===currentBook.id))
    .filter(l=>l.bookId===currentBook.id).map(l=>l.id));
  const states=(Array.isArray(app.data.states)?app.data.states:[]).filter(s=>
    s.lessonId?lessonIds.has(s.lessonId):s.bookId?s.bookId===currentBook.id:s.wordId.startsWith(currentBook.id+'-w-')
  );
  const ignored=states.filter(s=>s.isIgnored).length;
  const activeStates=states.filter(s=>!s.isIgnored);
  const total=Math.max(0,(meta?.wordCount??0)-ignored);
  const learned=activeStates.filter(s=>s.status!=='new'&&(s.firstSeenAt||s.reviewCount>0)).length;
  const mastered=activeStates.filter(s=>s.status==='mastered').length;
  return {total,learned,mastered,percent:total?Math.round(learned/total*100):0};
});

const safeStats=computed(()=>{
  return app.stats||{
    total:0,learned:0,mastered:0,percent:0,due:0,
    newToday:0,reviewToday:0,totalReviews:0,streak:0,
    days:[],counts:{new:0,learning:0,review:0,mastered:0}
  };
});

const currentBookLessonsCount=computed(()=>{
  const currentId=book.value?.id;
  if(!currentId||!Array.isArray(app.data?.lessons)) return 0;
  return app.data.lessons.filter(l=>l.bookId===currentId).length;
});

const currentBookCoverContent=computed(()=>{
  const currentBook=book.value;
  if(!currentBook||!Array.isArray(app.data?.lessons)||!Array.isArray(app.data?.words)) return '';
  const lessonBook=new Map(app.data.lessons.map(l=>[l.id,l.bookId]));
  let content='';
  for(const lesson of app.data.lessons){
    if(lesson.bookId===currentBook.id) content+=' '+lesson.title;
  }
  for(const word of app.data.words){
    if(lessonBook.get(word.lessonId)===currentBook.id&&content.length<800) content+=' '+word.meaning;
  }
  return content;
});

const actionError=ref('');
async function review(){
  if(starting.value||app.busy)return;
  starting.value=true;actionError.value='';
  try{
    if(await app.start('review'))await router.push('/study');
    else actionError.value=app.error||'复习暂时无法开始，请稍后重试。';
  }catch(error){actionError.value=error instanceof Error?error.message:'复习暂时无法开始，请稍后重试。';}
  finally{starting.value=false;}
}
function dismissLearningStart(){learningStartPreference.dismiss(learningStartOwner.value)}
const hasProgress=computed(()=>(app.data?.logs?.length||0)>0||(app.data?.states||[]).some(s=>!!s.firstSeenAt||s.reviewCount>0));
const checkpoint=computed(()=>app.hasResumableSession?app.studySession:undefined);
const nextLesson=computed(()=>{
  const saved=checkpoint.value;
  const word=app.queue?.[app.index]??app.data?.words?.find(w=>w.id===saved?.wordIds[saved.index]);
  const lesson=app.data?.lessons?.find(l=>l.id===word?.lessonId);
  if(lesson)return lesson;
  if(saved?.lessonIds?.length===1)return app.data?.lessons?.find(l=>l.id===saved.lessonIds![0]);
  if(saved?.lessonIds?.length)return undefined;
  if(hasProgress.value)return undefined;
  return app.data?.lessons?.filter(l=>l.bookId===book.value?.id).sort((a,b)=>a.order-b.order)[0];
});
const learningBook=computed(()=>{
  const id=nextLesson.value?.bookId??checkpoint.value?.bookIds[0]??book.value?.id;
  const target=app.data?.books?.find(b=>b.id===id);
  return target?{...target,title:fullBookTitle(target)}:book.value;
});
const roundPosition=computed(()=>{
  const saved=checkpoint.value;
  const cursor=app.queue?.length?app.index:saved?.index??0;
  const total=app.queue?.length||saved?.wordIds.length||0;
  return {done:Math.max(0,Math.min(cursor,total)),size:total};
});
const scopeLabel=computed(()=>{
  const scene=sceneFor(checkpoint.value?.sceneId);
  if(scene)return scene.title;
  if(checkpoint.value?.lessonIds&&checkpoint.value.lessonIds.length>1)return '所选 '+checkpoint.value.lessonIds.length+' 个课次';
  return nextLesson.value?.title??(hasProgress.value?'从最近学习进度继续':'从词书第一课开始');
});
const todayPlan=computed(()=>book.value
  ?dailyStudyPlan(app.data,book.value.id,studyPlanPreference.getPace(book.value.id),app.now??new Date(),app.currentUser?.id??'local')
  :{lessonTitle:'',target:0,completed:0,remaining:0,pendingWordIds:[]});
const paceLabel=computed(()=>{
  const unit=book.value&&bookCategory(book.value)==='jlpt'?'组':'课';
  return (studyPlanPreference.getPace(book.value?.id??'')===0.5?'半':'1 ')+unit+' / 天';
});
const actionMode=computed(()=>{
  if(checkpoint.value)return 'resume';
  if(homeDisplay.value==='review'&&safeStats.value.due>0)return 'review';
  return todayPlan.value.remaining>0?'new':'none';
});
const primaryLabel=computed(()=>{
  if(actionMode.value==='resume')return checkpoint.value?.sceneId?'继续场景练习':'继续上次学习';
  if(actionMode.value==='review')return '开始复习';
  if(actionMode.value==='new')return todayPlan.value.completed?'继续今日计划':'开始今日计划';
  return '';
});
const resumeBookTitle=computed(()=>{
  const saved=checkpoint.value;
  if(!saved)return '';
  const originalBook=app.data?.books?.find(item=>item.id===saved.bookIds?.[0]);
  return originalBook?fullBookTitle(originalBook):learningBook.value?.title??'原词书';
});
const idlePlanMessage=computed(()=>todayPlan.value.target>0
  ?'今日计划已完成，今天先到这里也很好。'
  :bp.value.learned>=bp.value.total&&bp.value.total>0
    ?'这本词书的新词已经学完。可以选择其他课次或词书。'
    :'今天没有待学的新词。可以选择课次，开始新的学习。');
const focusCard=computed(()=>{
  if(checkpoint.value)return {label:'上次学习',value:roundPosition.value.size-roundPosition.value.done,unit:'词',note:scopeLabel.value,caption:'',mark:'CONTINUE'};
  if(homeDisplay.value==='today'){
    const plan=todayPlan.value;
    const waiting=!plan.target&&bp.value.total>bp.value.learned;
    return {label:'今日待学',value:waiting?'—':plan.remaining,unit:'词',note:waiting?'打开词书，查看你的每日计划。':plan.target?'今日已学 '+plan.completed+' / '+plan.target+' 词':'当前词书的新词，已经认识了。',caption:plan.lessonTitle?plan.lessonTitle+' · '+paceLabel.value:paceLabel.value,mark:'LEARN'};
  }
  if(homeDisplay.value==='progress')return {label:'词书进度',value:bp.value.percent,unit:'%',note:'已学 '+bp.value.learned+' / '+bp.value.total+' 词',caption:book.value?.title??'先选择一本词书',mark:'GROW'};
  if(!safeStats.value.due)return {label:'今日待学',value:todayPlan.value.remaining,unit:'词',note:todayPlan.value.target?'今天暂无到期复习。今日新词已学 '+todayPlan.value.completed+' / '+todayPlan.value.target+' 词':idlePlanMessage.value,caption:todayPlan.value.lessonTitle?todayPlan.value.lessonTitle+' · '+paceLabel.value:paceLabel.value,mark:'LEARN'};
  return {label:'待复习',value:safeStats.value.due,unit:'词',note:safeStats.value.due?'让熟悉的词，再见一次。':'今天暂无到期复习。',caption:safeStats.value.due?'温习一小轮，让记忆更清晰。':'先认识几个新词，到了时间再相见。',mark:'REVIEW'};
});
const starting=ref(false);
async function startLearning(forceNewPlan=false){
  if(starting.value||app.busy) return;
  starting.value=true;
  actionError.value='';
  try{
    let started=false;
    if(actionMode.value==='resume')started=await app.continueLearning();
    else if((forceNewPlan||actionMode.value==='new')&&book.value)started=await app.startDailyLearning?.(book.value.id);
    if(!started)actionError.value=app.error||(actionMode.value==='resume'?'上次学习暂时无法恢复，请重试。':'今日计划暂时无法开始，请重新选择课次。');
    if(started)await router.push('/study');
  }catch(error){actionError.value=error instanceof Error?error.message:'学习暂时无法开始，请稍后重试。';
  }finally{
    starting.value=false;
  }
}
</script>
<template>
  <section class="page-heading home-heading">
    <div><p class="eyebrow">{{new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}}</p><h1>今天，也学一点吧。</h1><p class="muted">每次一点点，慢慢把日语带进生活。</p></div>
    <span v-if="safeStats.streak" class="streak"><Flame :size="17"/> 连续学习 {{safeStats.streak}} 天</span>
  </section>
  <section class="focus-card" aria-labelledby="focus-card-heading">
    <div class="focus-card-top"><p class="eyebrow">今日の手帖 <span>{{focusCard.mark}}</span></p><RouterLink to="/settings" class="focus-settings"><Settings2 :size="14"/>调整开屏</RouterLink></div>
    <div class="focus-card-body">
      <div class="focus-value-column">
        <h2 id="focus-card-heading">{{focusCard.label}}</h2>
        <div class="focus-number"><strong>{{focusCard.value}}</strong><span>{{focusCard.unit}}</span></div>
        <div v-if="checkpoint" class="focus-resume">
          <p class="focus-resume-lesson">{{scopeLabel}}</p>
          <p class="focus-resume-book">{{resumeBookTitle}}</p>
        </div>
        <template v-else>
          <p class="focus-note">{{actionMode==='none' ? idlePlanMessage : focusCard.note}}</p>
          <p class="focus-caption">{{focusCard.caption}}</p>
        </template>
      </div>
      <div class="focus-art" aria-hidden="true"><div class="settings-heading-mark"><span>ことば</span><img class="brand-seal-mark" :src="brandMarkUrl" alt="" width="80" height="80"></div></div>
    </div>
    <div v-if="homeDisplay==='progress'" class="focus-progress"><div class="progress"><i :style="{width:bp.percent+'%'}"></i></div><span>每一点积累，都留在这里。</span></div>
    <div class="focus-card-bottom">
      <div class="home-learning-actions">
        <button v-if="actionMode!=='none'" class="primary" :disabled="app.busy||starting||actionMode==='resume'&&!learningBook" :aria-busy="starting" @click="actionMode==='review'?review():startLearning()">{{primaryLabel}} <ArrowRight :size="18"/></button>
        <button v-if="actionMode==='resume'&&safeStats.due>0 || actionMode==='new'&&safeStats.due>0" :disabled="app.busy||starting" @click="review">开始复习 <ArrowRight :size="16"/></button>
        <button v-if="actionMode==='review'&&todayPlan.remaining>0" :disabled="app.busy||starting" @click="startLearning(true)">学习新词 <ArrowRight :size="16"/></button>
        <RouterLink v-if="actionMode==='none'&&book" class="home-select-lesson" :to="'/books/'+book.id">选择课次 <ArrowRight :size="16"/></RouterLink>
        <RouterLink v-if="actionMode==='none'&&!book" class="home-select-lesson" to="/books">选择词书 <ArrowRight :size="16"/></RouterLink>
      </div>
      <span v-if="!checkpoint" class="focus-round-hint">新词计划 · {{paceLabel}}<RouterLink v-if="book" :to="'/books/'+book.id">调整每日进度 →</RouterLink></span>
    </div>
    <p v-if="actionError" class="home-action-error" role="alert">{{actionError}}</p>
  </section>
  <section v-if="showLearningStart" class="learning-start-hint" aria-label="学习起点建议">
    <p>选个起点，开始学习</p>
    <div><RouterLink to="/start">选择起点 <ArrowRight :size="15" aria-hidden="true"/></RouterLink><button type="button" @click="dismissLearningStart">先这样学</button></div>
  </section>
  <section v-if="actionMode==='none'&&homeDisplay!=='review'&&safeStats.due" class="review-reminder" aria-label="今日复习"><div><span class="review-dot due"></span><p>待复习 <strong>{{safeStats.due}}</strong> 词</p></div><button :disabled="app.busy||starting" @click="review">开始复习 <ArrowRight :size="16"/></button></section>
  <section class="metric-row"><div><span>今日新学</span><strong>{{safeStats.newToday}}<small>词</small></strong></div><div><span>今日复习</span><strong>{{safeStats.reviewToday}}<small>次</small></strong></div><div><span>累计学习</span><strong>{{safeStats.learned}}<small>词</small></strong></div><div><span>当前词书</span><strong>{{bp.percent}}<small>%</small></strong></div></section>
  <div class="home-columns">
    <section><div class="section-title"><h2>词书与课次</h2><RouterLink to="/books">全部词书 <ArrowUpRight :size="16"/></RouterLink></div><RouterLink v-if="book" :to="'/books/'+book.id" class="current-book"><div class="home-book-cover"><BookCover :book="book" :content="currentBookCoverContent"/></div><div><span class="eyebrow">正在学习</span><h3>{{book.title}}</h3><p class="muted">{{currentBookLessonsCount}} {{bookCategory(book)==='jlpt'?'组':'课'}} · {{bp.total}} 词</p><div class="progress"><i :style="{width:bp.percent+'%'}"></i></div><small>已学 {{bp.learned}} / {{bp.total}} 词</small><p class="text-action">打开词书，选择课次 <ArrowRight :size="16"/></p></div></RouterLink><div v-else class="empty">还没有词书。<RouterLink to="/import">导入第一本词书</RouterLink></div></section>
    <section><div class="section-title"><h2>这一周的积累</h2><RouterLink to="/stats">详情 <ArrowUpRight :size="16"/></RouterLink></div><WeekChart :days="safeStats.days||[]"/></section>
  </div>
  <div class="quiet-note"><BookOpen :size="18"/><span>从感兴趣的一课开始。所有课次，都可以自由选择。</span><RouterLink class="start-link" to="/start">选择学习起点 →</RouterLink><RouterLink to="/import">导入我的词书 →</RouterLink></div>
</template>

<style scoped>
.home-heading{margin-bottom:26px}
.focus-card{position:relative;isolation:isolate;overflow:hidden;padding:27px 34px 25px;border:1px solid #cfdcc6;border-radius:20px;background:linear-gradient(112deg,#e9f0e1,#f5f7ef 78%);box-shadow:0 14px 38px #31523308}
.focus-card::after{content:"";position:absolute;inset:4px;border:1px solid #ffffff8c;border-radius:16px;pointer-events:none;z-index:-1}
.focus-card-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:21px;border-bottom:1px solid #ccd9c180}
.focus-card-top .eyebrow{display:flex;gap:16px;align-items:center;font-size:10px;margin:0;letter-spacing:.12em;color:#55704d}
.focus-card-top .eyebrow span{font-size:8px;letter-spacing:.15em;padding-left:16px;border-left:1px solid #b9cab0}
.focus-settings{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#62785a;min-height:44px;white-space:nowrap}
.focus-settings:hover{color:#294d35;text-decoration:underline;text-underline-offset:4px}
.focus-card-body{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:32px;align-items:center;padding:25px 0 27px}
.focus-value-column{min-width:0}
.focus-value-column h2{font-size:13px;font-weight:500;line-height:1.5;margin:0 0 5px;color:#536c4b}
.focus-number{display:flex;align-items:baseline;gap:12px;color:#294b35;font-variant-numeric:tabular-nums}
.focus-number strong{font-size:clamp(78px,8.5vw,112px);font-weight:500;line-height:1.08;letter-spacing:-.055em}
.focus-number>span{font-size:23px;font-weight:400;color:#5f7656}
.focus-note{font-size:16px;line-height:1.6;color:#3d5c40;margin:10px 0 6px}
.focus-caption{font-size:12px;line-height:1.7;color:#6f8065;margin:0;overflow-wrap:anywhere}
.focus-resume{margin-top:14px;overflow-wrap:anywhere}
.focus-resume-lesson{margin:0;font-size:16px;font-weight:600;line-height:1.6;color:var(--green)}
.focus-resume-book{margin:4px 0 0;font-size:14px;line-height:1.6;color:var(--muted)}
.focus-art{position:relative;align-self:stretch;min-height:170px}
.focus-art .settings-heading-mark{position:absolute;left:50%;top:50%;display:grid;place-items:center;width:156px;height:156px;transform:translate(-50%,-50%) rotate(12deg);pointer-events:none;color:#50765d}
.focus-art .settings-heading-mark::before,.focus-art .settings-heading-mark::after{content:"";position:absolute;border:1px solid rgba(83,119,84,.24);border-radius:50%;inset:5px}
.focus-art .settings-heading-mark::after{inset:20px;border-style:dashed}
.focus-art .settings-heading-mark strong{font:72px/1 "Yu Mincho","Noto Serif JP",serif;font-weight:400}
.focus-art .settings-heading-mark span{position:absolute;bottom:2px;font:11px/1 serif;letter-spacing:.2em}
.focus-card-bottom{display:flex;align-items:center;justify-content:flex-start;gap:28px;padding-top:21px;border-top:1px solid #ccd9c180}
.home-learning-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.home-learning-actions .primary{min-width:172px}
.home-select-lesson{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:10px 14px;border:1px solid #cddac3;border-radius:8px;color:#496346;background:#ffffff4d;font-size:12px}
.home-action-error{margin:12px 0 0;color:#9b4f42;font-size:12px;line-height:1.6}
.home-learning-actions button:not(.primary){background:#ffffff4d;border-color:#cddac3;color:#5b7152}
.home-learning-actions button:disabled{color:#8c9a83;opacity:.5}
.focus-round-hint{font-size:11px;color:#6a7e5f;line-height:1.6;text-align:left}
.focus-round-hint>span{display:block}.focus-round-hint a{display:block;margin-top:5px;color:#55714b;text-underline-offset:3px}.focus-round-hint a:hover{text-decoration:underline}
.focus-progress{display:flex;align-items:center;gap:18px;margin:-2px 0 23px}
.focus-progress .progress{flex:1;height:4px;background:#d9e4cf}
.focus-progress>span{font-size:10px;color:#728268}
.review-reminder{display:flex;align-items:center;justify-content:flex-start;gap:24px;margin:16px 0 0;padding:16px 3px;border-bottom:1px solid var(--line)}
.review-reminder>div{display:flex;align-items:center;gap:12px;min-width:0}
.review-reminder p{margin:0;font-size:12px;line-height:1.6}
.review-reminder strong{font-size:13px;font-weight:500;color:#43583d}
.review-reminder button{font-size:12px;flex-shrink:0;background:transparent}
.review-dot{width:8px;height:8px;border-radius:50%;background:#567d58;box-shadow:0 0 0 4px #eaf0e2;flex-shrink:0}
.learning-start-hint{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0 0;padding:11px 16px;border:1px solid #e2e8dc;border-radius:10px;background:#fbfcf8}.learning-start-hint p{margin:0;color:#52664d;font-size:12px;line-height:1.6}.learning-start-hint>div{display:flex;align-items:center;gap:8px}.learning-start-hint a{display:inline-flex;align-items:center;gap:5px;min-height:44px;color:#456246;font-size:12px}.learning-start-hint button{min-height:44px;padding:8px 12px;background:transparent;color:#687667;font-size:11px}
.quiet-note .start-link{margin-left:auto}.quiet-note .start-link+ a{margin-left:0}
@media(max-width:760px){.home-heading{margin-bottom:20px}.home-heading h1{font-size:30px}.focus-card{padding:20px 22px;border-radius:17px}.focus-card-top{padding-bottom:15px}.focus-card-body{grid-template-columns:minmax(0,1fr) 104px;gap:12px;padding:22px 0}.focus-card-top .eyebrow{font-size:9px;gap:10px}.focus-card-top .eyebrow span{padding-left:10px;font-size:7px}.focus-settings{font-size:10px}.focus-settings svg{display:none}.focus-number strong{font-size:84px}.focus-number>span{font-size:19px}.focus-note{font-size:14px;margin-top:8px}.focus-caption{font-size:11px}.focus-art{min-height:150px}.focus-art .settings-heading-mark{width:94px;height:94px;opacity:.68}.focus-art .settings-heading-mark::after{inset:12px}.focus-art .settings-heading-mark strong{font-size:46px}.focus-art .settings-heading-mark span{font-size:7px;letter-spacing:.14em}.focus-card-bottom{display:block;padding-top:16px}.home-learning-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.home-learning-actions .primary{min-width:0}.home-learning-actions button{padding:10px 8px;min-height:44px;font-size:12px}.home-learning-actions svg{display:none}.focus-round-hint{display:block;text-align:left;font-size:10px;margin-top:12px}.focus-round-hint>span{display:inline}.focus-progress{display:block;margin:0 0 20px}.focus-progress .progress{margin-bottom:8px}.review-reminder{align-items:flex-start;gap:12px}.review-reminder button{padding:9px;font-size:11px}.review-reminder button svg{display:none}.home-heading .muted{font-size:13px}}
@media(max-width:760px){.learning-start-hint{align-items:flex-start;flex-direction:column;padding:11px 13px}.learning-start-hint>div{width:100%;justify-content:space-between}.quiet-note .start-link{margin-left:0}}
@media(max-width:360px){.focus-card{padding:18px}.focus-card-body{grid-template-columns:minmax(0,1fr) 82px}.focus-number strong{font-size:76px}.focus-art .settings-heading-mark{width:78px;height:78px;opacity:.58}.focus-art .settings-heading-mark::after{inset:10px}.focus-art .settings-heading-mark strong{font-size:38px}.focus-art .settings-heading-mark span{font-size:6px;letter-spacing:.1em}.focus-note{font-size:13px}.focus-card-top .eyebrow span{display:none}}
@media(max-width:760px){.focus-resume{margin-top:12px}.focus-resume-lesson{font-size:14px}.focus-resume-book{font-size:12px}}
.home-book-cover{display:grid;place-items:center;align-self:center;min-width:0}
.home-book-cover :deep(.cover-object){width:100%;max-width:104px}
.home-book-cover :deep(.cover-type){padding:11px 8px 0 16px}
.home-book-cover :deep(.cover-type small){font-size:6px;letter-spacing:.03em;line-height:1.4}
.home-book-cover :deep(.cover-type strong){font-size:14px;line-height:1.4;margin:4px 0}
.home-book-cover :deep(.cover-type span){font-size:6px;line-height:1.4}
.home-book-cover :deep(.cover-custom .cover-type strong){font-size:12px}
.home-book-cover :deep(.cover-exam .cover-type strong){font-size:26px}
.home-book-cover :deep(.cover-art){height:52%;bottom:14px}
.home-book-cover :deep(.cover-imprint){left:15px;right:8px;bottom:8px;font-size:5px}
.home-book-cover :deep(.cover-imprint b){width:12px;height:12px;font-size:8px}
.home-book-cover :deep(.cover-spine){width:7px}
.home-book-cover :deep(.cover-pages){left:7px;right:3px;bottom:3px;height:2px}
</style>
