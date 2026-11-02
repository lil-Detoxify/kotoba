import {describe,expect,it} from 'vitest';
import {emptyData} from '@jp/models';
import {evaluate,initialState} from '@jp/core';
import type {Data,Word} from '@jp/models';
import {createSentenceCloze,matchesClozeExample} from '../apps/web/src/services/sentence-cloze';
import {sessionSummary,weakPracticeSuggestions} from '../apps/web/src/services/study-feedback';

const now=new Date('2026-10-08T05:00:00Z');
function fixture():Data {
  const data=emptyData();
  data.lessons=[{id:'lesson',bookId:'book',title:'第一课',order:1},{id:'other',bookId:'other-book',title:'其他课',order:1}];
  data.words=['new','review','skip','outside'].map((id,index)=>({id,lessonId:index===3?'other':'lesson',term:id,reading:id,meaning:'测试',order:index}));
  return data;
}
function record(data:Data,word:Word,rating:1|2|3,count=0,id=word.id) {
  const previous={...initialState(word.id,now),reviewCount:count,firstSeenAt:count?'2026-10-01T05:00:00Z':undefined};
  const result=evaluate(previous,rating,count?'review':'new',now,id,300);
  data.logs.push(result.log);return result;
}
describe('Web example practice and feedback',()=>{
  it('uses the actual inflected phrase and accepts its reading for comparison',()=>{
    const question=createSentenceCloze({term:'会う',reading:'あう'})!;
    expect(question.answer).toBe('会います');
    expect(question.before+question.answer+question.after).toBe(question.ja);
    expect(matchesClozeExample(question,' あいます ')).toBe(true);
    expect(matchesClozeExample(question,'アイマス')).toBe(true);
    expect(matchesClozeExample(question,'会う')).toBe(false);
    expect(createSentenceCloze({term:'unknown',reading:'unknown'})).toBeNull();
  });
  it('uses a complete learner example and keeps different word readings distinct',()=>{
    const own=createSentenceCloze({term:'庭',reading:'にわ',example:'庭に花を植えました。',exampleReading:'にわにはなをうえました。',exampleTranslation:'在院子里种了花。'})!;
    expect(own.ja).toBe('庭に花を植えました。');
    expect(own.answer).toBe('庭');expect(own.reading).toBe('にわ');
    expect(createSentenceCloze({term:'庭',reading:'てい',example:'庭に花を植えました。',exampleReading:'にわにはなをうえました。',exampleTranslation:'在院子里种了花。'})).toBeNull();
    expect(createSentenceCloze({term:'開ける',reading:'アケル'})?.answer).toBe('開けました');
    expect(createSentenceCloze({term:'開ける',reading:'ひらける'})).toBeNull();
  });
  it('summarizes this session using its starting review counts and excludes skipped words',()=>{
    const data=fixture();
    record(data,data.words[0],2);
    record(data,data.words[1],3,4);
    record(data,data.words[2],1,1,'old-skip');
    const summary=sessionSummary(data,data.words,3,[0,4,2]);
    expect([summary.newCount,summary.reviewCount,summary.skippedCount]).toEqual([1,1,1]);
    expect(summary.practiceWords.map(word=>word.id)).toEqual(['new']);
    expect(summary.recap.map(word=>word.id)).toEqual(['new','review']);
  });
  it('scopes suggestions to real recent ratings and omits ignored or recovered words',()=>{
    const data=fixture();
    const first=record(data,data.words[0],1);data.logs.push({...first.log});
    const older=record(data,data.words[1],2);older.log.reviewedAt='2026-10-07T05:00:00Z';
    record(data,data.words[1],3,1,'recovered');
    const ignored=record(data,data.words[2],1);data.states.push({...ignored.state,isIgnored:true});
    record(data,data.words[3],1);
    expect(weakPracticeSuggestions(data,now,'local','book').map(({word,reason})=>[word.id,reason])).toEqual([['new','近 30 天有 1 次「忘记」']]);
  });
});
