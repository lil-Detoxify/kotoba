import { reactive } from 'vue';
import type { ExerciseType, InputQuizType } from '@jp/models';
import type { StorageAdapter } from '../adapters/types';
import { defaultStorage } from '../adapters';

export type MiniStudyExercise = ExerciseType | InputQuizType | 'cloze';
export type MiniStudyPreference = MiniStudyExercise | 'auto';
export const MINI_STUDY_EXERCISE_KEY = 'kotobud.miniprogram.study.exercise.v1';
export const MINI_STUDY_EXERCISE_OPTIONS: readonly { value: MiniStudyPreference; label: string }[] = [
  { value: 'auto', label: '跟随学习任务' }, { value: 'card', label: '经典卡片' }, { value: 'mixed', label: '混合复习' },
  { value: 'kana-meaning', label: '假名选中文' }, { value: 'kanji-reading', label: '汉字选假名' }, { value: 'audio-meaning', label: '听音选中文' },
  { value: 'kana-input', label: '假名键入' }, { value: 'dictation', label: '听写' }, { value: 'cloze', label: '例句填空' },
];
export function isMiniStudyExercise(value: unknown): value is MiniStudyExercise {
  return typeof value === 'string' && value !== 'auto' && MINI_STUDY_EXERCISE_OPTIONS.some(option => option.value === value);
}
export function createMiniStudyExercisePreference(storage: Pick<StorageAdapter, 'getItem' | 'setItem'> = defaultStorage) {
  const state = reactive<{ value: MiniStudyPreference }>({ value: 'auto' });
  async function load(): Promise<void> {
    try {
      const stored = await storage.getItem(MINI_STUDY_EXERCISE_KEY);
      state.value = isMiniStudyExercise(stored) || stored === 'auto' ? stored : 'auto';
    } catch { state.value = 'auto'; }
  }
  async function set(value: MiniStudyPreference): Promise<void> {
    if (!MINI_STUDY_EXERCISE_OPTIONS.some(option => option.value === value)) return;
    await storage.setItem(MINI_STUDY_EXERCISE_KEY, value);
    state.value = value;
  }
  return { state, load, set };
}
export const miniStudyExercisePreference = createMiniStudyExercisePreference();
