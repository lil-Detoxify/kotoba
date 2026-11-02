import {
  previewPersonalLibraryMerge,
  type ExistingContentPolicy,
  type PersonalLibrary,
  type PersonalLibraryPreview,
} from '../../web/src/services/personal-library';
import {
  fetchPersonalLibraryBackup,
  savePersonalLibraryBackup,
  type CloudBackup,
  validateCloudBackup,
} from '../../web/src/services/personal-library-cloud';
import type { ExtensionAuthSession } from './cloud-client';
import type { ExtensionSnapshot, ExtensionWord } from './model';
import {
  exportExtensionPersonalLibrary,
  extensionBuiltinBookIds,
  personalLibraryData,
  type PersonalLibraryMutation,
} from './personal-library';

export interface PersonalBackupView {
  backup: CloudBackup | null;
  local: PersonalLibrary;
  preview: PersonalLibraryPreview | null;
}

export interface PersonalLibraryBackupRepository {
  readonly partitionKey: string;
  read(): Promise<ExtensionSnapshot>;
  mutatePersonalLibrary(action: PersonalLibraryMutation, catalog: ExtensionWord[]): Promise<ExtensionSnapshot>;
}

export interface ExtensionPersonalLibraryBackupDependencies {
  getSession(): Promise<ExtensionAuthSession | null>;
  getRepository(): Promise<PersonalLibraryBackupRepository>;
  loadCatalog(): Promise<ExtensionWord[]>;
  baseUrl: string;
  fetchBackup?: (token: string, baseUrl: string) => Promise<CloudBackup | null>;
  saveBackup?: (token: string, library: PersonalLibrary, expectedRevision: number, baseUrl: string) => Promise<CloudBackup>;
}

interface AccountContext {
  ownerId: string;
  partitionKey: string;
}

interface ReviewedBackup extends PersonalBackupView {
  context: AccountContext;
  revision: number;
}

interface LocalLibraryState {
  catalog: ExtensionWord[];
  library: PersonalLibrary;
  snapshot: ExtensionSnapshot;
  repository: PersonalLibraryBackupRepository;
}

export class ExtensionPersonalLibraryBackupError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ExtensionPersonalLibraryBackupError';
  }
}

const accountChangedMessage = '账号已切换或登录状态已变化，请重新查看账号备份。';
const signInMessage = '请先登录后使用账号备份。';
const reviewRequiredMessage = '请先手动查看本机和账号备份，再进行保存或合并。';

function stale(ticket: number, currentGeneration: number): void {
  if (ticket !== currentGeneration) {
    throw new ExtensionPersonalLibraryBackupError('操作已失效，请重新查看账号备份。', 'operation_stale');
  }
}

function partitionFor(session: ExtensionAuthSession | null): string | null {
  const id = session?.user?.id;
  return typeof id === 'string' && id.trim() ? `account:${id}` : null;
}

function sameLibraryContent(left: PersonalLibrary, right: PersonalLibrary): boolean {
  const content = (library: PersonalLibrary) => ({
    kind: library.kind,
    version: library.version,
    books: library.books,
    lessons: library.lessons,
    words: library.words,
    builtinContexts: library.builtinContexts,
  });
  return JSON.stringify(content(left)) === JSON.stringify(content(right));
}

function isConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; status?: unknown };
  return value.code === 'backup_conflict' || value.status === 409;
}

function backupError(message: string, code: string): ExtensionPersonalLibraryBackupError {
  return new ExtensionPersonalLibraryBackupError(message, code);
}

export function createExtensionPersonalLibraryBackup(dependencies: ExtensionPersonalLibraryBackupDependencies) {
  const fetchBackup = dependencies.fetchBackup ?? fetchPersonalLibraryBackup;
  const saveBackup = dependencies.saveBackup ?? savePersonalLibraryBackup;
  let reviewed: ReviewedBackup | null = null;
  let generation = 0;

  function clearReview(): void {
    reviewed = null;
  }

  async function captureContext(expectedPartitionKey: string, ticket: number): Promise<AccountContext> {
    const session = await dependencies.getSession();
    stale(ticket, generation);
    const ownerId = session?.user?.id;
    if (!ownerId || !session.token) {
      clearReview();
      throw backupError(signInMessage, 'unauthorized');
    }
    const context = { ownerId, partitionKey: expectedPartitionKey };
    if (partitionFor(session) !== expectedPartitionKey) {
      clearReview();
      throw backupError(accountChangedMessage, 'account_changed');
    }
    await assertCurrent(context, ticket);
    return context;
  }

  async function assertCurrent(context: AccountContext, ticket: number): Promise<{ session: ExtensionAuthSession; repository: PersonalLibraryBackupRepository }> {
    stale(ticket, generation);
    const session = await dependencies.getSession();
    stale(ticket, generation);
    if (!session?.user?.id || !session.token || session.user.id !== context.ownerId || partitionFor(session) !== context.partitionKey) {
      clearReview();
      throw backupError(accountChangedMessage, 'account_changed');
    }

    let repository: PersonalLibraryBackupRepository;
    try {
      repository = await dependencies.getRepository();
    } catch (error) {
      stale(ticket, generation);
      const confirmedSession = await dependencies.getSession();
      stale(ticket, generation);
      if (!confirmedSession?.user?.id || !confirmedSession.token || confirmedSession.user.id !== context.ownerId || partitionFor(confirmedSession) !== context.partitionKey) {
        clearReview();
        throw backupError(accountChangedMessage, 'account_changed');
      }
      throw error;
    }
    stale(ticket, generation);
    if (repository.partitionKey !== context.partitionKey) {
      clearReview();
      throw backupError(accountChangedMessage, 'account_changed');
    }

    // Repository acquisition may restore or switch the active account. Check
    // the vault once more before returning a token or allowing a local write.
    const confirmedSession = await dependencies.getSession();
    stale(ticket, generation);
    if (!confirmedSession?.user?.id || !confirmedSession.token || confirmedSession.user.id !== context.ownerId || partitionFor(confirmedSession) !== context.partitionKey) {
      clearReview();
      throw backupError(accountChangedMessage, 'account_changed');
    }
    return { session: confirmedSession, repository };
  }

  async function fenced<T>(operation: () => Promise<T>, context: AccountContext, ticket: number): Promise<T> {
    let value: T;
    try {
      value = await operation();
    } catch (error) {
      await assertCurrent(context, ticket);
      throw error;
    }
    stale(ticket, generation);
    await assertCurrent(context, ticket);
    return value;
  }

  function requireReviewed(context: AccountContext): ReviewedBackup {
    if (!reviewed || reviewed.context.ownerId !== context.ownerId || reviewed.context.partitionKey !== context.partitionKey) {
      throw backupError(reviewRequiredMessage, 'view_required');
    }
    return reviewed;
  }

  async function readLocal(context: AccountContext, ticket: number): Promise<LocalLibraryState> {
    const catalog = await fenced(() => dependencies.loadCatalog(), context, ticket);
    let current = await assertCurrent(context, ticket);
    const snapshot = await fenced(() => current.repository.read(), context, ticket);
    current = await assertCurrent(context, ticket);
    const library = exportExtensionPersonalLibrary(snapshot, catalog);
    return { catalog, library, snapshot, repository: current.repository };
  }

  function previewFor(snapshot: ExtensionSnapshot, catalog: ExtensionWord[], library: PersonalLibrary): PersonalLibraryPreview {
    return previewPersonalLibraryMerge(
      personalLibraryData(snapshot, catalog),
      library,
      extensionBuiltinBookIds(catalog),
    );
  }

  async function read(expectedPartitionKey: string): Promise<PersonalBackupView> {
    const ticket = ++generation;
    clearReview();
    const context = await captureContext(expectedPartitionKey, ticket);
    const beforeRequest = await assertCurrent(context, ticket);
    const backup = validateCloudBackup(await fenced(
      () => fetchBackup(beforeRequest.session.token, dependencies.baseUrl),
      context,
      ticket,
    ));
    const localState = await readLocal(context, ticket);
    const preview = backup ? previewFor(localState.snapshot, localState.catalog, backup.library) : null;
    const view: PersonalBackupView = { backup, local: localState.library, preview };
    reviewed = { ...view, context, revision: backup?.revision ?? 0 };
    return view;
  }

  async function save(expectedPartitionKey: string): Promise<PersonalBackupView> {
    const ticket = ++generation;
    const context = await captureContext(expectedPartitionKey, ticket);
    const currentReview = requireReviewed(context);
    const localState = await readLocal(context, ticket);
    if (!sameLibraryContent(localState.library, currentReview.local)) {
      clearReview();
      throw backupError('本机词库已有变化，请重新查看后再保存。', 'local_changed');
    }

    const beforeRequest = await assertCurrent(context, ticket);
    let saved: CloudBackup;
    try {
      saved = await fenced(
        () => saveBackup(beforeRequest.session.token, localState.library, currentReview.revision, dependencies.baseUrl),
        context,
        ticket,
      );
    } catch (error) {
      if (isConflict(error)) clearReview();
      throw error;
    }
    try {
      const validated = validateCloudBackup(saved);
      if (!validated) throw new Error('missing backup');
      saved = validated;
    } catch {
      clearReview();
      throw backupError('保存结果暂时无法确认，请重新查看账号备份。', 'invalid_response');
    }
    if (saved.revision !== currentReview.revision + 1) {
      clearReview();
      throw backupError('保存结果暂时无法确认，请重新查看账号备份。', 'invalid_response');
    }

    const view: PersonalBackupView = {
      backup: saved,
      local: localState.library,
      preview: previewFor(localState.snapshot, localState.catalog, saved.library),
    };
    reviewed = { ...view, context, revision: saved.revision };
    return view;
  }

  async function merge(expectedPartitionKey: string, policy: ExistingContentPolicy): Promise<ExtensionSnapshot> {
    if (policy !== 'keep-local' && policy !== 'use-package') {
      throw backupError('请选择有效的词条合并方式。', 'invalid_policy');
    }
    const ticket = ++generation;
    const context = await captureContext(expectedPartitionKey, ticket);
    const currentReview = requireReviewed(context);
    const backup = currentReview.backup;
    if (!backup || !currentReview.preview) {
      throw backupError('这个账号还没有个人词库云备份。', 'backup_empty');
    }

    const localState = await readLocal(context, ticket);
    if (!sameLibraryContent(localState.library, currentReview.local)) {
      clearReview();
      throw backupError('本机词库刚有变化，请重新查看账号备份后再合并。', 'local_changed');
    }
    const currentPreview = previewFor(localState.snapshot, localState.catalog, backup.library);
    if (JSON.stringify(currentPreview) !== JSON.stringify(currentReview.preview)) {
      clearReview();
      throw backupError('本机词库刚有变化，请重新查看账号备份后再合并。', 'preview_stale');
    }

    const ready = await assertCurrent(context, ticket);
    const result = await fenced(() => ready.repository.mutatePersonalLibrary({
      type: 'merge-package',
      library: backup.library,
      policy,
    }, localState.catalog), context, ticket);
    clearReview();
    return result;
  }

  return { read, save, merge };
}
