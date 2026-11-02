import { reactive } from "vue";
import { UniStorageAdapter } from "../adapters/storage";
import type { StorageAdapter } from "../adapters/types";

export type MiniHomeDisplay = "today" | "review" | "progress";
export const MINI_HOME_DISPLAY_KEY = "kotobud.miniprogram.home-display.v1";
export const MINI_HOME_DISPLAY_OPTIONS: readonly {
  value: MiniHomeDisplay;
  label: string;
  description: string;
}[] = [
  { value: "today", label: "今日待学", description: "按这本词书的每日计划，显示今天还需新学的词数。" },
  { value: "review", label: "待复习", description: "突出现在需要复习的词数与入口。" },
  { value: "progress", label: "词书进度", description: "突出词书的学习进度。" },
];

type PreferenceStorage = Pick<StorageAdapter, "getItem" | "setItem">;

function isMiniHomeDisplay(value: unknown): value is MiniHomeDisplay {
  return value === "today" || value === "review" || value === "progress";
}

export function createMiniHomeDisplayPreference(storage?: PreferenceStorage) {
  const state = reactive<{ value: MiniHomeDisplay; ready: boolean }>({ value: "review", ready: false });
  let adapter = storage;
  let loadPromise: Promise<void> | undefined;
  let writeQueue: Promise<void> = Promise.resolve();
  let saveVersion = 0;

  function getStorage(): PreferenceStorage {
    if (!adapter) adapter = new UniStorageAdapter();
    return adapter;
  }

  async function load(): Promise<void> {
    if (state.ready) return;
    if (!loadPromise) {
      const versionAtStart = saveVersion;
      const attempt = (async () => {
        const stored = await getStorage().getItem(MINI_HOME_DISPLAY_KEY);
        try {
          if (saveVersion === versionAtStart && isMiniHomeDisplay(stored)) state.value = stored;
        } catch {
          // Keep the default display for values outside the supported set.
        }
        state.ready = true;
      })();
      loadPromise = attempt.catch((error: unknown) => {
        loadPromise = undefined;
        throw error;
      });
    }
    await loadPromise;
  }

  async function set(value: MiniHomeDisplay): Promise<void> {
    if (!isMiniHomeDisplay(value)) return;
    await load();
    const operation = writeQueue.then(async () => {
      await getStorage().setItem(MINI_HOME_DISPLAY_KEY, value);
      state.value = value;
      saveVersion += 1;
    });
    writeQueue = operation.catch(() => undefined);
    await operation;
  }

  return { state, load, set };
}

export const miniHomeDisplayPreference = createMiniHomeDisplayPreference();
