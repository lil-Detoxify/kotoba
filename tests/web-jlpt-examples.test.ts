import {describe,expect,it} from 'vitest';
import textbooks from '../data/wordbooks/jlpt-textbooks.json';
import {loadBookLearningExamples} from '../apps/web/src/services/book-learning-examples';
import {createSentenceCloze,matchesClozeExample} from '../apps/web/src/services/sentence-cloze';

describe('JLPT learning examples cover every word in each level',()=>{
  for(const book of textbooks.books){
    it(`${book.id}: words have a reconstructable sentence and kana answer`,async()=>{
      expect(await loadBookLearningExamples(book.id)).toBe(true);
      const missing:string[]=[];
      for(const lesson of book.lessons)for(const row of lesson.words){
        const question=createSentenceCloze(row);
        if(!question){missing.push(`${row.term}|${row.reading}`);continue}
        expect(question.before+question.answer+question.after).toBe(question.ja);
        expect(question.sentenceReading.trim()).not.toBe('');
        expect(question.zh.trim()).not.toBe('');
        expect(matchesClozeExample(question,question.reading)).toBe(true);
      }
      expect(missing).toEqual([]);
    });
  }
});
