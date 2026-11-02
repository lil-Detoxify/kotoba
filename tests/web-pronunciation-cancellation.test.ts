import { computed, effectScope, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePronunciation } from '../apps/web/src/composables/usePronunciation';
import type { Word } from '@jp/models';

const url = vi.hoisted(() => vi.fn());
vi.mock('../apps/web/src/services/audioUrl', () => ({ getGoogleAudioUrl: url }));
vi.mock('../apps/web/src/services/sentence-audio', () => ({
  getGoogleSentenceAudioUrl: () => undefined,
  normalizeSentenceAudioText: (text: string) => text.normalize('NFC').trim(),
}));
vi.mock('vue', async importActual => ({ ...await importActual<typeof import('vue')>(), onMounted: (callback: () => void) => callback(), onUnmounted: () => {} }));
const word: Word = { id: 'a', lessonId: 'lesson', term: '本', reading: 'ほん', meaning: '书', order: 1 };
const scopes: ReturnType<typeof effectScope>[] = [];
function pronunciation() { const scope = effectScope(); scopes.push(scope); return scope.run(usePronunciation)!; }

interface AudioDouble {
  url: string;
  playbackRate: number;
  pause: () => void;
  play: () => Promise<void>;
  onerror: ((event: Event) => void) | null;
  onended: ((event: Event) => void) | null;
}

function stubAudio(...playback: Array<() => Promise<void>>) {
  const media: AudioDouble[] = [];
  const factory = vi.fn(function (url: string) {
    const play = playback[media.length] ?? (() => Promise.reject(new Error('unexpected audio attempt')));
    const item: AudioDouble = { url, playbackRate: 1, pause: vi.fn(), play, onerror: null, onended: null };
    media.push(item);
    return item as unknown as HTMLAudioElement;
  });
  vi.stubGlobal('Audio', factory);
  return { factory, media };
}

interface UtteranceDouble {
  text: string;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  onstart: ((event: SpeechSynthesisEvent) => void) | null;
  onend: ((event: SpeechSynthesisEvent) => void) | null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null;
}

function stubDeviceVoice(onSpeak: (utterance: UtteranceDouble) => void) {
  class FakeUtterance implements UtteranceDouble {
    lang = '';
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    onstart: UtteranceDouble['onstart'] = null;
    onend: UtteranceDouble['onend'] = null;
    onerror: UtteranceDouble['onerror'] = null;
    constructor(readonly text: string) {}
  }
  const synthesis = {
    getVoices: vi.fn(() => [{ lang: 'ja-JP' } as SpeechSynthesisVoice]),
    cancel: vi.fn(),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => onSpeak(utterance as unknown as UtteranceDouble)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('speechSynthesis', synthesis);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return synthesis;
}

afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.useRealTimers(); vi.unstubAllGlobals(); url.mockReset(); });

async function flushMicrotasks() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

describe('pronunciation cancellation during history navigation', () => {
  it('warms without playback and consumes the same media when the word is requested', async()=>{
    url.mockResolvedValue('/prepared-word.mp3');const {factory,media}=stubAudio(vi.fn(async()=>{}));
    const player=pronunciation();await player.prefetch([word]);
    expect(factory).toHaveBeenCalledOnce();expect(media[0].play).not.toHaveBeenCalled();
    await expect(player.play(word)).resolves.toBe(true);
    expect(factory).toHaveBeenCalledOnce();expect(media[0].play).toHaveBeenCalledOnce();
    expect(player.loading.value).toBe(false);player.stop();
  });
  it('does not create stale media when a cleared preload URL arrives late',async()=>{
    let resolve!:(value:string)=>void;url.mockImplementation(()=>new Promise<string>(done=>{resolve=done}));
    const {factory}=stubAudio();const player=pronunciation();const pending=player.prefetch([word]);
    player.clearPrefetch();resolve('/stale-preload.mp3');await pending;
    expect(factory).not.toHaveBeenCalled();expect(player.speaking.value).toBe(false);
  });
  it('can manually retry a failed word without changing the word or keeping the failed media',async()=>{
    url.mockResolvedValue('/retry-word.mp3');const {factory}=stubAudio(async()=>{throw new Error('offline')},async()=>{});
    const target={...word,id:'retry-only',term:'自定义读音测试',reading:'てすと'};
    const player=pronunciation();const before=structuredClone(target);
    await expect(player.play(target)).resolves.toBe(false);expect(player.error.value).not.toBe('');
    await expect(player.play(target)).resolves.toBe(true);
    expect(factory).toHaveBeenCalledTimes(2);expect(player.error.value).toBe('');expect(target).toEqual(before);player.stop();
  });
  it('cannot start a cancelled word when its audio URL arrives late', async () => {
    let resolve!: (value: string) => void;
    url.mockImplementation(() => new Promise<string>(done => { resolve = done; }));
    const audio = vi.fn(); vi.stubGlobal('Audio', audio);
    const player = pronunciation();
    const pending = player.play(word);
    player.stop(); resolve('/old-word.mp3');
    await expect(pending).resolves.toBe(false);
    expect(audio).not.toHaveBeenCalled();
    expect(player.speaking.value).toBe(false);
    expect(player.error.value).toBe('');
  });

  it('keeps the current audio when a previous request returns or fails after a new playback starts', async () => {
    let rejectOld!: (error: Error) => void;
    url.mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }));
    url.mockResolvedValueOnce('/current-word.mp3');
    const pause = vi.fn(); const play = vi.fn(async () => {});
    const audio = vi.fn(function () { return { pause, play }; }); vi.stubGlobal('Audio', audio);
    const player = pronunciation();
    const old = player.play(word);
    await expect(player.play({ ...word, id: 'b', term: '机' })).resolves.toBe(true);
    rejectOld(new Error('late failure')); await expect(old).resolves.toBe(false);
    expect(player.speaking.value).toBe(true);
    expect(player.error.value).toBe('');
    expect(pause).not.toHaveBeenCalled();
    player.stop(); await nextTick();
  });
});

describe('example sentence pronunciation', () => {
  it('reads the original Japanese sentence slowly without requesting a word clip', async () => {
    let captured!: UtteranceDouble;
    const synthesis = stubDeviceVoice(utterance => { captured = utterance; utterance.onstart?.({} as SpeechSynthesisEvent); });
    const audio = stubAudio();
    const player = pronunciation();

    await expect(player.playSentence('中国から来ました。', 'ちゅうごくからきました。', true)).resolves.toBe(true);

    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(captured).toMatchObject({ text: '中国から来ました。', lang: 'ja-JP', rate: 0.65 });
    expect(url).not.toHaveBeenCalled();
    expect(audio.factory).not.toHaveBeenCalled();
    expect(player.sentenceSpeaking.value).toBe(true);
    captured.onend?.({} as SpeechSynthesisEvent);
    expect(player.sentenceSpeaking.value).toBe(false);
    expect(player.speaking.value).toBe(false);
  });

  it('reports unavailable sentence speech separately from word playback', async () => {
    const synthesis = stubDeviceVoice(() => {});
    synthesis.getVoices.mockReturnValue([]);
    const player = pronunciation();

    await expect(player.playSentence('中国から来ました。')).resolves.toBe(false);

    expect(player.hasJapaneseVoice.value).toBe(false);
    expect(player.sentenceError.value).toBe('这台设备暂未提供日语朗读语音。');
    expect(player.error.value).toBe('');
    expect(synthesis.speak).not.toHaveBeenCalled();
    expect(player.sentenceSpeaking.value).toBe(false);
  });

  it('cancels a pending word clip when a sentence starts and ignores its late result', async () => {
    let resolve!: (value: string) => void;
    url.mockImplementation(() => new Promise(done => { resolve = done; }));
    const audio = stubAudio();
    stubDeviceVoice(utterance => utterance.onstart?.({} as SpeechSynthesisEvent));
    const player = pronunciation();
    const pendingWord = player.play(word);

    await expect(player.playSentence('本を読みます。', 'ほんをよみます。')).resolves.toBe(true);
    resolve('/late-word.mp3');
    await expect(pendingWord).resolves.toBe(false);
    expect(audio.factory).not.toHaveBeenCalled();
    expect(player.sentenceSpeaking.value).toBe(true);
    player.stop();
    expect(player.sentenceSpeaking.value).toBe(false);
    expect(player.speaking.value).toBe(false);
    expect(player.sentenceError.value).toBe('');
  });
});

describe('pronunciation fallback sources', () => {
  it('falls through a rejected Google clip and book clip to the legacy packaged audio', async () => {
    url.mockResolvedValue('/audio/google-missing.mp3');
    const audio = stubAudio(
      () => Promise.reject(new Error('Google 404')),
      () => Promise.reject(new Error('book clip missing')),
      async () => {},
    );
    const player = pronunciation();
    const target: Word = { ...word, term: '私', reading: 'わたし', audioUrl: '/audio/book-missing.mp3' };

    expect(player.sourceLabel(target)).toContain('优先尝试');
    const succeeded = await player.play(target);

    expect(succeeded).toBe(true);
    expect(audio.media.map(media => media.url)).toEqual([
      '/audio/google-missing.mp3',
      '/audio/book-missing.mp3',
      '/audio/0.mp3',
    ]);
    expect(player.sourceLabel(target)).toBe('本地打包音频 · 回退发音');
    expect(player.error.value).toBe('');
  });

  it('continues to the book clip when Google media reports an error after play starts', async () => {
    url.mockResolvedValue('/audio/google-then-error.mp3');
    const audio = stubAudio(async () => {}, async () => {});
    const player = pronunciation();
    const target: Word = { ...word, audioUrl: '/audio/book-fallback.mp3' };

    await expect(player.play(target)).resolves.toBe(true);
    expect(player.sourceLabel(target)).toContain('Google WaveNet');
    audio.media[0].onerror?.(new Event('error'));
    await vi.waitFor(() => expect(audio.media).toHaveLength(2));
    await vi.waitFor(() => expect(player.sourceLabel(target)).toBe('词书音频 · 回退发音'));

    expect(audio.media.map(media => media.url)).toEqual(['/audio/google-then-error.mp3', '/audio/book-fallback.mp3']);
    expect(player.error.value).toBe('');
  });

  it('continues immediately when Google media errors before play settles', async () => {
    url.mockResolvedValue('/audio/google-before-start-error.mp3');
    const audio = stubAudio(() => new Promise<void>(() => {}), async () => {});
    const player = pronunciation();
    const target: Word = { ...word, audioUrl: '/audio/book-fallback.mp3' };
    const pending = player.play(target);

    await vi.waitFor(() => expect(audio.media).toHaveLength(1));
    audio.media[0].onerror?.(new Event('error'));
    await expect(pending).resolves.toBe(true);
    await vi.waitFor(() => expect(player.sourceLabel(target)).toContain('词书音频'));

    expect(audio.media.map(media => media.url)).toEqual([
      '/audio/google-before-start-error.mp3',
      '/audio/book-fallback.mp3',
    ]);
    expect(audio.media[0].onerror).toBeNull();
    expect(player.error.value).toBe('');
  });

  it('uses a Japanese device voice after Google and wordbook audio fail', async () => {
    url.mockResolvedValue('/audio/google-missing.mp3');
    const audio = stubAudio(
      () => Promise.reject(new Error('Google 404')),
      () => Promise.reject(new Error('book clip missing')),
    );
    const synthesis = stubDeviceVoice(utterance => utterance.onstart?.({} as SpeechSynthesisEvent));
    const player = pronunciation();
    const target: Word = { ...word, id: 'device', term: '未收录发音', reading: 'みしゅうろくはつおん', audioUrl: '/audio/book-missing.mp3' };

    await expect(player.play(target, true)).resolves.toBe(true);

    expect(audio.factory).toHaveBeenCalledTimes(2);
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(synthesis.speak.mock.calls[0][0]).toMatchObject({ rate: 0.65, lang: 'ja-JP' });
    expect(player.sourceLabel(target)).toBe('设备日语语音');
    expect(player.error.value).toBe('');
  });

  it('does not let a late media error start a previous word fallback after cancellation', async () => {
    url.mockResolvedValueOnce('/audio/old-google.mp3').mockResolvedValueOnce('/audio/current-google.mp3');
    const audio = stubAudio(
      () => new Promise<void>(() => {}),
      async () => {},
    );
    const player = pronunciation();
    const oldWord: Word = { ...word, id: 'old', audioUrl: '/audio/old-book.mp3' };
    const currentWord: Word = { ...word, id: 'current', term: '机', audioUrl: '/audio/current-book.mp3' };
    const oldPlayback = player.play(oldWord);
    await vi.waitFor(() => expect(audio.media).toHaveLength(1));

    await expect(player.play(currentWord)).resolves.toBe(true);
    await expect(oldPlayback).resolves.toBe(false);
    audio.media[0].onerror?.(new Event('error'));

    expect(audio.media.map(media => media.url)).toEqual(['/audio/old-google.mp3', '/audio/current-google.mp3']);
    expect(audio.media[0].onerror).toBeNull();
    expect(player.sourceLabel(currentWord)).toContain('Google WaveNet');
    expect(player.error.value).toBe('');
  });

  it('shows an error only after the device speech path also fails', async () => {
    url.mockResolvedValue('/audio/google-missing.mp3');
    stubAudio(
      () => Promise.reject(new Error('Google 404')),
      () => Promise.reject(new Error('book clip missing')),
    );
    const synthesis = stubDeviceVoice(utterance => utterance.onerror?.({} as SpeechSynthesisErrorEvent));
    const player = pronunciation();
    const target: Word = { ...word, id: 'failed', term: '未收录发音', reading: 'みしゅうろくはつおん', audioUrl: '/audio/book-missing.mp3' };

    await expect(player.play(target)).resolves.toBe(false);

    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(player.error.value).toBe('音频无法播放，请重试或切换题型');
    expect(player.sourceLabel(target)).toBe('发音不可用');
    expect(player.speaking.value).toBe(false);
  });

  it('falls back from a Google play timeout after ten seconds', async () => {
    vi.useFakeTimers();
    url.mockResolvedValue('/audio/google-timeout.mp3');
    const audio = stubAudio(() => new Promise<void>(() => {}), async () => {});
    const player = pronunciation();
    const target: Word = { ...word, id: 'google-timeout', audioUrl: '/audio/book-after-timeout.mp3' };
    const pending = player.play(target);

    await flushMicrotasks();
    expect(audio.media.map(media => media.url)).toEqual(['/audio/google-timeout.mp3']);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBe(true);

    expect(audio.media.map(media => media.url)).toEqual([
      '/audio/google-timeout.mp3',
      '/audio/book-after-timeout.mp3',
    ]);
    expect(player.sourceLabel(target)).toBe('词书音频 · 回退发音');
    expect(player.error.value).toBe('');
  });

  it('reports failure when device speech never starts within eight seconds', async () => {
    vi.useFakeTimers();
    url.mockResolvedValue('/audio/google-device-timeout.mp3');
    stubAudio(() => Promise.reject(new Error('Google 404')));
    const synthesis = stubDeviceVoice(() => {});
    const player = pronunciation();
    const target: Word = {
      ...word,
      id: 'device-timeout',
      term: '独特测试語彙',
      reading: 'どくとくてすとごい',
    };
    const pending = player.play(target);

    await flushMicrotasks();
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toBe(false);

    expect(player.error.value).toBe('音频无法播放，请重试或切换题型');
    expect(player.sourceLabel(target)).toBe('发音不可用');
    expect(player.speaking.value).toBe(false);
  });

  it('updates computed source labels after fallback success and total failure', async () => {
    url.mockResolvedValue('/audio/google-missing-for-label-test.mp3');
    stubAudio(
      () => Promise.reject(new Error('Google 404')),
      () => Promise.reject(new Error('book clip missing')),
      async () => {},
      () => Promise.reject(new Error('Google 404')),
      () => Promise.reject(new Error('book clip missing')),
    );
    stubDeviceVoice(utterance => utterance.onerror?.({} as SpeechSynthesisErrorEvent));
    const player = pronunciation();
    const fallbackWord: Word = { ...word, id: 'computed-fallback', term: '私', reading: 'わたし', audioUrl: '/audio/book-missing.mp3' };
    const fallbackLabel = computed(() => player.sourceLabel(fallbackWord));
    expect(fallbackLabel.value).toContain('优先尝试 Google WaveNet');

    await expect(player.play(fallbackWord)).resolves.toBe(true);
    expect(fallbackLabel.value).toBe('本地打包音频 · 回退发音');

    const failedWord: Word = {
      ...word,
      id: 'computed-failure',
      term: '独特测试語彙',
      reading: 'どくとくてすとごい',
      audioUrl: '/audio/another-book-missing.mp3',
    };
    const failedLabel = computed(() => player.sourceLabel(failedWord));
    expect(failedLabel.value).toContain('优先尝试 Google WaveNet');
    await expect(player.play(failedWord)).resolves.toBe(false);
    expect(failedLabel.value).toBe('发音不可用');
  });

  it('does not resume a pending Google clip after the user changes voice', async () => {
    url.mockResolvedValue('/audio/google-voice-change.mp3');
    let resolvePlay!: () => void;
    const audio = stubAudio(() => new Promise<void>(resolve => { resolvePlay = resolve; }), async () => {});
    const player = pronunciation();
    const target: Word = { ...word, id: 'google-voice-change', audioUrl: '/audio/voice-change-fallback.mp3' };
    const pending = player.play(target);

    await flushMicrotasks();
    expect(audio.media).toHaveLength(1);
    player.setVoice('male');
    await nextTick();
    resolvePlay();
    await flushMicrotasks();
    await expect(pending).resolves.toBe(false);

    expect(audio.media).toHaveLength(1);
    expect(audio.media[0].pause).toHaveBeenCalled();
    expect(player.selectedVoice.value).toBe('male');
    expect(player.speaking.value).toBe(false);
    expect(player.error.value).toBe('');
    player.setVoice('female');
    await nextTick();
  });

  it('does not resume pending device speech after the user changes voice', async () => {
    url.mockResolvedValue('/audio/google-before-device-voice-change.mp3');
    stubAudio(() => Promise.reject(new Error('Google 404')));
    let captured!: UtteranceDouble;
    const synthesis = stubDeviceVoice(utterance => { captured = utterance; });
    const player = pronunciation();
    const target: Word = {
      ...word,
      id: 'device-voice-change',
      term: '独特测试語彙',
      reading: 'どくとくてすとごい',
    };
    const pending = player.play(target);

    await flushMicrotasks();
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    const staleOnStart = captured.onstart;
    player.setVoice('male');
    await nextTick();
    staleOnStart?.({} as SpeechSynthesisEvent);
    await expect(pending).resolves.toBe(false);

    expect(captured.onstart).toBeNull();
    expect(synthesis.cancel).toHaveBeenCalled();
    expect(player.selectedVoice.value).toBe('male');
    expect(player.speaking.value).toBe(false);
    expect(player.error.value).toBe('');
    player.setVoice('female');
    await nextTick();
  });
});
