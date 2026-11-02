import { ref, type Ref } from 'vue';

const STORAGE_KEY = 'jp-vocab.word-autoplay.v1';

function readEnabled(): boolean {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    return saved === 'false' ? false : true;
  } catch {
    return true;
  }
}

const enabled = ref(readEnabled());

export function useWordAutoplayPreference(): {
  enabled: Ref<boolean>;
  setEnabled(value: boolean): void;
} {
  function setEnabled(value: boolean): void {
    if (typeof value !== 'boolean') return;
    enabled.value = value;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, String(value));
    } catch {
      // Keep the in-memory preference usable when local storage is unavailable.
    }
  }

  return { enabled, setEnabled };
}
