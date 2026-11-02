import {describe,expect,it} from 'vitest';
import {emptyData} from '@jp/models';
import {initialState} from '@jp/core';
import {dailyStudyPlan} from '../apps/web/src/services/daily-study-plan';

function fixture(){
  const data=emptyData();
  data.lessons=[{id:'a-1',bookId:'a',title:'第一课',order:1},{id:'a-2',bookId:'a',title:'第二课',order:2},{id:'b-1',bookId:'b',title:'另一词书',order:1}];
  data.words=Array.from({length:13},(_,index)=>({id:'w-'+index,lessonId:index<7?'a-1':index<11?'a-2':'b-1',term:'词'+index,reading:'ことば',meaning:'测试',order:index}));
  return data;
}
const today=new Date('2026-10-08T12:00:00Z');
function learn(data:ReturnType<typeof fixture>,ids:string[],date:string){for(const id of ids)data.states.push({...initialState(id),firstSeenAt:date,reviewCount:1});}
describe('Daily progress by lesson',()=>{
  it('uses a whole lesson or half a lesson, including an odd word count',()=>{
    const data=fixture();expect(dailyStudyPlan(data,'a',1,today).target).toBe(7);expect(dailyStudyPlan(data,'a',0.5,today).target).toBe(4);
    expect(dailyStudyPlan(data,'b',1,today).target).toBe(2);
  });
  it('keeps the same goal after completing it today, and advances naturally tomorrow',()=>{
    const data=fixture();const first=dailyStudyPlan(data,'a',0.5,today);learn(data,first.pendingWordIds,'2026-10-08T10:00:00Z');
    expect(dailyStudyPlan(data,'a',0.5,today)).toMatchObject({target:4,completed:4,remaining:0,lessonId:'a-1'});
    expect(dailyStudyPlan(data,'a',0.5,new Date('2026-10-09T12:00:00Z'))).toMatchObject({target:3,completed:0,remaining:3,lessonId:'a-1'});
  });
  it('counts current lesson progress and skips lessons completed before today',()=>{
    const data=fixture();learn(data,data.words.slice(0,7).map(word=>word.id),'2026-10-07T10:00:00Z');
    expect(dailyStudyPlan(data,'a',1,today)).toMatchObject({lessonId:'a-2',target:4,remaining:4});
  });
});
