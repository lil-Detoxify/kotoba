import { onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { createSentenceAudioLookup, type SentenceAudioVoice } from '@jp/shared';
import {claimExtensionAudioFocus,releaseExtensionAudioFocus} from './audio-focus';

const KOTOBUD_RESOURCE_ORIGIN = 'https://kotobud.com';
const ALLOWED_DATA_ORIGINS = new Set([KOTOBUD_RESOURCE_ORIGIN, 'https://staging.kotobud.com']);

function sentenceAudioDataOrigin(value: string | undefined): string {
  if (!value?.trim()) return KOTOBUD_RESOURCE_ORIGIN;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || !ALLOWED_DATA_ORIGINS.has(url.origin)) return KOTOBUD_RESOURCE_ORIGIN;
    return url.origin;
  } catch {
    return KOTOBUD_RESOURCE_ORIGIN;
  }
}

const configuredDataOrigin = sentenceAudioDataOrigin(import.meta.env.VITE_SENTENCE_AUDIO_DATA_ORIGIN);
let activeSentenceAudioStop: (() => void) | undefined;

export function createExtensionSentenceAudioLookup(
  fetcher: typeof fetch = (...args) => fetch(...args),
  dataOrigin = configuredDataOrigin,
) {
  const indexOrigin = sentenceAudioDataOrigin(dataOrigin);
  return createSentenceAudioLookup({
    loadJson: async (path, signal) => {
      const url = new URL(path, indexOrigin);
      if (url.origin !== indexOrigin) throw new Error('Sentence audio index unavailable');
      const response = await fetcher(url, { signal, credentials: 'omit', cache: path.endsWith('/manifest.json') ? 'no-store' : 'default' });
      if (!response.ok) throw new Error(`Sentence audio index request failed (${response.status})`);
      return response.json();
    },
  });
}

const sentenceAudioLookup = createExtensionSentenceAudioLookup();

function clearMedia(media: HTMLAudioElement | undefined): void {
  if (!media) return;
  media.onplaying = null;
  media.onended = null;
  media.onerror = null;
  media.pause();
  media.removeAttribute('src');
  media.load();
}

/** Plays existing Google WaveNet sentence files and never falls back to generated speech. */
export function useExtensionSentenceAudio() {
  const playing = ref(false);
  const loading = ref(false);
  const error = ref('');
  let generation = 0;
  let controller: AbortController | undefined;
  let media: HTMLAudioElement | undefined;

  function stop(): void {
    releaseExtensionAudioFocus(stop);
    generation++;
    controller?.abort();
    controller = undefined;
    clearMedia(media);
    media = undefined;
    playing.value = false;
    loading.value = false;
    if (activeSentenceAudioStop === stop) activeSentenceAudioStop = undefined;
  }

  async function play(text: string, voice: SentenceAudioVoice, slow = false): Promise<boolean> {
    activeSentenceAudioStop?.();
    stop();
    claimExtensionAudioFocus(stop);
    const ticket = generation;
    const request = new AbortController();
    controller = request;
    activeSentenceAudioStop = stop;
    loading.value = true;
    error.value = '';

    try {
      const path = await sentenceAudioLookup.lookup(text, voice, request.signal);
      if (ticket !== generation) return false;
      if (!path) {
        error.value = '这句暂未提供朗读。';
        if (activeSentenceAudioStop === stop) activeSentenceAudioStop = undefined;
        return false;
      }

      const audioUrl = new URL(path, KOTOBUD_RESOURCE_ORIGIN);
      if (audioUrl.origin !== KOTOBUD_RESOURCE_ORIGIN) throw new Error('Sentence audio unavailable');
      const audio = new Audio(audioUrl.href);
      audio.preload = 'auto';
      audio.playbackRate = slow ? 0.75 : 1;
      const pitchAudio = audio as HTMLAudioElement & {
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
        mozPreservesPitch?: boolean;
      };
      pitchAudio.preservesPitch = true;
      pitchAudio.webkitPreservesPitch = true;
      pitchAudio.mozPreservesPitch = true;
      media = audio;

      audio.onplaying = () => {
        if (ticket !== generation || media !== audio) return;
        playing.value = true;
        loading.value = false;
      };
      audio.onended = () => {
        if (ticket !== generation || media !== audio) return;
        clearMedia(audio);
        media = undefined;
        playing.value = false;
        if (activeSentenceAudioStop === stop) activeSentenceAudioStop = undefined;
      };
      audio.onerror = () => {
        if (ticket !== generation || media !== audio) return;
        clearMedia(audio);
        media = undefined;
        playing.value = false;
        error.value = '句子音频播放失败，请重试。';
        if (activeSentenceAudioStop === stop) activeSentenceAudioStop = undefined;
      };

      await audio.play();
      if (ticket !== generation || media !== audio) return false;
      loading.value = false;
      playing.value = true;
      return true;
    } catch (cause) {
      if (ticket !== generation || request.signal.aborted) return false;
      clearMedia(media);
      media = undefined;
      playing.value = false;
      if (activeSentenceAudioStop === stop) activeSentenceAudioStop = undefined;
      error.value = cause instanceof Error && cause.name === 'NotAllowedError'
        ? '浏览器暂时阻止了播放，请重试。'
        : '句子音频加载失败，请重试。';
      return false;
    } finally {
      if (ticket === generation) loading.value = false;
    }
  }

  function visibilityChanged(): void {
    if (typeof document !== 'undefined' && document.hidden) stop();
  }

  onMounted(() => {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibilityChanged);
  });
  onDeactivated(stop);
  onUnmounted(() => {
    stop();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityChanged);
  });

  return { playing, loading, error, play, stop };
}
