const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const output = path.resolve(repo, '../kotobud-review/cross-client-release-2026-11-04');
fs.mkdirSync(output, {recursive:true});
const baseline = path.join(output, 'extension-beta');
if (!fs.existsSync(baseline)) fs.cpSync(path.join(repo,'apps/extension/dist'),baseline,{recursive:true});
const candidate = JSON.parse(fs.readFileSync(path.resolve(repo,'../kotobud-review/round67-production-2026-11-04/candidate.json'),'utf8'));
const bytes = fs.readFileSync(path.join(candidate.site,candidate.main));
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const prior = 'review/windows/2026-11-04-v0.10.1-beta.2';
const next = 'review/windows/2026-11-04-v0.10.1';
fs.mkdirSync(path.join(repo,next),{recursive:true});
for(const name of ['prepare-stage.cjs','verify-package.cjs','electron-builder.yml','grammar-acceptance.mjs','portable-acceptance.mjs']) {
  let text = fs.readFileSync(path.join(repo,prior,name),'utf8').replaceAll('0.10.1-beta.2','0.10.1').replaceAll('0\\.10\\.1-beta\\.2','0\\.10\\.1');
  fs.writeFileSync(path.join(repo,next,name),text);
}
for(const [name,version] of [['apps/windows/package.json','0.10.1'],['apps/extension/package.json','0.4.0']]) {
  const file=path.join(repo,name),json=JSON.parse(fs.readFileSync(file,'utf8')); json.version=version; fs.writeFileSync(file,JSON.stringify(json,null,2)+'\n');
}
const lockFile=path.join(repo,'package-lock.json'),lock=JSON.parse(fs.readFileSync(lockFile,'utf8'));
lock.packages['apps/extension'].version='0.4.0'; fs.writeFileSync(lockFile,JSON.stringify(lock,null,2)+'\n');
fs.writeFileSync(path.join(output,'release-input.json'),JSON.stringify({windowsVersion:'0.10.1',extensionVersion:'0.4.0',webVersion:'0.10.1',webSource:candidate.site,main:candidate.main,mainSha256:hash,workerSha256:candidate.workerSha256},null,2)+'\n');
console.log(JSON.stringify({output,webSource:candidate.site,mainSha256:hash}));
