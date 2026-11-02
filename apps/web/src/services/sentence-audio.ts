import audioIndex from '../google-sentence-audio-index.json';
import type { PronunciationVoice } from './pronunciationPreference';
import { loadSentenceAudioEntries } from './sentence-audio-data';

export interface SentenceAudioEntry {
  text: string;
  female?: string;
  male?: string;
}

/** Sentence clips are generated ahead of time; this lookup never requests synthesis. */
export function normalizeSentenceAudioText(text: string): string {
  return text.normalize('NFC').trim();
}

export function createSentenceAudioLookup(entries: readonly SentenceAudioEntry[]) {
  const clips = new Map(entries.map(entry => [normalizeSentenceAudioText(entry.text), entry]));
  return (text: string, voice: PronunciationVoice, assetBase = ''): string | undefined => {
    const path = clips.get(normalizeSentenceAudioText(text))?.[voice];
    if (!path) return undefined;
    return assetBase ? `${assetBase.replace(/\/+$/, '')}${path}` : path;
  };
}

/** Keep the large URL table out of the learning page's initial script. */
export function createPreparedSentenceAudioStore(
  texts: readonly string[],
  loadEntries: () => Promise<readonly SentenceAudioEntry[]>,
) {
  const knownTexts = new Set(texts.map(normalizeSentenceAudioText));
  let lookup: ReturnType<typeof createSentenceAudioLookup> | undefined;
  let pending: Promise<boolean> | undefined;
  return {
    get(text: string, voice: PronunciationVoice, assetBase = ''): string | undefined {
      return lookup?.(text, voice, assetBase);
    },
    has(text: string, voice: PronunciationVoice): boolean {
      return lookup ? !!lookup(text, voice) : knownTexts.has(normalizeSentenceAudioText(text));
    },
    prepare(): Promise<boolean> {
      if (lookup) return Promise.resolve(true);
      if (pending) return pending;
      pending = Promise.resolve().then(loadEntries).then(entries => {
        lookup = createSentenceAudioLookup(entries);
        return true;
      }).catch(() => {
        pending = undefined;
        return false;
      });
      return pending;
    },
  };
}

const store = createPreparedSentenceAudioStore(audioIndex.texts, loadSentenceAudioEntries);

export function prepareGoogleSentenceAudio(): Promise<boolean> {
  if (import.meta.env.VITE_SENTENCE_WAVENET_ENABLED !== 'true') return Promise.resolve(false);
  return store.prepare();
}

export function hasGoogleSentenceAudio(text: string, voice: PronunciationVoice): boolean {
  return import.meta.env.VITE_SENTENCE_WAVENET_ENABLED === 'true' && store.has(text, voice);
}

function defaultAssetBase(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'kotoba:') {
    return import.meta.env.VITE_API_BASE_URL || 'https://kotobud.com';
  }
  return '';
}

export function getGoogleSentenceAudioUrl(
  text: string,
  voice: PronunciationVoice,
  assetBase = defaultAssetBase(),
): string | undefined {
  // Releases opt into the approved prepared clips; unmatched text keeps device fallback.
  if (import.meta.env.VITE_SENTENCE_WAVENET_ENABLED !== 'true') return undefined;
  return store.get(text, voice, assetBase);
}
