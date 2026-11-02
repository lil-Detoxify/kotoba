import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const reviewRoot = path.join(repoRoot, 'review', 'windows');
const destination = path.join(reviewRoot, 'web');
const markerName = '.kotobud-web-stage.json';

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find(argument => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function dictionaryBucket(text) {
  let hash = 0;
  for (const character of text.normalize('NFKC')) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return hash % 512;
}

async function requirePath(candidate, kind) {
  const info = await stat(candidate).catch(() => null);
  assert(info, `Required ${kind} is missing: ${path.relative(repoRoot, candidate)}`);
  if (kind === 'directory') assert(info.isDirectory(), `Expected a directory: ${candidate}`);
  if (kind === 'file') assert(info.isFile(), `Expected a file: ${candidate}`);
}

async function summarize(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  let files = 0;
  let bytes = 0;
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await summarize(absolute);
      files += nested.files;
      bytes += nested.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += (await stat(absolute)).size;
    }
  }
  return { files, bytes };
}

async function main() {
  const sourceRoot = path.resolve(repoRoot, option('source', 'dist-cloudflare'));
  assert(isWithin(repoRoot, sourceRoot), 'The Web source must be inside this repository.');
  await requirePath(sourceRoot, 'directory');

  const rootPackage = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const webVersion = rootPackage.version;
  const appHtml = path.join(sourceRoot, 'app.html');
  const assetsDir = path.join(sourceRoot, 'assets');
  const booksIndex = path.join(sourceRoot, 'data', 'books', 'index.json');
  const oldDictionaryManifest = path.join(sourceRoot, 'dictionary', 'manifest.json');
  const publicDictionaryRoot = path.join(repoRoot, 'apps', 'web', 'public', 'dictionary');
  const publicDictionaryManifest = path.join(publicDictionaryRoot, 'manifest.json');
  const wikiRoot = path.join(sourceRoot, 'data', 'dictionaries', 'wiktionary-ja');

  await Promise.all([
    requirePath(appHtml, 'file'),
    requirePath(assetsDir, 'directory'),
    requirePath(booksIndex, 'file'),
    requirePath(oldDictionaryManifest, 'file'),
    requirePath(publicDictionaryManifest, 'file'),
    requirePath(wikiRoot, 'directory'),
  ]);

  const comparisonService = await readFile(path.join(repoRoot, 'apps', 'web', 'src', 'services', 'dictionary-comparison.ts'), 'utf8');
  const wikiVersion = comparisonService.match(/WIKTIONARY_VERSION\s*=\s*'([^']+)'/u)?.[1];
  assert(wikiVersion, 'Could not find the Web Wiktionary version.');
  const probeTerm = '日本';
  const oldBucket = dictionaryBucket(probeTerm);
  const wikiBucket = oldBucket % 256;
  const oldShard = path.join(publicDictionaryRoot, `${oldBucket}.json`);
  const wikiShard = path.join(wikiRoot, wikiVersion, `${wikiBucket}.json`);
  const wikiManifest = path.join(wikiRoot, wikiVersion, 'manifest.json');
  await Promise.all([
    requirePath(oldShard, 'file'),
    requirePath(wikiShard, 'file'),
    requirePath(wikiManifest, 'file'),
  ]);

  const oldData = JSON.parse(await readFile(oldShard, 'utf8'));
  const wikiData = JSON.parse(await readFile(wikiShard, 'utf8'));
  const oldManifest = JSON.parse(await readFile(publicDictionaryManifest, 'utf8'));
  const builtDictionaryManifest = JSON.parse(await readFile(oldDictionaryManifest, 'utf8'));
  assert.equal(builtDictionaryManifest.version, oldManifest.version,
    'The built dictionary metadata does not match the existing offline dictionary source.');
  assert(Array.isArray(oldData[probeTerm]) && oldData[probeTerm].length > 0,
    `The legacy dictionary shard ${oldBucket}.json does not contain ${probeTerm}.`);
  assert(Array.isArray(wikiData[probeTerm]) && wikiData[probeTerm].length > 0,
    `The Wiktionary shard ${wikiBucket}.json does not contain ${probeTerm}.`);

  const html = await readFile(appHtml);
  const mainAsset = (await readFile(appHtml, 'utf8')).match(/(?:src|href)="\/(assets\/main-[^"]+\.js)"/u)?.[1];
  assert(mainAsset, 'Could not identify the built Web main JavaScript asset in app.html.');
  const mainAssetPath = path.join(sourceRoot, mainAsset);
  await requirePath(mainAssetPath, 'file');

  await mkdir(reviewRoot, { recursive: true });
  const stageDir = await mkdtemp(path.join(reviewRoot, '.web-stage-'));
  let backupPath;
  try {
    const copyDirectory = async (name, required = false) => {
      const from = path.join(sourceRoot, name);
      const info = await stat(from).catch(() => null);
      if (!info) {
        assert(!required, `Required Web directory is missing: ${name}`);
        return;
      }
      assert(info.isDirectory(), `Expected Web directory: ${name}`);
      const filter = name === 'audio' ? candidate => {
        const relative = path.relative(from, candidate);
        return !relative.split(path.sep).some(part => part.toLowerCase() === 'google');
      } : undefined;
      await cp(from, path.join(stageDir, name), { recursive: true, filter });
    };

    for (const [name, required] of [
      ['assets', true],
      ['brand', false],
      ['data', true],
      ['dictionary', true],
      ['examples', false],
      ['pet', false],
      ['audio', false],
    ]) await copyDirectory(name, required);

    const dictionaryFiles = await readdir(publicDictionaryRoot, { withFileTypes: true });
    const numericShards = dictionaryFiles.filter(entry => entry.isFile() && /^\d+\.json$/u.test(entry.name));
    assert.equal(numericShards.length, oldManifest.shards,
      `Expected ${oldManifest.shards} legacy dictionary shards in apps/web/public/dictionary.`);
    for (const shard of numericShards) {
      await copyFile(path.join(publicDictionaryRoot, shard.name), path.join(stageDir, 'dictionary', shard.name));
    }

    await copyFile(appHtml, path.join(stageDir, 'app.html'));
    await copyFile(appHtml, path.join(stageDir, 'index.html'));
    for (const name of ['icon.png', 'manifest.json']) {
      const source = path.join(sourceRoot, name);
      if ((await stat(source).catch(() => null))?.isFile()) await copyFile(source, path.join(stageDir, name));
    }

    const stagedInfo = await summarize(stageDir);
    const appHash = createHash('sha256').update(html).digest('hex');
    const mainHash = createHash('sha256').update(await readFile(mainAssetPath)).digest('hex');
    const metadata = {
      kind: 'kotobud-windows-web-stage',
      schemaVersion: 1,
      webVersion,
      source: path.relative(repoRoot, sourceRoot).replaceAll(path.sep, '/'),
      appHtmlSha256: appHash,
      mainAsset: mainAsset.replaceAll(path.sep, '/'),
      mainAssetSha256: mainHash,
      dictionaryProbe: { term: probeTerm, legacyShard: `${oldBucket}.json`, wiktionaryVersion: wikiVersion, wiktionaryShard: `${wikiBucket}.json` },
      legacyDictionarySource: 'apps/web/public/dictionary/*.json',
      copiedFiles: stagedInfo.files,
      copiedBytes: stagedInfo.bytes,
      createdAt: new Date().toISOString(),
    };
    await writeFile(path.join(stageDir, markerName), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

    const destinationInfo = await lstat(destination).catch(() => null);
    if (destinationInfo) {
      assert(destinationInfo.isDirectory() && !destinationInfo.isSymbolicLink(),
        `Refusing to replace a non-directory or symlink at ${destination}.`);
      const ownerPath = path.join(destination, markerName);
      const existingOwner = JSON.parse(await readFile(ownerPath, 'utf8').catch(() => 'null'));
      assert(existingOwner?.kind === 'kotobud-windows-web-stage',
        `Refusing to replace unmarked content at ${destination}.`);
      backupPath = path.join(reviewRoot, `.web-backup-${Date.now()}`);
      await rename(destination, backupPath);
    }
    try {
      await rename(stageDir, destination);
    } catch (error) {
      if (backupPath) await rename(backupPath, destination).catch(() => {});
      throw error;
    }
    if (backupPath) await rm(backupPath, { recursive: true, force: false });

    console.log(JSON.stringify({ ...metadata, destination: path.relative(repoRoot, destination).replaceAll(path.sep, '/') }, null, 2));
  } catch (error) {
    await rm(stageDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

main().catch(error => {
  console.error(`[windows-web-stage] ${error?.stack || error}`);
  process.exitCode = 1;
});
