import {spawn} from 'node:child_process';
import {openSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url='http://127.0.0.1:5174';
async function healthy(){try{const response=await fetch(url+'/dictionary/manifest.json',{signal:AbortSignal.timeout(1500)});const value=await response.json();return response.ok&&value.source==='https://github.com/tomoshi-app/tomoshi-dict-data'}catch{return false}}
if(await healthy()){console.log('Kotoba 已运行：'+url);process.exit(0)}
try{await fetch(url,{signal:AbortSignal.timeout(1500)});throw Error('5174 已被其他服务占用，请先检查该端口。')}catch(error){if(!error.cause&&!error.name.includes('Timeout'))throw error}
mkdirSync(path.join(root,'.cache'),{recursive:true});
const output=openSync(path.join(root,'.cache/server.log'),'a');const errors=openSync(path.join(root,'.cache/server-error.log'),'a');
const child=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--configLoader','native','--host','127.0.0.1','--port','5174'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',output,errors]});
child.on('error',error=>{console.error(error.message);process.exitCode=1});child.unref();
for(let i=0;i<20;i++){await new Promise(resolve=>setTimeout(resolve,500));if(await healthy()){console.log('Kotoba 已在后台启动：'+url);process.exit(0)}}
console.error('启动未成功，请查看 .cache/server-error.log');process.exitCode=1;
