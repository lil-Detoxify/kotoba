import { validatePersonalLibrary, type PersonalLibrary } from './personal-library';

export interface CloudBackup { revision: number; updatedAt: string; library: PersonalLibrary }
export const MAX_LIBRARY_BACKUP_BYTES = 1024 * 1024;
const PATH = '/api/v1/personal-library/backup';

export class PersonalLibraryCloudError extends Error {
  constructor(message: string, readonly code: string, readonly status = 0) { super(message); }
}

export function validateCloudBackup(value: unknown): CloudBackup | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('账号备份内容暂时无法读取，请稍后重试。');
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1 || typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) {
    throw new Error('账号备份内容暂时无法读取，请稍后重试。');
  }
  return { revision: Number(row.revision), updatedAt: row.updatedAt, library: validatePersonalLibrary(row.library) };
}

function messageFor(code: string): string {
  if (code === 'backup_conflict') return '账号备份刚刚有变化，请重新查看后再保存。';
  if (code === 'backup_too_large') return '词库内容超过当前账号备份容量，请使用个人词库文件迁移。';
  if (code === 'unauthorized') return '登录状态已过期，请重新登录后再试。';
  if (code === 'backup_unavailable' || code === 'db_unavailable') return '账号备份暂时不可用，请稍后重试。';
  return '账号备份暂时无法读取或保存，请稍后重试。';
}

async function request(token: string, base: string, body?: { expectedRevision: number; library: PersonalLibrary }): Promise<CloudBackup | null> {
  if (!token) throw new PersonalLibraryCloudError('请先登录后使用账号备份。', 'unauthorized', 401);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(base.replace(/\/$/u, '') + PATH, {
      method: body ? 'PUT' : 'GET', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new PersonalLibraryCloudError('账号备份服务暂时无法响应，请稍后重试。', 'invalid_response', response.status); }
    if (!response.ok) {
      const code = typeof (payload as { error?: unknown })?.error === 'string' ? (payload as { error: string }).error : 'request_failed';
      throw new PersonalLibraryCloudError(messageFor(code), code, response.status);
    }
    if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'backup')) {
      throw new PersonalLibraryCloudError('账号备份服务暂时无法响应，请稍后重试。', 'invalid_response');
    }
    return validateCloudBackup((payload as { backup: unknown }).backup);
  } catch (error) {
    if (error instanceof PersonalLibraryCloudError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new PersonalLibraryCloudError('连接账号备份超时，请稍后重试。', 'timeout');
    throw new PersonalLibraryCloudError('连接账号备份失败，请稍后重试。', 'request_failed');
  } finally { clearTimeout(timer); }
}

export function fetchPersonalLibraryBackup(token: string, base = ''): Promise<CloudBackup | null> {
  return request(token, base);
}

export async function savePersonalLibraryBackup(token: string, value: PersonalLibrary, expectedRevision: number, base = ''): Promise<CloudBackup> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('请先查看账号备份，再保存这台设备的内容。');
  const library = validatePersonalLibrary(value);
  if (new TextEncoder().encode(JSON.stringify(library)).byteLength > MAX_LIBRARY_BACKUP_BYTES) {
    throw new PersonalLibraryCloudError(messageFor('backup_too_large'), 'backup_too_large', 413);
  }
  const backup = await request(token, base, { expectedRevision, library });
  if (!backup || backup.revision !== expectedRevision + 1) {
    throw new PersonalLibraryCloudError('保存结果暂时无法确认，请重新查看账号备份。', 'invalid_response');
  }
  return backup;
}
