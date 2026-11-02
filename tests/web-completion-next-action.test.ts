import { describe, expect, it } from 'vitest';
import { completionNextAction } from '../apps/web/src/services/completion-next-action';

const base={invalidated:false,hasSession:true,practiceCount:0,dueCount:0,dailyRemaining:0,dailyTarget:4};

describe('completion next-step choices',()=>{
  it('requires a new choice after an account switch instead of starting an old task',()=>{
    expect(completionNextAction({...base,invalidated:true,practiceCount:2,dueCount:5}).action).toBe('books');
  });
  it('prioritizes the current round weak words, then due review, then the same daily goal',()=>{
    expect(completionNextAction({...base,practiceCount:2,dueCount:5,dailyRemaining:8}).action).toBe('practice');
    expect(completionNextAction({...base,dueCount:5,dailyRemaining:8}).action).toBe('review');
    expect(completionNextAction({...base,dailyRemaining:8})).toMatchObject({action:'daily',label:'继续今日计划'});
  });
  it('provides a stopping point without implying a new lesson must be started',()=>{
    expect(completionNextAction(base)).toMatchObject({action:'finish',label:'今天先到这里'});
    expect(completionNextAction({...base,dailyTarget:0}).description).not.toContain('计划与到期复习已经完成');
  });
  it('provides a book choice when there was no study session',()=>{
    expect(completionNextAction({...base,hasSession:false})).toMatchObject({action:'books',label:'选择学习课次'});
  });
});
