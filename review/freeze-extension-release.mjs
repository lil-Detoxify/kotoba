import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
const root=resolve(import.meta.dirname,'../..','kotobud-review/cross-client-release-2026-11-04');
const source=join(root,'extension-beta'),target=join(root,'extension-release');
if(existsSync(target))throw Error('Existing frozen release retained');
cpSync(source,target,{recursive:true});
function update(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 const file=join(dir,entry.name);if(entry.isDirectory()){update(file);continue;}
 if(!/\.(html|js|css|json|txt|md)$/.test(entry.name))continue;
 const old=readFileSync(file,'utf8'),next=old.replaceAll('0.4.0-beta.1','0.4.0');
 if(old!==next)writeFileSync(file,next);
}}
update(target);console.log('Frozen approved extension candidate with formal version metadata.');
