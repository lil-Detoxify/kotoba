import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Publish the reviewed archive as-is; a missing package leaves the download disabled.
export const extensionRelease = Object.freeze({
  version: '0.4.0',
  file: 'KotoBud-Extension-0.4.0.zip',
  checksumFile: 'KotoBud-Extension-0.4.0.sha256.txt',
  bytes: 4129359,
  sha256: '7c928829b4431e2a7d5066578edc6d592fdc9bd4df16f2111b0158c3b584a32c',
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
