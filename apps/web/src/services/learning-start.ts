import { ref } from 'vue';
import type { Data } from '@jp/models';
import type { DailyPace } from './study-plan-preference';

export type LearningStartPath = 'textbook' | 'jlpt' | 'everyday';

export const LEARNING_START_PATHS: ReadonlyArray<{ id: LearningStartPath; title: string; description: string }> = [
  { id: 'textbook', title: '跟教材学', description: '跟着标日课次认识词汇，把每天的节奏定下来。' },
  { id: 'jlpt', title: 'JLPT备考', description: '从正在准备的级别开始，按词组逐步积累。' },
  { id: 'everyday', title: '日常用语', description: '从购物、点餐和问路开始，把词放进生活里。' },
];

const bookIds: Record<LearningStartPath, readonly string[]> = {
  textbook: ['biaori-beginner-upper', 'biaori-beginner-lower', 'biaori-intermediate-upper', 'biaori-intermediate-lower', 'biaori-advanced-upper', 'biaori-advanced-lower'],
  jlpt: ['jlpt-n5', 'jlpt-n4', 'jlpt-n3', 'jlpt-n2', 'jlpt-n1'],
  everyday: [],
};

interface StartBook {
  id: string;
  title: string;
  wordCount: number;
  lessons: ReadonlyArray<{ order: number; wordCount: number }>;
}

/** Recommendations reuse the catalog and its original identities. */
export function recommendedStartBooks<T extends StartBook>(path: LearningStartPath, books: readonly T[]): T[] {
  const catalog = new Map(books.map(book => [book.id, book]));
  return bookIds[path].flatMap(id => {
    const book = catalog.get(id);
    return book ? [book] : [];
  });
}

/** A preview of the first lesson, rather than an imposed daily word limit. */
export function firstLessonTarget(book: StartBook | undefined, pace: DailyPace): number {
  const first = book?.lessons.slice().sort((left, right) => left.order - right.order)[0];
  const size = first?.wordCount;
  if (size === undefined || !Number.isFinite(size) || size <= 0) return 0;
  return Math.ceil(size * pace);
}

export function shouldShowLearningStart(
  data: Pick<Data, 'states' | 'logs'>,
  options: { ready: boolean; hasCheckpoint: boolean; dismissed: boolean },
): boolean {
  return options.ready && !options.hasCheckpoint && !options.dismissed && !data.logs.length
    && !data.states.some(state => !!state.firstSeenAt || state.reviewCount > 0);
}

const storageKey = 'kotobud.web.learning-start.v1';
const dismissedOwners = ref<Record<string, true>>({});
let loaded = false;

function loadPreference(): void {
  if (loaded) return;
  loaded = true;
  try {
    const saved = globalThis.localStorage?.getItem(storageKey);
    if (!saved) return;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const restored: Record<string, true> = {};
    for (const [owner, value] of Object.entries(parsed)) if (owner && value === true) restored[owner] = true;
    dismissedOwners.value = restored;
  } catch {
    // The guide remains optional when browser storage is unavailable.
  }
}

export function useLearningStartPreference(): { isDismissed: (owner: string) => boolean; dismiss: (owner: string) => void } {
  loadPreference();
  return {
    isDismissed(owner) { return dismissedOwners.value[owner] === true; },
    dismiss(owner) {
      if (!owner) return;
      dismissedOwners.value = { ...dismissedOwners.value, [owner]: true };
      try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(dismissedOwners.value)); }
      catch { /* Keep this visit usable even if the preference cannot be saved. */ }
    },
  };
}
