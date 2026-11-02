import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Publish the reviewed archive as-is; a missing package leaves the download disabled.
export const extensionRelease = Object.freeze({
  version: '0.3.0-beta.7',
  file: 'KotoBud-Extension-0.3.0-beta.7.zip',
  checksumFile: 'KotoBud-Extension-0.3.0-beta.7.sha256.txt',
  bytes: 2443255,
  sha256: 'c947a667fa1d5bd3fc5d2dfe7ffa1f3d1ebd5f2785712c3d9dca18f89c4ef1c8',
});

export function prepareExtensionDownload(targetDir) {
  const source = resolve(import.meta.dirname, '../apps/extension/release', extensionRelease.file);
  if (!existsSync(source)) return { ...extensionRelease, ready: false };
  const archive = readFileSync(source);
  const hash = createHash('sha256').update(archive).digest('hex');
  if (hash !== extensionRelease.sha256 || archive.length !== extensionRelease.bytes) {
    throw new Error('Extension archive differs from the reviewed ' + extensionRelease.version + ' package.');
  }
  const folder = resolve(targetDir, 'downloads');
  mkdirSync(folder, { recursive: true });
  copyFileSync(source, resolve(folder, extensionRelease.file));
  writeFileSync(resolve(folder, extensionRelease.checksumFile), `${hash}  ${extensionRelease.file}\n`, 'utf8');
  return { ...extensionRelease, ready: true };
}
