import type {Data,Word} from '@jp/models';
import type {DictionaryWordDraft} from './dictionary-search';

export const DICTIONARY_BOOK_ID='personal-dictionary';
const lessonId=DICTIONARY_BOOK_ID+'-l-1';

function wordId(draft:DictionaryWordDraft){
  let hash=2166136261;
  for(const character of `${draft.term.normalize('NFKC').trim()}\0${draft.reading.normalize('NFKC').trim()}`){
    hash=Math.imul(hash^character.codePointAt(0)!,16777619)>>>0;
  }
  return `dictionary-${draft.entryId}-${hash.toString(16)}`;
}

/** An explicit collection action creates personal content, never learning progress. */
export function collectDictionaryWord(data:Data,draft:DictionaryWordDraft,stamp=new Date().toISOString()):{status:'saved'|'existing';wordId:string}{
  if(!draft.entryId||!draft.term.trim()||!draft.meaning.trim())throw new Error('词典词条暂不完整，请重试。');
  const id=wordId(draft);
  const existing=data.words.find(word=>word.id===id);
  if(existing)return {status:'existing',wordId:existing.id};
  let book=data.books.find(item=>item.id===DICTIONARY_BOOK_ID);
  if(!book){
    book={id:DICTIONARY_BOOK_ID,title:'我的查词词书',description:'在查词时收下的日语词汇。',language:'ja',createdAt:stamp,updatedAt:stamp};
    data.books.push(book);
  }
  if(!data.lessons.some(item=>item.id===lessonId))data.lessons.push({id:lessonId,bookId:book.id,title:'查词收藏',order:1});
  const order=data.words.filter(word=>word.lessonId===lessonId).reduce((max,word)=>Math.max(max,word.order),0)+1;
  const word:Word={id,lessonId,order,term:draft.term.trim(),reading:draft.reading.trim(),meaning:draft.meaning.trim(),
    partOfSpeech:draft.partOfSpeech,definitionJa:draft.definitionJa,senses:draft.senses?structuredClone(draft.senses):undefined,
    note:`词典来源：tomoshi-dict-data / JMdict · ${draft.entryId}`};
  data.words.push(word);book.updatedAt=stamp;
  return {status:'saved',wordId:id};
}
