import { ref, type Ref } from 'vue';
import type { HomeDisplay } from '../../web/src/services/home-display-preference';

export { HOME_DISPLAY_OPTIONS } from '../../web/src/services/home-display-preference';
export type { HomeDisplay };

export const EXTENSION_HOME_DISPLAY_KEY = 'kotobud.extension.home-display.v1';

const preference = ref<HomeDisplay>('review');
let loaded = false;

function isHomeDisplay(value: unknown): value is HomeDisplay {
  return value === 'today' || value === 'review' || value === 'progress';
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const saved = globalThis.localStorage?.getItem(EXTENSION_HOME_DISPLAY_KEY);
    if (isHomeDisplay(saved)) preference.value = saved;
  } catch {
    // Keep the in-memory default when extension storage is unavailable.
  }
}

export function useHomeDisplayPreference(): {
  display: Ref<HomeDisplay>;
  setDisplay: (value: HomeDisplay) => void;
} {
  load();
  function setDisplay(value: HomeDisplay): void {
    if (!isHomeDisplay(value)) return;
    preference.value = value;
    try {
      globalThis.localStorage?.setItem(EXTENSION_HOME_DISPLAY_KEY, value);
    } catch {
      // Keep the in-memory preference usable when persistence fails.
    }
  }
  return { display: preference, setDisplay };
}
