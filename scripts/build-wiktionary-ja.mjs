import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const INPUT = resolve(ROOT, '.cache/wiktionary-ja/ja-extract.jsonl.gz');
const OUTPUT = resolve(ROOT, 'apps/web/public/data/dictionaries/wiktionary-ja/2026-10-12');
const REVIEW = resolve(ROOT, '..', 'kotobud-review/round26-2026-10-12');
const SHARD_COUNT = 256;
const SNAPSHOT_URL = 'https://kaikki.org/dictionary/downloads/ja/ja-extract.jsonl.gz';
const MODEL_URL = 'https://raw.githubusercontent.com/tatuylonen/wiktextract/master/src/wiktextract/extractor/ja/models.py';
const WIKTIONARY_TEMPLATE = 'https://ja.wiktionary.org/wiki/{encodeURIComponent(sourceTitle)}';
const KANA_PATTERN = /^[\p{Script=Hiragana}\p{Script=Katakana}\u30fc\u309d\u309e\u30fd\u30fe\u30fb\uff65\u3099\u309a]+$/u;
const normalizeTerm = (term) => term.normalize('NFKC');
const normalizeReading = (reading) => reading.normalize('NFKC').replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));

function bucketFor(term) {
  let hash = 0;
  for (const character of normalizeTerm(term)) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return hash % SHARD_COUNT;
}

function stringValues(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = value.trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}

function extractReadings(entry, schema) {
  const readings = [];
  const seen = new Set();
  if (entry.forms !== undefined && !Array.isArray(entry.forms)) schema.invalidFormsContainer++;
  for (const form of Array.isArray(entry.forms) ? entry.forms : []) {
    if (!form || typeof form !== 'object') {
      schema.invalidForm++;
      continue;
    }
    if (typeof form.form !== 'string') {
      schema.invalidFormText++;
      continue;
    }
    if (form.tags !== undefined && !Array.isArray(form.tags)) schema.invalidFormTags++;
    const tags = stringValues(form.tags).map((tag) => tag.trim().toLowerCase());
    const hasKanaTag = tags.some((tag) => ['transliteration', 'hiragana', 'katakana'].includes(tag));
    const text = form.form.trim();
    if (!hasKanaTag || !text || !KANA_PATTERN.test(text)) continue;
    if (!seen.has(text)) {
      seen.add(text);
      readings.push(text);
    }
  }
  return readings;
}

function buildRecord(entry, schema, sourceLineNumber) {
  const term = entry.word.trim();
  const sourceTitle = typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : term;
  const sourceUrl = `https://ja.wiktionary.org/wiki/${encodeURIComponent(sourceTitle)}`;
  const pos = [entry.pos_title, entry.pos].find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
  const readings = extractReadings(entry, schema);
  const senses = [];
  const seenSenses = new Set();

  if (entry.senses !== undefined && !Array.isArray(entry.senses)) schema.invalidSensesContainer++;
  for (const sourceSense of Array.isArray(entry.senses) ? entry.senses : []) {
    if (!sourceSense || typeof sourceSense !== 'object') {
      schema.invalidSense++;
      continue;
    }
    if (sourceSense.glosses !== undefined && !Array.isArray(sourceSense.glosses)) schema.invalidGlossesContainer++;
    const definitions = uniqueNonEmpty(stringValues(sourceSense.glosses));
    if (!definitions.length) continue;
    if (sourceSense.examples !== undefined && !Array.isArray(sourceSense.examples)) schema.invalidExamplesContainer++;
    const examples = uniqueNonEmpty((Array.isArray(sourceSense.examples) ? sourceSense.examples : []).map((example) => {
      if (!example || typeof example !== 'object') {
        schema.invalidExample++;
        return '';
      }
      if (example.text !== undefined && typeof example.text !== 'string') schema.invalidExampleText++;
      return typeof example.text === 'string' ? example.text : '';
    }));
    const tags = uniqueNonEmpty([
      ...stringValues(sourceSense.tags),
      ...stringValues(sourceSense.raw_tags),
    ]);
    if (sourceSense.tags !== undefined && !Array.isArray(sourceSense.tags)) schema.invalidSenseTags++;
    if (sourceSense.raw_tags !== undefined && !Array.isArray(sourceSense.raw_tags)) schema.invalidSenseRawTags++;
    const sense = {
      definition: definitions.join('\n'),
      ...(examples.length ? { examples } : {}),
      ...(tags.length ? { tags } : {}),
    };
    const senseKey = JSON.stringify(sense);
    if (!seenSenses.has(senseKey)) {
      seenSenses.add(senseKey);
      senses.push(sense);
    }
  }
  if (!senses.length) return null;

  const identity = createHash('sha256').update(`${sourceLineNumber}\u0000${JSON.stringify({ term, readings, pos, senses, sourceTitle })}`).digest('hex').slice(0, 24);
  return {
    id: `wiktionary-ja-${sourceLineNumber}-${identity}`,
    term,
    readings,
    pos,
    senses,
    sourceTitle,
    sourceUrl,
  };
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function emptyStats() {
  return {
    rawLines: 0,
    malformedJson: 0,
    otherLanguage: 0,
    japaneseEntries: 0,
    invalidJapaneseEntries: 0,
    redirectOnly: 0,
    noGlosses: 0,
    invalidFormsContainer: 0,
    invalidForm: 0,
    invalidFormText: 0,
    invalidFormTags: 0,
    invalidSensesContainer: 0,
    invalidSense: 0,
    invalidGlossesContainer: 0,
    invalidExamplesContainer: 0,
    invalidExample: 0,
    invalidExampleText: 0,
    invalidSenseTags: 0,
    invalidSenseRawTags: 0,
  };
}

function makeStagingShard(directory, index) {
  const file = resolve(directory, `${index}.jsonl`);
  const target = createWriteStream(file);
  const finished = new Promise((resolvePromise, rejectPromise) => {
    target.once('finish', resolvePromise);
    target.once('error', rejectPromise);
  });
  return { file, target, finished, count: 0 };
}

async function writeStagedRecord(shard, record) {
  const chunk = `${JSON.stringify(record)}\n`;
  if (!shard.target.write(chunk)) await once(shard.target, 'drain');
  shard.count++;
}

async function closeStagingShard(shard) {
  shard.target.end();
  await shard.finished;
}

async function writeGroupedShard(output, index, stagingPath, recordCount) {
  const grouped = new Map();
  if (stagingPath) {
    const input = createReadStream(stagingPath);
    const lines = createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line) continue;
      const record = JSON.parse(line);
      const key = normalizeTerm(record.term);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(record);
    }
  }
  const name = `${index}.json`;
  const file = resolve(output, name);
  const json = `${JSON.stringify(Object.fromEntries(grouped))}\n`;
  await writeFile(file, json, 'utf8');
  return { id: String(index), file: name, recordCount, bytes: Buffer.byteLength(json, 'utf8') };
}

async function makeCoverageReport({ manifest, terms, termReadingsByTerm, targetSamples, multiReadingRecords, multiReadingTerms }) {
  const bookIndex = JSON.parse(await readFile(resolve(ROOT, 'apps/web/public/data/books/index.json'), 'utf8'));
  const books = [];
  const totals = { total: 0, exactReadingMatches: 0, termOnlyUnconfirmedReading: 0, missing: 0, termFoundReadingMismatch: 0, bookReadingMissing: 0 };
  const bookWords = [];
  for (const item of bookIndex.books ?? []) {
    const bookPath = resolve(ROOT, 'apps/web/public/data/books', `${item.id}.json`);
    const book = JSON.parse(await readFile(bookPath, 'utf8'));
    const words = [];
    for (const lesson of Array.isArray(book.lessons) ? book.lessons : []) {
      for (const word of Array.isArray(lesson.words) ? lesson.words : []) {
        if (word && typeof word.term === 'string') words.push(word);
      }
    }
    const counts = { total: words.length, exactReadingMatches: 0, termOnlyUnconfirmedReading: 0, missing: 0, termFoundReadingMismatch: 0, bookReadingMissing: 0 };
    for (const word of words) {
      const readings = termReadingsByTerm.get(normalizeTerm(word.term));
      if (!readings) {
        counts.missing++;
      } else if (typeof word.reading === 'string' && word.reading.trim() && readings.has(normalizeReading(word.reading.trim()))) {
        counts.exactReadingMatches++;
      } else if (readings.size === 0) {
        counts.termOnlyUnconfirmedReading++;
      } else {
        counts.missing++;
        counts.termFoundReadingMismatch++;
        if (typeof word.reading !== 'string' || !word.reading.trim()) counts.bookReadingMissing++;
      }
    }
    for (const key of Object.keys(totals)) totals[key] += counts[key];
    books.push({ id: item.id, title: item.title ?? book.title ?? item.id, ...counts });
    bookWords.push({ book: { id: item.id, title: item.title ?? book.title ?? item.id }, words });
  }

  const sampleTerms = ['学生', '橋', '箸', '行く', '降る', '降りる'];
  const samples = sampleTerms.map((term) => {
    const occurrences = [];
    for (const { book, words } of bookWords) {
      for (const word of words) {
        if (normalizeTerm(word.term) !== normalizeTerm(term)) continue;
        const available = termReadingsByTerm.get(normalizeTerm(term)) ?? new Set();
        const reading = typeof word.reading === 'string' ? word.reading.trim() : '';
        occurrences.push({
          bookId: book.id,
          bookTitle: book.title,
          reading,
          status: available.has(normalizeReading(reading)) ? 'normalized-reading-match' : available.size ? 'headword-found-reading-mismatch' : terms.has(normalizeTerm(term)) ? 'headword-only-source-reading-unconfirmed' : 'missing',
        });
      }
    }
    const entries = targetSamples.get(normalizeTerm(term)) ?? [];
    return {
      term,
      dictionaryRecordCount: entries.length,
      sourceReadings: [...new Set(entries.flatMap((entry) => entry.readings))],
      dictionaryEntries: entries,
      bookOccurrences: occurrences,
    };
  });
  return {
    dataset: manifest.dataset,
    generatedAt: new Date().toISOString(),
    method: 'Match normalized headwords with NFKC and readings with the dictionary runtime rule (NFKC, then Katakana to Hiragana); coverage is entry/page-level. A headword alone is counted separately only when all Japanese Wiktionary records for that term provide no trusted kana reading. A provided but nonmatching reading is counted as missing normalized coverage and reported as termFoundReadingMismatch.',
    readingAttribution: {
      granularity: 'entry/page-level',
      senseReadingsAssigned: false,
      multiReadingRecordCount: multiReadingRecords,
      multiReadingTermCount: multiReadingTerms.size,
      limitation: 'When one source entry lists multiple readings, its source senses remain grouped as on the page; this coverage report cannot determine which individual sense belongs to which reading.',
    },
    dictionary: { records: manifest.recordCount, uniqueTerms: terms.size, readingOccurrences: manifest.readingCount, uniqueTermReadingPairs: manifest.uniqueTermReadingPairCount, multiReadingRecords, multiReadingTerms: multiReadingTerms.size },
    overall: totals,
    books,
    sampleCases: samples,
  };
}

async function build() {
  const inputStat = await stat(INPUT).catch(() => null);
  if (!inputStat?.isFile() || inputStat.size === 0) {
    throw new Error(`Snapshot is not ready: ${INPUT}`);
  }
  await mkdir(OUTPUT, { recursive: true });
  const [sourceSha256] = await Promise.all([sha256File(INPUT)]);
  const stagingDir = await mkdtemp(resolve(ROOT, '.cache/wiktionary-ja/build-'));
  const stats = emptyStats();
  const schema = stats;
  const input = createReadStream(INPUT);
  const gunzip = createGunzip();
  input.pipe(gunzip);
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });
  const stagedShards = new Map();
  let recordCount = 0;
  const words = new Set();
  const termReadings = new Set();
  const termReadingsByTerm = new Map();
  const targetSamples = new Map();
  const formatSamples = [];
  let multiReadingRecords = 0;
  let readingOccurrenceCount = 0;
  const multiReadingTerms = new Set();

  for await (const line of lines) {
    stats.rawLines++;
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      stats.malformedJson++;
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      stats.malformedJson++;
      continue;
    }
    if (entry.lang_code !== 'ja') {
      stats.otherLanguage++;
      continue;
    }
    stats.japaneseEntries++;
    if (typeof entry.word !== 'string' || !entry.word.trim()) {
      stats.invalidJapaneseEntries++;
      continue;
    }
    const hasAnyGloss = Array.isArray(entry.senses) && entry.senses.some((sense) =>
      sense && Array.isArray(sense.glosses) && sense.glosses.some((gloss) => typeof gloss === 'string' && gloss.trim()),
    );
    if (!hasAnyGloss) {
      if (typeof entry.redirect === 'string' && entry.redirect.trim()) stats.redirectOnly++;
      else stats.noGlosses++;
      continue;
    }
    const record = buildRecord(entry, schema, stats.rawLines);
    if (!record) {
      stats.noGlosses++;
      continue;
    }
    recordCount++;
    if (formatSamples.length < 2) formatSamples.push(record);
    words.add(normalizeTerm(record.term));
    if (record.readings.length > 1) {
      multiReadingRecords++;
      multiReadingTerms.add(normalizeTerm(record.term));
    }
    const termKey = normalizeTerm(record.term);
    if (!termReadingsByTerm.has(termKey)) termReadingsByTerm.set(termKey, new Set());
    for (const reading of record.readings) {
      readingOccurrenceCount++;
      const readingKey = normalizeReading(reading);
      termReadings.add(`${termKey}\u0000${readingKey}`);
      termReadingsByTerm.get(termKey).add(readingKey);
    }
    const normalizedTerm = normalizeTerm(record.term);
    if (['学生', '橋', '箸', '行く', '降る', '降りる'].includes(normalizedTerm)) {
      if (!targetSamples.has(normalizedTerm)) targetSamples.set(normalizedTerm, []);
      targetSamples.get(normalizedTerm).push(record);
    }
    const bucket = bucketFor(record.term);
    if (!stagedShards.has(bucket)) stagedShards.set(bucket, makeStagingShard(stagingDir, bucket));
    await writeStagedRecord(stagedShards.get(bucket), record);
    if (stats.rawLines % 100_000 === 0) {
      process.stdout.write(`processed ${stats.rawLines.toLocaleString()} lines; ${recordCount.toLocaleString()} records\n`);
    }
  }
  await Promise.all([...stagedShards.values()].map(closeStagingShard));

  const shardList = [];
  let bytes = 0;
  for (let index = 0; index < SHARD_COUNT; index++) {
    const staged = stagedShards.get(index);
    const shard = await writeGroupedShard(OUTPUT, index, staged?.file, staged?.count ?? 0);
    bytes += shard.bytes;
    shardList.push(shard);
  }
  for (const shard of stagedShards.values()) await unlink(shard.file);
  await rmdir(stagingDir);
  const manifest = {
    dataset: 'wiktionary-ja-2026-10-12',
    downloadedAt: inputStat.mtime.toISOString(),
    builtAt: new Date().toISOString(),
    sourceSha256,
    sourceBytes: inputStat.size,
    recordCount,
    wordCount: words.size,
    readingCount: readingOccurrenceCount,
    uniqueTermReadingPairCount: termReadings.size,
    bytes,
    bytesKind: 'sum of ordinary JSON shard file sizes; excludes manifest and notice',
    shardCount: SHARD_COUNT,
    populatedShardCount: shardList.filter((shard) => shard.recordCount > 0).length,
    compression: 'none in files; static hosting may apply transport compression',
    shardPathPattern: '{id}.json',
    shardHash: 'NFKC codepoint rolling hash: hash = (hash * 31 + codepoint) >>> 0; bucket = hash % 256',
    sourceUrls: {
      rawSnapshot: SNAPSHOT_URL,
      entryTemplate: WIKTIONARY_TEMPLATE,
      extractorSchema: MODEL_URL,
    },
    textSource: {
      community: 'Japanese Wiktionary contributors',
      license: 'CC BY-SA 4.0, as linked from Japanese Wiktionary page footer',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      extraction: 'Kaikki / Wiktextract JSONL extraction from Japanese Wiktionary',
      changes: 'Filtered to lang_code=ja entries with source glosses; removed empty and duplicate text within each source sense; serialized as ordinary JSON shards for static hosting.',
    },
    filtering: {
      langCode: 'ja',
      includedOnlyEntriesWithSourceGlosses: true,
      redirectOnlyExcluded: true,
      readings: 'Only pure kana forms tagged transliteration, hiragana, or katakana; no roman or IPA field and no reading inferred from a gloss or kanji.',
      definitionsAndExamples: 'Source text preserved as plain text; no generated translation or gloss.',
    },
    sourceStats: stats,
    shards: shardList,
  };
  await writeFile(resolve(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const notice = [
    '# Wiktionary Japanese data notice',
    'This dataset contains Japanese-language dictionary text from pages authored by the Japanese Wiktionary community. Japanese Wiktionary pages link their text to the Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/. The original page for each record is linked by its sourceUrl.',
    'Kaikki / Wiktextract extracted the source entries from Japanese Wiktionary. This project filtered the extracted JSONL to lang_code="ja" entries with source glosses, omitted redirect-only and glossless entries, kept source glosses and examples as plain text, removed empty or duplicate strings within a source sense, and split the resulting records into 256 ordinary JSON shards. Static hosting may apply transfer compression. No generated translations or inferred readings were added. Readings are included only when forms are pure kana and tagged transliteration, hiragana, or katakana; otherwise the record keeps an empty readings array.',
    'This notice identifies the community source and processing changes; it does not imply endorsement by Wiktionary, Kaikki, or Wiktextract.',
  ].join('\n\n') + '\n';
  await writeFile(resolve(OUTPUT, 'NOTICE.md'), notice, 'utf8');

  await mkdir(REVIEW, { recursive: true });
  const sampleTerms = ['学生', '橋', '箸', '行く', '降る', '降りる'];
  await writeFile(resolve(REVIEW, 'dataformat-samples.json'), `${JSON.stringify({
    dataset: manifest.dataset,
    format: { id: 'string', term: 'string', readings: 'string[]', pos: 'string', senses: '{definition:string,examples?:string[],tags?:string[]}[]', sourceTitle: 'string', sourceUrl: 'string' },
    sourceSchema: MODEL_URL,
    records: formatSamples,
    sampleCases: sampleTerms.flatMap((term) => targetSamples.get(normalizeTerm(term)) ?? []),
  }, null, 2)}\n`, 'utf8');
  const coverage = await makeCoverageReport({ manifest, terms: words, termReadingsByTerm, targetSamples, multiReadingRecords, multiReadingTerms });
  await writeFile(resolve(REVIEW, 'coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`, 'utf8');
  process.stdout.write(`Built ${manifest.recordCount.toLocaleString()} records, ${manifest.wordCount.toLocaleString()} unique terms, ${manifest.readingCount.toLocaleString()} reading occurrences (${manifest.uniqueTermReadingPairCount.toLocaleString()} unique term-reading pairs); ${bytes.toLocaleString()} JSON shard bytes.\n`);
}

async function samplesOnly() {
  const inputStat = await stat(INPUT).catch(() => null);
  if (!inputStat?.isFile() || inputStat.size === 0) throw new Error(`Snapshot is not ready: ${INPUT}`);
  const terms = new Set(['学生', '橋', '箸', '行く', '降る', '降りる']);
  const samples = new Map();
  const schema = emptyStats();
  let sourceLineNumber = 0;
  const input = createReadStream(INPUT);
  const gunzip = createGunzip();
  input.pipe(gunzip);
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });
  for await (const line of lines) {
    sourceLineNumber++;
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || entry.lang_code !== 'ja' || typeof entry.word !== 'string' || !terms.has(entry.word)) continue;
    const record = buildRecord(entry, schema, sourceLineNumber);
    if (record) {
      if (!samples.has(record.term)) samples.set(record.term, []);
      samples.get(record.term).push(record);
    }
    if (samples.size >= 2) break;
  }
  await mkdir(REVIEW, { recursive: true });
  const selected = [...samples.keys()];
  await writeFile(resolve(REVIEW, 'dataformat-samples.json'), `${JSON.stringify({ sourceSchema: MODEL_URL, records: selected.map((term) => samples.get(term)[0]) }, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(selected.map((term) => samples.get(term)[0]), null, 2)}\n`);
}

if (process.argv.includes('--samples-only')) await samplesOnly();
else await build();
