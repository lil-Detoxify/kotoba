import { ref, type Ref } from 'vue';

export type HomeDisplay = 'today' | 'review' | 'progress';

export const HOME_DISPLAY_OPTIONS = [
  { value: 'today', label: '今日待学', description: '按这本词书的每日计划，显示今天还需新学的词数。' },
  { value: 'review', label: '待复习', description: '突出现在需要复习的词数与入口。' },
  { value: 'progress', label: '词书进度', description: '突出词书的学习进度。' },
] as const;

const STORAGE_KEY = 'kotobud.web.home-display.v1';
const preference = ref<HomeDisplay>('review');
let loaded = false;

function isHomeDisplay(value: unknown): value is HomeDisplay {
  return value === 'today' || value === 'review' || value === 'progress';
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (isHomeDisplay(saved)) preference.value = saved;
  } catch {
    // Keep the in-memory default when local storage is unavailable.
  }
}

export function useHomeDisplayPreference(): { display: Ref<HomeDisplay>; setDisplay: (value: HomeDisplay) => void } {
  load();
  function setDisplay(value: HomeDisplay): void {
    if (!isHomeDisplay(value)) return;
    preference.value = value;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, value);
    } catch {
      // The in-memory preference remains usable when persistence fails.
    }
  }
  return { display: preference, setDisplay };
}
