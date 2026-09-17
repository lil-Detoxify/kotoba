interface Env {
  KOTOBA_R2: R2Bucket;
  KOTOBA_DATA_VERSION?: string;
}

const BUCKET_RE = /^(?:0|[1-9]\d{0,2})\.json$/;
const STATIC_FILES = new Set(['LICENSE.md', 'NOTICE.md', 'KOTOBA-NOTICE.md', 'manifest.json', 'table-licenses.json']);

export const onRequestGet: PagesFunction<Env> = async ({ params, env, next }) => {
  const bucket = String(params.bucket ?? '');
  if (STATIC_FILES.has(bucket)) return next();
  if (!BUCKET_RE.test(bucket) || Number(bucket.slice(0, -5)) > 511) {
    return new Response(JSON.stringify({ error: 'dictionary shard not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const version = env.KOTOBA_DATA_VERSION ?? 'v1';
  let object: R2ObjectBody | null;
  try {
    object = await env.KOTOBA_R2.get(`dictionary/${version}/${bucket}`);
  } catch {
    return new Response(JSON.stringify({ error: 'dictionary storage unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  if (!object) {
    return new Response(JSON.stringify({ error: 'dictionary shard not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'public, max-age=86400, s-maxage=604800, immutable');
  headers.set('x-content-type-options', 'nosniff');
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
};

export const onRequestHead: PagesFunction<Env> = async (context) => {
  const response = await onRequestGet(context);
  return new Response(null, { status: response.status, headers: response.headers });
};
