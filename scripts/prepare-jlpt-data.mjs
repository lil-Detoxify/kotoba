import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Data preparation is explicit; normal builds use the checked-in translation snapshot.
const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'data/wordbooks');
const read = name => JSON.parse(readFileSync(resolve(dir, name), 'utf8'));
const sourceSha256 = 'c04faeee51b178832a69bb55c094a3f7913a48e4922fb3f26c60413060635b16';
// Git may check text files out with CRLF on Windows; pin content with LF endings.
const sourceText = readFileSync(resolve(dir, 'openjlpt-0.3.0.json'), 'utf8').replace(/\r\n/g, '\n');
if (createHash('sha256').update(sourceText).digest('hex') !== sourceSha256) {
  throw new Error('OpenJLPT snapshot changed; review the source update first.');
}
const source = read('openjlpt-0.3.0.json');
const overrides = new Map(read('jlpt-overrides.json').entries.map(row => [row.id, row]));
const exclusions = new Map(read('jlpt-exclusions.json').entries.map(row => [row.id, row.reason]));
const expected = { N5: 674, N4: 630, N3: 1659, N2: 1778, N1: 3070 };
const dictionaryPath = resolve(root, '.cache/tomoshi.db');
const dictionarySha256 = '8b19c7d65a7d7d6df9afc58832b17b22fd349724e5d06d2acf3bb9a6c4b0ed9d';
const hash = createHash('sha256');
for await (const chunk of createReadStream(dictionaryPath)) hash.update(chunk);
if (hash.digest('hex') !== dictionarySha256) throw new Error('Dictionary snapshot changed; review mappings before preparing data.');
const db = new DatabaseSync(dictionaryPath, { readOnly: true });
const lookup = db.prepare('SELECT data FROM entries WHERE id=?');
const nfkc = text => text.normalize('NFKC');
const kana = text => nfkc(text).replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
const english = text => text.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '');
const posNames = {
  n: '名词', 'n-pref': '名词前缀', 'n-suf': '名词后缀', num: '数词', pn: '代词',
  'adj-i': 'い形容词', 'adj-ix': 'い形容词', 'adj-na': '形容动词', 'adj-no': 'の形容词',
  'adj-f': '前置形容词', 'adj-nari': '古典形容动词', 'adj-pn': '连体词', 'adj-t': 'タリ形容动词',
  adv: '副词', 'adv-to': '副词', aux: '助词性表达', 'aux-adj': '补助形容词', 'aux-v': '助动词',
  conj: '接续词', ctr: '量词', exp: '惯用表达', int: '感叹词', pref: '前缀', prt: '助词', suf: '后缀',
  v1: '一段动词', 'v1-s': '一段动词', vk: 'カ变动词', vs: 'サ变动词', 'vs-i': 'サ变动词',
  'vs-s': 'サ变动词', vz: 'ザ变动词', vi: '自动词', vt: '他动词',
};
function partOfSpeech(codes = []) {
  return [...new Set(codes.map(code => {
    if (code.startsWith('v5')) return '五段动词';
    if (!posNames[code]) throw new Error(`Unknown POS: ${code}`);
    return posNames[code];
  }))].join('；');
}
const counts = Object.fromEntries(Object.keys(expected).map(key => [key, 0]));
const identities = new Set();
const usedOverrides = new Set();
const usedExclusions = new Set();
const auditCounts = {};
const entries = [];
try {
  for (const row of source.entries) {
    if (!/^[a-f0-9]{10}$/.test(row.id) || identities.has(row.id)
      || !Object.hasOwn(expected, row.level) || !row.word?.trim() || !row.reading?.trim()
      || !Array.isArray(row.meanings) || !row.meanings.length) throw new Error(`Invalid source row: ${row.id}`);
    identities.add(row.id);
    counts[row.level]++;
    if (exclusions.has(row.id)) { usedExclusions.add(row.id); continue; }
    const override = overrides.get(row.id);
    let meaning, dictionaryEntryId, senseIndices = [], matchMethod, meaningMethod;
    if (override) {
      usedOverrides.add(row.id);
      meaning = override.meaning;
      // Source IDs can be wrong (e.g. silence mapped to 死因); only keep a
      // dictionary identity here when the override explicitly verified it.
      dictionaryEntryId = override.dictionaryEntryId;
      if (dictionaryEntryId) {
        const candidate = lookup.get(String(dictionaryEntryId));
        const entry = candidate ? JSON.parse(candidate.data) : undefined;
        if (!entry || ![...entry.kanji, ...entry.kana].some(form => nfkc(form.text) === nfkc(row.word))
          || !entry.kana.some(reading => kana(reading.text) === kana(row.reading)
            && (!reading.restricted_to?.length || reading.restricted_to.some(form => nfkc(form) === nfkc(row.word))))) {
          throw new Error(`Reviewed dictionary identity mismatch: ${row.id}`);
        }
      }
      matchMethod = 'reviewed-override';
      meaningMethod = 'reviewed-override';
    } else {
      const result = row.jmdict_id ? lookup.get(String(row.jmdict_id)) : undefined;
      if (!result) throw new Error(`No dictionary entry or reviewed override: ${row.id}`);
      const entry = JSON.parse(result.data);
      const forms = [...entry.kanji, ...entry.kana].map(form => nfkc(form.text));
      const matchingReading = entry.kana.find(reading => kana(reading.text) === kana(row.reading)
        && (!reading.restricted_to?.length || reading.restricted_to.some(form => nfkc(form) === nfkc(row.word))));
      if (!forms.includes(nfkc(row.word)) || !matchingReading) throw new Error(`Dictionary identity mismatch: ${row.id}`);
      dictionaryEntryId = String(entry.id);
      matchMethod = matchingReading.text === row.reading ? 'id+form+reading' : 'id+form+kana-equivalent-reading';
      const validSenses = entry.senses.map((sense, index) => ({
        index,
        zh: sense.glosses.filter(gloss => gloss.lang === 'zho' && gloss.text?.trim()).map(gloss => gloss.text.trim()),
        en: sense.glosses.filter(gloss => gloss.lang === 'eng').map(gloss => english(gloss.text)),
      })).filter(sense => sense.zh.length);
      const meanings = new Set(row.meanings.map(english).filter(Boolean));
      const matchingSenses = validSenses.filter(sense => sense.en.some(gloss => meanings.has(gloss)));
      const selected = matchingSenses.length ? matchingSenses : validSenses.slice(0, 1);
      senseIndices = selected.map(sense => sense.index);
      meaning = [...new Set(selected.flatMap(sense => sense.zh))].join('；');
      meaningMethod = matchingSenses.length ? 'english-gloss-aligned-senses' : 'dictionary-first-sense';
    }
    if (!meaning?.trim() || !/[\u3400-\u9fff]/.test(meaning)) throw new Error(`Missing Chinese meaning: ${row.id}`);
    auditCounts[meaningMethod] = (auditCounts[meaningMethod] ?? 0) + 1;
    entries.push({
      sourceId: row.id, level: row.level, term: row.word, reading: row.reading, meaning,
      partOfSpeech: override?.partOfSpeech ?? partOfSpeech(row.pos),
      provenance: { dictionaryEntryId, matchMethod, meaningMethod, senseIndices },
    });
  }
} finally { db.close(); }
if (Object.entries(expected).some(([level, count]) => counts[level] !== count)
  || usedOverrides.size !== overrides.size || usedExclusions.size !== exclusions.size
  || entries.length !== 7809) throw new Error('Source, override, or exclusion coverage mismatch.');
const output = {
  catalogVersion: '20261005-jlpt-v1', license: 'CC-BY-SA-4.0',
  source: { ...source.source, compactSnapshotSha256: sourceSha256 },
  dictionary: { name: 'tomoshi-dict-data', version: 'v2026-09-02', sha256: dictionarySha256, chineseTranslations: 'JMdict-derived translations by Y1Z with LLM assistance' },
  audit: { sourceCount: source.entries.length, publishedCount: entries.length, meaningMethods: auditCounts, excluded: [...exclusions].map(([id, reason]) => ({ id, reason })) },
  entries,
};
writeFileSync(resolve(dir, 'jlpt-vocabulary.json'), JSON.stringify(output) + '\n');
console.log(JSON.stringify(output.audit));
