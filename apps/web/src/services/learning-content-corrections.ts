import type {Word} from '@jp/models';
import {normalizeVocabularySearchText} from '@jp/shared';
import type {LearningExample} from './learning-example';
import type {LearningUsage} from './learning-usage';
import payload from '../learning-content-corrections.json';
export interface LearningContentCorrection {
  id:string;forms:Array<{term:string;reading:string}>;meaningKeywords:string[];sourceMeanings:string[];example:LearningExample;usage:LearningUsage;
}
export const learningContentCorrections:readonly LearningContentCorrection[]=payload;
const identity=(term:string,reading:string)=>JSON.stringify([term.normalize('NFKC').trim(),normalizeVocabularySearchText(reading)]);
const byForm=new Map<string,LearningContentCorrection[]>();
for(const record of learningContentCorrections)for(const form of record.forms){const key=identity(form.term,form.reading);byForm.set(key,[...(byForm.get(key)??[]),record]);}
export function correctedLearningContentFor(word:Pick<Word,'term'|'reading'>&Partial<Pick<Word,'meaning'>>):LearningContentCorrection|undefined {
  if(!word.meaning)return undefined;
  const meaning=normalizeVocabularySearchText(word.meaning);
  return byForm.get(identity(word.term,word.reading))?.find(record=>record.sourceMeanings.some(source=>normalizeVocabularySearchText(source)===meaning)&&record.meaningKeywords.some(keyword=>meaning.includes(normalizeVocabularySearchText(keyword))));
}
