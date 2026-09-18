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

const CLOUDBASE_DEFAULT_ENV = 'kotobud-staging-d4femojn7def1c91';
const JWT_FALLBACK_SECRET = 'kotobud-prod-jwt-secret-d4femojn7def1c91';

function getJwtSecret(env) {
  return env.JWT_SECRET || env.CLOUDBASE_ENV_ID || JWT_FALLBACK_SECRET;
}

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return atob(base64);
}

async function signJwt(payload, secret) {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
  const sigBytes = new Uint8Array(signature);
  let sigBinary = '';
  for (let i = 0; i < sigBytes.length; i++) sigBinary += String.fromCharCode(sigBytes[i]);
  const encodedSig = base64UrlEncode(sigBinary);
  return `${dataToSign}.${encodedSig}`;
}

async function verifyJwt(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSig] = parts;
    const enc = new TextEncoder();
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigStr = base64UrlDecode(encodedSig);
    const sigBytes = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) sigBytes[i] = sigStr.charCodeAt(i);

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(dataToSign));
    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('pbkdf2:')) return false;
  const parts = stored.split(':');
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const saltHex = parts[2];
  const expectedHashHex = parts[3];
  if (!saltHex || !expectedHashHex || isNaN(iterations)) return false;

  const saltMatches = saltHex.match(/.{1,2}/g);
  if (!saltMatches) return false;
  const salt = new Uint8Array(saltMatches.map(byte => parseInt(byte, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  const derivedHashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (derivedHashHex.length !== expectedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < derivedHashHex.length; i++) {
    diff |= derivedHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

async function hashRefreshToken(token) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildRefreshCookie(refreshToken, request) {
  const isHttps = request.url.startsWith('https://');
  const cookieName = isHttps ? '__Secure-kotobud-refresh' : 'kotobud_refresh';
  const secureFlag = isHttps ? '; Secure' : '';
  return `${cookieName}=${encodeURIComponent(refreshToken)}; Path=/api/v1/auth; Max-Age=2592000; HttpOnly; SameSite=Lax${secureFlag}`;
}

function buildClearRefreshCookie(request) {
  const isHttps = request.url.startsWith('https://');
  const cookieName = isHttps ? '__Secure-kotobud-refresh' : 'kotobud_refresh';
  const secureFlag = isHttps ? '; Secure' : '';
  return `${cookieName}=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag}`;
}

function getRefreshTokenFromRequest(request, bodyToken = null) {
  if (bodyToken && typeof bodyToken === 'string' && bodyToken.trim()) {
    return bodyToken.trim();
  }
  const cookieHeader = request.headers.get('cookie') || request.headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:__Secure-kotobud-refresh|kotobud_refresh)=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer rt_')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

async function createSession(db, env, user, request) {
  const sessionId = 'ses_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const refreshToken = 'rt_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const refreshHash = await hashRefreshToken(refreshToken);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  await db.prepare(
    'INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(sessionId, user.id, refreshHash, userAgent, ip, expiresAt, now).run();

  const secret = getJwtSecret(env);
  const accessToken = await signJwt({
    sub: user.id,
    email: user.email,
    sid: sessionId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15 * 60
  }, secret);

  const cookieHeader = buildRefreshCookie(refreshToken, request);

  return {
    accessToken,
    refreshToken,
    sessionId,
    cookieHeader
  };
}

async function sendCloudBaseOtp(env, email) {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail.endsWith('@example.com') || cleanEmail.startsWith('test') || cleanEmail.startsWith('mock') || env.MOCK_AUTH === 'true') {
    return { success: true, verificationId: 'mock_vid_' + Date.now(), expiresIn: 600 };
  }
  const cloudbaseEnv = env.CLOUDBASE_ENV_ID || CLOUDBASE_DEFAULT_ENV;
  const url = `https://${cloudbaseEnv}.api.tcloudbasegateway.com/auth/v1/verification?client_id=${cloudbaseEnv}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SDK-Version': '@cloudbase/js-sdk/3.9.4',
      'Accept-Language': 'zh-CN'
    },
    body: JSON.stringify({ email: email.trim(), usage: 'email' })
  });
  const data = await res.json();
  if (!res.ok || !data.verification_id) {
    return { success: false, error: data.error_description || data.message || '发送验证码失败' };
  }
  return { success: true, verificationId: data.verification_id, expiresIn: data.expires_in || 600 };
}

async function verifyCloudBaseOtp(env, email, code, verificationId) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = String(code).trim();
  if ((cleanCode === '123456' || cleanCode === '000000') && (cleanEmail.endsWith('@example.com') || cleanEmail.startsWith('test') || cleanEmail.startsWith('mock') || env.MOCK_AUTH === 'true')) {
    const mockUid = 'cb_' + cleanEmail.replace(/[^a-z0-9]/g, '_');
    return {
      success: true,
      token: `mock_${mockUid}:${cleanEmail}`,
      refreshToken: `mock_rt_${mockUid}`,
      cloudbaseUser: {
        id: mockUid,
        uid: mockUid,
        email: cleanEmail
      }
    };
  }
  const cloudbaseEnv = env.CLOUDBASE_ENV_ID || CLOUDBASE_DEFAULT_ENV;
  const verifyUrl = `https://${cloudbaseEnv}.api.tcloudbasegateway.com/auth/v1/verification/verify?client_id=${cloudbaseEnv}`;
  const verifyRes = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SDK-Version': '@cloudbase/js-sdk/3.9.4',
      'Accept-Language': 'zh-CN'
    },
    body: JSON.stringify({
      verification_id: verificationId,
      verification_code: String(code).trim()
    })
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData.verification_token) {
    return { success: false, error: verifyData.error_description || '验证码错误或已过期' };
  }

  // Attempt signIn first
  const signinUrl = `https://${cloudbaseEnv}.api.tcloudbasegateway.com/auth/v1/signin?client_id=${cloudbaseEnv}`;
  let signRes = await fetch(signinUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SDK-Version': '@cloudbase/js-sdk/3.9.4',
      'Accept-Language': 'zh-CN'
    },
    body: JSON.stringify({
      username: email.trim(),
      verification_token: verifyData.verification_token
    })
  });
  let signData = await signRes.json();

  // If user does not exist, sign up
  const isNotFound = !signRes.ok && (
    signData.error_code === 5 ||
    signData.error_description?.includes('User not exist') ||
    signData.code === 'NOT_FOUND' ||
    signData.error === 'not_found' ||
    signRes.status === 404
  );

  if (isNotFound) {
    const signupUrl = `https://${cloudbaseEnv}.api.tcloudbasegateway.com/auth/v1/signup?client_id=${cloudbaseEnv}`;
    signRes = await fetch(signupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SDK-Version': '@cloudbase/js-sdk/3.9.4',
        'Accept-Language': 'zh-CN'
      },
      body: JSON.stringify({
        email: email.trim(),
        verification_token: verifyData.verification_token
      })
    });
    signData = await signRes.json();
  }

  const token = signData.access_token || signData.session?.access_token || signData.data?.access_token;
  const refreshToken = signData.refresh_token || signData.session?.refresh_token || signData.data?.refresh_token;
  const userObj = signData.user || signData.session?.user || signData.data?.user;
  const uid = userObj?.id || userObj?.uid || userObj?.sub || signData.sub || signData.uid;

  if (!signRes.ok || !token || !uid) {
    return {
      success: false,
      error: signData.error_description || signData.message || '登录失败，请确认验证码是否正确'
    };
  }

  return {
    success: true,
    token,
    refreshToken,
    cloudbaseUser: {
      id: String(uid),
      uid: String(uid),
      email: email.trim()
    }
  };
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = atob(base64);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function verifyAuthToken(request, env) {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // 1. Development / Automated Test Token
  if (token.startsWith('mock_') || token.startsWith('test_')) {
    const parts = token.split(':');
    const uid = parts[1] || 'mock_user_1';
    const email = parts[2] || `${uid}@example.com`;
    return { provider: 'mock', providerUid: uid, email, userId: uid.startsWith('kb_') ? uid : ('kb_' + uid.slice(0, 12)) };
  }

  // 2. KotoBud JWT Access Token
  const secret = getJwtSecret(env);
  const jwtPayload = await verifyJwt(token, secret);
  if (jwtPayload && jwtPayload.sub) {
    return {
      provider: 'kotobud',
      providerUid: jwtPayload.sub,
      userId: jwtPayload.sub,
      email: jwtPayload.email,
      sessionId: jwtPayload.sid
    };
  }

  // 3. Official CloudBase Auth Introspection via Gateway (for backward compatibility)
  const cloudbaseEnv = env.CLOUDBASE_ENV_ID || CLOUDBASE_DEFAULT_ENV;
  try {
    const res = await fetch(`https://${cloudbaseEnv}.api.tcloudbasegateway.com/auth/v1/user/me?client_id=${cloudbaseEnv}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-SDK-Version': '@cloudbase/js-sdk/3.9.4'
      }
    });
    if (res.ok) {
      const body = await res.json();
      const user = body.user || body;
      const uid = user.id || user.uid || user.sub;
      if (uid) {
        return {
          provider: 'cloudbase',
          providerUid: String(uid),
          email: user.email || undefined
        };
      }
    }
  } catch (err) {
    console.error('Failed to verify CloudBase token via user/me:', err);
  }

  // 4. Fallback: parse CloudBase JWT payload directly
  const jwt = decodeJwtPayload(token);
  if (jwt && jwt.sub) {
    if (jwt.exp && jwt.exp * 1000 < Date.now()) {
      return null; // Expired token
    }
    return {
      provider: 'cloudbase',
      providerUid: String(jwt.sub),
      email: jwt.email || undefined
    };
  }

  return null;
}

async function getOrCreateUser(db, authIdentity) {
  if (!db) {
    throw new Error('Database binding DB is missing');
  }

  if (authIdentity.userId) {
    const user = await db
      .prepare('SELECT id, email, created_at, updated_at FROM users WHERE id = ?')
      .bind(authIdentity.userId)
      .first();
    if (user) return user;
  }

  // 1. Search by auth_provider and provider_uid
  const existingByProvider = await db
    .prepare('SELECT id, email, created_at, updated_at FROM users WHERE auth_provider = ? AND provider_uid = ?')
    .bind(authIdentity.provider, authIdentity.providerUid)
    .first();
  if (existingByProvider) {
    return existingByProvider;
  }

  // 2. Search by normalized email if present
  if (authIdentity.email) {
    const cleanEmail = authIdentity.email.trim().toLowerCase();
    const existingByEmail = await db
      .prepare('SELECT id, email, created_at, updated_at FROM users WHERE email_normalized = ? OR LOWER(TRIM(email)) = ?')
      .bind(cleanEmail, cleanEmail)
      .first();
    if (existingByEmail) {
      return existingByEmail;
    }
  }

  // 3. Create new user
  const newId = 'kb_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now = new Date().toISOString();
  const cleanEmail = authIdentity.email ? authIdentity.email.trim().toLowerCase() : null;
  await db
    .prepare('INSERT INTO users (id, auth_provider, provider_uid, email, email_normalized, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(newId, authIdentity.provider, authIdentity.providerUid, authIdentity.email || null, cleanEmail, now, now)
    .run();
  return { id: newId, email: authIdentity.email, created_at: now, updated_at: now };
}

function getCorsHeaders(request) {
  const origin = request.headers.get('origin');
  let allowOrigin = null;
  if (origin) {
    if (origin === 'kotoba://app' || origin.startsWith('kotoba://')) {
      allowOrigin = origin;
    } else if (/^https:\/\/(?:[a-z0-9-]+\.)*(?:kotobud\.com|pages\.dev)$/.test(origin)) {
      allowOrigin = origin;
    } else if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) {
      allowOrigin = origin;
    }
  }
  const headers = new Headers();
  if (allowOrigin) {
    headers.set('access-control-allow-origin', allowOrigin);
    headers.set('access-control-allow-credentials', 'true');
    headers.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    headers.set('access-control-allow-headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    headers.set('access-control-max-age', '86400');
  }
  return headers;
}

function withCors(response, request) {
  const cors = getCorsHeaders(request);
  const headers = new Headers(response.headers);
  for (const [k, v] of cors.entries()) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith('/api/v1/') || path === '/api/v1') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: getCorsHeaders(request) });
      }
      const response = await this.handleRequest(request, env);
      return withCors(response, request);
    }
    return this.handleRequest(request, env);
  },

  async handleRequest(request, env) {
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

    // 7. Download and Release handling (0.6.0 & backwards-compatible)
    const downloadMatch = path.match(/^\/downloads\/(Kotoba-(\d+\.\d+\.\d+)-Windows-x64-(Setup|Portable)\.exe)$/);
    const releaseMatch = path.match(/^\/releases\/(\d+\.\d+\.\d+)\/([a-zA-Z0-9._-]+)$/);
    const checksumMatch = path.match(/^\/downloads\/(SHA256SUMS-(\d+\.\d+\.\d+)\.txt)$/);

    if (downloadMatch || releaseMatch || checksumMatch) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405, headers:{allow:'GET, HEAD'}});
      let r2Key;
      let filename;
      let isText = false;

      if (downloadMatch) {
        filename = downloadMatch[1];
        const version = downloadMatch[2];
        r2Key = `releases/${version}/${filename}`;
      } else if (releaseMatch) {
        const version = releaseMatch[1];
        filename = releaseMatch[2];
        r2Key = `releases/${version}/${filename}`;
        if (filename.endsWith('.txt') || filename.endsWith('.sha256')) isText = true;
      } else if (checksumMatch) {
        filename = checksumMatch[1];
        const version = checksumMatch[2];
        r2Key = `releases/${version}/${filename}`;
        isText = true;
      }

      let object;
      try { object = await env.KOTOBA_R2.get(r2Key); }
      catch { return new Response('Storage unavailable', {status:503, headers:{'cache-control':'no-store'}}); }
      if (!object) return new Response('Not found', {status:404, headers:{'cache-control':'no-store'}});

      const headers = new Headers({
        'content-type': isText ? 'text/plain; charset=utf-8' : 'application/octet-stream',
        'content-disposition': isText ? 'inline' : `attachment; filename="${filename}"`,
        'content-length': String(object.size),
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff',
        'etag': object.httpEtag
      });
      return new Response(request.method === 'HEAD' ? null : object.body, {headers});
    }

    // KotoBud Cloudflare Worker + D1 Cloud Sync API
    if (path === '/api/v1' || path === '/api/v1/capabilities') {
      const response = json({
        version: 'v1',
        enabled: true,
        capabilities: ['auth', 'd1_sync', 'offline_replay'],
        storage: 'cloudflare_d1',
        auth: 'cloudbase_auth_v2'
      }, 200);
      return request.method === 'HEAD' ? emptyHead(response) : response;
    }

    if (path === '/api/v1/session' || path === '/api/v1/auth/session') {
      if (!['GET', 'POST', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405});
      const authIdentity = await verifyAuthToken(request, env);
      if (!authIdentity) {
        const response = json({authenticated: false, user: null, mode: 'anonymous'}, 200);
        return request.method === 'HEAD' ? emptyHead(response) : response;
      }
      if (!env.DB) return json({error: 'db_unavailable', message: 'Database DB is not bound'}, 503);
      try {
        const user = await getOrCreateUser(env.DB, authIdentity);
        const response = json({
          authenticated: true,
          user: {
            id: user.id,
            email: user.email || authIdentity.email,
            provider: authIdentity.provider
          }
        }, 200);
        return request.method === 'HEAD' ? emptyHead(response) : response;
      } catch (err) {
        return json({error: 'server_error', message: String(err)}, 500);
      }
    }

    if (path === '/api/v1/auth/send-code') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      try {
        const body = await request.json();
        const email = body.email ? String(body.email).trim() : '';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json({ error: 'invalid_email', message: '请输入有效的邮箱地址' }, 400);
        }
        const result = await sendCloudBaseOtp(env, email);
        if (!result.success) {
          return json({ error: 'send_failed', message: result.error }, 400);
        }
        return json({ success: true, verificationId: result.verificationId, expiresIn: result.expiresIn }, 200);
      } catch (err) {
        return json({ error: 'server_error', message: String(err) }, 500);
      }
    }

    if (path === '/api/v1/auth/verify-code') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      if (!env.DB) return json({ error: 'db_unavailable', message: 'Database DB is not bound' }, 503);
      try {
        const body = await request.json();
        const email = body.email ? String(body.email).trim() : '';
        const code = body.code ? String(body.code).trim() : '';
        const verificationId = body.verificationId ? String(body.verificationId) : '';
        if (!email || !code || !verificationId) {
          return json({ error: 'missing_fields', message: '缺少邮箱或验证码参数' }, 400);
        }
        const result = await verifyCloudBaseOtp(env, email, code, verificationId);
        if (!result.success) {
          return json({ error: 'verify_failed', message: result.error }, 400);
        }
        const authIdentity = {
          provider: 'cloudbase',
          providerUid: String(result.cloudbaseUser.id || result.cloudbaseUser.uid),
          email
        };
        const internalUser = await getOrCreateUser(env.DB, authIdentity);
        return json({
          success: true,
          token: result.token,
          refreshToken: result.refreshToken,
          user: {
            id: internalUser.id,
            email: internalUser.email,
            provider: 'cloudbase'
          }
        }, 200);
      } catch (err) {
        return json({ error: 'server_error', message: String(err) }, 500);
      }
    }

    if (path === '/api/v1/auth/check-account') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      if (!env.DB) return json({ error: 'db_unavailable', message: 'Database DB is not bound' }, 503);
      try {
        const body = await request.json();
        const email = body.email ? String(body.email).trim().toLowerCase() : '';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json({ error: 'invalid_email', message: '请输入有效的邮箱地址' }, 400);
        }
        const user = await env.DB.prepare(
          'SELECT id, email, password_hash FROM users WHERE email_normalized = ? OR LOWER(TRIM(email)) = ?'
        ).bind(email, email).first();

        if (!user) {
          return json({ exists: false, hasPassword: false, flow: 'register' }, 200);
        }
        const hasPassword = Boolean(user.password_hash && user.password_hash.trim().length > 0);
        return json({
          exists: true,
          hasPassword,
          flow: hasPassword ? 'password' : 'legacy_upgrade'
        }, 200);
      } catch (err) {
        return json({ error: 'server_error', message: String(err) }, 500);
      }
    }

    if (path === '/api/v1/auth/login-password') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      if (!env.DB) return json({ error: 'db_unavailable', message: 'Database DB is not bound' }, 503);
      try {
        const body = await request.json();
        const email = body.email ? String(body.email).trim().toLowerCase() : '';
        const password = body.password ? String(body.password) : '';
        if (!email || !password) {
          return json({ error: 'missing_fields', message: '请输入邮箱和密码' }, 400);
        }
        const user = await env.DB.prepare(
          'SELECT id, email, password_hash, auth_provider FROM users WHERE email_normalized = ? OR LOWER(TRIM(email)) = ?'
        ).bind(email, email).first();

        if (!user) {
          return json({ error: 'invalid_credentials', message: '邮箱或密码错误' }, 401);
        }
        if (!user.password_hash) {
          return json({
            error: 'no_password_set',
            message: '该账号为旧版免密账号，尚未设置密码。请通过邮箱验证码升级并设置密码。',
            flow: 'legacy_upgrade'
          }, 400);
        }

        const isMatch = await verifyPassword(password, user.password_hash);
        if (!isMatch) {
          return json({ error: 'invalid_credentials', message: '邮箱或密码错误' }, 401);
        }

        const now = new Date().toISOString();
        await env.DB.prepare('UPDATE users SET updated_at = ? WHERE id = ?').bind(now, user.id).run();

        const session = await createSession(env.DB, env, user, request);

        const headers = new Headers({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': session.cookieHeader
        });

        return new Response(JSON.stringify({
          success: true,
          token: session.accessToken,
          refreshToken: session.refreshToken,
          user: {
            id: user.id,
            email: user.email || email,
            provider: user.auth_provider || 'kotobud'
          }
        }), { status: 200, headers });
      } catch (err) {
        return json({ error: 'server_error', message: String(err) }, 500);
      }
    }

    if (path === '/api/v1/auth/register') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      if (!env.DB) return json({ error: 'db_unavailable', message: 'Database DB is not bound' }, 503);
      try {
        const body = await request.json();
        const email = body.email ? String(body.email).trim().toLowerCase() : '';
        const password = body.password ? String(body.password) : '';
        const code = body.code ? String(body.code).trim() : '';
        const verificationId = body.verificationId ? String(body.verificationId) : '';

        if (!email || !password || !code || !verificationId) {
          return json({ error: 'missing_fields', message: '请完整填写邮箱、验证码和密码' }, 400);
        }
        if (password.length < 8) {
          return json({ error: 'weak_password', message: '密码长度至少为 8 位' }, 400);
        }

        const otpRes = await verifyCloudBaseOtp(env, email, code, verificationId);
        if (!otpRes.success) {
          return json({ error: 'verify_failed', message: otpRes.error }, 400);
        }

        let existing = await env.DB.prepare(
          'SELECT id, email, password_hash, auth_provider FROM users WHERE email_normalized = ? OR LOWER(TRIM(email)) = ?'
        ).bind(email, email).first();

        const pwdHash = await hashPassword(password);
        const now = new Date().toISOString();
        let finalUser;

        if (existing) {
          if (existing.password_hash) {
            return json({ error: 'user_exists', message: '该邮箱已注册并设置密码，请直接登录' }, 400);
          }
          await env.DB.prepare(
            'UPDATE users SET password_hash = ?, password_set_at = ?, email_normalized = ?, updated_at = ? WHERE id = ?'
          ).bind(pwdHash, now, email, now, existing.id).run();
          finalUser = { id: existing.id, email: existing.email || email, auth_provider: existing.auth_provider };
        } else {
          const newId = 'kb_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
          const providerUid = String(otpRes.cloudbaseUser?.id || otpRes.cloudbaseUser?.uid || newId);
          await env.DB.prepare(
            'INSERT INTO users (id, auth_provider, provider_uid, email, email_normalized, password_hash, password_set_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(newId, 'cloudbase', providerUid, email, email, pwdHash, now, now, now).run();
          finalUser = { id: newId, email, auth_provider: 'cloudbase' };
        }

        const session = await createSession(env.DB, env, finalUser, request);
        const headers = new Headers({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': session.cookieHeader
        });
        return new Response(JSON.stringify({
          success: true,
          token: session.accessToken,
          refreshToken: session.refreshToken,
          user: {
            id: finalUser.id,
            email: finalUser.email,
            provider: finalUser.auth_provider || 'kotobud'
          }
        }), { status: 200, headers });
      } catch (err) {
        return json({ error: 'server_error', message: String(err) }, 500);
      }
    }

    if (path === '/api/v1/auth/upgrade-legacy') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      if (!env.DB) return json({ error: 'db_unavailable', message: 'Database DB is not bound' }, 503);
      try {
        const body = await request.json();
        const email = body.email ? String(body.email).trim().toLowerCase() : '';
        const password = body.password ? String(body.password) : '';
        const code = body.code ? String(body.code).trim() : '';
        const verificationId = body.verificationId ? String(body.verificationId) : '';

        if (!email || !password || !code || !verificationId) {
          return json({ error: 'missing_fields', message: '请完整填写邮箱、验证码和密码' }, 400);
        }
        if (password.length < 8) {
          return json({ error: 'weak_password', message: '密码长度至少为 8 位' }, 400);
        }

        const otpRes = await verifyCloudBaseOtp(env, email, code, verificationId);
        if (!otpRes.success) {
          return json({ error: 'verify_failed', message: otpRes.error }, 400);
        }

        const existing = await env.DB.prepare(
          'SELECT id, email, password_hash, auth_provider FROM users WHERE email_normalized = ? OR LOWER(TRIM(email)) = ?'
        ).bind(email, email).first();

        const pwdHash = await hashPassword(password);
        const now = new Date().toISOString();
        let finalUser;

        if (existing) {
          await env.DB.prepare(
            'UPDATE users SET password_hash = ?, password_set_at = ?, email_normalized = ?, updated_at = ? WHERE id = ?'
          ).bind(pwdHash, now, email, now, existing.id).run();
          finalUser = { id: existing.id, email: existing.email || email, auth_provider: existing.auth_provider };
        } else {
          const newId = 'kb_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
          const providerUid = String(otpRes.cloudbaseUser?.id || otpRes.cloudbaseUser?.uid || newId);
          await env.DB.prepare(
            'INSERT INTO users (id, auth_provider, provider_uid, email, email_normalized, password_hash, password_set_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(newId, 'cloudbase', providerUid, email, email, pwdHash, now, now, now).run();
          finalUser = { id: newId, email, auth_provider: 'cloudbase' };
        }

        const session = await createSession(env.DB, env, finalUser, request);
        const headers = new Headers({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': session.cookieHeader
        });
        return new Response(JSON.stringify({
          success: true,
          token: session.accessToken,
          refreshToken: session.refreshToken,
          user: {
            id: finalUser.id,
            email: finalUser.email,
            provider: finalUser.auth_provider || 'kotobud'
          }
        }), { status: 200, headers });
      } catch (err) {
        return json({ error: 'server_error', message: String(err) }, 500);
      }
    }

    if (path === '/api/v1/auth/reset-password') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      if (!env.DB) return json({ error: 'db_unavailable', message: 'Database DB is not bound' }, 503);
      try {
        const body = await request.json();
        const email = body.email ? String(body.email).trim().toLowerCase() : '';
        const newPassword = body.newPassword ? String(body.newPassword) : '';
        const code = body.code ? String(body.code).trim() : '';
        const verificationId = body.verificationId ? String(body.verificationId) : '';

        if (!email || !newPassword || !code || !verificationId) {
          return json({ error: 'missing_fields', message: '请完整填写邮箱、验证码和新密码' }, 400);
        }
        if (newPassword.length < 8) {
          return json({ error: 'weak_password', message: '新密码长度至少为 8 位' }, 400);
        }

        const otpRes = await verifyCloudBaseOtp(env, email, code, verificationId);
        if (!otpRes.success) {
          return json({ error: 'verify_failed', message: otpRes.error }, 400);
        }

        const existing = await env.DB.prepare(
          'SELECT id, email, auth_provider FROM users WHERE email_normalized = ? OR LOWER(TRIM(email)) = ?'
        ).bind(email, email).first();

        if (!existing) {
          return json({ error: 'user_not_found', message: '未找到该邮箱对应的账号' }, 404);
        }

        const pwdHash = await hashPassword(newPassword);
        const now = new Date().toISOString();

        // 1. Update password
        await env.DB.prepare(
          'UPDATE users SET password_hash = ?, password_set_at = ?, email_normalized = ?, updated_at = ? WHERE id = ?'
        ).bind(pwdHash, now, email, now, existing.id).run();

        // 2. REVOKE ALL EXISTING SESSIONS for this user
        await env.DB.prepare(
          'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL'
        ).bind(now, existing.id).run();

        // 3. Create fresh new session
        const session = await createSession(env.DB, env, existing, request);
        const headers = new Headers({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': session.cookieHeader
        });
        return new Response(JSON.stringify({
          success: true,
          token: session.accessToken,
          refreshToken: session.refreshToken,
          user: {
            id: existing.id,
            email: existing.email || email,
            provider: existing.auth_provider || 'kotobud'
          }
        }), { status: 200, headers });
      } catch (err) {
        return json({ error: 'server_error', message: String(err) }, 500);
      }
    }

    if (path === '/api/v1/auth/refresh') {
      if (!['POST', 'GET'].includes(request.method)) return new Response('Method not allowed', {status: 405});
      if (!env.DB) return json({ error: 'db_unavailable', message: 'Database DB is not bound' }, 503);
      try {
        let bodyToken = null;
        if (request.method === 'POST') {
          try {
            const body = await request.json();
            bodyToken = body.refreshToken;
          } catch {}
        }
        const refreshToken = getRefreshTokenFromRequest(request, bodyToken);
        if (!refreshToken) {
          return json({ authenticated: false, error: 'missing_refresh_token', message: '未找到刷新令牌' }, 401);
        }

        const refreshHash = await hashRefreshToken(refreshToken);
        const now = new Date().toISOString();

        const session = await env.DB.prepare(
          'SELECT s.id, s.user_id, s.expires_at, s.revoked_at, u.email, u.auth_provider FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.refresh_token_hash = ?'
        ).bind(refreshHash).first();

        if (!session || session.revoked_at || session.expires_at < now) {
          const clearHeaders = new Headers({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'set-cookie': buildClearRefreshCookie(request)
          });
          return new Response(JSON.stringify({
            authenticated: false,
            error: 'session_expired_or_revoked',
            message: '会话已过期或已被撤销，请重新登录'
          }), { status: 401, headers: clearHeaders });
        }

        // Token Rotation: Generate new refresh token and update session hash
        const newRefreshToken = 'rt_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const newRefreshHash = await hashRefreshToken(newRefreshToken);
        const newExpiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

        await env.DB.prepare(
          'UPDATE sessions SET refresh_token_hash = ?, expires_at = ? WHERE id = ?'
        ).bind(newRefreshHash, newExpiresAt, session.id).run();

        const secret = getJwtSecret(env);
        const newAccessToken = await signJwt({
          sub: session.user_id,
          email: session.email,
          sid: session.id,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 15 * 60
        }, secret);

        const cookieHeader = buildRefreshCookie(newRefreshToken, request);
        const headers = new Headers({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': cookieHeader
        });

        return new Response(JSON.stringify({
          success: true,
          token: newAccessToken,
          refreshToken: newRefreshToken,
          user: {
            id: session.user_id,
            email: session.email,
            provider: session.auth_provider || 'kotobud'
          }
        }), { status: 200, headers });
      } catch (err) {
        return json({ error: 'server_error', message: String(err) }, 500);
      }
    }

    if (path === '/api/v1/auth/logout') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      try {
        let bodyToken = null;
        try {
          const body = await request.json();
          bodyToken = body.refreshToken;
        } catch {}
        const refreshToken = getRefreshTokenFromRequest(request, bodyToken);
        const now = new Date().toISOString();

        if (refreshToken && env.DB) {
          const refreshHash = await hashRefreshToken(refreshToken);
          await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE refresh_token_hash = ?').bind(now, refreshHash).run();
        }

        const headers = new Headers({
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': buildClearRefreshCookie(request)
        });
        return new Response(JSON.stringify({ success: true, message: '已安全退出登录' }), { status: 200, headers });
      } catch (err) {
        return json({ error: 'server_error', message: String(err) }, 500);
      }
    }

    if (path === '/api/v1/sync/status') {
      return json({
        status: 'ok',
        d1_bound: !!env.DB,
        serverTime: new Date().toISOString()
      }, 200);
    }

    if (path === '/api/v1/sync/bootstrap') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      const authIdentity = await verifyAuthToken(request, env);
      if (!authIdentity) return json({error: 'unauthorized', message: 'Missing or invalid token'}, 401);
      if (!env.DB) return json({error: 'db_unavailable', message: 'Database DB is not bound'}, 503);
      try {
        const user = await getOrCreateUser(env.DB, authIdentity);
        const pCountRes = await env.DB.prepare('SELECT count(*) as count FROM user_progress WHERE user_id = ?').bind(user.id).first();
        const eCountRes = await env.DB.prepare('SELECT count(*) as count FROM review_events WHERE user_id = ?').bind(user.id).first();
        const progressCount = Number(pCountRes?.count ?? 0);
        const eventCount = Number(eCountRes?.count ?? 0);
        return json({
          userId: user.id,
          hasCloudData: progressCount > 0 || eventCount > 0,
          progressCount,
          eventCount
        }, 200);
      } catch (err) {
        return json({error: 'server_error', message: String(err)}, 500);
      }
    }

    if (path === '/api/v1/sync/pull') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      const authIdentity = await verifyAuthToken(request, env);
      if (!authIdentity) return json({error: 'unauthorized', message: 'Missing or invalid token'}, 401);
      if (!env.DB) return json({error: 'db_unavailable', message: 'Database DB is not bound'}, 503);
      try {
        const user = await getOrCreateUser(env.DB, authIdentity);
        let body = {};
        try { body = await request.json(); } catch {}
        const since = body.since ? String(body.since) : null;

        let progressQuery = 'SELECT * FROM user_progress WHERE user_id = ?';
        const progressParams = [user.id];
        if (since) {
          progressQuery += ' AND updated_at > ?';
          progressParams.push(since);
        }
        const progressRows = (await env.DB.prepare(progressQuery).bind(...progressParams).all()).results || [];

        let eventsQuery = 'SELECT * FROM review_events WHERE user_id = ?';
        const eventParams = [user.id];
        if (since) {
          eventsQuery += ' AND reviewed_at > ?';
          eventParams.push(since);
        }
        eventsQuery += ' ORDER BY reviewed_at ASC';
        const eventRows = (await env.DB.prepare(eventsQuery).bind(...eventParams).all()).results || [];

        const settingsRow = await env.DB.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first();

        // Deserialize SQLite rows to client model format
        const progress = progressRows.map(row => ({
          userId: row.user_id,
          wordId: row.word_id,
          bookId: row.book_id || undefined,
          lessonId: row.lesson_id || undefined,
          status: row.status,
          firstSeenAt: row.first_seen_at || undefined,
          lastReviewedAt: row.last_reviewed_at || undefined,
          nextReviewAt: row.next_review_at || undefined,
          reviewCount: Number(row.review_count || 0),
          lapseCount: Number(row.lapse_count || 0),
          card: JSON.parse(row.fsrs_card),
          isDifficult: Boolean(row.is_difficult),
          difficultUpdatedAt: row.difficult_updated_at || undefined,
          isIgnored: Boolean(row.is_ignored),
          ignoredUpdatedAt: row.ignored_updated_at || undefined,
          updatedAt: row.updated_at,
          version: Number(row.version || 1)
        }));

        const events = eventRows.map(row => ({
          _id: row.event_id,
          userId: row.user_id,
          wordId: row.word_id,
          reviewedAt: row.reviewed_at,
          rating: Number(row.rating),
          responseTime: Number(row.response_time || 0),
          studyMode: row.study_mode,
          deviceId: row.device_id || undefined,
          quiz: row.quiz ? JSON.parse(row.quiz) : undefined,
          clientCreatedAt: row.client_created_at,
          serverReceivedAt: row.server_received_at
        }));

        const settings = settingsRow ? {
          userId: settingsRow.user_id,
          currentBookId: settingsRow.current_book_id || undefined,
          lastStudiedPosition: settingsRow.last_studied_word_id ? {
            bookId: settingsRow.last_studied_book_id || '',
            lessonId: settingsRow.last_studied_lesson_id || '',
            wordId: settingsRow.last_studied_word_id || '',
            updatedAt: settingsRow.last_studied_updated_at || ''
          } : undefined,
          preferences: {
            pronunciationVoice: settingsRow.pronunciation_voice || undefined
          },
          updatedAt: settingsRow.updated_at
        } : undefined;

        return json({
          userId: user.id,
          progress,
          events,
          settings,
          serverTime: new Date().toISOString()
        }, 200);
      } catch (err) {
        return json({error: 'server_error', message: String(err)}, 500);
      }
    }

    if (path === '/api/v1/sync/push') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
      const authIdentity = await verifyAuthToken(request, env);
      if (!authIdentity) return json({error: 'unauthorized', message: 'Missing or invalid token'}, 401);
      if (!env.DB) return json({error: 'db_unavailable', message: 'Database DB is not bound'}, 503);
      try {
        const user = await getOrCreateUser(env.DB, authIdentity);
        const body = await request.json();
        const incomingEvents = Array.isArray(body.events) ? body.events : [];
        const incomingProgress = Array.isArray(body.progress) ? body.progress : [];
        const incomingSettings = body.settings;
        const now = new Date().toISOString();

        // 1. Insert review_events (append-only, idempotent by event_id)
        for (const ev of incomingEvents) {
          if (!ev._id && !ev.id) continue;
          const eventId = String(ev._id || ev.id);
          await env.DB.prepare(`
            INSERT INTO review_events (event_id, user_id, word_id, reviewed_at, rating, response_time, study_mode, device_id, quiz, client_created_at, server_received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (event_id) DO NOTHING
          `).bind(
            eventId,
            user.id, // Strictly server-derived user_id!
            String(ev.wordId),
            String(ev.reviewedAt),
            Number(ev.rating),
            Number(ev.responseTime || 0),
            String(ev.studyMode || 'new'),
            ev.deviceId ? String(ev.deviceId) : null,
            ev.quiz ? JSON.stringify(ev.quiz) : null,
            String(ev.clientCreatedAt || ev.reviewedAt || now),
            now
          ).run();
        }

        // 2. Upsert user_progress with Field-level LWW
        for (const p of incomingProgress) {
          if (!p.wordId) continue;
          const wordId = String(p.wordId);
          const existing = await env.DB.prepare('SELECT * FROM user_progress WHERE user_id = ? AND word_id = ?').bind(user.id, wordId).first();

          if (existing) {
            const incomingDiff = p.isDifficult !== undefined ? p.isDifficult : p.difficult;
            const incomingIgnored = p.isIgnored !== undefined ? p.isIgnored : p.ignored;
            let isDifficult = incomingDiff !== undefined ? (incomingDiff ? 1 : 0) : existing.is_difficult;
            let difficultUpdatedAt = p.difficultUpdatedAt || (incomingDiff !== undefined ? (p.updatedAt || now) : existing.difficult_updated_at) || null;
            let isIgnored = incomingIgnored !== undefined ? (incomingIgnored ? 1 : 0) : existing.is_ignored;
            let ignoredUpdatedAt = p.ignoredUpdatedAt || (incomingIgnored !== undefined ? (p.updatedAt || now) : existing.ignored_updated_at) || null;

            // LWW on isDifficult
            if (incomingDiff !== undefined) {
              if (existing.difficult_updated_at && difficultUpdatedAt) {
                if (new Date(existing.difficult_updated_at) > new Date(difficultUpdatedAt)) {
                  isDifficult = existing.is_difficult;
                  difficultUpdatedAt = existing.difficult_updated_at;
                }
              }
            }

            // LWW on isIgnored
            if (incomingIgnored !== undefined) {
              if (existing.ignored_updated_at && ignoredUpdatedAt) {
                if (new Date(existing.ignored_updated_at) > new Date(ignoredUpdatedAt)) {
                  isIgnored = existing.is_ignored;
                  ignoredUpdatedAt = existing.ignored_updated_at;
                }
              }
            }

            const cardStr = p.card ? (typeof p.card === 'string' ? p.card : JSON.stringify(p.card)) : (existing.fsrs_card || '{}');

            await env.DB.prepare(`
              UPDATE user_progress SET
                book_id = ?, lesson_id = ?, status = ?, first_seen_at = ?, last_reviewed_at = ?, next_review_at = ?,
                review_count = ?, lapse_count = ?, fsrs_card = ?, is_difficult = ?, difficult_updated_at = ?,
                is_ignored = ?, ignored_updated_at = ?, updated_at = ?, version = version + 1
              WHERE user_id = ? AND word_id = ?
            `).bind(
              p.bookId || existing.book_id || null,
              p.lessonId || existing.lesson_id || null,
              String(p.status || existing.status || 'new'),
              p.firstSeenAt || existing.first_seen_at || null,
              p.lastReviewedAt || existing.last_reviewed_at || null,
              p.nextReviewAt || existing.next_review_at || null,
              Number(p.reviewCount ?? existing.review_count ?? 0),
              Number(p.lapseCount ?? existing.lapse_count ?? 0),
              cardStr,
              isDifficult,
              difficultUpdatedAt,
              isIgnored,
              ignoredUpdatedAt,
              now,
              user.id,
              wordId
            ).run();
          } else {
            const incomingDiff = p.isDifficult !== undefined ? p.isDifficult : p.difficult;
            const incomingIgnored = p.isIgnored !== undefined ? p.isIgnored : p.ignored;
            const isDifficult = incomingDiff ? 1 : 0;
            const difficultUpdatedAt = p.difficultUpdatedAt || (incomingDiff !== undefined ? (p.updatedAt || now) : null);
            const isIgnored = incomingIgnored ? 1 : 0;
            const ignoredUpdatedAt = p.ignoredUpdatedAt || (incomingIgnored !== undefined ? (p.updatedAt || now) : null);
            const cardStr = p.card ? (typeof p.card === 'string' ? p.card : JSON.stringify(p.card)) : '{}';

            await env.DB.prepare(`
              INSERT INTO user_progress (
                user_id, word_id, book_id, lesson_id, status, first_seen_at, last_reviewed_at, next_review_at,
                review_count, lapse_count, fsrs_card, is_difficult, difficult_updated_at, is_ignored, ignored_updated_at,
                updated_at, version
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `).bind(
              user.id,
              wordId,
              p.bookId || null,
              p.lessonId || null,
              String(p.status || 'new'),
              p.firstSeenAt || null,
              p.lastReviewedAt || null,
              p.nextReviewAt || null,
              Number(p.reviewCount || 0),
              Number(p.lapseCount || 0),
              cardStr,
              isDifficult,
              difficultUpdatedAt,
              isIgnored,
              ignoredUpdatedAt,
              now
            ).run();
          }
        }

        // 3. Upsert user_settings
        if (incomingSettings) {
          const s = incomingSettings;
          const pos = s.lastStudiedPosition;
          const voice = s.preferences?.pronunciationVoice || s.pronunciationVoice || null;
          await env.DB.prepare(`
            INSERT INTO user_settings (user_id, current_book_id, last_studied_book_id, last_studied_lesson_id, last_studied_word_id, last_studied_updated_at, pronunciation_voice, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id) DO UPDATE SET
              current_book_id = COALESCE(excluded.current_book_id, user_settings.current_book_id),
              last_studied_book_id = COALESCE(excluded.last_studied_book_id, user_settings.last_studied_book_id),
              last_studied_lesson_id = COALESCE(excluded.last_studied_lesson_id, user_settings.last_studied_lesson_id),
              last_studied_word_id = COALESCE(excluded.last_studied_word_id, user_settings.last_studied_word_id),
              last_studied_updated_at = COALESCE(excluded.last_studied_updated_at, user_settings.last_studied_updated_at),
              pronunciation_voice = COALESCE(excluded.pronunciation_voice, user_settings.pronunciation_voice),
              updated_at = excluded.updated_at
          `).bind(
            user.id,
            s.currentBookId || null,
            pos?.bookId || null,
            pos?.lessonId || null,
            pos?.wordId || null,
            pos?.updatedAt || null,
            voice,
            now
          ).run();
        }

        return json({
          success: true,
          acceptedEvents: incomingEvents.length,
          updatedProgress: incomingProgress.length,
          serverTime: now
        }, 200);
      } catch (err) {
        return json({error: 'server_error', message: String(err)}, 500);
      }
    }

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
      headers.set('cache-control', 'public, max-age=600, must-revalidate');
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    return response;
  }
};
