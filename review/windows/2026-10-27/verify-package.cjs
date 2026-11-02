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
const EXPECTED = {
  date: '2026-10-27',
  windowsVersion: '0.9.1-beta.1',
  webVersion: '0.9.1',
  main: 'assets/main-Bo62HrWV.js',
  mainSha256: 'a3029460d50cec5249f3a0a70544cd7548c27adcb418bd4a287906eb11c7d575',
};

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

function compareTrees() {
  const sourceFiles = collectRelativeFiles(STAGE);
  const packagedRoot = path.join(PACK, 'win-unpacked', 'resources', 'web');
  const packagedFiles = collectRelativeFiles(packagedRoot);
  const sourceSet = new Set(sourceFiles);
  const packagedSet = new Set(packagedFiles);
  const missingFromPackage = sourceFiles.filter(file => !packagedSet.has(file));
  const extraInPackage = packagedFiles.filter(file => !sourceSet.has(file));
  const mismatches = [];
  let sourceBytes = 0;
  let packagedBytes = 0;

  for (const relative of sourceFiles) {
    const source = fs.readFileSync(path.join(STAGE, ...relative.split('/')));
    sourceBytes += source.length;
    if (!packagedSet.has(relative)) continue;
    const packaged = fs.readFileSync(path.join(packagedRoot, ...relative.split('/')));
    packagedBytes += packaged.length;
    if (!source.equals(packaged)) mismatches.push({ path: relative, sourceBytes: source.length, packagedBytes: packaged.length });
  }
  for (const relative of extraInPackage) {
    packagedBytes += fs.statSync(path.join(packagedRoot, ...relative.split('/'))).size;
  }

  requireCheck(packagedFiles.length === sourceFiles.length, 'Packaged Web file count differs from the stage.');
  requireCheck(sourceBytes === packagedBytes, 'Packaged Web byte count differs from the stage.');
  requireCheck(missingFromPackage.length === 0, 'Packaged Web tree is missing staged files.');
  requireCheck(extraInPackage.length === 0, 'Packaged Web tree has extra files.');
  requireCheck(mismatches.length === 0, 'Packaged Web files differ from the stage.');
  requireCheck(!sourceFiles.some(file => file.startsWith('audio/')), 'Google audio must remain outside the Windows package.');
  requireCheck(!packagedFiles.some(file => file.startsWith('audio/')), 'Packaged Google audio was unexpectedly included.');

  return {
    source: 'stage/',
    packaged: 'pack/win-unpacked/resources/web/',
    uiVersion: EXPECTED.webVersion,
    sourceFileCount: sourceFiles.length,
    packagedFileCount: packagedFiles.length,
    sourceBytes,
    packagedBytes,
    relativeFileSetsMatch: true,
    byteIdenticalFileCount: sourceFiles.length,
    mismatches,
    missingFromPackage,
    extraInPackage,
    mainAsset: EXPECTED.main,
    sourceMainSha256: sha256(fs.readFileSync(path.join(STAGE, ...EXPECTED.main.split('/')))),
    packagedMainSha256: sha256(fs.readFileSync(path.join(packagedRoot, ...EXPECTED.main.split('/')))),
    expectedMainSha256: EXPECTED.mainSha256,
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

  requireCheck(packageJson.version === EXPECTED.windowsVersion, 'ASAR package version mismatch.');
  requireCheck(packageJson.main === 'main.cjs', 'ASAR main entry mismatch.');
  requireCheck(packageJson.version === sourcePackage.version, 'ASAR version differs from apps/windows/package.json.');
  requireCheck(packageJson.main === sourcePackage.main, 'ASAR entry differs from apps/windows/package.json.');
  requireCheck(archivePackageData.equals(sourcePackageData), 'ASAR package.json differs from source.');

  const sourceFiles = ['main.cjs', 'protocol.cjs', 'preload.cjs'];
  const comparedFiles = sourceFiles.map(name => {
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
    requireCheck(fs.statSync(filePath).isFile(), `Refusing to replace non-file: ${filePath}`);
    requireCheck(fs.readFileSync(filePath).equals(expected), `Refusing to overwrite different file: ${filePath}`);
    return;
  }
  fs.writeFileSync(filePath, expected, { flag: 'wx' });
}

async function main() {
  const stagePath = path.join(REVIEW_DIR, 'stage-verification.json');
  requireCheck(fs.existsSync(stagePath), 'Missing stage-verification.json.');
  const stage = JSON.parse(fs.readFileSync(stagePath, 'utf8'));
  requireCheck(stage.date === EXPECTED.date, 'Stage date mismatch.');
  requireCheck(stage.windowsVersion === EXPECTED.windowsVersion, 'Stage Windows version mismatch.');
  requireCheck(stage.webVersion === EXPECTED.webVersion, 'Stage Web version mismatch.');
  requireCheck(stage.main === EXPECTED.main, 'Stage main asset name mismatch.');
  requireCheck(stage.mainSha256 === EXPECTED.mainSha256, 'Stage main asset hash mismatch.');
  requireCheck(stage.applicationEntry.stagedFilesByteIdentical, 'Stage entrypoints are not identical.');
  requireCheck(stage.legacyDictionary.shardCount === 512, 'Stage legacy dictionary shard count mismatch.');
  const stagedFiles = collectRelativeFiles(STAGE);
  const stagedBytes = stagedFiles.reduce((total, relative) => total + fs.statSync(path.join(STAGE, ...relative.split('/'))).size, 0);
  requireCheck(stagedFiles.length === stage.fileCount, 'Stage file count differs from its verification record.');
  requireCheck(stagedBytes === stage.bytes, 'Stage byte count differs from its verification record.');
  requireCheck(fs.readFileSync(path.join(STAGE, 'app.html')).equals(fs.readFileSync(path.join(STAGE, 'index.html'))), 'Stage app.html and index.html differ.');
  const stagedShards = stagedFiles.filter(relative => /^dictionary\/\d+\.json$/u.test(relative));
  requireCheck(stagedShards.length === 512, 'Staged legacy dictionary does not contain exactly 512 numeric shards.');

  const setupName = `KotoBud-${EXPECTED.windowsVersion}-Windows-x64-Setup.exe`;
  const portableName = `KotoBud-${EXPECTED.windowsVersion}-Windows-x64-Portable.exe`;
  const setup = await inspectExecutable(setupName);
  const portable = await inspectExecutable(portableName);
  const web = compareTrees();
  requireCheck(web.sourceMainSha256 === EXPECTED.mainSha256, 'Staged main bundle SHA-256 mismatch.');
  requireCheck(web.packagedMainSha256 === EXPECTED.mainSha256, 'Packaged main bundle SHA-256 mismatch.');

  const appAsar = inspectAsar();
  appAsar.sha256 = await hashFile(path.join(PACK, 'win-unpacked', 'resources', 'app.asar'));
  const report = {
    result: 'passed',
    verifiedOn: EXPECTED.date,
    releaseStatus: 'localTestCandidateNotPublished',
    uploaded: false,
    published: false,
    executables: [setup, portable],
    web,
    appAsar,
    checks: {
      bothExecutablesHaveMzHeaders: true,
      webTreeMatchesStageByteForByte: true,
      expectedProductionMainHashMatches: true,
      legacyDictionaryHas512Shards: true,
      googleAudioNotBundled: true,
      asarVersionAndEntryFilesMatchSource: true,
      installerWasNotRun: true,
      portableWasNotRun: true,
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
