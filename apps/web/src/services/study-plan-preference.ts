import { ref, type Ref } from 'vue';

export type DailyPace = 0.5 | 1;

const STORAGE_KEY = 'kotobud.web.study-plan.v1';
const paces = ref<Record<string, DailyPace>>({});
let loaded = false;

function isDailyPace(value: unknown): value is DailyPace {
  return value === 0.5 || value === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return;
    const restored: Record<string, DailyPace> = {};
    for (const [bookId, value] of Object.entries(parsed)) {
      if (bookId && isDailyPace(value)) restored[bookId] = value;
    }
    paces.value = restored;
  } catch {
    // Keep an empty in-memory plan when storage is unavailable or invalid.
  }
}

export function useStudyPlanPreference(): {
  paces: Ref<Record<string, DailyPace>>;
  getPace: (bookId: string) => DailyPace;
  setPace: (bookId: string, value: DailyPace) => void;
} {
  load();
  function getPace(bookId: string): DailyPace {
    return paces.value[bookId] ?? 1;
  }
  function setPace(bookId: string, value: DailyPace): void {
    if (!bookId || !isDailyPace(value)) return;
    paces.value = { ...paces.value, [bookId]: value };
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(paces.value));
    } catch {
      // Keep the in-memory plan usable when persistence fails.
    }
  }
  return { paces, getPace, setPace };
}
