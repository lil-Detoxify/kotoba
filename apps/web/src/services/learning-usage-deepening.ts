import {shallowReactive} from 'vue';
import type {Word} from '@jp/models';
import {normalizeVocabularySearchText} from '@jp/shared';
import type {LearningUsageRecord} from './learning-usage';

export interface DeepeningUsageRecord extends LearningUsageRecord {
  meaningKeywords:string[];
  sourceMeanings?:string[];
}
type UsageWord=Pick<Word,'term'|'reading'>&Partial<Pick<Word,'meaning'|'lessonId'>>;
const keyFor=(term:string,reading:string)=>JSON.stringify([term.normalize('NFKC').trim(),normalizeVocabularySearchText(reading)]);
const entries=shallowReactive(new Map<string,Array<{bookId:string;record:DeepeningUsageRecord}>>());
const loaders=import.meta.glob<DeepeningUsageRecord[]>('../learning-usage-books/*.json',{import:'default'});
const bookIds=Object.keys(loaders).map(path=>path.slice('../learning-usage-books/'.length,-'.json'.length));
const pending=new Map<string,Promise<boolean>>();
const bookForLesson=(lessonId:string)=>bookIds.find(id=>lessonId===id||lessonId.startsWith(id+'-'));

/** Shared lexical notes are compiled into each book too; only that book's data is requested. */
export function loadBookUsageDeepening(bookId:string):Promise<boolean> {
  const loader=loaders[`../learning-usage-books/${bookId}.json`];
  if(!loader)return Promise.resolve(true);
  const existing=pending.get(bookId);
  if(existing)return existing;
  const request=loader().then(records=>{
    for(const record of records)for(const form of record.forms){
      const key=keyFor(form.term,form.reading);
      entries.set(key,[...(entries.get(key)??[]),{bookId,record}]);
    }
    return true;
  }).catch(()=>{
    pending.delete(bookId);
    return false;
  });
  pending.set(bookId,request);
  return request;
}

export function loadWordUsageDeepening(word:UsageWord):Promise<boolean> {
  const bookId=bookForLesson(word.lessonId??'');
  return bookId?loadBookUsageDeepening(bookId):Promise.resolve(true);
}

/** Match the reading and taught sense, with a stable priority when books share a word. */
export function deepeningUsageFor(word:UsageWord):DeepeningUsageRecord|undefined {
  if(!word.meaning)return undefined;
  const meaning=normalizeVocabularySearchText(word.meaning);
  const preferred=bookForLesson(word.lessonId??'');
  let best:{record:DeepeningUsageRecord;score:number}|undefined;
  for(const {bookId,record} of entries.get(keyFor(word.term,word.reading))??[]){
    if(!record.sourceMeanings?.some(source=>normalizeVocabularySearchText(source)===meaning))continue;
    const keywords=record.meaningKeywords.map(normalizeVocabularySearchText).filter(keyword=>keyword&&meaning.includes(keyword));
    if(!keywords.length)continue;
    const score=Math.max(...keywords.map(keyword=>keyword.length))+(bookId===preferred?10000:0);
    if(!best||score>best.score||(score===best.score&&record.id<best.record.id))best={record,score};
  }
  return best?.record;
}

export async function loadAllUsageDeepening():Promise<boolean> {
  const results=await Promise.all(bookIds.map(loadBookUsageDeepening));
  return results.every(Boolean);
}
