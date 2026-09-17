import Papa from 'papaparse';
import type {Book,Lesson,Word,Data,WordSense} from '@jp/models';
export {installTextbooks,parseTextbookReading,textbookWordId} from './textbooks';
export type {TextbookDefinition,TextbookLesson,TextbookWord} from './textbooks';
export interface ImportRow {lesson:string;term:string;reading:string;meaning:string;partOfSpeech?:string;accent?:string;example?:string;exampleTranslation?:string;audioUrl?:string;note?:string;definitionJa?:string;definitionZh?:string;exampleReading?:string;senses?:WordSense[]}
const optional=['partOfSpeech','accent','example','exampleTranslation','audioUrl','note','definitionJa','definitionZh','exampleReading'] as const;
export function parseImport(text:string,format:'csv'|'json'):ImportRow[]{
 let raw:unknown;text=text.replace(/^\uFEFF/,'');
 if(format==='json'){try{const value:unknown=JSON.parse(text);raw=Array.isArray(value)?value:(value as {words?:unknown})?.words}catch{throw Error('JSON 格式错误，请检查括号和引号')}}else{const result=Papa.parse(text,{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim()});if(result.errors.length)throw Error(`CSV 格式错误：${result.errors[0].message}`);raw=result.data}
 if(!Array.isArray(raw)||!raw.length)throw Error('文件中没有单词');if(raw.length>10000)throw Error('每次最多导入 10000 个词');const seen=new Set<string>();
 return raw.map((value:unknown,i)=>{if(!value||typeof value!=='object')throw Error(`第 ${i+1} 行不是对象`);const r=value as Record<string,unknown>;const row={} as ImportRow;for(const key of ['lesson','term','reading','meaning'] as const){if(typeof r[key]!=='string'||!r[key].trim())throw Error(`第 ${i+1} 行缺少 ${key}`);row[key]=r[key].trim()}for(const key of optional){if(r[key]!=null&&typeof r[key]!=='string')throw Error(`第 ${i+1} 行 ${key} 必须是文本`);if(typeof r[key]==='string')row[key]=r[key].trim()}
 if(r.senses!==undefined){if(!Array.isArray(r.senses)||r.senses.length>30)throw Error(`第 ${i+1} 行 senses 必须是最多30项的数组`);row.senses=r.senses.map((sense:unknown)=>{if(!sense||typeof sense!=='object')throw Error(`第 ${i+1} 行义项格式错误`);const raw=sense as Record<string,unknown>;if(typeof raw.meaning!=='string'||!raw.meaning.trim())throw Error(`第 ${i+1} 行义项缺少 meaning`);const item:WordSense={meaning:raw.meaning.trim()};for(const k of ['definitionJa','partOfSpeech','example','exampleReading','exampleTranslation'] as const){if(raw[k]!==undefined&&typeof raw[k]!=='string')throw Error(`第 ${i+1} 行义项 ${k} 必须是文本`);if(typeof raw[k]==='string')item[k]=raw[k].trim()}return item})}
 if(row.audioUrl&&!/^https?:\/\//i.test(row.audioUrl))throw Error(`第 ${i+1} 行音频地址必须为 http(s)`);const key=JSON.stringify([row.lesson,row.term,row.reading]);if(seen.has(key))throw Error(`第 ${i+1} 行重复单词：${row.term}`);seen.add(key);return row});
}
export function importBook(data:Data,rows:ImportRow[],title:string,id:()=>string,now=new Date(),description=''){
 if(!title.trim())throw Error('请输入词书名称');const book:Book={id:id(),title:title.trim(),description,language:'ja',createdAt:now.toISOString(),updatedAt:now.toISOString()};const lessons:Lesson[]=[];const words:Word[]=[];
 for(const row of rows){let lesson=lessons.find(l=>l.title===row.lesson);if(!lesson){lesson={id:id(),bookId:book.id,title:row.lesson,order:lessons.length+1};lessons.push(lesson)}const {lesson:_,...fields}=row;words.push({...fields,id:id(),lessonId:lesson.id,order:words.length+1})}data.books.push(book);data.lessons.push(...lessons);data.words.push(...words);data.currentBookId=book.id;return book.id;
}
