import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '../data/wordbooks');
const vocabulary = JSON.parse(readFileSync(resolve(dir, 'jlpt-vocabulary.json'), 'utf8'));
const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];
const counts = [674, 630, 1659, 1778, 3068];
const ids = new Set();
const books = levels.map((level, index) => {
  const rows = vocabulary.entries.filter(row => row.level === level);
  if (rows.length !== counts[index]) throw new Error(`Unexpected count: ${level}`);
  const lessons = [];
  for (let start = 0; start < rows.length; start += 50) {
    const words = rows.slice(start, start + 50).map(row => {
      if (!/^[a-f0-9]{10}$/.test(row.sourceId) || ids.has(row.sourceId)
        || !row.term?.trim() || !row.reading?.trim() || !row.meaning?.trim()) throw new Error('Invalid prepared vocabulary.');
      ids.add(row.sourceId);
      return { sourceId: row.sourceId, term: row.term, reading: row.reading, meaning: row.meaning, partOfSpeech: row.partOfSpeech };
    });
    const order = lessons.length + 1;
    lessons.push({ title: `第${order}组 · 词汇${start + 1}–${start + words.length}`, order, words });
  }
  return {
    id: `jlpt-${level.toLowerCase()}`, title: `JLPT ${level} 备考词汇`,
    description: `按社区参考等级整理的 ${level} 备考词汇，附中文释义，每 50 词一组。分级仅供学习参考，并非官方考纲。`,
    wordCount: rows.length, lessons,
  };
});
if (ids.size !== vocabulary.entries.length) throw new Error('Unassigned vocabulary.');
writeFileSync(resolve(dir, 'jlpt-textbooks.json'), JSON.stringify({ catalogVersion: vocabulary.catalogVersion, books }) + '\n');
console.log(JSON.stringify(books.map(book => ({ id: book.id, words: book.wordCount, groups: book.lessons.length }))));
