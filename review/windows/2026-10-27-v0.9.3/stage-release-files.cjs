#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REVIEW_DIR = __dirname;
const REPO_ROOT = path.resolve(REVIEW_DIR, '../../..');
const RELEASE_DIR = path.join(REPO_ROOT, 'release');
const VERSION = '0.9.3';

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function requireRegularFile(filePath) {
  const stat = fs.lstatSync(filePath);
  assert(stat.isFile() && !stat.isSymbolicLink(), `Refusing non-file or symbolic link: ${filePath}`);
  return stat;
}

function preflightByteFile(filePath, contents) {
  if (!fs.existsSync(filePath)) return false;
  requireRegularFile(filePath);
  assert(fs.readFileSync(filePath).equals(contents), `Refusing to overwrite different file: ${filePath}`);
  return true;
}

async function preflightCopy(sourcePath, destinationPath, expected) {
  assert(fs.statSync(sourcePath).isFile(), `Missing source artifact: ${sourcePath}`);
  if (!fs.existsSync(destinationPath)) return false;
  const stat = requireRegularFile(destinationPath);
  assert.equal(stat.size, expected.bytes, `Existing release file has unexpected size: ${destinationPath}`);
  assert.equal(await hashFile(destinationPath), expected.sha256, `Refusing to overwrite different file: ${destinationPath}`);
  return true;
}

async function main() {
  const packagePath = path.join(REVIEW_DIR, 'package-verification.json');
  assert(fs.existsSync(packagePath), 'Run verify-package.cjs before staging release files.');
  const packageReport = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.equal(packageReport.result, 'passed');
  assert.equal(packageReport.appAsar.packageJson.version, VERSION);
  assert.equal(packageReport.web.uiVersion, VERSION);
  assert.equal(packageReport.uploaded, false);
  assert.equal(packageReport.published, false);

  const releaseStat = fs.lstatSync(RELEASE_DIR);
  assert(releaseStat.isDirectory() && !releaseStat.isSymbolicLink(), 'release/ must be a real directory.');
  const releasePrefix = path.resolve(REPO_ROOT) + path.sep;
  assert(path.resolve(RELEASE_DIR).startsWith(releasePrefix), 'Release destination escapes the repository.');

  const artifacts = packageReport.executables.map((artifact) => {
    const filename = path.basename(artifact.file);
    const sourcePath = path.join(REVIEW_DIR, 'pack', filename);
    const destinationPath = path.join(RELEASE_DIR, filename);
    assert(filename === `KotoBud-${VERSION}-Windows-x64-Setup.exe`
      || filename === `KotoBud-${VERSION}-Windows-x64-Portable.exe`, `Unexpected package filename: ${filename}`);
    return { ...artifact, filename, sourcePath, destinationPath };
  });
  assert.equal(artifacts.length, 2);

  const verificationFilename = `KotoBud-${VERSION}-Windows-x64-verification.json`;
  const sumsFilename = `SHA256SUMS-${VERSION}.txt`;
  const releaseManifest = {
    result: 'passed',
    verifiedOn: packageReport.verifiedOn,
    releaseStatus: 'preparedForRootUpload',
    uploaded: false,
    published: false,
    windowsVersion: VERSION,
    webVersion: VERSION,
    sourceVerificationReport: 'review/windows/2026-10-27-v0.9.3/package-verification.json',
    artifacts: artifacts.map(({ file, filename, bytes, sha256, headerHex, hasMzHeader }) => ({
      file: filename, bytes, sha256, headerHex, hasMzHeader,
    })),
    embeddedWeb: {
      fileCount: packageReport.web.sourceFileCount,
      bytes: packageReport.web.sourceBytes,
      mainAsset: packageReport.web.mainAsset,
      mainSha256: packageReport.web.expectedMainSha256,
      packagedTreeMatchesStageByteForByte: packageReport.web.relativeFileSetsMatch
        && packageReport.web.mismatches.length === 0,
    },
    appAsar: packageReport.appAsar,
    checks: packageReport.checks,
  };
  const verificationBytes = Buffer.from(`${JSON.stringify(releaseManifest, null, 2)}\n`, 'utf8');
  const sumsBytes = Buffer.from(artifacts.map(artifact => `${artifact.sha256}  ${artifact.filename}\n`).join(''), 'utf8');
  const verificationPath = path.join(RELEASE_DIR, verificationFilename);
  const sumsPath = path.join(RELEASE_DIR, sumsFilename);

  const alreadyExists = [];
  for (const artifact of artifacts) {
    if (await preflightCopy(artifact.sourcePath, artifact.destinationPath, artifact)) alreadyExists.push(artifact.filename);
  }
  if (preflightByteFile(verificationPath, verificationBytes)) alreadyExists.push(verificationFilename);
  if (preflightByteFile(sumsPath, sumsBytes)) alreadyExists.push(sumsFilename);

  for (const artifact of artifacts) {
    if (!fs.existsSync(artifact.destinationPath)) {
      fs.copyFileSync(artifact.sourcePath, artifact.destinationPath, fs.constants.COPYFILE_EXCL);
    }
  }
  if (!fs.existsSync(verificationPath)) fs.writeFileSync(verificationPath, verificationBytes, { flag: 'wx' });
  if (!fs.existsSync(sumsPath)) fs.writeFileSync(sumsPath, sumsBytes, { flag: 'wx' });

  const copied = [];
  for (const artifact of artifacts) {
    const stat = requireRegularFile(artifact.destinationPath);
    assert.equal(stat.size, artifact.bytes);
    assert.equal(await hashFile(artifact.destinationPath), artifact.sha256);
    copied.push({ file: artifact.filename, bytes: stat.size, sha256: artifact.sha256 });
  }
  requireRegularFile(verificationPath);
  requireRegularFile(sumsPath);
  console.log(JSON.stringify({
    releaseDirectory: 'release/',
    releaseStatus: 'preparedForRootUpload',
    copied,
    verificationManifest: verificationFilename,
    checksums: sumsFilename,
    alreadyIdentical: alreadyExists,
    uploaded: false,
    published: false,
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
