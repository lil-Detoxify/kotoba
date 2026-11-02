import { computed, ref, type Ref } from 'vue';
import woodCorrectUrl from '../assets/answer-sounds/wood-correct.wav?url';
import woodIncorrectUrl from '../assets/answer-sounds/wood-incorrect.wav?url';
import chimeCorrectUrl from '../assets/answer-sounds/chime-correct.wav?url';
import chimeIncorrectUrl from '../assets/answer-sounds/chime-incorrect.wav?url';
import timberCorrectUrl from '../assets/answer-sounds/timber-correct.wav?url';
import timberIncorrectUrl from '../assets/answer-sounds/timber-incorrect.wav?url';
import stoneCorrectUrl from '../assets/answer-sounds/stone-correct.wav?url';
import stoneIncorrectUrl from '../assets/answer-sounds/stone-incorrect.wav?url';

export type AnswerSoundScheme = 'wood' | 'chime' | 'timber' | 'stone';

export const ANSWER_SOUND_OPTIONS = [
  { id: 'wood', name: '木芽', description: '圆润的木质轻敲' },
  { id: 'chime', name: '风铃', description: '轻柔的短钟余韵' },
  { id: 'timber', name: '林木', description: '温厚、干燥的木声' },
  { id: 'stone', name: '溪石', description: '清脆、柔化的石声' },
] as const satisfies readonly { id: AnswerSoundScheme; name: string; description: string }[];

export interface AnswerSoundPreference {
  enabled: Ref<boolean>;
  scheme: Ref<AnswerSoundScheme>;
  volume: Ref<number>;
  setEnabled(value: boolean): void;
  setScheme(value: AnswerSoundScheme): void;
  setVolume(value: number): void;
}

const STORAGE_KEY = 'kotobud.web.answer-sound.v1';
const DEFAULT_ENABLED = true;
const DEFAULT_SCHEME: AnswerSoundScheme = 'wood';
const DEFAULT_VOLUME = 0.45;
const enabledState = ref(DEFAULT_ENABLED);
const schemeState = ref<AnswerSoundScheme>(DEFAULT_SCHEME);
const volumeState = ref(DEFAULT_VOLUME);
let loaded = false;
let activeAudio: HTMLAudioElement | null = null;
let generation = 0;

const soundUrls: Record<AnswerSoundScheme, { correct: string; incorrect: string }> = {
  wood: { correct: woodCorrectUrl, incorrect: woodIncorrectUrl },
  chime: { correct: chimeCorrectUrl, incorrect: chimeIncorrectUrl },
  timber: { correct: timberCorrectUrl, incorrect: timberIncorrectUrl },
  stone: { correct: stoneCorrectUrl, incorrect: stoneIncorrectUrl },
};

function isAnswerSoundScheme(value: unknown): value is AnswerSoundScheme {
  return value === 'wood' || value === 'chime' || value === 'timber' || value === 'stone';
}

function normalizedVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_VOLUME;
}

function loadPreference(): void {
  if (loaded) return;
  loaded = true;
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!saved) return;
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.enabled === 'boolean') enabledState.value = record.enabled;
    if (isAnswerSoundScheme(record.scheme)) schemeState.value = record.scheme;
    if (typeof record.volume === 'number' && Number.isFinite(record.volume)) {
      volumeState.value = normalizedVolume(record.volume);
    }
  } catch {
    // Keep the in-memory defaults when storage is unavailable or invalid.
  }
}

function persistPreference(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({
      enabled: enabledState.value,
      scheme: schemeState.value,
      volume: volumeState.value,
    }));
  } catch {
    // Playback preferences remain usable when storage is unavailable.
  }
}

function pauseAudio(audio: HTMLAudioElement): void {
  try {
    audio.pause();
  } catch {
    // A browser audio implementation may fail while its source is being released.
  }
  try {
    audio.currentTime = 0;
  } catch {
    // Some browsers do not allow seeking before audio metadata has loaded.
  }
}

export function stopAnswerSound(): void {
  generation += 1;
  const previous = activeAudio;
  activeAudio = null;
  if (previous) pauseAudio(previous);
}

function setEnabled(value: boolean): void {
  loadPreference();
  if (typeof value !== 'boolean') return;
  enabledState.value = value;
  if (!value) stopAnswerSound();
  persistPreference();
}

function setScheme(value: AnswerSoundScheme): void {
  loadPreference();
  if (!isAnswerSoundScheme(value)) return;
  if (schemeState.value !== value) stopAnswerSound();
  schemeState.value = value;
  persistPreference();
}

function setVolume(value: number): void {
  loadPreference();
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  volumeState.value = normalizedVolume(value);
  if (volumeState.value === 0) {
    stopAnswerSound();
  } else if (activeAudio) {
    try {
      activeAudio.volume = volumeState.value;
    } catch {
      // A volume update must not interrupt the study flow.
    }
  }
  persistPreference();
}

export function useAnswerSoundPreference(): AnswerSoundPreference {
  loadPreference();
  return {
    enabled: computed({ get: () => enabledState.value, set: setEnabled }),
    scheme: computed({ get: () => schemeState.value, set: setScheme }),
    volume: computed({ get: () => volumeState.value, set: setVolume }),
    setEnabled,
    setScheme,
    setVolume,
  };
}

function playUrl(url: string, volume: number): Promise<boolean> {
  stopAnswerSound();
  const AudioConstructor = globalThis.Audio;
  if (typeof AudioConstructor !== 'function' || volume <= 0) return Promise.resolve(false);

  const playGeneration = generation;
  let audio: HTMLAudioElement;
  try {
    audio = new AudioConstructor(url);
    audio.volume = volume;
  } catch {
    return Promise.resolve(false);
  }

  activeAudio = audio;
  let playResult: Promise<void>;
  try {
    playResult = audio.play();
  } catch {
    if (generation === playGeneration && activeAudio === audio) activeAudio = null;
    pauseAudio(audio);
    return Promise.resolve(false);
  }

  return Promise.resolve(playResult).then(() => {
    if (generation !== playGeneration || activeAudio !== audio) {
      pauseAudio(audio);
      return false;
    }
    return true;
  }, () => {
    if (generation === playGeneration && activeAudio === audio) activeAudio = null;
    pauseAudio(audio);
    return false;
  });
}

export function playAnswerSound(correct: boolean): Promise<boolean> {
  loadPreference();
  if (!enabledState.value || volumeState.value === 0) {
    stopAnswerSound();
    return Promise.resolve(false);
  }
  const url = soundUrls[schemeState.value][correct ? 'correct' : 'incorrect'];
  return playUrl(url, volumeState.value);
}

export function previewAnswerSound(scheme: AnswerSoundScheme, correct: boolean): Promise<boolean> {
  loadPreference();
  if (!isAnswerSoundScheme(scheme) || volumeState.value === 0) {
    stopAnswerSound();
    return Promise.resolve(false);
  }
  const url = soundUrls[scheme][correct ? 'correct' : 'incorrect'];
  return playUrl(url, volumeState.value);
}
