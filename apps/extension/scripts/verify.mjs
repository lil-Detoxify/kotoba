import { readFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { init, parse } from 'es-module-lexer';
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(app, 'dist');
const root = resolve(app, '../..');
const info = JSON.parse(await readFile(resolve(app, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, info.version.split('-')[0]);
assert.equal(manifest.version_name, info.version);
assert.deepEqual(manifest.permissions, ['sidePanel', 'contextMenus', 'storage']);
const stagingSentenceData = process.env.VITE_SENTENCE_AUDIO_DATA_ORIGIN === 'https://staging.kotobud.com';
assert.deepEqual(manifest.host_permissions, ['https://kotobud.com/*', ...(stagingSentenceData ? ['https://staging.kotobud.com/*'] : [])]);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.chrome_url_overrides, undefined);
assert.equal(manifest.background.type, 'module');
await init;
const checkedWorkerModules = new Set();
async function checkWorkerGraph(path) {
  if (checkedWorkerModules.has(path)) return;
  checkedWorkerModules.add(path);
  const code = await readFile(path, 'utf8');
  const [imports] = parse(code);
  for (const item of imports) {
    assert.ok(item.d < 0, `MV3 service worker cannot use dynamic import: ${path}`);
    if (item.d !== -1) continue; // import.meta is allowed.
    assert.ok(item.n?.startsWith('./') || item.n?.startsWith('../'), 'Worker imports must be packaged local modules');
    const dependency = resolve(dirname(path), item.n);
    assert.ok(dependency.startsWith(dist + sep), 'Worker imports must stay within dist');
    await checkWorkerGraph(dependency);
  }
}
await checkWorkerGraph(resolve(dist, manifest.background.service_worker));
const csp = manifest.content_security_policy.extension_pages;
assert.ok(!/unsafe-eval|http:/.test(csp));
assert.ok(csp.includes("script-src 'self';") && csp.includes(`connect-src 'self' https://kotobud.com${stagingSentenceData ? ' https://staging.kotobud.com' : ''};`));
assert.ok(csp.includes("media-src 'self' https://kotobud.com;"));
const coverScenes = ['town', 'train', 'cafe', 'bridge', 'table', 'museum', 'garden'];
const localPaths = [manifest.background.service_worker, manifest.side_panel.default_path, ...Object.values(manifest.icons), manifest.action.default_icon, 'data/catalog.json', 'pet/leaf-cat.png', ...coverScenes.map(scene => `covers/${scene}.png`), 'DATA-SOURCES.txt', 'THIRD-PARTY-NOTICES.txt', 'INSTALL.txt'];
for (const path of localPaths) { assert.ok(!path.includes('..') && !path.includes('://')); assert.ok((await stat(resolve(dist, path))).size > 0); }
for (const entry of ['sidepanel.html', 'learning.html']) {
const html = await readFile(resolve(dist, entry), 'utf8');
assert.ok(!/<script[^>]+src=["']https?:|<script(?![^>]*src=)[^>]*>\s*\S/i.test(html), 'Executable scripts must be local external files');
for (const [, path] of html.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)) assert.ok((await stat(resolve(dist, path))).size > 0);
}
const catalog = JSON.parse(await readFile(resolve(dist, 'data/catalog.json'), 'utf8'));
assert.ok(catalog.length > 0 && catalog.every(word => word.source === 'textbook' && word.id && word.reading && word.meaning));
assert.equal(new Set(catalog.map(word => word.id)).size, catalog.length);
const legacyBookIds = [
  'biaori-beginner-upper', 'biaori-beginner-lower',
  'biaori-intermediate-upper', 'biaori-intermediate-lower',
  'biaori-advanced-upper', 'biaori-advanced-lower',
];
const jlptBookWordCounts = {
  'jlpt-n5': 674, 'jlpt-n4': 630, 'jlpt-n3': 1659, 'jlpt-n2': 1778, 'jlpt-n1': 3068,
};
const expectedBookWordCounts = {
  'biaori-beginner-upper': 1077, 'biaori-beginner-lower': 1073,
  'biaori-intermediate-upper': 1748, 'biaori-intermediate-lower': 1907,
  'biaori-advanced-upper': 1806, 'biaori-advanced-lower': 1506,
  ...jlptBookWordCounts,
};
const expectedBookIds = [...legacyBookIds, ...Object.keys(jlptBookWordCounts)];
const bookIndex = JSON.parse(await readFile(resolve(root, 'apps/web/public/data/books/index.json'), 'utf8'));
assert.deepEqual(bookIndex.books.map(book => book.id), expectedBookIds, 'Only the six existing books and five available JLPT books may be packaged');

const sourceFields = [
  'partOfSpeech', 'accent', 'example', 'exampleTranslation', 'audioUrl', 'audioTerm', 'rawTerm',
  'note', 'definitionJa', 'definitionZh', 'exampleReading', 'senses',
];
const expectedWords = [];
const countsByBook = new Map();
for (const meta of bookIndex.books) {
  const book = JSON.parse(await readFile(resolve(root, `apps/web/public/data/books/${meta.id}.json`), 'utf8'));
  assert.equal(book.wordCount, expectedBookWordCounts[meta.id], `${meta.id} source count`);
  assert.equal(meta.wordCount, expectedBookWordCounts[meta.id], `${meta.id} index count`);
  let bookCount = 0;
  for (const lesson of book.lessons) {
    for (const [index, row] of lesson.words.entries()) {
      let id;
      if (Object.hasOwn(row, 'sourceId')) {
        assert.ok(!legacyBookIds.includes(book.id), 'Legacy textbook identity must remain sourceIndex based');
        assert.match(row.sourceId, /^[a-z0-9][a-z0-9_-]{0,63}$/);
        id = `${book.id}-w-${row.sourceId}`;
      } else {
        assert.ok(!book.id.startsWith('jlpt-'), `${book.id} words require stable sourceId values`);
        const sourceIndex = row.sourceIndex ?? index;
        assert.ok(Number.isSafeInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex <= 1_000_000);
        id = `${book.id}-w-${lesson.order}-${sourceIndex}`;
      }
      const expected = {
        id,
        lessonId: `${book.id}-l-${lesson.order}`,
        term: row.term,
        reading: row.reading,
        meaning: row.meaning,
        order: expectedWords.length + 1,
        source: 'textbook',
        bookTitle: book.title,
        lessonTitle: lesson.title,
      };
      for (const field of sourceFields) if (row[field] !== undefined) expected[field] = row[field];
      expectedWords.push(expected);
      bookCount++;
    }
  }
  assert.equal(bookCount, expectedBookWordCounts[book.id], `${book.id} packaged count`);
  countsByBook.set(book.id, bookCount);
}
assert.equal(countsByBook.get(legacyBookIds[0]) + countsByBook.get(legacyBookIds[1])
  + countsByBook.get(legacyBookIds[2]) + countsByBook.get(legacyBookIds[3])
  + countsByBook.get(legacyBookIds[4]) + countsByBook.get(legacyBookIds[5]), 9_117);
assert.equal(Object.keys(jlptBookWordCounts).reduce((sum, id) => sum + countsByBook.get(id), 0), 7_809);
assert.equal(expectedWords.length, 16_926);
assert.deepEqual(catalog, expectedWords, 'Packaged word IDs, data fields and original ordering must match sources');

const dataSources = await readFile(resolve(dist, 'DATA-SOURCES.txt'), 'utf8');
for (const attribution of [
  'https://creativecommons.org/licenses/by-sa/4.0/',
  'https://github.com/evanclan/OpenJLPT/blob/0d1d3410bec90bd4098a7c72de820543cb4f707c/NOTICE.md',
  'https://www.tanos.co.uk/jlpt/sharing/',
  'https://www.edrdg.org/edrdg/licence.html',
  'https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-09-02',
  'https://github.com/smartsl/biaori',
  'redistribution authorization has not been independently confirmed',
]) assert.ok(dataSources.includes(attribution), `Missing packaged attribution: ${attribution}`);
for (const scene of coverScenes) {
  const image = await readFile(resolve(dist, `covers/${scene}.png`));
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `Invalid local cover image: ${scene}`);
}
const answerSoundNames = ['wood-correct', 'wood-incorrect', 'chime-correct', 'chime-incorrect', 'timber-correct', 'timber-incorrect', 'stone-correct', 'stone-incorrect'];
const packagedAnswerSounds = new Set();
const sourceAnswerSoundHashes = new Map();
for (const name of answerSoundNames) {
  const source = await readFile(resolve(root, `apps/web/src/assets/answer-sounds/${name}.wav`));
  sourceAnswerSoundHashes.set(name, createHash('sha256').update(source).digest('hex'));
}
let files = 0, bytes = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else {
      files++;
      bytes += (await stat(path)).size;
      assert.ok(!/\.(mp3|ogg|pem|key)$/i.test(entry.name));
      if (/\.wav$/i.test(entry.name)) {
        const match = entry.name.match(/^(wood|chime|timber|stone)-(correct|incorrect)-([a-zA-Z0-9_-]{8,})\.wav$/);
        assert.ok(match, `Unexpected packaged WAV: ${path}`);
        const name = `${match[1]}-${match[2]}`;
        assert.ok(!packagedAnswerSounds.has(name), `Duplicate packaged answer sound: ${name}`);
        const content = await readFile(path);
        const hash = createHash('sha256').update(content).digest('hex');
        assert.equal(hash, sourceAnswerSoundHashes.get(name), `Packaged answer sound differs from Web source: ${name}`);
        packagedAnswerSounds.add(name);
      }
    }
  }
}
await walk(dist);
assert.deepEqual([...packagedAnswerSounds].sort(), [...answerSoundNames].sort(), 'Exactly the eight approved answer sound assets must be packaged');
console.log(JSON.stringify({ version: manifest.version, files, bytes, entries: catalog.length, bookCounts: Object.fromEntries(countsByBook), covers: coverScenes.length, permissions: manifest.permissions, nativeBrowserAcceptance: 'pending' }, null, 2));
