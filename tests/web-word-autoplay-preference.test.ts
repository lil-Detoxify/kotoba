import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = new Map<string, string>();
const key = 'jp-vocab.word-autoplay.v1';

function installStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => stored.get(name) ?? null,
    setItem: (name: string, value: string) => { stored.set(name, value); },
  });
}

async function loadPreferenceModule() {
  vi.resetModules();
  return import('../apps/web/src/services/word-autoplay-preference');
}

describe('web word autoplay preference', () => {
  beforeEach(() => {
    stored.clear();
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('defaults to enabled and restores a saved disabled value', async () => {
    expect((await loadPreferenceModule()).useWordAutoplayPreference().enabled.value).toBe(true);

    const initial = await loadPreferenceModule();
    initial.useWordAutoplayPreference().setEnabled(false);
    expect(stored.get(key)).toBe('false');

    expect((await loadPreferenceModule()).useWordAutoplayPreference().enabled.value).toBe(false);
  });

  it('uses the enabled default for invalid data and tolerates unavailable storage', async () => {
    stored.set(key, 'nope');
    expect((await loadPreferenceModule()).useWordAutoplayPreference().enabled.value).toBe(true);

    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('unavailable'); },
      setItem: () => { throw new Error('unavailable'); },
    });
    const preference = (await loadPreferenceModule()).useWordAutoplayPreference();
    expect(preference.enabled.value).toBe(true);
    preference.setEnabled(false);
    expect(preference.enabled.value).toBe(false);
  });

  it('ignores values that are not booleans', async () => {
    const preference = (await loadPreferenceModule()).useWordAutoplayPreference();
    (preference.setEnabled as (value: unknown) => void)('false');
    expect(preference.enabled.value).toBe(true);
    expect(stored.has(key)).toBe(false);
  });
});
