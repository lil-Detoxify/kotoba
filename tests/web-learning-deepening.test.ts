import {readFileSync,writeFileSync} from 'node:fs';
import {describe,it,expect,beforeAll} from 'vitest';
import {normalizeVocabularySearchText} from '@jp/shared';
import {usageFor,learningUsageCatalog} from '../apps/web/src/services/learning-usage';
import {learningRefinements,refinementFor} from '../apps/web/src/services/learning-refinement';
import {loadAllUsageDeepening,deepeningUsageFor,type DeepeningUsageRecord} from '../apps/web/src/services/learning-usage-deepening';
import {sentenceUsageFor} from '../apps/web/src/services/sentence-usage';
import {learningExampleFor,normalizeExampleAnswer} from '../apps/web/src/services/learning-example';
import {learningContentCorrections,correctedLearningContentFor} from '../apps/web/src/services/learning-content-corrections';

const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const key=(form:{term:string;reading:string})=>form.term.normalize('NFKC').trim()+'|'+normalizeVocabularySearchText(form.reading);
const exampleKey=(form:{term:string;reading:string})=>form.term.normalize('NFKC').trim()+'|'+normalizeExampleAnswer(form.reading);
interface SourceWord {term:string;reading:string;meaning:string;partOfSpeech?:string;bookId:string;lessonId:string;lessonIndex:number;wordIndex:number}
const books=read('../apps/web/public/data/books/index.json').books.map((metadata:{id:string})=>({
  id:metadata.id,payload:read(`../apps/web/public/data/books/${metadata.id}.json`),
  examples:read(`../apps/web/public/data/examples/v1/${metadata.id}.json`),
}));
const words:SourceWord[]=books.flatMap((book:any)=>book.payload.lessons.flatMap((lesson:any,lessonIndex:number)=>lesson.words.map((word:any,wordIndex:number)=>({
  ...word,bookId:book.id,lessonId:`${book.id}-l-${lessonIndex+1}`,lessonIndex,wordIndex,
}))));
const records:DeepeningUsageRecord[]=['lower','advanced','biaori','core'].flatMap(group=>read(`../apps/web/src/learning-usage-deepening-${group}.json`));
const manifest=read('../apps/web/public/data/usage/v1/manifest.json');

beforeAll(async()=>{expect(await loadAllUsageDeepening()).toBe(true)});

describe('source-bound full-catalog usage deepening',()=>{
  it('connects every new record to a real form and source sense and keeps readings usable',()=>{
    const sources=new Map<string,typeof words>();
    for(const word of words)sources.set(key(word),[...(sources.get(key(word))??[]),word]);
    const ids=new Set<string>();
    for(const record of records){
      expect(ids.has(record.id),record.id).toBe(false);ids.add(record.id);
      const matched=record.forms.flatMap(form=>{
        expect(sources.has(key(form)),record.id+' '+form.term).toBe(true);
        return sources.get(key(form))??[];
      }).filter(word=>record.meaningKeywords.some(keyword=>keyword&&normalizeVocabularySearchText(word.meaning).includes(normalizeVocabularySearchText(keyword))));
      expect(matched.length,record.id+' sense').toBeGreaterThan(0);
      expect(matched.some(word=>usageFor(word)),record.id+' has a visible source-bound note').toBe(true);
      expect(deepeningUsageFor({...matched[0],meaning:'不属于任何目标义项的测试内容'}),record.id+' unrelated sense').toBeUndefined();
      for(const phrase of [record.collocation,record.contrast?.collocation].filter(Boolean)){
        expect(phrase!.ja&&phrase!.reading&&phrase!.zh,record.id).toBeTruthy();
        expect(phrase!.reading,record.id).not.toMatch(/\p{Script=Han}/u);
      }
      expect(record.tip,record.id).toBeTruthy();
      expect(JSON.stringify(record),record.id).not.toContain('；');
    }
  });

  it('resolves the compiled book entries rather than counting unused authoring candidates as delivered',()=>{
    const active=new Set<string>();
    for(const book of books){
      const compiled:DeepeningUsageRecord[]=read(`../apps/web/src/learning-usage-books/${book.id}.json`);
      for(const record of compiled){
        active.add(record.id);
        const matched=words.filter(word=>word.bookId===book.id&&record.forms.some(form=>key(form)===key(word))&&record.sourceMeanings?.includes(word.meaning));
        expect(matched.length,record.id+' compiled source').toBeGreaterThan(0);
        expect(matched.some(word=>deepeningUsageFor(word)?.id===record.id),record.id+' compiled runtime lookup').toBe(true);
      }
    }
    expect([...active].sort()).toEqual(manifest.activeRecordIds);
    expect(manifest.authoredRecords).toBe(records.length);
  });

  it('uses corrected source senses consistently for display, cloze, shared examples and both voices',()=>{
    const audio=read('../apps/web/src/google-sentence-audio-map.json');
    expect(learningContentCorrections).toHaveLength(20);
    for(const correction of learningContentCorrections){
      const matched=words.filter(word=>correctedLearningContentFor(word)?.id===correction.id);
      expect(matched.length,correction.id+' source sense').toBeGreaterThan(0);
      const example=correction.example;
      expect(example.cloze,correction.id).toBeDefined();
      expect(example.ja.split(example.cloze!.answer).length-1,correction.id+' unique blank').toBe(1);
      expect(normalizeExampleAnswer(example.reading),correction.id+' reading').toContain(normalizeExampleAnswer(example.cloze!.reading));
      for(const word of matched){
        expect(learningExampleFor(word),correction.id+' displayed example').toBe(example);
        expect(books.find((book:any)=>book.id===word.bookId)!.examples[exampleKey(word)],correction.id+' shared example').toEqual(example);
        expect(usageFor(word),correction.id+' source usage').toBe(correction.usage);
      }
      const voices=audio.entries.find((row:{text:string})=>row.text===example.ja);
      expect(voices?.female,correction.id+' female voice').toMatch(/^\/audio\/google\//);
      expect(voices?.male,correction.id+' male voice').toMatch(/^\/audio\/google\//);
    }
    expect(correctedLearningContentFor({term:'うかがう',reading:'うかがう',meaning:'拜访，访问'})).toBeUndefined();
    expect(correctedLearningContentFor({term:'都合',reading:'つごう',meaning:'方便，情况'})).toBeUndefined();
    const combinedSense=words.find(word=>word.bookId==='jlpt-n2'&&word.term==='固まる')!;
    expect(correctedLearningContentFor(combinedSense)).toBeUndefined();
    expect(learningExampleFor(combinedSense)?.ja).toContain('予定がようやく固まった');
    expect(books.find((book:any)=>book.id==='jlpt-n2')!.examples[exampleKey(combinedSense)]).toEqual(learningExampleFor(combinedSense));
  });

  it('preserves all existing refined examples and curated comparisons',()=>{
    for(const record of learningRefinements){
      const source=words.find(word=>record.forms.some(form=>key(form)===key(word))&&record.meaningKeywords.some(keyword=>normalizeVocabularySearchText(word.meaning).includes(normalizeVocabularySearchText(keyword))));
      expect(source,record.id).toBeDefined();
      expect(refinementFor(source!),record.id).toBe(record);
      expect(usageFor(source!),record.id).toBe(record.usage);
    }
    expect(learningUsageCatalog).toHaveLength(60);
  });

  it('accounts for every source position without claiming example-only words were manually refined',()=>{
    const summary:Record<string,Record<string,number>>={};
    const rows:any[]=[];
    const originals=new Set(learningUsageCatalog);
    for(const book of books){
      const counts:Record<string,number>={};summary[book.id]=counts;
      for(const word of words.filter(word=>word.bookId===book.id)){
        const example=book.examples[exampleKey(word)];
        expect(example?.ja,`${book.id} ${word.term}`).toBeTruthy();
        const usage=usageFor(word),structure=sentenceUsageFor(word,example);
        const status=correctedLearningContentFor(word)?'source-sense-correction':refinementFor(word)?'existing-refinement':usage?(originals.has(usage as any)?'existing-word-usage':'new-word-usage'):
          example.tip||example.collocation?'existing-example-usage':structure?'sentence-structure':'example-only';
        counts[status]=(counts[status]??0)+1;
        rows.push({bookId:book.id,lessonIndex:word.lessonIndex,wordIndex:word.wordIndex,term:word.term,reading:word.reading,
          meaning:word.meaning,partOfSpeech:word.partOfSpeech,status,usageId:deepeningUsageFor(word)?.id,structureKind:structure?.kind});
      }
    }
    expect(rows).toHaveLength(16926);
    if(process.env.KOTOBUD_DEEPENING_COVERAGE)writeFileSync(process.env.KOTOBUD_DEEPENING_COVERAGE,JSON.stringify({checkedAt:new Date().toISOString(),
      positions:rows.length,uniqueForms:new Set(rows.map(key)).size,authoringCandidates:records.length,activeWordSpecificRecords:manifest.activeRecordIds.length,books:summary,
      note:'A generated sentence structure or example-only status is not a claim of manual word-level refinement.',entries:rows},null,2)+'\n');
  });
});
