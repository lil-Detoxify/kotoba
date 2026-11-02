export type TextbookWordSense = {
  meaning: string;
  definitionJa?: string;
  partOfSpeech?: string;
  example?: string;
  exampleReading?: string;
  exampleTranslation?: string;
};

/** The source shape consumed by the extension's catalog packer. */
export type TextbookWordSource = {
  sourceId?: string;
  sourceIndex?: number;
  sourceCode?: number;
  term: string;
  reading: string;
  meaning: string;
  partOfSpeech?: string;
  accent?: string;
  example?: string;
  exampleTranslation?: string;
  audioUrl?: string;
  audioTerm?: string;
  rawTerm?: string;
  note?: string;
  definitionJa?: string;
  definitionZh?: string;
  exampleReading?: string;
  senses?: TextbookWordSense[];
};

export type TextbookLessonSource = {
  title: string;
  order: number;
  words: TextbookWordSource[];
};

export type TextbookBookSource = {
  id: string;
  title: string;
  wordCount: number;
  lessons: TextbookLessonSource[];
};

export type TextbookBookMetadata = {
  id: string;
  title: string;
  wordCount: number;
};

/** Shape written into the extension catalog; sourceId is encoded in id only. */
export type ExtensionCatalogWord = {
  id: string;
  lessonId: string;
  term: string;
  reading: string;
  meaning: string;
  order: number;
  source: 'textbook';
  bookTitle: string;
  lessonTitle: string;
  partOfSpeech?: string;
  accent?: string;
  example?: string;
  exampleTranslation?: string;
  audioUrl?: string;
  audioTerm?: string;
  rawTerm?: string;
  note?: string;
  definitionJa?: string;
  definitionZh?: string;
  exampleReading?: string;
  senses?: TextbookWordSense[];
};

export const LEGACY_TEXTBOOK_IDS: readonly [
  'biaori-beginner-upper',
  'biaori-beginner-lower',
  'biaori-intermediate-upper',
  'biaori-intermediate-lower',
  'biaori-advanced-upper',
  'biaori-advanced-lower',
];

export const JLPT_BOOK_WORD_COUNTS: Readonly<{
  'jlpt-n5': 674;
  'jlpt-n4': 630;
  'jlpt-n3': 1659;
  'jlpt-n2': 1778;
  'jlpt-n1': 3068;
}>;

export const EXPECTED_BOOK_WORD_COUNTS: Readonly<{
  'biaori-beginner-upper': 1077;
  'biaori-beginner-lower': 1073;
  'biaori-intermediate-upper': 1748;
  'biaori-intermediate-lower': 1907;
  'biaori-advanced-upper': 1806;
  'biaori-advanced-lower': 1506;
  'jlpt-n5': 674;
  'jlpt-n4': 630;
  'jlpt-n3': 1659;
  'jlpt-n2': 1778;
  'jlpt-n1': 3068;
}>;

export const COVER_SCENES: readonly ['town', 'train', 'cafe', 'bridge', 'table', 'museum', 'garden'];

export function textbookCatalogWordId(
  bookId: string,
  lessonOrder: number,
  row: Partial<TextbookWordSource>,
  fallbackIndex: number,
): string;

export function createCatalog(
  bookMetadata: TextbookBookMetadata[],
  booksById: ReadonlyMap<string, TextbookBookSource>,
): ExtensionCatalogWord[];
