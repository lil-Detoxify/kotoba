import { ExtensionRepository } from './repository';
import { getBrowser } from './browser';
import { ExtensionCloudCoordinator } from './cloud';
import { ExtensionAuthHttpClient, IndexedDbExtensionAuthVault, createWorkerSyncClient, defaultExtensionApiBase } from './cloud-client';
import { createExtensionPersonalLibraryBackup } from './personal-library-backup';
import type { PersonalLibraryMutation } from './personal-library';
import type { ExistingContentPolicy } from '../../web/src/services/personal-library';
import type { ExtensionWord } from './model';

const browser = getBrowser();
const databaseName = browser ? 'kotobud-extension-v1' : 'kotobud-extension-preview-v1';
const repositories = new Map<string, ExtensionRepository>();
let activePartition = 'current';
function fixedRepository(partitionKey: string): ExtensionRepository {
  let repo = repositories.get(partitionKey);
  if (!repo) { repo = new ExtensionRepository(databaseName, partitionKey); repositories.set(partitionKey, repo); }
  return repo;
}
const baseUrl = defaultExtensionApiBase(Boolean(browser));
const authVault = new IndexedDbExtensionAuthVault(browser ? 'kotobud-extension-auth-v1' : 'kotobud-extension-preview-auth-v1');
let catalogRequest: Promise<ExtensionWord[]> | undefined;
function loadCatalog(): Promise<ExtensionWord[]> {
  if (!catalogRequest) catalogRequest = (async () => {
    const response = await fetch(browser ? browser.runtime.getURL('data/catalog.json') : '/data/catalog.json');
    if (!response.ok) throw new Error('教材词库暂时无法读取，请重试。');
    return response.json();
  })().catch(error => { catalogRequest = undefined; throw error; });
  return catalogRequest;
}
const coordinator = new ExtensionCloudCoordinator({
  auth: new ExtensionAuthHttpClient({ baseUrl, vault: authVault }),
  sync: createWorkerSyncClient(baseUrl),
  getActiveRepository: () => fixedRepository(activePartition),
  getRepository: fixedRepository,
  activatePartition: async (partitionKey: string) => { activePartition = partitionKey; },
  loadCatalog,
});
const personalBackup = createExtensionPersonalLibraryBackup({
  getSession: () => authVault.read(),
  getRepository,
  loadCatalog,
  baseUrl,
});

const writes = new Set([
  'save', 'remove', 'rate', 'setMotion', 'getLearningQueue', 'rateLearning', 'setLearningFlags',
  'recordQuizAttempt', 'importCustomBook', 'setDailyGoal', 'setVoice', 'setExerciseType', 'setSelectedBookIds',
]);
export async function getRepository(): Promise<ExtensionRepository> {
  await coordinator.restore();
  return fixedRepository(activePartition);
}

/** Background and H5 preview use the same account barrier and fixed-key repositories. */
export async function command(method: string, args: unknown[] = [], expectedPartitionKey?: string): Promise<unknown> {
  if (!Array.isArray(args) || args.length > 10) throw new Error('扩展请求参数无效。');
  await coordinator.restore();
  switch (method) {
    case 'authStatus': return coordinator.authStatus();
    case 'checkAccount': return coordinator.checkAccount(args[0] as string);
    case 'sendCode': return coordinator.sendCode(args[0] as string);
    case 'login': return coordinator.login(args[0] as string, args[1] as string);
    case 'register': return coordinator.register(args[0] as string, args[1] as string, args[2] as string, typeof args[3] === 'string' ? args[3] : '', args[4] as 'register' | 'legacy_upgrade');
    case 'logout': return coordinator.logout();
    case 'sync': return coordinator.sync(args[0] as { expectedPartitionKey: string; mergeGuest?: boolean });
  }
  if (['mutatePersonalLibrary', 'readPersonalBackup', 'savePersonalBackup', 'mergePersonalBackup'].includes(method)) {
    if (!expectedPartitionKey || expectedPartitionKey !== activePartition) throw new Error('账号已切换，请重新载入后再操作。');
    if (method === 'readPersonalBackup') return personalBackup.read(expectedPartitionKey);
    if (method === 'savePersonalBackup') return personalBackup.save(expectedPartitionKey);
    if (method === 'mergePersonalBackup') return personalBackup.merge(expectedPartitionKey, args[0] as ExistingContentPolicy);
    const catalog = await loadCatalog();
    if (expectedPartitionKey !== activePartition) throw new Error('账号已切换，请重新载入后再操作。');
    const repo = fixedRepository(activePartition);
    const result = await repo.mutatePersonalLibrary(args[0] as PersonalLibraryMutation, catalog);
    if (expectedPartitionKey !== activePartition) throw new Error('账号已切换，请重新载入后再操作。');
    return result;
  }
  if (method !== 'read' && !writes.has(method)) throw new Error('不支持的扩展操作。');
  const repo = fixedRepository(activePartition);
  if (method !== 'read' && expectedPartitionKey !== repo.partitionKey) throw new Error('账号已切换，请重新载入后再操作。');
  const invoke = (repo as unknown as Record<string, (...values: unknown[]) => Promise<unknown>>)[method];
  const result = await invoke.apply(repo, args);
  if (activePartition !== repo.partitionKey) throw new Error('账号已切换，请重新载入后再操作。');
  // Persisted outbox survives worker suspension and failed uploads; retries retain event IDs.
  if (writes.has(method) && method !== 'getLearningQueue' && repo.partitionKey !== 'current') {
    void coordinator.sync({ expectedPartitionKey: repo.partitionKey }).catch(() => undefined);
  }
  return result;
}
