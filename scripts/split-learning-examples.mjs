import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {correctedTextbookWord} from './textbook-corrections.mjs';

const root=resolve(import.meta.dirname,'..');
const source=resolve(root,'apps/web/src');
const read=file=>JSON.parse(readFileSync(resolve(source,file),'utf8'));
const jlpt=JSON.parse(readFileSync(resolve(root,'data/wordbooks/jlpt-textbooks.json'),'utf8'));
const normalize=value=>value.normalize('NFKC').replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60)).replace(/\s/gu,'');
const keyFor=(term,reading)=>term.normalize('NFKC').trim()+'|'+normalize(reading);
const examples=new Map();
for(let part=1;part<=3;part++){
  for(const [key,example] of Object.entries(read(`learning-examples-biaori-part${part}.json`))){
    const [term,reading]=key.split('|');
    examples.set(keyFor(term,reading),example);
  }
}
const earlierExamples=new Map(examples);
// Keep authored JLPT additions in source files so normal builds retain them.
// Earlier examples keep their existing priority.
for(const level of ['n5','n4','n3','n2','n1']){
  const file=resolve(source,'learning-examples-jlpt',`${level}.json`);
  if(!existsSync(file))continue;
  for(const [rawKey,example] of Object.entries(JSON.parse(readFileSync(file,'utf8')))){
    const [term,reading]=rawKey.split('|');
    const key=keyFor(term,reading);
    if(!examples.has(key))examples.set(key,example);
  }
}
const out=resolve(source,'learning-examples-biaori');
mkdirSync(out,{recursive:true});
for(const book of [...read('textbooks.json').books,...jlpt.books]){
  const subset={};
  for(const lesson of book.lessons)for(const [index,row] of lesson.words.entries()){
    const word=correctedTextbookWord(book.id,lesson.order,row,index);
    const key=keyFor(word.term,word.reading),previousKey=keyFor(row.term,row.reading);
    const example=earlierExamples.get(key)??earlierExamples.get(previousKey)??examples.get(key)??examples.get(previousKey);
    if(example){
      subset[key]=example;
      if(previousKey!==key)subset[previousKey]=example;
    }
  }
  writeFileSync(resolve(out,`${book.id}.json`),JSON.stringify(subset)+'\n','utf8');
  console.log(`${book.id}: ${Object.keys(subset).length} additional example keys`);
}
