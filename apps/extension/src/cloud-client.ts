import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AuthUser, CheckAccountResult, SyncClient } from '@jp/sync';
import { WorkerSyncClient } from '@jp/sync';

export interface ExtensionAuthSession {
  user: AuthUser;
  token: string;
  refreshToken?: string;
}

export interface ExtensionAuthVault {
  read(): Promise<ExtensionAuthSession | null>;
  write(session: ExtensionAuthSession): Promise<void>;
  clear(): Promise<void>;
}

interface AuthSchema extends DBSchema {
  session: { key: 'active'; value: ExtensionAuthSession };
}

const AUTH_DATABASE = 'kotobud-extension-auth-v1';

/** Keeps only the auth session in a dedicated database. Passwords and codes are never stored. */
export class IndexedDbExtensionAuthVault implements ExtensionAuthVault {
  private databasePromise: Promise<IDBPDatabase<AuthSchema>> | undefined;

  constructor(private readonly databaseName = AUTH_DATABASE) {}

  private database(): Promise<IDBPDatabase<AuthSchema>> {
    this.databasePromise ??= openDB<AuthSchema>(this.databaseName, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('session')) database.createObjectStore('session');
      },
    }).catch(error => {
      this.databasePromise = undefined;
      throw error;
    });
    return this.databasePromise;
  }

  async read(): Promise<ExtensionAuthSession | null> {
    const db = await this.database();
    return (await db.get('session', 'active')) ?? null;
  }

  async write(session: ExtensionAuthSession): Promise<void> {
    const db = await this.database();
    await db.put('session', session, 'active');
  }

  async clear(): Promise<void> {
    const db = await this.database();
    await db.delete('session', 'active');
  }
}

export interface AuthCandidateResult {
  success: boolean;
  session?: ExtensionAuthSession;
  error?: string;
  flow?: string;
}

export interface SendCodeResult {
  success: boolean;
  verificationId?: string;
  expiresIn?: number;
  error?: string;
}

export interface ExtensionAuthClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  vault?: ExtensionAuthVault;
  timeoutMs?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeMessage(value: unknown, status: number): string {
  const raw = record(value) && typeof value.message === 'string'
    ? value.message
    : record(value) && typeof value.error === 'string'
      ? value.error
      : `请求失败（${status}）`;
  return raw
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer [hidden]')
    .replace(/(?:access|refresh)?_?token\s*[:=]\s*[^\s,;]+/gi, 'token=[hidden]')
    .slice(0, 300);
}

function parseUser(value: unknown): AuthUser | undefined {
  if (!record(value) || typeof value.id !== 'string' || value.id.length === 0) return undefined;
  return {
    id: value.id,
    ...(typeof value.email === 'string' ? { email: value.email } : {}),
    provider: typeof value.provider === 'string' ? value.provider : 'kotobud',
    ...(typeof value.providerUid === 'string' ? { providerUid: value.providerUid } : {}),
  };
}

/** Platform-neutral HTTP auth adapter for the existing /api/v1 routes. */
export class ExtensionAuthHttpClient {
  private readonly fetcher: typeof fetch;
  private readonly vault: ExtensionAuthVault;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: ExtensionAuthClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.vault = options.vault ?? new IndexedDbExtensionAuthVault();
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; value: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}/api/v1${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let value: unknown;
      try { value = await response.json(); } catch { value = undefined; }
      return { ok: response.ok, status: response.status, value };
    } finally {
      clearTimeout(timer);
    }
  }

  async checkAccount(email: string): Promise<CheckAccountResult> {
    try {
      const response = await this.post('/auth/check-account', { email: email.trim().toLowerCase() });
      const value = response.value;
      if (!response.ok || !record(value)) {
        return { exists: false, hasPassword: false, flow: 'register', error: safeMessage(value, response.status) };
      }
      const flow = value.flow === 'password' || value.flow === 'legacy_upgrade' ? value.flow : 'register';
      if (typeof value.exists !== 'boolean' || typeof value.hasPassword !== 'boolean') {
        return { exists: false, hasPassword: false, flow: 'register', error: '账号查询响应格式不正确。' };
      }
      return { exists: value.exists, hasPassword: value.hasPassword, flow };
    } catch {
      return { exists: false, hasPassword: false, flow: 'register', error: '网络连接异常，请重试。' };
    }
  }

  async sendEmailCode(email: string): Promise<SendCodeResult> {
    try {
      const response = await this.post('/auth/send-code', { email: email.trim().toLowerCase() });
      if (!response.ok || !record(response.value) || response.value.success !== true || typeof response.value.verificationId !== 'string') {
        return { success: false, error: safeMessage(response.value, response.status) };
      }
      return {
        success: true,
        verificationId: response.value.verificationId,
        ...(typeof response.value.expiresIn === 'number' ? { expiresIn: response.value.expiresIn } : {}),
      };
    } catch {
      return { success: false, error: '验证码发送失败，请重试。' };
    }
  }

  async loginCandidate(email: string, password: string): Promise<AuthCandidateResult> {
    return this.authCandidate('/auth/login-password', { email: email.trim().toLowerCase(), password });
  }

  async registerCandidate(
    email: string,
    password: string,
    code: string,
    verificationId: string,
    flow: 'register' | 'legacy_upgrade',
  ): Promise<AuthCandidateResult> {
    if (!verificationId) return { success: false, error: '请先获取验证码。' };
    const path = flow === 'legacy_upgrade' ? '/auth/upgrade-legacy' : '/auth/register';
    return this.authCandidate(path, {
      email: email.trim().toLowerCase(),
      password,
      code: code.trim(),
      verificationId,
    });
  }

  private async authCandidate(path: string, body: Record<string, unknown>): Promise<AuthCandidateResult> {
    try {
      const response = await this.post(path, body);
      if (!response.ok || !record(response.value) || response.value.success !== true) {
        return {
          success: false,
          error: safeMessage(response.value, response.status),
          ...(record(response.value) && typeof response.value.flow === 'string' ? { flow: response.value.flow } : {}),
        };
      }
      const user = parseUser(response.value.user);
      if (!user || typeof response.value.token !== 'string' || response.value.token.length === 0) {
        return { success: false, error: '登录服务响应格式不正确。' };
      }
      return {
        success: true,
        session: {
          user,
          token: response.value.token,
          ...(typeof response.value.refreshToken === 'string' ? { refreshToken: response.value.refreshToken } : {}),
        },
      };
    } catch {
      return { success: false, error: '网络请求失败，请重试。' };
    }
  }

  async refreshCandidate(session: ExtensionAuthSession): Promise<AuthCandidateResult> {
    try {
      const response = await this.post('/auth/refresh', session.refreshToken ? { refreshToken: session.refreshToken } : {});
      if (!response.ok || !record(response.value) || response.value.success !== true) {
        return { success: false, error: safeMessage(response.value, response.status) };
      }
      const user = parseUser(response.value.user);
      if (!user || user.id !== session.user.id || typeof response.value.token !== 'string' || response.value.token.length === 0) {
        return { success: false, error: '登录状态已失效，请重新登录。' };
      }
      return {
        success: true,
        session: {
          user,
          token: response.value.token,
          ...(typeof response.value.refreshToken === 'string'
            ? { refreshToken: response.value.refreshToken }
            : session.refreshToken ? { refreshToken: session.refreshToken } : {}),
        },
      };
    } catch {
      return { success: false, error: '登录状态刷新失败，请重试。' };
    }
  }

  getSession(): Promise<ExtensionAuthSession | null> {
    return this.vault.read();
  }

  saveSession(session: ExtensionAuthSession): Promise<void> {
    return this.vault.write(session);
  }

  async logoutRemote(session: ExtensionAuthSession | null): Promise<void> {
    if (!session) return;
    try {
      await this.post('/auth/logout', session.refreshToken ? { refreshToken: session.refreshToken } : {});
    } catch {
      // The local session is cleared by the coordinator even when the network is unavailable.
    }
  }

  clearSession(): Promise<void> {
    return this.vault.clear();
  }
}

export function defaultExtensionApiBase(isExtensionRuntime: boolean): string {
  return isExtensionRuntime ? 'https://kotobud.com' : '';
}

export function createWorkerSyncClient(baseUrl = ''): SyncClient {
  return new WorkerSyncClient(baseUrl, 7_000);
}
