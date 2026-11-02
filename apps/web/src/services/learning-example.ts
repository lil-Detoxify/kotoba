import type {Word} from '@jp/models';
import contexts from '../learning-contexts.json';
import examples from '../learning-examples.json';
import basic from '../learning-examples-basic.json';
import intermediate from '../learning-examples-intermediate.json';
import advanced from '../learning-examples-advanced.json';
import {bookLearningExamples} from './book-learning-examples';
import {refinementFor} from './learning-refinement';
import {correctedLearningContentFor} from './learning-content-corrections';

export interface LearningExample {
  ja:string;reading:string;zh:string;
  cloze?:{answer:string;reading:string};
  collocation?:{ja:string;reading:string;zh:string};
  tip?:string;
}
export function normalizeExampleAnswer(value:string):string {
  return value.normalize('NFKC').replace(/[ァ-ヶ]/g,character=>String.fromCharCode(character.charCodeAt(0)-0x60)).replace(/\s/gu,'');
}
const keyFor=(term:string,reading:string)=>term.normalize('NFKC').trim()+'|'+normalizeExampleAnswer(reading);
const samples=new Map<string,LearningExample>();
for(const [key,value] of Object.entries({...advanced,...intermediate,...basic,...examples,...contexts})){
  const [term,reading]=key.split('|');
  samples.set(keyFor(term,reading),value);
}
/** A shared source for display and practice; readings remain part of word identity. */
export function learningExampleFor(word:Pick<Word,'term'|'reading'>&Partial<Pick<Word,'meaning'>>):LearningExample|undefined {
  const key=keyFor(word.term,word.reading);
  return correctedLearningContentFor(word)?.example??refinementFor(word)?.example??samples.get(key)??bookLearningExamples.get(key);
}
