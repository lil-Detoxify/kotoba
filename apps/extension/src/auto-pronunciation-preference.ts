import { ref, type Ref } from 'vue';

export const EXTENSION_AUTO_PRONUNCIATION_KEY = 'kotobud.extension.auto-pronunciation.v1';

const enabled = ref(true);
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const saved = globalThis.localStorage?.getItem(EXTENSION_AUTO_PRONUNCIATION_KEY);
    if (saved === 'true') enabled.value = true;
    else if (saved === 'false') enabled.value = false;
  } catch {
    // Keep the default enabled when extension storage is unavailable.
  }
}

export function useAutoPronunciationPreference(): {
  enabled: Ref<boolean>;
  setEnabled: (value: boolean) => void;
} {
  load();
  function setEnabled(value: boolean): void {
    if (typeof value !== 'boolean') return;
    enabled.value = value;
    try {
      globalThis.localStorage?.setItem(EXTENSION_AUTO_PRONUNCIATION_KEY, String(value));
    } catch {
      // Keep the in-memory preference usable when persistence fails.
    }
  }
  return { enabled, setEnabled };
}
