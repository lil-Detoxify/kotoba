const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const directory = __dirname;
const source = path.resolve(directory, '../web');
const destination = path.join(directory, 'web');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const metadata = JSON.parse(fs.readFileSync(path.join(source, '.kotobud-web-stage.json')));
assert.equal(metadata.webVersion, '0.9.0');
assert.equal(hash(fs.readFileSync(path.join(source, metadata.mainAsset))), 'b175c060f3e0bda7c6b74ad46cd2a1bc5cae148c045056d700849b7df7906295');
assert(fs.readFileSync(path.join(source, 'app.html')).equals(fs.readFileSync(path.join(source, 'index.html'))));
const files = [];
function collect(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) collect(path.join(directory, entry.name), relative);
    else if (entry.isFile()) files.push(relative);
    else throw new Error('Unexpected staged entry: ' + relative);
  }
}
collect(source);
assert.equal(files.length, 888);
fs.mkdirSync(destination, { recursive: true });
for (const relative of files) {
  const target = path.join(destination, relative); const original = fs.readFileSync(path.join(source, relative));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) assert(fs.readFileSync(target).equals(original), 'Existing stage changed: ' + relative);
  else fs.writeFileSync(target, original);
}
const report = { date: '2026-10-21', windowsVersion: '0.9.0-beta.2', webVersion: '0.9.0',
  source: path.relative(path.resolve(directory, '../../..'), source), fileCount: files.length,
  bytes: files.reduce((sum, relative) => sum + fs.statSync(path.join(source, relative)).size, 0),
  main: metadata.mainAsset, mainSha256: metadata.mainAssetSha256, sourceFilesByteIdentical: true,
  approvedProductionAppRetained: true, noNewWebBuild: true };
fs.writeFileSync(path.join(directory, 'stage-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
