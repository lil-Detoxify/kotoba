const dictionaryMeta = new Set(['LICENSE.md', 'NOTICE.md', 'KOTOBA-NOTICE.md', 'manifest.json', 'table-licenses.json']);
const json = (body, status, cache = 'no-store') => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': cache}});
const emptyHead = response => new Response(null, {status: response.status, headers: response.headers});

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://kotobud.com/</loc><lastmod>2026-09-17</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://kotobud.com/books</loc><lastmod>2026-09-17</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://kotobud.com/stats</loc><lastmod>2026-09-17</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
  <url><loc>https://kotobud.com/import</loc><lastmod>2026-09-17</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    const path = decodeURIComponent(url.pathname);

    // 1. WWW 301 Permanent Redirect: https://www.kotobud.com/* -> https://kotobud.com/*
    if (hostname === 'www.kotobud.com') {
      const target = new URL(request.url);
      target.hostname = 'kotobud.com';
      return Response.redirect(target.toString(), 301);
    }

    // 2. Legacy Domain 301: https://kotoba-iuz.pages.dev/* -> https://kotobud.com/*
    if (env.ENABLE_LEGACY_301 === 'true' && hostname === 'kotoba-iuz.pages.dev') {
      const target = new URL(request.url);
      target.hostname = 'kotobud.com';
      return Response.redirect(target.toString(), 301);
    }

    // 3. Staging and Preview Environment Detection
    const isStaging = hostname === 'staging.kotobud.com' || hostname === 'staging.kotoba-iuz.pages.dev';
    const isPreview = !isStaging && (hostname.endsWith('.pages.dev') && hostname !== 'kotoba-iuz.pages.dev');

    // 4. Staging / Preview robots.txt
    if ((isStaging || isPreview) && path === '/robots.txt') {
      return new Response("User-agent: *\nDisallow: /\n", {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    // 5. Production robots.txt
    if (path === '/robots.txt') {
      const robots = "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /downloads/\n\nSitemap: https://kotobud.com/sitemap.xml\n";
      return new Response(robots, {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=86400'
        }
      });
    }

    // 6. Production sitemap.xml
    if (path === '/sitemap.xml') {
      return new Response(SITEMAP_XML, {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=86400'
        }
      });
    }

    // Existing download handling
    if (path.startsWith('/downloads/')) {
      const file = path.slice('/downloads/'.length);
      if (!['Kotoba-0.5.0-Windows-x64-Setup.exe', 'Kotoba-0.5.0-Windows-x64-Portable.exe'].includes(file)) return new Response('Not found', {status:404});
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405, headers:{allow:'GET, HEAD'}});
      let object;
      try { object = await env.KOTOBA_R2.get(`releases/0.5.0/${file}`); }
      catch { return new Response('Storage unavailable', {status:503, headers:{'cache-control':'no-store'}}); }
      if (!object) return new Response('Not found', {status:404, headers:{'cache-control':'no-store'}});
      const headers = new Headers({'content-type':'application/octet-stream', 'content-disposition':`attachment; filename="${file}"`, 'content-length':String(object.size), 'cache-control':'public, max-age=86400', 'x-content-type-options':'nosniff', 'etag':object.httpEtag});
      return new Response(request.method === 'HEAD' ? null : object.body, {headers});
    }

    // Existing API handling
    if (path === '/api/v1') return request.method === 'HEAD' ? emptyHead(json({error:'api_disabled', message:'The API v1 surface is reserved and currently disabled.'}, 501)) : json({error:'api_disabled', message:'The API v1 surface is reserved and currently disabled.'}, 501);
    if (path === '/api/v1/capabilities') { const response = json({version:'v1', enabled:false, capabilities:[]}, 200); return request.method === 'HEAD' ? emptyHead(response) : response; }
    if (path === '/api/v1/session') { const response = json({authenticated:false, user:null, mode:'anonymous'}, 200); return request.method === 'HEAD' ? emptyHead(response) : response; }
    if (path === '/api/v1/sync') return json({error:'api_disabled', message:'Sync is reserved and currently disabled.'}, 501);
    if (path.startsWith('/api/v1/')) return json({error:'not_found', message:'API route not found.'}, 404);

    // Existing Dictionary handling
    const dict = path.match(/^\/dictionary\/([^/]+)$/);
    if (dict) {
      const file = dict[1];
      if (dictionaryMeta.has(file)) return env.ASSETS.fetch(request);
      if (!/^(?:0|[1-9]\d{0,2})\.json$/.test(file) || Number(file.slice(0, -5)) > 511) return json({error:'dictionary shard not found'}, 404);
      let object; try { object = await env.KOTOBA_R2.get(`dictionary/${env.KOTOBA_DATA_VERSION ?? 'v1'}/${file}`); } catch { return json({error:'dictionary storage unavailable'}, 503); }
      if (!object) return json({error:'dictionary shard not found'}, 404);
      const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('content-type','application/json; charset=utf-8'); headers.set('cache-control','public, max-age=86400, s-maxage=604800, immutable'); headers.set('x-content-type-options','nosniff'); if (object.httpEtag) headers.set('etag', object.httpEtag);
      const response = new Response(object.body, {headers}); return request.method === 'HEAD' ? emptyHead(response) : response;
    }

    // Existing Audio handling
    const audio = path.match(/^\/audio\/(\d+\.mp3)$/);
    if (audio) {
      const file = audio[1]; if (Number(file.slice(0, -4)) > 10000) return new Response('Not found', {status:404});
      let object; try { object = await env.KOTOBA_R2.get(`audio/${file}`); } catch { return new Response('Storage unavailable', {status:503}); }
      if (!object) return new Response('Not found', {status:404});
      const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('content-type','audio/mpeg'); headers.set('cache-control','public, max-age=31536000, s-maxage=31536000, immutable'); headers.set('x-content-type-options','nosniff'); if (object.httpEtag) headers.set('etag', object.httpEtag);
      const response = new Response(object.body, {headers}); return request.method === 'HEAD' ? emptyHead(response) : response;
    }
    const googleAudio = path.match(/^\/audio\/google\/(v1)\/([ac])\/([a-f0-9]{64}\.mp3)$/);
    if (googleAudio) {
      let object; try { object = await env.KOTOBA_R2.get(`audio/google/${googleAudio[1]}/${googleAudio[2]}/${googleAudio[3]}`); } catch { return new Response('Storage unavailable',{status:503,headers:{'cache-control':'no-store'}}); }
      if (!object) return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
      const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('content-type','audio/mpeg'); headers.set('cache-control','public, max-age=31536000, s-maxage=31536000, immutable'); headers.set('x-content-type-options','nosniff'); if (object.httpEtag) headers.set('etag',object.httpEtag);
      const response = new Response(object.body,{headers}); return request.method === 'HEAD' ? emptyHead(response) : response;
    }
    if (path.startsWith('/audio/')) return new Response('Not found', {status:404, headers:{'cache-control':'no-store'}});

    // Static assets fetch
    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get('content-type') || '';

    // Handle HTML documents: Inject noindex on Staging / Preview
    if (contentType.includes('text/html')) {
      const headers = new Headers(response.headers);
      if (isStaging || isPreview) {
        headers.set('x-robots-tag', 'noindex, nofollow');
        headers.set('cache-control', 'no-cache, no-store, must-revalidate');
        if (request.method !== 'HEAD') {
          let html = await response.text();
          if (!html.includes('<meta name="robots"')) {
            html = html.replace('<head>', '<head><meta name="robots" content="noindex, nofollow">');
          } else {
            html = html.replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow">');
          }
          return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        }
      }
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    if (path.startsWith('/assets/')) {
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    if (path.startsWith('/data/')) {
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'public, max-age=86400, s-maxage=604800, immutable');
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    return response;
  }
};
