import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const repo = resolve(import.meta.dirname, '..');
const source = resolve(repo, 'apps/web/src');
const publicRoot = resolve(repo, 'apps/web/public');
const destination = resolve(publicRoot, 'data/examples/v1');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60)).replace(/\s/gu, '');
const keyFor = (term, reading) => term.normalize('NFKC').trim() + '|' + normalize(reading);
const refinements = ['learning-content-corrections.json', 'learning-refinements-n5.json', 'learning-refinements-n4.json', 'learning-refinements-common.json']
  .flatMap(filename => read(resolve(source, filename)));
const refinedByForm = new Map();
for (const entry of refinements) for (const form of entry.forms) {
  const key = keyFor(form.term, form.reading);
  refinedByForm.set(key, [...(refinedByForm.get(key) ?? []), entry]);
}
const refinedExampleFor = word => refinedByForm.get(keyFor(word.term, word.reading))
  ?.find(entry => (!entry.sourceMeanings || entry.sourceMeanings.some(meaning => normalize(meaning).toLowerCase() === normalize(word.meaning).toLowerCase()))
    && entry.meaningKeywords.some(keyword => normalize(word.meaning).toLowerCase().includes(normalize(keyword).toLowerCase())))?.example;
const primary = new Map();
for (const filename of ['learning-examples-advanced.json', 'learning-examples-intermediate.json', 'learning-examples-basic.json', 'learning-examples.json', 'learning-contexts.json']) {
  for (const [key, example] of Object.entries(read(resolve(source, filename)))) {
    const [term, reading] = key.split('|');
    primary.set(keyFor(term, reading), example);
  }
}
mkdirSync(destination, { recursive: true });
const books = [];
for (const metadata of read(resolve(publicRoot, 'data/books/index.json')).books) {
  const book = read(resolve(publicRoot, 'data/books', metadata.id + '.json'));
  const extraPath = resolve(source, 'learning-examples-biaori', metadata.id + '.json');
  const extras = existsSync(extraPath) ? read(extraPath) : {};
  const result = {};
  let matchedWords = 0;
  for (const lesson of book.lessons) for (const word of lesson.words) {
    const key = keyFor(word.term, word.reading);
    const example = refinedExampleFor(word) ?? primary.get(key) ?? extras[key];
    if (example) { result[key] = example; matchedWords++; }
  }
  const body = JSON.stringify(result) + '\n';
  writeFileSync(resolve(destination, metadata.id + '.json'), body, 'utf8');
  books.push({ id: metadata.id, matchedWords, entries: Object.keys(result).length, clozeEntries: Object.values(result).filter(example => example.cloze && example.ja.includes(example.cloze.answer)).length, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') });
}
const manifest = { version: 'v1', generatedAt: new Date().toISOString(), source: 'Existing KotoBud learning examples; the same source priority as the Web learning page.', books,
  bytes: books.reduce((total, book) => total + book.bytes, 0), newSentencesGenerated: 0, audioIncluded: false };
writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
