import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bucket = process.env.KOTOBA_R2_BUCKET ?? 'kotoba-assets';
const version = process.env.KOTOBA_DATA_VERSION ?? 'v1';
const publicDir = resolve(root, 'apps', 'web', 'public');
const wranglerEntry = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const jobs = [];
const uploadProgressPath = resolve(root, '.cache', 'google-r2-progress.json');
let uploadedKeys = new Set();
try { uploadedKeys = new Set(JSON.parse(readFileSync(uploadProgressPath, 'utf8')).uploadedKeys ?? []); } catch {}
let googleManifest = null;
try { googleManifest = JSON.parse(readFileSync(resolve(root, '.cache', 'google-full-manifest.json'), 'utf8')); } catch {}
const googleSuccessful = new Set(Object.values(googleManifest?.results ?? {}).filter(result => result?.status === 'success' && result.file).map(result => resolve(root, result.file)));
// Legacy dictionary/numbered audio are already in R2. Opt in explicitly for
// a first-time bucket migration; normal releases upload Google deltas only.
if (process.env.KOTOBA_UPLOAD_LEGACY === '1') for (const [folder, contentType] of [['dictionary', 'application/json'], ['audio', 'audio/mpeg']]) {
  const dir = resolve(publicDir, folder);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (folder === 'dictionary' && !/^(?:0|[1-9]\d{0,2})\.json$/.test(file)) continue;
    if (folder === 'audio' && !/^\d+\.mp3$/.test(file)) continue;
    jobs.push([folder, file, contentType]);
  }
}
const googleRoot = resolve(publicDir, 'audio', 'google');
if (existsSync(googleRoot)) for (const voice of ['a', 'c']) {
  const dir = resolve(googleRoot, version, voice); if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const source = resolve(dir, file);
      const key = `audio/google/${version}/${voice}/${file}`;
      const alreadyUploaded = uploadedKeys.has(key) && process.env.KOTOBA_R2_REVERIFY !== '1';
      if (/^[a-f0-9]{64}\.mp3$/.test(file) && !alreadyUploaded && (!googleManifest || (googleSuccessful.has(source) && statSync(source).size > 0))) jobs.push(['google', `${version}/${voice}/${file}`, 'audio/mpeg']);
    }
}
const run = promisify(execFile);
async function upload([folder, file, contentType]) {
  const key = folder === 'dictionary' ? `${folder}/${version}/${file}` : folder === 'google' ? `audio/google/${file}` : `${folder}/${file}`;
  const source = folder === 'google' ? resolve(publicDir, 'audio', folder, file) : resolve(publicDir, folder, file);
  const args = [wranglerEntry, 'r2', 'object', 'put', `${bucket}/${key}`, '--file', source, '--content-type', contentType, '--remote'];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await run(process.execPath, args, {cwd: root, maxBuffer: 1024 * 1024});
      if (folder === 'google') { uploadedKeys.add(key); writeFileSync(uploadProgressPath, JSON.stringify({updatedAt: new Date().toISOString(), uploadedKeys: [...uploadedKeys].sort()}, null, 2)); }
      return;
    }
    catch (error) { if (attempt === 3) throw error; await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 1000)); }
  }
}
let cursor = 0;
async function worker() { while (cursor < jobs.length) { const job = jobs[cursor++]; await upload(job); } }
await Promise.all(Array.from({length: Math.min(Number(process.env.KOTOBA_R2_CONCURRENCY ?? 8), jobs.length)}, worker));
console.log(`Uploaded ${jobs.length} R2 objects to ${bucket}.`);
