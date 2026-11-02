import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';

// Incremental companion to generate-google-full.mjs. Existing files are never replaced.
const root = resolve(import.meta.dirname, '..');
const sourcePath = resolve(root, 'data/wordbooks/jlpt-textbooks.json');
const mapPath = resolve(root, 'apps/web/src/google-audio-map.json');
const manifestPath = resolve(root, '.cache/jlpt-google-manifest.json');
const progressPath = resolve(root, '.cache/jlpt-google-progress.json');
const planPath = resolve(root, '.cache/jlpt-google-plan.json');
const paramsVersion = 'google-wavenet-v1-ssml-yomigana-rate1-pitch0-volume0';
const voices = { female: 'ja-JP-Wavenet-A', male: 'ja-JP-Wavenet-C' };
const project = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0118344750';
const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'C:/Users/75481/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Roaming/gcloud/application_default_credentials.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const sleep = ms => new Promise(done => setTimeout(done, ms));
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const keyHash = (word, voice) => sha256(JSON.stringify({ term: word.term, reading: word.reading, voice, paramsVersion }));
const isMp3 = bytes => bytes.length > 512 && (bytes.subarray(0, 3).toString() === 'ID3'
  || bytes.some((byte, index) => index < 1024 && byte === 0xff && (bytes[index + 1] & 0xe0) === 0xe0));
await mkdir(dirname(manifestPath), { recursive: true });
const sourceBytes = await readFile(sourcePath);
const sourceHash = sha256(sourceBytes.toString('utf8').replace(/\r\n/g, '\n'));
const books = JSON.parse(sourceBytes).books;
const existingMap = JSON.parse(await readFile(mapPath, 'utf8'));
if (existingMap.paramsVersion !== paramsVersion) throw new Error('Existing audio parameters changed; review before generation.');
const words = [...new Map(books.flatMap(book => book.lessons.flatMap(lesson => lesson.words)).map(word => [`${word.term}\0${word.reading}`, word])).values()];
if (words.length !== 7809 || words.some(word => !word.term || !word.reading)) throw new Error('Unexpected JLPT source.');
const queue = [];
const mapEntries = words.map(word => ({
  term: word.term, reading: word.reading,
  female: `/audio/google/v1/a/${keyHash(word, voices.female)}.mp3`,
  male: `/audio/google/v1/c/${keyHash(word, voices.male)}.mp3`,
}));
let reused = 0;
for (const word of words) for (const [kind, voice] of Object.entries(voices)) {
  const hash = keyHash(word, voice);
  const objectKey = `audio/google/v1/${kind === 'female' ? 'a' : 'c'}/${hash}.mp3`;
  const file = resolve(root, 'apps/web/public', objectKey);
  let exists = false;
  try {
    const bytes = await readFile(file);
    if (!isMp3(bytes)) throw new Error(`Invalid existing MP3: ${objectKey}`);
    exists = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (exists) reused++;
  else queue.push({ word, kind, voice, hash, objectKey, file });
}
const plan = { sourceHash, paramsVersion, project, voices, words: words.length, existingAudioFiles: reused, jobs: queue.map(item => ({
  term: item.word.term, reading: item.word.reading, kind: item.kind, hash: item.hash, objectKey: item.objectKey,
  file: relative(root, item.file).replaceAll('\\', '/'),
})) };
// Preserve the initial delta plan when resuming; completed files now count as reused.
let originalPlan;
try { originalPlan = JSON.parse(await readFile(planPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (originalPlan && originalPlan.sourceHash !== sourceHash) throw new Error('Pending audio plan belongs to different source.');
if (!originalPlan) await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n');
const limit = process.argv.find(arg => arg.startsWith('--limit='));
const selectedJobs = limit ? queue.slice(0, Number(limit.slice(8))) : queue;
if (limit && (!Number.isSafeInteger(Number(limit.slice(8))) || Number(limit.slice(8)) < 1)) throw new Error('Invalid limit.');
console.log(JSON.stringify({ words: words.length, reused, missing: queue.length, thisRun: selectedJobs.length }));
if (process.argv.includes('--plan-only')) process.exit(0);
let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (manifest && manifest.sourceHash !== sourceHash) throw new Error('Generation manifest source mismatch.');
manifest ??= { sourceHash, paramsVersion, project, voices, startedAt: now(), results: {}, requests: 0, ssmlCharacters: 0 };
delete manifest.finishedAt;
let checkpoint = Promise.resolve();
let completed = 0, failed = 0;
function save() {
  const snapshot = JSON.stringify(manifest, null, 2) + '\n';
  const progress = JSON.stringify({ completed, total: selectedJobs.length, failed, reused, missingAtStart: queue.length, recordedSuccess: Object.values(manifest.results).filter(row => row.status === 'success').length, requests: manifest.requests, updatedAt: now() }, null, 2);
  checkpoint = checkpoint.then(async () => {
    const temp = `${manifestPath}.${process.pid}.tmp`;
    await writeFile(temp, snapshot); await rename(temp, manifestPath);
    await writeFile(progressPath, progress);
  });
  return checkpoint;
}
let token, tokenDeadline = 0, authPromise;
async function accessToken() {
  if (token && Date.now() < tokenDeadline) return token;
  if (authPromise) return authPromise;
  authPromise = (async () => {
    const cred = JSON.parse(await readFile(adcPath, 'utf8'));
    if (cred.type !== 'authorized_user' || !cred.refresh_token) throw new Error('Previously used Google ADC is unavailable.');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cred.client_id, client_secret: cred.client_secret, refresh_token: cred.refresh_token, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(20000),
    });
    const json = await response.json();
    if (!response.ok || !json.access_token) throw new Error(`Google ADC refresh failed: HTTP ${response.status}.`);
    token = json.access_token; tokenDeadline = Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000;
    return token;
  })().finally(() => { authPromise = undefined; });
  return authPromise;
}
await accessToken();
await save();
let nextRequest = 0;
async function synth(item) {
  const body = { input: { ssml: `<speak><phoneme alphabet="yomigana" ph="${escape(item.word.reading)}">${escape(item.word.term)}</phoneme></speak>` }, voice: { languageCode: 'ja-JP', name: item.voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: 1, pitch: 0, volumeGainDb: 0 } };
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = Math.max(0, nextRequest - Date.now()); nextRequest = Math.max(nextRequest, Date.now()) + 100;
    if (wait) await sleep(wait);
    const bearer = await accessToken();
    manifest.requests++; manifest.ssmlCharacters += Array.from(body.input.ssml).length;
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'x-goog-user-project': project, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
    const status = response.status;
    if (status >= 200 && status < 300) {
      const json = await response.json();
      const bytes = Buffer.from(json.audioContent ?? '', 'base64');
      if (!isMp3(bytes)) throw new Error('Google returned invalid or empty MP3.');
      await mkdir(dirname(item.file), { recursive: true });
      // Exclusive creation prevents overwriting a file created by another run.
      await writeFile(item.file, bytes, { flag: 'wx' });
      return { status: 'success', objectKey: item.objectKey, file: relative(root, item.file).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes), md5: createHash('md5').update(bytes).digest('hex'), updatedAt: now() };
    }
    if (status === 401 && attempt === 0) { tokenDeadline = 0; await accessToken(); continue; }
    if ([429, 500, 502, 503, 504].includes(status) && attempt < 3) { await sleep(Math.min(15000, 1500 * 2 ** attempt)); continue; }
    // Network ambiguity is recorded, not silently retried as a paid request.
    throw new Error(`Google TTS HTTP ${status || 'unknown'} for ${item.kind}/${item.hash}`);
  }
}
let cursor = 0;
async function worker() {
  while (cursor < selectedJobs.length) {
    const item = selectedJobs[cursor++];
    try { manifest.results[item.objectKey] = await synth(item); }
    catch (error) { failed++; manifest.results[item.objectKey] = { status: 'failed', error: String(error.message).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'), updatedAt: now() }; }
    completed++;
    if (completed % 20 === 0 || completed === selectedJobs.length) {
      await save();
      if (completed % 200 === 0 || completed === selectedJobs.length) console.log(JSON.stringify({ completed, total: selectedJobs.length, failed }));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(8, selectedJobs.length) }, worker));
manifest.finishedAt = now(); await save();
if (failed) { process.exitCode = 1; }
else if (!limit) {
  const merged = new Map(existingMap.entries.map(row => [`${row.term}\0${row.reading}`, row]));
  for (const entry of mapEntries) {
    const key = `${entry.term}\0${entry.reading}`;
    const prior = merged.get(key);
    if (prior && (prior.female !== entry.female || prior.male !== entry.male)) throw new Error('Existing audio identity differs.');
    if (!prior) merged.set(key, entry);
  }
  await writeFile(mapPath, JSON.stringify({ ...existingMap, additionalSources: { ...existingMap.additionalSources, jlpt: { source: 'data/wordbooks/jlpt-textbooks.json', sourceHash } }, entries: [...merged.values()] }, null, 2) + '\n');
}
console.log(JSON.stringify({ complete: !failed && !limit, completed, failed, manifestPath }));
