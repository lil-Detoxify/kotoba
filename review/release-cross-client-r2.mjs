import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const repo=resolve(import.meta.dirname,'..'),out=resolve(repo,'../kotobud-review/cross-client-release-2026-11-04');
const version='0.10.1',mode=process.argv[2]??'inspect';
const verification=JSON.parse(readFileSync(join(repo,'review/windows/2026-11-04-v0.10.1/package-verification.json'),'utf8'));
assert.equal(verification.result,'passed');
const release=join(repo,'release');mkdirSync(release,{recursive:true});
const items=verification.executables.map(item=>{
 const name=item.file.split('/').at(-1),bytes=readFileSync(join(repo,'review/windows/2026-11-04-v0.10.1',item.file));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
 copyFileSync(join(repo,'review/windows/2026-11-04-v0.10.1',item.file),join(release,name));
 return {name,bytes,sha256:item.sha256};
});
const checksum=items.map(item=>`${item.sha256}  ${item.name}`).join('\n')+'\n';
writeFileSync(join(release,`SHA256SUMS-${version}.txt`),checksum);
items.push({name:`SHA256SUMS-${version}.txt`,bytes:Buffer.from(checksum),sha256:createHash('sha256').update(checksum).digest('hex')});
const config=readFileSync(join(repo,'.xdg-config/.wrangler/config/default.toml'),'utf8');
const token=config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];assert(token,'Cloudflare authorization unavailable');
const endpoint='https://api.cloudflare.com/client/v4/accounts/e6c9391d2db1f8bd128045c3700fb766/r2/buckets/kotoba-assets/objects';
const headers={authorization:`Bearer ${token}`},prefix=`releases/${version}/`;
async function list(){
 const response=await fetch(endpoint+'?prefix='+encodeURIComponent(prefix),{headers,signal:AbortSignal.timeout(45000)}),body=await response.json();
 assert(response.ok&&body.success!==false,'R2 listing failed: '+response.status);
 const rows=Array.isArray(body.result)?body.result:body.result?.objects;assert(Array.isArray(rows));
 return rows.map(row=>({key:row.key??row.name,size:Number(row.size),etag:row.etag}));
}
const report={version,mode,checkedAt:new Date().toISOString(),objectsBefore:await list(),uploaded:[]};
if(mode==='upload')for(const item of items){
 const key=prefix+item.name,md5=createHash('md5').update(item.bytes).digest('hex'),existing=report.objectsBefore.find(row=>row.key===key);
 if(existing){assert.equal(existing.size,item.bytes.length);assert.equal(existing.etag.replaceAll('"',''),md5);continue;}
 console.log('Uploading '+item.name+' ('+item.bytes.length+' B)');
 const response=await fetch(endpoint+'/'+key,{method:'PUT',headers:{...headers,'content-type':item.name.endsWith('.txt')?'text/plain':'application/octet-stream','x-amz-meta-sha256':item.sha256},body:item.bytes,signal:AbortSignal.timeout(600000)});
 const result=await response.json();assert(response.ok&&result.success===true,'Upload failed: '+response.status+' '+JSON.stringify(result.errors));
 report.uploaded.push({key,size:item.bytes.length,sha256:item.sha256,md5});
 writeFileSync(join(out,'r2-upload-progress.json'),JSON.stringify(report,null,2)+'\n');
 console.log('Uploaded '+item.name);
}
report.objectsAfter=await list();
if(mode==='upload')for(const item of items){
 const row=report.objectsAfter.find(row=>row.key===prefix+item.name);assert(row,'Missing object '+item.name);assert.equal(row.size,item.bytes.length);assert.equal(row.etag.replaceAll('"',''),createHash('md5').update(item.bytes).digest('hex'));
}
report.complete=true;writeFileSync(join(out,`r2-${mode}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode,objects:report.objectsAfter,complete:true},null,2));
