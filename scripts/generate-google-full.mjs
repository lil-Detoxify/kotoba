import { readFile, writeFile, mkdir, stat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(projectRoot, 'apps/web/src/textbooks.json');
const publicRoot = join(projectRoot, 'apps/web/public/audio/google/v1');
const mapPath = join(projectRoot, 'apps/web/src/google-audio-map.json');
const progressPath = join(projectRoot, '.cache/google-full-progress.json');
const manifestPath = join(projectRoot, '.cache/google-full-manifest.json');
const endpoint = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const project = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0118344750';
const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'C:/Users/75481/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Roaming/gcloud/application_default_credentials.json';
const voices = { female: 'ja-JP-Wavenet-A', male: 'ja-JP-Wavenet-C' };
const paramsVersion = 'google-wavenet-v1-ssml-yomigana-rate1-pitch0-volume0';
const concurrency = Math.max(1, Math.min(8, Number(process.env.GOOGLE_TTS_CONCURRENCY || 4)));
const maxRetries = 4;
const execFileAsync = promisify(execFile);
const ps = process.env.PWSH_EXECUTABLE || 'pwsh';
const python = process.env.GCLOUD_PYTHON || 'C:/Users/75481/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const requestHelper = join(projectRoot, '.cache/tts-request.py');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const ssml = w => `<speak><phoneme alphabet="yomigana" ph="${esc(w.reading)}">${esc(w.term)}</phoneme></speak>`;
const request = (w, voice) => ({ input: { ssml: ssml(w) }, voice: { languageCode: 'ja-JP', name: voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: 1, pitch: 0, volumeGainDb: 0 } });
const keyHash = (w, voice) => createHash('sha256').update(JSON.stringify({ term: w.term, reading: w.reading, voice, paramsVersion })).digest('hex');
const clean = e => String(e?.message || e).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/AIza[\w-]+/g, '[redacted]').replace(/AQ\.[\w_-]+/g, '[redacted]');
const now = () => new Date().toISOString();

await mkdir(dirname(progressPath), { recursive: true });
await mkdir(join(publicRoot, 'a'), { recursive: true });
await mkdir(join(publicRoot, 'c'), { recursive: true });
const textbooks = JSON.parse(await readFile(sourcePath, 'utf8'));
const all = [];
for (const book of textbooks.books) for (const lesson of book.lessons) for (const word of lesson.words) all.push({ ...word, book: book.id, bookTitle: book.title, lesson: lesson.title, lessonOrder: lesson.order });
const words = [...new Map(all.map(w => [`${w.term}\0${w.reading}`, w])).values()];
if (words.some(w => !w.reading)) throw new Error('missing reading in source');
const sourceHash = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
const map = words.map(w => ({ term: w.term, reading: w.reading, female: `/audio/google/v1/a/${keyHash(w, voices.female)}.mp3`, male: `/audio/google/v1/c/${keyHash(w, voices.male)}.mp3` }));
await writeFile(mapPath, JSON.stringify({ schemaVersion: 1, paramsVersion, sourceHash, voices, entries: map }, null, 2) + '\n');

let manifest = { schemaVersion: 1, generatedAt: now(), source: 'apps/web/src/textbooks.json', sourceHash, paramsVersion, project, voices, words: words.length, results: {}, totals: { requests: 0, success: 0, reused: 0, failed: 0, uncertain: 0, chars: 0, bytes: 0 } };
try { const old = JSON.parse(await readFile(manifestPath, 'utf8')); if (old.sourceHash === sourceHash && old.paramsVersion === paramsVersion) manifest = { ...manifest, ...old, results: old.results || {}, totals: old.totals || manifest.totals }; } catch {}
const selected = JSON.parse(await readFile(join(projectRoot, 'tests/tts-google/selected-words.json'), 'utf8'));
let oldTestManifest = null; try { oldTestManifest = JSON.parse(await readFile(join(projectRoot, 'tests/tts-google/manifest.json'), 'utf8')); } catch {}
const testByKey = new Map((oldTestManifest?.results || []).map(x => { const w = selected.find(y => y.id === x.wordId); return w ? [`${w.term}\0${w.reading}\0${x.voice}`, x] : [x.wordId, x]; }));
let token = null;
async function accessToken() {
  let cred; try { cred = JSON.parse(await readFile(adcPath, 'utf8')); } catch (e) { throw new Error(`ADC unavailable: ${clean(e)}`); }
  if (cred.type !== 'authorized_user' || !cred.refresh_token) throw new Error(`unsupported ADC type: ${cred.type || 'unknown'}`);
  const psCode = "$f=@{client_id=$env:GOOGLE_TTS_CLIENT;client_secret=$env:GOOGLE_TTS_SECRET;refresh_token=$env:GOOGLE_TTS_REFRESH;grant_type='refresh_token'};Invoke-RestMethod -Uri '" + (cred.token_uri || 'https://oauth2.googleapis.com/token') + "' -Method Post -Body $f | ConvertTo-Json -Compress";
  const out = await execFileAsync(ps, ['-NoProfile', '-NonInteractive', '-Command', psCode], { windowsHide: true, timeout: 30000, env: { ...process.env, GOOGLE_TTS_CLIENT: cred.client_id, GOOGLE_TTS_SECRET: cred.client_secret, GOOGLE_TTS_REFRESH: cred.refresh_token } });
  const json = JSON.parse(out.stdout); if (!json.access_token) throw new Error('ADC refresh returned no token');
  token = json.access_token; return token;
}
await writeFile(progressPath, JSON.stringify({ completed: 0, total: words.length * 2, status: 'authenticating', updatedAt: now() }, null, 2));
await accessToken();
await writeFile(progressPath, JSON.stringify({ completed: 0, total: words.length * 2, status: 'authenticated', updatedAt: now() }, null, 2));
async function synth(item) {
  const { w, kind, voice, hash, file } = item;
  const key = `${w.term}\0${w.reading}\0${kind}`;
  const body = request(w, voice); const chars = Array.from(body.input.ssml).length;
  const prior = manifest.results[key];
  try { const s = await stat(file); if (s.size > 0 && prior?.status === 'success' && prior.hash === hash) return { reused: true, bytes: s.size, chars: 0 }; } catch {}
  const reusable = testByKey.get(`${w.term}\0${w.reading}\0${voice}`);
  if (reusable?.status === 'success' && reusable.payloadHash === createHash('sha256').update(JSON.stringify(body)).digest('hex')) {
    const oldFile = join(projectRoot, 'tests/tts-google', reusable.file || '');
    try { const s = await stat(oldFile); if (s.size > 0) { await copyFile(oldFile, file); return { reused: true, bytes: s.size, chars: 0 }; } } catch {}
  }
  let last;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 45000);
    try {
      const out = await execFileAsync(python, [requestHelper], { windowsHide: true, timeout: 40000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GOOGLE_TTS_TOKEN: token, GOOGLE_TTS_PROJECT: project, GOOGLE_TTS_BODY: JSON.stringify(body) } });
      const [statusText, payload] = out.stdout.trim().split('|', 2); const status = Number(statusText); const json = status >= 200 && status < 300 ? { audioContent: payload } : (() => { try { return JSON.parse(payload); } catch { return { error: { message: payload } }; } })();
      if (status >= 200 && status < 300 && json.audioContent) { const data = Buffer.from(json.audioContent, 'base64'); if (!data.length) throw new Error('empty audio'); await writeFile(file, data); return { bytes: data.length, chars, httpStatus: status }; }
      const msg = json.error?.message || (status ? `HTTP ${status}` : out.stderr || 'PowerShell request failed'); last = Object.assign(new Error(msg), { status });
      if ([401, 403, 400].includes(status)) throw last;
      if (![429, 500, 502, 503, 504].includes(status) || attempt === maxRetries) throw last;
    } catch (e) { last = e; if (e.status === 401 && attempt === 0) { await accessToken(); } else if (e.status === 401 || e.status === 403 || e.status === 400 || attempt === maxRetries) throw e; }
    finally { clearTimeout(timer); }
    await sleep(Math.min(30000, 1000 * 2 ** attempt) + Math.random() * 500);
  }
  throw last;
}
const queue = []; for (const w of words) for (const [kind, voice] of Object.entries(voices)) { const hash = keyHash(w, voice); queue.push({ w, kind, voice, hash, file: join(publicRoot, kind === 'female' ? 'a' : 'c', `${hash}.mp3`) }); }
queue.sort((x, y) => Number(!testByKey.has(`${x.w.term}\0${x.w.reading}\0${x.voice}`)) - Number(!testByKey.has(`${y.w.term}\0${y.w.reading}\0${y.voice}`)));
let cursor = 0, completed = 0;
async function worker() { while (true) { const i = cursor++; if (i >= queue.length) return; const item = queue[i]; const key = `${item.w.term}\0${item.w.reading}\0${item.kind}`; try { const r = await synth(item); manifest.results[key] = { status: 'success', hash: item.hash, file: relative(projectRoot, item.file).replaceAll('\\', '/'), bytes: r.bytes, reused: !!r.reused, updatedAt: now() }; manifest.totals.success++; if (r.reused) manifest.totals.reused++; else { manifest.totals.requests++; manifest.totals.chars += r.chars; } manifest.totals.bytes += r.bytes; } catch (e) { const status = e.name === 'AbortError' ? 'uncertain' : 'failed'; manifest.results[key] = { status, hash: item.hash, error: clean(e), updatedAt: now() }; manifest.totals[status]++; if (status === 'failed' && [400, 401, 403].includes(e.status)) throw e; } completed++; if (completed % 10 === 0 || completed === queue.length) { manifest.updatedAt = now(); manifest.progress = { completed, total: queue.length }; await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); await writeFile(progressPath, JSON.stringify({ ...manifest.progress, totals: manifest.totals, updatedAt: manifest.updatedAt }, null, 2)); } }
}
await Promise.all(Array.from({ length: concurrency }, worker));
manifest.finishedAt = now(); await writeFile(manifestPath, JSON.stringify(manifest, null, 2)); await writeFile(progressPath, JSON.stringify({ ...manifest.progress, totals: manifest.totals, finishedAt: manifest.finishedAt }, null, 2));
console.log(JSON.stringify({ words: words.length, entries: queue.length, totals: manifest.totals, mapPath, manifestPath }, null, 2));
