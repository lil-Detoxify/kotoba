import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {learningRefinements,refinementFor} from '../apps/web/src/services/learning-refinement';
import {learningExampleFor,normalizeExampleAnswer} from '../apps/web/src/services/learning-example';
import {usageFor} from '../apps/web/src/services/learning-usage';

describe('source-aligned learning refinements',()=>{
  it('connects every revised example and note to a real source word with the taught sense',()=>{
    expect(learningRefinements).toHaveLength(100);
    for(const level of ['N5','N4']){
      const records=learningRefinements.filter(record=>record.level===level&&!record.id.startsWith('refine-common-'));
      expect(records).toHaveLength(20);
      const book=JSON.parse(readFileSync(new URL(`../apps/web/public/data/books/jlpt-${level.toLowerCase()}.json`,import.meta.url),'utf8'));
      const words=book.lessons.flatMap((lesson:any)=>lesson.words);
      for(const record of records){
        const source=words.find((word:any)=>record.forms.some(form=>word.term===form.term&&word.reading===form.reading));
        expect(source,record.id).toBeDefined();
        expect(refinementFor(source),record.id).toBe(record);
        expect(learningExampleFor(source)).toBe(record.example);
        expect(usageFor(source)).toBe(record.usage);
      }
    }
  });
  it('connects sixty common N5–N3 words to examples, collocations and optional expanded contrasts',()=>{
    const records=learningRefinements.filter(record=>record.id.startsWith('refine-common-'));
    expect(records).toHaveLength(60);
    for(const level of ['N5','N4','N3']){
      const group=records.filter(record=>record.level===level);
      expect(group).toHaveLength(20);
      const book=JSON.parse(readFileSync(new URL(`../apps/web/public/data/books/jlpt-${level.toLowerCase()}.json`,import.meta.url),'utf8'));
      const words=book.lessons.flatMap((lesson:any)=>lesson.words);
      for(const record of group){
        const source=words.find((word:any)=>record.forms.some(form=>word.term===form.term&&word.reading===form.reading));
        expect(source,record.id).toBeDefined();
        expect(refinementFor(source),record.id).toBe(record);
        expect(learningExampleFor(source)).toBe(record.example);
        expect(usageFor(source)).toBe(record.usage);
      }
    }
    expect(refinementFor({term:'丈夫',reading:'じょうふ',meaning:'英雄，男子汉'})).toBeUndefined();
    expect(refinementFor({term:'高い',reading:'たかい',meaning:'位置很高'})).toBeUndefined();
    expect(refinementFor({term:'易しい',reading:'やさしい',meaning:'性情温柔'})).toBeUndefined();
  });
  it('does not apply a different sense or homograph just because its written form matches',()=>{
    expect(refinementFor({term:'上げる',reading:'あげる',meaning:'提高，抬高'})).toBeUndefined();
    expect(refinementFor({term:'かける',reading:'かける',meaning:'悬挂'})).toBeUndefined();
    expect(refinementFor({term:'切る',reading:'きる',meaning:'穿衣服'})).toBeUndefined();
    expect(refinementFor({term:'上げる',reading:'あげる',meaning:'给予'})).toBeDefined();
    expect(refinementFor({term:'上げる',reading:'あげる'})).toBeUndefined();
  });
  it('keeps a single usable blank, its actual reading and short matching usage in each new example',()=>{
    for(const record of learningRefinements){
      const {example,usage}=record;
      expect(example.ja.split(example.cloze!.answer)).toHaveLength(2);
      expect(normalizeExampleAnswer(example.reading)).toContain(normalizeExampleAnswer(example.cloze!.reading));
      expect(example.zh&&usage.collocation.ja&&usage.collocation.reading&&usage.collocation.zh&&usage.tip,record.id).toBeTruthy();
      expect(JSON.stringify(record)).not.toContain('；');
    }
  });
});
