import {createHash} from 'node:crypto';
import {readFile, readdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const account = 'e6c9391d2db1f8bd128045c3700fb766';
const bucket = 'kotoba-assets';
const cfg = readFileSync(resolve(root, '.xdg-config/.wrangler/config/default.toml'), 'utf8');
const token = cfg.match(/oauth_token = "([^"]+)/)?.[1];
if (!token) throw new Error('Wrangler OAuth token unavailable');
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects`;

const local = new Map();
for (const voice of ['a', 'c']) {
  const dir = resolve(root, `apps/web/public/audio/google/v1/${voice}`);
  for (const file of await readdir(dir)) if (/^[a-f0-9]{64}\.mp3$/.test(file)) {
    const body = await readFile(resolve(dir, file));
    local.set(`audio/google/v1/${voice}/${file}`, {size: body.length, etag: createHash('md5').update(body).digest('hex')});
  }
}

const remote = new Map();
let cursor;
do {
  const url = new URL(base);
  url.searchParams.set('prefix', 'audio/google/v1/');
  url.searchParams.set('per_page', '1000');
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, {headers: {Authorization: `Bearer ${token}`} });
  const payload = await response.json();
  if (!response.ok || payload.success !== true) throw new Error(`LIST HTTP ${response.status}`);
  // Cloudflare's R2 list endpoint has returned both `{objects, cursor}` and
  // a bare object array across API versions; accept either shape.
  const listing = Array.isArray(payload.result) ? payload.result : (payload.result?.objects ?? []);
  for (const object of listing) remote.set(object.key, {size: object.size, etag: String(object.etag ?? '').replaceAll('"', '').toLowerCase()});
  cursor = (Array.isArray(payload.result) ? payload.result_info?.cursor : payload.result?.cursor) || payload.result_info?.cursor || undefined;
} while (cursor);

const missing = [], wrongSize = [], wrongEtag = [], extra = [];
for (const [key, expected] of local) {
  const actual = remote.get(key);
  if (!actual) missing.push(key);
  else {
    if (actual.size !== expected.size) wrongSize.push({key, expected: expected.size, actual: actual.size});
    if (actual.etag !== expected.etag) wrongEtag.push({key, expected: expected.etag, actual: actual.etag});
  }
}
for (const key of remote.keys()) if (!local.has(key)) extra.push(key);
const totalBytes = [...remote.values()].reduce((sum, object) => sum + object.size, 0);
console.log(JSON.stringify({localCount: local.size, remoteCount: remote.size, localBytes: [...local.values()].reduce((sum, object) => sum + object.size, 0), remoteBytes: totalBytes, missing, wrongSize, wrongEtag, extra}, null, 2));
if (missing.length || wrongSize.length || wrongEtag.length) process.exitCode = 2;
