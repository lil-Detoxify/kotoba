import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('../apps/extension/src/runtime');
  vi.doUnmock('../apps/extension/src/browser');
  vi.resetModules();
  vi.restoreAllMocks();
});

async function loadApi(runtimeCommand: (method: string, args: unknown[], expectedPartitionKey?: string) => unknown) {
  vi.resetModules();
  const browser = {
    runtime: {
      sendMessage: vi.fn(async (request: { method: string; args?: unknown[]; expectedPartitionKey?: string }) => {
        try {
          const transported = JSON.parse(JSON.stringify(request));
          const data = await runtimeCommand(transported.method, transported.args ?? [], transported.expectedPartitionKey);
          return { ok: true, data };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'failure' };
        }
      }),
      getURL: (path: string) => path
    }
  };
  vi.doMock('../apps/extension/src/browser', () => ({ getBrowser: () => browser, isLookupRequest: () => false }));
  return (await import('../apps/extension/src/client')).extensionApi;
}

it('omits an absent quiz reference through Chromium JSON messaging while retaining an explicit reference', async () => {
  const runtimeCommand = vi.fn(async (_method: string, _args: unknown[], _expectedPartitionKey?: string) => snapshot('current', 'local'));
  const api = await loadApi(runtimeCommand); await api.read();
  const word = { id: 'jlpt-n5-w-test', lessonId: 'jlpt-n5-l-1', term: '会う', reading: 'あう', meaning: '见面', order: 1, source: 'textbook' as const, bookTitle: 'JLPT N5 备考词汇', lessonTitle: '第1组' };
  await api.rateLearning(word, 3, 'rating-1', 0, 'new', 500);
  expect(runtimeCommand.mock.calls.at(-1)?.[1]).toEqual([word, 3, 'rating-1', 0, 'new', 500]);
  await api.rateLearning(word, 3, 'rating-2', 0, 'new', 600, 'quiz-reference');
  expect(runtimeCommand.mock.calls.at(-1)?.[1]).toEqual([word, 3, 'rating-2', 0, 'new', 600, 'quiz-reference']);
  await api.rateLearning(word, 3, 'practice-1', 1, 'difficult', 700, undefined, undefined, true);
  expect(runtimeCommand.mock.calls.at(-1)?.[1]).toEqual([word, 3, 'practice-1', 1, 'difficult', 700, null, null, true]);
  await api.rateLearning(word, 3, 'personal-context-1', 0, 'difficult', 800, undefined, undefined, false, 'context-1');
  expect(runtimeCommand.mock.calls.at(-1)?.[1]).toEqual([word, 3, 'personal-context-1', 0, 'difficult', 800, null, null, false, 'context-1']);
});

function snapshot(partitionKey: string, userId: string) {
  return { schema: 1, words: [], logs: [], preferences: {}, learning: {}, syncQueue: [], identity: { partitionKey, userId } };
}

describe('extension client account fence', () => {
  it('does not let an auth status poll replace the cached write partition', async () => {
    const runtimeCommand = vi.fn(async (method: string) => {
      if (method === 'read') return snapshot('account:user-a', 'user-a');
      if (method === 'authStatus') return { activePartitionKey: 'account:user-b', user: { id: 'user-b' } };
      return snapshot('account:user-a', 'user-a');
    });
    const api = await loadApi(runtimeCommand);

    await api.read();
    await api.authStatus();
    await api.setDailyGoal(30);

    expect(runtimeCommand).toHaveBeenLastCalledWith('setDailyGoal', [30], 'account:user-a');
  });

  it('ignores an older read response that arrives after a newer account read', async () => {
    let resolveFirst!: (value: unknown) => void;
    const firstRead = new Promise<unknown>(resolve => { resolveFirst = resolve; });
    const runtimeCommand = vi.fn()
      .mockImplementationOnce(() => firstRead)
      .mockResolvedValueOnce(snapshot('account:user-b', 'user-b'))
      .mockResolvedValue(snapshot('account:user-b', 'user-b'));
    const api = await loadApi(runtimeCommand);

    const oldRead = api.read();
    await api.read();
    resolveFirst(snapshot('account:user-a', 'user-a'));
    await expect(oldRead).rejects.toThrow(/账号已切换/);
    await api.setDailyGoal(40);

    expect(runtimeCommand).toHaveBeenLastCalledWith('setDailyGoal', [40], 'account:user-b');
  });
});
