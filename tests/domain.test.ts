import {describe,it,expect} from 'vitest';
import {emptyData} from '@jp/models';import {parseImport,importBook} from '@jp/importers';import {createStudyQueue,selectRange,initialState,evaluate,getDueWords,statistics,progress} from '@jp/core';import {deleteBook,IndexedDbRepository} from '@jp/storage';import 'fake-indexeddb/auto';
import seed from '../apps/web/src/seed.json';
function fixture(){const d=emptyData();let id=0;importBook(d,seed,'Test',()=>String(++id));return d}
const now=new Date('2026-09-15T10:00:00Z');
describe('课程和学习队列',()=>{
 it('任意选择第 2 和 4 课，保持课程与词序',()=>{const d=fixture();const ids=[d.lessons[1].id,d.lessons[3].id];const q=createStudyQueue(d,'new',ids);expect(q).toHaveLength(24);expect(new Set(q.map(w=>w.lessonId))).toEqual(new Set(ids));expect(q[0].term).toBe('本')});
 it('连续范围支持反向输入',()=>{const d=fixture();expect(selectRange(d.lessons,4,2)).toEqual(d.lessons.slice(1).map(l=>l.id))});
 it('忽略排除所有模式，生词标记不代表学习过',()=>{const d=fixture();const s=initialState(d.words[0].id,now);s.isDifficult=true;d.states.push(s);expect(createStudyQueue(d,'difficult')).toHaveLength(1);expect(createStudyQueue(d,'new')).toHaveLength(48);s.isIgnored=true;s.nextReviewAt=now.toISOString();for(const mode of ['new','review','difficult'] as const)expect(createStudyQueue(d,mode,undefined,now).some(w=>w.id===s.wordId)).toBe(false);s.isIgnored=false;expect(createStudyQueue(d,'difficult')).toHaveLength(1)});
 it('已学习的词不会再进入新词队列',()=>{const d=fixture();d.states.push(evaluate(initialState(d.words[0].id,now),3,'new',now,'log').state);expect(createStudyQueue(d,'new')).toHaveLength(47)});
});
describe('FSRS 与统计',()=>{
 it.each([1,2,3] as const)('评价 %s 保存 FSRS 与前后快照',rating=>{const before=initialState('w',now);const {state,log}=evaluate(before,rating,'new',now,'log',1200);expect(state.card.reps).toBe(1);expect(state.reviewCount).toBe(1);expect(new Date(state.nextReviewAt!).getTime()).toBeGreaterThan(now.getTime());expect(log.previousState.reviewCount).toBe(0);expect(before.reviewCount).toBe(0);expect(log.responseTime).toBe(1200);state.isDifficult=true;expect(log.newState.isDifficult).toBe(false)});
 it('到期边界精确到毫秒',()=>{const d=fixture();const s=evaluate(initialState(d.words[0].id,now),1,'new',now,'log').state;d.states.push(s);const due=new Date(s.nextReviewAt!);expect(getDueWords(d,new Date(+due-1))).toHaveLength(0);expect(getDueWords(d,due)).toHaveLength(1)});
 it('统计区分新词和复习，累计词数去重',()=>{const d=fixture();const one=evaluate(initialState(d.words[0].id,now),1,'new',now,'1');const two=evaluate(one.state,3,'review',new Date(+now+60000),'2');d.states.push(two.state);d.logs.push(one.log,two.log);const s=statistics(d,new Date(+now+60000));expect(s.newToday).toBe(1);expect(s.reviewToday).toBe(1);expect(s.learned).toBe(1);expect(s.totalReviews).toBe(2);expect(s.streak).toBe(1);expect(s.days.at(-1)?.count).toBe(2);expect(Object.values(s.counts).reduce((a,b)=>a+b,0)).toBe(48)});
 it('忽略不算进有效进度分母',()=>{const d=fixture();const s=initialState(d.words[0].id);s.isIgnored=true;d.states.push(s);expect(progress(d,d.words).total).toBe(47)});
 it('昨天有学习可延续连续天数，跨月仍正确',()=>{const d=fixture();for(const date of [new Date(2026,7,31,12),new Date(2026,8,1,12)])d.logs.push(evaluate(initialState('x',date),3,'new',date,String(date)).log);expect(statistics(d,new Date(2026,8,2,12)).streak).toBe(2);expect(statistics(d,new Date(2026,8,3,12)).streak).toBe(0)});
});
describe('导入校验',()=>{
 it('CSV 支持 BOM、引号、逗号和换行',()=>{const rows=parseImport('\uFEFFlesson,term,reading,meaning,partOfSpeech\r\n第1课,本,ほん,"书,书籍\nbook",名词','csv');expect(rows[0].meaning).toBe('书,书籍\nbook')});
 it('JSON 支持数组和 words 包装',()=>{expect(parseImport(JSON.stringify(seed),'json')).toHaveLength(48);expect(parseImport(JSON.stringify({words:seed}),'json')).toHaveLength(48)});
 it.each(['null','{}','[]','{','[{"lesson":"a"}]'])('拒绝无效 JSON %s',value=>expect(()=>parseImport(value,'json')).toThrow());
 it('拒绝重复项和非安全音频协议',()=>{expect(()=>parseImport(JSON.stringify([seed[0],seed[0]]),'json')).toThrow('重复');expect(()=>parseImport(JSON.stringify([{...seed[0],audioUrl:'javascript:alert(1)'}]),'json')).toThrow('http(s)')});
 it('导入前不改变数据库，导入后保留课次结构',()=>{const d=emptyData();const rows=parseImport(JSON.stringify(seed),'json');expect(d.books).toHaveLength(0);let n=0;importBook(d,rows,'演示',()=>String(n++));expect(d.lessons).toHaveLength(4);expect(d.words).toHaveLength(48)});
});
describe('持久化事务',()=>{
 it('刷新 Repository 后保留 Date、状态和日志',async()=>{const name='test-'+Math.random();const r=new IndexedDbRepository(name);await r.transact(d=>Object.assign(d,fixture()));await r.transact(d=>{const result=evaluate(initialState(d.words[0].id,now),3,'new',now,'1');d.states.push(result.state);d.logs.push(result.log)});const read=await new IndexedDbRepository(name).read();expect(read.logs).toHaveLength(1);expect(read.states[0].card.due).toBeInstanceOf(Date)});
 it('事务失败回滚，不保存部分状态',async()=>{const r=new IndexedDbRepository('rollback-'+Math.random());await expect(r.transact(d=>{d.seeded=true;throw Error('fail')})).rejects.toThrow();expect((await r.read()).seeded).toBe(false)});
 it('并发事务不会互相覆盖',async()=>{const r=new IndexedDbRepository('parallel-'+Math.random());await Promise.all([r.transact(d=>{d.books.push({...fixture().books[0],id:'a'})}),r.transact(d=>{d.books.push({...fixture().books[0],id:'b'})})]);expect((await r.read()).books).toHaveLength(2)});
 it('删除词书级联删除数据',()=>{const d=fixture();const result=evaluate(initialState(d.words[0].id,now),1,'new',now,'1');d.states.push(result.state);d.logs.push(result.log);deleteBook(d,d.books[0].id);expect(d.words).toHaveLength(0);expect(d.logs).toHaveLength(0);expect(d.states).toHaveLength(0)});
});
