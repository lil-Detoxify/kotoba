import type { Data, Word } from '@jp/models';
import { normalizeVocabularySearchText } from '@jp/shared';
import type { LearningExample } from './learning-example';
import payload from '../learning-scenes.json';

export interface SceneItem { bookId: string; term: string; reading: string; example: LearningExample & { cloze: { answer: string; reading: string } } }
export interface LearningScene {
  id: string; title: string; description: string; canDo: string[];
  icon: 'shopping' | 'dining' | 'directions' | 'lodging' | 'meeting' | 'weather';
  dialogue: Array<{ speaker: string; ja: string; reading: string; zh: string }>;
  expressions: Array<{ ja: string; reading: string; zh: string; note: string }>;
  items: SceneItem[];
}

export const learningScenes: LearningScene[] = payload as LearningScene[];
export function sceneFor(id?: string): LearningScene | undefined {
  return learningScenes.find(scene => scene.id === id);
}
const key = (term: string, reading: string) => JSON.stringify([normalizeVocabularySearchText(term), normalizeVocabularySearchText(reading)]);

export function resolveSceneWords(scene: LearningScene, data: Pick<Data, 'lessons' | 'words'>): Array<{ word: Word; item: SceneItem }> {
  const bookByLesson = new Map(data.lessons.map(lesson => [lesson.id, lesson.bookId]));
  const available = new Map<string, Word>();
  for (const word of data.words) {
    const lookup = `${bookByLesson.get(word.lessonId)}\0${key(word.term, word.reading)}`;
    if (!available.has(lookup)) available.set(lookup, word);
  }
  return scene.items.flatMap(item => {
    const word = available.get(`${item.bookId}\0${key(item.term, item.reading)}`);
    return word ? [{ word, item }] : [];
  });
}

export function sceneExampleFor(sceneId: string | undefined, word: Pick<Word, 'term' | 'reading' | 'lessonId'>): LearningExample | undefined {
  return sceneFor(sceneId)?.items.find(item => word.lessonId.startsWith(`${item.bookId}-l-`) && key(item.term, item.reading) === key(word.term, word.reading))?.example;
}
