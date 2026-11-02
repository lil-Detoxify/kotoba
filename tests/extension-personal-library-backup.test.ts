import { describe, expect, it, vi } from 'vitest';
import { PersonalLibraryCloudError, type CloudBackup } from '../apps/web/src/services/personal-library-cloud';
import type { PersonalLibrary } from '../apps/web/src/services/personal-library';
import type { ExtensionAuthSession } from '../apps/extension/src/cloud-client';
import { emptySnapshot, type ExtensionSnapshot, type ExtensionWord } from '../apps/extension/src/model';
import {
  createExtensionPersonalLibraryBackup,
  type ExtensionPersonalLibraryBackupDependencies,
  type PersonalLibraryBackupRepository,
} from '../apps/extension/src/personal-library-backup';

const timestamp = '2026-10-15T09:00:00.000Z';
const account: ExtensionAuthSession = {
  user: { id: 'user-1', email: 'learner@example.test', provider: 'kotobud' },
  token: 'access-token-1',
};
const otherAccount: ExtensionAuthSession = {
  user: { id: 'user-2', email: 'other@example.test', provider: 'kotobud' },
  token: 'access-token-2',
};

const catalog: ExtensionWord[] = [];
const localWord: ExtensionWord = {
  id: 'local-word', bookId: 'local-book', lessonId: 'local-lesson', term: '駅', reading: 'えき', meaning: '车站', order: 1,
  source: 'manual', bookTitle: '本机词书', lessonTitle: '第一课',
};
const remoteWord: ExtensionWord = {
  id: 'remote-word', bookId: 'local-book', lessonId: 'local-lesson', term: '改札', reading: 'かいさつ', meaning: '检票口', order: 2,
  source: 'manual', bookTitle: '本机词书', lessonTitle: '第一课',
};

function makeSnapshot(partitionKey = 'account:user-1'): ExtensionSnapshot {
  const snapshot = emptySnapshot();
  snapshot.identity = { partitionKey, userId: partitionKey.slice('account:'.length) };
  snapshot.learning.books = [{
    id: 'local-book', title: '本机词书', description: '', wordCount: 1, source: 'manual', createdAt: timestamp, updatedAt: timestamp,
  }];
  snapshot.learning.lessons = [{ id: 'local-lesson', bookId: 'local-book', title: '第一课', order: 1 }];
  snapshot.learning.words = [localWord];
  snapshot.learning.userSettings = { userId: snapshot.identity.userId, updatedAt: timestamp, currentBookId: 'local-book' };
  return snapshot;
}

const packageLibrary: PersonalLibrary = {
  kind: 'kotobud-personal-library',
  version: 1,
  exportedAt: timestamp,
  books: [{ id: 'local-book', title: '本机词书', description: '', language: 'ja', createdAt: timestamp, updatedAt: timestamp }],
  lessons: [{ id: 'local-lesson', bookId: 'local-book', title: '第一课', order: 1 }],
  words: [
    { id: 'local-word', lessonId: 'local-lesson', term: '駅', reading: 'えき', meaning: '车站', order: 1 },
    { id: 'remote-word', lessonId: 'local-lesson', term: '改札', reading: 'かいさつ', meaning: '检票口', order: 2 },
  ],
  builtinContexts: [],
};

function cloudBackup(revision: number, library = packageLibrary): CloudBackup {
  return { revision, updatedAt: timestamp, library };
}

function createHarness(overrides: Partial<ExtensionPersonalLibraryBackupDependencies> = {}) {
  let currentSession: ExtensionAuthSession | null = account;
  let currentRepository: PersonalLibraryBackupRepository;
  const snapshot = makeSnapshot();
  const repository = {
    partitionKey: 'account:user-1',
    read: vi.fn(async () => structuredClone(snapshot)),
    mutatePersonalLibrary: vi.fn(async () => structuredClone(snapshot)),
  } satisfies PersonalLibraryBackupRepository;
  const otherRepository = {
    partitionKey: 'account:user-2',
    read: vi.fn(async () => makeSnapshot('account:user-2')),
    mutatePersonalLibrary: vi.fn(async () => makeSnapshot('account:user-2')),
  } satisfies PersonalLibraryBackupRepository;
  currentRepository = repository;
  const dependencies: ExtensionPersonalLibraryBackupDependencies = {
    getSession: async () => currentSession,
    getRepository: async () => currentRepository,
    loadCatalog: async () => catalog,
    baseUrl: 'https://api.example.test',
    fetchBackup: async () => cloudBackup(4),
    saveBackup: async (_token, _library, expectedRevision) => cloudBackup(expectedRevision + 1),
    ...overrides,
  };
  return {
    service: createExtensionPersonalLibraryBackup(dependencies),
    repository,
    otherRepository,
    setSession(value: ExtensionAuthSession | null) { currentSession = value; },
    setRepository(value: PersonalLibraryBackupRepository) { currentRepository = value; },
  };
}

describe('extension personal library backup', () => {
  it('requires a reviewed remote revision before saving and sends that revision', async () => {
    const saveBackup = vi.fn(async (_token: string, _library: PersonalLibrary, revision: number) => cloudBackup(revision + 1));
    const harness = createHarness({ saveBackup });

    await expect(harness.service.save('account:user-1')).rejects.toMatchObject({ code: 'view_required' });
    expect(saveBackup).not.toHaveBeenCalled();

    const view = await harness.service.read('account:user-1');
    expect(view.backup?.revision).toBe(4);
    expect(view.preview).toMatchObject({ newWords: 1, existingWords: 1 });

    const saved = await harness.service.save('account:user-1');
    expect(saveBackup).toHaveBeenCalledWith('access-token-1', expect.objectContaining({ kind: 'kotobud-personal-library' }), 4, 'https://api.example.test');
    expect(saved.backup?.revision).toBe(5);
  });

  it('clears a conflicting review and requires a fresh remote read before retrying', async () => {
    const fetchBackup = vi.fn()
      .mockResolvedValueOnce(cloudBackup(4))
      .mockResolvedValueOnce(cloudBackup(5));
    const saveBackup = vi.fn()
      .mockRejectedValueOnce(new PersonalLibraryCloudError('conflict', 'backup_conflict', 409))
      .mockResolvedValueOnce(cloudBackup(6));
    const harness = createHarness({ fetchBackup, saveBackup });

    await harness.service.read('account:user-1');
    await expect(harness.service.save('account:user-1')).rejects.toMatchObject({ code: 'backup_conflict' });
    await expect(harness.service.save('account:user-1')).rejects.toMatchObject({ code: 'view_required' });

    await harness.service.read('account:user-1');
    await harness.service.save('account:user-1');
    expect(saveBackup.mock.calls.map(call => call[2])).toEqual([4, 5]);
    expect(fetchBackup).toHaveBeenCalledTimes(2);
  });

  it('discards a reviewed merge if the account changes while local data is loading', async () => {
    let releaseCatalog!: (value: ExtensionWord[]) => void;
    let signalCatalogStarted!: () => void;
    const catalogStarted = new Promise<void>(resolve => { signalCatalogStarted = resolve; });
    let loads = 0;
    const loadCatalog = vi.fn(async () => {
      loads++;
      if (loads === 1) return catalog;
      signalCatalogStarted();
      return new Promise<ExtensionWord[]>(resolve => { releaseCatalog = resolve; });
    });
    const harness = createHarness({ loadCatalog });
    await harness.service.read('account:user-1');

    const merge = harness.service.merge('account:user-1', 'keep-local');
    await catalogStarted;
    harness.setSession(otherAccount);
    harness.setRepository(harness.otherRepository);
    releaseCatalog(catalog);

    await expect(merge).rejects.toMatchObject({ code: 'account_changed' });
    expect(harness.repository.mutatePersonalLibrary).not.toHaveBeenCalled();
  });

  it('delegates the reviewed package and selected policy to the account repository', async () => {
    const resultSnapshot = makeSnapshot();
    resultSnapshot.learning.words.push(remoteWord);
    const mutatePersonalLibrary = vi.fn(async () => resultSnapshot);
    const harness = createHarness();
    harness.repository.mutatePersonalLibrary.mockImplementation(mutatePersonalLibrary);
    await harness.service.read('account:user-1');

    const result = await harness.service.merge('account:user-1', 'use-package');

    expect(result).toBe(resultSnapshot);
    expect(mutatePersonalLibrary).toHaveBeenCalledWith({ type: 'merge-package', library: packageLibrary, policy: 'use-package' }, catalog);
  });
});
