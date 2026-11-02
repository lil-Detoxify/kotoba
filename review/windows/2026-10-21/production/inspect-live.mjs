import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const version = '0.9.0-beta.2';
const report = JSON.parse(readFileSync(path.resolve(folder, '../package-verification.json'), 'utf8'));
const files = report.executables.map(file => ({ ...file, name: path.basename(file.file) }));
const mode = process.argv[2] || 'inspect';
const origin = process.argv[3] || 'https://kotobud.com';
const result = { checkedAt: new Date().toISOString(), version, origin, mode };

if (mode === 'inspect' || mode === 'objects') {
  const config = readFileSync(path.resolve(root, '.xdg-config/.wrangler/config/default.toml'), 'utf8');
  const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
  if (!token) throw new Error('Cloudflare authorization is unavailable.');
  const prefix = `releases/${version}/`;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/e6c9391d2db1f8bd128045c3700fb766/r2/buckets/kotoba-assets/objects?prefix=${encodeURIComponent(prefix)}`, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45000),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(`R2 listing failed (${response.status}): ${JSON.stringify(body.errors)}`);
  const listed = Array.isArray(body.result) ? body.result : body.result?.objects;
  if (!Array.isArray(listed)) throw new Error('Unexpected R2 object-list format.');
  result.objects = listed.map(item => ({ key: item.key ?? item.name, size: item.size, etag: item.etag }));
  if (mode === 'objects') {
    for (const file of files) {
      if (!result.objects.some(item => item.key === prefix + file.name && Number(item.size) === file.bytes)) throw new Error(`Remote object is missing or has wrong size: ${file.name}`);
    }
    if (!result.objects.some(item => item.key === prefix + `SHA256SUMS-${version}.txt`)) throw new Error('Remote checksum file is missing.');
  }
}

if (['inspect', 'preview', 'verify'].includes(mode)) {
  const download = await fetch(`${origin}/download`, { signal: AbortSignal.timeout(45000) });
  const html = await download.text();
  result.download = { status: download.status, latestWindowsLink: html.includes(`/downloads/KotoBud-${version}-Windows-x64-Setup.exe`), latestExtensionLink: html.includes('/downloads/KotoBud-Extension-0.3.0-beta.7.zip') };
  const main = await fetch(`${origin}/assets/main-HbacATkW.js`, { signal: AbortSignal.timeout(45000) });
  result.main = { status: main.status, sha256: createHash('sha256').update(Buffer.from(await main.arrayBuffer())).digest('hex') };
  if (mode === 'preview' || mode === 'verify') {
    if (download.status !== 200 || !result.download.latestWindowsLink || !result.download.latestExtensionLink) throw new Error('Public download page is not current.');
    if (result.main.sha256 !== report.web.expectedMainSha256) throw new Error('Approved Web application bundle changed.');
    const checksumResponse = await fetch(`${origin}/downloads/SHA256SUMS-${version}.txt`, { signal: AbortSignal.timeout(45000) });
    const checksum = await checksumResponse.text();
    result.checksum = { status: checksumResponse.status, matches: files.every(file => checksum.includes(`${file.sha256}  ${file.name}`)) };
    if (checksumResponse.status !== 200 || !result.checksum.matches) throw new Error('Published checksums differ.');
    result.files = [];
    for (const file of files) {
      const url = `${origin}/downloads/${file.name}`;
      const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(45000) });
      const entry = { name: file.name, headStatus: head.status, contentLength: head.headers.get('content-length'), contentType: head.headers.get('content-type'), disposition: head.headers.get('content-disposition') };
      if (head.status !== 200 || Number(entry.contentLength) !== file.bytes || !entry.disposition?.includes(file.name)) throw new Error(`Download HEAD differs: ${JSON.stringify(entry)}`);
      if (mode === 'preview') { result.files.push(entry); continue; }
      const response = await fetch(url, { signal: AbortSignal.timeout(900000) });
      if (!response.ok) throw new Error(`Download GET failed: ${file.name} (${response.status})`);
      const digest = createHash('sha256');
      let bytes = 0;
      let progress = 0;
      for await (const chunk of response.body) {
        digest.update(chunk); bytes += chunk.length;
        if (bytes - progress >= 32 * 1024 * 1024) { console.log(`Verify ${file.name}: ${Math.round(bytes / file.bytes * 100)}%`); progress = bytes; }
      }
      Object.assign(entry, { getStatus: response.status, bytes, sha256: digest.digest('hex') });
      if (bytes !== file.bytes || entry.sha256 !== file.sha256) throw new Error(`Public download hash differs: ${file.name}`);
      result.files.push(entry);
    }
    const changelog = await fetch(`${origin}/changelog`, { signal: AbortSignal.timeout(45000) });
    result.changelog = { status: changelog.status, currentVersionPresent: (await changelog.text()).includes(version) };
    if (changelog.status !== 200 || !result.changelog.currentVersionPresent) throw new Error('Public changelog was not updated.');
  }
}

writeFileSync(path.resolve(folder, `${mode}-${new URL(origin).hostname}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
