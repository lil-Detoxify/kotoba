import { effectScope, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word } from '@jp/models';
import { createSentenceAudioLookup, getGoogleSentenceAudioUrl, prepareGoogleSentenceAudio } from '../apps/web/src/services/sentence-audio';
import { usePronunciation } from '../apps/web/src/composables/usePronunciation';

const fixture = vi.hoisted(() => {
  const entries = [{ text: '中国から来ました。', female: '/audio/google-sentences/v1/a/female.mp3', male: '/audio/google-sentences/v1/c/male.mp3' }];
  return { entries, load: vi.fn(async () => entries) };
});
const wordUrl = vi.hoisted(() => vi.fn());
vi.mock('../apps/web/src/services/sentence-audio-data', () => ({ loadSentenceAudioEntries: fixture.load }));
vi.mock('../apps/web/src/services/audioUrl', () => ({ getGoogleAudioUrl: wordUrl }));
vi.mock('vue', async importActual => ({ ...await importActual<typeof import('vue')>(), onMounted: (callback: () => void) => callback(), onUnmounted: () => {} }));

type Player = ReturnType<typeof usePronunciation>;
const players: Player[] = [];
const scopes: ReturnType<typeof effectScope>[] = [];
beforeEach(async () => {
  vi.stubEnv('VITE_SENTENCE_WAVENET_ENABLED', 'true');
  await prepareGoogleSentenceAudio();
});
function player() {
  const scope = effectScope(); scopes.push(scope);
  const result = scope.run(usePronunciation)!;
  result.setVoice('female'); players.push(result);
  return result;
}

interface MediaDouble {
  url: string; playbackRate: number; preservesPitch: boolean;
  pause: ReturnType<typeof vi.fn>; play: () => Promise<void>;
  onerror: ((event: Event) => void) | null; onended: ((event: Event) => void) | null;
}
function audio(...outcomes: Array<() => Promise<void>>) {
  const media: MediaDouble[] = [];
  const factory = vi.fn(function (url: string) {
    const item: MediaDouble = {
      url, playbackRate: 1, preservesPitch: false, pause: vi.fn(),
      play: outcomes[media.length] ?? (async () => {}), onerror: null, onended: null,
    };
    media.push(item);
    return item as unknown as HTMLAudioElement;
  });
  vi.stubGlobal('Audio', factory);
  return { media, factory };
}

interface UtteranceDouble {
  text: string; lang: string; voice: SpeechSynthesisVoice | null; rate: number;
  onstart: ((event: SpeechSynthesisEvent) => void) | null;
  onend: ((event: SpeechSynthesisEvent) => void) | null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null;
}
function device(available = true) {
  const utterances: UtteranceDouble[] = [];
  class Utterance implements UtteranceDouble {
    lang = ''; voice: SpeechSynthesisVoice | null = null; rate = 1;
    onstart: UtteranceDouble['onstart'] = null; onend: UtteranceDouble['onend'] = null; onerror: UtteranceDouble['onerror'] = null;
    constructor(readonly text: string) {}
  }
  const synthesis = {
    getVoices: vi.fn(() => available ? [{ lang: 'ja-JP' } as SpeechSynthesisVoice] : []),
    cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    speak: vi.fn((utterance: UtteranceDouble) => { utterances.push(utterance); utterance.onstart?.({} as SpeechSynthesisEvent); }),
  };
  vi.stubGlobal('speechSynthesis', synthesis);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  return { synthesis, utterances };
}

function pendingPlay() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

afterEach(async () => {
  players.splice(0).forEach(item => { item.stop(); item.setVoice('female'); });
  await nextTick();
  scopes.splice(0).forEach(scope => scope.stop());
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); wordUrl.mockReset();
});

describe('pre-generated WaveNet sentence lookup', () => {
  it('matches NFC plus trim exactly, selects each voice, and leaves unmatched text for device fallback', () => {
    const lookup = createSentenceAudioLookup([{ text: 'ガラスを買いました。', female: '/a.mp3', male: '/c.mp3' }]);
    expect(lookup('  カ\u3099ラスを買いました。\n', 'female')).toBe('/a.mp3');
    expect(lookup('ガラスを買いました。', 'male', 'https://staging.kotobud.com/')).toBe('https://staging.kotobud.com/c.mp3');
    expect(lookup('ガラスを買いました', 'female')).toBeUndefined();
    expect(lookup('未生成の例句。', 'female')).toBeUndefined();
  });

  it('uses the same-origin asset proxy on Web and the configured remote origin on desktop', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:' } });
    expect(getGoogleSentenceAudioUrl('中国から来ました。', 'female')).toBe(fixture.entries[0].female);
    vi.stubGlobal('window', { location: { protocol: 'kotoba:' } });
    vi.stubEnv('VITE_API_BASE_URL', 'https://staging.kotobud.com/');
    expect(getGoogleSentenceAudioUrl('中国から来ました。', 'male')).toBe(`https://staging.kotobud.com${fixture.entries[0].male}`);
    vi.stubEnv('VITE_API_BASE_URL', '');
    expect(getGoogleSentenceAudioUrl('中国から来ました。', 'male')).toBe(`https://kotobud.com${fixture.entries[0].male}`);
  });
});

describe('sentence playback', () => {
  it('plays mapped female and male clips without a device voice, preserving pitch for slow playback and making no synthesis request', async () => {
    const { synthesis } = device(false);
    const clips = audio();
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const pronunciation = player();
    expect(pronunciation.hasJapaneseVoice.value).toBe(false);
    expect(pronunciation.canPlaySentence('中国から来ました。')).toBe(true);
    await expect(pronunciation.playSentence(' 中国から来ました。 ', 'ちゅうごくからきました。', true)).resolves.toBe(true);
    expect(clips.media[0]).toMatchObject({ url: fixture.entries[0].female, playbackRate: 0.75, preservesPitch: true });
    expect(pronunciation.sentenceSourceLabel('中国から来ました。')).toBe('Google WaveNet · 女声 A');
    clips.media[0].onended?.(new Event('ended'));
    expect(pronunciation.sentenceSpeaking.value).toBe(false);
    pronunciation.setVoice('male'); await nextTick();
    await expect(pronunciation.playSentence('中国から来ました。')).resolves.toBe(true);
    expect(clips.media[1].url).toBe(fixture.entries[0].male);
    expect(pronunciation.sentenceSourceLabel('中国から来ました。')).toBe('Google WaveNet · 男声 C');
    expect(synthesis.speak).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(wordUrl).not.toHaveBeenCalled();
  });

  it('reads the original kanji and punctuation for an unmapped sentence instead of substituting its kana', async () => {
    const speech = device(); const clips = audio(); const pronunciation = player();
    await expect(pronunciation.playSentence('東京へ行きます。', 'とうきょうへいきます。', true)).resolves.toBe(true);
    expect(speech.utterances[0]).toMatchObject({ text: '東京へ行きます。', rate: 0.65, lang: 'ja-JP' });
    expect(pronunciation.sentenceSourceLabel('東京へ行きます。')).toBe('设备日语语音');
    expect(clips.factory).not.toHaveBeenCalled(); expect(wordUrl).not.toHaveBeenCalled();
    speech.utterances[0].onend?.({} as SpeechSynthesisEvent);
    expect(pronunciation.sentenceSpeaking.value).toBe(false);
  });

  it('falls back after a missing mapped clip and reports the actual device source', async () => {
    const speech = device(); audio(async () => { throw new Error('asset unavailable'); }); const pronunciation = player();
    await expect(pronunciation.playSentence('中国から来ました。')).resolves.toBe(true);
    expect(speech.utterances[0].text).toBe('中国から来ました。');
    expect(pronunciation.sentenceSourceLabel('中国から来ました。')).toBe('设备日语语音 · 回退朗读');
    expect(pronunciation.sentenceError.value).toBe('');
  });

  it('continues to device speech if a mapped clip reports an error after starting', async () => {
    const speech = device(); const clips = audio(); const pronunciation = player();
    await expect(pronunciation.playSentence('中国から来ました。')).resolves.toBe(true);
    clips.media[0].onerror?.(new Event('error'));
    await vi.waitFor(() => expect(speech.utterances).toHaveLength(1));
    expect(pronunciation.sentenceSourceLabel('中国から来ました。')).toBe('设备日语语音 · 回退朗读');
    expect(clips.media[0].pause).toHaveBeenCalled();
  });

  it('settles cancelled playback and ignores a late start after another sentence is playing', async () => {
    const old = pendingPlay(); const clips = audio(() => old.promise, async () => {}); device(false); const pronunciation = player();
    const pending = pronunciation.playSentence('中国から来ました。');
    await expect(pronunciation.playSentence('中国から来ました。')).resolves.toBe(true);
    await expect(pending).resolves.toBe(false);
    old.resolve(); await nextTick();
    expect(clips.media[0].pause).toHaveBeenCalled(); expect(clips.media[1].pause).not.toHaveBeenCalled();
    expect(pronunciation.sentenceSpeaking.value).toBe(true); expect(pronunciation.sentenceError.value).toBe('');
  });

  it('cancels a pending clip on voice change and makes a timeout fall back without hanging', async () => {
    vi.useFakeTimers(); const slow = pendingPlay(); const clips = audio(() => slow.promise, () => new Promise<void>(() => {}));
    const speech = device(); const pronunciation = player();
    const old = pronunciation.playSentence('中国から来ました。');
    pronunciation.setVoice('male'); await nextTick();
    await expect(old).resolves.toBe(false);
    expect(pronunciation.sentenceSpeaking.value).toBe(false); expect(clips.media[0].pause).toHaveBeenCalled();
    const current = pronunciation.playSentence('中国から来ました。');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(current).resolves.toBe(true);
    expect(speech.utterances).toHaveLength(1); expect(pronunciation.sentenceSourceLabel('中国から来ました。')).toBe('设备日语语音 · 回退朗读');
  });

  it('keeps ordinary word playback on its existing Google word path', async () => {
    device(false); const clips = audio(); wordUrl.mockResolvedValue('/audio/google/v1/a/word.mp3'); const pronunciation = player();
    const word: Word = { id: 'word', lessonId: 'lesson', term: '本', reading: 'ほん', meaning: '书', order: 0 };
    await expect(pronunciation.play(word)).resolves.toBe(true);
    expect(wordUrl).toHaveBeenCalledWith('本', 'ほん', 'female');
    expect(clips.media[0].url).toBe('/audio/google/v1/a/word.mp3'); expect(pronunciation.sentenceSpeaking.value).toBe(false);
  });
});
