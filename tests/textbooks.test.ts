import {describe,it,expect} from 'vitest';
import {emptyData} from '@jp/models';
import {installTextbooks,parseTextbookReading} from '@jp/importers';
import {selectRange} from '@jp/core';
import payload from '../apps/web/src/textbooks.json';

describe('标日内置词书',()=>{
  it('解析词形注记并保留纯假名记录',()=>{
    expect(parseTextbookReading('がくせい(学生)')).toEqual({reading:'がくせい',term:'学生'});
    expect(parseTextbookReading('こんにちは')).toEqual({reading:'こんにちは',term:'こんにちは'});
  });
  it('包含六册和核查后的课次词数',()=>{
    expect(payload.books.map(b=>b.wordCount)).toEqual([1077,1073,1748,1907,1806,1506]);
    expect(payload.books.every(b=>b.lessons.length>0)).toBe(true);
  });
  it('按教材真实课次序号选择范围，不按 lessons.length 截断',()=>{
    const cases=[[1,25,48,24],[3,17,32,16],[5,13,24,12]] as const;
    for(const [index,from,to,count] of cases){
      const lessons=payload.books[index].lessons.map(l=>({id:`${payload.books[index].id}-l-${l.order}`,bookId:payload.books[index].id,title:l.title,order:l.order}));
      expect(selectRange(lessons,from,to)).toHaveLength(count);
      expect(selectRange(lessons,from,to)[0]).toContain(`-l-${from}`);
      expect(selectRange(lessons,from,to).at(-1)).toContain(`-l-${to}`);
    }
  });
  it('所有内置假名都不残留汉字注记',()=>{
    const readings=payload.books.flatMap(b=>b.lessons.flatMap(l=>l.words.map(w=>w.reading)));
    expect(readings.filter(reading=>/[\\u3400-\\u9fff]/u.test(reading)||/[（(].*[）)]/.test(reading))).toHaveLength(0);
  });
  it('安装使用稳定 ID，重复迁移不会覆盖进度或当前词书',()=>{
    const data=emptyData();let n=0;installTextbooks(data,payload.books,()=>`random-${n++}`);data.currentBookId='custom';data.states.push({userId:'local',wordId:data.words[0].id,status:'learning',isIgnored:false,isDifficult:false,reviewCount:1,lapseCount:0,card:{} as never});
    const before=data.words.map(w=>w.id);installTextbooks(data,payload.books,()=>`random-${n++}`);
    expect(data.words.map(w=>w.id)).toEqual(before);expect(data.currentBookId).toBe('custom');expect(data.books).toHaveLength(6);
  });
  it('完成迁移后手动删除的内置词书不会被 marker 逻辑复活',()=>{
    const data=emptyData();installTextbooks(data,payload.books,()=>crypto.randomUUID());data.textbooksVersion='biaori-v1';
    const removed=payload.books[5].id;data.books=data.books.filter(b=>b.id!==removed);data.lessons=data.lessons.filter(l=>l.bookId!==removed);data.words=data.words.filter(w=>data.lessons.some(l=>l.id===w.lessonId));
    if(data.textbooksVersion!=='biaori-v1')installTextbooks(data,payload.books,()=>crypto.randomUUID());
    expect(data.books.some(b=>b.id===removed)).toBe(false);
  });
});
