import assert from 'node:assert/strict';
import {cpSync,copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {renderDownloadContent} from '../scripts/download-page.mjs';
import {currentWindowsReleaseNotes} from '../scripts/release-notes.mjs';
const repo=resolve(import.meta.dirname,'..'),out=resolve(repo,'../kotobud-review/cross-client-release-2026-11-04');
const input=JSON.parse(readFileSync(join(out,'release-input.json'),'utf8')),site=join(out,'site-release');
const pkg=JSON.parse(readFileSync(join(out,'extension-packages.json'),'utf8')).direct;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const app=await fetch('https://kotobud.com/app/',{signal:AbortSignal.timeout(30000)});assert.equal(app.status,200);
assert.equal(sha(Buffer.from(await app.arrayBuffer())),sha(readFileSync(join(input.webSource,'app.html'))),'Production Web changed; rebase the download-only release first');
assert(!existsSync(site),'Existing prepared site preserved');cpSync(input.webSource,site,{recursive:true});
const extRelease=join(repo,'apps/extension/release');mkdirSync(extRelease,{recursive:true});
copyFileSync(join(out,pkg.file),join(extRelease,pkg.file));
for(const name of [pkg.file,'KotoBud-Extension-0.4.0.sha256.txt']) copyFileSync(join(out,name),join(site,'downloads',name));
const body=renderDownloadContent({webVersion:'0.10.1',windowsVersion:'0.10.1',setupFile:'KotoBud-0.10.1-Windows-x64-Setup.exe',portableFile:'KotoBud-0.10.1-Windows-x64-Portable.exe',checksumFile:'SHA256SUMS-0.10.1.txt',downloadsReady:true,extensionDownload:{version:'0.4.0',file:pkg.file,checksumFile:'KotoBud-Extension-0.4.0.sha256.txt',bytes:pkg.bytes,ready:true}});
for(const name of ['download.html','download/index.html']){
 const file=join(site,name),html=readFileSync(file,'utf8');
 assert.equal((html.match(/<main id="main-content">/g)??[]).length,1);
 writeFileSync(file,html.replace(/(<main id="main-content">)[\s\S]*?(<\/main>)/,`$1\n${body}\n$2`));
}
for(const name of ['changelog.html','changelog/index.html']){
 const file=join(site,name);let html=readFileSync(file,'utf8');
 const heading='<h2 id="windows">Windows 桌面版</h2>';assert(html.includes(heading));
 const notes=currentWindowsReleaseNotes.split('<div class="version-header"><span class="version-tag">v0.9.3')[0];
 html=html.replace(heading,heading+notes).replace('2026 年 10 月 27 日 · 当前官网下载版本','2026 年 10 月 27 日 · 历史官网下载版本');
 writeFileSync(file,html);
}
const index=join(site,'index.html');writeFileSync(index,readFileSync(index,'utf8').replace(/Windows (v?)0\.9\.3(?![\d.-])/g,(_,v)=>'Windows '+v+'0.10.1'));
const headers=join(site,'_headers');writeFileSync(headers,readFileSync(headers,'utf8')+`\n/downloads/${pkg.file}\n  Content-Type: application/zip\n  Content-Disposition: attachment; filename="${pkg.file}"\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n\n/downloads/KotoBud-Extension-0.4.0.sha256.txt\n  Content-Type: text/plain; charset=utf-8\n  X-Content-Type-Options: nosniff\n`);
assert.equal(sha(readFileSync(join(site,'_worker.js'))),input.workerSha256);
assert.equal(sha(readFileSync(join(site,input.main))),input.mainSha256);
function files(dir,prefix=''){return readdirSync(join(dir,prefix),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(dir,`${prefix}${entry.name}/`):[prefix+entry.name]);}
const allowed=new Set(['download.html','download/index.html','changelog.html','changelog/index.html','index.html','_headers']);
const changed=[];let identical=0;
for(const file of files(input.webSource)){
 if(readFileSync(join(input.webSource,file)).equals(readFileSync(join(site,file))))identical++;
 else {assert(allowed.has(file),'Unexpected site change '+file);changed.push(file);}
}
writeFileSync(join(out,'site-verification.json'),JSON.stringify({site,baseline:input.webSource,windowsVersion:'0.10.1',extensionVersion:'0.4.0',webVersion:'0.10.1',webMain:input.main,webMainSha256:input.mainSha256,workerSha256:input.workerSha256,byteIdenticalFiles:identical,changed,added:[`downloads/${pkg.file}`,'downloads/KotoBud-Extension-0.4.0.sha256.txt']},null,2)+'\n');
console.log(JSON.stringify({site,byteIdenticalFiles:identical,changed}));
