import { reactive } from "vue";
import type { DailyPace } from "../../../web/src/services/study-plan-preference";
import { UniStorageAdapter } from "../adapters/storage";
import type { StorageAdapter } from "../adapters/types";

export type { DailyPace };
export const MINI_STUDY_PLAN_KEY = "kotobud.miniprogram.study-plan.v1";

type PreferenceStorage = Pick<StorageAdapter, "getItem" | "setItem">;

function isDailyPace(value: unknown): value is DailyPace {
  return value === 0.5 || value === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createMiniStudyPlanPreference(storage?: PreferenceStorage) {
  const state = reactive<{ paces: Record<string, DailyPace>; ready: boolean }>({ paces: {}, ready: false });
  let adapter = storage;
  let loadPromise: Promise<void> | undefined;
  let writeQueue: Promise<void> = Promise.resolve();
  let saveVersion = 0;

  function getStorage(): PreferenceStorage {
    if (!adapter) adapter = new UniStorageAdapter();
    return adapter;
  }

  function getPace(bookId: string): DailyPace {
    return state.paces[bookId] ?? 1;
  }

  async function load(): Promise<void> {
    if (state.ready) return;
    if (!loadPromise) {
      const versionAtStart = saveVersion;
      const attempt = (async () => {
        const stored = await getStorage().getItem(MINI_STUDY_PLAN_KEY);
        let paces: Record<string, DailyPace> = {};
        try {
          if (stored) {
            const parsed: unknown = JSON.parse(stored);
            if (isRecord(parsed)) {
              for (const [bookId, value] of Object.entries(parsed)) {
                if (bookId && isDailyPace(value)) paces[bookId] = value;
              }
            }
          }
        } catch {
          // Malformed stored preferences fall back to the default pace.
        }
        if (saveVersion === versionAtStart) state.paces = paces;
        state.ready = true;
      })();
      loadPromise = attempt.catch((error: unknown) => {
        loadPromise = undefined;
        throw error;
      });
    }
    await loadPromise;
  }

  async function setPace(bookId: string, value: DailyPace): Promise<void> {
    if (!bookId || !isDailyPace(value)) return;
    await load();
    const operation = writeQueue.then(async () => {
      const paces = { ...state.paces, [bookId]: value };
      await getStorage().setItem(MINI_STUDY_PLAN_KEY, JSON.stringify(paces));
      state.paces = paces;
      saveVersion += 1;
    });
    writeQueue = operation.catch(() => undefined);
    await operation;
  }

  return { state, load, getPace, setPace };
}

export const miniStudyPlanPreference = createMiniStudyPlanPreference();
