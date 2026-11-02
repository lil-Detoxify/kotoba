import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {correctedTextbookWord} from './textbook-corrections.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcPath = join(root, 'apps/web/src/textbooks.json');
const outDir = join(root, 'apps/web/public/data/books');
const metaPath = join(root, 'apps/web/src/textbooks-metadata.json');

mkdirSync(outDir, { recursive: true });

const raw = JSON.parse(readFileSync(srcPath, 'utf8'));
// Keep the original six-book source intact; append independently prepared books.
const extraPath = join(root, 'data/wordbooks/jlpt-textbooks.json');
const extra = existsSync(extraPath) ? JSON.parse(readFileSync(extraPath, 'utf8')) : { books: [] };
const books = [...raw.books, ...extra.books].map(book=>({...book,lessons:book.lessons.map(lesson=>({...lesson,words:lesson.words.map((row,index)=>correctedTextbookWord(book.id,lesson.order,row,index))}))}));
const seenIds = new Set();
for (const book of books) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(book.id) || seenIds.has(book.id)) throw new Error('Invalid or duplicate system book ID');
  seenIds.add(book.id);
  if (!Array.isArray(book.lessons) || book.wordCount !== book.lessons.reduce((sum, lesson) => sum + lesson.words.length, 0)) {
    throw new Error(`Invalid lesson or word count: ${book.id}`);
  }
}

// 1. Metadata index.json for public / runtime
const meta = {
  version: extra.catalogVersion ?? 'biaori-v2',
  books: books.map(b => ({
    id: b.id,
    title: b.title,
    description: b.description,
    wordCount: b.wordCount,
    lessons: b.lessons.map(l => ({
      id: `${b.id}-l-${l.order}`,
      bookId: b.id,
      title: l.title,
      order: l.order,
      wordCount: l.words.length
    }))
  }))
};

writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
writeFileSync(join(outDir, 'index.json'), JSON.stringify(meta) + '\n', 'utf8');
console.log('Saved textbooks-metadata.json (' + statSync(metaPath).size + ' bytes)');
console.log('Saved public/data/books/index.json (' + statSync(join(outDir, 'index.json')).size + ' bytes)');

// 2. Individual book files
for (const b of books) {
  const bookFile = join(outDir, `${b.id}.json`);
  writeFileSync(bookFile, JSON.stringify(b) + '\n', 'utf8');
  console.log(`Saved public/data/books/${b.id}.json (` + statSync(bookFile).size + ' bytes)');
}
