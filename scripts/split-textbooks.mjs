import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcPath = join(root, 'apps/web/src/textbooks.json');
const outDir = join(root, 'apps/web/public/data/books');
const metaPath = join(root, 'apps/web/src/textbooks-metadata.json');

mkdirSync(outDir, { recursive: true });

const raw = JSON.parse(readFileSync(srcPath, 'utf8'));

// 1. Metadata index.json for public / runtime
const meta = {
  books: raw.books.map(b => ({
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
for (const b of raw.books) {
  const bookFile = join(outDir, `${b.id}.json`);
  writeFileSync(bookFile, JSON.stringify(b) + '\n', 'utf8');
  console.log(`Saved public/data/books/${b.id}.json (` + statSync(bookFile).size + ' bytes)');
}
