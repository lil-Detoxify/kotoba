import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = new Map<string, string>();

function installStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
}

async function loadPreferencesModule() {
  vi.resetModules();
  return import('../apps/web/src/services/dictionary-preferences');
}

describe('web dictionary comparison preferences', () => {
  beforeEach(() => {
    stored.clear();
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('orders, hides, and restores the preferred source from local storage', async () => {
    const initialModule = await loadPreferencesModule();
    stored.set(initialModule.DICTIONARY_PREFERENCES_KEY, JSON.stringify({
      order: ['wiktionary-ja', 'tomoshi', 'jmdict'],
      hidden: ['tomoshi'],
      preferredSource: 'tomoshi',
    }));

    const { useDictionaryPreferences } = await loadPreferencesModule();
    const preferences = useDictionaryPreferences();
    expect(preferences.preferences.value).toMatchObject({
      order: ['wiktionary-ja', 'tomoshi', 'jmdict'],
      hidden: ['tomoshi'],
      preferredSource: 'wiktionary-ja',
    });

    preferences.setPreferredSource('tomoshi');
    preferences.moveSource('tomoshi', -1);
    preferences.setSourceEnabled('jmdict', false);
    expect(preferences.preferences.value).toMatchObject({
      order: ['tomoshi', 'wiktionary-ja', 'jmdict'],
      hidden: ['jmdict'],
      preferredSource: 'tomoshi',
    });

    const reloaded = await loadPreferencesModule();
    const restored = reloaded.useDictionaryPreferences();
    expect(restored.preferences.value).toMatchObject({
      order: ['tomoshi', 'wiktionary-ja', 'jmdict'],
      hidden: ['jmdict'],
      preferredSource: 'tomoshi',
    });
    expect(restored.enabledSources.value.map(source => source.id)).toEqual(['tomoshi', 'wiktionary-ja']);
  });

  it('repairs invalid saved IDs and keeps at least one source enabled', async () => {
    const { normalizeDictionaryPreferences, useDictionaryPreferences } = await loadPreferencesModule();
    expect(normalizeDictionaryPreferences({
      order: ['unknown', 'tomoshi', 'tomoshi'],
      hidden: ['tomoshi', 'jmdict', 'wiktionary-ja', 'unknown'],
      preferredSource: 'unknown',
    })).toEqual({
      order: ['tomoshi', 'jmdict', 'wiktionary-ja'],
      hidden: ['jmdict', 'wiktionary-ja'],
      preferredSource: 'tomoshi',
    });

    const preferences = useDictionaryPreferences();
    expect(preferences.setSourceEnabled('tomoshi', false)).toBe(true);
    expect(preferences.setSourceEnabled('jmdict', false)).toBe(true);
    expect(preferences.setSourceEnabled('wiktionary-ja', false)).toBe(false);
    expect(preferences.enabledSources.value.map(source => source.id)).toEqual(['wiktionary-ja']);
  });
});
