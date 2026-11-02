import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const sourceDir = resolve(import.meta.dirname, '../apps/web/src');
const map = JSON.parse(readFileSync(resolve(sourceDir, 'google-sentence-audio-map.json'), 'utf8'));
const texts = [...new Set(map.entries
  .filter(entry => typeof entry?.female === 'string' && entry.female
    && typeof entry?.male === 'string' && entry.male)
  .map(entry => typeof entry.text === 'string' ? entry.text.normalize('NFC').trim() : '')
  .filter(Boolean))]
  .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);

writeFileSync(resolve(sourceDir, 'google-sentence-audio-index.json'),
  `${JSON.stringify({schemaVersion: 1, texts}, null, 2)}\n`, 'utf8');
console.log(`Generated sentence audio index: ${texts.length} texts.`);
