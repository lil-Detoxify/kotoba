import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const review = resolve(root, '../kotobud-review/jlpt-audio-2026-10-05');
const baselineMode = process.argv.includes('--baseline');
const publicMode = process.argv.includes('--public');
const publicConcurrency = 10;
const expectedBookCounts = new Map([['jlpt-n5', 674], ['jlpt-n4', 630], ['jlpt-n3', 1659], ['jlpt-n2', 1778], ['jlpt-n1', 3068]]);
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const cfg = await readFile(resolve(root, '.xdg-config/.wrangler/config/default.toml'), 'utf8');
const token = cfg.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
if (!token) throw new Error('Wrangler OAuth unavailable.');
await mkdir(review, { recursive: true });
const remote = new Map();
async function listResponse(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
      if (response.status < 500 && response.status !== 429) return response;
    } catch { /* Read-only listings can safely retry transient transport failures. */ }
    await new Promise(done => setTimeout(done, 1000 * 2 ** attempt));
  }
  throw new Error('R2 listing unavailable after four attempts.');
}
let cursor;
do {
  const url = new URL('https://api.cloudflare.com/client/v4/accounts/e6c9391d2db1f8bd128045c3700fb766/r2/buckets/kotoba-assets/objects');
  url.searchParams.set('prefix', 'audio/google/v1/');
  url.searchParams.set('per_page', '1000');
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await listResponse(url);
  const payload = await response.json();
  if (!response.ok || payload.success !== true) throw new Error(`R2 LIST HTTP ${response.status}.`);
  const objects = Array.isArray(payload.result) ? payload.result : payload.result?.objects ?? [];
  for (const object of objects) remote.set(object.key, { key: object.key, size: object.size, etag: String(object.etag ?? '').replaceAll('"', '').toLowerCase() });
  cursor = payload.result_info?.cursor || (!Array.isArray(payload.result) && payload.result?.cursor) || undefined;
} while (cursor);
const listing = { checkedAt: new Date().toISOString(), complete: true, count: remote.size, objects: [...remote.values()] };
if (baselineMode) {
  await writeFile(resolve(review, 'r2-before.json'), JSON.stringify(listing, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ baselineRemoteObjects: remote.size }));
  process.exit(0);
}
await writeFile(resolve(review, 'r2-after.json'), JSON.stringify(listing, null, 2) + '\n');
const local = new Map();
for (const voice of ['a', 'c']) {
  const dir = resolve(root, `apps/web/public/audio/google/v1/${voice}`);
  for (const file of await readdir(dir)) if (/^[a-f0-9]{64}\.mp3$/.test(file)) {
    const bytes = await readFile(resolve(dir, file));
    local.set(`audio/google/v1/${voice}/${file}`, { size: bytes.length, md5: hash(bytes, 'md5'), sha256: hash(bytes) });
  }
}
const problems = [];
if (local.size !== 26824 || remote.size !== 26824) problems.push({ kind: 'object-count', expected: 26824, local: local.size, remote: remote.size });
for (const [key, expected] of local) {
  const actual = remote.get(key);
  if (!actual || actual.size !== expected.size || actual.etag !== expected.md5) problems.push({ kind: 'remote-mismatch', key, expected, actual });
}
const oldLocal = JSON.parse(await readFile(resolve(review, 'legacy-audio-baseline.json'), 'utf8'));
const oldRemote = JSON.parse(await readFile(resolve(review, 'r2-before.json'), 'utf8'));
const oldMap = JSON.parse(await readFile(resolve(review, 'google-audio-map-before.json'), 'utf8'));
const newMap = JSON.parse(await readFile(resolve(root, 'apps/web/src/google-audio-map.json'), 'utf8'));
for (const file of oldLocal.files) {
  const key = file.path.replace(/^apps\/web\/public\//, '');
  const current = local.get(key);
  if (!current || current.size !== file.size || current.sha256 !== file.sha256) problems.push({ kind: 'old-local-changed', key });
}
for (const object of oldRemote.objects) {
  const actual = remote.get(object.key);
  if (!actual || actual.size !== object.size || actual.etag !== object.etag) problems.push({ kind: 'old-remote-changed', key: object.key });
}
const mapped = new Map(newMap.entries.map(entry => [`${entry.term}\0${entry.reading}`, entry]));
for (const entry of oldMap.entries) {
  if (JSON.stringify(mapped.get(`${entry.term}\0${entry.reading}`)) !== JSON.stringify(entry)) problems.push({ kind: 'old-map-changed', term: entry.term, reading: entry.reading });
}
const books = JSON.parse(await readFile(resolve(root, 'data/wordbooks/jlpt-textbooks.json'), 'utf8')).books;
if (books.length !== 5 || new Set(books.map(book => book.id)).size !== 5) problems.push({ kind: 'book-count', expected: 5, actual: books.length });
const publicJobs = [];
const coverage = books.map(book => {
  const words = book.lessons.flatMap(lesson => lesson.words);
  if (words.length !== expectedBookCounts.get(book.id)) problems.push({ kind: 'book-word-count', book: book.id, expected: expectedBookCounts.get(book.id), actual: words.length });
  let female = 0, male = 0;
  for (const word of words) for (const voice of ['female', 'male']) {
    const entry = mapped.get(`${word.term}\0${word.reading}`);
    const key = entry?.[voice]?.replace(/^\//, '');
    if (key && local.has(key) && remote.has(key)) {
      if (voice === 'female') female++; else male++;
      publicJobs.push({ key, size: local.get(key).size, sha256: local.get(key).sha256, book: book.id, voice });
    } else problems.push({ kind: 'jlpt-uncovered', book: book.id, term: word.term, reading: word.reading, voice });
  }
  return { id: book.id, words: words.length, female, male };
});
if (publicJobs.length !== 15618) problems.push({ kind: 'public-url-count', expected: 15618, actual: publicJobs.length });
console.log(JSON.stringify({ phase: 'object-integrity', localObjects: local.size, remoteObjects: remote.size, problems: problems.length, examples: problems.slice(0, 3) }));
await writeFile(resolve(review, 'audio-object-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), localObjects: local.size, remoteObjects: remote.size,
  localBytes: [...local.values()].reduce((sum, row) => sum + row.size, 0), oldLocalObjects: oldLocal.files.length, oldRemoteObjects: oldRemote.objects.length, oldMapEntries: oldMap.entries.length,
  coverage, publicChecked: 0, publicTotal: publicJobs.length, problems: [...problems] }, null, 2) + '\n');
let publicChecked = 0;
const headLengthFallbacks = [];
if (publicMode) {
  let index = 0;
  async function worker() {
    while (index < publicJobs.length) {
      const job = publicJobs[index++];
      let okay = false, detail;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const response = await fetch(`https://staging.kotobud.com/${job.key}`, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
          const lengthHeader = response.headers.get('content-length');
          detail = { status: response.status, contentType: response.headers.get('content-type'), length: lengthHeader === null ? null : Number(lengthHeader) };
          okay = response.status === 200 && /audio\/mpeg/i.test(detail.contentType ?? '') && detail.length === job.size;
          if (!okay && response.status === 200 && /audio\/mpeg/i.test(detail.contentType ?? '')) {
            const full = await fetch(`https://staging.kotobud.com/${job.key}`, { signal: AbortSignal.timeout(20000) });
            const bytes = Buffer.from(await full.arrayBuffer());
            detail.get = { status: full.status, mime: full.headers.get('content-type'), bytes: bytes.length, sha256: hash(bytes) };
            okay = full.status === 200 && /audio\/mpeg/i.test(detail.get.mime ?? '') && bytes.length === job.size && detail.get.sha256 === job.sha256;
            if (okay) headLengthFallbacks.push({ key: job.key, headLength: detail.length, ...detail.get });
          }
          if (okay || ![429, 500, 502, 503, 504].includes(detail.get?.status ?? response.status)) break;
        } catch (error) { detail = { error: 'public HEAD network error', code: error?.cause?.code ?? error?.code ?? null }; }
        await new Promise(done => setTimeout(done, 1000 * 2 ** attempt));
      }
      publicChecked++;
      if (!okay) {
        const problem = { kind: 'public-unavailable', ...job, detail };
        problems.push(problem);
        if (problems.length <= 5) console.warn(JSON.stringify(problem));
      }
      if (publicChecked % 1000 === 0) {
        console.log(JSON.stringify({ publicChecked, total: publicJobs.length, problems: problems.length }));
        await writeFile(resolve(review, 'audio-public-progress.json'), JSON.stringify({ checkedAt: new Date().toISOString(), publicChecked, total: publicJobs.length, problems: [...problems] }, null, 2) + '\n');
      }
    }
  }
  await Promise.all(Array.from({ length: publicConcurrency }, worker));
}
const report = { checkedAt: new Date().toISOString(), localObjects: local.size, remoteObjects: remote.size,
  localBytes: [...local.values()].reduce((sum, row) => sum + row.size, 0),
  oldLocalObjects: oldLocal.files.length, oldRemoteObjects: oldRemote.objects.length, oldMapEntries: oldMap.entries.length,
  coverage, publicChecked, publicTotal: publicJobs.length, publicConcurrency: publicMode ? publicConcurrency : 0, headLengthFallbacks, problems };
await writeFile(resolve(review, publicMode ? 'audio-public-verification.json' : 'audio-object-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, problems: problems.length }));
if (problems.length) process.exitCode = 1;
