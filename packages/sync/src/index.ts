import type { ReviewEvent, CloudProgressDoc, UserSettings, SyncQueueItem } from '@jp/models';

// ---------------------------------------------------------------------------
// Legacy Sync Boundary (Backward Compatibility for existing tests)
// ---------------------------------------------------------------------------
export const SYNC_API_VERSION = 'v1' as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface SyncIdentity {
  kind: 'local' | 'account';
  userId: string;
}

export interface SyncCursor {
  version: number;
  token?: string;
}

export interface SyncRecord {
  id: string;
  wordId: string;
  userId: string;
  revision: number;
  updatedAt: string;
  deletedAt?: string;
  payload: JsonValue;
}

export interface SyncChangeSet {
  clientId: string;
  idempotencyKey: string;
  baseCursor: SyncCursor;
  records: SyncRecord[];
}

export interface SyncRequest {
  apiVersion: typeof SYNC_API_VERSION;
  identity: SyncIdentity;
  cursor: SyncCursor;
  changes?: SyncChangeSet;
}

export interface SyncConflict {
  recordId: string;
  reason: 'revision_mismatch' | 'stale_update' | 'invalid_record';
  server?: SyncRecord;
}

export interface SyncResponse {
  apiVersion: typeof SYNC_API_VERSION;
  cursor: SyncCursor;
  changes: SyncRecord[];
  acceptedIdempotencyKeys: string[];
  conflicts: SyncConflict[];
}

export interface SyncDisabled {
  status: 'disabled';
  reason: 'local_only';
}

export interface SyncEnabled {
  status: 'enabled';
  identity: SyncIdentity;
}

export type SyncStatus = SyncDisabled | SyncEnabled;

export interface SyncRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface LegacySyncClient {
  status(): SyncStatus;
  sync(request: SyncRequest, options?: SyncRequestOptions): Promise<SyncResponse | SyncDisabled>;
}

export class LocalOnlySyncClient implements LegacySyncClient, SyncClient {
  status(): SyncDisabled { return {status: 'disabled', reason: 'local_only'}; }
  async sync(_request: SyncRequest, _options?: SyncRequestOptions): Promise<SyncDisabled> {
    return this.status();
  }
  async bootstrap(_token: string): Promise<SyncBootstrapResult> {
    return { userId: 'local', hasCloudData: false, progressCount: 0, eventCount: 0 };
  }
  async pull(_token: string): Promise<SyncPullResult> {
    return { userId: 'local', progress: [], events: [], serverTime: new Date().toISOString() };
  }
  async push(_token: string): Promise<SyncPushResult> {
    return { success: true, acceptedEvents: 0, updatedProgress: 0, serverTime: new Date().toISOString() };
  }
}

export interface HttpSyncClientOptions {
  endpoint: string;
  identity: SyncIdentity;
  getAccessToken?: () => string | undefined;
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
}

export class HttpSyncClient implements LegacySyncClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly options: HttpSyncClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  status(): SyncEnabled { return {status: 'enabled', identity: this.options.identity}; }
  async sync(request: SyncRequest, callOptions: SyncRequestOptions = {}): Promise<SyncResponse> {
    if (request.identity.userId !== this.options.identity.userId || request.identity.kind !== this.options.identity.kind) {
      throw new Error('sync identity does not match client identity');
    }
    if (callOptions.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    const timeout = callOptions.timeoutMs ?? this.options.defaultTimeoutMs ?? 10_000;
    const timer = setTimeout(() => controller.abort(), timeout);
    const abort = () => controller.abort();
    callOptions.signal?.addEventListener('abort', abort, {once: true});
    try {
      const token = this.options.getAccessToken?.();
      const headers: Record<string, string> = {'content-type': 'application/json'};
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await this.fetchImpl(this.options.endpoint, {
        method: 'POST', headers, body: JSON.stringify(request), signal: controller.signal
      });
      if (!response.ok) throw new Error(`sync request failed (${response.status})`);
      return parseSyncResponse(await response.json());
    } finally {
      clearTimeout(timer);
      callOptions.signal?.removeEventListener('abort', abort);
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isObject(value) && Object.values(value).every(isJsonValue);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}
function isCursor(value: unknown): value is SyncCursor {
  return isObject(value) && Number.isInteger(value.version) && (value.version as number) >= 0 && (value.token === undefined || typeof value.token === 'string');
}
function isRecord(value: unknown): value is SyncRecord {
  return isObject(value) && typeof value.id === 'string' && value.id.length > 0 && typeof value.wordId === 'string' && value.wordId.length > 0 && typeof value.userId === 'string' && value.userId.length > 0 && Number.isInteger(value.revision) && (value.revision as number) >= 0 && isIso(value.updatedAt) && (value.deletedAt === undefined || isIso(value.deletedAt)) && 'payload' in value && isJsonValue(value.payload);
}
function isIdentity(value: unknown): value is SyncIdentity {
  return isObject(value) && (value.kind === 'local' || value.kind === 'account') && typeof value.userId === 'string' && value.userId.length > 0;
}
function isConflict(value: unknown): value is SyncConflict {
  return isObject(value) && typeof value.recordId === 'string' && value.recordId.length > 0 &&
    (value.reason === 'revision_mismatch' || value.reason === 'stale_update' || value.reason === 'invalid_record') &&
    (value.server === undefined || isRecord(value.server));
}

export function parseSyncResponse(value: unknown): SyncResponse {
  if (!isObject(value) || value.apiVersion !== SYNC_API_VERSION || !isCursor(value.cursor) ||
      !Array.isArray(value.changes) || !value.changes.every(isRecord) || !Array.isArray(value.acceptedIdempotencyKeys) || !value.acceptedIdempotencyKeys.every(x => typeof x === 'string') || !Array.isArray(value.conflicts)) {
    throw new Error('invalid sync response');
  }
  if (!value.conflicts.every(isConflict)) throw new Error('invalid sync response');
  return value as unknown as SyncResponse;
}

export function encodeSyncRequest(request: SyncRequest): string { return JSON.stringify(request); }
export function decodeSyncRequest(value: string): SyncRequest {
  const parsed: unknown = JSON.parse(value);
  if (!isObject(parsed) || parsed.apiVersion !== SYNC_API_VERSION || !isIdentity(parsed.identity) || !isCursor(parsed.cursor)) throw new Error('invalid sync request');
  if (parsed.changes !== undefined && (!isObject(parsed.changes) || typeof parsed.changes.clientId !== 'string' || parsed.changes.clientId.length === 0 || typeof parsed.changes.idempotencyKey !== 'string' || parsed.changes.idempotencyKey.length === 0 || !isCursor(parsed.changes.baseCursor) || !Array.isArray(parsed.changes.records) || !parsed.changes.records.every(isRecord))) throw new Error('invalid sync request');
  return parsed as unknown as SyncRequest;
}

// ---------------------------------------------------------------------------
// Modern KotoBud Account & Cloud Sync Interfaces
// ---------------------------------------------------------------------------
export interface AuthUser {
  id: string; // KotoBud internal user ID (kb_...)
  email?: string;
  provider: string;
  providerUid?: string;
}

export interface CheckAccountResult {
  exists: boolean;
  hasPassword: boolean;
  flow: 'password' | 'register' | 'legacy_upgrade';
  error?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
  user?: AuthUser;
  error?: string;
  flow?: string;
}

export interface AuthClient {
  init(): Promise<void>;
  sendEmailCode(email: string): Promise<{ success: boolean; verificationId?: string; error?: string }>;
  checkAccount(email: string): Promise<CheckAccountResult>;
  loginWithPassword(email: string, password: string): Promise<AuthResponse>;
  registerWithPassword(email: string, password: string, code: string, verificationId?: string): Promise<AuthResponse>;
  upgradeLegacyPassword(email: string, password: string, code: string, verificationId?: string): Promise<AuthResponse>;
  resetPassword(email: string, newPassword: string, code: string, verificationId?: string): Promise<AuthResponse>;
  refreshToken(): Promise<AuthResponse>;
  signInWithEmailCode(email: string, code: string): Promise<AuthResponse>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  getCurrentUser(): AuthUser | null;
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void;
}

export interface SyncPullResult {
  userId: string;
  progress: CloudProgressDoc[];
  events: ReviewEvent[];
  settings?: UserSettings;
  serverTime: string;
}

export interface SyncPushResult {
  success: boolean;
  acceptedEvents: number;
  updatedProgress: number;
  serverTime: string;
}

export interface SyncBootstrapResult {
  userId: string;
  hasCloudData: boolean;
  progressCount: number;
  eventCount: number;
}

export interface SyncClient {
  bootstrap(token: string): Promise<SyncBootstrapResult>;
  pull(token: string, since?: string): Promise<SyncPullResult>;
  push(token: string, payload: { events: ReviewEvent[]; progress: CloudProgressDoc[]; settings?: UserSettings }): Promise<SyncPushResult>;
}

// ---------------------------------------------------------------------------
// WorkerSyncClient: Real HTTP client talking to Cloudflare Worker API
// ---------------------------------------------------------------------------
export class WorkerSyncClient implements SyncClient {
  private authClient?: AuthClient;

  constructor(private baseUrl = '', private defaultTimeoutMs = 10_000, authClient?: AuthClient) {
    this.authClient = authClient;
  }

  setAuthClient(client: AuthClient): void {
    this.authClient = client;
  }

  private async request<T>(endpoint: string, token: string, options: RequestInit = {}, retries = 2): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let currentToken = token;
    let attempt = 0;
    let lastError: any;

    while (attempt <= retries) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'authorization': `Bearer ${currentToken}`,
        ...((options.headers as Record<string, string>) || {})
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.defaultTimeoutMs);
      try {
        const res = await fetch(url, {
          ...options,
          headers,
          credentials: 'include',
          signal: controller.signal
        });
        clearTimeout(timer);

        if (!res.ok) {
          let errBody: any;
          try { errBody = await res.json(); } catch {}
          const msg = errBody?.message || errBody?.error || `Request failed with status ${res.status}`;

          // Silent Refresh on 401
          if (res.status === 401 && this.authClient && attempt === 0) {
            try {
              const refreshRes = await this.authClient.refreshToken();
              if (refreshRes.success && refreshRes.token) {
                currentToken = refreshRes.token;
                attempt++;
                continue;
              }
            } catch {}
          }

          if (res.status >= 400 && res.status < 500) {
            throw new Error(msg);
          }
          throw new Error(msg);
        }
        return (await res.json()) as T;
      } catch (err: any) {
        clearTimeout(timer);
        lastError = err;
        if (err?.message?.includes('status 4') || err?.message?.includes('unauthorized')) {
          throw err;
        }
        if (attempt < retries) {
          attempt++;
          const backoff = Math.min(1000, 150 * Math.pow(2, attempt));
          await new Promise(r => setTimeout(r, backoff));
        } else {
          break;
        }
      }
    }
    throw lastError || new Error('Sync network request failed');
  }

  async bootstrap(token: string): Promise<SyncBootstrapResult> {
    return this.request<SyncBootstrapResult>('/api/v1/sync/bootstrap', token, {
      method: 'POST'
    });
  }

  async pull(token: string, since?: string): Promise<SyncPullResult> {
    return this.request<SyncPullResult>('/api/v1/sync/pull', token, {
      method: 'POST',
      body: JSON.stringify({ since })
    });
  }

  async push(token: string, payload: { events: ReviewEvent[]; progress: CloudProgressDoc[]; settings?: UserSettings }): Promise<SyncPushResult> {
    return this.request<SyncPushResult>('/api/v1/sync/push', token, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
}

// ---------------------------------------------------------------------------
// CloudBaseAuthClient: Auth via Cloudflare Worker proxy and Session Cookies
// ---------------------------------------------------------------------------
export class CloudBaseAuthClient implements AuthClient {
  private currentUser: AuthUser | null = null;
  private listeners: Set<(user: AuthUser | null) => void> = new Set();
  private cachedToken: string | null = null;
  private pendingVerificationId: string | null = null;

  constructor(
    private envId: string = 'kotobud-staging-d4femojn7def1c91',
    private workerApiBase: string = ''
  ) {}

  async init(): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const savedToken = localStorage.getItem('jp-vocab.auth-token');
        const savedUser = localStorage.getItem('jp-vocab.auth-user');
        const savedRefresh = localStorage.getItem('jp-vocab.auth-refresh-token');
        if (savedToken) {
          this.cachedToken = savedToken;
          if (savedUser) {
            try { this.currentUser = JSON.parse(savedUser); } catch {}
          }
          const verified = await this.resolveInternalUser(savedToken);
          if (verified) return;
        }
        if (savedRefresh) {
          await this.refreshToken();
          return;
        }
      }
      // Attempt silent refresh via long-term HttpOnly cookie / refresh endpoint
      await this.refreshToken();
    } catch (e) {
      console.warn('Auth client init warning:', e);
    }
  }

  private async resolveInternalUser(token: string): Promise<AuthUser | null> {
    try {
      const res = await fetch(`${this.workerApiBase}/api/v1/session`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.authenticated && data.user) {
          this.currentUser = {
            id: data.user.id,
            email: data.user.email,
            provider: data.user.provider || 'kotobud'
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('jp-vocab.auth-user', JSON.stringify(this.currentUser));
          }
          this.notifyListeners();
          return this.currentUser;
        }
      }
    } catch (e) {
      console.warn('Failed to resolve internal user from session:', e);
    }
    // Token invalid or expired
    this.cachedToken = null;
    this.currentUser = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('jp-vocab.auth-token');
      localStorage.removeItem('jp-vocab.auth-user');
    }
    this.notifyListeners();
    return null;
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try { listener(this.currentUser); } catch {}
    }
  }

  private persistSession(user: AuthUser, token: string, refreshToken?: string): void {
    this.cachedToken = token;
    this.currentUser = user;
    if (typeof window !== 'undefined') {
      localStorage.setItem('jp-vocab.auth-token', token);
      localStorage.setItem('jp-vocab.auth-user', JSON.stringify(user));
      if (refreshToken) {
        localStorage.setItem('jp-vocab.auth-refresh-token', refreshToken);
      }
      try { sessionStorage.removeItem('kotobud_verification_id'); } catch {}
    }
    this.notifyListeners();
  }

  async checkAccount(email: string): Promise<CheckAccountResult> {
    try {
      const res = await fetch(`${this.workerApiBase}/api/v1/auth/check-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        credentials: 'include'
      });
      const data = await res.json() as any;
      if (!res.ok) {
        return { exists: false, hasPassword: false, flow: 'register', error: data.message || '查询失败' };
      }
      return {
        exists: Boolean(data.exists),
        hasPassword: Boolean(data.hasPassword),
        flow: data.flow || 'register'
      };
    } catch (err: any) {
      return { exists: false, hasPassword: false, flow: 'register', error: err.message || '网络连接异常' };
    }
  }

  async sendEmailCode(email: string): Promise<{ success: boolean; verificationId?: string; error?: string }> {
    try {
      const res = await fetch(`${this.workerApiBase}/api/v1/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
        credentials: 'include'
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success) {
        return { success: false, error: data.message || data.error || '发送验证码失败' };
      }
      this.pendingVerificationId = data.verificationId;
      if (typeof window !== 'undefined') {
        try { sessionStorage.setItem('kotobud_verification_id', data.verificationId); } catch {}
      }
      return { success: true, verificationId: data.verificationId };
    } catch (err: any) {
      return { success: false, error: err.message || '网络请求失败，请稍后重试' };
    }
  }

  async loginWithPassword(email: string, password: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${this.workerApiBase}/api/v1/auth/login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        credentials: 'include'
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success || !data.token || !data.user) {
        return { success: false, error: data.message || data.error || '邮箱或密码错误', flow: data.flow };
      }
      this.persistSession(data.user, data.token, data.refreshToken);
      return { success: true, token: data.token, refreshToken: data.refreshToken, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || '登录异常，请重试' };
    }
  }

  async registerWithPassword(email: string, password: string, code: string, verificationId?: string): Promise<AuthResponse> {
    try {
      const vId = verificationId || this.pendingVerificationId || (typeof window !== 'undefined' ? sessionStorage.getItem('kotobud_verification_id') : null);
      if (!vId) return { success: false, error: '请先获取验证码' };
      const res = await fetch(`${this.workerApiBase}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          code: code.trim(),
          verificationId: vId
        }),
        credentials: 'include'
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success || !data.token || !data.user) {
        return { success: false, error: data.message || data.error || '注册失败' };
      }
      this.persistSession(data.user, data.token, data.refreshToken);
      return { success: true, token: data.token, refreshToken: data.refreshToken, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || '注册异常，请重试' };
    }
  }

  async upgradeLegacyPassword(email: string, password: string, code: string, verificationId?: string): Promise<AuthResponse> {
    try {
      const vId = verificationId || this.pendingVerificationId || (typeof window !== 'undefined' ? sessionStorage.getItem('kotobud_verification_id') : null);
      if (!vId) return { success: false, error: '请先获取验证码' };
      const res = await fetch(`${this.workerApiBase}/api/v1/auth/upgrade-legacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          code: code.trim(),
          verificationId: vId
        }),
        credentials: 'include'
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success || !data.token || !data.user) {
        return { success: false, error: data.message || data.error || '升级失败' };
      }
      this.persistSession(data.user, data.token, data.refreshToken);
      return { success: true, token: data.token, refreshToken: data.refreshToken, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || '升级异常，请重试' };
    }
  }

  async resetPassword(email: string, newPassword: string, code: string, verificationId?: string): Promise<AuthResponse> {
    try {
      const vId = verificationId || this.pendingVerificationId || (typeof window !== 'undefined' ? sessionStorage.getItem('kotobud_verification_id') : null);
      if (!vId) return { success: false, error: '请先获取验证码' };
      const res = await fetch(`${this.workerApiBase}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          newPassword,
          code: code.trim(),
          verificationId: vId
        }),
        credentials: 'include'
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success || !data.token || !data.user) {
        return { success: false, error: data.message || data.error || '重置密码失败' };
      }
      this.persistSession(data.user, data.token, data.refreshToken);
      return { success: true, token: data.token, refreshToken: data.refreshToken, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || '重置异常，请重试' };
    }
  }

  async refreshToken(): Promise<AuthResponse> {
    try {
      const savedRefresh = typeof window !== 'undefined' ? localStorage.getItem('jp-vocab.auth-refresh-token') : null;
      const res = await fetch(`${this.workerApiBase}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedRefresh ? { refreshToken: savedRefresh } : {}),
        credentials: 'include'
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success || !data.token || !data.user) {
        return { success: false, error: data.message || data.error || '刷新令牌失败' };
      }
      this.persistSession(data.user, data.token, data.refreshToken);
      return { success: true, token: data.token, refreshToken: data.refreshToken, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || '刷新异常' };
    }
  }

  async signInWithEmailCode(email: string, code: string): Promise<AuthResponse> {
    try {
      const verificationId = this.pendingVerificationId || (typeof window !== 'undefined' ? sessionStorage.getItem('kotobud_verification_id') : null);
      if (!verificationId) {
        return { success: false, error: '请先获取验证码' };
      }
      const res = await fetch(`${this.workerApiBase}/api/v1/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          verificationId
        }),
        credentials: 'include'
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success || !data.token || !data.user) {
        return { success: false, error: data.message || data.error || '验证码错误或已过期' };
      }

      this.persistSession(data.user, data.token, data.refreshToken);
      return { success: true, token: data.token, refreshToken: data.refreshToken, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message || '登录异常，请重试' };
    }
  }

  async signOut(): Promise<void> {
    const savedRefresh = typeof window !== 'undefined' ? localStorage.getItem('jp-vocab.auth-refresh-token') : null;
    try {
      await fetch(`${this.workerApiBase}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedRefresh ? { refreshToken: savedRefresh } : {}),
        credentials: 'include'
      });
    } catch {}
    this.currentUser = null;
    this.cachedToken = null;
    this.pendingVerificationId = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('jp-vocab.auth-token');
      localStorage.removeItem('jp-vocab.auth-user');
      localStorage.removeItem('jp-vocab.auth-refresh-token');
      try { sessionStorage.removeItem('kotobud_verification_id'); } catch {}
    }
    this.notifyListeners();
  }

  async getAccessToken(): Promise<string | null> {
    return this.cachedToken;
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => this.listeners.delete(callback);
  }
}

const mockStorage = new Map<string, string>();
function getMockStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {}
  return mockStorage.get(key) ?? null;
}
function setMockStorage(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  mockStorage.set(key, val);
}
function removeMockStorage(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {}
  mockStorage.delete(key);
}

export class MockAuthClient implements AuthClient {
  private currentUser: AuthUser | null = null;
  private token: string | null = null;
  private listeners: Set<(user: AuthUser | null) => void> = new Set();
  public sentCodes: Map<string, string> = new Map();
  public mockUsers: Map<string, { user: AuthUser; password?: string }> = new Map();

  async init(): Promise<void> {
    const savedUser = getMockStorage('kotobud_mock_user');
    const savedToken = getMockStorage('kotobud_mock_token');
    if (savedUser && savedToken) {
      try {
        this.currentUser = JSON.parse(savedUser);
        this.token = savedToken;
        this.notifyListeners();
      } catch {}
    }
  }

  async checkAccount(email: string): Promise<CheckAccountResult> {
    const cleanEmail = email.trim().toLowerCase();
    const existing = this.mockUsers.get(cleanEmail);
    if (!existing) {
      return { exists: false, hasPassword: false, flow: 'register' };
    }
    const hasPassword = Boolean(existing.password);
    return {
      exists: true,
      hasPassword,
      flow: hasPassword ? 'password' : 'legacy_upgrade'
    };
  }

  async sendEmailCode(email: string): Promise<{ success: boolean; verificationId?: string; error?: string }> {
    const code = '123456';
    const cleanEmail = email.trim().toLowerCase();
    this.sentCodes.set(cleanEmail, code);
    return { success: true, verificationId: 'mock_vid_' + Date.now() };
  }

  async loginWithPassword(email: string, password: string): Promise<AuthResponse> {
    const cleanEmail = email.trim().toLowerCase();
    const account = this.mockUsers.get(cleanEmail);
    if (!account) return { success: false, error: '邮箱或密码错误' };
    if (!account.password) return { success: false, error: '请先升级账号并设置密码', flow: 'legacy_upgrade' };
    if (account.password !== password) return { success: false, error: '邮箱或密码错误' };

    this.token = `mock_${account.user.providerUid}:${cleanEmail}`;
    this.currentUser = account.user;
    setMockStorage('kotobud_mock_user', JSON.stringify(this.currentUser));
    setMockStorage('kotobud_mock_token', this.token);
    this.notifyListeners();
    return { success: true, token: this.token, refreshToken: `mock_rt_${cleanEmail}`, user: this.currentUser };
  }

  async registerWithPassword(email: string, password: string, code: string): Promise<AuthResponse> {
    const cleanEmail = email.trim().toLowerCase();
    const expected = this.sentCodes.get(cleanEmail) || '123456';
    if (code.trim() !== expected) return { success: false, error: '验证码错误' };
    if (password.length < 8) return { success: false, error: '密码长度至少为 8 位' };

    const providerUid = 'cb_' + cleanEmail.replace(/[^a-z0-9]/g, '_');
    const internalId = 'kb_' + cleanEmail.replace(/[^a-z0-9]/g, '_').slice(0, 12);
    const user: AuthUser = {
      id: internalId,
      email: cleanEmail,
      provider: 'cloudbase',
      providerUid
    };
    this.mockUsers.set(cleanEmail, { user, password });
    this.currentUser = user;
    this.token = `mock_${providerUid}:${cleanEmail}`;
    setMockStorage('kotobud_mock_user', JSON.stringify(this.currentUser));
    setMockStorage('kotobud_mock_token', this.token);
    this.notifyListeners();
    return { success: true, token: this.token, refreshToken: `mock_rt_${cleanEmail}`, user: this.currentUser };
  }

  async upgradeLegacyPassword(email: string, password: string, code: string): Promise<AuthResponse> {
    const cleanEmail = email.trim().toLowerCase();
    const expected = this.sentCodes.get(cleanEmail) || '123456';
    if (code.trim() !== expected) return { success: false, error: '验证码错误' };
    if (password.length < 8) return { success: false, error: '密码长度至少为 8 位' };

    let account = this.mockUsers.get(cleanEmail);
    if (!account) {
      const providerUid = 'cb_' + cleanEmail.replace(/[^a-z0-9]/g, '_');
      const internalId = 'kb_' + cleanEmail.replace(/[^a-z0-9]/g, '_').slice(0, 12);
      account = {
        user: { id: internalId, email: cleanEmail, provider: 'cloudbase', providerUid },
        password
      };
    } else {
      account.password = password;
    }
    this.mockUsers.set(cleanEmail, account);
    this.currentUser = account.user;
    this.token = `mock_${account.user.providerUid}:${cleanEmail}`;
    setMockStorage('kotobud_mock_user', JSON.stringify(this.currentUser));
    setMockStorage('kotobud_mock_token', this.token);
    this.notifyListeners();
    return { success: true, token: this.token, refreshToken: `mock_rt_${cleanEmail}`, user: this.currentUser };
  }

  async resetPassword(email: string, newPassword: string, code: string): Promise<AuthResponse> {
    const cleanEmail = email.trim().toLowerCase();
    const expected = this.sentCodes.get(cleanEmail) || '123456';
    if (code.trim() !== expected) return { success: false, error: '验证码错误' };
    if (newPassword.length < 8) return { success: false, error: '新密码长度至少为 8 位' };

    const account = this.mockUsers.get(cleanEmail);
    if (!account) return { success: false, error: '未找到该用户' };
    account.password = newPassword;
    this.currentUser = account.user;
    this.token = `mock_${account.user.providerUid}:${cleanEmail}`;
    setMockStorage('kotobud_mock_user', JSON.stringify(this.currentUser));
    setMockStorage('kotobud_mock_token', this.token);
    this.notifyListeners();
    return { success: true, token: this.token, refreshToken: `mock_rt_${cleanEmail}`, user: this.currentUser };
  }

  async refreshToken(): Promise<AuthResponse> {
    if (!this.currentUser) return { success: false, error: '未登录' };
    this.token = `mock_${this.currentUser.providerUid || this.currentUser.id}:${this.currentUser.email}`;
    return { success: true, token: this.token, refreshToken: `mock_rt_${this.currentUser.email}`, user: this.currentUser };
  }

  async signInWithEmailCode(email: string, code: string): Promise<AuthResponse> {
    const cleanEmail = email.trim().toLowerCase();
    const expected = this.sentCodes.get(cleanEmail) || '123456';
    if (code.trim() !== expected) {
      return { success: false, error: '验证码错误' };
    }

    const providerUid = 'cb_' + cleanEmail.replace(/[^a-z0-9]/g, '_');
    const internalId = 'kb_' + cleanEmail.replace(/[^a-z0-9]/g, '_').slice(0, 12);
    this.token = `mock_${providerUid}:${cleanEmail}`;
    this.currentUser = {
      id: internalId,
      email: cleanEmail,
      provider: 'cloudbase',
      providerUid
    };
    this.mockUsers.set(cleanEmail, { user: this.currentUser });
    setMockStorage('kotobud_mock_user', JSON.stringify(this.currentUser));
    setMockStorage('kotobud_mock_token', this.token);
    this.notifyListeners();
    return { success: true, token: this.token, user: this.currentUser };
  }

  async signOut(): Promise<void> {
    this.currentUser = null;
    this.token = null;
    removeMockStorage('kotobud_mock_user');
    removeMockStorage('kotobud_mock_token');
    this.notifyListeners();
  }

  async getAccessToken(): Promise<string | null> {
    return this.token;
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try { listener(this.currentUser); } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// MockSyncClient: In-memory simulation of D1 storage for automated tests
// ---------------------------------------------------------------------------
export class MockSyncClient implements SyncClient {
  public progressStore: Map<string, CloudProgressDoc> = new Map();
  public eventStore: Map<string, ReviewEvent> = new Map();
  public settingsStore: Map<string, UserSettings> = new Map();

  async bootstrap(token: string): Promise<SyncBootstrapResult> {
    const userId = this.extractUserId(token);
    const pCount = Array.from(this.progressStore.values()).filter(p => p.userId === userId).length;
    const eCount = Array.from(this.eventStore.values()).filter(e => e.userId === userId).length;
    return {
      userId,
      hasCloudData: pCount > 0 || eCount > 0,
      progressCount: pCount,
      eventCount: eCount
    };
  }

  async pull(token: string, since?: string): Promise<SyncPullResult> {
    const userId = this.extractUserId(token);
    let progress = Array.from(this.progressStore.values()).filter(p => p.userId === userId);
    let events = Array.from(this.eventStore.values()).filter(e => e.userId === userId);
    if (since) {
      progress = progress.filter(p => p.updatedAt > since);
      events = events.filter(e => e.reviewedAt > since);
    }
    const settings = this.settingsStore.get(userId);
    return {
      userId,
      progress,
      events,
      settings,
      serverTime: new Date().toISOString()
    };
  }

  async push(token: string, payload: { events: ReviewEvent[]; progress: CloudProgressDoc[]; settings?: UserSettings }): Promise<SyncPushResult> {
    const userId = this.extractUserId(token);
    for (const ev of payload.events) {
      const key = `${userId}_${ev._id}`;
      if (!this.eventStore.has(key)) {
        this.eventStore.set(key, { ...ev, userId });
      }
    }

    for (const p of payload.progress) {
      const key = `${userId}_${p.wordId}`;
      const existing = this.progressStore.get(key);
      if (existing) {
        let isDifficult = p.isDifficult;
        let difficultUpdatedAt = p.difficultUpdatedAt;
        if (existing.difficultUpdatedAt && difficultUpdatedAt) {
          if (new Date(existing.difficultUpdatedAt) > new Date(difficultUpdatedAt)) {
            isDifficult = existing.isDifficult;
            difficultUpdatedAt = existing.difficultUpdatedAt;
          }
        }
        let isIgnored = p.isIgnored;
        let ignoredUpdatedAt = p.ignoredUpdatedAt;
        if (existing.ignoredUpdatedAt && ignoredUpdatedAt) {
          if (new Date(existing.ignoredUpdatedAt) > new Date(ignoredUpdatedAt)) {
            isIgnored = existing.isIgnored;
            ignoredUpdatedAt = existing.ignoredUpdatedAt;
          }
        }
        this.progressStore.set(key, {
          ...p,
          userId,
          isDifficult,
          difficultUpdatedAt,
          isIgnored,
          ignoredUpdatedAt,
          updatedAt: new Date().toISOString()
        });
      } else {
        this.progressStore.set(key, { ...p, userId, updatedAt: new Date().toISOString() });
      }
    }

    if (payload.settings) {
      this.settingsStore.set(userId, { ...payload.settings, userId, updatedAt: new Date().toISOString() });
    }

    return {
      success: true,
      acceptedEvents: payload.events.length,
      updatedProgress: payload.progress.length,
      serverTime: new Date().toISOString()
    };
  }

  private extractUserId(token: string): string {
    const parts = token.split(':');
    const uid = parts[0]?.replace('mock_', '') || 'user1';
    return 'kb_' + uid.slice(0, 12);
  }
}
