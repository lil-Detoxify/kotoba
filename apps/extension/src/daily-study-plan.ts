import { emptyData, type Book, type Lesson, type Word, type WordState } from '@jp/models';
import { dailyStudyPlan } from '../../web/src/services/daily-study-plan';
import type { DailyStudyPlan } from '../../web/src/services/daily-study-plan';
import type { DailyPace } from './study-plan-preference';
import { bookIdForWord, listLearningBooks } from './learning';
import type { ExtensionSnapshot, ExtensionWord } from './model';

export type { DailyStudyPlan };

/** Build the extension's current-partition view and use the shared Web plan rules. */
export function extensionDailyStudyPlan(
  words: ExtensionWord[],
  snapshot: ExtensionSnapshot,
  bookId: string,
  pace: DailyPace,
  now = new Date(),
): DailyStudyPlan {
  const currentUserId = snapshot.identity?.userId || snapshot.learning.userSettings?.userId || 'local';
  const wordsById = new Map<string, ExtensionWord>();
  for (const word of words) wordsById.set(word.id, word);
  // Imported personal-book words take precedence over a catalog entry with the same id.
  for (const word of snapshot.learning.words) wordsById.set(word.id, word);
  const extensionWords = [...wordsById.values()];

  const data = emptyData();
  const createdAt = snapshot.learning.userSettings?.updatedAt ?? '1970-01-01T00:00:00.000Z';
  data.books = listLearningBooks(extensionWords, snapshot.learning.books).map((book): Book => ({
    id: book.id,
    title: book.title,
    description: book.description,
    language: 'ja',
    createdAt: book.createdAt ?? createdAt,
    updatedAt: book.createdAt ?? createdAt,
  }));

  const lessonsById = new Map<string, Lesson>();
  for (const word of extensionWords) {
    const match = word.lessonId.match(/-l-(\d+)$/);
    const order = match ? Number(match[1]) : word.order;
    const existing = lessonsById.get(word.lessonId);
    if (!existing) {
      lessonsById.set(word.lessonId, {
        id: word.lessonId,
        bookId: bookIdForWord(word),
        title: word.lessonTitle || word.lessonId,
        order,
      });
    } else {
      existing.order = Math.min(existing.order, order);
    }
  }
  for (const lesson of snapshot.learning.lessons ?? []) lessonsById.set(lesson.id, { ...lesson });
  data.lessons = [...lessonsById.values()].sort((a, b) =>
    a.bookId.localeCompare(b.bookId) || a.order - b.order || a.id.localeCompare(b.id),
  );
  data.words = extensionWords.map(({ source: _source, bookId: _bookId, bookTitle: _bookTitle, lessonTitle: _lessonTitle, ...word }): Word => word);

  const statesByWordId = new Map<string, WordState>();
  for (const state of snapshot.learning.states) {
    if (state.userId === currentUserId && !statesByWordId.has(state.wordId)) {
      statesByWordId.set(state.wordId, state);
    }
  }
  // SavedWord.state is a legacy mirror. Keep it only when this partition has no canonical state.
  for (const saved of snapshot.words) {
    if (saved.state.userId === currentUserId && !statesByWordId.has(saved.word.id)) {
      statesByWordId.set(saved.word.id, saved.state);
    }
  }
  data.states = [...statesByWordId.values()];
  data.seeded = true;

  return dailyStudyPlan(data, bookId, pace, now, currentUserId);
}
