import Papa from 'papaparse';

export type PersonalWordDraft = {
  term: string;
  reading: string;
  meaning: string;
};

export interface PastedVocabularyError {
  row: number;
  message: string;
}

export interface PastedVocabularyResult {
  words: PersonalWordDraft[];
  errors: PastedVocabularyError[];
  duplicateCount: number;
}

type HeaderField = keyof PersonalWordDraft;
type HeaderColumns = Record<HeaderField, number>;

const HEADER_ALIASES: Record<HeaderField, readonly string[]> = {
  term: ['term', 'word', 'vocabulary', '单词', '词汇', '词形', '词条', '词语', '日语', '日文'],
  reading: ['reading', 'kana', 'pronunciation', '读音', '假名', '读法', '发音', '読み', 'ふりがな'],
  meaning: ['meaning', 'definition', 'translation', 'gloss', '释义', '中文释义', '中文意思', '意思', '词义', '含义', '翻译', '中文'],
};

function normalizeHeader(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

const HEADER_FIELD_BY_NAME = new Map<string, HeaderField>(
  Object.entries(HEADER_ALIASES).flatMap(([field, aliases]) => aliases.map((alias): [string, HeaderField] => [
    normalizeHeader(alias), field as HeaderField,
  ])),
);

function detectHeader(cells: string[]): HeaderColumns | undefined {
  if (cells.length !== 3) return undefined;

  const columns: Partial<HeaderColumns> = {};
  for (const [index, cell] of cells.entries()) {
    const field = HEADER_FIELD_BY_NAME.get(normalizeHeader(cell));
    if (!field || columns[field] !== undefined) return undefined;
    columns[field] = index;
  }

  if (columns.term === undefined || columns.reading === undefined || columns.meaning === undefined) return undefined;
  return columns as HeaderColumns;
}

function isEmptyRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === '');
}

function parserErrorMessage(code: string): string {
  if (code === 'MissingQuotes') return '引号未闭合，请检查双引号。';
  if (code === 'InvalidQuotes') return '引号位置不正确，请检查双引号。';
  if (code === 'UndetectableDelimiter') return '无法识别分隔符，请使用制表符、英文逗号或中文逗号分隔。';
  return '表格格式解析失败，请检查分隔符和引号。';
}

export function cleanPersonalWord(draft: PersonalWordDraft): PersonalWordDraft {
  const term = typeof draft?.term === 'string' ? draft.term.trim() : '';
  const reading = typeof draft?.reading === 'string' ? draft.reading.trim() : '';
  const meaning = typeof draft?.meaning === 'string' ? draft.meaning.trim() : '';

  if (!term) throw new Error('词形不能为空。');
  if (!reading) throw new Error('读音不能为空。');
  if (!meaning) throw new Error('中文释义不能为空。');

  return { term, reading, meaning };
}

function normalizeKeyPart(value: string): string {
  return value.normalize('NFKC').trim();
}

function katakanaToHiragana(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint >= 0x30a1 && codePoint <= 0x30f6) || codePoint === 0x30fd || codePoint === 0x30fe) {
      return String.fromCodePoint(codePoint - 0x60);
    }
    return character;
  }).join('');
}

export function personalWordKey(term: string, reading: string): string {
  return JSON.stringify([
    normalizeKeyPart(term),
    katakanaToHiragana(normalizeKeyPart(reading)),
  ]);
}

export function parsePastedVocabulary(text: string): PastedVocabularyResult {
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const result: PastedVocabularyResult = { words: [], errors: [], duplicateCount: 0 };
  if (!input.trim()) return result;

  const parsed = Papa.parse<string[]>(input, {
    delimiter: '',
    delimitersToGuess: ['\t', ',', '，'],
    dynamicTyping: false,
    skipEmptyLines: false,
  });

  const parserErrorRows = new Set<number>();
  for (const parseError of parsed.errors) {
    const row = (parseError.row ?? 0) + 1;
    if (!parserErrorRows.has(row)) {
      result.errors.push({ row, message: parserErrorMessage(parseError.code) });
    }
    parserErrorRows.add(row);
  }

  const firstDataRow = parsed.data.findIndex((cells) => !isEmptyRow(cells));
  const header = firstDataRow < 0 ? undefined : detectHeader(parsed.data[firstDataRow]);
  const headerRow = header ? firstDataRow + 1 : -1;
  const firstRowByKey = new Map<string, { meaning: string; row: number }>();

  parsed.data.forEach((cells, index) => {
    const row = index + 1;
    if (isEmptyRow(cells) || row === headerRow || parserErrorRows.has(row)) return;

    if (cells.length > 3) {
      result.errors.push({ row, message: `每行应为3列，当前有${cells.length}列。` });
      return;
    }

    const values = header
      ? [cells[header.term] ?? '', cells[header.reading] ?? '', cells[header.meaning] ?? '']
      : [cells[0] ?? '', cells[1] ?? '', cells[2] ?? ''];
    const fieldLabels = ['词形', '读音', '中文释义'];
    const missing = values.flatMap((value, fieldIndex) => value.trim() ? [] : [fieldLabels[fieldIndex]]);
    if (missing.length > 0) {
      result.errors.push({ row, message: `缺少${missing.join('、')}。` });
      return;
    }

    let word: PersonalWordDraft;
    try {
      word = cleanPersonalWord({ term: values[0], reading: values[1], meaning: values[2] });
    } catch (error) {
      result.errors.push({
        row,
        message: error instanceof Error ? error.message : '词条格式不正确。',
      });
      return;
    }

    const key = personalWordKey(word.term, word.reading);
    const previous = firstRowByKey.get(key);
    if (previous) {
      if (previous.meaning === word.meaning) result.duplicateCount++;
      else result.errors.push({ row, message: `与第${previous.row}行词形和读音相同，但中文释义不同。` });
      return;
    }

    firstRowByKey.set(key, { meaning: word.meaning, row });
    result.words.push(word);
  });

  return result;
}
