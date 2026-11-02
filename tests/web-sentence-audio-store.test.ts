import { describe, expect, it, vi } from 'vitest';
import { createPreparedSentenceAudioStore, type SentenceAudioEntry } from '../apps/web/src/services/sentence-audio';

const entry: SentenceAudioEntry = {
  text: 'ガラスを買いました。',
  female: '/audio/google/v1/a/female.mp3',
  male: '/audio/google/v1/c/male.mp3',
};

describe('prepared sentence audio store', () => {
  it('answers from the cold text index without loading the URL table', () => {
    const load = vi.fn(async (): Promise<readonly SentenceAudioEntry[]> => [entry]);
    const store = createPreparedSentenceAudioStore([entry.text], load);

    expect(store.has('  ガラスを買いました。\n', 'female')).toBe(true);
    expect(store.has('未収録の文。', 'male')).toBe(false);
    expect(store.get(entry.text, 'female')).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('shares one in-flight load across concurrent prepare calls', async () => {
    let resolveEntries!: (entries: readonly SentenceAudioEntry[]) => void;
    const loading = new Promise<readonly SentenceAudioEntry[]>(resolve => { resolveEntries = resolve; });
    const load = vi.fn(() => loading);
    const store = createPreparedSentenceAudioStore([entry.text], load);

    const first = store.prepare();
    const second = store.prepare();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    resolveEntries([entry]);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('retries a failed load and resolves NFC, trim, voice, and asset base after success', async () => {
    let attempt = 0;
    const load = vi.fn(async (): Promise<readonly SentenceAudioEntry[]> => {
      attempt += 1;
      if (attempt === 1) throw new Error('temporary fetch failure');
      return [entry];
    });
    const store = createPreparedSentenceAudioStore([entry.text], load);
    const decomposed = '  カ\u3099ラスを買いました。\n';

    await expect(store.prepare()).resolves.toBe(false);
    expect(store.get(decomposed, 'female')).toBeUndefined();
    await expect(store.prepare()).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.has(decomposed, 'female')).toBe(true);
    expect(store.get(decomposed, 'female', 'https://assets.example/')).toBe('https://assets.example/audio/google/v1/a/female.mp3');
    expect(store.get(entry.text, 'male', 'https://assets.example')).toBe('https://assets.example/audio/google/v1/c/male.mp3');
  });
});
