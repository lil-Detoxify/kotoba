interface Env { KOTOBA_R2: R2Bucket }
const VERSION_RE = /^v1$/;
const VOICE_RE = /^[ac]$/;
const HASH_RE = /^[a-f0-9]{64}\.mp3$/;
const missing = () => new Response('Not found', {status: 404, headers: {'cache-control': 'no-store'}});
export const onRequestGet: PagesFunction<Env> = async ({params, env}) => {
  const version = String(params.version ?? ''), voice = String(params.voice ?? ''), hash = String(params.hash ?? '');
  if (!VERSION_RE.test(version) || !VOICE_RE.test(voice) || !HASH_RE.test(hash)) return missing();
  let object: R2ObjectBody | null;
  try { object = await env.KOTOBA_R2.get(`audio/google/${version}/${voice}/${hash}`); }
  catch { return new Response('Storage unavailable', {status: 503, headers: {'cache-control': 'no-store'}}); }
  if (!object) return missing();
  const headers = new Headers(); object.writeHttpMetadata(headers);
  headers.set('content-type', 'audio/mpeg'); headers.set('cache-control', 'public, max-age=31536000, s-maxage=31536000, immutable'); headers.set('x-content-type-options', 'nosniff');
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  return new Response(object.body, {headers});
};
export const onRequestHead: PagesFunction<Env> = async context => { const response = await onRequestGet(context); return new Response(null, {status: response.status, headers: response.headers}); };
