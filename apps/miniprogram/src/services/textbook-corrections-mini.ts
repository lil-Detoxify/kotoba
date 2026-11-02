import type { Word } from "@jp/models";
import runtime from "./textbook-corrections-runtime.json";

type RuntimeEntry = {
  wordId: string;
  bookId: string;
  lessonOrder: number;
  previous: { term: string };
  corrected: Pick<Word, "term" | "reading" | "meaning"> & Partial<Pick<Word, "partOfSpeech">>;
};

type RuntimeCatalog = { version: string; entries: RuntimeEntry[] };
const catalog = runtime as RuntimeCatalog;
const corrections = new Map(catalog.entries.map((entry) => [entry.wordId, entry]));

export const miniTextbookCorrectionsVersion = catalog.version;
export const knownTextbookCorrectionIds: ReadonlySet<string> = new Set(corrections.keys());

/** Keep the Web stable-ID correction semantics without bundling its editorial catalog. */
export function correctMiniTextbookWords(words: Word[]): void {
  for (const word of words) {
    const entry = corrections.get(word.id);
    if (!entry || word.lessonId !== `${entry.bookId}-l-${entry.lessonOrder}`) continue;
    Object.assign(word, entry.corrected);
    if (entry.previous.term !== entry.corrected.term) {
      word.rawTerm = entry.corrected.term;
      if (word.audioTerm) word.audioTerm = entry.corrected.term;
    }
  }
}
