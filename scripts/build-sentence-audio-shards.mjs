import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const sourceBytes=readFileSync(resolve(root,'apps/web/src/google-sentence-audio-map.json'));
const source=JSON.parse(sourceBytes),version=createHash('sha256').update(sourceBytes).digest('hex').slice(0,16);
const normalize=text=>text.normalize('NFC').trim();
const bucket=text=>{let hash=5381;for(const char of normalize(text))hash=(Math.imul(hash,33)^char.codePointAt(0))>>>0;return hash%64;};
const shards=Array.from({length:64},()=>Object.create(null));
for(const record of source.entries){
  const text=normalize(record.text),row={};
  if(!text)continue;
  for(const voice of ['female','male']){
    if(record[voice]&&!/^\/audio\/google\/v1\/[ac]\/[a-f0-9]{64}\.mp3$/u.test(record[voice]))throw Error('Unexpected source recording path');
    if(record[voice])row[voice]=record[voice];
  }
  const target=shards[bucket(text)],prior=target[text];
  if(prior&&JSON.stringify(prior)!==JSON.stringify(row))throw Error('Conflicting normalized sentence audio');
  target[text]=row;
}
const destination=resolve(root,'apps/web/public/data/sentence-audio/v1');
mkdirSync(resolve(destination,version),{recursive:true});
const files=shards.map((shard,id)=>{
  const body=JSON.stringify(shard)+'\n';writeFileSync(resolve(destination,version,id+'.json'),body);
  return {id,entries:Object.keys(shard).length,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')};
});
const manifest={schemaVersion:1,version,shardCount:64,texts:files.reduce((sum,row)=>sum+row.entries,0),bytes:files.reduce((sum,row)=>sum+row.bytes,0),files};
writeFileSync(resolve(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({...manifest,files:files.length}));
