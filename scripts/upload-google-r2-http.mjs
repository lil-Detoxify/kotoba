import {readFile, readdir, rename, writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const account = 'e6c9391d2db1f8bd128045c3700fb766';
const bucket = 'kotoba-assets';
const cfg = readFileSync(resolve(root, '.xdg-config/.wrangler/config/default.toml'), 'utf8');
const token = cfg.match(/oauth_token = "([^"]+)/)?.[1];
if (!token) throw new Error('Wrangler OAuth token unavailable');
const progressPath = resolve(root, '.cache/google-r2-http-progress.json');
let done = new Set();
try { done = new Set(JSON.parse(await readFile(progressPath, 'utf8')).keys ?? []); } catch {}
const jobs = [];
for (const voice of ['a', 'c']) {
  const dir = resolve(root, 'apps/web/public/audio/google/v1', voice);
  for (const file of await readdir(dir)) if (/^[a-f0-9]{64}\.mp3$/.test(file)) {
    const key = `audio/google/v1/${voice}/${file}`;
    if (!done.has(key)) jobs.push({key, file: resolve(dir, file)});
  }
}
const concurrency = Math.max(1, Math.min(8, Number(process.env.KOTOBA_R2_HTTP_CONCURRENCY ?? 4)));
let cursor = 0, completed = 0;
let nextRequestAt = 0;
let paceLock = Promise.resolve();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function pace() { let release; const previous = paceLock; paceLock = new Promise(resolve => { release = resolve; }); await previous; const wait = Math.max(0, nextRequestAt - Date.now()); if (wait) await sleep(wait); nextRequestAt = Date.now() + 350; release(); }
let checkpoint = Promise.resolve();
const saveProgress = () => { checkpoint = checkpoint.then(async () => { const temp = `${progressPath}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify({updatedAt: new Date().toISOString(), keys: [...done].sort()}, null, 2)); await rename(temp, progressPath); }); return checkpoint; };
async function upload(job) {
  const body = await readFile(job.file);
  const sha = createHash('sha256').update(body).digest('hex');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await pace();
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects/${job.key}`, {method: 'PUT', headers: {Authorization: `Bearer ${token}`, 'content-type': 'audio/mpeg', 'x-amz-meta-sha256': sha}, body, signal: AbortSignal.timeout(60000)});
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) { const error = new Error(`HTTP ${response.status}`); error.retryAfter = Number(response.headers.get('retry-after') ?? 0); if (response.status === 429) nextRequestAt = Math.max(nextRequestAt, Date.now() + Math.max(10000, error.retryAfter * 1000)); throw error; }
      done.add(job.key); completed++;
      if (completed % 100 === 0 || completed === jobs.length) await saveProgress();
      return;
    } catch (error) { if (attempt === 4) throw error; await sleep(Math.max((error.retryAfter || 0) * 1000, 5000 * 2 ** attempt)); }
  }
}
let failed = 0;
async function worker() { while (true) { const index = cursor++; if (index >= jobs.length) return; try { await upload(jobs[index]); } catch (error) { failed++; console.error(`failed ${jobs[index].key}: ${error.message}`); } } }
await Promise.all(Array.from({length: Math.min(concurrency, jobs.length)}, worker));
await saveProgress();
console.log(`Uploaded ${completed} Google R2 objects; failed ${failed}; total tracked ${done.size}.`);
