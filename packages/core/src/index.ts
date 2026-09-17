import {createEmptyCard,fsrs,State,type Grade} from 'ts-fsrs';
import type {Data,Word,WordState,ReviewLog,StudyMode,Lesson} from '@jp/models';
import {dayKey,daysBefore} from '@jp/shared';
const scheduler=fsrs({enable_fuzz:false});
export function initialState(wordId:string,now=new Date(),userId='local'):WordState {return {wordId,userId,status:'new',isIgnored:false,isDifficult:false,reviewCount:0,lapseCount:0,card:createEmptyCard(now)}}
export function stateFor(data:Data,id:string):WordState|undefined {return data.states.find(s=>s.wordId===id&&s.userId==='local')}
export function getSelectedLessonWords(words:Word[],ids:string[]):Word[]{return words.filter(w=>ids.includes(w.lessonId)).sort((a,b)=>ids.indexOf(a.lessonId)-ids.indexOf(b.lessonId)||a.order-b.order)}
export function selectRange(lessons:Lesson[],from:number,to:number):string[]{return lessons.filter(l=>l.order>=Math.min(from,to)&&l.order<=Math.max(from,to)).sort((a,b)=>a.order-b.order).map(l=>l.id)}
export function getDueWords(data:Data,now=new Date()):Word[]{return data.words.filter(w=>{const s=stateFor(data,w.id);return s&&!s.isIgnored&&s.nextReviewAt&&new Date(s.nextReviewAt)<=now})}
export function getDifficultWords(data:Data):Word[]{return data.words.filter(w=>{const s=stateFor(data,w.id);return s?.isDifficult&&!s.isIgnored})}
export function createStudyQueue(data:Data,mode:StudyMode,lessonIds?:string[],now=new Date()):Word[]{const words=mode==='review'?getDueWords(data,now):mode==='difficult'?getDifficultWords(data):data.words.filter(w=>{const s=stateFor(data,w.id);return !s?.isIgnored&&!s?.firstSeenAt});return lessonIds?getSelectedLessonWords(words,lessonIds):words}
export function evaluate(previous:WordState,rating:Grade,mode:StudyMode,now:Date,id:string,responseTime=0):{state:WordState;log:ReviewLog}{
 const {card}=scheduler.next(previous.card,now,rating);
 const state:WordState={...previous,card,status:card.state===State.Review?(card.stability>=30?'mastered':'review'):'learning',firstSeenAt:previous.firstSeenAt??now.toISOString(),lastReviewedAt:now.toISOString(),nextReviewAt:card.due.toISOString(),reviewCount:previous.reviewCount+1,lapseCount:card.lapses};
 return {state,log:{id,userId:state.userId,wordId:state.wordId,reviewedAt:now.toISOString(),rating,responseTime,previousState:structuredClone(previous),newState:structuredClone(state),studyMode:mode}};
}
export function progress(data:Data,words:Word[]){const active=words.filter(w=>!stateFor(data,w.id)?.isIgnored);const learned=active.filter(w=>stateFor(data,w.id)?.firstSeenAt).length;const mastered=active.filter(w=>stateFor(data,w.id)?.status==='mastered').length;return {total:active.length,learned,mastered,percent:active.length?Math.round(learned/active.length*100):0}}
export function statistics(data:Data,now=new Date()){
 const today=dayKey(now);const logs=data.logs.filter(l=>l.userId==='local');const todayLogs=logs.filter(l=>dayKey(new Date(l.reviewedAt))===today);
 const days=Array.from({length:7},(_,i)=>{const date=daysBefore(now,6-i);const key=dayKey(date);return {day:key,label:`${date.getMonth()+1}/${date.getDate()}`,count:logs.filter(l=>dayKey(new Date(l.reviewedAt))===key).length}});
 const activeDays=new Set(logs.map(l=>dayKey(new Date(l.reviewedAt))));let streak=0;let offset=activeDays.has(today)?0:1;while(activeDays.has(dayKey(daysBefore(now,offset++))))streak++;
 const counts={new:0,learning:0,review:0,mastered:0};for(const w of data.words){const s=stateFor(data,w.id);if(!s?.isIgnored)counts[s?.status??'new']++}
 return {...progress(data,data.words),due:getDueWords(data,now).length,newToday:new Set(todayLogs.filter(l=>!l.previousState.firstSeenAt).map(l=>l.wordId)).size,reviewToday:todayLogs.filter(l=>!!l.previousState.firstSeenAt).length,totalReviews:logs.length,streak,days,counts};
}

export * from './quiz';
