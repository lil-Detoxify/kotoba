import type { Lesson, Word } from '@jp/models';
import { GRAMMAR_BOOK_ID, LOWER_GRAMMAR_BOOK_ID } from '@jp/shared/grammar';

export const grammarVolumes = [
  { id: GRAMMAR_BOOK_ID, label: '初级上', first: 1, last: 24 },
  { id: LOWER_GRAMMAR_BOOK_ID, label: '初级下', first: 25, last: 48 },
] as const;

export function grammarAfterVocabulary(lessons: readonly Lesson[], newWords: readonly Word[]) {
  const lessonId = newWords[0]?.lessonId;
  if (!lessonId || newWords.some(word => word.lessonId !== lessonId)) return;
  const lesson = lessons.find(row => row.id === lessonId);
  if (!lesson) return;
  const volume = grammarVolumes.find(row => row.id === lesson.bookId);
  if (!volume || lesson.order < volume.first || lesson.order > volume.last) return;
  return { order: lesson.order, label: volume.label, href: `/grammar/${volume.id}/${lesson.order}` };
}
