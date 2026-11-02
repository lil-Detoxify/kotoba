import type {Data,ReviewLog,Word} from '@jp/models';
import {stateFor} from '@jp/core';

const belongs=(log:ReviewLog,userId='local')=>log.userId===userId||log.userId==='local';
export interface SessionSummary {
  newCount:number;
  reviewCount:number;
  skippedCount:number;
  newWords:Word[];
  reviewWords:Word[];
  practiceWords:Word[];
  recap:Word[];
  quiz:{total:number;correct:number;incorrect:number;accuracy:number|null};
  self:{total:number;forgotten:number;uncertain:number;remembered:number};
}
const objectiveTypes=new Set(['kana-meaning','kanji-reading','audio-meaning','kana-input','dictation']);
export function sessionSummary(data:Data,queue:Word[],index:number,baseline:number[]=[],userId='local'):SessionSummary {
  const result:SessionSummary={
    newCount:0,reviewCount:0,skippedCount:0,newWords:[],reviewWords:[],practiceWords:[],recap:[],
    quiz:{total:0,correct:0,incorrect:0,accuracy:null},
    self:{total:0,forgotten:0,uncertain:0,remembered:0},
  };
  const completed=new Map<string,{word:Word;baseline:number}>();
  for(const [position,word] of queue.slice(0,Math.max(0,index)).entries()) {
    if(!completed.has(word.id))completed.set(word.id,{word,baseline:baseline[position]??0});
  }
  const latest=new Map<string,{log:ReviewLog;time:number}>();
  const events=new Set<string>();
  for(const log of data.logs){
    const entry=completed.get(log.wordId);
    const time=Date.parse(log.reviewedAt);
    if(!entry||!belongs(log,userId)||events.has(log.id)||!Number.isFinite(time)||(log.newState?.reviewCount??0)<=entry.baseline)continue;
    events.add(log.id);
    const previous=latest.get(log.wordId);
    if(!previous||time>previous.time||time===previous.time&&log.newState.reviewCount>previous.log.newState.reviewCount)latest.set(log.wordId,{log,time});
  }
  for(const {word} of completed.values()) {
    const log=latest.get(word.id)?.log;
    if(!log){result.skippedCount++;continue;}
    if(log.previousState?.firstSeenAt||log.previousState?.reviewCount>0)result.reviewWords.push(word);else result.newWords.push(word);
    if(result.recap.length<4)result.recap.push(word);
    const objective=!!log.quiz&&objectiveTypes.has(log.quiz.type)&&typeof log.quiz.isCorrect==='boolean';
    if(objective){
      result.quiz.total++;
      if(log.quiz!.isCorrect)result.quiz.correct++;else result.quiz.incorrect++;
    }else if(log.quiz==null){
      if(log.rating===1){result.self.total++;result.self.forgotten++;}
      else if(log.rating===2){result.self.total++;result.self.uncertain++;}
      else if(log.rating===3||log.rating===4){result.self.total++;result.self.remembered++;}
    }
    if(log.rating<=2||objective&&!log.quiz!.isCorrect)result.practiceWords.push(word);
  }
  result.newCount=result.newWords.length;
  result.reviewCount=result.reviewWords.length;
  if(result.quiz.total)result.quiz.accuracy=Math.round(result.quiz.correct/result.quiz.total*100);
  return result;
}

export interface WeakPracticeSuggestion {word:Word;reason:string}
/** Transparent suggestions from recorded evaluations, scoped to the selected book. */
export function weakPracticeSuggestions(data:Data,now:Date,userId='local',bookId?:string,limit=5):WeakPracticeSuggestion[] {
  const lessons=new Set(data.lessons.filter(lesson=>!bookId||lesson.bookId===bookId).map(lesson=>lesson.id));
  const since=now.getTime()-30*24*60*60*1000;
  const logsByWord=new Map<string,ReviewLog[]>();const events=new Set<string>();
  for(const log of data.logs){
    const time=Date.parse(log.reviewedAt);
    if(!belongs(log,userId)||events.has(log.id)||!Number.isFinite(time)||time<since||time>now.getTime())continue;
    events.add(log.id);const rows=logsByWord.get(log.wordId)??[];rows.push(log);logsByWord.set(log.wordId,rows);
  }
  const ranked:({word:Word;reason:string;score:number;recent:number})[]=[];
  for(const word of data.words){
    if(!lessons.has(word.lessonId))continue;
    const state=stateFor(data,word.id,userId);
    if(state?.isIgnored)continue;
    const logs=(logsByWord.get(word.id)??[]).sort((a,b)=>Date.parse(b.reviewedAt)-Date.parse(a.reviewedAt));
    const forgotten=logs.filter(log=>log.rating===1).length;
    const unsure=logs.filter(log=>log.rating===2).length;
    const latest=logs[0];
    if(!state?.isDifficult&&!forgotten&&!unsure)continue;
    if(!state?.isDifficult&&latest&&latest.rating>=3&&forgotten<2)continue;
    const reason=forgotten?'近 30 天有 '+forgotten+' 次「忘记」':unsure?'近 30 天有 '+unsure+' 次「模糊」':'你标记了生词';
    ranked.push({word,reason,score:forgotten*3+unsure+(state?.isDifficult?2:0),recent:latest?Date.parse(latest.reviewedAt):0});
  }
  return ranked.sort((a,b)=>b.score-a.score||b.recent-a.recent||a.word.order-b.word.order).slice(0,limit).map(({word,reason})=>({word,reason}));
}
