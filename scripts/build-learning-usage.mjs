import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),src=resolve(root,'apps/web/src'),publicRoot=resolve(root,'apps/web/public');
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const normalize=text=>text.normalize('NFKC').replace(/[ァ-ヶ]/gu,char=>String.fromCharCode(char.charCodeAt(0)-0x60)).replace(/\s/gu,'').toLowerCase();
const key=form=>form.term.normalize('NFKC').trim()+'|'+normalize(form.reading);
const matches=(row,word)=>row.forms.some(form=>key(form)===key(word))&&(!row.sourceMeanings||row.sourceMeanings.some(meaning=>normalize(meaning)===normalize(word.meaning)))&&(!row.meaningKeywords||row.meaningKeywords.some(keyword=>keyword&&normalize(word.meaning).includes(normalize(keyword))));
const legacyMeanings=read(resolve(src,'learning-usage-meanings.json'));
const existing=['learning-content-corrections.json','learning-usage.json','learning-usage-foundation.json','learning-usage-everyday.json','learning-refinements-n5.json','learning-refinements-n4.json','learning-refinements-common.json'].flatMap(name=>read(resolve(src,name))).map(row=>row.meaningKeywords?row:{...row,meaningKeywords:legacyMeanings[row.id]??[]});
const authored=['lower','advanced','biaori','core'].flatMap(group=>read(resolve(src,'learning-usage-deepening-'+group+'.json')).map(record=>({group,record})));
const byForm=new Map();
for(const entry of authored)for(const form of entry.record.forms){const id=key(form);byForm.set(id,[...(byForm.get(id)??[]),entry]);}
const localDestination=resolve(src,'learning-usage-books'),sharedDestination=resolve(publicRoot,'data/usage/v1');
mkdirSync(localDestination,{recursive:true});mkdirSync(sharedDestination,{recursive:true});
const manifest={version:'v1',generatedAt:new Date().toISOString(),source:'Source-bound KotoBud word-level usage, compiled per book from the shared authored catalog.',books:[],authoredRecords:authored.length,activeRecordIds:[],bytes:0,newSentencesGenerated:0,audioIncluded:false};
const active=new Set();
for(const book of read(resolve(publicRoot,'data/books/index.json')).books){
  const words=read(resolve(publicRoot,'data/books',book.id+'.json')).lessons.flatMap(lesson=>lesson.words);
  const preferred=book.id.startsWith('biaori-')?'biaori':/n[12]$/u.test(book.id)?'advanced':'lower';
  const selected=new Map();let matchedWords=0;
  for(const word of words){
    if(existing.some(row=>matches(row,word)))continue;
    const choices=(byForm.get(key(word))??[]).filter(({record})=>matches(record,word));
    const score=({group,record})=>(group===preferred?10000:group==='core'?1000:0)+Math.max(...record.meaningKeywords.filter(keyword=>normalize(word.meaning).includes(normalize(keyword))).map(keyword=>normalize(keyword).length));
    choices.sort((left,right)=>score(right)-score(left)||left.record.id.localeCompare(right.record.id));
    if(!choices.length)continue;
    const {record}=choices[0];matchedWords++;active.add(record.id);
    const row=selected.get(record.id)??{...record,forms:[],sourceMeanings:[]};
    if(!row.forms.some(form=>key(form)===key(word)))row.forms.push({term:word.term,reading:word.reading});
    if(!row.sourceMeanings.includes(word.meaning))row.sourceMeanings.push(word.meaning);
    selected.set(record.id,row);
  }
  const rows=[...selected.values()].sort((left,right)=>left.id.localeCompare(right.id));
  const body=JSON.stringify(rows)+'\n';
  writeFileSync(resolve(localDestination,book.id+'.json'),body);writeFileSync(resolve(sharedDestination,book.id+'.json'),body);
  const bytes=Buffer.byteLength(body);manifest.bytes+=bytes;
  manifest.books.push({id:book.id,entries:rows.length,matchedWords,bytes,sha256:createHash('sha256').update(body).digest('hex')});
}
manifest.activeRecordIds=[...active].sort();
writeFileSync(resolve(sharedDestination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({...manifest,activeRecordIds:manifest.activeRecordIds.length}));
