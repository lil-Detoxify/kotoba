import {describe,expect,it} from 'vitest';
import {emptyData} from '@jp/models';
import {evaluate,initialState} from '@jp/core';
import type {Data,QuizType,ReviewLog,Word} from '@jp/models';
import {sessionSummary} from '../apps/web/src/services/study-feedback';

const now=new Date('2026-10-08T05:00:00Z');
function fixture(count=8):Data {
  const data=emptyData();
  data.lessons=[{id:'lesson',bookId:'book',title:'第一课',order:1}];
  data.words=Array.from({length:count},(_,order)=>({
    id:`word-${order}`,lessonId:'lesson',term:`単語${order}`,reading:`たんご${order}`,
    meaning:`meaning-${order}`,order,
  }));
  return data;
}
function record(data:Data,word:Word,rating:1|2|3|4,count=0,options:{
  id?:string;userId?:string;reviewedAt?:string;quiz?:ReviewLog['quiz'];
  previousFirstSeenAt?:string;previousReviewCount?:number;newReviewCount?:number;
}={}) {
  const previous={...initialState(word.id,now,options.userId??'local'),
    reviewCount:options.previousReviewCount??count,
    firstSeenAt:options.previousFirstSeenAt??(count?'2026-10-01T05:00:00Z':undefined)};
  const result=evaluate(previous,rating,count?'review':'new',new Date(options.reviewedAt??now),options.id??`${word.id}-${data.logs.length}`,300);
  if(options.newReviewCount!==undefined)result.log.newState.reviewCount=options.newReviewCount;
  if(options.quiz)result.log.quiz=options.quiz;
  data.logs.push(result.log);
  return result.log;
}
function quiz(type:QuizType,isCorrect:boolean):NonNullable<ReviewLog['quiz']> {
  return {type,prompt:'question',options:['a','b'],selected:isCorrect?'a':'b',correct:'a',isCorrect};
}

describe('web session summary',()=>{
  it('returns every completed new and review word, including more than five weak words',()=>{
    const data=fixture(8);
    for(let i=0;i<7;i++)record(data,data.words[i],i%2?2:1);
    record(data,data.words[7],3,2);

    const summary=sessionSummary(data,data.words,8,Array(8).fill(0));
    expect([summary.newCount,summary.reviewCount,summary.skippedCount]).toEqual([7,1,0]);
    expect(summary.newWords.map(word=>word.id)).toEqual(data.words.slice(0,7).map(word=>word.id));
    expect(summary.reviewWords.map(word=>word.id)).toEqual(['word-7']);
    expect(summary.practiceWords.map(word=>word.id)).toEqual(data.words.slice(0,7).map(word=>word.id));
    expect(summary.recap.map(word=>word.id)).toEqual(data.words.slice(0,4).map(word=>word.id));
  });

  it('uses only completed, deduplicated, post-baseline owner or local logs and counts unrecorded words as skipped',()=>{
    const data=fixture(4),[fresh,review,skipped,pending]=data.words;
    const old=record(data,fresh,1,0,{id:'fresh-old',userId:'owner',newReviewCount:1});
    const freshReview=record(data,fresh,3,1,{id:'fresh-new',userId:'owner',previousFirstSeenAt:'2026-10-08T04:00:00Z',previousReviewCount:1,newReviewCount:2});
    data.logs.push({...freshReview}); // repeated event id at the same timestamp
    data.logs.push({...freshReview,id:'invalid-date',reviewedAt:'not-a-date',newState:{...freshReview.newState,reviewCount:99}});
    record(data,review,2,4,{id:'review-local',userId:'local',newReviewCount:5});
    record(data,review,1,4,{id:'review-before-baseline',userId:'owner',newReviewCount:4,reviewedAt:'2026-10-08T04:00:00Z'});
    record(data,skipped,1,0,{id:'wrong-owner',userId:'someone-else',newReviewCount:1});
    record(data,pending,1,0,{id:'not-completed',userId:'owner',newReviewCount:1});
    expect(old.newState.reviewCount).toBe(1);

    const summary=sessionSummary(data,[fresh,review,skipped,fresh,pending],4,[0,4,0,0,0],'owner');
    expect(summary.newWords.map(word=>word.id)).toEqual([]);
    expect(summary.reviewWords.map(word=>word.id)).toEqual(['word-0','word-1']);
    expect(summary.skippedCount).toBe(1);
    expect(summary.recap.map(word=>word.id)).toEqual(['word-0','word-1']);
  });

  it('separates objective quiz answers from self grades and includes wrong objective answers in practice',()=>{
    const data=fixture(10);
    const types:QuizType[]=['kana-meaning','kanji-reading','audio-meaning'];
    types.forEach((type,index)=>{
      const wrong=quiz(type,false);
      if(index===1)wrong.selected=null;
      record(data,data.words[index],index===1?3:1,0,{quiz:index===1?wrong:quiz(type,true)});
      record(data,data.words[index+3],3,1,{quiz:quiz(type,index===1)});
    });
    record(data,data.words[6],1);
    record(data,data.words[7],2);
    record(data,data.words[8],3);
    record(data,data.words[9],4);

    const summary=sessionSummary(data,data.words,10,Array(10).fill(0));
    expect(summary.quiz).toEqual({total:6,correct:3,incorrect:3,accuracy:50});
    expect(summary.self).toEqual({total:4,forgotten:1,uncertain:1,remembered:2});
    expect(summary.practiceWords.map(word=>word.id)).toEqual(['word-0','word-1','word-2','word-3','word-5','word-6','word-7']);
  });

  it('keeps accuracy null and quiz and self totals empty when completed logs have no supported question or self grade',()=>{
    const data=fixture(2);
    record(data,data.words[0],3,0,{quiz:{...quiz('kana-meaning',true),type:'card' as QuizType}});
    record(data,data.words[1],4,1,{quiz:{...quiz('audio-meaning',false),isCorrect:undefined as never}});

    const summary=sessionSummary(data,data.words,2,[0,0]);
    expect(summary.quiz).toEqual({total:0,correct:0,incorrect:0,accuracy:null});
    expect(summary.self).toEqual({total:0,forgotten:0,uncertain:0,remembered:0});
  });

  it('preserves complete word data and does not mutate saved data while summarizing',()=>{
    const data=fixture(1),word=data.words[0];
    word.readingContexts=[{id:'context-1',sentence:'この単語を使います。',translation:'使用这个词。',sourceTitle:'Reader',createdAt:'2026-10-01',updatedAt:'2026-10-02'}];
    word.senses=[{meaning:'sense',example:'例文です。',exampleReading:'れいぶんです。'}];
    record(data,word,2);
    const before=JSON.stringify(data);

    const summary=sessionSummary(data,[word],1,[0]);
    expect(summary.newWords[0]).toEqual(word);
    expect(summary.practiceWords[0]).toEqual(word);
    expect(summary.recap[0]).toEqual(word);
    expect(JSON.stringify(data)).toBe(before);
  });
});
