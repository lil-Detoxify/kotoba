import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { copyFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';

const root = pathResolve(import.meta.dirname, '..');
execFileSync(process.platform === 'win32' ? 'node.exe' : 'node', [pathResolve(root, 'scripts', 'split-textbooks.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'check:cloudflare'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
const dataVersion = process.env.KOTOBA_DATA_VERSION ?? 'v1';
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, CLOUDFLARE_BUILD: '1', VITE_KOTOBA_DATA_VERSION: dataVersion } });
// Large shards and audio are served by the private R2 binding. Keep the small
// dictionary metadata/license files and any non-generated links in the site.
for (const [dir, pattern] of [['dictionary', /^(?:0|[1-9]\d{0,2})\.json$/], ['audio', /^\d+\.mp3$/]]) {
  const target = pathResolve(root, 'dist-cloudflare', dir);
  if (!existsSync(target)) continue;
  for (const file of readdirSync(target)) {
    if (pattern.test(file)) rmSync(pathResolve(target, file), { force: true });
  }
}
const googleAudio = pathResolve(root, 'dist-cloudflare', 'audio', 'google');
if (existsSync(googleAudio)) rmSync(googleAudio, {recursive: true, force: true});
copyFileSync(pathResolve(root, 'scripts', 'cloudflare-worker.js'), pathResolve(root, 'dist-cloudflare', '_worker.js'));
const headersFile = pathResolve(root, 'apps', 'web', 'public', '_headers');
if (existsSync(headersFile)) copyFileSync(headersFile, pathResolve(root, 'dist-cloudflare', '_headers'));
console.log('Cloudflare static build ready:', readdirSync(pathResolve(root, 'dist-cloudflare')).length, 'top-level entries');
