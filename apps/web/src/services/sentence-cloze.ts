import type {Word} from '@jp/models';
import {learningExampleFor,normalizeExampleAnswer,type LearningExample} from './learning-example';

export interface ClozeQuestion {before:string;after:string;answer:string;reading:string;ja:string;zh:string;sentenceReading:string}

type ExampleWord=Pick<Word,'term'|'reading'|'example'|'exampleReading'|'exampleTranslation'>;
export function createSentenceCloze(word:ExampleWord,override?:LearningExample):ClozeQuestion|null {
  // Learners can also practice their own complete examples when the word appears verbatim.
  if(!override&&word.example&&word.exampleReading&&word.exampleTranslation&&normalizeExampleAnswer(word.exampleReading).includes(normalizeExampleAnswer(word.reading))){
    const position=word.example.indexOf(word.term);
    if(position>=0)return {before:word.example.slice(0,position),after:word.example.slice(position+word.term.length),answer:word.term,reading:word.reading,ja:word.example,zh:word.exampleTranslation,sentenceReading:word.exampleReading};
  }
  const context=override??learningExampleFor(word);
  const answer=context?.cloze?.answer;
  if(!context||!answer)return null;
  const position=context.ja.indexOf(answer);
  if(position<0)return null;
  return {before:context.ja.slice(0,position),after:context.ja.slice(position+answer.length),answer,reading:context.cloze!.reading,ja:context.ja,zh:context.zh,sentenceReading:context.reading};
}
/** A comparison with the example, not a judgment that another expression is invalid. */
export function matchesClozeExample(question:ClozeQuestion,value:string):boolean {
  const answer=normalizeExampleAnswer(value);
  return !!answer&&(answer===normalizeExampleAnswer(question.answer)||answer===normalizeExampleAnswer(question.reading));
}
