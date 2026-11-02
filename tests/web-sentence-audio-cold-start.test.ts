import { effectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSentenceAudioText } from '../apps/web/src/services/sentence-audio';
import { usePronunciation } from '../apps/web/src/composables/usePronunciation';

const sentenceAudio = vi.hoisted(() => ({ prepare: vi.fn(), has: vi.fn(), getUrl: vi.fn() }));
const wordUrl = vi.hoisted(() => vi.fn());
vi.mock('../apps/web/src/services/sentence-audio', async importActual => {
  const actual = await importActual<typeof import('../apps/web/src/services/sentence-audio')>();
  return {
    ...actual,
    prepareGoogleSentenceAudio: sentenceAudio.prepare,
    hasGoogleSentenceAudio: sentenceAudio.has,
    getGoogleSentenceAudioUrl: sentenceAudio.getUrl,
  };
});
vi.mock('../apps/web/src/services/audioUrl', () => ({ getGoogleAudioUrl: wordUrl }));
vi.mock('vue', async importActual => ({
  ...await importActual<typeof import('vue')>(),
  onMounted: (callback: () => void) => callback(),
  onUnmounted: () => {},
}));

type Player = ReturnType<typeof usePronunciation>;
const players: Player[] = [];
const scopes: ReturnType<typeof effectScope>[] = [];
const originalNavigator = globalThis.navigator;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function player() {
  const scope = effectScope();
  scopes.push(scope);
  const result = scope.run(usePronunciation)!;
  players.push(result);
  return result;
}

function stubAudio() {
  const factory = vi.fn(function (_url: string) { return ({
    pause: vi.fn(), play: vi.fn(async () => {}),
  } as unknown as HTMLAudioElement); });
  vi.stubGlobal('Audio', factory);
  return factory;
}

function stubJapaneseVoice() {
  const utterances: Array<{text: string; lang: string; rate: number}> = [];
  class Utterance {
    lang = '';
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
    onend: ((event: SpeechSynthesisEvent) => void) | null = null;
    onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
    constructor(readonly text: string) {}
  }
  const synthesis = {
    getVoices: vi.fn(() => [{ lang: 'ja-JP' } as SpeechSynthesisVoice]),
    cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    speak: vi.fn((value: SpeechSynthesisUtterance) => {
      const utterance = value as unknown as Utterance;
      utterances.push(utterance);
      utterance.onstart?.({} as SpeechSynthesisEvent);
    }),
  };
  vi.stubGlobal('speechSynthesis', synthesis);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  return { synthesis, utterances };
}

async function flushMicrotasks() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

afterEach(() => {
  players.splice(0).forEach(item => item.stop());
  scopes.splice(0).forEach(scope => scope.stop());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(globalThis.navigator).toBe(originalNavigator);
  sentenceAudio.prepare.mockReset();
  sentenceAudio.has.mockReset();
  sentenceAudio.getUrl.mockReset();
  wordUrl.mockReset();
});

describe('sentence audio cold loading', () => {
  it('skips automatic loading on saveData but still prepares a known sentence when requested', async () => {
    const text = '駅まで歩いて十分です。';
    const load = deferred<boolean>();
    let loaded = false;
    sentenceAudio.prepare.mockReturnValue(load.promise);
    sentenceAudio.has.mockImplementation((value: string) => normalizeSentenceAudioText(value) === text);
    sentenceAudio.getUrl.mockImplementation(() => loaded ? '/manual-sentence.mp3' : undefined);
    vi.stubGlobal('navigator', { onLine: true, connection: { saveData: true } });
    const audio = stubAudio();
    const pronunciation = player();

    expect(sentenceAudio.prepare).not.toHaveBeenCalled();
    expect(pronunciation.canPlaySentence(text)).toBe(true);
    const pending = pronunciation.playSentence(text);
    expect(sentenceAudio.prepare).toHaveBeenCalledTimes(1);

    loaded = true;
    load.resolve(true);
    await expect(pending).resolves.toBe(true);
    expect(audio).toHaveBeenCalledTimes(1);
    expect(pronunciation.sentenceSourceLabel(text)).toBe('Google WaveNet · 女声 A');
    expect(wordUrl).not.toHaveBeenCalled();
  });

  it('cancels a sentence waiting on the full table and ignores its late load', async () => {
    const text = '東京から来ました。';
    const load = deferred<boolean>();
    let loaded = false;
    sentenceAudio.prepare.mockReturnValue(load.promise);
    sentenceAudio.has.mockImplementation((value: string) => normalizeSentenceAudioText(value) === text);
    sentenceAudio.getUrl.mockImplementation(() => loaded ? '/prepared-sentence.mp3' : undefined);
    const audio = stubAudio();
    const speech = stubJapaneseVoice();
    const pronunciation = player();

    expect(pronunciation.canPlaySentence(text)).toBe(true);
    const pending = pronunciation.playSentence(text, 'とうきょうからきました。');
    expect(pronunciation.sentenceSpeaking.value).toBe(true);
    pronunciation.stop();
    await expect(pending).resolves.toBe(false);

    loaded = true;
    load.resolve(true);
    await flushMicrotasks();
    expect(audio).not.toHaveBeenCalled();
    expect(speech.synthesis.speak).not.toHaveBeenCalled();
    expect(pronunciation.speaking.value).toBe(false);
    expect(pronunciation.sentenceSpeaking.value).toBe(false);
  });

  it('falls back to device speech after the eight-second load wait without mutating other state', async () => {
    vi.useFakeTimers();
    const text = '東京へ行きます。';
    const reading = 'とうきょうへいきます。';
    const load = deferred<boolean>();
    sentenceAudio.prepare.mockReturnValue(load.promise);
    sentenceAudio.has.mockImplementation((value: string) => normalizeSentenceAudioText(value) === text);
    sentenceAudio.getUrl.mockReturnValue(undefined);
    const audio = stubAudio();
    const speech = stubJapaneseVoice();
    const storageSet = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: storageSet });
    const pronunciation = player();
    const selectedVoice = pronunciation.selectedVoice.value;

    expect(pronunciation.hasJapaneseVoice.value).toBe(true);
    expect(pronunciation.canPlaySentence(text)).toBe(true);
    const pending = pronunciation.playSentence(text, reading, true);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toBe(true);

    expect(speech.utterances).toHaveLength(1);
    expect(speech.utterances[0]).toMatchObject({ text, lang: 'ja-JP', rate: 0.65 });
    expect(pronunciation.sentenceSourceLabel(text)).toBe('设备日语语音 · 回退朗读');
    expect(pronunciation.sentenceError.value).toBe('');
    expect(pronunciation.error.value).toBe('');
    expect(pronunciation.loading.value).toBe(false);
    expect(pronunciation.selectedVoice.value).toBe(selectedVoice);
    expect(audio).not.toHaveBeenCalled();
    expect(wordUrl).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    load.resolve(true);
    await flushMicrotasks();
    expect(speech.utterances).toHaveLength(1);
    expect(audio).not.toHaveBeenCalled();
  });
});
