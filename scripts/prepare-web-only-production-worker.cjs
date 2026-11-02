// Keep the released Web UI on the existing production auth contract until the
// WeChat migrations and production JWT secret have been configured and tested.
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const baseCommit = 'b0f3b02dcbfee298817cb9d2e9953c6550c9394f';
const expectedSha256 = 'e874e52bf2564210b767dd01dfcac0c4aaa6f2388ea75e80d96f30f3867b4806';
const oldRoute = String.raw`(Kotoba-(\d+\.\d+\.\d+)-Windows-x64-(Setup|Portable)\.exe)`;
const currentRoute = String.raw`((?:Kotoba|KotoBud)-(\d+\.\d+\.\d+)-Windows-x64-(Setup|Portable)\.exe)`;

const source = execFileSync('git', ['show', `${baseCommit}:scripts/cloudflare-worker.js`], { cwd: root }).toString('utf8');
if (source.split(oldRoute).length !== 2) throw new Error('Expected download route was not found exactly once.');
const worker = source.replace(oldRoute, currentRoute);
const hash = createHash('sha256').update(worker).digest('hex');
if (hash !== expectedSha256) throw new Error(`Production Worker hash mismatch: ${hash}`);
writeFileSync(path.join(root, 'dist-cloudflare', '_worker.js'), worker);
console.log(`Prepared Web-only production Worker: ${hash}`);
