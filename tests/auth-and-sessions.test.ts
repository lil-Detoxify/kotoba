import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
// @ts-ignore
import worker from '../scripts/cloudflare-worker.js';

class MockD1Auth {
  public users: Map<string, any> = new Map();
  public sessions: Map<string, any> = new Map();

  prepare(sql: string) {
    const d1 = this;
    return {
      bind(...params: any[]) {
        return {
          async first() {
            if (sql.includes('FROM users WHERE email_normalized = ? OR LOWER(TRIM(email)) = ?')) {
              const [email] = params;
              const clean = String(email).trim().toLowerCase();
              for (const u of d1.users.values()) {
                if ((u.email_normalized && u.email_normalized === clean) || (u.email && u.email.trim().toLowerCase() === clean)) {
                  return { ...u };
                }
              }
              return null;
            }
            if (sql.includes('FROM users WHERE id = ?')) {
              const [id] = params;
              const found = d1.users.get(id);
              return found ? { ...found } : null;
            }
            if (sql.includes('FROM users WHERE auth_provider = ? AND provider_uid = ?')) {
              const [provider, uid] = params;
              for (const u of d1.users.values()) {
                if (u.auth_provider === provider && u.provider_uid === uid) return { ...u };
              }
              return null;
            }
            if (sql.includes('FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.refresh_token_hash = ?')) {
              const [hash] = params;
              for (const s of d1.sessions.values()) {
                if (s.refresh_token_hash === hash) {
                  const u = d1.users.get(s.user_id);
                  return {
                    id: s.id,
                    user_id: s.user_id,
                    expires_at: s.expires_at,
                    revoked_at: s.revoked_at,
                    email: u?.email,
                    auth_provider: u?.auth_provider || 'kotobud'
                  };
                }
              }
              return null;
            }
            return null;
          },
          async all() {
            return { results: [] };
          },
          async run() {
            if (sql.includes('INSERT INTO users')) {
              const [id, auth_provider, provider_uid, email, email_normalized, password_hash, password_set_at, created_at, updated_at] = params;
              d1.users.set(id, {
                id,
                auth_provider,
                provider_uid,
                email,
                email_normalized: email_normalized || (email ? email.trim().toLowerCase() : null),
                password_hash: password_hash || null,
                password_set_at: password_set_at || null,
                created_at,
                updated_at
              });
              return { success: true };
            }
            if (sql.includes('UPDATE users SET password_hash = ?')) {
              const [password_hash, password_set_at, email_normalized, updated_at, id] = params;
              const existing = d1.users.get(id);
              if (existing) {
                existing.password_hash = password_hash;
                existing.password_set_at = password_set_at;
                existing.email_normalized = email_normalized;
                existing.updated_at = updated_at;
                d1.users.set(id, existing);
              }
              return { success: true };
            }
            if (sql.includes('UPDATE users SET updated_at = ? WHERE id = ?')) {
              const [updated_at, id] = params;
              const existing = d1.users.get(id);
              if (existing) {
                existing.updated_at = updated_at;
                d1.users.set(id, existing);
              }
              return { success: true };
            }
            if (sql.includes('INSERT INTO sessions')) {
              const [id, user_id, refresh_token_hash, user_agent, ip, expires_at, created_at] = params;
              d1.sessions.set(id, {
                id,
                user_id,
                refresh_token_hash,
                user_agent,
                ip,
                expires_at,
                created_at,
                revoked_at: null
              });
              return { success: true };
            }
            if (sql.includes('UPDATE sessions SET refresh_token_hash = ?, expires_at = ? WHERE id = ?')) {
              const [refresh_token_hash, expires_at, id] = params;
              const s = d1.sessions.get(id);
              if (s) {
                s.refresh_token_hash = refresh_token_hash;
                s.expires_at = expires_at;
                d1.sessions.set(id, s);
              }
              return { success: true };
            }
            if (sql.includes('UPDATE sessions SET revoked_at = ? WHERE refresh_token_hash = ?')) {
              const [revoked_at, hash] = params;
              for (const s of d1.sessions.values()) {
                if (s.refresh_token_hash === hash) {
                  s.revoked_at = revoked_at;
                }
              }
              return { success: true };
            }
            if (sql.includes('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')) {
              const [revoked_at, uid] = params;
              for (const s of d1.sessions.values()) {
                if (s.user_id === uid && !s.revoked_at) {
                  s.revoked_at = revoked_at;
                }
              }
              return { success: true };
            }
            return { success: true };
          }
        };
      }
    };
  }
}

function makeAuthEnv(db: MockD1Auth) {
  return {
    DB: db,
    MOCK_AUTH: 'true',
    JWT_SECRET: 'test-secret-key-12345678901234567890'
  };
}

describe('KotoBud Hybrid Authentication & Session Management', () => {
  let db: MockD1Auth;
  let env: any;

  beforeEach(() => {
    db = new MockD1Auth();
    env = makeAuthEnv(db);
  });

  it('Flow 1: /api/v1/auth/check-account returns correct flow for new, legacy, and password users', async () => {
    // 1. New user (does not exist)
    const reqNew = new Request('https://kotobud.com/api/v1/auth/check-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new_user@example.com' })
    });
    const resNew = await worker.fetch(reqNew, env);
    expect(resNew.status).toBe(200);
    const dataNew = await resNew.json();
    expect(dataNew).toEqual({
      exists: false,
      hasPassword: false,
      flow: 'register'
    });

    // 2. Legacy user (exists in D1 without password)
    db.users.set('kb_legacy_1', {
      id: 'kb_legacy_1',
      auth_provider: 'cloudbase',
      provider_uid: 'cb_legacy_1',
      email: 'legacy@example.com',
      email_normalized: 'legacy@example.com',
      password_hash: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const reqLegacy = new Request('https://kotobud.com/api/v1/auth/check-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'legacy@example.com' })
    });
    const resLegacy = await worker.fetch(reqLegacy, env);
    expect(resLegacy.status).toBe(200);
    const dataLegacy = await resLegacy.json();
    expect(dataLegacy).toEqual({
      exists: true,
      hasPassword: false,
      flow: 'legacy_upgrade'
    });

    // 3. Password user (exists in D1 with password)
    db.users.set('kb_pwd_1', {
      id: 'kb_pwd_1',
      auth_provider: 'kotobud',
      provider_uid: 'kb_pwd_1',
      email: 'user_with_pwd@example.com',
      email_normalized: 'user_with_pwd@example.com',
      password_hash: 'pbkdf2:100000:0102030405060708:aabbccdd',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const reqPwd = new Request('https://kotobud.com/api/v1/auth/check-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user_with_pwd@example.com' })
    });
    const resPwd = await worker.fetch(reqPwd, env);
    expect(resPwd.status).toBe(200);
    const dataPwd = await resPwd.json();
    expect(dataPwd).toEqual({
      exists: true,
      hasPassword: true,
      flow: 'password'
    });
  });

  it('Flow 2: New user registration with CloudBase OTP and password creation', async () => {
    const email = 'alice@example.com';
    const password = 'MySecurePassword2026!';

    // Send code
    const sendReq = new Request('https://kotobud.com/api/v1/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const sendRes = await worker.fetch(sendReq, env);
    expect(sendRes.status).toBe(200);
    const sendData = await sendRes.json();
    expect(sendData.verificationId).toBeDefined();

    // Register with password
    const regReq = new Request('https://kotobud.com/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        code: '123456',
        verificationId: sendData.verificationId
      })
    });
    const regRes = await worker.fetch(regReq, env);
    expect(regRes.status).toBe(200);
    const regData = await regRes.json();

    expect(regData.success).toBe(true);
    expect(regData.token).toBeDefined();
    expect(regData.refreshToken).toMatch(/^rt_/);
    expect(regData.user.email).toBe(email);
    expect(regData.user.id).toMatch(/^kb_/);

    // Verify Set-Cookie header contains HttpOnly & Secure
    const cookie = regRes.headers.get('set-cookie');
    expect(cookie).toBeDefined();
    expect(cookie).toContain('__Secure-kotobud-refresh=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/auth');

    // Verify user stored in D1 with PBKDF2 hash
    const savedUser = db.users.get(regData.user.id);
    expect(savedUser).toBeDefined();
    expect(savedUser.password_hash).toMatch(/^pbkdf2:100000:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(savedUser.password_set_at).toBeDefined();

    // Verify session stored in D1
    expect(db.sessions.size).toBe(1);
    const session = Array.from(db.sessions.values())[0];
    expect(session.user_id).toBe(regData.user.id);
    expect(session.revoked_at).toBeNull();
  });

  it('Flow 3: Existing password user login with email and password', async () => {
    const email = 'bob@example.com';
    const password = 'BobPassword123#';

    // First register Bob
    const regReq = new Request('https://kotobud.com/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        code: '123456',
        verificationId: 'mock_vid_bob'
      })
    });
    const regRes = await worker.fetch(regReq, env);
    expect(regRes.status).toBe(200);
    const regData = await regRes.json();
    const bobUserId = regData.user.id;

    // 1. Wrong password fails with 401
    const wrongPwdReq = new Request('https://kotobud.com/api/v1/auth/login-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPassword!' })
    });
    const wrongPwdRes = await worker.fetch(wrongPwdReq, env);
    expect(wrongPwdRes.status).toBe(401);
    const wrongData = await wrongPwdRes.json();
    expect(wrongData.error).toBe('invalid_credentials');

    // 2. Correct password succeeds
    const okReq = new Request('https://kotobud.com/api/v1/auth/login-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const okRes = await worker.fetch(okReq, env);
    expect(okRes.status).toBe(200);
    const okData = await okRes.json();
    expect(okData.success).toBe(true);
    expect(okData.user.id).toBe(bobUserId);
    expect(okData.token).toBeDefined();

    // 3. Verify access token works on /api/v1/session
    const sessionReq = new Request('https://kotobud.com/api/v1/session', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${okData.token}` }
    });
    const sessionRes = await worker.fetch(sessionReq, env);
    expect(sessionRes.status).toBe(200);
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(true);
    expect(sessionData.user.id).toBe(bobUserId);
  });

  it('Flow 4: Legacy OTP user upgrade retains exact user_id and existing cloud data association', async () => {
    const email = 'carol_legacy@example.com';
    const legacyUserId = 'kb_carol_legacy_id_999';

    // Seed existing legacy account (simulating historical OTP login)
    db.users.set(legacyUserId, {
      id: legacyUserId,
      auth_provider: 'cloudbase',
      provider_uid: 'cb_carol_legacy',
      email,
      email_normalized: email,
      password_hash: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });

    // 1. Password login without password is rejected with flow 'legacy_upgrade'
    const pwdLoginReq = new Request('https://kotobud.com/api/v1/auth/login-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'CarolNewPassword2026!' })
    });
    const pwdLoginRes = await worker.fetch(pwdLoginReq, env);
    expect(pwdLoginRes.status).toBe(400);
    const pwdLoginData = await pwdLoginRes.json();
    expect(pwdLoginData.error).toBe('no_password_set');
    expect(pwdLoginData.flow).toBe('legacy_upgrade');

    // 2. Perform upgrade-legacy
    const upgradeReq = new Request('https://kotobud.com/api/v1/auth/upgrade-legacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'CarolNewPassword2026!',
        code: '123456',
        verificationId: 'mock_vid_carol'
      })
    });
    const upgradeRes = await worker.fetch(upgradeReq, env);
    expect(upgradeRes.status).toBe(200);
    const upgradeData = await upgradeRes.json();

    // CRITICAL: user.id must be the EXACT original user ID, not a new one!
    expect(upgradeData.user.id).toBe(legacyUserId);
    expect(upgradeData.token).toBeDefined();

    // Verify D1 record updated in place with same ID
    const updatedUser = db.users.get(legacyUserId);
    expect(updatedUser).toBeDefined();
    expect(updatedUser.id).toBe(legacyUserId);
    expect(updatedUser.password_hash).toMatch(/^pbkdf2:/);

    // 3. User can now login with password
    const afterUpgradeLogin = new Request('https://kotobud.com/api/v1/auth/login-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'CarolNewPassword2026!' })
    });
    const afterRes = await worker.fetch(afterUpgradeLogin, env);
    expect(afterRes.status).toBe(200);
    const afterData = await afterRes.json();
    expect(afterData.user.id).toBe(legacyUserId);
  });

  it('Flow 5: Forgot password reset revokes all existing sessions', async () => {
    const email = 'david@example.com';
    const oldPassword = 'OldPassword123#';
    const newPassword = 'NewPassword456$';

    // Register David
    const regReq = new Request('https://kotobud.com/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: oldPassword,
        code: '123456',
        verificationId: 'mock_vid_david'
      })
    });
    const regRes = await worker.fetch(regReq, env);
    const regData = await regRes.json();
    const oldRefreshToken = regData.refreshToken;

    // Verify old refresh token is valid before reset
    const refreshReq1 = new Request('https://kotobud.com/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefreshToken })
    });
    const refreshRes1 = await worker.fetch(refreshReq1, env);
    expect(refreshRes1.status).toBe(200);

    // Reset password
    const resetReq = new Request('https://kotobud.com/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        newPassword,
        code: '123456',
        verificationId: 'mock_vid_reset'
      })
    });
    const resetRes = await worker.fetch(resetReq, env);
    expect(resetRes.status).toBe(200);
    const resetData = await resetRes.json();
    expect(resetData.success).toBe(true);

    // Old password should fail
    const oldLoginReq = new Request('https://kotobud.com/api/v1/auth/login-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: oldPassword })
    });
    expect((await worker.fetch(oldLoginReq, env)).status).toBe(401);

    // New password should succeed
    const newLoginReq = new Request('https://kotobud.com/api/v1/auth/login-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: newPassword })
    });
    expect((await worker.fetch(newLoginReq, env)).status).toBe(200);

    // CRITICAL: Old refresh token must be rejected because sessions were revoked!
    const refreshReqOld = new Request('https://kotobud.com/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefreshToken })
    });
    const refreshResOld = await worker.fetch(refreshReqOld, env);
    expect(refreshResOld.status).toBe(401);
  });

  it('Flow 6: Long-term refresh token silent renewal and rotation', async () => {
    const email = 'elena@example.com';
    const password = 'ElenaPassword789!';

    // Register
    const regReq = new Request('https://kotobud.com/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code: '123456', verificationId: 'vid' })
    });
    const regRes = await worker.fetch(regReq, env);
    const regData = await regRes.json();

    // Call /api/v1/auth/refresh using Cookie header
    const refreshReq = new Request('https://kotobud.com/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Cookie': `__Secure-kotobud-refresh=${encodeURIComponent(regData.refreshToken)}`
      }
    });
    const refreshRes = await worker.fetch(refreshReq, env);
    expect(refreshRes.status).toBe(200);
    const refreshData = await refreshRes.json();

    expect(refreshData.success).toBe(true);
    expect(refreshData.token).toBeDefined();
    expect(refreshData.refreshToken).toBeDefined();
    // Tokens rotated
    expect(refreshData.refreshToken).not.toBe(regData.refreshToken);

    // Validated with new token on /api/v1/session
    const sessionReq = new Request('https://kotobud.com/api/v1/session', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${refreshData.token}` }
    });
    const sessionRes = await worker.fetch(sessionReq, env);
    expect(sessionRes.status).toBe(200);
    const sessionData = await sessionRes.json();
    expect(sessionData.authenticated).toBe(true);
    expect(sessionData.user.id).toBe(regData.user.id);
  });

  it('Flow 7: /api/v1/auth/logout revokes session in D1 and clears refresh cookie', async () => {
    const email = 'frank@example.com';
    const password = 'FrankPassword123#';

    // Register
    const regReq = new Request('https://kotobud.com/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code: '123456', verificationId: 'vid' })
    });
    const regRes = await worker.fetch(regReq, env);
    const regData = await regRes.json();

    // Logout
    const logoutReq = new Request('https://kotobud.com/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': `__Secure-kotobud-refresh=${encodeURIComponent(regData.refreshToken)}`
      }
    });
    const logoutRes = await worker.fetch(logoutReq, env);
    expect(logoutRes.status).toBe(200);
    const cookie = logoutRes.headers.get('set-cookie');
    expect(cookie).toContain('Max-Age=0');

    // Trying to refresh after logout returns 401
    const refreshReq = new Request('https://kotobud.com/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Cookie': `__Secure-kotobud-refresh=${encodeURIComponent(regData.refreshToken)}`
      }
    });
    const refreshRes = await worker.fetch(refreshReq, env);
    expect(refreshRes.status).toBe(401);
  });
});
