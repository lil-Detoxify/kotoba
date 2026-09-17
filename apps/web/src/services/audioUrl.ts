import type { PronunciationVoice } from './pronunciationPreference';

const PARAMS_VERSION = 'google-wavenet-v1-ssml-yomigana-rate1-pitch0-volume0';
const VOICES = { female: 'ja-JP-Wavenet-A', male: 'ja-JP-Wavenet-C' } as const;

const urlCache = new Map<string, string>();

export async function getGoogleAudioUrl(
  term: string,
  reading: string,
  voice: PronunciationVoice
): Promise<string | undefined> {
  if (!reading) return undefined;
  const key = `${term}|${reading}|${voice}`;
  const cached = urlCache.get(key);
  if (cached) return cached;

  const voiceName = VOICES[voice] || VOICES.female;
  const payload = JSON.stringify({
    term,
    reading,
    voice: voiceName,
    paramsVersion: PARAMS_VERSION
  });

  try {
    const data = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const sub = voice === 'male' ? 'c' : 'a';
    const url = `/audio/google/v1/${sub}/${hashHex}.mp3`;
    urlCache.set(key, url);
    return url;
  } catch {
    return undefined;
  }
}
