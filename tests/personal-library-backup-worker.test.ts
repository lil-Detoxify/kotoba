import { describe, expect, it, vi } from 'vitest';
import { handlePersonalLibraryBackup } from '../scripts/personal-library-backup.mjs';

interface StoredBackup { revision: number; payload_json: string; updated_at: string }

class BackupDatabase {
  rows = new Map<string, StoredBackup>();
  queries: string[] = [];
  schemaAvailable = true;
  prepare(query: string) {
    this.queries.push(query);
    if (!this.schemaAvailable) throw new Error('no such table: personal_library_backups');
    let parameters: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => { parameters = values; return statement; },
      first: async () => {
        if (!query.startsWith('SELECT')) throw new Error('Unexpected read');
        return this.rows.get(String(parameters[0])) ?? null;
      },
      run: async () => {
        if (query.startsWith('INSERT')) {
          const [userId, revision, payload, updatedAt] = parameters;
          if (this.rows.has(String(userId))) return { success: true, meta: { changes: 0 } };
          this.rows.set(String(userId), { revision: Number(revision), payload_json: String(payload), updated_at: String(updatedAt) });
          return { success: true, meta: { changes: 1 } };
        }
        if (query.startsWith('UPDATE')) {
          const [revision, payload, updatedAt, userId, expectedRevision] = parameters;
          if (this.rows.get(String(userId))?.revision !== expectedRevision) return { success: true, meta: { changes: 0 } };
          this.rows.set(String(userId), { revision: Number(revision), payload_json: String(payload), updated_at: String(updatedAt) });
          return { success: true, meta: { changes: 1 } };
        }
        throw new Error('Unexpected write');
      },
    };
    return statement;
  }
}

const timestamp = '2026-10-12T03:00:00.000Z';
const context = { id: 'context-1', sentence: '明日、友達と会います。', translation: '明天和朋友见面。', sourceTitle: '阅读笔记', sourceUrl: 'https://example.com/story', matchedText: '会います', createdAt: timestamp, updatedAt: timestamp };
function library() {
  return {
    kind: 'kotobud-personal-library', version: 1, exportedAt: timestamp,
    books: [{ id: 'personal-book', title: '阅读词书', description: '', language: 'ja', cover: 'leaf.svg', createdAt: timestamp, updatedAt: timestamp }],
    lessons: [{ id: 'personal-lesson', bookId: 'personal-book', title: '第一课', order: 0 }],
    words: [{ id: 'personal-word', lessonId: 'personal-lesson', term: '会う', reading: '', meaning: '', order: 0, note: '和人见面', partOfSpeech: '动词', accent: '1', rawTerm: '会います', audioTerm: 'あう', audioUrl: 'https://example.com/au.mp3', example: '友達と会います。', exampleReading: 'ともだちとあいます。', exampleTranslation: '和朋友见面。', definitionJa: '人と会う', definitionZh: '见面', senses: [{ meaning: '遇见', definitionJa: '出会う', partOfSpeech: '动词', example: '駅で会いました。', exampleReading: 'えきであいました。', exampleTranslation: '在车站遇见了。' }], readingContexts: [context] }],
    builtinContexts: [{ bookId: 'builtin-book', wordId: 'builtin-word', contexts: [{ ...context, id: 'context-2' }] }],
  };
}

function helpers(userId = 'server-account') {
  return {
    verifyAuthToken: vi.fn(async (request: Request) => request.headers.get('authorization') === 'Bearer valid' ? { userId: 'identity-account' } : null),
    getOrCreateUser: vi.fn(async () => ({ id: userId })),
    json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }),
  };
}

function request(method = 'GET', body?: unknown, authenticated = true) {
  return new Request('https://staging.kotobud.com/api/v1/personal-library/backup', {
    method,
    headers: { ...(authenticated ? { authorization: 'Bearer valid' } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('explicit personal-library account backup', () => {
  it('starts empty, saves content with the server user ID, and round-trips optional details only', async () => {
    const DB = new BackupDatabase();
    const api = helpers();
    expect(await (await handlePersonalLibraryBackup(request(), { DB }, api)).json()).toEqual({ backup: null });
    const content = library();
    const response = await handlePersonalLibraryBackup(request('PUT', {
      expectedRevision: 0, userId: 'body-account', token: 'not-saved',
      library: { ...content, userId: 'not-saved', states: [{ rating: 4 }], logs: [{ correct: true }], preferences: { volume: 50 }, books: content.books.map(book => ({ ...book, password: 'not-saved' })), words: content.words.map(word => ({ ...word, card: { due: timestamp }, token: 'not-saved' })) },
    }), { DB }, api);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.backup).toMatchObject({ revision: 1, library: content });
    expect(DB.rows.has('server-account')).toBe(true);
    expect(DB.rows.has('body-account')).toBe(false);
    expect(DB.rows.has('identity-account')).toBe(false);
    expect(DB.rows.get('server-account')?.payload_json).not.toContain('not-saved');
    expect(await (await handlePersonalLibraryBackup(request(), { DB }, api)).json()).toEqual(result);
    expect(await (await handlePersonalLibraryBackup(request(), { DB }, helpers('other-account'))).json()).toEqual({ backup: null });
    expect(DB.queries.every(query => query.includes('personal_library_backups'))).toBe(true);
  });

  it('updates the same account only at the expected revision and increments its revision', async () => {
    const DB = new BackupDatabase();
    const api = helpers();
    await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 0, library: library() }), { DB }, api);
    const next = library();
    next.words[0].note = '新的个人笔记';
    const response = await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 1, library: next }), { DB }, api);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ backup: { revision: 2, library: next } });
    expect(DB.rows.size).toBe(1);
  });

  it('keeps the current backup on a creation race or stale update', async () => {
    const DB = new BackupDatabase();
    const api = helpers();
    const competing = library();
    competing.words[0].note = '较旧的草稿';
    const responses = await Promise.all([
      handlePersonalLibraryBackup(request('PUT', { expectedRevision: 0, library: library() }), { DB }, api),
      handlePersonalLibraryBackup(request('PUT', { expectedRevision: 0, library: competing }), { DB }, api),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const stored = structuredClone(DB.rows.get('server-account'));
    const conflict = await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 9, library: competing }), { DB }, api);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: 'backup_conflict', backup: { revision: 1 } });
    expect(DB.rows.get('server-account')).toEqual(stored);
  });

  it('reports unavailable storage for missing bindings, missing schema, or an unsuccessful write', async () => {
    const noSchema = new BackupDatabase();
    noSchema.schemaAvailable = false;
    const failedWrite = { prepare: () => ({ bind: () => ({ run: async () => ({ success: false, meta: { changes: 0 } }) }) }) };
    for (const env of [{}, { DB: noSchema }, { DB: failedWrite }]) {
      const response = await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 0, library: library() }), env, helpers());
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: 'backup_unavailable' });
    }
    expect((await handlePersonalLibraryBackup(request(), { DB: noSchema }, helpers())).status).toBe(503);
  });

  it('returns 401 before accessing storage for a visitor without a valid token', async () => {
    const DB = new BackupDatabase();
    const api = helpers();
    const response = await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 0, library: library() }, false), { DB }, api);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'unauthorized' });
    expect(api.getOrCreateUser).not.toHaveBeenCalled();
    expect(DB.queries).toEqual([]);
  });

  it('rejects broken relationships, duplicate IDs, absent fields, and invalid revision without changing a backup', async () => {
    const DB = new BackupDatabase();
    const api = helpers();
    await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 0, library: library() }), { DB }, api);
    const stored = structuredClone(DB.rows.get('server-account'));
    const dangling = library();
    dangling.words[0].lessonId = 'missing-lesson';
    const duplicate = library();
    duplicate.words.push({ ...duplicate.words[0] });
    const overlappingContext = library();
    overlappingContext.builtinContexts[0].wordId = overlappingContext.words[0].id;
    for (const body of [
      { expectedRevision: 1, library: dangling },
      { expectedRevision: 1, library: duplicate },
      { expectedRevision: 1, library: overlappingContext },
      { expectedRevision: 1, library: { ...library(), books: undefined } },
      { expectedRevision: -1, library: library() },
      { library: library() },
    ]) {
      const response = await handlePersonalLibraryBackup(request('PUT', body), { DB }, api);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'invalid_backup' });
    }
    expect(DB.rows.get('server-account')).toEqual(stored);
  });

  it('measures the 1 MiB content limit in UTF-8 bytes and never stores an oversized library', async () => {
    const DB = new BackupDatabase();
    const content = library();
    content.words[0].note = '森'.repeat(350000);
    const response = await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 0, library: content }), { DB }, helpers());
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'backup_too_large', maxBytes: 1048576 });
    expect(DB.rows.size).toBe(0);
  });

  it('allows an explicit empty snapshot at its current revision but does not accept deletion or a missing snapshot', async () => {
    const DB = new BackupDatabase();
    const api = helpers();
    await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 0, library: library() }), { DB }, api);
    const before = structuredClone(DB.rows.get('server-account'));
    expect((await handlePersonalLibraryBackup(request('DELETE'), { DB }, api)).status).toBe(405);
    expect((await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 1 }), { DB }, api)).status).toBe(400);
    expect(DB.rows.get('server-account')).toEqual(before);
    const empty = { kind: 'kotobud-personal-library', version: 1, exportedAt: timestamp, books: [], lessons: [], words: [], builtinContexts: [] };
    const saved = await handlePersonalLibraryBackup(request('PUT', { expectedRevision: 1, library: empty }), { DB }, api);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ backup: { revision: 2, library: empty } });
  });
});
