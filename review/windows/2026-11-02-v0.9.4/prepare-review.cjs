'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const prior = path.join(root, 'review/windows/2026-10-27-v0.9.3');
const round58 = path.resolve(root, '../kotobud-review/round58-2026-10-28');
const version = '0.9.4';
const date = '2026-11-02';

for (const name of ['prepare-stage.cjs', 'verify-package.cjs', 'electron-builder.yml']) {
  const contents = fs.readFileSync(path.join(prior, name), 'utf8')
    .replaceAll('2026-10-27-v0.9.3', `${date}-v${version}`)
    .replaceAll('2026-10-27', date)
    .replaceAll('0.9.3', version);
  fs.writeFileSync(path.join(__dirname, name), contents, { flag: 'wx' });
}

const windowsPackage = path.join(root, 'apps/windows/package.json');
const sourcePackage = fs.readFileSync(windowsPackage, 'utf8');
assert.equal(JSON.parse(sourcePackage).version, '0.9.3');
fs.writeFileSync(windowsPackage, sourcePackage.replace('"version": "0.9.3"', '"version": "0.9.4"'));

const publicCheck = JSON.parse(fs.readFileSync(path.join(round58, 'production-public-verification.json'), 'utf8'));
assert.equal(publicCheck.complete, true);
const releaseFile = path.join(round58, 'production-release.json');
const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
release.publicResourcesMatched = 12;
release.resourceVerificationComplete = true;
release.resourceVerificationCompletedOn = date;
release.notes = ['2026-11-02 补核主样式 main-DmnVlUaU.css：HTTP 200，69,252 字节，SHA-256 与正式候选一致；其余 11 项沿用 2026-10-28 已通过的核验记录。'];
fs.writeFileSync(releaseFile, JSON.stringify(release, null, 2) + '\n');

const replacements = [
  [path.join(root, 'docs/HANDOFF_OVERVIEW.md'),
    '11/12 项生产资源完整字节匹配，主样式独立 GET 完整校验因本机连接超时未完成，浏览器样式显示正常。',
    '12/12 项生产资源完整字节匹配；2026-11-02 已补核此前超时的主样式，其余 11 项沿用发布时核验记录。'],
  [path.join(root, 'docs/HANDOFF_WEB_WINDOWS.md'),
    '11/12 项生产资源完整字节匹配，主样式独立 GET 完整校验因本机连接超时未完成，浏览器样式显示正常。',
    '12/12 项生产资源完整字节匹配；2026-11-02 已补核此前超时的主样式，其余 11 项沿用发布时核验记录。'],
  [path.join(root, 'CHANGELOG.md'),
    '11/12 项生产资源完整字节匹配；主样式独立完整 GET 超时，浏览器显示正常。',
    '12/12 项生产资源完整字节匹配；2026-11-02 补核主样式成功，其余 11 项沿用发布时核验记录。'],
  [path.join(round58, 'PRODUCTION.md'),
    '生产应用入口、主要 JS、学习与查词样式、门户和日志共 11/12 项完整字节匹配；主样式 main-DmnVlUaU.css 的独立完整 GET 在本机多次超时；curl 收到 HTTP 200 和部分正文，未完成其公网全量哈希复核。浏览器实际设置页样式正常，测试站同一 CSS 字节此前已通过完整核验。',
    '生产应用入口、主要 JS、学习与查词样式、门户和日志共 12/12 项完整字节匹配。2026-11-02 已补核此前超时的主样式 main-DmnVlUaU.css：HTTP 200，69,252 字节，SHA-256 为 c2f7b3b87de6b57bbcd70f7a6ea4ea78afcd2c926f4ae1a0e835b7cc5b83ee91，与正式候选一致；其余 11 项沿用 2026-10-28 发布时记录。本次仅补核，没有重新部署。'],
];
for (const [filename, before, after] of replacements) {
  const text = fs.readFileSync(filename, 'utf8');
  assert(text.includes(before), `Missing expected release status in ${filename}`);
  fs.writeFileSync(filename, text.replace(before, after));
}
console.log(JSON.stringify({ windowsVersion: version, review: __dirname, productionResources: '12/12' }));
