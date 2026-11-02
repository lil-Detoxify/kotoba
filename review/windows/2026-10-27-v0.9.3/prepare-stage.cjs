#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REVIEW_DIR = __dirname;
const REPO_ROOT = path.resolve(REVIEW_DIR, '../../..');
const STAGE = path.join(REVIEW_DIR, 'stage');
const DICTIONARY_SOURCE = path.join(REPO_ROOT, 'apps', 'web', 'public', 'dictionary');
const WINDOWS_VERSION = '0.9.3';
const WEB_VERSION = '0.9.3';
const TARGET_DATE = '2026-10-27';
const DICTIONARY_SHARDS = 512;

function option(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find(argument => argument.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeStagePath(relativePath) {
  const target = path.resolve(STAGE, ...relativePath.split('/'));
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

function copyTreeWithoutOverwrite(source, targetRelative, expectedFiles) {
  assert(fs.statSync(source).isDirectory(), `Missing source directory: ${source}`);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetRelativePath = path.posix.join(targetRelative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in source: ${sourcePath}`);
    if (entry.isDirectory()) {
      fs.mkdirSync(safeStagePath(targetRelativePath), { recursive: true });
      copyTreeWithoutOverwrite(sourcePath, targetRelativePath, expectedFiles);
    } else if (entry.isFile()) {
      expectedFiles.add(targetRelativePath);
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

function findMainAsset(appHtml, explicitAsset) {
  const scriptSources = [...appHtml.toString('utf8').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/giu)]
    .map(match => match[1])
    .filter(source => !/^https?:\/\//iu.test(source))
    .map(source => source.replaceAll('\\', '/').replace(/^\/+/, '').split(/[?#]/u)[0])
    .filter(source => source.startsWith('assets/') && source.endsWith('.js'));
  const candidates = [...new Set(scriptSources)];
  const mainCandidates = candidates.filter(source => /(^|\/)main-[^/]+\.js$/u.test(source));
  const normalizedExplicit = explicitAsset?.replaceAll('\\', '/').replace(/^\/+/, '');
  const main = normalizedExplicit || (mainCandidates.length === 1 ? mainCandidates[0] : candidates.length === 1 ? candidates[0] : undefined);
  assert(main, 'Could not uniquely identify the app.html main bundle; pass --main-asset=assets/<name>.js.');
  assert(candidates.includes(main), `The selected main bundle is not referenced by app.html: ${main}`);
  assert(!main.split('/').includes('..'), `Invalid main asset path: ${main}`);
  return main;
}

function requireSameFileSet(actualFiles, expectedFiles) {
  const actual = new Set(actualFiles);
  const expected = new Set(expectedFiles);
  const extras = actualFiles.filter(file => !expected.has(file));
  const missing = [...expected].filter(file => !actual.has(file));
  assert.deepEqual(extras, [], `Stage contains unexpected files: ${extras.join(', ')}`);
  assert.deepEqual(missing, [], `Stage is missing files: ${missing.join(', ')}`);
}

function main() {
  const frozenArg = option('frozen-web');
  const expectedMainSha256 = option('main-sha256')?.toLowerCase();
  const explicitMainAsset = option('main-asset');
  assert(frozenArg && path.isAbsolute(frozenArg), 'Pass an absolute --frozen-web directory.');
  assert(/^[a-f0-9]{64}$/u.test(expectedMainSha256 || ''), 'Pass the frozen main bundle hash with --main-sha256.');
  const FROZEN_WEB = path.resolve(frozenArg);
  assert(fs.statSync(FROZEN_WEB).isDirectory(), `Missing frozen Web source: ${FROZEN_WEB}`);
  assert(path.resolve(FROZEN_WEB) !== path.resolve(STAGE), 'Frozen Web source cannot be the candidate stage.');

  const windowsPackage = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'apps', 'windows', 'package.json'), 'utf8'));
  const webPackage = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'apps', 'web', 'package.json'), 'utf8'));
  assert.equal(windowsPackage.version, WINDOWS_VERSION, 'apps/windows package version must be 0.9.3 before staging.');
  assert.equal(webPackage.version, WEB_VERSION, 'apps/web package version must be 0.9.3 before staging.');

  const sourceApp = fs.readFileSync(path.join(FROZEN_WEB, 'app.html'));
  assert(sourceApp.includes(Buffer.from('id="app"')), 'Frozen app.html does not contain the application root.');
  const MAIN_ASSET = findMainAsset(sourceApp, explicitMainAsset);
  const mainPath = path.join(FROZEN_WEB, ...MAIN_ASSET.split('/'));
  assert.equal(sha256(fs.readFileSync(mainPath)), expectedMainSha256, 'Frozen production main bundle hash mismatch.');
  assert(sourceApp.includes(Buffer.from(`/${MAIN_ASSET}`)) || sourceApp.includes(Buffer.from(MAIN_ASSET)),
    'Frozen app.html does not load the selected main bundle.');

  fs.mkdirSync(STAGE, { recursive: true });
  const expectedFiles = new Set();
  for (const directory of ['assets', 'brand', 'data', 'dictionary', 'examples', 'pet']) {
    copyTreeWithoutOverwrite(path.join(FROZEN_WEB, directory), directory, expectedFiles);
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
    const relative = path.posix.join('dictionary', filename);
    const source = path.join(DICTIONARY_SOURCE, filename);
    assert(fs.statSync(source).isFile(), `Missing legacy dictionary shard: ${filename}`);
    expectedFiles.add(relative);
    writeWithoutOverwrite(safeStagePath(relative), fs.readFileSync(source));
  }

  for (const filename of ['manifest.json', 'icon.png']) {
    expectedFiles.add(filename);
    writeWithoutOverwrite(safeStagePath(filename), fs.readFileSync(path.join(FROZEN_WEB, filename)));
  }
  // Electron resolves '/' to index.html. Both entry paths use the frozen SPA app entry.
  for (const filename of ['app.html', 'index.html']) {
    expectedFiles.add(filename);
    writeWithoutOverwrite(safeStagePath(filename), sourceApp);
  }

  const files = collectFiles(STAGE);
  requireSameFileSet(files, expectedFiles);
  assert(files.includes(MAIN_ASSET), 'Staged main bundle is missing.');
  assert(!files.some(file => file.startsWith('audio/')), 'Google audio files must not be bundled in the Windows candidate.');
  const bytes = files.reduce((total, file) => total + fs.statSync(safeStagePath(file)).size, 0);
  const report = {
    date: TARGET_DATE,
    windowsVersion: WINDOWS_VERSION,
    webVersion: WEB_VERSION,
    frozenSource: path.relative(REPO_ROOT, FROZEN_WEB).split(path.sep).join('/'),
    stage: 'review/windows/2026-10-27-v0.9.3/stage/',
    fileCount: files.length,
    bytes,
    main: MAIN_ASSET,
    mainSha256: expectedMainSha256,
    applicationEntry: {
      source: `${path.relative(REPO_ROOT, FROZEN_WEB).split(path.sep).join('/')}/app.html`,
      stagedAppHtml: 'app.html',
      stagedIndexHtml: 'index.html',
      bytes: sourceApp.length,
      sha256: sha256(sourceApp),
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
