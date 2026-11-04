import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { textbookWordId } from '../../../packages/importers/src/textbooks.ts';

export const LEGACY_TEXTBOOK_IDS = [
  'biaori-beginner-upper',
  'biaori-beginner-lower',
  'biaori-intermediate-upper',
  'biaori-intermediate-lower',
  'biaori-advanced-upper',
  'biaori-advanced-lower',
];

export const JLPT_BOOK_WORD_COUNTS = {
  'jlpt-n5': 674,
  'jlpt-n4': 630,
  'jlpt-n3': 1659,
  'jlpt-n2': 1778,
  'jlpt-n1': 3068,
};

export const EXPECTED_BOOK_WORD_COUNTS = {
  'biaori-beginner-upper': 1077,
  'biaori-beginner-lower': 1073,
  'biaori-intermediate-upper': 1748,
  'biaori-intermediate-lower': 1907,
  'biaori-advanced-upper': 1806,
  'biaori-advanced-lower': 1506,
  ...JLPT_BOOK_WORD_COUNTS,
};

export const COVER_SCENES = ['town', 'train', 'cafe', 'bridge', 'table', 'museum', 'garden'];
const EXPECTED_BOOK_IDS = [...LEGACY_TEXTBOOK_IDS, ...Object.keys(JLPT_BOOK_WORD_COUNTS)];
const BOOK_WORD_FIELDS = [
  'partOfSpeech', 'accent', 'example', 'exampleTranslation', 'audioUrl', 'audioTerm', 'rawTerm',
  'note', 'definitionJa', 'definitionZh', 'exampleReading', 'senses',
];
const WORD_SENSE_FIELDS = new Set([
  'meaning', 'definitionJa', 'partOfSpeech', 'example', 'exampleReading', 'exampleTranslation',
]);

export function textbookCatalogWordId(bookId, lessonOrder, row, fallbackIndex) {
  if (Object.hasOwn(row, 'sourceId')) {
    if (LEGACY_TEXTBOOK_IDS.includes(bookId)
      || typeof row.sourceId !== 'string'
      || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.sourceId)) {
      throw new Error(`Invalid sourceId for ${bookId}`);
    }
    return `${bookId}-w-${row.sourceId}`;
  }
  if (bookId.startsWith('jlpt-')) throw new Error(`JLPT word is missing sourceId: ${bookId}`);
  const sourceIndex = row.sourceIndex ?? fallbackIndex;
  if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex > 1_000_000) {
    throw new Error(`Invalid sourceIndex for ${bookId}`);
  }
  return textbookWordId(bookId, lessonOrder, sourceIndex);
}

/** Build the catalog without changing source order or legacy textbook identities. */
export function createCatalog(bookMetadata, booksById) {
  if (!Array.isArray(bookMetadata) || bookMetadata.length !== EXPECTED_BOOK_IDS.length
    || bookMetadata.some((meta, index) => meta?.id !== EXPECTED_BOOK_IDS[index])) {
    throw new Error('Expected the six existing textbooks followed by JLPT N5–N1.');
  }

  const catalog = [];
  for (const meta of bookMetadata) {
    const book = booksById.get(meta.id);
    const expectedCount = EXPECTED_BOOK_WORD_COUNTS[meta.id];
    if (!/^[a-z0-9-]+$/.test(meta.id) || !book || book.id !== meta.id
      || book.title !== meta.title || book.wordCount !== expectedCount
      || meta.wordCount !== expectedCount || !Array.isArray(book.lessons)) {
      throw new Error(`Invalid textbook source for ${meta.id}`);
    }
    let bookCount = 0;
    for (const lesson of book.lessons) {
      if (!Number.isSafeInteger(lesson.order) || lesson.order < 1 || !Array.isArray(lesson.words)) {
        throw new Error(`Invalid lesson in ${meta.id}`);
      }
      for (const [index, row] of lesson.words.entries()) {
        if (row.senses !== undefined) {
          if (!Array.isArray(row.senses) || row.senses.length > 30
            || row.senses.some(sense => !sense || typeof sense !== 'object' || Array.isArray(sense)
              || Object.keys(sense).some(field => !WORD_SENSE_FIELDS.has(field))
              || typeof sense.meaning !== 'string' || !sense.meaning.trim()
              || Object.values(sense).some(value => typeof value !== 'string'))) {
            throw new Error(`Invalid supported senses in ${book.id}`);
          }
        }
        const word = {
          id: textbookCatalogWordId(book.id, lesson.order, row, index),
          lessonId: `${book.id}-l-${lesson.order}`,
          term: row.term,
          reading: row.reading,
          meaning: row.meaning,
          order: catalog.length + 1,
          source: 'textbook',
          bookTitle: book.title,
          lessonTitle: lesson.title,
        };
        for (const field of BOOK_WORD_FIELDS) {
          if (row[field] !== undefined) word[field] = row[field];
        }
        catalog.push(word);
        bookCount++;
      }
    }
    if (bookCount !== expectedCount) throw new Error(`Unexpected word count for ${meta.id}: ${bookCount}`);
  }

  if (catalog.length !== 16_926 || new Set(catalog.map(word => word.id)).size !== catalog.length) {
    throw new Error('Invalid extension catalog size or duplicate word ID.');
  }
  return catalog;
}

async function prepareData() {
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const app = resolve(root, 'apps/extension');
const generated = resolve(app, '.generated');
const info = JSON.parse(await readFile(resolve(app, 'package.json'), 'utf8'));
const index = JSON.parse(await readFile(resolve(root, 'apps/web/public/data/books/index.json'), 'utf8'));
const booksById = new Map();
for (const meta of index.books) {
  booksById.set(meta.id, JSON.parse(await readFile(resolve(root, `apps/web/public/data/books/${meta.id}.json`), 'utf8')));
}
const catalog = createCatalog(index.books, booksById);
await Promise.all(['data', 'icons', 'pet', 'covers'].map(path => mkdir(resolve(generated, path), { recursive: true })));
// Only local staging candidates add the test content origin; store builds keep production permissions.
const stagingSentenceData = process.env.VITE_SENTENCE_AUDIO_DATA_ORIGIN === 'https://staging.kotobud.com';
const manifest = {
  manifest_version: 3,
  name: 'KotoBud · 随手学日语',
  version: info.version.split('-')[0],
  version_name: info.version,
  description: '侧边栏查词与多词典对照、收藏、选课背词及 FSRS 复习，设置中管理账号与云同步。',
  minimum_chrome_version: '116',
  permissions: ['sidePanel', 'contextMenus', 'storage'],
  host_permissions: ['https://kotobud.com/*', ...(stagingSentenceData ? ['https://staging.kotobud.com/*'] : [])],
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_title: '打开 KotoBud 侧边栏', default_icon: 'icons/kotobud.png' },
  icons: { '16': 'icons/kotobud.png', '32': 'icons/kotobud.png', '48': 'icons/kotobud.png', '128': 'icons/kotobud.png' },
  side_panel: { default_path: 'sidepanel.html' },
  content_security_policy: { extension_pages: `script-src 'self'; object-src 'none'; base-uri 'none'; connect-src 'self' https://kotobud.com${stagingSentenceData ? ' https://staging.kotobud.com' : ''}; media-src 'self' https://kotobud.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'` },
};
const notices = [];
const kanaSource = JSON.parse(await readFile(resolve(root, 'apps/web/src/kana-strokes.json'), 'utf8')).source;
notices.push(`===== Kana stroke paths =====\n${kanaSource.name} ${kanaSource.release} by ${kanaSource.author}\n${kanaSource.url}\n${kanaSource.license}: ${kanaSource.licenseUrl}\n${kanaSource.changes}\nAdapted path data remains available under CC BY-SA 3.0 in assets/Kana-*.js.`);
for (const name of ['vue', 'idb', 'ts-fsrs', 'lucide-vue-next', 'papaparse']) {
  notices.push(`===== ${name} =====\n${await readFile(resolve(root, `node_modules/${name}/LICENSE`), 'utf8')}`);
}
const gsapInfo = JSON.parse(await readFile(resolve(root, 'node_modules/gsap/package.json'), 'utf8'));
notices.push(`===== gsap ${gsapInfo.version} =====\n${gsapInfo.license}\n`);
const dataSources = `KotoBud extension local development candidate

JLPT vocabulary data: 7,809 entries across N5–N1, counted by book.
License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).
License text: https://creativecommons.org/licenses/by-sa/4.0/
Level reference: OpenJLPT v0.3.0, fixed commit 0d1d3410bec90bd4098a7c72de820543cb4f707c.
OpenJLPT NOTICE: https://github.com/evanclan/OpenJLPT/blob/0d1d3410bec90bd4098a7c72de820543cb4f707c/NOTICE.md
Jonathan Waller data-use terms: https://www.tanos.co.uk/jlpt/sharing/
Japanese entries, readings and parts of speech: JMdict / EDRDG, CC BY-SA 4.0.
EDRDG license: https://www.edrdg.org/edrdg/licence.html
Chinese meanings: Tomoshi-dict-data v2026-09-02, CC BY-SA 4.0.
Tomoshi release: https://github.com/tomoshi-app/tomoshi-dict-data/releases/tag/v2026-09-02
These community reference levels are not an official JLPT vocabulary list or exam guarantee.

General dictionary lookup and comparison: data shards are read on demand from https://kotobud.com.
Tomoshi Chinese translations and JMdict English meanings share the JMdict upstream.
Japanese Wiktionary: 2026-10-01 Japanese-edition snapshot, filtered and sharded on 2026-10-12.
Contributors: Wiktionary contributors / Wiktextract; CC BY-SA 4.0.
Source: https://kaikki.org/jawiktionary/
Original articles: https://ja.wiktionary.org/
No Wiktionary audio or images are packaged. Each result links to its original article.

Legacy textbook vocabulary: six existing biaori books from https://github.com/smartsl/biaori
Their textbook-data redistribution authorization has not been independently confirmed.
See docs/reference/TEXTBOOK_SOURCES.md. This local candidate is not cleared for store distribution.

Cover illustrations: original KotoBud artwork from apps/miniprogram/src/static/covers; no textbook cover art included.
Scheduler: ts-fsrs (MIT), project @jp/core.
UI animation: GSAP, https://gsap.com/standard-license.`;
const install = `KotoBud Browser Extension ${info.version} — local development candidate

For an existing unpacked installation: overlay the files in its original directory and click Reload on the existing extension. Keep that directory and extension ID; do not uninstall or clear storage. Export a backup first if desired.

For a new installation:
1. Unzip this archive to a persistent directory. manifest.json should be at its root.
2. In Chrome visit chrome://extensions, or in Edge visit edge://extensions.
3. Enable Developer mode, choose Load unpacked, and select this directory.
4. Pin the KotoBud icon and click it to open the side panel.
5. Select Japanese text on an HTTP/HTTPS page and use the KotoBud context menu.
6. Use the bottom Library (词书) tab to choose textbook or JLPT lessons and practice. Statistics (统计) has the charts; Saved Words (生词本) includes a review shortcut.
7. Open the top-right Settings to sign in with your existing KotoBud email account to sync textbook progress, review events and learning settings. Guest data is merged only by your explicit action.

Chrome 116+ target. This candidate has local build and packaged service-worker checks; actual side-panel windows, context menus, existing-profile updates, Chrome and real-account sync still need acceptance.
Imported/manual vocabulary remains local because the existing cloud API does not transfer custom book content. Export data before uninstalling.
Packaged vocabulary and code are local. General lookup, dictionary comparison, account requests and textbook audio use https://kotobud.com only when requested. Manual/imported words use Japanese device speech when available.
Search results now include a general dictionary section. Choose Dictionary Comparison (词典对照) for separate Chinese, English and Japanese meanings. Settings contains source order, visibility and the default expanded source. These reading preferences stay in this extension installation.
JLPT source attribution and data licenses are in DATA-SOURCES.txt. The legacy textbook data is not cleared for store distribution.
`;
await Promise.all([
  writeFile(resolve(generated, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'),
  writeFile(resolve(generated, 'data/catalog.json'), JSON.stringify(catalog)),
  copyFile(resolve(root, 'apps/web/public/icon.png'), resolve(generated, 'icons/kotobud.png')),
  copyFile(resolve(root, 'apps/web/public/pet/leaf-cat-classic-idle-open-v2.png'), resolve(generated, 'pet/leaf-cat.png')),
  ...COVER_SCENES.map(scene => copyFile(
    resolve(root, 'apps/miniprogram/src/static/covers', `${scene}.png`),
    resolve(generated, 'covers', `${scene}.png`),
  )),
  writeFile(resolve(generated, 'DATA-SOURCES.txt'), dataSources + '\n'),
  writeFile(resolve(generated, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n')),
  writeFile(resolve(generated, 'INSTALL.txt'), install),
  copyFile(resolve(app, 'CHANGELOG.md'), resolve(generated, 'CHANGELOG.md')),
]);
console.log(`Prepared KotoBud extension ${info.version}: ${catalog.length} packaged textbook entries; account and audio origin https://kotobud.com.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareData();
}
