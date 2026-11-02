import {describe,expect,it} from 'vitest';
import {emptyData} from '@jp/models';
import {initialState} from '@jp/core';
import type {Data,Lesson} from '@jp/models';
import {nextUnlearnedLesson} from '../apps/web/src/services/next-unlearned-lesson';

function fixture():Data {
  const data=emptyData();
  data.lessons=[
    {id:'a-2',bookId:'a',title:'第二课',order:2},
    {id:'b-1',bookId:'b',title:'他书第一课',order:1},
    {id:'a-1',bookId:'a',title:'第一课',order:1},
    {id:'a-3',bookId:'a',title:'第三课',order:3},
  ];
  data.words=[
    {id:'a2-word',lessonId:'a-2',term:'二',reading:'に',meaning:'two',order:0},
    {id:'b-word',lessonId:'b-1',term:'乙',reading:'おつ',meaning:'other',order:0},
    {id:'a1-word',lessonId:'a-1',term:'一',reading:'いち',meaning:'one',order:0},
    {id:'a3-word',lessonId:'a-3',term:'三',reading:'さん',meaning:'three',order:0},
  ];
  return data;
}
function learned(data:Data,wordId:string,userId='local',reviewCount=1,firstSeenAt?:string) {
  data.states.push({...initialState(wordId,new Date('2026-10-01T00:00:00Z'),userId),reviewCount,firstSeenAt});
}

describe('next unlearned lesson',()=>{
  it('chooses the earliest populated lesson by lesson order within the requested book',()=>{
    const data=fixture();
    data.words=data.words.filter(word=>word.lessonId!=='a-1'); // empty first lesson is skipped
    data.words.find(word=>word.id==='b-word')!.lessonId='b-1';
    expect(nextUnlearnedLesson(data,'a')).toMatchObject({id:'a-2',order:2});
    expect(nextUnlearnedLesson(data,'b')).toMatchObject({id:'b-1',bookId:'b'});
  });

  it('keeps a partially unlearned lesson, then advances past fully learned or ignored lessons',()=>{
    const data=fixture();
    learned(data,'a1-word');
    data.states.push({...initialState('ignored-a1'),isIgnored:true});
    data.words.push({id:'ignored-a1',lessonId:'a-1',term:'略',reading:'りゃく',meaning:'ignored',order:1});
    data.words.push({id:'a1-pending',lessonId:'a-1',term:'残',reading:'のこ',meaning:'remaining',order:2});
    expect(nextUnlearnedLesson(data,'a')?.id).toBe('a-1');

    learned(data,'a1-pending');
    expect(nextUnlearnedLesson(data,'a')?.id).toBe('a-2');
    learned(data,'a2-word');
    expect(nextUnlearnedLesson(data,'a')?.id).toBe('a-3');

    data.states.push({...initialState('a3-word'),isIgnored:true});
    data.states.push({...initialState('a2-ignored'),isIgnored:true});
    data.words.push({id:'a2-ignored',lessonId:'a-2',term:'略',reading:'りゃく',meaning:'ignored',order:1});
    expect(nextUnlearnedLesson(data,'a')?.id).toBeUndefined();
  });

  it('uses firstSeenAt or reviewCount for owner and local states, and ignores foreign-user progress',()=>{
    const data=fixture();
    learned(data,'a1-word','owner',0,'2026-10-01T00:00:00Z');
    learned(data,'a2-word','local',1);
    learned(data,'a3-word','someone-else',9,'2026-09-01T00:00:00Z');
    expect(nextUnlearnedLesson(data,'a','owner')?.id).toBe('a-3');

    const foreignOnly=fixture();
    foreignOnly.words=foreignOnly.words.filter(word=>word.lessonId==='a-1');
    learned(foreignOnly,'a1-word','someone-else',9,'2026-09-01T00:00:00Z');
    expect(nextUnlearnedLesson(foreignOnly,'a','owner')?.id).toBe('a-1');
  });

  it('returns undefined when no lesson has eligible words and leaves input data unchanged',()=>{
    const data=fixture();
    data.words=data.words.filter(word=>word.lessonId==='a-1');
    data.states.push({...initialState('a1-word'),isIgnored:true});
    const before=JSON.stringify(data);

    const result:Lesson|undefined=nextUnlearnedLesson(data,'a');
    expect(result).toBeUndefined();
    expect(JSON.stringify(data)).toBe(before);
  });
});
