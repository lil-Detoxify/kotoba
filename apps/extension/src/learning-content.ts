import { initialState } from '@jp/core';
import type { Lesson, WordState } from '@jp/models';
import { bookIdForWord } from './learning';
import type { ExtensionSnapshot, ExtensionWord, StudyQueueItem } from './model';
import { resolveSceneWords, sceneFor } from '../../web/src/services/learning-scenes';
import type { SceneItem } from '../../web/src/services/learning-scenes';

export { sceneExampleFor, sceneFor } from '../../web/src/services/learning-scenes';

interface ResolvedExtensionSceneWord {
  word: ExtensionWord;
  item: SceneItem;
  state: WordState;
}

function currentUserId(snapshot: ExtensionSnapshot): string {
  return snapshot.identity?.userId || snapshot.learning.userSettings?.userId || 'local';
}

function extensionSceneWords(words: ExtensionWord[], snapshot: ExtensionSnapshot): ExtensionWord[] {
  const byId = new Map<string, ExtensionWord>();
  for (const word of words) if (!byId.has(word.id)) byId.set(word.id, word);
  for (const word of snapshot.learning.words) byId.set(word.id, word);
  return [...byId.values()];
}

function lessonsForWords(words: ExtensionWord[]): Lesson[] {
  const lessons = new Map<string, Lesson>();
  for (const word of words) {
    if (lessons.has(word.lessonId)) continue;
    const match = word.lessonId.match(/-l-(\d+)$/);
    lessons.set(word.lessonId, {
      id: word.lessonId,
      bookId: bookIdForWord(word),
      title: word.lessonTitle || word.lessonId,
      order: match ? Number(match[1]) : word.order,
    });
  }
  return [...lessons.values()];
}

function statesForSnapshot(snapshot: ExtensionSnapshot, userId: string): Map<string, WordState> {
  const states = new Map<string, WordState>();
  for (const state of snapshot.learning.states) {
    if (state.userId === userId && !states.has(state.wordId)) states.set(state.wordId, state);
  }
  // SavedWord.state is a legacy mirror; keep it only when canonical state is absent.
  for (const saved of snapshot.words) {
    if (saved.state.userId === userId && !states.has(saved.word.id)) states.set(saved.word.id, saved.state);
  }
  return states;
}

function resolvedSceneWords(
  sceneId: string | undefined,
  words: ExtensionWord[],
  snapshot: ExtensionSnapshot,
): ResolvedExtensionSceneWord[] {
  const scene = sceneFor(sceneId);
  if (!scene) return [];

  const candidates = extensionSceneWords(words, snapshot);
  const candidatesById = new Map(candidates.map(word => [word.id, word]));
  const userId = currentUserId(snapshot);
  const states = statesForSnapshot(snapshot, userId);
  const now = new Date();
  return resolveSceneWords(scene, { lessons: lessonsForWords(candidates), words: candidates })
    .flatMap(({ word: resolvedWord, item }) => {
      const word = candidatesById.get(resolvedWord.id);
      if (!word) return [];
      const existing = states.get(word.id);
      if (existing?.isIgnored) return [];
      const state = existing ?? {
        ...initialState(word.id, now, userId),
        bookId: bookIdForWord(word),
        lessonId: word.lessonId,
      };
      return [{ word, item, state }];
    });
}

/** Resolve approved scene words through the shared Web matcher and this partition's learning state. */
export function resolveExtensionSceneWords(
  sceneId: string | undefined,
  words: ExtensionWord[],
  snapshot: ExtensionSnapshot,
): Array<{ word: ExtensionWord; item: SceneItem }> {
  return resolvedSceneWords(sceneId, words, snapshot).map(({ word, item }) => ({ word, item }));
}

/** Build all eligible scene cards in the curated scene order, regardless of learning status. */
export function sceneStudyQueue(
  sceneId: string | undefined,
  words: ExtensionWord[],
  snapshot: ExtensionSnapshot,
): StudyQueueItem[] {
  return resolvedSceneWords(sceneId, words, snapshot).map(({ word, state }) => ({ word, state }));
}
