#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const REVIEW_DIR = __dirname;
const REPO_ROOT = path.resolve(REVIEW_DIR, '../../..');
const STAGE = path.join(REVIEW_DIR, 'stage');
const PACK = path.join(REVIEW_DIR, 'pack');
const TARGET_DATE = '2026-11-04';
const VERSION = '0.10.1';

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function collectRelativeFiles(root) {
  requireCheck(fs.statSync(root).isDirectory(), `Missing directory: ${root}`);
  const files = [];
  function walk(current, prefix = '') {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${fullPath}`);
      if (entry.isDirectory()) walk(fullPath, relative);
      else if (entry.isFile()) files.push(relative);
      else throw new Error(`Unexpected filesystem entry: ${fullPath}`);
    }
  }
  walk(root);
  return files.sort();
}

function compareTrees(expectedMainSha256) {
  const stageFiles = collectRelativeFiles(STAGE);
  const packagedRoot = path.join(PACK, 'win-unpacked', 'resources', 'web');
  const packagedFiles = collectRelativeFiles(packagedRoot);
  const stageSet = new Set(stageFiles);
  const packagedSet = new Set(packagedFiles);
  const missingFromPackage = stageFiles.filter(file => !packagedSet.has(file));
  const extraInPackage = packagedFiles.filter(file => !stageSet.has(file));
  const mismatches = [];
  let stageBytes = 0;
  let packagedBytes = 0;

  for (const relative of stageFiles) {
    const staged = fs.readFileSync(path.join(STAGE, ...relative.split('/')));
    stageBytes += staged.length;
    if (!packagedSet.has(relative)) continue;
    const packaged = fs.readFileSync(path.join(packagedRoot, ...relative.split('/')));
    packagedBytes += packaged.length;
    if (!staged.equals(packaged)) mismatches.push({ path: relative, stageBytes: staged.length, packagedBytes: packaged.length });
  }
  for (const relative of extraInPackage) packagedBytes += fs.statSync(path.join(packagedRoot, ...relative.split('/'))).size;

  requireCheck(packagedFiles.length === stageFiles.length, 'Packaged Web file count differs from the stage.');
  requireCheck(stageBytes === packagedBytes, 'Packaged Web byte count differs from the stage.');
  requireCheck(missingFromPackage.length === 0, 'Packaged Web tree is missing staged files.');
  requireCheck(extraInPackage.length === 0, 'Packaged Web tree has extra files.');
  requireCheck(mismatches.length === 0, 'Packaged Web files differ from the stage.');
  requireCheck(!stageFiles.some(file => file.startsWith('audio/')), 'The remote word audio library must remain outside the Windows package.');
  requireCheck(!packagedFiles.some(file => file.startsWith('audio/')), 'The remote word audio library was unexpectedly included.');

  const stageMetadata = JSON.parse(fs.readFileSync(path.join(REVIEW_DIR, 'stage-verification.json'), 'utf8'));
  const stageMainPath = path.join(STAGE, ...stageMetadata.main.split('/'));
  const packagedMainPath = path.join(packagedRoot, ...stageMetadata.main.split('/'));
  const stageMainSha256 = sha256(fs.readFileSync(stageMainPath));
  const packagedMainSha256 = sha256(fs.readFileSync(packagedMainPath));
  requireCheck(stageMainSha256 === expectedMainSha256, 'Staged main bundle SHA-256 mismatch.');
  requireCheck(packagedMainSha256 === expectedMainSha256, 'Packaged main bundle SHA-256 mismatch.');

  return {
    source: 'stage/',
    packaged: 'pack/win-unpacked/resources/web/',
    uiVersion: VERSION,
    sourceFileCount: stageFiles.length,
    packagedFileCount: packagedFiles.length,
    sourceBytes: stageBytes,
    packagedBytes,
    relativeFileSetsMatch: true,
    byteIdenticalFileCount: stageFiles.length,
    mismatches,
    missingFromPackage,
    extraInPackage,
    mainAsset: stageMetadata.main,
    sourceMainSha256: stageMainSha256,
    packagedMainSha256,
    expectedMainSha256,
  };
}

function readExecutableHeader(filePath) {
  const handle = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(2);
  try {
    const bytesRead = fs.readSync(handle, header, 0, header.length, 0);
    requireCheck(bytesRead === 2, `Incomplete EXE header: ${filePath}`);
  } finally {
    fs.closeSync(handle);
  }
  requireCheck(header.toString('ascii') === 'MZ', `Missing MZ header: ${filePath}`);
  return header.toString('hex');
}

async function inspectExecutable(name) {
  const filePath = path.join(PACK, name);
  const stat = fs.statSync(filePath);
  requireCheck(stat.isFile(), `${name} is not a regular file.`);
  return {
    file: `pack/${name}`,
    bytes: stat.size,
    sha256: await hashFile(filePath),
    headerHex: readExecutableHeader(filePath),
    hasMzHeader: true,
  };
}

function normalizeAsarName(name) {
  return name.replace(/\\/g, '/').replace(/^\/+/, '');
}

function inspectAsar() {
  const archivePath = path.join(PACK, 'win-unpacked', 'resources', 'app.asar');
  const archiveStat = fs.statSync(archivePath);
  const members = new Set(asar.listPackage(archivePath).map(normalizeAsarName));
  const sourcePackagePath = path.join(REPO_ROOT, 'apps', 'windows', 'package.json');
  const sourcePackageData = fs.readFileSync(sourcePackagePath);
  const archivePackageData = Buffer.from(asar.extractFile(archivePath, 'package.json'));
  const packageJson = JSON.parse(archivePackageData.toString('utf8'));
  const sourcePackage = JSON.parse(sourcePackageData.toString('utf8'));

  requireCheck(packageJson.version === VERSION, 'ASAR package version mismatch.');
  requireCheck(packageJson.main === 'main.cjs', 'ASAR main entry mismatch.');
  requireCheck(packageJson.version === sourcePackage.version, 'ASAR version differs from apps/windows/package.json.');
  requireCheck(packageJson.main === sourcePackage.main, 'ASAR entry differs from apps/windows/package.json.');
  requireCheck(archivePackageData.equals(sourcePackageData), 'ASAR package.json differs from source.');

  const comparedFiles = ['main.cjs', 'protocol.cjs', 'preload.cjs'].map(name => {
    requireCheck(members.has(name), `ASAR does not contain ${name}.`);
    const source = fs.readFileSync(path.join(REPO_ROOT, 'apps', 'windows', name));
    const packaged = Buffer.from(asar.extractFile(archivePath, name));
    requireCheck(source.equals(packaged), `${name} in ASAR differs from source.`);
    return {
      member: name,
      source: `apps/windows/${name}`,
      bytes: packaged.length,
      sourceSha256: sha256(source),
      asarSha256: sha256(packaged),
      byteIdentical: true,
    };
  });

  return {
    file: 'pack/win-unpacked/resources/app.asar',
    bytes: archiveStat.size,
    sha256: null,
    packageJson: { version: packageJson.version, main: packageJson.main, byteIdenticalToSource: true },
    sourceFiles: comparedFiles,
  };
}

function writeWithoutOverwrite(filePath, contents) {
  const expected = Buffer.isBuffer(contents) ? contents : Buffer.from(contents, 'utf8');
  if (fs.existsSync(filePath)) {
    const stat = fs.lstatSync(filePath);
    requireCheck(stat.isFile() && !stat.isSymbolicLink(), `Refusing to replace non-file: ${filePath}`);
    requireCheck(fs.readFileSync(filePath).equals(expected), `Refusing to overwrite different file: ${filePath}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, expected, { flag: 'wx' });
}

async function main() {
  const stagePath = path.join(REVIEW_DIR, 'stage-verification.json');
  requireCheck(fs.existsSync(stagePath), 'Missing stage-verification.json. Run prepare-stage.cjs first.');
  const stage = JSON.parse(fs.readFileSync(stagePath, 'utf8'));
  const expectedMainSha256 = stage.mainSha256;
  requireCheck(stage.date === TARGET_DATE, 'Stage date mismatch.');
  requireCheck(stage.windowsVersion === VERSION, 'Stage Windows version mismatch.');
  requireCheck(stage.webVersion === VERSION, 'Stage Web version mismatch.');
  requireCheck(stage.main && /^[a-f0-9]{64}$/u.test(expectedMainSha256 || ''), 'Stage main asset metadata is invalid.');
  requireCheck(stage.applicationEntry.stagedFilesByteIdentical, 'Stage entrypoints are not identical.');
  requireCheck(stage.legacyDictionary.shardCount === 512, 'Stage legacy dictionary shard count mismatch.');

  const stagedFiles = collectRelativeFiles(STAGE);
  const stagedBytes = stagedFiles.reduce((total, relative) => total + fs.statSync(path.join(STAGE, ...relative.split('/'))).size, 0);
  requireCheck(stagedFiles.length === stage.fileCount, 'Stage file count differs from its verification record.');
  requireCheck(stagedBytes === stage.bytes, 'Stage byte count differs from its verification record.');
  requireCheck(fs.readFileSync(path.join(STAGE, 'app.html')).equals(fs.readFileSync(path.join(STAGE, 'index.html'))),
    'Stage app.html and index.html differ.');
  const stagedShards = stagedFiles.filter(relative => /^dictionary\/\d+\.json$/u.test(relative));
  requireCheck(stagedShards.length === 512, 'Stage does not contain exactly 512 numeric legacy dictionary shards.');

  const setupName = `KotoBud-${VERSION}-Windows-x64-Setup.exe`;
  const portableName = `KotoBud-${VERSION}-Windows-x64-Portable.exe`;
  const setup = await inspectExecutable(setupName);
  const portable = await inspectExecutable(portableName);
  const web = compareTrees(expectedMainSha256);
  const appAsar = inspectAsar();
  appAsar.sha256 = await hashFile(path.join(PACK, 'win-unpacked', 'resources', 'app.asar'));
  const report = {
    result: 'passed',
    verifiedOn: TARGET_DATE,
    releaseStatus: 'localTestCandidateNotPublished',
    uploaded: false,
    published: false,
    executables: [setup, portable],
    web,
    appAsar,
    checks: {
      bothExecutablesHaveMzHeaders: true,
      webTreeMatchesStageByteForByte: true,
      expectedFrozenMainHashMatches: true,
      legacyDictionaryHas512Shards: true,
      remoteWordAudioLibraryNotBundled: true,
      asarVersionAndEntryFilesMatchSource: true,
      installerWasNotRun: true,
      uploadedOrPublished: false,
    },
  };
  const sums = `${setup.sha256}  ${setup.file}\n${portable.sha256}  ${portable.file}\n`;
  writeWithoutOverwrite(path.join(REVIEW_DIR, 'package-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeWithoutOverwrite(path.join(REVIEW_DIR, 'SHA256SUMS.txt'), sums);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
