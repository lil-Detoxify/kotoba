import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPersonalLibraryBackup,
  savePersonalLibraryBackup,
  type CloudBackup,
} from '../apps/web/src/services/personal-library-cloud';
import type { PersonalLibrary } from '../apps/web/src/services/personal-library';

const timestamp = '2026-10-12T08:00:00.000Z';
const library: PersonalLibrary = {
  kind: 'kotobud-personal-library',
  version: 1,
  exportedAt: timestamp,
  books: [{
    id: 'personal-book', title: '我的词书', description: '', language: 'ja',
    createdAt: timestamp, updatedAt: timestamp,
  }],
  lessons: [{ id: 'lesson-1', bookId: 'personal-book', title: '第一课', order: 1 }],
  words: [{ id: 'word-1', lessonId: 'lesson-1', term: '駅', reading: 'えき', meaning: '车站', order: 1 }],
  builtinContexts: [],
};

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function backup(revision: number): CloudBackup {
  return { revision, updatedAt: timestamp, library };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('personal-library cloud backup client', () => {
  it('reads an empty backup and a valid backup with bearer authorization', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ backup: null }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ backup: backup(3) }));

    await expect(fetchPersonalLibraryBackup('test-token', 'https://api.example.test/')).resolves.toBeNull();
    await expect(fetchPersonalLibraryBackup('test-token', 'https://api.example.test/')).resolves.toEqual(backup(3));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toBe('https://api.example.test/api/v1/personal-library/backup');
      expect(init?.method ?? 'GET').toBe('GET');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
    }
  });

  it('saves the library with the expected revision and returns the confirmed next revision', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ backup: backup(8) }));

    await expect(savePersonalLibraryBackup('test-token', library, 7, 'https://api.example.test'))
      .resolves.toEqual(backup(8));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.example.test/api/v1/personal-library/backup');
    expect(init?.method).toBe('PUT');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({ expectedRevision: 7, library });
  });

  it('reports a Chinese conflict and does not retry the request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'backup_conflict' }, 409));

    await expect(savePersonalLibraryBackup('test-token', library, 2, 'https://api.example.test'))
      .rejects.toMatchObject({
        code: 'backup_conflict', status: 409,
        message: '账号备份刚刚有变化，请重新查看后再保存。',
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid and timed-out responses instead of reporting success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));

    await expect(savePersonalLibraryBackup('test-token', library, 2, 'https://api.example.test'))
      .rejects.toMatchObject({ code: 'invalid_response' });
    await expect(savePersonalLibraryBackup('test-token', library, 2, 'https://api.example.test'))
      .rejects.toMatchObject({ code: 'timeout', message: '连接账号备份超时，请稍后重试。' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a library above 1 MiB before making a request', async () => {
    const oversized = structuredClone(library);
    oversized.words[0]!.meaning = 'x'.repeat(1024 * 1024);

    await expect(savePersonalLibraryBackup('test-token', oversized, 0, 'https://api.example.test'))
      .rejects.toMatchObject({ code: 'backup_too_large', status: 413 });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
