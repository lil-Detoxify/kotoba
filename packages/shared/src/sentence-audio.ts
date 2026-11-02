export type SentenceAudioVoice = 'female' | 'male';
export const SENTENCE_AUDIO_SHARDS = 64;
export const normalizeSentenceAudioText = (text: string): string => text.normalize('NFC').trim();

export function sentenceAudioBucket(text: string): number {
  let hash = 5381;
  for (const character of normalizeSentenceAudioText(text)) hash = (Math.imul(hash, 33) ^ character.codePointAt(0)!) >>> 0;
  return hash % SENTENCE_AUDIO_SHARDS;
}

interface SentenceAudioManifest { schemaVersion: 1; version: string; shardCount: number }
type SentenceAudioShard = Record<string, Partial<Record<SentenceAudioVoice, string>>>;
export interface SentenceAudioLookupOptions {
  loadJson: (path: string, signal?: AbortSignal) => Promise<unknown>;
  basePath?: string;
  maxShards?: number;
}

function abortError(): Error { const error = new Error('Sentence playback cancelled'); error.name = 'AbortError'; return error; }
function whileActive<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const cancel = () => { signal.removeEventListener('abort', cancel); reject(abortError()); };
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(value => { signal.removeEventListener('abort', cancel); resolve(value); }, error => { signal.removeEventListener('abort', cancel); reject(error); });
  });
}

/** Fetch only the small shard containing the requested existing recording. */
export function createSentenceAudioLookup(options: SentenceAudioLookupOptions) {
  const basePath = (options.basePath ?? '/data/sentence-audio/v1').replace(/\/$/u, '');
  const maxShards = Math.max(1, Math.min(16, options.maxShards ?? 6));
  const cache = new Map<string, SentenceAudioShard>();
  const pending = new Map<string, Promise<SentenceAudioShard>>();
  let manifest: Promise<SentenceAudioManifest> | undefined;
  let generation = 0;

  function getManifest(): Promise<SentenceAudioManifest> {
    if (!manifest) {
      const request = options.loadJson(basePath + '/manifest.json').then(raw => {
        const value = raw as Partial<SentenceAudioManifest> | null;
        if (!value || value.schemaVersion !== 1 || value.shardCount !== SENTENCE_AUDIO_SHARDS || !/^[a-f0-9]{16}$/u.test(value.version ?? '')) throw new Error('Sentence audio index unavailable');
        return value as SentenceAudioManifest;
      });
      manifest = request;
      void request.catch(() => { if (manifest === request) manifest = undefined; });
    }
    return manifest;
  }

  function getShard(version: string, bucket: number): Promise<SentenceAudioShard> {
    const key = version + '/' + bucket;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit); }
    const running = pending.get(key);
    if (running) return running;
    const ticket = generation;
    const request = options.loadJson(basePath + '/' + key + '.json').then(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Sentence audio index unavailable');
      const shard = raw as SentenceAudioShard;
      if (generation === ticket) {
        cache.set(key, shard);
        while (cache.size > maxShards) cache.delete(cache.keys().next().value!);
      }
      return shard;
    });
    pending.set(key, request);
    void request.finally(() => { if (pending.get(key) === request) pending.delete(key); }).catch(() => {});
    return request;
  }

  return {
    async lookup(text: string, voice: SentenceAudioVoice = 'female', signal?: AbortSignal): Promise<string | undefined> {
      const normalized = normalizeSentenceAudioText(text);
      if (!normalized) return undefined;
      if (signal?.aborted) throw abortError();
      const index = await whileActive(getManifest(), signal);
      const shard = await whileActive(getShard(index.version, sentenceAudioBucket(normalized)), signal);
      const row = Object.prototype.hasOwnProperty.call(shard, normalized) ? shard[normalized] : undefined;
      const path = row?.[voice];
      if (path !== undefined && (typeof path !== 'string' || !/^\/audio\/google\/v1\/[ac]\/[a-f0-9]{64}\.mp3$/u.test(path))) throw new Error('Sentence recording unavailable');
      return path;
    },
    clear(): void { generation++; manifest = undefined; cache.clear(); pending.clear(); },
  };
}
