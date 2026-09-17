interface Env {
  KOTOBA_R2: R2Bucket;
}

const AUDIO_RE = /^\d+\.mp3$/;

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const file = String(params.file ?? '');
  if (!AUDIO_RE.test(file) || Number(file.slice(0, -4)) > 10000) {
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  let object: R2ObjectBody | null;
  try {
    object = await env.KOTOBA_R2.get(`audio/${file}`);
  } catch {
    return new Response('Storage unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', 'audio/mpeg');
  headers.set('cache-control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
};

export const onRequestHead: PagesFunction<Env> = async (context) => {
  const response = await onRequestGet(context);
  return new Response(null, { status: response.status, headers: response.headers });
};
