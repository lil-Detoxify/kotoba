import {describe,it,expect} from 'vitest';import {createQuestion,quizAttempt,quizRating,toHiragana} from '@jp/core';import type {Word} from '@jp/models';import {parseImport} from '@jp/importers';import {dictionaryBucket,matchEntries,type DictionaryEntry} from '@jp/dictionary';import {readFileSync} from 'node:fs';
const word=(id:string,term:string,reading:string,meaning:string):Word=>({id,term,reading,meaning,lessonId:'lesson',order:1});
const pool=[word('1','本','ほん','书'),word('2','机','つくえ','桌子'),word('3','椅子','いす','椅子'),word('4','傘','かさ','伞'),word('5','花','はな','花')];
describe('多题型复习',()=>{
 it.each(['kana-meaning','kanji-reading','audio-meaning'] as const)('%s 不泄露另一侧提示、正确答案唯一',type=>{const q=createQuestion(pool[0],pool,type)!;expect(q.options).toHaveLength(4);expect(new Set(q.options).size).toBe(4);expect(q.options.filter(o=>o===q.correct)).toHaveLength(1);expect(q.prompt).toBe(type==='kana-meaning'?'ほん':type==='kanji-reading'?'本':'')});
 it('同音异义和交叠释义不作为干扰项',()=>{const target=word('x','橋','はし','桥');const extras=[word('y','箸','はし','筷子'),word('z','架橋','かきょう','桥；架桥')];const q=createQuestion(target,[target,...extras,...pool],'audio-meaning')!;expect(q.options).not.toContain('筷子');expect(q.options).not.toContain('桥；架桥')});
 it('相同汉字的其他读音不作为错误选项',()=>{const words=[word('1','今日','きょう','今天'),word('2','今日','こんにち','当今'),...pool];expect(createQuestion(words[0],words,'kanji-reading')?.options).not.toContain('こんにち')});
 it('不足干扰项和无汉字时明确不可出题',()=>{expect(createQuestion(pool[0],[pool[0]],'kana-meaning')).toBeNull();expect(createQuestion(word('a','ありがとう','ありがとう','谢谢'),pool,'kanji-reading')).toBeNull()});
 it('片假名统一为平假名',()=>{expect(toHiragana('カメラ')).toBe('かめら');expect(toHiragana('ｶﾒﾗ')).toBe('かめら')});
 it('客观评分区分错、对和猜对，不允许伪造选项',()=>{const q=createQuestion(pool[0],pool,'kana-meaning')!;expect(quizRating(quizAttempt(q,q.correct))).toBe(3);expect(quizRating(quizAttempt(q,q.correct),true)).toBe(2);expect(quizRating(quizAttempt(q,null))).toBe(1);expect(quizRating(quizAttempt(q,q.options.find(x=>x!==q.correct)!),true)).toBe(1);expect(()=>quizAttempt(q,'外部答案')).toThrow()});
});
describe('详细释义导入与实词典',()=>{
 it('保留 JSON 多义项、日文和例句假名',()=>{const rows=parseImport(readFileSync('examples/detailed.json','utf8'),'json');expect(rows[1].senses).toHaveLength(2);expect(rows[1].senses?.[0].exampleReading).toContain('ふなびん')});
 it('拒绝非法义项结构，不静默丢弃',()=>{for(const senses of [{},[{}],[{meaning:'x',example:5}]])expect(()=>parseImport(JSON.stringify([{lesson:'a',term:'本',reading:'ほん',meaning:'书',senses}]),'json')).toThrow()});
 it.each([['船便','ふなびん'],['中国人','ちゅうごくじん'],['本','ほん']])('真实词典有 %s 的日中释义', (term,reading)=>{const shard=JSON.parse(readFileSync(`apps/web/public/dictionary/${dictionaryBucket(term)}.json`,'utf8')) as Record<string,DictionaryEntry[]>;const entries=matchEntries(shard[term],term,reading);expect(entries.length).toBeGreaterThan(0);expect(entries.some(e=>e.senses.some(s=>s.zh.length))).toBe(true);expect(entries.some(e=>e.japanese.length)).toBe(true);expect(matchEntries(shard[term],term,'ちがう')).toHaveLength(0)});
});
