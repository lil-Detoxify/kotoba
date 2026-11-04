import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const out=resolve(root,'../kotobud-review/cross-client-release-2026-11-04');
const before=join(out,'extension-beta'),after=join(out,'extension-release');
function files(dir,prefix=''){return readdirSync(join(dir,prefix),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(dir,`${prefix}${entry.name}/`):[prefix+entry.name]);}
const oldFiles=files(before),newFiles=files(after);
const canonical=name=>name.replace(/-[A-Za-z0-9_-]{8}(\.(?:js|css|mp3|wav|png))$/,'$1');
const names=[...new Set([...oldFiles,...newFiles])].sort((a,b)=>b.length-a.length);
const normalize=bytes=>{let s=bytes.toString('utf8').replaceAll('0.4.0-beta.1','0.4.0');for(const name of names)s=s.replaceAll(name,canonical(name)).replaceAll(name.split('/').at(-1),canonical(name).split('/').at(-1));return s;};
assert.equal(oldFiles.length,newFiles.length);
const matched=new Set(),changes=[];
for(const name of oldFiles){
 const bytes=readFileSync(join(before,name));
 const target=newFiles.find(next=>!matched.has(next)&&canonical(next)===canonical(name)&&(
   bytes.equals(readFileSync(join(after,next))) || /\.(js|css|html|json|txt|md)$/.test(name)&&normalize(bytes)===normalize(readFileSync(join(after,next)))
 ));
 assert(target,'Unexpected implementation change in '+name);
 matched.add(target);if(!bytes.equals(readFileSync(join(after,target))))changes.push({before:name,after:target});
}
writeFileSync(join(out,'extension-release-comparison.json'),JSON.stringify({metadataOnly:true,comparedFiles:matched.size,changes},null,2)+'\n');
console.log(JSON.stringify({metadataOnly:true,comparedFiles:matched.size,changedFiles:changes.length}));
