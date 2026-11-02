import type { Data, Word } from '@jp/models';
import { normalizeVocabularySearchText } from '@jp/shared';
import { conjugationFor, type VerbDefinition } from './conjugation';
import { learningScenes, type LearningScene } from './learning-scenes';

export type LessonPracticeRecommendation =
  | { kind: 'scene'; scene: LearningScene; words: Word[]; href: string }
  | { kind: 'conjugation'; verb: VerbDefinition; words: [Word]; href: string };

export function lessonPracticeRecommendation(
  data: Pick<Data, 'lessons' | 'words'>,
  completedWords: readonly Word[],
  options: { excludeSceneId?: string; ignoredWordIds?: ReadonlySet<string> } = {},
): LessonPracticeRecommendation | undefined {
  const ignored = options.ignoredWordIds ?? new Set<string>();
  const bookByLesson = new Map(data.lessons.map(lesson => [lesson.id, lesson.bookId]));
  const completedByIdentity = new Map<string, Word>();

  for (const word of completedWords) {
    if (ignored.has(word.id)) continue;
    const bookId = bookByLesson.get(word.lessonId);
    if (!bookId) continue;
    const key = identityKey(bookId, word.term, word.reading);
    if (!completedByIdentity.has(key)) completedByIdentity.set(key, word);
  }

  let best: { scene: LearningScene; words: Word[]; ratio: number } | undefined;
  for (const scene of learningScenes) {
    if (scene.id === options.excludeSceneId) continue;
    const words: Word[] = [];
    const seenItems = new Set<string>();
    for (const item of scene.items) {
      const key = identityKey(item.bookId, item.term, item.reading);
      if (seenItems.has(key)) continue;
      seenItems.add(key);
      const word = completedByIdentity.get(key);
      if (word) words.push(word);
    }

    if (words.length < 2) continue;
    const ratio = words.length / Math.max(1, seenItems.size);
    if (!best || words.length > best.words.length || (words.length === best.words.length && ratio > best.ratio)) {
      best = { scene, words, ratio };
    }
  }

  if (best) {
    return { kind: 'scene', scene: best.scene, words: best.words, href: `/scenes/${encodeURIComponent(best.scene.id)}` };
  }

  for (const word of completedWords) {
    if (ignored.has(word.id)) continue;
    const verb = conjugationFor(word);
    if (verb) {
      return {
        kind: 'conjugation',
        verb,
        words: [word],
        href: `/conjugation?verb=${encodeURIComponent(verb.id)}&return=study`,
      };
    }
  }

  return undefined;
}

function identityKey(bookId: string, term: string, reading: string): string {
  return JSON.stringify([
    bookId,
    normalizeVocabularySearchText(term),
    normalizeVocabularySearchText(reading),
  ]);
}
