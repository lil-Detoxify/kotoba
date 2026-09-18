import { describe, expect, it } from 'vitest';
// @ts-ignore Cloudflare Worker script is vanilla JS with no app-side types
import worker from '../scripts/cloudflare-worker.js';

function makeEnv(overrides: Record<string, any> = {}) {
  return {
    KOTOBA_R2: {
      get: async () => null
    },
    ASSETS: {
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        if (url.pathname === '/' || url.pathname.endsWith('.html')) {
          return new Response('<!doctype html><html><head><title>KotoBud</title></head><body><div id="app"></div></body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' }
          });
        }
        return new Response('asset content', {
          status: 200,
          headers: { 'content-type': 'text/plain' }
        });
      }
    },
    ...overrides
  };
}

describe('Cloudflare Worker Domain & Environment Routing', () => {
  it('redirects www.kotobud.com to apex kotobud.com with 301 preserving path and query', async () => {
    const req = new Request('https://www.kotobud.com/books/biaori-1?lesson=2', { method: 'GET' });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://kotobud.com/books/biaori-1?lesson=2');
  });

  it('keeps legacy pages.dev working normally when ENABLE_LEGACY_301 is not true', async () => {
    const req = new Request('https://kotoba-iuz.pages.dev/', { method: 'GET' });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('KotoBud');
  });

  it('redirects legacy pages.dev to kotobud.com with 301 when ENABLE_LEGACY_301 is true', async () => {
    const req = new Request('https://kotoba-iuz.pages.dev/stats?view=weekly', { method: 'GET' });
    const res = await worker.fetch(req, makeEnv({ ENABLE_LEGACY_301: 'true' }));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://kotobud.com/stats?view=weekly');
  });

  it('serves disallow robots.txt on staging.kotobud.com and staging.kotoba-iuz.pages.dev', async () => {
    const reqStaging = new Request('https://staging.kotobud.com/robots.txt', { method: 'GET' });
    const resStaging = await worker.fetch(reqStaging, makeEnv());
    expect(resStaging.status).toBe(200);
    const bodyStaging = await resStaging.text();
    expect(bodyStaging).toContain('Disallow: /');
    expect(bodyStaging).not.toContain('Allow: /');

    const reqAlias = new Request('https://staging.kotoba-iuz.pages.dev/robots.txt', { method: 'GET' });
    const resAlias = await worker.fetch(reqAlias, makeEnv());
    expect(resAlias.status).toBe(200);
    expect(await resAlias.text()).toContain('Disallow: /');
  });

  it('serves allowed robots.txt with sitemap on production kotobud.com', async () => {
    const req = new Request('https://kotobud.com/robots.txt', { method: 'GET' });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Allow: /');
    expect(body).toContain('Sitemap: https://kotobud.com/sitemap.xml');
  });

  it('serves valid sitemap.xml on kotobud.com', async () => {
    const req = new Request('https://kotobud.com/sitemap.xml', { method: 'GET' });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    const xml = await res.text();
    expect(xml).toContain('<loc>https://kotobud.com/</loc>');
    expect(xml).toContain('<loc>https://kotobud.com/books</loc>');
  });

  it('injects noindex header and meta tag on staging HTML responses', async () => {
    const req = new Request('https://staging.kotobud.com/', { method: 'GET' });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    const html = await res.text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('does NOT inject noindex on production kotobud.com HTML responses', async () => {
    const req = new Request('https://kotobud.com/', { method: 'GET' });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBeNull();
    const html = await res.text();
    expect(html).not.toContain('noindex');
  });

  it('validates email format on /api/v1/auth/send-code', async () => {
    const req = new Request('https://kotobud.com/api/v1/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid-email' })
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toBe('invalid_email');
  });

  it('returns unauthenticated when session token is missing or invalid', async () => {
    const req = new Request('https://kotobud.com/api/v1/session', { method: 'GET' });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.authenticated).toBe(false);
    expect(data.user).toBeNull();
  });

  it('handles CORS OPTIONS preflight for kotoba://app origin', async () => {
    const req = new Request('https://kotobud.com/api/v1/auth/login-password', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'kotoba://app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('kotoba://app');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('injects CORS headers on API responses for kotoba://app origin', async () => {
    const req = new Request('https://kotobud.com/api/v1/capabilities', {
      method: 'GET',
      headers: { 'Origin': 'kotoba://app' }
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('kotoba://app');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('routes /downloads/Kotoba-0.6.0-Windows-x64-Setup.exe to R2 releases/0.6.0/', async () => {
    let requestedKey = '';
    const env = makeEnv({
      KOTOBA_R2: {
        get: async (key: string) => {
          requestedKey = key;
          return {
            size: 300000000,
            httpEtag: '"test-etag-060"',
            body: new ReadableStream()
          };
        }
      }
    });
    const req = new Request('https://kotobud.com/downloads/Kotoba-0.6.0-Windows-x64-Setup.exe', { method: 'GET' });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    expect(requestedKey).toBe('releases/0.6.0/Kotoba-0.6.0-Windows-x64-Setup.exe');
    expect(res.headers.get('content-disposition')).toContain('Kotoba-0.6.0-Windows-x64-Setup.exe');
    expect(res.headers.get('content-length')).toBe('300000000');
  });

  it('routes /releases/0.6.0/Kotoba-0.6.0-Windows-x64-Portable.exe to R2 releases/0.6.0/', async () => {
    let requestedKey = '';
    const env = makeEnv({
      KOTOBA_R2: {
        get: async (key: string) => {
          requestedKey = key;
          return {
            size: 299000000,
            httpEtag: '"test-etag-portable"',
            body: new ReadableStream()
          };
        }
      }
    });
    const req = new Request('https://kotobud.com/releases/0.6.0/Kotoba-0.6.0-Windows-x64-Portable.exe', { method: 'HEAD' });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    expect(requestedKey).toBe('releases/0.6.0/Kotoba-0.6.0-Windows-x64-Portable.exe');
    expect(res.headers.get('content-length')).toBe('299000000');
  });
});
