import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-ignore Worker entry is plain JavaScript and has no app-side declaration.
import worker from '../scripts/cloudflare-worker.js';
import { redeemWechatAttempt } from '../apps/web/src/services/wechatAuth';

class MockD1 {
  users = new Map<string, any>();
  identities = new Map<string, string>();
  sessions = new Map<string, any>();
  attempts = new Map<string, any>();
  failNextWebIdentityInsert = false;

  prepare(sql: string) {
    const db = this;
    let args: any[] = [];
    return {
      bind(...values: any[]) { args = values; return this; },
      async first() {
        if (sql.includes('FROM auth_identities')) {
          const user_id = db.identities.get(`${args[0]}:${args[1]}`);
          return user_id ? { user_id } : null;
        }
        if (sql.includes('FROM users WHERE id = ?')) return db.users.get(args[0]) || null;
        if (sql.includes('FROM sessions WHERE id = ?')) {
          const session = db.sessions.get(args[0]);
          return session && !session.revoked_at && session.expires_at > args[1] ? { user_id: session.user_id } : null;
        }
        if (sql.includes('FROM wechat_auth_attempts')) {
          const attempt = db.attempts.get(args[0]);
          if (sql.includes('verifier_hash = ?') && attempt?.verifier_hash !== args[1]) return null;
          return attempt ? { ...attempt } : null;
        }
        throw new Error(`Unexpected first: ${sql}`);
      },
      async run() {
        if (sql.startsWith('INSERT INTO users')) {
          const [id, auth_provider, provider_uid, email, email_normalized, created_at, updated_at] = args;
          db.users.set(id, { id, auth_provider, provider_uid, email, email_normalized, created_at, updated_at });
        } else if (sql.startsWith('INSERT INTO auth_identities')) {
          const [provider, uid, userId] = args;
          if (provider === 'wechat_web' && db.failNextWebIdentityInsert) {
            db.failNextWebIdentityInsert = false;
            throw new Error('transient database failure');
          }
          const key = `${provider}:${uid}`;
          if (db.identities.has(key)) throw new Error('unique constraint');
          db.identities.set(key, userId);
        } else if (sql.startsWith('INSERT INTO sessions')) {
          const [id, user_id, refresh_token_hash, user_agent, ip, expires_at] = args;
          db.sessions.set(id, { id, user_id, refresh_token_hash, user_agent, ip, expires_at });
        } else if (sql.startsWith('INSERT INTO wechat_auth_attempts')) {
          const [id, verifier_hash, purpose, target_user_id, expires_at, created_at] = args;
          db.attempts.set(id, { id, verifier_hash, purpose, target_user_id, expires_at, created_at, user_id: null,
            wechat_provider: null, wechat_openid: null, wechat_unionid: null, consumed_at: null, error_code: null });
        } else if (sql.includes("SET error_code = 'processing'")) {
          const attempt = db.attempts.get(args[0]);
          if (attempt.error_code || attempt.user_id || attempt.wechat_openid || attempt.consumed_at) return { meta: { changes: 0 } };
          attempt.error_code = 'processing';
        } else if (sql.includes('SET wechat_provider = ?')) {
          const attempt = db.attempts.get(args[3]);
          if (attempt.error_code !== 'processing' || attempt.wechat_openid || attempt.consumed_at) return { meta: { changes: 0 } };
          attempt.wechat_provider = args[0];
          attempt.wechat_openid = args[1];
          attempt.wechat_unionid = args[2];
          attempt.error_code = null;
        } else if (sql.includes('SET user_id = ?, error_code = NULL')) {
          const attempt = db.attempts.get(args[1]);
          if (attempt.error_code !== 'processing' || attempt.user_id || attempt.consumed_at) return { meta: { changes: 0 } };
          attempt.user_id = args[0];
          attempt.error_code = null;
        } else if (sql.includes("SET error_code = 'redeeming'")) {
          const attempt = db.attempts.get(args[0]);
          if (attempt.verifier_hash !== args[1] || attempt.purpose !== 'link' || attempt.target_user_id !== args[2] ||
              attempt.error_code || attempt.consumed_at || attempt.expires_at <= args[3] ||
              attempt.wechat_provider !== 'wechat_web' || !attempt.wechat_openid) return { meta: { changes: 0 } };
          attempt.error_code = 'redeeming';
        } else if (sql.includes('SET error_code = ?')) {
          const attempt = db.attempts.get(args[1]);
          if (attempt.error_code !== (sql.includes("'redeeming'") ? 'redeeming' : 'processing') || attempt.consumed_at)
            return { meta: { changes: 0 } };
          attempt.error_code = args[0];
        } else if (sql.includes('SET consumed_at = ?, error_code = NULL')) {
          const attempt = db.attempts.get(args[1]);
          if (attempt.error_code !== 'redeeming' || attempt.consumed_at) return { meta: { changes: 0 } };
          attempt.consumed_at = args[0];
          attempt.error_code = null;
          attempt.wechat_provider = null;
          attempt.wechat_openid = null;
          attempt.wechat_unionid = null;
        } else if (sql.includes('SET consumed_at = ?')) {
          const attempt = db.attempts.get(args[1]);
          if (attempt.consumed_at) return { meta: { changes: 0 } };
          attempt.consumed_at = args[0];
        } else throw new Error(`Unexpected run: ${sql}`);
        return { meta: { changes: 1 } };
      }
    };
  }

  async batch(statements: Array<{ run(): Promise<any> }>) {
    for (const statement of statements) await statement.run();
  }
}

const env = (db: MockD1) => ({
  DB: db, JWT_SECRET: 'test-only-strong-random-jwt-secret',
  WECHAT_MINIPROGRAM_APP_ID: 'wx-test-mini', WECHAT_MINIPROGRAM_APP_SECRET: 'server-only-mini-secret',
  WECHAT_WEB_APP_ID: 'wx-test-web', WECHAT_WEB_APP_SECRET: 'server-only-web-secret',
  WECHAT_WEB_REDIRECT_URI: 'https://kotobud.com/api/v1/auth/wechat/callback'
});

function post(path: string, body: unknown, token?: string) {
  return new Request(`https://kotobud.com${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('archived WeChat development plan', () => {
  it('keeps every WeChat auth route closed even if credentials are present', async () => {
    const db = new MockD1();
    const outgoing = vi.fn();
    vi.stubGlobal('fetch', outgoing);
    const requests = [
      post('/api/v1/auth/wechat/mini-login', { code: 'minicode123' }),
      post('/api/v1/auth/wechat/mini-link', { code: 'minicode123' }),
      post('/api/v1/auth/wechat/attempt', { purpose: 'login' }),
      new Request('https://kotobud.com/api/v1/auth/wechat/callback?state=unused&code=webcode123'),
      post('/api/v1/auth/wechat/redeem', { attemptId: 'unused', verifier: 'unused' }),
    ];
    for (const request of requests) {
      const response = await worker.fetch(request, env(db));
      expect(response.status).toBe(404);
      expect((await response.json() as any).error).toBe('feature_archived');
    }
    expect(outgoing).not.toHaveBeenCalled();
  });

  it('continues to reject mock tokens and unsigned CloudBase claims', async () => {
    const db = new MockD1();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub: 'victim', exp: Math.floor(Date.now() / 1000) + 3600 }))}.fake`;
    for (const token of ['mock_victim:victim@example.com', fakeJwt]) {
      const response = await worker.fetch(new Request('https://kotobud.com/api/v1/session', {
        headers: { authorization: `Bearer ${token}` }
      }), env(db));
      expect((await response.json() as any).authenticated).toBe(false);
    }
  });
});

// Preserve the implementation's regression scenarios for a future approved revival.
describe.skip('WeChat identity and one-time login exchange', () => {
  it('sends the current Bearer token when the website client redeems a link attempt', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ status: 'pending' }, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const attempt = { attemptId: 'wa_' + 'a'.repeat(32), verifier: 'b'.repeat(64), authorizeUrl: '', expiresAt: '' };
    expect(await redeemWechatAttempt(attempt, 'current-session-token')).toEqual({ pending: true });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe('Bearer current-session-token');
  });

  it('exchanges mini-program codes only on the server and reuses the same account', async () => {
    const db = new MockD1();
    const wechatFetch = vi.fn(async (input: URL) => {
      expect(input.searchParams.get('secret')).toBe('server-only-mini-secret');
      return Response.json({ openid: 'openid-mini', unionid: 'same-person', session_key: 'never-return-this' });
    });
    vi.stubGlobal('fetch', wechatFetch);
    const first = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'validcode123' }), env(db));
    expect(first.status).toBe(200);
    const firstBody = await first.json() as any;
    expect(firstBody.user.id).toMatch(/^kb_/);
    expect(JSON.stringify(firstBody)).not.toContain('session_key');
    const second = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'anothercode123' }), env(db));
    expect((await second.json() as any).user.id).toBe(firstBody.user.id);
    expect(db.users.size).toBe(1);
  });

  it('binds only with a live managed session and rejects a WeChat identity owned by another account', async () => {
    const db = new MockD1();
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => Response.json({
      openid: input.searchParams.get('js_code') === 'secondcode123' ? 'openid-other' : 'openid-first'
    })));
    const first = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'firstcode123' }), env(db));
    const firstBody = await first.json() as any;
    const other = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'secondcode123' }), env(db));
    expect(other.status).toBe(200);
    expect((await worker.fetch(post('/api/v1/auth/wechat/mini-link', { code: 'secondcode123' }), env(db))).status).toBe(401);
    const conflict = await worker.fetch(post('/api/v1/auth/wechat/mini-link', { code: 'secondcode123' }, firstBody.token), env(db));
    expect(conflict.status).toBe(409);
    expect((await conflict.json() as any).error).toBe('wechat_already_bound');
  });

  it('uses UnionID to bring mini-program and website logins to the same KotoBud user', async () => {
    const db = new MockD1();
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => Response.json(input.pathname === '/sns/jscode2session'
      ? { openid: 'mini-openid', unionid: 'shared-unionid' }
      : { openid: 'web-openid', unionid: 'shared-unionid', access_token: 'server-only' })));
    const mini = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'minicode123' }), env(db));
    const miniUserId = (await mini.json() as any).user.id;
    const start = await worker.fetch(post('/api/v1/auth/wechat/attempt', { purpose: 'login' }), env(db));
    const attempt = await start.json() as any;
    await worker.fetch(new Request(`https://kotobud.com/api/v1/auth/wechat/callback?state=${attempt.attemptId}&code=webcode123`), env(db));
    const redeemed = await worker.fetch(post('/api/v1/auth/wechat/redeem', attempt), env(db));
    expect((await redeemed.json() as any).user.id).toBe(miniUserId);
    expect(db.users.size).toBe(1);
  });

  it('explicit website binding keeps the signed-in account even without UnionID', async () => {
    const db = new MockD1();
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => Response.json(input.pathname === '/sns/jscode2session'
      ? { openid: 'mini-original' }
      : { openid: 'web-bound', access_token: 'server-only' })));
    const mini = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'minicode123' }), env(db));
    const original = await mini.json() as any;
    const start = await worker.fetch(post('/api/v1/auth/wechat/attempt', { purpose: 'link' }, original.token), env(db));
    expect(start.status).toBe(200);
    const attempt = await start.json() as any;
    const callback = await worker.fetch(new Request(`https://kotobud.com/api/v1/auth/wechat/callback?state=${attempt.attemptId}&code=webcode123`), env(db));
    expect(callback.status).toBe(200);
    expect(db.identities.has('wechat_web:web-bound')).toBe(false);
    expect(db.attempts.get(attempt.attemptId)).toMatchObject({
      user_id: null, wechat_provider: 'wechat_web', wechat_openid: 'web-bound', wechat_unionid: null, consumed_at: null
    });
    const withoutSession = await worker.fetch(post('/api/v1/auth/wechat/redeem', attempt), env(db));
    expect(withoutSession.status).toBe(401);
    expect(db.identities.has('wechat_web:web-bound')).toBe(false);
    const result = await worker.fetch(post('/api/v1/auth/wechat/redeem', attempt, original.token), env(db));
    expect(await result.json()).toMatchObject({ linked: true, userId: original.user.id });
    expect(db.users.size).toBe(1);
    expect(db.identities.get('wechat_web:web-bound')).toBe(original.user.id);
    expect(db.attempts.get(attempt.attemptId)).toMatchObject({
      wechat_provider: null, wechat_openid: null, wechat_unionid: null, error_code: null
    });
    const replay = await worker.fetch(post('/api/v1/auth/wechat/redeem', attempt, original.token), env(db));
    expect(replay.status).toBe(410);
  });

  it('releases a failed website link redeem for retry without binding early', async () => {
    const db = new MockD1();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ openid: 'web-retry', access_token: 'server-only' })));
    const mini = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'minicode123' }), env(db));
    const original = await mini.json() as any;
    const start = await worker.fetch(post('/api/v1/auth/wechat/attempt', { purpose: 'link' }, original.token), env(db));
    const attempt = await start.json() as any;
    expect((await worker.fetch(new Request(`https://kotobud.com/api/v1/auth/wechat/callback?state=${attempt.attemptId}&code=webcode123`), env(db))).status).toBe(200);
    db.failNextWebIdentityInsert = true;
    const failed = await worker.fetch(post('/api/v1/auth/wechat/redeem', attempt, original.token), env(db));
    expect(failed.status).toBe(503);
    expect(db.attempts.get(attempt.attemptId)).toMatchObject({ error_code: null, consumed_at: null, wechat_openid: 'web-retry' });
    expect(db.identities.has('wechat_web:web-retry')).toBe(false);
    const retried = await worker.fetch(post('/api/v1/auth/wechat/redeem', attempt, original.token), env(db));
    expect(retried.status).toBe(200);
    expect(db.identities.get('wechat_web:web-retry')).toBe(original.user.id);
    expect(db.attempts.get(attempt.attemptId)).toMatchObject({ consumed_at: expect.any(String), wechat_openid: null });
  });

  it('refuses website binding after the initiating session is revoked', async () => {
    const db = new MockD1();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ openid: 'web-revoked', access_token: 'server-only' })));
    const mini = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'minicode123' }), env(db));
    const original = await mini.json() as any;
    const start = await worker.fetch(post('/api/v1/auth/wechat/attempt', { purpose: 'link' }, original.token), env(db));
    const attempt = await start.json() as any;
    expect((await worker.fetch(new Request(`https://kotobud.com/api/v1/auth/wechat/callback?state=${attempt.attemptId}&code=webcode123`), env(db))).status).toBe(200);
    for (const session of db.sessions.values()) session.revoked_at = new Date().toISOString();
    const redeem = await worker.fetch(post('/api/v1/auth/wechat/redeem', attempt, original.token), env(db));
    expect(redeem.status).toBe(401);
    expect(db.identities.has('wechat_web:web-revoked')).toBe(false);
    expect(db.attempts.get(attempt.attemptId).consumed_at).toBeNull();
  });

  it('refuses website binding when a different account redeems the attempt', async () => {
    const db = new MockD1();
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => Response.json({
      openid: input.pathname === '/sns/jscode2session'
        ? (input.searchParams.get('js_code') === 'othercode123' ? 'mini-other' : 'mini-original')
        : 'web-switched',
      access_token: 'server-only'
    })));
    const first = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'firstcode123' }), env(db));
    const original = await first.json() as any;
    const second = await worker.fetch(post('/api/v1/auth/wechat/mini-login', { code: 'othercode123' }), env(db));
    const other = await second.json() as any;
    const start = await worker.fetch(post('/api/v1/auth/wechat/attempt', { purpose: 'link' }, original.token), env(db));
    const attempt = await start.json() as any;
    expect((await worker.fetch(new Request(`https://kotobud.com/api/v1/auth/wechat/callback?state=${attempt.attemptId}&code=webcode123`), env(db))).status).toBe(200);
    const switched = await worker.fetch(post('/api/v1/auth/wechat/redeem', attempt, other.token), env(db));
    expect(switched.status).toBe(403);
    expect((await switched.json() as any).error).toBe('wechat_account_mismatch');
    expect(db.identities.has('wechat_web:web-switched')).toBe(false);
    expect(db.attempts.get(attempt.attemptId).consumed_at).toBeNull();
    const correct = await worker.fetch(post('/api/v1/auth/wechat/redeem', attempt, original.token), env(db));
    expect(correct.status).toBe(200);
    expect(db.identities.get('wechat_web:web-switched')).toBe(original.user.id);
  });

  it('redeems website OAuth through a private verifier once, without a token in the callback URL', async () => {
    const db = new MockD1();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ openid: 'openid-web', unionid: 'same-person', access_token: 'wechat-secret-token' })));
    const start = await worker.fetch(post('/api/v1/auth/wechat/attempt', { purpose: 'login' }), env(db));
    expect(start.status).toBe(200);
    const attempt = await start.json() as any;
    expect(attempt.authorizeUrl).toContain('open.weixin.qq.com/connect/qrconnect');
    const pending = await worker.fetch(post('/api/v1/auth/wechat/redeem', { attemptId: attempt.attemptId, verifier: attempt.verifier }), env(db));
    expect(pending.status).toBe(202);
    const callback = await worker.fetch(new Request(`https://kotobud.com/api/v1/auth/wechat/callback?state=${attempt.attemptId}&code=oauthcode123`), env(db));
    expect(callback.status).toBe(200);
    expect(await callback.text()).not.toContain('wechat-secret-token');
    const stolen = await worker.fetch(post('/api/v1/auth/wechat/redeem', { attemptId: attempt.attemptId, verifier: 'a'.repeat(64) }), env(db));
    expect(stolen.status).toBe(404);
    const redeemed = await worker.fetch(post('/api/v1/auth/wechat/redeem', { attemptId: attempt.attemptId, verifier: attempt.verifier }), env(db));
    expect(redeemed.status).toBe(200);
    const session = await redeemed.json() as any;
    expect(session.token).toBeTruthy();
    expect(session.user.id).toMatch(/^kb_/);
    const replay = await worker.fetch(post('/api/v1/auth/wechat/redeem', { attemptId: attempt.attemptId, verifier: attempt.verifier }), env(db));
    expect(replay.status).toBe(410);
  });
});
