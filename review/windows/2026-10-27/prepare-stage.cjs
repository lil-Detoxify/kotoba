#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REVIEW_DIR = __dirname;
const REPO_ROOT = path.resolve(REVIEW_DIR, '../../..');
const FROZEN_WEB = path.resolve(REPO_ROOT, '..', 'kotobud-review', 'round55-2026-10-27', 'site-release');
const STAGE = path.join(REVIEW_DIR, 'stage');
const DICTIONARY_SOURCE = path.join(REPO_ROOT, 'apps', 'web', 'public', 'dictionary');
const WINDOWS_VERSION = '0.9.1-beta.1';
const WEB_VERSION = '0.9.1';
const MAIN_ASSET = 'assets/main-Bo62HrWV.js';
const MAIN_SHA256 = 'a3029460d50cec5249f3a0a70544cd7548c27adcb418bd4a287906eb11c7d575';
const DICTIONARY_SHARDS = 512;

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeStagePath(relativePath) {
  const target = path.resolve(STAGE, relativePath);
  const prefix = path.resolve(STAGE) + path.sep;
  assert(target.startsWith(prefix), `Stage path escapes its root: ${relativePath}`);
  return target;
}

function writeWithoutOverwrite(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    assert(stat.isFile() && !stat.isSymbolicLink(), `Refusing to replace a non-file: ${target}`);
    assert(fs.readFileSync(target).equals(bytes), `Existing candidate file differs; refusing to overwrite: ${target}`);
    return;
  }
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}

function copyTreeWithoutOverwrite(source, targetRelative) {
  assert(fs.statSync(source).isDirectory(), `Missing source directory: ${source}`);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetRelativePath = path.join(targetRelative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in source: ${sourcePath}`);
    if (entry.isDirectory()) {
      fs.mkdirSync(safeStagePath(targetRelativePath), { recursive: true });
      copyTreeWithoutOverwrite(sourcePath, targetRelativePath);
    } else if (entry.isFile()) {
      writeWithoutOverwrite(safeStagePath(targetRelativePath), fs.readFileSync(sourcePath));
    } else {
      throw new Error(`Unexpected filesystem entry in source: ${sourcePath}`);
    }
  }
}

function collectFiles(root) {
  const files = [];
  function walk(current, prefix = '') {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in stage: ${relative}`);
      if (entry.isDirectory()) walk(fullPath, relative);
      else if (entry.isFile()) files.push(relative);
      else throw new Error(`Unexpected filesystem entry in stage: ${relative}`);
    }
  }
  walk(root);
  return files.sort();
}

function main() {
  assert(fs.statSync(FROZEN_WEB).isDirectory(), `Missing frozen production Web source: ${FROZEN_WEB}`);
  const mainPath = path.join(FROZEN_WEB, ...MAIN_ASSET.split('/'));
  assert.equal(hash(fs.readFileSync(mainPath)), MAIN_SHA256, 'Frozen production main bundle hash mismatch.');

  const sourceApp = fs.readFileSync(path.join(FROZEN_WEB, 'app.html'));
  assert(sourceApp.includes(Buffer.from(`/${MAIN_ASSET}`)), 'Production app.html does not load the frozen main bundle.');
  assert(sourceApp.includes(Buffer.from('id="app"')), 'Production app.html does not contain the application root.');

  fs.mkdirSync(STAGE, { recursive: true });
  for (const directory of ['assets', 'brand', 'data', 'dictionary', 'examples', 'pet']) {
    copyTreeWithoutOverwrite(path.join(FROZEN_WEB, directory), directory);
  }

  const productionDictionaryManifestPath = path.join(FROZEN_WEB, 'dictionary', 'manifest.json');
  const fallbackDictionaryManifestPath = path.join(DICTIONARY_SOURCE, 'manifest.json');
  const productionDictionaryManifestBytes = fs.readFileSync(productionDictionaryManifestPath);
  const fallbackDictionaryManifestBytes = fs.readFileSync(fallbackDictionaryManifestPath);
  assert(productionDictionaryManifestBytes.equals(fallbackDictionaryManifestBytes), 'Legacy dictionary manifests differ.');
  const dictionaryManifest = JSON.parse(productionDictionaryManifestBytes.toString('utf8'));
  assert.equal(dictionaryManifest.shards, DICTIONARY_SHARDS, 'Unexpected legacy dictionary shard count.');
  for (let index = 0; index < DICTIONARY_SHARDS; index += 1) {
    const filename = `${index}.json`;
    const source = path.join(DICTIONARY_SOURCE, filename);
    assert(fs.statSync(source).isFile(), `Missing legacy dictionary shard: ${filename}`);
    writeWithoutOverwrite(safeStagePath(path.posix.join('dictionary', filename)), fs.readFileSync(source));
  }

  for (const filename of ['manifest.json', 'icon.png']) {
    writeWithoutOverwrite(safeStagePath(filename), fs.readFileSync(path.join(FROZEN_WEB, filename)));
  }
  // The packaged app protocol resolves '/' to index.html. Both entry paths use the
  // approved lightweight SPA entry from production, not the SEO landing page.
  writeWithoutOverwrite(safeStagePath('app.html'), sourceApp);
  writeWithoutOverwrite(safeStagePath('index.html'), sourceApp);

  const files = collectFiles(STAGE);
  assert(files.includes(MAIN_ASSET), 'Staged main bundle is missing.');
  assert(!files.some(file => file.startsWith('audio/')), 'Audio files must not be bundled in the Windows candidate.');
  const bytes = files.reduce((total, file) => total + fs.statSync(safeStagePath(file)).size, 0);
  const report = {
    date: '2026-10-27',
    windowsVersion: WINDOWS_VERSION,
    webVersion: WEB_VERSION,
    frozenSource: path.relative(REPO_ROOT, FROZEN_WEB).split(path.sep).join('/'),
    stage: 'review/windows/2026-10-27/stage/',
    fileCount: files.length,
    bytes,
    main: MAIN_ASSET,
    mainSha256: MAIN_SHA256,
    applicationEntry: {
      source: `${path.relative(REPO_ROOT, FROZEN_WEB).split(path.sep).join('/')}/app.html`,
      stagedAppHtml: 'app.html',
      stagedIndexHtml: 'index.html',
      bytes: sourceApp.length,
      sha256: hash(sourceApp),
      stagedFilesByteIdentical: true,
      seoHomepageCopied: false,
    },
    legacyDictionary: {
      source: 'apps/web/public/dictionary/',
      version: dictionaryManifest.version,
      shardCount: DICTIONARY_SHARDS,
      productionAndFallbackManifestsMatch: true,
    },
    audioGoogleBundled: false,
    sourceFilesCopiedByteIdentically: true,
  };
  writeWithoutOverwrite(path.join(REVIEW_DIR, 'stage-verification.json'), Buffer.from(`${JSON.stringify(report, null, 2)}\n`));
  console.log(JSON.stringify(report, null, 2));
}

main();
