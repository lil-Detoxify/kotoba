import {describe, expect, it} from 'vitest';
import {onRequestGet as dictionaryGet, onRequestHead as dictionaryHead} from '../functions/dictionary/[bucket]';
import {onRequestGet as audioGet, onRequestHead as audioHead} from '../functions/audio/[file]';
import {onRequestGet as googleAudioGet, onRequestHead as googleAudioHead} from '../functions/audio/google/[version]/[voice]/[hash]';
// @ts-ignore Pages Functions JavaScript route has no application-side module types.
import {onRequestGet as apiGet, onRequestHead as apiHead} from '../functions/api/v1/index.js';

function context(params: Record<string, string>, object: {body?: ReadableStream; httpEtag?: string} | null, hasBinding = true, next = async () => new Response('static')) {
  const objectWithMetadata = object && {...object, writeHttpMetadata: (headers: Headers) => headers.set('content-length', '2')};
  const bucket = hasBinding ? {get: async () => objectWithMetadata} : undefined;
  return {params, env: {KOTOBA_R2: bucket}, next} as never;
}

describe('Pages Functions R2 routes', () => {
  it('serves dictionary GET and HEAD with immutable caching', async () => {
    const body = new ReadableStream({start(controller) {controller.enqueue(new TextEncoder().encode('{}')); controller.close();}});
    const get = await dictionaryGet(context({bucket: '0.json'}, {body, httpEtag: '"dict"'}));
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toContain('application/json');
    expect(get.headers.get('cache-control')).toContain('immutable');
    const head = await dictionaryHead(context({bucket: '0.json'}, {body}));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('serves audio GET and HEAD', async () => {
    const body = new ReadableStream({start(controller) {controller.enqueue(new Uint8Array([1, 2])); controller.close();}});
    expect((await audioGet(context({file: '0.mp3'}, {body}))).status).toBe(200);
    expect((await audioHead(context({file: '0.mp3'}, {body}))).status).toBe(200);
  });

  it('serves only v1 Google A/C content-addressed audio', async () => {
    const body = new ReadableStream({start(controller) {controller.enqueue(new Uint8Array([1, 2])); controller.close();}});
    const hash = 'a'.repeat(64) + '.mp3';
    const get = await googleAudioGet(context({version: 'v1', voice: 'a', hash}, {body}));
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('audio/mpeg');
    expect(get.headers.get('cache-control')).toContain('immutable');
    expect((await googleAudioHead(context({version: 'v1', voice: 'c', hash}, {body}))).status).toBe(200);
    expect((await googleAudioGet(context({version: 'v2', voice: 'a', hash}, {body}))).status).toBe(404);
    expect((await googleAudioGet(context({version: 'v1', voice: 'b', hash}, {body}))).status).toBe(404);
    expect((await googleAudioGet(context({version: 'v1', voice: 'a', hash: 'bad.mp3'}, {body}))).status).toBe(404);
  });

  it('returns 404 for invalid and missing objects', async () => {
    expect((await dictionaryGet(context({bucket: '999.json'}, null))).status).toBe(404);
    expect((await audioGet(context({file: 'not-audio.mp3'}, null))).status).toBe(404);
    expect((await dictionaryGet(context({bucket: '0.json'}, null))).status).toBe(404);
  });

  it('returns 503 when the R2 binding is unavailable', async () => {
    expect((await dictionaryGet(context({bucket: '0.json'}, null, false))).status).toBe(503);
    expect((await audioGet(context({file: '0.mp3'}, null, false))).status).toBe(503);
  });

  it('falls back only for the five dictionary metadata files', async () => {
    const next = async () => new Response('license', {status: 200});
    expect((await dictionaryGet(context({bucket: 'LICENSE.md'}, null, false, next))).status).toBe(200);
    expect((await dictionaryGet(context({bucket: 'unknown.txt'}, null, false, next))).status).toBe(404);
  });

  it('keeps the reserved API v1 surface explicitly disabled', async () => {
    const response = await apiGet({} as never);
    expect(response.status).toBe(501);
    expect((await response.json() as {error: string}).error).toBe('api_disabled');
    expect((await apiHead({} as never)).status).toBe(501);
  });
});
