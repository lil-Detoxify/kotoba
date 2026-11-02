import type { Data, QuizType, ReviewLog, Word } from '@jp/models';
import { daysBefore } from '@jp/shared';
import textbookMetadata from '../textbooks-metadata.json';

export interface QuizFeedbackRow {
  id: QuizType;
  title: string;
  total: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  practiceWordIds: string[];
  unresolvedWordIds: string[];
  previewWords: Word[];
}
export interface PracticeFeedbackReport {
  quiz: QuizFeedbackRow[];
  self: { total: number; forgotten: number; uncertain: number; remembered: number };
}

const methods: ReadonlyArray<{ id: QuizType; title: string }> = [
  { id: 'kana-meaning', title: '假名选中文' },
  { id: 'kanji-reading', title: '汉字选假名' },
  { id: 'audio-meaning', title: '听音选中文' },
  { id: 'kana-input', title: '假名键入' },
  { id: 'dictation', title: '听写' },
];
const builtinIds = new Set(textbookMetadata.books.map(book => book.id));
interface WordAttempts { latest: ReviewLog; time: number; incorrect: number }

/** Saved objective answers and subjective grades describe different kinds of feedback. */
export function practiceFeedback(
  data: Data, now: Date, range: 7 | 30, userId = 'local', bookId?: string,
): PracticeFeedbackReport {
  const report: PracticeFeedbackReport = {
    quiz: methods.map(method => ({ ...method, total: 0, correct: 0, incorrect: 0, accuracy: null, practiceWordIds: [], unresolvedWordIds: [], previewWords: [] })),
    self: { total: 0, forgotten: 0, uncertain: 0, remembered: 0 },
  };
  if (!bookId || !data.books.some(book => book.id === bookId) || !Number.isFinite(now.getTime())) return report;
  const firstDay = daysBefore(now, range - 1);
  firstDay.setHours(0, 0, 0, 0);
  const since = firstDay.getTime();
  const lessonBooks = new Map(data.lessons.map(lesson => [lesson.id, lesson.bookId]));
  const words = new Map(data.words.map(word => [word.id, word]));
  const states = new Map(data.states.filter(state => state.userId === userId).map(state => [state.wordId, state]));
  const byMethod = new Map(report.quiz.map(row => [row.id, row]));
  const attempts = new Map<QuizType, Map<string, WordAttempts>>(methods.map(method => [method.id, new Map()]));
  const seen = new Set<string>();

  function inBook(log: ReviewLog): boolean {
    const word = words.get(log.wordId);
    const loadedBook = word && lessonBooks.get(word.lessonId);
    if (loadedBook) return loadedBook === bookId;
    const sourceBookId = log.wordId.split('-w-')[0];
    if (builtinIds.has(sourceBookId)) return sourceBookId === bookId;
    const state = states.get(log.wordId);
    const location = state?.bookId || lessonBooks.get(state?.lessonId ?? '')
      || log.newState?.bookId || lessonBooks.get(log.newState?.lessonId ?? '')
      || log.previousState?.bookId || lessonBooks.get(log.previousState?.lessonId ?? '');
    return location === bookId;
  }

  for (const log of data.logs) {
    if (log.userId !== userId || seen.has(log.id)) continue;
    const time = Date.parse(log.reviewedAt);
    if (!Number.isFinite(time) || time < since || time > now.getTime() || !inBook(log)) continue;
    seen.add(log.id);
    if (log.quiz == null) {
      if (log.rating === 1) { report.self.total++; report.self.forgotten++; }
      else if (log.rating === 2) { report.self.total++; report.self.uncertain++; }
      else if (log.rating === 3 || log.rating === 4) { report.self.total++; report.self.remembered++; }
      continue;
    }
    const row = byMethod.get(log.quiz.type);
    if (!row || typeof log.quiz.isCorrect !== 'boolean') continue;
    row.total++;
    if (log.quiz.isCorrect) row.correct++; else row.incorrect++;
    const byWord = attempts.get(row.id)!;
    const previous = byWord.get(log.wordId);
    byWord.set(log.wordId, {
      latest: !previous || time >= previous.time ? log : previous.latest,
      time: Math.max(time, previous?.time ?? 0),
      incorrect: (previous?.incorrect ?? 0) + (log.quiz.isCorrect ? 0 : 1),
    });
  }

  for (const row of report.quiz) {
    row.accuracy = row.total ? Math.round(row.correct / row.total * 100) : null;
    const pending = [...attempts.get(row.id)!].filter(([id, item]) => !item.latest.quiz!.isCorrect && !states.get(id)?.isIgnored)
      .sort(([leftId, left], [rightId, right]) => right.incorrect - left.incorrect || right.time - left.time
        || (words.get(leftId)?.order ?? Number.MAX_SAFE_INTEGER) - (words.get(rightId)?.order ?? Number.MAX_SAFE_INTEGER)
        || leftId.localeCompare(rightId));
    for (const [id] of pending) {
      const word = words.get(id);
      if (word && lessonBooks.get(word.lessonId) === bookId) {
        row.practiceWordIds.push(id);
        row.previewWords.push(word);
      } else if (builtinIds.has(bookId) && id.startsWith(`${bookId}-w-`)) {
        row.unresolvedWordIds.push(id);
      }
    }
  }
  return report;
}
