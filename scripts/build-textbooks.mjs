import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, '.cache/textbook-research/biaori-src/biaori-main/words.json');
const outputPath = path.join(root, 'apps/web/src/textbooks.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(source)) throw new Error('words.json must contain an array');
for (const [index, row] of source.entries()) {
  if (!Array.isArray(row) || row.length < 4) throw new Error(`words.json row ${index + 1} must have code, pos, meaning, reading`);
  if (!Number.isInteger(row[0]) || typeof row[1] !== 'string' || typeof row[2] !== 'string' || typeof row[3] !== 'string') throw new Error(`words.json row ${index + 1} has invalid field types`);
}

const specs = [
  ['biaori-beginner-upper', '标日初级上', 0, 1, 24],
  ['biaori-beginner-lower', '标日初级下', 0, 25, 48],
  ['biaori-intermediate-upper', '标日中级上', 1, 1, 16],
  ['biaori-intermediate-lower', '标日中级下', 1, 17, 32],
  ['biaori-advanced-upper', '标日高级上', 2, 1, 12],
  ['biaori-advanced-lower', '标日高级下', 2, 13, 24],
];
const clean = value => String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const parseReading = value => {
  const text = clean(value).split(/[／/]/, 1)[0].replace(/\s*［[^］]*］\s*$/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  const match = text.match(/^(.*?)\s*(?:（|\()([^（）()]*)/);
  return match ? { reading: match[1].trim() || match[2].trim(), term: match[2].trim() || match[1].trim() } : { reading: text, term: text };
};
const books = specs.map(([id, title, level, firstLesson, lastLesson]) => {
  const lessons = [];
  for (let lesson = firstLesson; lesson <= lastLesson; lesson++) {
    const rows = source.map((row, sourceIndex) => ({ row, sourceIndex })).filter(({ row }) => Math.floor(row[0] / 10000) === level && row[0] % 100 + 1 === lesson);
    lessons.push({ title: `第${lesson}课`, order: lesson, words: rows.map(({ row, sourceIndex }) => {
      const parsed = parseReading(row[3]);
      return { term: parsed.term, reading: parsed.reading, meaning: clean(row[2]), partOfSpeech: clean(row[1]), sourceCode: row[0], sourceIndex };
    }) });
  }
  return { id, title, description: '标日词汇 · 来源：biaori 开放词表；仅含词汇与课次。', lessons, wordCount: lessons.reduce((n, l) => n + l.words.length, 0) };
});
const payload = { source: 'smartsl/biaori', books };
fs.writeFileSync(outputPath, JSON.stringify(payload));
console.log(JSON.stringify({ sourceRows: source.length, books: books.map(b => ({ id: b.id, lessons: b.lessons.length, words: b.wordCount })) }, null, 2));
