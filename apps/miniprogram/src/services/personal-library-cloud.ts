import { reactive } from "vue";
import { defaultAuth, defaultNetwork, defaultRepository } from "../adapters";
import type { AuthAdapter, AuthSession, MiniProgramRepositoryContract, NetworkAdapter } from "../adapters/types";
import { validatePersonalLibrary } from "../../../web/src/services/personal-library";
import {
  MAX_LIBRARY_BACKUP_BYTES,
  validateCloudBackup,
} from "../../../web/src/services/personal-library-cloud";
import type { CloudBackup } from "../../../web/src/services/personal-library-cloud";
import {
  exportMiniPersonalLibrary,
  mergeMiniPersonalLibrary,
  previewMiniPersonalLibrary,
} from "./personal-library";
import type {
  ExistingContentPolicy,
  PersonalLibrary,
  PersonalLibraryMergeResult,
  PersonalLibraryPreview,
} from "./personal-library";

const BACKUP_PATH = "/api/v1/personal-library/backup";

export class MiniPersonalLibraryCloudError extends Error {
  constructor(message: string, readonly code: string, readonly status = 0) {
    super(message);
    this.name = "MiniPersonalLibraryCloudError";
  }
}

export interface MiniPersonalLibraryCloudView {
  backup: CloudBackup | null;
  localLibrary: PersonalLibrary;
}

interface AccountContext {
  session: AuthSession;
  key: string;
}

interface ReviewedView extends MiniPersonalLibraryCloudView {
  context: AccountContext;
  revision: number;
}

interface MergeReview {
  policy: ExistingContentPolicy;
  preview: PersonalLibraryPreview;
  revision: number;
}

export interface MiniPersonalLibraryCloudDependencies {
  auth: Pick<AuthAdapter, "getSession">;
  repository: Pick<MiniProgramRepositoryContract, "getActiveKey">;
  network: NetworkAdapter;
  exportLibrary?: (key?: string) => Promise<PersonalLibrary>;
  previewLibrary?: (library: PersonalLibrary, key?: string) => Promise<PersonalLibraryPreview>;
  mergeLibrary?: (
    library: PersonalLibrary,
    policy?: ExistingContentPolicy,
    key?: string,
  ) => Promise<PersonalLibraryMergeResult>;
}

function ownerKey(userId: string): string {
  return `data_user_${userId.trim()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

function errorFromNetwork(error: unknown): MiniPersonalLibraryCloudError {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  if (/backup_conflict|revision[_ -]?conflict|\b409\b|\bconflict\b/u.test(normalized)) {
    return new MiniPersonalLibraryCloudError("账号备份刚刚有变化，请重新查看后再保存。", "backup_conflict", 409);
  }
  if (/backup_too_large|\b413\b/u.test(normalized)) {
    return new MiniPersonalLibraryCloudError("词库内容超过当前账号备份容量，请使用个人词库文件迁移。", "backup_too_large", 413);
  }
  if (/unauthorized|\b401\b/u.test(normalized)) {
    return new MiniPersonalLibraryCloudError("登录状态已过期，请重新登录后再试。", "unauthorized", 401);
  }
  if (/backup_unavailable|db_unavailable/u.test(normalized)) {
    return new MiniPersonalLibraryCloudError("账号备份暂时不可用，请稍后重试。", "backup_unavailable", 503);
  }
  return new MiniPersonalLibraryCloudError("账号备份暂时无法读取或保存，请稍后重试。", "request_failed");
}

function parseBackupResponse(value: unknown): CloudBackup | null {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "backup")) {
    throw new MiniPersonalLibraryCloudError("账号备份服务暂时无法响应，请稍后重试。", "invalid_response");
  }
  try {
    return validateCloudBackup(value.backup);
  } catch (error) {
    throw new MiniPersonalLibraryCloudError(
      error instanceof Error ? error.message : "账号备份内容暂时无法读取，请稍后重试。",
      "invalid_response",
    );
  }
}

function sameLibraryContent(left: PersonalLibrary, right: PersonalLibrary): boolean {
  const withoutExportTime = (library: PersonalLibrary) => ({
    kind: library.kind,
    version: library.version,
    books: library.books,
    lessons: library.lessons,
    words: library.words,
    builtinContexts: library.builtinContexts,
  });
  return JSON.stringify(withoutExportTime(left)) === JSON.stringify(withoutExportTime(right));
}

export function createMiniPersonalLibraryCloudBackup(dependencies: MiniPersonalLibraryCloudDependencies) {
  const state = reactive<{ busy: boolean }>({ busy: false });
  const exportLibrary = dependencies.exportLibrary ?? exportMiniPersonalLibrary;
  const previewLibrary = dependencies.previewLibrary ?? previewMiniPersonalLibrary;
  const mergeLibrary = dependencies.mergeLibrary ?? mergeMiniPersonalLibrary;
  let reviewedView: ReviewedView | null = null;
  let mergeReview: MergeReview | null = null;
  let generation = 0;

  function clearReview(): void {
    reviewedView = null;
    mergeReview = null;
  }

  async function captureContext(): Promise<AccountContext> {
    const session = await dependencies.auth.getSession();
    if (!session?.userId || !session.token) {
      clearReview();
      throw new MiniPersonalLibraryCloudError("请先登录后使用账号备份。", "unauthorized", 401);
    }
    const key = dependencies.repository.getActiveKey();
    if (key !== ownerKey(session.userId)) {
      clearReview();
      throw new MiniPersonalLibraryCloudError("账号数据正在切换，请稍后重新查看。", "account_changed");
    }
    return { session, key };
  }

  async function assertCurrent(context: AccountContext, ticket: number): Promise<void> {
    if (ticket !== generation) {
      throw new MiniPersonalLibraryCloudError("操作已失效，请重新查看账号备份。", "operation_stale");
    }
    const session = await dependencies.auth.getSession();
    if (ticket !== generation) {
      throw new MiniPersonalLibraryCloudError("操作已失效，请重新查看账号备份。", "operation_stale");
    }
    if (dependencies.repository.getActiveKey() !== context.key ||
        session?.userId !== context.session.userId || session?.token !== context.session.token) {
      clearReview();
      throw new MiniPersonalLibraryCloudError("账号已切换或登录状态已变化，请重新查看账号备份。", "account_changed");
    }
  }

  function assertReviewed(context: AccountContext): ReviewedView {
    if (!reviewedView || reviewedView.context.key !== context.key ||
        reviewedView.context.session.userId !== context.session.userId ||
        reviewedView.context.session.token !== context.session.token) {
      throw new MiniPersonalLibraryCloudError("请先手动查看本机和账号备份，再进行保存或合并。", "view_required");
    }
    return reviewedView;
  }

  async function requestBackup(context: AccountContext, method: "GET" | "PUT", data?: unknown): Promise<unknown> {
    try {
      return await dependencies.network.request<unknown>(BACKUP_PATH, {
        method,
        headers: {
          Authorization: `Bearer ${context.session.token}`,
          ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
        },
        ...(data === undefined ? {} : { data }),
        timeout: 30000,
      });
    } catch (error) {
      if (error instanceof MiniPersonalLibraryCloudError) throw error;
      throw errorFromNetwork(error);
    }
  }

  async function view(): Promise<MiniPersonalLibraryCloudView> {
    const ticket = ++generation;
    clearReview();
    state.busy = true;
    try {
      const context = await captureContext();
      const [payload, exportedLibrary] = await Promise.all([
        requestBackup(context, "GET"),
        exportLibrary(context.key),
      ]);
      await assertCurrent(context, ticket);
      const backup = parseBackupResponse(payload);
      const localLibrary = validatePersonalLibrary(exportedLibrary);
      reviewedView = { context, backup, localLibrary, revision: backup?.revision ?? 0 };
      return { backup, localLibrary };
    } finally {
      if (ticket === generation) state.busy = false;
    }
  }

  async function saveDeviceBackup(): Promise<CloudBackup> {
    const ticket = ++generation;
    state.busy = true;
    try {
      const context = await captureContext();
      const reviewed = assertReviewed(context);
      await assertCurrent(context, ticket);
      const currentLibrary = validatePersonalLibrary(await exportLibrary(context.key));
      await assertCurrent(context, ticket);
      if (!sameLibraryContent(currentLibrary, reviewed.localLibrary)) {
        clearReview();
        throw new MiniPersonalLibraryCloudError("本机词库已有变化，请重新查看后再保存。", "local_changed");
      }
      const library = validatePersonalLibrary(currentLibrary);
      if (utf8ByteLength(JSON.stringify(library)) > MAX_LIBRARY_BACKUP_BYTES) {
        throw new MiniPersonalLibraryCloudError("词库内容超过当前账号备份容量，请使用个人词库文件迁移。", "backup_too_large", 413);
      }
      let payload: unknown;
      try {
        payload = await requestBackup(context, "PUT", { expectedRevision: reviewed.revision, library });
      } catch (error) {
        if (error instanceof MiniPersonalLibraryCloudError && error.code === "backup_conflict") clearReview();
        throw error;
      }
      await assertCurrent(context, ticket);
      const saved = parseBackupResponse(payload);
      if (!saved || saved.revision !== reviewed.revision + 1) {
        clearReview();
        throw new MiniPersonalLibraryCloudError("保存结果暂时无法确认，请重新查看账号备份。", "invalid_response");
      }
      clearReview();
      return saved;
    } finally {
      if (ticket === generation) state.busy = false;
    }
  }

  async function previewRestore(policy: ExistingContentPolicy): Promise<PersonalLibraryPreview> {
    const ticket = ++generation;
    state.busy = true;
    mergeReview = null;
    try {
      const context = await captureContext();
      const reviewed = assertReviewed(context);
      if (!reviewed.backup) throw new MiniPersonalLibraryCloudError("这个账号还没有个人词库云备份。", "backup_empty");
      const preview = await previewLibrary(reviewed.backup.library, context.key);
      await assertCurrent(context, ticket);
      mergeReview = { policy, preview, revision: reviewed.revision };
      return preview;
    } finally {
      if (ticket === generation) state.busy = false;
    }
  }

  async function mergeToDevice(policy: ExistingContentPolicy): Promise<PersonalLibraryMergeResult> {
    const ticket = ++generation;
    state.busy = true;
    try {
      const context = await captureContext();
      const reviewed = assertReviewed(context);
      const priorPreview = mergeReview;
      if (!reviewed.backup || !priorPreview || priorPreview.revision !== reviewed.revision || priorPreview.policy !== policy) {
        throw new MiniPersonalLibraryCloudError("请先预览所选合并方式，再确认合并到本机。", "preview_required");
      }
      const currentPreview = await previewLibrary(reviewed.backup.library, context.key);
      await assertCurrent(context, ticket);
      if (JSON.stringify(currentPreview) !== JSON.stringify(priorPreview.preview)) {
        mergeReview = null;
        throw new MiniPersonalLibraryCloudError("本机词库刚有变化，请检查更新后的预览后再合并。", "preview_stale");
      }
      const result = await mergeLibrary(reviewed.backup.library, policy, context.key);
      await assertCurrent(context, ticket);
      clearReview();
      return result;
    } finally {
      if (ticket === generation) state.busy = false;
    }
  }

  function reset(): void {
    generation += 1;
    state.busy = false;
    clearReview();
  }

  return { state, view, saveDeviceBackup, previewRestore, mergeToDevice, clearReview, reset };
}

export const miniPersonalLibraryCloudBackup = createMiniPersonalLibraryCloudBackup({
  auth: defaultAuth,
  repository: defaultRepository,
  network: defaultNetwork,
});
