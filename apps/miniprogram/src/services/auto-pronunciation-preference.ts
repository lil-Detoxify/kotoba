import { reactive } from "vue";
import { defaultStorage } from "../adapters";
import type { StorageAdapter } from "../adapters/types";

export const MINI_AUTO_PRONUNCIATION_KEY = "kotobud.miniprogram.study.auto-pronunciation.v1";

export function shouldAutoPronounceOnEntry(exercise: string, questionType?: string, inputType?: string): boolean {
  if (exercise === "cloze") return false;
  if (inputType) return inputType === "dictation";
  return questionType !== "kanji-reading";
}

export function shouldAutoPronounceAfterReveal(exercise: string, questionType?: string, inputType?: string): boolean {
  return exercise === "cloze" || inputType === "kana-input" || questionType === "kanji-reading";
}

/** Device-local study behavior; this preference is never added to learning data or sync. */
export function createMiniAutoPronunciationPreference(
  storage: Pick<StorageAdapter, "getItem" | "setItem"> = defaultStorage,
) {
  const state = reactive({ enabled: true, ready: false });
  let revision = 0;
  let reading: Promise<void> | undefined;

  async function load(): Promise<void> {
    if (reading) return reading;
    const beforeRead = revision;
    reading = (async () => {
      try {
        const saved = await storage.getItem(MINI_AUTO_PRONUNCIATION_KEY);
        if (beforeRead === revision) state.enabled = saved !== "0";
      } catch {
        // Keep the default enabled state if local storage is unavailable.
      } finally {
        state.ready = true;
      }
    })().finally(() => { reading = undefined; });
    return reading;
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    await storage.setItem(MINI_AUTO_PRONUNCIATION_KEY, enabled ? "1" : "0");
    revision++;
    state.enabled = enabled;
    state.ready = true;
  }

  return { state, load, setEnabled };
}

export function createMiniStudyAutoPronunciationGate() {
  const spoken = new Set<string>();
  return {
    reset(): void { spoken.clear(); },
    claim(owner: string, wordId: string): boolean {
      if (!owner || !wordId) return false;
      const key = `${owner}\u0000${wordId}`;
      if (spoken.has(key)) return false;
      spoken.add(key);
      return true;
    },
  };
}

export const miniAutoPronunciationPreference = createMiniAutoPronunciationPreference();
