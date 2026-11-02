import {describe,expect,it} from 'vitest';
import textbooks from '../apps/web/src/textbooks.json';
import {loadBookLearningExamples} from '../apps/web/src/services/book-learning-examples';
import {createSentenceCloze,matchesClozeExample} from '../apps/web/src/services/sentence-cloze';
import {correctLoadedTextbookWords} from '../apps/web/src/services/textbook-corrections';
import {webTextbookWordId} from '../apps/web/src/services/textbook-catalog';

describe('six Biaori books provide usable sentence cloze questions',()=>{
  for(const book of textbooks.books){
    it(`${book.id}: every word position can generate and compare its sentence`,async()=>{
      expect(await loadBookLearningExamples(book.id)).toBe(true);
      const missing:string[]=[];
      for(const lesson of book.lessons)for(const [index,row] of lesson.words.entries()){
        const word={...row,id:webTextbookWordId(book.id,lesson.order,row,index),lessonId:`${book.id}-l-${lesson.order}`,order:index};
        correctLoadedTextbookWords([word]);
        const question=createSentenceCloze(word);
        if(!question){missing.push(`${lesson.order}: ${word.term}|${word.reading}`);continue;}
        expect(question.before+question.answer+question.after).toBe(question.ja);
        expect(matchesClozeExample(question,question.reading)).toBe(true);
        expect(question.sentenceReading.trim()).not.toBe('');
        expect(question.zh.trim()).not.toBe('');
      }
      expect(missing).toEqual([]);
    });
  }
});
