#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const REVIEW_DIR = __dirname;
const REPO_ROOT = path.resolve(REVIEW_DIR, '../../..');
const PACKAGE_DIR = path.join(REVIEW_DIR, 'packages');
const EXPECTED = {
  date: '2026-10-21',
  windowsVersion: '0.9.0-beta.2',
  webVersion: '0.9.0',
  webFileCount: 888,
  webBytes: 282957177,
  webMain: 'assets/main-HbacATkW.js',
  webMainSha256: 'b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295',
  setup: {
    name: 'KotoBud-0.9.0-beta.2-Windows-x64-Setup.exe',
    bytes: 183734913,
  },
  portable: {
    name: 'KotoBud-0.9.0-beta.2-Windows-x64-Portable.exe',
    bytes: 183502935,
  },
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

async function inspectExecutable(spec) {
  const filePath = path.join(PACKAGE_DIR, spec.name);
  const stat = fs.statSync(filePath);
  requireCheck(stat.isFile(), `${spec.name} is not a regular file.`);
  requireCheck(stat.size === spec.bytes, `${spec.name} size was ${stat.size}, expected ${spec.bytes}.`);

  const handle = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(2);
  try {
    const bytesRead = fs.readSync(handle, header, 0, header.length, 0);
    requireCheck(bytesRead === 2, `${spec.name} has an incomplete file header.`);
  } finally {
    fs.closeSync(handle);
  }

  requireCheck(header.toString('ascii') === 'MZ', `${spec.name} does not have an MZ header.`);
  return {
    file: `packages/${spec.name}`,
    bytes: stat.size,
    sha256: await hashFile(filePath),
    headerHex: header.toString('hex'),
    hasMzHeader: true,
  };
}

function collectRelativeFiles(root) {
  requireCheck(fs.statSync(root).isDirectory(), `Missing directory: ${root}`);
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Unexpected symbolic link in web tree: ${fullPath}`);
      }
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(path.relative(root, fullPath).split(path.sep).join('/'));
      } else {
        throw new Error(`Unexpected filesystem entry in web tree: ${fullPath}`);
      }
    }
  }

  walk(root);
  return files.sort();
}

function compareWebTrees() {
  const sourceRoot = path.join(REVIEW_DIR, 'web');
  const packagedRoot = path.join(PACKAGE_DIR, 'win-unpacked', 'resources', 'web');
  const sourceFiles = collectRelativeFiles(sourceRoot);
  const packagedFiles = collectRelativeFiles(packagedRoot);
  const sourceSet = new Set(sourceFiles);
  const packagedSet = new Set(packagedFiles);
  const missingFromPackage = sourceFiles.filter((name) => !packagedSet.has(name));
  const extraInPackage = packagedFiles.filter((name) => !sourceSet.has(name));
  const mismatches = [];
  let sourceBytes = 0;
  let packagedBytes = 0;

  for (const relativePath of sourceFiles) {
    const sourcePath = path.join(sourceRoot, ...relativePath.split('/'));
    const sourceData = fs.readFileSync(sourcePath);
    sourceBytes += sourceData.length;
    if (!packagedSet.has(relativePath)) continue;

    const packagedPath = path.join(packagedRoot, ...relativePath.split('/'));
    const packagedData = fs.readFileSync(packagedPath);
    packagedBytes += packagedData.length;
    if (!sourceData.equals(packagedData)) {
      mismatches.push({
        path: relativePath,
        sourceBytes: sourceData.length,
        packagedBytes: packagedData.length,
      });
    }
  }
  for (const relativePath of extraInPackage) {
    packagedBytes += fs.statSync(path.join(packagedRoot, ...relativePath.split('/'))).size;
  }

  requireCheck(sourceFiles.length === EXPECTED.webFileCount, `Source web file count was ${sourceFiles.length}.`);
  requireCheck(packagedFiles.length === EXPECTED.webFileCount, `Packaged web file count was ${packagedFiles.length}.`);
  requireCheck(sourceBytes === EXPECTED.webBytes, `Source web bytes were ${sourceBytes}.`);
  requireCheck(packagedBytes === EXPECTED.webBytes, `Packaged web bytes were ${packagedBytes}.`);
  requireCheck(missingFromPackage.length === 0, 'Packaged web tree is missing source files.');
  requireCheck(extraInPackage.length === 0, 'Packaged web tree has extra files.');
  requireCheck(mismatches.length === 0, 'Packaged web files differ from source.');

  const sourceMainPath = path.join(sourceRoot, ...EXPECTED.webMain.split('/'));
  const packagedMainPath = path.join(packagedRoot, ...EXPECTED.webMain.split('/'));
  const sourceMainSha256 = sha256(fs.readFileSync(sourceMainPath));
  const packagedMainSha256 = sha256(fs.readFileSync(packagedMainPath));
  requireCheck(sourceMainSha256 === EXPECTED.webMainSha256, 'Source main asset SHA-256 mismatch.');
  requireCheck(packagedMainSha256 === EXPECTED.webMainSha256, 'Packaged main asset SHA-256 mismatch.');

  return {
    source: 'web/',
    packaged: 'packages/win-unpacked/resources/web/',
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
    mainAsset: EXPECTED.webMain,
    sourceMainSha256,
    packagedMainSha256,
    expectedMainSha256: EXPECTED.webMainSha256,
  };
}

function normalizeAsarName(name) {
  return name.replace(/\\/g, '/').replace(/^\/+/, '');
}

function inspectAsar() {
  const archivePath = path.join(PACKAGE_DIR, 'win-unpacked', 'resources', 'app.asar');
  const archiveStat = fs.statSync(archivePath);
  requireCheck(archiveStat.isFile(), 'app.asar is not a regular file.');

  const members = new Set(asar.listPackage(archivePath).map(normalizeAsarName));
  const packageJsonData = Buffer.from(asar.extractFile(archivePath, 'package.json'));
  const packageJson = JSON.parse(packageJsonData.toString('utf8'));
  const sourcePackagePath = path.join(REPO_ROOT, 'apps', 'windows', 'package.json');
  const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, 'utf8'));

  requireCheck(packageJson.version === EXPECTED.windowsVersion, 'app.asar package.json version mismatch.');
  requireCheck(packageJson.main === 'main.cjs', 'app.asar main entry mismatch.');
  requireCheck(packageJson.version === sourcePackage.version, 'app.asar version differs from apps/windows source.');
  requireCheck(packageJson.main === sourcePackage.main, 'app.asar main entry differs from apps/windows source.');

  const sourceFiles = ['main.cjs', 'protocol.cjs', 'preload.cjs'];
  const comparedFiles = sourceFiles.map((name) => {
    requireCheck(members.has(name), `app.asar does not contain ${name}.`);
    const sourcePath = path.join(REPO_ROOT, 'apps', 'windows', name);
    const sourceData = fs.readFileSync(sourcePath);
    const archiveData = Buffer.from(asar.extractFile(archivePath, name));
    requireCheck(sourceData.equals(archiveData), `${name} in app.asar differs from apps/windows source.`);
    return {
      member: name,
      source: `apps/windows/${name}`,
      bytes: archiveData.length,
      sourceSha256: sha256(sourceData),
      asarSha256: sha256(archiveData),
      byteIdentical: true,
    };
  });

  const sourcePackageData = fs.readFileSync(sourcePackagePath);
  requireCheck(packageJsonData.equals(sourcePackageData), 'app.asar package.json differs from apps/windows/package.json.');

  return {
    file: 'packages/win-unpacked/resources/app.asar',
    bytes: archiveStat.size,
    sha256: null,
    packageJson: {
      version: packageJson.version,
      main: packageJson.main,
      byteIdenticalToSource: true,
    },
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
  requireCheck(fs.existsSync(path.join(REVIEW_DIR, 'stage-verification.json')), 'Missing stage-verification.json.');
  const stage = JSON.parse(fs.readFileSync(path.join(REVIEW_DIR, 'stage-verification.json'), 'utf8'));
  requireCheck(stage.date === EXPECTED.date, 'Stage verification date mismatch.');
  requireCheck(stage.windowsVersion === EXPECTED.windowsVersion, 'Stage Windows version mismatch.');
  requireCheck(stage.webVersion === EXPECTED.webVersion, 'Stage Web UI version mismatch.');
  requireCheck(stage.main === EXPECTED.webMain, 'Stage main asset name mismatch.');
  requireCheck(stage.mainSha256 === EXPECTED.webMainSha256, 'Stage main asset hash record mismatch.');

  const setup = await inspectExecutable(EXPECTED.setup);
  const portable = await inspectExecutable(EXPECTED.portable);
  const web = compareWebTrees();
  const appAsar = inspectAsar();

  const report = {
    result: 'passed',
    verifiedOn: EXPECTED.date,
    releaseStatus: 'localOnly',
    uploaded: false,
    published: false,
    executables: [setup, portable],
    web,
    appAsar,
    checks: {
      executableSizeAndSha256Recorded: true,
      bothExecutablesHaveMzHeaders: true,
      webRelativeFileSetsAndBytesMatch: true,
      expectedWebMainHashAndUiVersionMatch: true,
      asarVersionAndEntryFilesMatchSource: true,
      installerWasNotRun: true,
    },
  };
  appAsar.sha256 = await hashFile(path.join(PACKAGE_DIR, 'win-unpacked', 'resources', 'app.asar'));

  const sums = [
    `${setup.sha256}  ${setup.file}`,
    `${portable.sha256}  ${portable.file}`,
    '',
  ].join('\n');

  writeWithoutOverwrite(path.join(REVIEW_DIR, 'package-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeWithoutOverwrite(path.join(REVIEW_DIR, 'SHA256SUMS.txt'), sums);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
