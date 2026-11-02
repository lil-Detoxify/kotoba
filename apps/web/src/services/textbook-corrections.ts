import type {Word} from '@jp/models';
import catalog from '../textbook-corrections.json';

const corrections=new Map(catalog.entries.map(entry=>[entry.wordId,entry]));

/** Correct known system-word metadata at read time; IDs and learning history are unchanged. */
export function correctLoadedTextbookWords(words:Word[]):void{
  for(const word of words){
    const entry=corrections.get(word.id);
    if(!entry||word.lessonId!==`${entry.bookId}-l-${entry.lessonOrder}`)continue;
    Object.assign(word,entry.corrected);
    if(entry.previous.term!==entry.corrected.term){
      word.rawTerm=entry.corrected.term;
      if(word.audioTerm)word.audioTerm=entry.corrected.term;
    }
  }
}
