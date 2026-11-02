import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word } from '@jp/models';

const hooks = vi.hoisted(() => ({ mounted: [] as Array<() => void>, unmounted: [] as Array<() => void> }));
vi.mock('vue', async () => ({ ...await vi.importActual('vue'), onMounted: (fn: () => void) => hooks.mounted.push(fn), onUnmounted: (fn: () => void) => hooks.unmounted.push(fn) }));
import { createExtensionPronunciation } from '../apps/extension/src/audio';

const manual: Word = { id: 'custom-word', lessonId: 'custom', term: '言葉', reading: 'ことば', meaning: '词语', order: 1 };
const textbook: Word = { ...manual, id: 'biaori-1-w-1-4' };
const paramsVersion = 'google-wavenet-v1-ssml-yomigana-rate1-pitch0-volume0';

type FakeAudio = {
  src: string;
  preload: string;
  playbackRate: number;
  onplaying: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
};

function stubAudio(playFor: (src: string, audio: FakeAudio) => Promise<void> = () => Promise.resolve()): FakeAudio[] {
  const instances: FakeAudio[] = [];
  class StubAudio {
    src: string;
    preload = '';
    playbackRate = 1;
    onplaying: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play: ReturnType<typeof vi.fn>;
    pause = vi.fn();
    load = vi.fn();
    removeAttribute = vi.fn();

    constructor(src: string) {
      this.src = src;
      this.play = vi.fn(() => playFor(src, this as unknown as FakeAudio));
      instances.push(this as unknown as FakeAudio);
    }
  }
  vi.stubGlobal('Audio', StubAudio);
  return instances;
}

function expectedGoogleUrl(term: string, reading: string, voice: 'female' | 'male'): string {
  const voiceName = voice === 'male' ? 'ja-JP-Wavenet-C' : 'ja-JP-Wavenet-A';
  const payload = JSON.stringify({ term, reading, voice: voiceName, paramsVersion });
  const hash = createHash('sha256').update(payload, 'utf8').digest('hex');
  return `https://kotobud.com/audio/google/v1/${voice === 'male' ? 'c' : 'a'}/${hash}.mp3`;
}

describe('extension pronunciation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers(); hooks.mounted.length = 0; hooks.unmounted.length = 0;
    vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => {
    hooks.unmounted.forEach(fn => fn());
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  });

  it('uses the deterministic A/C Google paths for samples from all five JLPT books', async () => {
    const samples: Array<[string, string, string]> = [
      ['jlpt-n1', '嗚呼', 'ああ'],
      ['jlpt-n2', 'あいかわらず', 'あいかわらず'],
      ['jlpt-n3', '愛', 'あい'],
      ['jlpt-n4', 'あ', 'あ'],
      ['jlpt-n5', '会う', 'あう'],
    ];
    const instances = stubAudio();
    const audio = createExtensionPronunciation();

    for (const [book, term, reading] of samples) {
      const word: Word = { ...textbook, id: `${book}-w-1-1`, term, reading };
      for (const voice of ['female', 'male'] as const) {
        audio.setVoice(voice);
        expect(await audio.play(word)).toBe(true);
        expect(instances.at(-1)?.src).toBe(expectedGoogleUrl(term, reading, voice));
        expect(audio.source.value).toEqual({ kind: 'google', voice });
        expect(audio.sourceLabel.value).toBe(`Google WaveNet · ${voice === 'female' ? '女声 A' : '男声 C'}`);
      }
    }
  });

  it('reports unavailable device Japanese speech instead of accepting a listening answer', async () => {
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn() });
    const audio = createExtensionPronunciation();
    expect(await audio.play(manual)).toBe(false);
    expect(audio.playing.value).toBe(false);
    expect(audio.error.value).not.toBe('');
    expect(audio.source.value).toBeNull();
    expect(audio.sourceLabel.value).toBe('发音不可用');
  });

  it('labels the successful book-audio fallback after Google playback fails', async () => {
    const instances = stubAudio(src => src.includes('/audio/google/v1/')
      ? Promise.reject(new Error('Google audio missing'))
      : Promise.resolve());
    const audio = createExtensionPronunciation();
    const word = { ...textbook, audioUrl: 'https://kotobud.com/audio/book/example.mp3' };

    expect(await audio.play(word)).toBe(true);
    expect(instances).toHaveLength(2);
    expect(instances[1].src).toBe('https://kotobud.com/audio/book/example.mp3');
    expect(audio.source.value).toEqual({ kind: 'book', location: 'kotobud' });
    expect(audio.sourceLabel.value).toBe('词书音频 · KotoBud 回退');
  });

  it('allows same-extension book audio as a labeled local fallback', async () => {
    const instances = stubAudio();
    const audio = createExtensionPronunciation();

    expect(await audio.play({ ...manual, audioUrl: 'chrome-extension://extension.invalid/audio/book.mp3' })).toBe(true);
    expect(instances[0].src).toBe('chrome-extension://extension.invalid/audio/book.mp3');
    expect(audio.source.value).toEqual({ kind: 'book', location: 'extension' });
    expect(audio.sourceLabel.value).toBe('本地词书音频 · 回退发音');
  });

  it('preloads at most three words without playing and reuses the prepared media on demand', async () => {
    const instances = stubAudio();
    const audio = createExtensionPronunciation();
    const next = (number: number): Word => ({ ...textbook, id: `biaori-1-w-1-${number}`, term: `語${number}`, reading: `ご${number}` });

    audio.prefetch([textbook, next(2), next(3), next(4)]);
    await vi.waitFor(() => expect(instances).toHaveLength(3));
    expect(instances.map(item => item.preload)).toEqual(['auto', 'auto', 'auto']);
    expect(instances.every(item => item.load.mock.calls.length === 1)).toBe(true);
    expect(instances.every(item => item.play.mock.calls.length === 0)).toBe(true);

    expect(await audio.play(textbook)).toBe(true);
    expect(instances).toHaveLength(3);
    expect(instances[0].play).toHaveBeenCalledOnce();
    expect(audio.source.value).toEqual({ kind: 'google', voice: 'female' });
  });

  it('clears prepared media and invalidates pending prefetch when the voice changes', async () => {
    const instances = stubAudio();
    const audio = createExtensionPronunciation();
    audio.prefetch([textbook]);
    await vi.waitFor(() => expect(instances).toHaveLength(1));

    audio.setVoice('male');
    expect(instances[0].pause).toHaveBeenCalled();
    expect(instances[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(await audio.play(textbook)).toBe(true);
    expect(instances).toHaveLength(2);
    expect(instances[1].src).toBe(expectedGoogleUrl(textbook.term, textbook.reading, 'male'));
  });

  it('does not try a later fallback after cancellation and settles immediately', async () => {
    const rejectPlay: Array<(reason: Error) => void> = [];
    const instances = stubAudio(() => new Promise<void>((_, reject) => rejectPlay.push(reject)));
    const audio = createExtensionPronunciation();
    const play = audio.play({ ...textbook, audioUrl: 'https://kotobud.com/audio/book/example.mp3' });
    await vi.waitFor(() => expect(instances).toHaveLength(1));

    audio.stop();
    await expect(play).resolves.toBe(false);
    rejectPlay[0]?.(new Error('late play rejection'));
    await Promise.resolve();
    expect(instances).toHaveLength(1);
    expect(audio.source.value).toBeNull();
    expect(audio.error.value).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects book audio from hosts outside the extension and kotobud.com', async () => {
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn() });
    const instances = stubAudio();
    const audio = createExtensionPronunciation();

    expect(await audio.play({ ...manual, audioUrl: 'https://evil.example/audio.mp3' })).toBe(false);
    expect(instances).toHaveLength(0);
    expect(audio.error.value).not.toBe('');
  });

  it('an old canceled utterance error cannot lose the active playback resolver', async () => {
    const utterances: Array<any> = [];
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    vi.stubGlobal('speechSynthesis', { getVoices: () => [{ lang: 'ja-JP' }], cancel: vi.fn(), speak: (value: unknown) => utterances.push(value) });
    const audio = createExtensionPronunciation();
    const first = audio.play(manual);
    const lateError = utterances[0].onerror;
    const second = audio.play(manual);
    lateError?.();
    audio.stop();
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a device voice only after it starts and does not claim its gender', async () => {
    const utterances: Array<any> = [];
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    vi.stubGlobal('speechSynthesis', { getVoices: () => [{ lang: 'ja-JP', name: 'System Japanese' }], cancel: vi.fn(), speak: (value: unknown) => utterances.push(value) });
    const audio = createExtensionPronunciation();
    const play = audio.play(manual);

    expect(audio.source.value).toBeNull();
    utterances[0].onstart();
    expect(await play).toBe(true);
    expect(audio.source.value).toEqual({ kind: 'device' });
    expect(audio.sourceLabel.value).toBe('设备日语语音');
  });

  it('a media playback timeout stops the media and exposes a retryable error', async () => {
    const instances = stubAudio(() => new Promise<void>(() => {}));
    const audio = createExtensionPronunciation();
    const play = audio.play(textbook);
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(10000);
    expect(await play).toBe(false);
    expect(instances[0].pause).toHaveBeenCalled();
    expect(audio.error.value).not.toBe('');
  });

  it('backgrounding stops an in-flight media play immediately', async () => {
    const handlers = new Map<string, () => void>();
    vi.stubGlobal('document', { hidden: true, addEventListener: (name: string, fn: () => void) => handlers.set(name, fn), removeEventListener: vi.fn() });
    const instances = stubAudio(() => new Promise<void>(() => {}));
    const audio = createExtensionPronunciation(); hooks.mounted.forEach(fn => fn());
    const play = audio.play(textbook);
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    handlers.get('visibilitychange')!();
    expect(await play).toBe(false);
    expect(instances[0].pause).toHaveBeenCalled();
    expect(audio.playing.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('voice changes cancel the old source and ignore its late media callbacks', async () => {
    const rejectFirst: Array<(reason: Error) => void> = [];
    const instances = stubAudio((_src, audio) => instances.length === 1
      ? new Promise<void>((_, reject) => rejectFirst.push(reject))
      : Promise.resolve());
    const audio = createExtensionPronunciation();
    const first = audio.play(textbook);
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    const lateError = instances[0].onerror;
    const lateEnded = instances[0].onended;

    audio.setVoice('male');
    expect(await first).toBe(false);
    expect(audio.source.value).toBeNull();
    expect(await audio.play(textbook)).toBe(true);
    rejectFirst[0]?.(new Error('late old voice rejection'));
    lateError?.();
    lateEnded?.();
    await Promise.resolve();

    expect(instances).toHaveLength(2);
    expect(instances[0].src).toContain('/audio/google/v1/a/');
    expect(instances[1].src).toContain('/audio/google/v1/c/');
    expect(audio.source.value).toEqual({ kind: 'google', voice: 'male' });
    expect(audio.sourceLabel.value).toBe('Google WaveNet · 男声 C');
    expect(audio.playing.value).toBe(true);
  });
});
