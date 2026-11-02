import { describe, expect, it, vi } from 'vitest';
import {
  defaultExtensionApiBase,
  ExtensionAuthHttpClient,
  type ExtensionAuthSession,
  type ExtensionAuthVault,
} from '../apps/extension/src/cloud-client';

class MemoryAuthVault implements ExtensionAuthVault {
  session: ExtensionAuthSession | null = null;
  async read() { return this.session; }
  async write(session: ExtensionAuthSession) { this.session = structuredClone(session); }
  async clear() { this.session = null; }
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('extension auth HTTP adapter', () => {
  it('uses existing email account and verification endpoints with normalized email', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ exists: true, hasPassword: false, flow: 'legacy_upgrade' }))
      .mockResolvedValueOnce(response({ success: true, verificationId: 'verify-id', expiresIn: 300 }));
    const client = new ExtensionAuthHttpClient({
      baseUrl: 'https://kotobud.com/',
      fetcher: fetcher as typeof fetch,
      vault: new MemoryAuthVault(),
    });

    await expect(client.checkAccount(' Learner@Example.com ')).resolves.toEqual({
      exists: true, hasPassword: false, flow: 'legacy_upgrade',
    });
    await expect(client.sendEmailCode(' Learner@Example.com ')).resolves.toEqual({
      success: true, verificationId: 'verify-id', expiresIn: 300,
    });

    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      'https://kotobud.com/api/v1/auth/check-account',
      'https://kotobud.com/api/v1/auth/send-code',
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ email: 'learner@example.com' });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ email: 'learner@example.com' });
    expect(fetcher.mock.calls.every(call => (call[1] as RequestInit).credentials === 'include')).toBe(true);
  });

  it('returns login, register, and legacy-upgrade candidates without persisting credentials', async () => {
    const vault = new MemoryAuthVault();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ success: true, token: 'access-secret', refreshToken: 'refresh-secret', user: { id: 'kb_1', email: 'learner@example.com', provider: 'kotobud' } }))
      .mockResolvedValueOnce(response({ success: true, token: 'register-token', user: { id: 'kb_1', provider: 'kotobud' } }))
      .mockResolvedValueOnce(response({ success: true, token: 'upgrade-token', user: { id: 'kb_1', provider: 'kotobud' } }));
    const client = new ExtensionAuthHttpClient({ baseUrl: 'https://kotobud.com', fetcher: fetcher as typeof fetch, vault });

    const login = await client.loginCandidate(' Learner@Example.com ', 'private-password');
    const registration = await client.registerCandidate(' Learner@Example.com ', 'new-password', '123456', 'verify-1', 'register');
    const upgrade = await client.registerCandidate(' Learner@Example.com ', 'new-password', '654321', 'verify-2', 'legacy_upgrade');

    expect(login.success).toBe(true);
    expect(registration.success).toBe(true);
    expect(upgrade.success).toBe(true);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      'https://kotobud.com/api/v1/auth/login-password',
      'https://kotobud.com/api/v1/auth/register',
      'https://kotobud.com/api/v1/auth/upgrade-legacy',
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ email: 'learner@example.com', password: 'private-password' });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ email: 'learner@example.com', password: 'new-password', code: '123456', verificationId: 'verify-1' });
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ email: 'learner@example.com', password: 'new-password', code: '654321', verificationId: 'verify-2' });
    expect(vault.session).toBeNull();
    expect(JSON.stringify(vault)).not.toContain('password');
    expect(JSON.stringify(vault)).not.toContain('123456');
    expect(JSON.stringify(vault)).not.toContain('verify-1');

    await client.saveSession(login.session!);
    expect(vault.session?.token).toBe('access-secret');
    expect(JSON.stringify(vault.session)).not.toContain('private-password');
  });

  it('accepts refresh only for the current user and redacts rejected tokens in server errors', async () => {
    const vault = new MemoryAuthVault();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ success: true, token: 'new-access', user: { id: 'kb_1', provider: 'kotobud' } }))
      .mockResolvedValueOnce(response({ success: true, token: 'other-access', user: { id: 'kb_2', provider: 'kotobud' } }))
      .mockResolvedValueOnce(response({ message: 'Bearer refresh-secret was rejected' }, 401));
    const client = new ExtensionAuthHttpClient({ baseUrl: 'https://kotobud.com', fetcher: fetcher as typeof fetch, vault });
    const session: ExtensionAuthSession = {
      user: { id: 'kb_1', provider: 'kotobud' }, token: 'old-access', refreshToken: 'refresh-secret',
    };

    await expect(client.refreshCandidate(session)).resolves.toMatchObject({
      success: true,
      session: { user: { id: 'kb_1' }, token: 'new-access', refreshToken: 'refresh-secret' },
    });
    await expect(client.refreshCandidate(session)).resolves.toMatchObject({ success: false });
    const failedLogin = await client.loginCandidate('learner@example.com', 'password');
    expect(failedLogin.error).not.toContain('refresh-secret');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ refreshToken: 'refresh-secret' });
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ email: 'learner@example.com', password: 'password' });
  });

  it('uses same-origin preview routing and the native kotobud host', () => {
    expect(defaultExtensionApiBase(false)).toBe('');
    expect(defaultExtensionApiBase(true)).toBe('https://kotobud.com');
  });
});
