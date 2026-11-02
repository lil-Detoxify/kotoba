import mapUrl from '../google-sentence-audio-map.json?url';
import type { SentenceAudioEntry } from './sentence-audio';

export async function loadSentenceAudioEntries(): Promise<readonly SentenceAudioEntry[]> {
  // Background preparation may outlive a single tap's eight-second wait.
  const response = await fetch(mapUrl, { signal: AbortSignal.timeout(45_000), priority: 'low' });
  if (!response.ok) throw new Error('Prepared sentence audio data is unavailable');
  const payload = await response.json() as { entries?: SentenceAudioEntry[] };
  if (!Array.isArray(payload.entries)) throw new Error('Prepared sentence audio data is invalid');
  return payload.entries;
}
