import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(import.meta.dirname, '..');
const account = 'e6c9391d2db1f8bd128045c3700fb766';
const bucket = 'kotoba-assets';
const expectedJobs = 8752;
const planPath = resolve(root, '.cache/jlpt-google-plan.json');
const manifestPath = resolve(root, '.cache/jlpt-google-manifest.json');
const progressPath = resolve(root, '.cache/jlpt-r2-progress.json');
const baselinePath = resolve(root, '../kotobud-review/jlpt-audio-2026-10-05/r2-before.json');
const wranglerConfigPath = resolve(root, '.xdg-config/.wrangler/config/default.toml');
const wranglerCliPath = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const publicBase = 'https://staging.kotobud.com/';
// Request pacing stays below the API quota; more workers hide HEAD/PUT latency.
const concurrency = 8;
const apiSpacingMs = 350;
const retryLimit = 5;
const networkRetryLimit = 8;
const watchIntervalMs = 5000;

class SafeFailure extends Error {}
const fail = message => { throw new SafeFailure(message); };
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const md5 = bytes => createHash('md5').update(bytes).digest('hex');
const normalizePath = value => value.replaceAll('\\', '/').replace(/^\.\//, '');

function parseArgs(args) {
  const options = {watch: false, dryRun: false, limit: null};
  for (const arg of args) {
    if (arg === '--watch') options.watch = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--limit=')) {
      const limit = Number(arg.slice('--limit='.length));
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > expectedJobs) fail('Invalid --limit value.');
      options.limit = limit;
    } else if (arg === '--help') {
      console.log('Usage: node scripts/upload-google-jlpt-r2.mjs [--watch | --limit=N] [--dry-run]');
      process.exit(0);
    } else fail(`Unknown option: ${arg}`);
  }
  if (options.watch && options.limit !== null) fail('--watch and --limit cannot be combined.');
  if (options.watch && options.dryRun) fail('--watch and --dry-run cannot be combined.');
  return options;
}

async function readJson(path, label) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { fail(`${label} is missing or invalid JSON.`); }
}

function validatePlan(plan) {
  if (!isRecord(plan) || !Array.isArray(plan.jobs) || plan.jobs.length !== expectedJobs
    || typeof plan.sourceHash !== 'string' || typeof plan.paramsVersion !== 'string') {
    fail(`Plan must contain exactly ${expectedJobs} jobs.`);
  }
  const keys = new Set();
  for (const job of plan.jobs) {
    if (!isRecord(job) || !['female', 'male'].includes(job.kind)
      || !/^[a-f0-9]{64}$/.test(job.hash ?? '') || typeof job.objectKey !== 'string'
      || typeof job.file !== 'string') fail('Plan contains an invalid job.');
    const voiceDir = job.kind === 'female' ? 'a' : 'c';
    const expectedKey = `audio/google/v1/${voiceDir}/${job.hash}.mp3`;
    if (job.objectKey !== expectedKey || normalizePath(job.file) !== `apps/web/public/${expectedKey}`) {
      fail(`Plan path mismatch: ${job.objectKey}`);
    }
    if (keys.has(job.objectKey)) fail(`Duplicate plan key: ${job.objectKey}`);
    keys.add(job.objectKey);
  }
  return {jobs: plan.jobs, keys, sourceHash: plan.sourceHash, paramsVersion: plan.paramsVersion, fingerprint: sha256(Buffer.from(JSON.stringify({
    sourceHash: plan.sourceHash,
    paramsVersion: plan.paramsVersion,
    keys: [...keys].sort(),
  })))};
}

function baselineRecords(baseline) {
  if (!isRecord(baseline) || baseline.complete !== true || !Array.isArray(baseline.objects)
    || !Number.isSafeInteger(baseline.count) || baseline.count !== baseline.objects.length) {
    fail('A complete r2-before.json baseline is required; refusing to upload.');
  }
  const objects = new Map();
  for (const item of baseline.objects) {
    if (!isRecord(item) || typeof item.key !== 'string' || !item.key) fail('Invalid object in R2 baseline.');
    if (objects.has(item.key)) fail(`Duplicate baseline key: ${item.key}`);
    objects.set(item.key, {
      size: Number.isSafeInteger(Number(item.size)) ? Number(item.size) : null,
      md5: normalizeMd5(item.md5 ?? item.etag),
    });
  }
  return objects;
}

function normalizeMd5(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^"|"$/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(normalized) ? normalized : null;
}

function manifestRecords(manifest, plan) {
  if (!isRecord(manifest) || manifest.sourceHash !== plan.sourceHash
    || manifest.paramsVersion !== plan.paramsVersion || !isRecord(manifest.results)) {
    fail('JLPT manifest does not match the plan.');
  }
  const byKey = new Map();
  for (const result of Object.values(manifest.results)) {
    if (!isRecord(result) || typeof result.objectKey !== 'string' || !plan.keys.has(result.objectKey)) continue;
    if (byKey.has(result.objectKey)) fail(`Duplicate manifest key: ${result.objectKey}`);
    byKey.set(result.objectKey, result);
  }
  return byKey;
}

async function validateLocal(job, result) {
  if (!isRecord(result) || result.status !== 'success'
    || normalizePath(result.file ?? '') !== normalizePath(job.file)
    || !Number.isSafeInteger(result.bytes) || result.bytes < 0
    || !/^[a-f0-9]{64}$/i.test(result.sha256 ?? '')
    || !/^[a-f0-9]{32}$/i.test(result.md5 ?? '')) {
    fail(`Invalid successful manifest entry: ${job.objectKey}`);
  }
  let bytes;
  try { bytes = await readFile(resolve(root, job.file)); }
  catch { fail(`Local audio file missing: ${job.objectKey}`); }
  const actualSha = sha256(bytes);
  const actualMd5 = md5(bytes);
  if (bytes.length !== result.bytes || actualSha !== result.sha256.toLowerCase() || actualMd5 !== result.md5.toLowerCase()) {
    fail(`Local audio checksum mismatch: ${job.objectKey}`);
  }
  return {bytes, size: bytes.length, sha256: actualSha, md5: actualMd5};
}

async function loadProgress(planInfo) {
  let data;
  try { data = JSON.parse(await readFile(progressPath, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return new Map();
    fail('Progress file is invalid; refusing to resume.');
  }
  if (!isRecord(data) || data.version !== 1 || data.planFingerprint !== planInfo.fingerprint
    || !Array.isArray(data.objects)) fail('Progress file does not match this plan; refusing to resume.');
  const done = new Map();
  for (const item of data.objects) {
    if (!isRecord(item) || !planInfo.keys.has(item.key) || done.has(item.key)
      || !['uploaded', 'baseline-reused', 'already-present', 'verified-after-unknown-put'].includes(item.outcome)
      || !Number.isSafeInteger(item.bytes) || !/^[a-f0-9]{32}$/.test(item.md5 ?? '')
      || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '')) fail('Progress file contains an invalid record.');
    done.set(item.key, item);
  }
  return done;
}

let progressWrite = Promise.resolve();
async function saveProgress(planInfo, done) {
  progressWrite = progressWrite.then(async () => {
    await mkdir(dirname(progressPath), {recursive: true});
    const tempPath = `${progressPath}.${process.pid}.tmp`;
    const payload = {
      version: 1,
      planFingerprint: planInfo.fingerprint,
      updatedAt: new Date().toISOString(),
      objects: [...done].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({key, ...value})),
    };
    await writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf8');
    await rename(tempPath, progressPath);
  });
  return progressWrite;
}

function baselineMatches(remote, local, key) {
  if (!remote || remote.size === null || !remote.md5) fail(`Baseline metadata unavailable for ${key}`);
  if (remote.size !== local.size || remote.md5 !== local.md5) fail(`Baseline conflict: ${key}`);
}

function backoffMs(attempt, retryAfterMs = 0) {
  return Math.max(retryAfterMs, Math.min(60_000, 1000 * (2 ** attempt)));
}

function retryAfterMs(response) {
  const value = response.headers.get('retry-after');
  if (!value) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

let nextApiRequestAt = 0;
let apiPaceQueue = Promise.resolve();
async function paceApi() {
  let release;
  const previous = apiPaceQueue;
  apiPaceQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    const wait = Math.max(0, nextApiRequestAt - Date.now());
    if (wait) await sleep(wait);
    nextApiRequestAt = Date.now() + apiSpacingMs;
  } finally { release(); }
}

function blockApi(delay) {
  nextApiRequestAt = Math.max(nextApiRequestAt, Date.now() + delay);
}

function publicUrl(job) {
  return new URL(job.objectKey, publicBase).href;
}

async function publicFetch(method, job) {
  const url = publicUrl(job);
  let networkFailures = 0;
  let httpRetries = 0;
  while (true) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {'cache-control': 'no-cache', pragma: 'no-cache'},
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      const detail = error?.cause?.code ?? (error instanceof Error ? error.name : 'unknown network error');
      networkFailures++;
      if (networkFailures === networkRetryLimit) {
        fail(`Network verification failed (${detail}): ${job.objectKey}`);
      }
      const delay = backoffMs(networkFailures - 1);
      console.warn(`Transient public ${method} network failure (${detail}); retry ${networkFailures}/${networkRetryLimit} after ${delay}ms.`);
      await sleep(delay);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      httpRetries++;
      const delay = backoffMs(httpRetries - 1, retryAfterMs(response));
      if (httpRetries === retryLimit) fail(`Public HTTP ${response.status}: ${job.objectKey}`);
      await sleep(delay);
      continue;
    }
    return response;
  }
}

async function inspectPublicObject(job, local) {
  const head = await publicFetch('HEAD', job);
  if (head.status === 404) return false;
  if (head.status !== 200) fail(`Public HEAD HTTP ${head.status}: ${job.objectKey}`);
  const get = await publicFetch('GET', job);
  if (get.status !== 200) fail(`Public GET HTTP ${get.status}: ${job.objectKey}`);
  const remoteBytes = Buffer.from(await get.arrayBuffer());
  if (remoteBytes.length !== local.size || md5(remoteBytes) !== local.md5) {
    fail(`Public object conflict: ${job.objectKey}`);
  }
  return true;
}

async function readOAuthToken() {
  let config;
  try { config = await readFile(wranglerConfigPath, 'utf8'); }
  catch { fail('Wrangler OAuth token unavailable.'); }
  const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
  if (!token) fail('Wrangler OAuth token unavailable.');
  return token;
}

async function runWranglerRefresh() {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const child = spawn(process.execPath, [wranglerCliPath, 'whoami'], {
      cwd: root,
      stdio: 'ignore',
      windowsHide: true,
      env: {...process.env, XDG_CONFIG_HOME: resolve(root, '.xdg-config'), CI: '1', WRANGLER_SEND_METRICS: 'false'},
    });
    const timer = setTimeout(() => { child.kill(); finish(false); }, 60_000);
    child.once('error', () => finish(false));
    child.once('close', code => finish(code === 0));
  });
}

let tokenRefreshInFlight = null;
async function refreshOAuthToken() {
  if (!tokenRefreshInFlight) {
    tokenRefreshInFlight = (async () => {
      if (!await runWranglerRefresh()) return null;
      try { return await readOAuthToken(); }
      catch { return null; }
    })();
  }
  const current = tokenRefreshInFlight;
  try { return await current; }
  finally { if (tokenRefreshInFlight === current) tokenRefreshInFlight = null; }
}

async function putObject(job, local) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects/${job.objectKey}`;
  let authRetryUsed = false;
  for (let attempt = 0; attempt < retryLimit; attempt++) {
    const token = await readOAuthToken();
    await paceApi();
    let response;
    try {
      response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'audio/mpeg',
          'x-amz-meta-sha256': local.sha256,
        },
        body: local.bytes,
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      if (await inspectPublicObject(job, local)) return 'verified-after-unknown-put';
      if (attempt + 1 === retryLimit) fail(`Network upload failed: ${job.objectKey}`);
      await sleep(backoffMs(attempt));
      continue;
    }

    if (response.status === 401 && !authRetryUsed) {
      authRetryUsed = true;
      if (!await refreshOAuthToken()) fail(`HTTP 401: ${job.objectKey}`);
      continue;
    }
    if (response.status === 429) {
      const resetSeconds = Number(response.headers.get('ratelimit')?.match(/(?:^|;)\s*t=(\d+)/)?.[1] ?? 0);
      const delay = Math.max(15000, resetSeconds * 1000, backoffMs(attempt, retryAfterMs(response)));
      blockApi(delay);
      if (attempt + 1 === retryLimit) fail(`R2 PUT HTTP 429: ${job.objectKey}`);
      await sleep(delay);
      continue;
    }
    if (response.status >= 500) {
      if (await inspectPublicObject(job, local)) return 'verified-after-unknown-put';
      if (attempt + 1 === retryLimit) fail(`HTTP ${response.status}: ${job.objectKey}`);
      await sleep(backoffMs(attempt));
      continue;
    }
    if (!response.ok) fail(`HTTP ${response.status}: ${job.objectKey}`);
    const result = await response.json().catch(() => null);
    if (result?.success !== true) fail(`HTTP ${response.status}: ${job.objectKey}`);
    return 'uploaded';
  }
  fail(`Upload retries exhausted: ${job.objectKey}`);
}

async function readManifestForRun(watching, planInfo) {
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch {
    if (watching) return null;
    fail('JLPT manifest is missing or invalid JSON.');
  }
  manifestRecords(manifest, planInfo);
  return manifest;
}

function summarizeManifest(planInfo, records) {
  let successful = 0;
  let failed = 0;
  for (const job of planInfo.jobs) {
    const status = records.get(job.objectKey)?.status;
    if (status === 'success') successful++;
    else if (status === 'failed') failed++;
  }
  return {successful, failed, pending: expectedJobs - successful};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await readJson(planPath, 'JLPT plan');
  const planInfo = validatePlan(plan);
  const initialManifest = await readManifestForRun(options.watch, planInfo);
  if (!initialManifest) {
    console.log('Waiting for the JLPT generator to write a valid manifest.');
    if (!options.watch) process.exitCode = 2;
    else return watchAndUpload(planInfo, options, null);
    return;
  }

  const initialRecords = manifestRecords(initialManifest, planInfo);
  if (options.dryRun) {
    const ready = planInfo.jobs.filter(job => initialRecords.get(job.objectKey)?.status === 'success');
    const selected = options.limit === null ? ready : ready.slice(0, options.limit);
    for (const job of selected) await validateLocal(job, initialRecords.get(job.objectKey));
    const status = summarizeManifest(planInfo, initialRecords);
    console.log(`Dry run: validated ${selected.length} local files; plan ${expectedJobs}; generated ${status.successful}; failed ${status.failed}; pending ${status.pending}. No network or progress writes.`);
    return;
  }

  const baseline = await readJson(baselinePath, 'Complete R2 baseline');
  const baselineMap = baselineRecords(baseline);
  const done = await loadProgress(planInfo);
  const baselineOverlaps = planInfo.jobs.filter(job => baselineMap.has(job.objectKey)).length;
  console.log(`Validated plan ${expectedJobs}; complete R2 baseline ${baselineMap.size}; planned-key overlaps ${baselineOverlaps}; progress ${done.size}.`);
  await watchAndUpload(planInfo, options, {baselineMap, done, initialManifest});
}

async function watchAndUpload(planInfo, options, context) {
  if (options.dryRun) return;
  if (!context) {
    const baseline = await readJson(baselinePath, 'Complete R2 baseline');
    context = {baselineMap: baselineRecords(baseline), done: await loadProgress(planInfo), initialManifest: null};
  }
  const {baselineMap, done} = context;
  const validated = new Set();
  let verifiedThisRun = 0;
  let addedThisRun = 0;
  let iteration = 0;

  while (true) {
    const manifest = iteration === 0 && context.initialManifest
      ? context.initialManifest
      : await readManifestForRun(options.watch, planInfo);
    iteration++;
    if (!manifest) {
      if (!options.watch) {
        console.log('Manifest not ready; no upload attempted.');
        process.exitCode = 2;
        return;
      }
      await sleep(watchIntervalMs);
      continue;
    }
    const records = manifestRecords(manifest, planInfo);
    const candidates = planInfo.jobs.filter(job => records.get(job.objectKey)?.status === 'success' && !validated.has(job.objectKey));
    const batch = options.limit === null ? candidates : candidates.slice(0, options.limit);
    let cursor = 0;
    let fatal = null;

    async function worker() {
      while (!fatal) {
        const index = cursor++;
        if (index >= batch.length) return;
        const job = batch[index];
        try {
          const local = await validateLocal(job, records.get(job.objectKey));
          const prior = done.get(job.objectKey);
          if (prior) {
            if (prior.bytes !== local.size || prior.md5 !== local.md5 || prior.sha256 !== local.sha256) {
              fail(`Progress checksum conflict: ${job.objectKey}`);
            }
          } else {
            const remoteBaseline = baselineMap.get(job.objectKey);
            let outcome;
            if (remoteBaseline) {
              baselineMatches(remoteBaseline, local, job.objectKey);
              outcome = 'baseline-reused';
            } else if (await inspectPublicObject(job, local)) {
              outcome = 'already-present';
            } else {
              outcome = await putObject(job, local);
            }
            done.set(job.objectKey, {
              outcome,
              bytes: local.size,
              md5: local.md5,
              sha256: local.sha256,
              verifiedAt: new Date().toISOString(),
            });
            addedThisRun++;
            if (addedThisRun % 200 === 0) await saveProgress(planInfo, done);
          }
          validated.add(job.objectKey);
          verifiedThisRun++;
          if (verifiedThisRun % 200 === 0) {
            console.log(`Verified ${verifiedThisRun} this run; confirmed progress ${done.size}/${expectedJobs}.`);
          }
        } catch (error) { fatal ??= error; }
      }
    }
    await Promise.all(Array.from({length: Math.min(concurrency, batch.length)}, worker));
    await saveProgress(planInfo, done);
    if (fatal) throw fatal;

    const status = summarizeManifest(planInfo, records);
    const verifiedTotal = planInfo.jobs.filter(job => records.get(job.objectKey)?.status === 'success'
      && validated.has(job.objectKey) && done.has(job.objectKey)).length;
    if (verifiedTotal === expectedJobs) {
      console.log(`Complete: all ${expectedJobs} generated objects are verified and recorded.`);
      return;
    }
    if (options.limit !== null) {
      console.log(`Probe ended: verified ${verifiedThisRun}; ${expectedJobs - verifiedTotal} planned objects remain; no full-plan success claimed.`);
      process.exitCode = 2;
      return;
    }
    if (manifest.finishedAt) {
      console.error(`Generator finished; ${expectedJobs - status.successful} plan entries are missing or failed. Re-run generation, then resume.`);
      process.exitCode = 2;
      return;
    }
    if (!options.watch) {
      console.log(`One-shot pass complete: ${verifiedThisRun} verified this run; ${expectedJobs - verifiedTotal} remain; generated ${status.successful}, failed ${status.failed}.`);
      process.exitCode = 2;
      return;
    }
    await sleep(watchIntervalMs);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof SafeFailure ? error.message : 'Upload stopped after an unexpected local error.');
    process.exitCode = 1;
  });
}
