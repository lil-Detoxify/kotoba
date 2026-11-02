import type {Word} from '@jp/models';
import {normalizeVocabularySearchText} from '@jp/shared';
import type {LearningExample} from './learning-example';
import type {LearningUsage} from './learning-usage';
import n5 from '../learning-refinements-n5.json';
import n4 from '../learning-refinements-n4.json';
import common from '../learning-refinements-common.json';

export interface LearningRefinement {
  id:string;
  level:string;
  forms:Array<{term:string;reading:string}>;
  meaningKeywords:string[];
  example:LearningExample;
  usage:LearningUsage;
}
export const learningRefinements:readonly LearningRefinement[]=[...n5,...n4,...common];
const identity=(term:string,reading:string)=>JSON.stringify([term.normalize('NFKC').trim(),normalizeVocabularySearchText(reading)]);
const byForm=new Map<string,LearningRefinement[]>();
for(const entry of learningRefinements){
  for(const form of entry.forms){
    const key=identity(form.term,form.reading);
    byForm.set(key,[...(byForm.get(key)??[]),entry]);
  }
}

/** Refined examples and usage travel together, only when the source word includes the taught sense. */
export function refinementFor(word:Pick<Word,'term'|'reading'>&Partial<Pick<Word,'meaning'>>):LearningRefinement|undefined{
  if(!word.meaning)return undefined;
  const meaning=normalizeVocabularySearchText(word.meaning);
  return byForm.get(identity(word.term,word.reading))?.find(entry=>entry.meaningKeywords.some(keyword=>meaning.includes(normalizeVocabularySearchText(keyword))));
}
