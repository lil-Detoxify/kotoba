import { textbookWordId, type TextbookDefinition, type TextbookWord } from '@jp/importers';
import { fullBookTitle } from './book-presentation';
import corrections from '../textbook-corrections.json';

/** Catalog cache version; independent of the existing textbook-word migration marker. */
export const SYSTEM_CATALOG_VERSION = corrections.version;
export const LEGACY_TEXTBOOK_IDS = [
  'biaori-beginner-upper', 'biaori-beginner-lower',
  'biaori-intermediate-upper', 'biaori-intermediate-lower',
  'biaori-advanced-upper', 'biaori-advanced-lower',
] as const;

export type WebTextbookWord = Omit<TextbookWord, 'sourceIndex' | 'sourceCode'> & {
  sourceIndex?: number;
  sourceCode?: number;
  sourceId?: string;
};
export type WebTextbookDefinition = Omit<TextbookDefinition, 'lessons'> & {
  lessons: Array<{ title: string; order: number; words: WebTextbookWord[] }>;
};
interface CatalogMeta {
  id: string;
  title: string;
  wordCount: number;
  lessons: Array<{ title: string; order: number; wordCount?: number }>;
}

/** New books use source identity; the existing six books retain their exact IDs. */
export function webTextbookWordId(
  bookId: string, lessonOrder: number,
  row: { sourceId?: string; sourceIndex?: number }, fallbackIndex: number,
): string {
  if (row.sourceId !== undefined) {
    if (LEGACY_TEXTBOOK_IDS.some(id => id === bookId)
      || typeof row.sourceId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.sourceId)) {
      throw new Error('词书包含无效的来源编号。');
    }
    return `${bookId}-w-${row.sourceId}`;
  }
  if (bookId.startsWith('jlpt-')) throw new Error('JLPT 词条缺少稳定的来源编号。');
  const index = row.sourceIndex ?? fallbackIndex;
  if (!Number.isSafeInteger(index) || index < 0 || index > 1_000_000) throw new Error('词书包含无效词条编号。');
  return textbookWordId(bookId, lessonOrder, index);
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** Validate an entire response before any local transaction can alter loaded words. */
export function validateWebTextbookDefinition(value: unknown, meta: CatalogMeta): WebTextbookDefinition {
  if (!object(value) || value.id !== meta.id || !text(value.title)
    || fullBookTitle({ id: meta.id, title: value.title }) !== fullBookTitle(meta)
    || !Array.isArray(value.lessons) || value.wordCount !== meta.wordCount) {
    throw new Error('词书身份或词条数与目录不匹配。');
  }
  const expected = new Map(meta.lessons.map(lesson => [lesson.order, lesson]));
  const orders = new Set<number>();
  const ids = new Set<string>();
  let count = 0;
  for (const lesson of value.lessons) {
    if (!object(lesson) || !Number.isSafeInteger(lesson.order) || (lesson.order as number) < 1
      || orders.has(lesson.order as number) || !Array.isArray(lesson.words)) throw new Error('词书课次未通过校验。');
    const order = lesson.order as number;
    const expectedLesson = expected.get(order);
    if (!expectedLesson || expectedLesson.title !== lesson.title
      || (expectedLesson.wordCount !== undefined && expectedLesson.wordCount !== lesson.words.length)) {
      throw new Error('词书课次与目录不匹配。');
    }
    orders.add(order);
    for (const [index, row] of lesson.words.entries()) {
      if (!object(row) || !text(row.term) || !text(row.reading) || !text(row.meaning)
        || (row.partOfSpeech !== undefined && typeof row.partOfSpeech !== 'string')
        || (row.rawTerm !== undefined && typeof row.rawTerm !== 'string')) throw new Error('词书包含格式不完整的词条。');
      const id = webTextbookWordId(meta.id, order, row as WebTextbookWord, index);
      if (ids.has(id)) throw new Error('词书包含重复词条编号。');
      ids.add(id);
      if (++count > 10_000) throw new Error('单册词书超过安全数量限制。');
    }
  }
  if (orders.size !== expected.size || count !== meta.wordCount) throw new Error('词书词条或课次数与目录不一致。');
  return value as unknown as WebTextbookDefinition;
}
