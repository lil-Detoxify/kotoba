import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const repo=resolve(import.meta.dirname,'..'),out=resolve(repo,'../kotobud-review/cross-client-release-2026-11-04');
const mode=process.argv[2]??'preview';
const origin=mode==='production'?'https://kotobud.com':'https://cross-client-release.kotoba-iuz.pages.dev';
const input=JSON.parse(readFileSync(join(out,'release-input.json'),'utf8'));
const extension=JSON.parse(readFileSync(join(out,'extension-packages.json'),'utf8')).direct;
const report={origin,mode,checkedAt:new Date().toISOString(),resources:[],windows:[],complete:false};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function request(path,options={}){
 const response=await fetch(origin+'/'+path,{signal:AbortSignal.timeout(240000),redirect:'error',...options});
 assert.equal(response.status,200,path+' status');return response;
}
try {
 for(const [url,file] of [['app/','app.html'],['download','download.html'],['changelog','changelog.html'],[input.main,input.main]]){
  const response=await request(url),bytes=Buffer.from(await response.arrayBuffer());
  const comparable=mode==='preview'&&file.endsWith('.html')?Buffer.from(bytes.toString('utf8').replace('<head><meta name="robots" content="noindex, nofollow">','<head>')):bytes;
  assert(comparable.equals(readFileSync(join(out,'site-release',file))),url+' differs');
  report.resources.push({url,status:200,bytes:bytes.length,sha256:sha(bytes),byteIdentical:true});
 }
 for(const [name,local] of [[extension.file,join(out,extension.file)],['KotoBud-Extension-0.4.0.sha256.txt',join(out,'KotoBud-Extension-0.4.0.sha256.txt')],['SHA256SUMS-0.10.1.txt',join(repo,'release/SHA256SUMS-0.10.1.txt')]]){
  const response=await request('downloads/'+name),bytes=Buffer.from(await response.arrayBuffer());
  assert(bytes.equals(readFileSync(local)),name+' differs');
  if(name.endsWith('.zip'))assert(response.headers.get('content-disposition')?.includes(name));
  report.resources.push({url:'downloads/'+name,status:200,bytes:bytes.length,sha256:sha(bytes),byteIdentical:true});
 }
 const verified=JSON.parse(readFileSync(join(repo,'review/windows/2026-11-04-v0.10.1/package-verification.json'),'utf8'));
 for(const file of verified.executables){
  const name=file.file.split('/').at(-1),url='downloads/'+name;
  const head=await request(url,{method:'HEAD'});
  assert.equal(Number(head.headers.get('content-length')),file.bytes);
  assert(head.headers.get('content-disposition')?.includes(name));
  const response=await request(url),hash=createHash('sha256'),reader=response.body.getReader();let bytes=0;const chunks=[];
  while(true){const item=await reader.read();if(item.done)break;const chunk=Buffer.from(item.value);bytes+=chunk.length;hash.update(chunk);if(mode!=='production'){chunks.push(chunk);if(bytes>=65536){await reader.cancel();break;}}}
  if(mode==='production'){assert.equal(bytes,file.bytes);assert.equal(hash.digest('hex'),file.sha256);}
  else {const sample=Buffer.concat(chunks).subarray(0,65536);assert(sample.equals(readFileSync(join(repo,'release',name)).subarray(0,65536)));}
  report.windows.push({name,headStatus:200,headLength:file.bytes,attachment:head.headers.get('content-disposition'),checkedBytes:bytes,fullSha256Matched:mode==='production',expectedSha256:file.sha256});
  writeFileSync(join(out,`${mode}-public-progress.json`),JSON.stringify(report,null,2)+'\n');
  console.log('Verified '+name+' '+bytes+' B'+(mode==='production'?' full SHA-256':''));
 }
 report.complete=true;
}catch(error){report.error=error.message;process.exitCode=1;}
writeFileSync(join(out,`${mode}-public-verification.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({origin,complete:report.complete,resources:report.resources.length,windows:report.windows.length,error:report.error}));
