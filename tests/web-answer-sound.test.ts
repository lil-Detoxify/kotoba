import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'kotobud.web.answer-sound.v1';
const audioInstances: FakeAudio[] = [];
const playQueue: Array<() => Promise<void>> = [];
let storedValues: Map<string, string>;

class FakeAudio {
  currentTime = 0;
  volume = 1;
  pauseCalls = 0;

  constructor(readonly src: string) {
    audioInstances.push(this);
  }

  play(): Promise<void> {
    return playQueue.shift()?.() ?? Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function loadService() {
  vi.resetModules();
  return import('../apps/web/src/services/answer-sound');
}

beforeEach(() => {
  audioInstances.length = 0;
  playQueue.length = 0;
  storedValues = new Map();
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storedValues.get(key) ?? null,
    setItem: (key: string, value: string) => storedValues.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('answer sound preference and playback', () => {
  it('uses the defaults and persists valid preference changes', async () => {
    const service = await loadService();
    const preference = service.useAnswerSoundPreference();

    expect(preference.enabled.value).toBe(true);
    expect(preference.scheme.value).toBe('wood');
    expect(preference.volume.value).toBe(0.45);
    expect(service.ANSWER_SOUND_OPTIONS.map(option => option.name)).toEqual(['木芽', '风铃', '林木', '溪石']);

    preference.setEnabled(false);
    preference.setScheme('stone');
    preference.setVolume(0.72);
    expect(JSON.parse(storedValues.get(STORAGE_KEY)!)).toEqual({ enabled: false, scheme: 'stone', volume: 0.72 });

    const restored = await loadService();
    const savedPreference = restored.useAnswerSoundPreference();
    expect(savedPreference.enabled.value).toBe(false);
    expect(savedPreference.scheme.value).toBe('stone');
    expect(savedPreference.volume.value).toBe(0.72);
  });

  it('stops active audio when disabled and skips playback while disabled', async () => {
    const service = await loadService();
    const preference = service.useAnswerSoundPreference();

    expect(await service.previewAnswerSound('wood', true)).toBe(true);
    const firstAudio = audioInstances[0];
    preference.setEnabled(false);
    expect(firstAudio.pauseCalls).toBeGreaterThan(0);
    expect(await service.playAnswerSound(true)).toBe(false);
    expect(audioInstances).toHaveLength(1);

    preference.setEnabled(true);
    expect(await service.previewAnswerSound('wood', false)).toBe(true);
    const secondAudio = audioInstances[1];
    preference.setScheme('stone');
    expect(secondAudio.pauseCalls).toBeGreaterThan(0);
    expect(await service.previewAnswerSound('stone', true)).toBe(true);
    const thirdAudio = audioInstances[2];
    preference.setVolume(0);
    expect(thirdAudio.pauseCalls).toBeGreaterThan(0);
    expect(await service.playAnswerSound(true)).toBe(false);

    preference.setVolume(0.45);
    await service.previewAnswerSound('stone', true);
    const fourthAudio = audioInstances[3];
    service.stopAnswerSound();
    expect(fourthAudio.pauseCalls).toBeGreaterThan(0);
  });

  it('selects the correct and incorrect files for the chosen scheme', async () => {
    const service = await loadService();
    service.useAnswerSoundPreference().setScheme('chime');

    expect(await service.playAnswerSound(true)).toBe(true);
    expect(await service.playAnswerSound(false)).toBe(true);
    expect(audioInstances[0].src).toContain('chime-correct');
    expect(audioInstances[1].src).toContain('chime-incorrect');
    expect(audioInstances[0].pauseCalls).toBeGreaterThan(0);
  });

  it('pauses before switching sounds and ignores late play resolutions or rejections', async () => {
    const service = await loadService();
    const oldResolution = deferred<void>();
    const oldRejection = deferred<void>();
    playQueue.push(() => oldResolution.promise, () => Promise.resolve(), () => oldRejection.promise, () => Promise.resolve());

    const staleResolvedPlay = service.playAnswerSound(true);
    const currentChime = service.previewAnswerSound('chime', false);
    expect(audioInstances[0].pauseCalls).toBeGreaterThan(0);
    expect(await currentChime).toBe(true);
    oldResolution.resolve();
    expect(await staleResolvedPlay).toBe(false);
    expect(audioInstances[1].pauseCalls).toBe(0);

    const staleRejectedPlay = service.playAnswerSound(true);
    const currentStone = service.previewAnswerSound('stone', true);
    expect(await currentStone).toBe(true);
    oldRejection.reject(new Error('late play rejection'));
    expect(await staleRejectedPlay).toBe(false);
    expect(audioInstances[3].pauseCalls).toBe(0);
  });

  it('returns false on unavailable or rejected audio and tolerates storage failures', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage unavailable'); },
      setItem: () => { throw new Error('storage unavailable'); },
    });
    const service = await loadService();
    const preference = service.useAnswerSoundPreference();
    expect(() => preference.setVolume(0.3)).not.toThrow();

    vi.stubGlobal('Audio', undefined);
    expect(await service.previewAnswerSound('wood', true)).toBe(false);

    vi.stubGlobal('Audio', FakeAudio);
    playQueue.push(() => Promise.reject(new Error('play denied')));
    expect(await service.previewAnswerSound('wood', true)).toBe(false);
  });
});
