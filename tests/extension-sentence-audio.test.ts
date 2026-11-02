import { describe, expect, it, vi } from 'vitest';
import { createExtensionSentenceAudioLookup } from '../apps/extension/src/sentence-audio';

function jsonResponse(value: unknown): Response {
  return { ok: true, status: 200, json: async () => value } as Response;
}

function audioIndexFetch(text: string) {
  const urls: URL[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.pathname.endsWith('/manifest.json')) {
      return jsonResponse({ schemaVersion: 1, version: '1234567890abcdef', shardCount: 64 });
    }
    return jsonResponse({ [text]: { female: `/audio/google/v1/a/${'a'.repeat(64)}.mp3` } });
  }) as unknown as typeof fetch;
  return { fetcher, urls };
}

describe('extension sentence audio data origin', () => {
  it('loads only the requested manifest and shard from the configured test candidate', async () => {
    const text = '毎日、日本語を勉強します。';
    const { fetcher, urls } = audioIndexFetch(text);
    const lookup = createExtensionSentenceAudioLookup(fetcher, 'https://staging.kotobud.com');

    await expect(lookup.lookup(text, 'female')).resolves.toBe(`/audio/google/v1/a/${'a'.repeat(64)}.mp3`);

    expect(urls).toHaveLength(2);
    expect(urls[0].href).toBe('https://staging.kotobud.com/data/sentence-audio/v1/manifest.json');
    expect(urls[1].origin).toBe('https://staging.kotobud.com');
    expect(urls[1].pathname).toMatch(/^\/data\/sentence-audio\/v1\/1234567890abcdef\/\d+\.json$/u);
  });

  it('keeps index requests on production unless the exact staging origin is selected', async () => {
    const text = '言葉を大切にします。';
    const { fetcher, urls } = audioIndexFetch(text);
    const lookup = createExtensionSentenceAudioLookup(fetcher, 'https://untrusted.example');

    await lookup.lookup(text, 'female');

    expect(urls[0].origin).toBe('https://kotobud.com');
  });
});
