import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = dirname(fileURLToPath(import.meta.url));
const words = JSON.parse(await readFile(join(root, 'selected-words.json'), 'utf8'));
const voices = ['ja-JP-Wavenet-A', 'ja-JP-Wavenet-B', 'ja-JP-Wavenet-C', 'ja-JP-Wavenet-D'];
const manifestPath = join(root, 'manifest.json');
const outputRoot = join(root, 'output');
const apiKey = process.env.GOOGLE_TTS_API_KEY;
const dryRun = process.argv.includes('--dry-run');
const project = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0118344750';
const gcloudExecutable = process.env.GCLOUD_EXECUTABLE || 'gcloud';
const gcloudScript = process.env.GCLOUD_SCRIPT;
const gcloudPython = process.env.GCLOUD_PYTHON || 'python';
const endpoint = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const execFileAsync = promisify(execFile);

function esc(s) { return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'", '&apos;'); }
function ssmlFor(w) { return `<speak><phoneme alphabet="yomigana" ph="${esc(w.reading)}">${esc(w.term)}</phoneme></speak>`; }
function requestFor(w, voice) { const ssml = ssmlFor(w); return { input:{ ssml }, voice:{ languageCode:'ja-JP', name:voice }, audioConfig:{ audioEncoding:'MP3', speakingRate:1, pitch:0, volumeGainDb:0 } }; }
function payloadHash(body) { return createHash('sha256').update(JSON.stringify(body)).digest('hex'); }
function safeError(err) { return String(err instanceof Error ? err.message : err).replace(/AIza[\w-]+/g, '[redacted]').replace(/AQ\.[\w_-]+/g, '[redacted]'); }

let authHeaders;
if (dryRun) authHeaders = {};
else try {
  const command = gcloudScript ? gcloudPython : gcloudExecutable;
  const args = gcloudScript ? [gcloudScript, 'auth', 'application-default', 'print-access-token'] : ['auth', 'application-default', 'print-access-token'];
  const { stdout } = await execFileAsync(command, args, { windowsHide: true });
  const token = stdout.trim();
  if (!token) throw new Error('empty ADC token');
  authHeaders = { Authorization: `Bearer ${token}` };
} catch (adcError) {
  if (apiKey) authHeaders = { 'X-Goog-Api-Key': apiKey };
  else {
  try {
    throw new Error(`No ADC token or GOOGLE_TTS_API_KEY: ${safeError(adcError)}`);
  } catch (err) { throw new Error(safeError(err)); }
  }
}
await mkdir(outputRoot, { recursive: true });
for (const v of voices) await mkdir(join(outputRoot, v.replace('ja-JP-','').toLowerCase()), { recursive: true });
const sourceHash = createHash('sha256').update(await readFile(join(root, 'selected-words.json'))).digest('hex');
const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), source: 'selected-words.json', sourceHash, request: { languageCode:'ja-JP', quotaProject:project, audioEncoding:'MP3', speakingRate:1, pitch:0, volumeGainDb:0, input:'SSML yomigana phoneme', voices }, words, results: [] };
if (dryRun) {
  const entries = words.flatMap(w => voices.map(voice => ({ wordId:w.id, voice, chars:Array.from(ssmlFor(w)).length, payloadHash:payloadHash(requestFor(w, voice)) })));
  console.log(JSON.stringify({ dryRun:true, words:words.length, entries:entries.length, missingReading:words.filter(w=>!w.reading).map(w=>w.id), duplicateTerms:words.filter((w,i,a)=>a.findIndex(x=>x.term===w.term) !== i).map(w=>w.id), sourceHash, entries }));
  process.exit(0);
}
let existing = null;
try { existing = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
const old = new Map((existing?.results ?? []).map(x => [`${x.wordId}/${x.voice}`, x]));
let requests = 0, chars = 0;
for (const w of words) for (const voice of voices) {
  const short = voice.replace('ja-JP-','').toLowerCase();
  const file = join(outputRoot, short, `${w.id}_${voice}.mp3`);
  const key = `${w.id}/${voice}`;
  const body = requestFor(w, voice); const hash = payloadHash(body);
  try { const s = await stat(file); const prior = old.get(key); if (s.size > 0 && prior?.status === 'success' && prior.sourceHash === sourceHash && prior.payloadHash === hash) { manifest.results.push(prior); continue; } } catch {}
  requests++; chars += Array.from(body.input.ssml).length;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
  let res; let json;
  try { res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json','X-Goog-User-Project':project,...authHeaders}, body:JSON.stringify(body), signal:controller.signal }); json = await res.json(); } catch (err) { clearTimeout(timer); const clean=safeError(err); manifest.results.push({wordId:w.id,voice,status:'failed',error:clean,requestChars:Array.from(body.input.ssml).length,payloadHash:hash,sourceHash}); await writeFile(manifestPath, JSON.stringify(manifest,null,2)); throw new Error(clean); } finally { clearTimeout(timer); }
  if (!res.ok || !json.audioContent) { const message = json.error?.message ?? `HTTP ${res.status}`; manifest.results.push({wordId:w.id,voice,status:'failed',httpStatus:res.status,error:safeError(message),requestChars:Array.from(body.input.ssml).length,payloadHash:hash,sourceHash}); manifest.summary = { requests, generated: manifest.results.filter(x=>x.status==='success').length, failed:manifest.results.filter(x=>x.status==='failed').length, chars, totalBytes:manifest.results.filter(x=>x.status==='success').reduce((n,x)=>n+x.bytes,0) }; await writeFile(manifestPath, JSON.stringify(manifest,null,2)); throw new Error(`TTS failed for ${w.id}/${voice}: ${safeError(message)}`); }
  await writeFile(file, Buffer.from(json.audioContent, 'base64'));
  const size = (await stat(file)).size;
  manifest.results.push({wordId:w.id,voice,status:'success',file:relative(root,file).split('\\').join('/'),bytes:size,requestChars:Array.from(body.input.ssml).length,payloadHash:hash,sourceHash,requestContent:body});
  await writeFile(manifestPath, JSON.stringify(manifest,null,2));
}
manifest.summary = { requests, generated: manifest.results.filter(x=>x.status==='success').length, failed:manifest.results.filter(x=>x.status==='failed').length, chars, totalBytes:manifest.results.filter(x=>x.status==='success').reduce((n,x)=>n+x.bytes,0) };
await writeFile(manifestPath, JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest.summary));
