import type { Data, Word } from '@jp/models';
import { resolveSceneWords, type LearningScene } from '../../../web/src/services/learning-scenes';
export { learningScenes, sceneFor, resolveSceneWords, sceneExampleFor } from '../../../web/src/services/learning-scenes';
export type { LearningScene, SceneItem } from '../../../web/src/services/learning-scenes';
export {
  taskForScene, createSceneTaskRun, currentSceneTaskStep, confirmSceneTaskAnswer,
  advanceSceneTask, summarizeSceneTask, retrySceneTaskMistakes,
  previousSceneTaskSteps, correctSceneTaskOption,
} from '../../../web/src/services/scene-task';
export type { SceneTaskRun } from '../../../web/src/services/scene-task';

/** A topic keeps the original book identities, including words already studied. */
export function sceneStudyWords(scene: LearningScene, data: Pick<Data, 'words' | 'lessons' | 'states'>): Word[] {
  const ignored = new Set(data.states.filter(state => state.isIgnored).map(state => state.wordId));
  return [...new Map(resolveSceneWords(scene, data)
    .filter(({ word }) => !ignored.has(word.id)).map(({ word }) => [word.id, word])).values()];
}
