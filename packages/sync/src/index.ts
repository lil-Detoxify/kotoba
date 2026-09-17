/** Versioned, JSON-safe boundary for future account and progress sync. */
export const SYNC_API_VERSION = 'v1' as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface SyncIdentity {
  /** `local` is the only identity used before account support is enabled. */
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

export interface SyncClient {
  status(): SyncStatus;
  sync(request: SyncRequest, options?: SyncRequestOptions): Promise<SyncResponse | SyncDisabled>;
}

export class LocalOnlySyncClient implements SyncClient {
  status(): SyncDisabled { return {status: 'disabled', reason: 'local_only'}; }
  async sync(_request: SyncRequest, _options?: SyncRequestOptions): Promise<SyncDisabled> {
    return this.status();
  }
}

export interface HttpSyncClientOptions {
  endpoint: string;
  identity: SyncIdentity;
  getAccessToken?: () => string | undefined;
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
}

/** Optional v1 transport. It is inert until an endpoint and runtime credentials are supplied. */
export class HttpSyncClient implements SyncClient {
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

/** Runtime validation is intentionally small: it protects the transport boundary without coupling to storage. */
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
