import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('extension auto-pronunciation preference', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('defaults to enabled and persists the setting on this device', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    try {
      const { EXTENSION_AUTO_PRONUNCIATION_KEY, useAutoPronunciationPreference } = await import('../apps/extension/src/auto-pronunciation-preference');
      const preference = useAutoPronunciationPreference();
      expect(preference.enabled.value).toBe(true);
      preference.setEnabled(false);
      expect(values.get(EXTENSION_AUTO_PRONUNCIATION_KEY)).toBe('false');
      preference.setEnabled(true);
      expect(values.get(EXTENSION_AUTO_PRONUNCIATION_KEY)).toBe('true');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('restores a previously disabled preference', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'false', setItem: vi.fn() });
    try {
      const { useAutoPronunciationPreference } = await import('../apps/extension/src/auto-pronunciation-preference');
      expect(useAutoPronunciationPreference().enabled.value).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
