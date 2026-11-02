export {
  ANSWER_SOUND_OPTIONS,
  previewAnswerSound,
  stopAnswerSound,
  useAnswerSoundPreference,
} from '../../web/src/services/answer-sound';

import { playAnswerSound as playWebAnswerSound, stopAnswerSound } from '../../web/src/services/answer-sound';

export function playAnswerSound(correct: boolean): Promise<boolean> {
  if (typeof document !== 'undefined' && document.hidden) {
    stopAnswerSound();
    return Promise.resolve(false);
  }
  return playWebAnswerSound(correct);
}

export type { AnswerSoundPreference, AnswerSoundScheme } from '../../web/src/services/answer-sound';
