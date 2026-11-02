import { ref, type Ref } from 'vue';
import type { WebExerciseType } from './study-session';

export type StudyExercisePreference = 'auto' | WebExerciseType;

export const STUDY_EXERCISE_OPTIONS = [
  { value: 'auto', label: '跟随学习任务', description: '新词使用卡片，复习使用混合题型。' },
  { value: 'card', label: '经典卡片', description: '先看单词，再回忆含义。' },
  { value: 'mixed', label: '混合复习', description: '在不同题型间交替练习。' },
  { value: 'kana-meaning', label: '假名选中文', description: '看假名，选择中文含义。' },
  { value: 'kanji-reading', label: '汉字选假名', description: '看汉字，选择正确读音。' },
  { value: 'audio-meaning', label: '听音选中文', description: '听发音，选择中文含义。' },
  { value: 'kana-input', label: '假名键入', description: '看词形或释义，输入假名读音。' },
  { value: 'dictation', label: '听写', description: '听发音，再自行输入假名。' },
  { value: 'sentence-cloze', label: '例句填空', description: '用例句填空；未配例句的词使用卡片。' },
] as const;

const STORAGE_KEY = 'kotobud.web.study-exercise.v1';
const preference = ref<StudyExercisePreference>('auto');
let loaded = false;

function isStudyExercisePreference(value: unknown): value is StudyExercisePreference {
  return value === 'auto' || STUDY_EXERCISE_OPTIONS.some(option => option.value === value);
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (isStudyExercisePreference(saved)) preference.value = saved;
  } catch {
    // Keep the in-memory default when local storage is unavailable.
  }
}

export function useStudyExercisePreference(): {
  exercise: Ref<StudyExercisePreference>;
  setExercise: (value: StudyExercisePreference) => void;
} {
  load();
  function setExercise(value: StudyExercisePreference): void {
    if (!isStudyExercisePreference(value)) return;
    preference.value = value;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, value);
    } catch {
      // The in-memory preference remains usable when persistence fails.
    }
  }
  return { exercise: preference, setExercise };
}
