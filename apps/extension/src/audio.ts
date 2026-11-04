import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Word } from '@jp/models';
import { getGoogleAudioUrl } from '../../web/src/services/audioUrl';
import { createWordAudioPrefetch } from '../../web/src/services/word-audio-prefetch';
import {claimExtensionAudioFocus,releaseExtensionAudioFocus} from './audio-focus';

export type ExtensionAudioSource =
  | { kind: 'google'; voice: 'female' | 'male' }
  | { kind: 'book'; location: 'extension' | 'kotobud' }
  | { kind: 'device' };

type AudioCandidate = { url: string; source: ExtensionAudioSource };

const extensionProtocols = new Set(['chrome-extension:', 'moz-extension:', 'safari-web-extension:']);

function extensionPageUrl(): URL {
  try {
    if (typeof location !== 'undefined' && location.href) return new URL(location.href);
  } catch {
    // Keep the source validator usable in non-browser test environments.
  }
  return new URL('chrome-extension://extension.invalid/index.html');
}

function sameExtensionOrigin(left: URL, right: URL): boolean {
  return left.protocol === right.protocol && left.host.toLowerCase() === right.host.toLowerCase();
}

function safeBookAudioUrl(value: string | undefined): { url: string; location: 'extension' | 'kotobud' } | undefined {
  if (!value?.trim()) return undefined;
  const page = extensionPageUrl();
  let url: URL;
  try {
    url = new URL(value, page);
  } catch {
    return undefined;
  }

  if (
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === 'kotobud.com' &&
    !url.username &&
    !url.password &&
    !url.port
  ) {
    return { url: url.href, location: 'kotobud' };
  }

  if (extensionProtocols.has(url.protocol) && sameExtensionOrigin(url, page)) {
    return { url: url.href, location: 'extension' };
  }
  return undefined;
}

function safeGoogleAudioUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const page = extensionPageUrl();
    const local = new URL(value, page);
    if (extensionProtocols.has(local.protocol) && sameExtensionOrigin(local, page) && /^\/assets\/[^/]+\.mp3$/.test(local.pathname)) return local.href;
    const url = new URL(value, 'https://kotobud.com');
    if (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'kotobud.com' &&
      !url.username &&
      !url.password &&
      !url.port
    ) {
      return url.href;
    }
  } catch {
    // A malformed generated URL should fall through to the word's other sources.
  }
  return undefined;
}

function labelForSource(source: ExtensionAudioSource | null): string {
  if (source?.kind === 'google') return `Google WaveNet · ${source.voice === 'female' ? '女声 A' : '男声 C'}`;
  if (source?.kind === 'book') {
    return source.location === 'kotobud' ? '词书音频 · KotoBud 回退' : '本地词书音频 · 回退发音';
  }
  if (source?.kind === 'device') return '设备日语语音';
  return '';
}

export function createExtensionPronunciation() {
  const voice = ref<'female' | 'male'>('female');
  const playing = ref(false);
  const error = ref('');
  const source = ref<ExtensionAudioSource | null>(null);
  const sourceLabel = computed(() => labelForSource(source.value) || (error.value ? '发音不可用' : ''));
  const synth = typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis;
  let media: HTMLAudioElement | undefined;
  let activeUtterance: SpeechSynthesisUtterance | undefined;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelPendingPlayback: (() => void) | undefined;
  let resolvePlayPending: ((value: boolean) => void) | undefined;
  const prefetched = createWordAudioPrefetch(3);
  let prefetchGeneration = 0;

  function clearPrefetch() {
    prefetchGeneration++;
    prefetched.clear();
  }

  async function preferredCandidate(word: Word): Promise<AudioCandidate | undefined> {
    if (word.id.includes('-w-') && !word.id.startsWith('custom-')) {
      try {
        const path = await getGoogleAudioUrl(word.audioTerm || word.rawTerm || word.term, word.reading, voice.value);
        const url = safeGoogleAudioUrl(path);
        if (url) return { url, source: { kind: 'google', voice: voice.value } };
      } catch {
        // A missing Google asset should continue through the word's other sources.
      }
    }
    const bookAudio = safeBookAudioUrl(word.audioUrl);
    return bookAudio ? { url: bookAudio.url, source: { kind: 'book', location: bookAudio.location } } : undefined;
  }

  function prefetch(words: readonly Word[]) {
    prefetchGeneration++;
    const ticket = prefetchGeneration;
    const targets = words.slice(0, 3);
    void Promise.all(targets.map(preferredCandidate)).then(candidates => {
      if (ticket !== prefetchGeneration) return;
      prefetched.prepare(candidates.flatMap(candidate => candidate ? [candidate.url] : []));
    });
  }

  function stop() {
    releaseExtensionAudioFocus(stop);
    generation++;
    if (timer) clearTimeout(timer);
    timer = undefined;

    const cancel = cancelPendingPlayback;
    cancelPendingPlayback = undefined;
    cancel?.();

    const currentMedia = media;
    media = undefined;
    if (currentMedia) {
      currentMedia.onplaying = null;
      currentMedia.onended = null;
      currentMedia.onerror = null;
      currentMedia.pause();
    }

    const currentUtterance = activeUtterance;
    activeUtterance = undefined;
    if (currentUtterance) {
      currentUtterance.onstart = null;
      currentUtterance.onend = null;
      currentUtterance.onerror = null;
    }
    synth?.cancel();

    const settle = resolvePlayPending;
    resolvePlayPending = undefined;
    settle?.(false);
    playing.value = false;
  }

  function setVoice(value: 'female' | 'male') {
    if (value !== 'female' && value !== 'male') return;
    stop();
    clearPrefetch();
    voice.value = value;
    source.value = null;
    error.value = '';
  }

  function recordSuccessfulStart(ticket: number, playbackSource: ExtensionAudioSource, finish: (value: boolean) => void) {
    if (ticket !== generation) return;
    source.value = playbackSource;
    error.value = '';
    playing.value = true;
    finish(true);
  }

  function failPlayback(ticket: number, finish: (value: boolean) => void) {
    if (ticket !== generation) return;
    stop();
    source.value = null;
    error.value = '发音暂时不可用，请检查网络或切换题型。';
    finish(false);
  }

  function playMediaCandidate(
    candidate: AudioCandidate,
    slow: boolean,
    ticket: number,
    finish: (value: boolean) => void,
    continueFallback: () => Promise<boolean>,
  ): Promise<boolean> {
    if (ticket !== generation) return Promise.resolve(false);

    let audio: HTMLAudioElement;
    try {
      audio = prefetched.take(candidate.url) ?? new Audio(candidate.url);
    } catch {
      return Promise.resolve(false);
    }

    let settled = false;
    let started = false;
    let lateErrorHandled = false;
    let localTimer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => finishBeforeStart(false);
    audio.playbackRate = slow ? 0.75 : 1;
    media = audio;

    const clearPending = () => {
      if (localTimer) {
        clearTimeout(localTimer);
        if (timer === localTimer) timer = undefined;
        localTimer = undefined;
      }
      if (cancelPendingPlayback === cancel) cancelPendingPlayback = undefined;
    };

    const detachAndPause = () => {
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      if (media === audio) media = undefined;
    };

    const finishBeforeStart = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearPending();
      if (!success || ticket !== generation || media !== audio) {
        detachAndPause();
        resolveCandidate(false);
        return;
      }
      started = true;
      recordSuccessfulStart(ticket, candidate.source, finish);
      resolveCandidate(true);
    };

    let resolveCandidate!: (value: boolean) => void;
    const candidatePromise = new Promise<boolean>(resolve => { resolveCandidate = resolve; });
    cancel = () => finishBeforeStart(false);
    cancelPendingPlayback = cancel;

    const handleLateError = () => {
      if (!started || lateErrorHandled || ticket !== generation || media !== audio) return;
      lateErrorHandled = true;
      source.value = null;
      detachAndPause();
      void continueFallback().then(
        success => { if (!success) failPlayback(ticket, finish); },
        () => failPlayback(ticket, finish),
      );
    };

    audio.onplaying = () => {
      if (ticket !== generation || media !== audio) return;
      finishBeforeStart(true);
    };
    audio.onended = () => {
      if (ticket !== generation || media !== audio) return;
      if (!started) {
        finishBeforeStart(false);
        return;
      }
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      media = undefined;
      playing.value = false;
    };
    audio.onerror = () => {
      if (ticket !== generation || media !== audio) return;
      if (!started) finishBeforeStart(false);
      else handleLateError();
    };

    localTimer = setTimeout(() => finishBeforeStart(false), 10_000);
    timer = localTimer;
    try {
      Promise.resolve(audio.play()).then(
        () => finishBeforeStart(true),
        () => {
          if (started) handleLateError();
          else finishBeforeStart(false);
        },
      );
    } catch {
      finishBeforeStart(false);
    }
    return candidatePromise;
  }

  function playOnDevice(
    word: Word,
    slow: boolean,
    ticket: number,
    finish: (value: boolean) => void,
  ): Promise<boolean> {
    if (ticket !== generation || !synth) return Promise.resolve(false);

    let selected: SpeechSynthesisVoice | undefined;
    try {
      selected = synth.getVoices().find(item => /^ja(?:-|_)/i.test(item.lang));
    } catch {
      return Promise.resolve(false);
    }
    if (!selected) return Promise.resolve(false);

    return new Promise(resolve => {
      let settled = false;
      let started = false;
      let localTimer: ReturnType<typeof setTimeout> | undefined;
      let utterance: SpeechSynthesisUtterance;
      try {
        utterance = new SpeechSynthesisUtterance(word.reading || word.audioTerm || word.rawTerm || word.term);
      } catch {
        resolve(false);
        return;
      }

      utterance.lang = 'ja-JP';
      utterance.voice = selected!;
      utterance.rate = slow ? 0.65 : 0.9;
      activeUtterance = utterance;

      const clearPending = () => {
        if (localTimer) {
          clearTimeout(localTimer);
          if (timer === localTimer) timer = undefined;
          localTimer = undefined;
        }
        if (cancelPendingPlayback === cancel) cancelPendingPlayback = undefined;
      };

      const detach = () => {
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;
        if (activeUtterance === utterance) activeUtterance = undefined;
      };

      const finishBeforeStart = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearPending();
        if (!success || ticket !== generation || activeUtterance !== utterance) {
          detach();
          resolve(false);
          return;
        }
        started = true;
        recordSuccessfulStart(ticket, { kind: 'device' }, finish);
        resolve(true);
      };

      const cancel = () => finishBeforeStart(false);
      cancelPendingPlayback = cancel;
      utterance.onstart = () => {
        if (ticket !== generation || activeUtterance !== utterance) return;
        finishBeforeStart(true);
      };
      utterance.onend = () => {
        if (ticket !== generation || activeUtterance !== utterance) return;
        if (!started) {
          finishBeforeStart(false);
          return;
        }
        detach();
        playing.value = false;
      };
      utterance.onerror = () => {
        if (ticket !== generation || activeUtterance !== utterance) return;
        if (!started) finishBeforeStart(false);
        else failPlayback(ticket, finish);
      };

      localTimer = setTimeout(() => {
        if (ticket === generation && !started) synth.cancel();
        finishBeforeStart(false);
      }, 8_000);
      timer = localTimer;
      try {
        synth.speak(utterance);
      } catch {
        finishBeforeStart(false);
      }
    });
  }

  async function play(word: Word, slow = false): Promise<boolean> {
    stop();
    claimExtensionAudioFocus(stop);
    error.value = '';
    source.value = null;
    const ticket = generation;
    playing.value = true;

    return new Promise<boolean>(resolve => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        if (resolvePlayPending === finish) resolvePlayPending = undefined;
        resolve(value);
      };
      resolvePlayPending = finish;

      void (async () => {
        const candidates: AudioCandidate[] = [];
        if (word.id.includes('-w-') && !word.id.startsWith('custom-')) {
          try {
            const path = await getGoogleAudioUrl(word.audioTerm || word.rawTerm || word.term, word.reading, voice.value);
            const url = safeGoogleAudioUrl(path);
            if (url) candidates.push({ url, source: { kind: 'google', voice: voice.value } });
          } catch {
            // A missing Google asset should continue through the word's other sources.
          }
        }
        if (ticket !== generation) {
          finish(false);
          return;
        }

        const bookAudio = safeBookAudioUrl(word.audioUrl);
        if (bookAudio && !candidates.some(candidate => candidate.url === bookAudio.url)) {
          candidates.push({ url: bookAudio.url, source: { kind: 'book', location: bookAudio.location } });
        }

        let nextCandidate = 0;
        const tryRemainingSources = async (): Promise<boolean> => {
          if (ticket !== generation) return false;
          while (nextCandidate < candidates.length) {
            const candidate = candidates[nextCandidate++];
            const started = await playMediaCandidate(candidate, slow, ticket, finish, tryRemainingSources);
            if (started) return true;
            if (ticket !== generation) return false;
          }
          return playOnDevice(word, slow, ticket, finish);
        };

        try {
          const success = await tryRemainingSources();
          if (!success && ticket === generation) failPlayback(ticket, finish);
        } catch {
          failPlayback(ticket, finish);
        }
      })();
    });
  }

  function hidden() {
    if (typeof document !== 'undefined' && document.hidden) {
      stop();
      clearPrefetch();
    }
  }

  onMounted(() => {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', hidden);
  });
  onUnmounted(() => {
    stop();
    clearPrefetch();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', hidden);
  });

  return { play, stop, setVoice, prefetch, clearPrefetch, voice, playing, error, source, sourceLabel };
}
