<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useApp } from '../store';
import {
  previewPersonalLibraryMerge,
  summarizePersonalLibrary,
  type ExistingContentPolicy,
  type PersonalLibrary,
  type PersonalLibraryMergeResult,
  type PersonalLibraryPreview,
  type PersonalLibrarySummary,
} from '../services/personal-library';
import type { CloudBackup } from '../services/personal-library-cloud';

type PanelMode = 'none' | 'view' | 'prepare';
type RemoteStatus = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';
type OperationKind = 'view' | 'prepare' | 'save' | 'restore';

const app = useApp();
const panelMode = ref<PanelMode>('none');
const remoteStatus = ref<RemoteStatus>('idle');
const operationBusy = ref(false);
const operationKind = ref<OperationKind | null>(null);
const backup = shallowRef<CloudBackup | null>(null);
const localSnapshot = shallowRef<PersonalLibrary | null>(null);
const mergePreview = shallowRef<PersonalLibraryPreview | null>(null);
const mergeResult = shallowRef<PersonalLibraryMergeResult | null>(null);
const policy = ref<ExistingContentPolicy>('keep-local');
const errorMessage = ref('');
const successMessage = ref('');
const revisionConflict = ref(false);
let generation = 0;

const localSnapshotSummary = computed<PersonalLibrarySummary | null>(() =>
  localSnapshot.value ? summarizePersonalLibrary(localSnapshot.value) : null,
);
const backupSummary = computed<PersonalLibrarySummary | null>(() =>
  backup.value ? summarizePersonalLibrary(backup.value.library) : null,
);
const hasCloudContent = computed(() => backupSummary.value ? hasContent(backupSummary.value) : false);
const localIsEmpty = computed(() => localSnapshotSummary.value ? !hasContent(localSnapshotSummary.value) : false);
const backupUpdatedAt = computed(() => {
  const value = backup.value?.updatedAt;
  if (!value) return '时间不可用';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
});

function hasContent(summary: PersonalLibrarySummary): boolean {
  return summary.bookCount > 0 || summary.lessonCount > 0 || summary.wordCount > 0 || summary.contextCount > 0;
}

function resetForAccountChange(): void {
  generation++;
  panelMode.value = 'none';
  remoteStatus.value = 'idle';
  operationBusy.value = false;
  operationKind.value = null;
  backup.value = null;
  localSnapshot.value = null;
  mergePreview.value = null;
  mergeResult.value = null;
  policy.value = 'keep-local';
  errorMessage.value = '';
  successMessage.value = '';
  revisionConflict.value = false;
}

watch(() => app.currentUser?.id ?? null, resetForAccountChange, { flush: 'sync' });
onBeforeUnmount(() => { generation++; });

function accountIdOrPrompt(): string | null {
  const userId = app.currentUser?.id;
  if (!userId) {
    app.showLoginModal = true;
    return null;
  }
  return userId;
}

function beginOperation(kind: OperationKind, userId: string): number | null {
  if (operationBusy.value || app.busy || app.currentUser?.id !== userId) return null;
  generation++;
  operationBusy.value = true;
  operationKind.value = kind;
  errorMessage.value = '';
  successMessage.value = '';
  return generation;
}

function isCurrent(ticket: number, userId: string): boolean {
  return ticket === generation && app.currentUser?.id === userId;
}

function finishOperation(ticket: number, userId: string): void {
  if (!isCurrent(ticket, userId)) return;
  operationBusy.value = false;
  operationKind.value = null;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isRevisionConflict(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const value = error as { status?: unknown; code?: unknown; response?: { status?: unknown } };
    if (value.status === 409 || value.response?.status === 409 || value.code === 409) return true;
    if (typeof value.code === 'string' && /revision[_ -]?conflict|\bconflict\b/iu.test(value.code)) return true;
  }
  return /\b409\b|revision[_ -]?conflict|\bconflict\b|版本冲突|备份已更新/iu.test(error instanceof Error ? error.message : String(error));
}

function clearReviewState(): void {
  mergePreview.value = null;
  mergeResult.value = null;
  policy.value = 'keep-local';
  revisionConflict.value = false;
}

async function viewAccountBackup(): Promise<void> {
  const userId = accountIdOrPrompt();
  if (!userId) return;
  const ticket = beginOperation('view', userId);
  if (ticket === null) return;
  panelMode.value = 'view';
  remoteStatus.value = 'loading';
  backup.value = null;
  localSnapshot.value = null;
  clearReviewState();
  try {
    const result = await app.fetchPersonalLibraryBackup();
    if (!isCurrent(ticket, userId)) return;
    if (result === undefined) {
      resetForAccountChange();
      return;
    }
    backup.value = result;
    remoteStatus.value = result ? 'loaded' : 'empty';
  } catch (error) {
    if (!isCurrent(ticket, userId)) return;
    remoteStatus.value = 'error';
    errorMessage.value = errorText(error, '读取账号备份失败，请重试。');
  } finally {
    finishOperation(ticket, userId);
  }
}

async function prepareDeviceBackup(): Promise<void> {
  const userId = accountIdOrPrompt();
  if (!userId) return;
  if (!app.ready) {
    panelMode.value = 'prepare';
    errorMessage.value = '这台设备的词库还在载入，请稍后再准备备份。';
    return;
  }
  const ticket = beginOperation('prepare', userId);
  if (ticket === null) return;
  panelMode.value = 'prepare';
  remoteStatus.value = 'loading';
  backup.value = null;
  localSnapshot.value = null;
  clearReviewState();
  try {
    const latest = await app.fetchPersonalLibraryBackup();
    if (!isCurrent(ticket, userId)) return;
    if (latest === undefined) {
      resetForAccountChange();
      return;
    }
    const snapshot = app.preparePersonalLibraryBackup();
    if (!isCurrent(ticket, userId)) return;
    backup.value = latest;
    localSnapshot.value = snapshot;
    remoteStatus.value = latest ? 'loaded' : 'empty';
  } catch (error) {
    if (!isCurrent(ticket, userId)) return;
    remoteStatus.value = 'error';
    errorMessage.value = errorText(error, '准备账号备份失败，请重试。');
  } finally {
    finishOperation(ticket, userId);
  }
}

function previewRestore(): void {
  const userId = accountIdOrPrompt();
  if (!userId || !backup.value || !app.ready) return;
  errorMessage.value = '';
  successMessage.value = '';
  mergeResult.value = null;
  policy.value = 'keep-local';
  try {
    mergePreview.value = previewPersonalLibraryMerge(
      app.data,
      backup.value.library,
      app.metaBooks.map(book => book.id),
    );
  } catch (error) {
    mergePreview.value = null;
    errorMessage.value = errorText(error, '无法预览这份账号备份，请稍后重试。');
  }
}

async function mergeToDevice(): Promise<void> {
  const userId = accountIdOrPrompt();
  const cloudBackup = backup.value;
  const displayedPreview = mergePreview.value;
  if (!userId || !cloudBackup || !displayedPreview || !app.ready) return;
  const ticket = beginOperation('restore', userId);
  if (ticket === null) return;
  try {
    const currentPreview = previewPersonalLibraryMerge(
      app.data,
      cloudBackup.library,
      app.metaBooks.map(book => book.id),
    );
    if (JSON.stringify(currentPreview) !== JSON.stringify(displayedPreview)) {
      if (isCurrent(ticket, userId)) {
        mergePreview.value = currentPreview;
        errorMessage.value = '这台设备的词库刚有变化，请检查更新后的预览后再合并。';
      }
      return;
    }
    const result = await app.importPersonalLibrary(cloudBackup.library, policy.value, userId);
    if (!isCurrent(ticket, userId)) return;
    if (result === undefined) {
      resetForAccountChange();
      return;
    }
    mergeResult.value = result;
    successMessage.value = '账号备份已合并到这台设备。学习进度、当前课和评分保持原样。';
  } catch (error) {
    if (!isCurrent(ticket, userId)) return;
    errorMessage.value = errorText(error, '合并账号备份失败，请检查后重试。');
  } finally {
    finishOperation(ticket, userId);
  }
}

async function saveDeviceBackup(): Promise<void> {
  const userId = accountIdOrPrompt();
  const snapshot = localSnapshot.value;
  if (!userId || !snapshot || revisionConflict.value) return;
  const ticket = beginOperation('save', userId);
  if (ticket === null) return;
  try {
    const saved = await app.savePersonalLibraryBackup(snapshot, backup.value?.revision ?? 0, userId);
    if (!isCurrent(ticket, userId)) return;
    if (saved === undefined) {
      resetForAccountChange();
      return;
    }
    backup.value = saved;
    remoteStatus.value = 'loaded';
    panelMode.value = 'view';
    localSnapshot.value = null;
    clearReviewState();
    successMessage.value = '已保存，账号词库云备份已更新。';
  } catch (error) {
    if (!isCurrent(ticket, userId)) return;
    if (isRevisionConflict(error)) {
      backup.value = null;
      localSnapshot.value = null;
      remoteStatus.value = 'idle';
      revisionConflict.value = true;
      errorMessage.value = '账号备份已更新。请重新查看账号备份并确认内容后，再次保存。';
    } else {
      errorMessage.value = errorText(error, '保存账号备份失败，请重试。');
    }
  } finally {
    finishOperation(ticket, userId);
  }
}

function summaryLine(summary: PersonalLibrarySummary): string {
  return `${summary.bookCount} 本词书 · ${summary.lessonCount} 课次 · ${summary.wordCount} 词 · ${summary.contextCount} 条原句`;
}
</script>

<template>
  <section class="personal-library-cloud-backup" aria-labelledby="personal-library-cloud-backup-heading" :aria-busy="operationBusy">
    <div class="cloud-backup-heading">
      <div>
        <h3 id="personal-library-cloud-backup-heading">个人词库云备份</h3>
        <p>登录同一账号后，可在另一台设备取回自建词书、例句、笔记和收藏原句。此处由你手动管理备份；学习进度、当前课和评分保持原样。</p>
      </div>
    </div>

    <template v-if="app.currentUser">
      <div class="cloud-backup-device-summary" aria-label="这台设备的个人词库内容">
        <span class="cloud-backup-label">这台设备</span>
        <dl class="cloud-backup-counts">
          <div><dt>词书</dt><dd>{{ app.personalLibrarySummary.bookCount }}</dd></div>
          <div><dt>课次</dt><dd>{{ app.personalLibrarySummary.lessonCount }}</dd></div>
          <div><dt>词条</dt><dd>{{ app.personalLibrarySummary.wordCount }}</dd></div>
          <div><dt>原句</dt><dd>{{ app.personalLibrarySummary.contextCount }}</dd></div>
        </dl>
      </div>

      <div class="cloud-backup-actions">
        <button type="button" :disabled="operationBusy || app.busy" @click="viewAccountBackup">
          {{ operationBusy && operationKind === 'view' ? '正在查看…' : '查看账号备份' }}
        </button>
        <button type="button" class="cloud-backup-primary" :disabled="operationBusy || app.busy || !app.ready" @click="prepareDeviceBackup">
          {{ operationBusy && operationKind === 'prepare' ? '正在准备…' : '备份这台设备' }}
        </button>
      </div>

      <p v-if="!app.ready" class="cloud-backup-note" role="status">本机词库载入完成后即可准备备份。</p>
      <p v-if="successMessage" class="cloud-backup-message cloud-backup-message--success" role="status" aria-live="polite">{{ successMessage }}</p>

      <div v-if="panelMode === 'view'" class="cloud-backup-panel">
        <p v-if="remoteStatus === 'loading'" class="cloud-backup-note" role="status" aria-live="polite">正在读取账号备份…</p>
        <div v-else-if="remoteStatus === 'empty'" class="cloud-backup-empty">
          <strong>这个账号还没有个人词库云备份。</strong>
          <p>选择“备份这台设备”后，可以把当前显示的个人词库保存到账号。</p>
        </div>
        <template v-else-if="remoteStatus === 'loaded' && backup && backupSummary">
          <div class="cloud-backup-remote-heading">
            <strong>账号备份</strong>
            <time :datetime="backup.updatedAt">更新时间：{{ backupUpdatedAt }}</time>
          </div>
          <p class="cloud-backup-summary">{{ summaryLine(backupSummary) }}</p>
          <div class="cloud-backup-actions cloud-backup-actions--compact">
            <button type="button" :disabled="operationBusy || app.busy || !app.ready" @click="previewRestore">预览恢复</button>
          </div>

          <div v-if="mergePreview" class="cloud-backup-review">
            <h4>合并预览</h4>
            <dl class="cloud-backup-counts cloud-backup-counts--details">
              <div><dt>新增词书</dt><dd>{{ mergePreview.newBooks }}</dd></div>
              <div><dt>新增课次</dt><dd>{{ mergePreview.newLessons }}</dd></div>
              <div><dt>新增词条</dt><dd>{{ mergePreview.newWords }}</dd></div>
              <div><dt>已有词条</dt><dd>{{ mergePreview.existingWords }}</dd></div>
              <div><dt>新增原句</dt><dd>{{ mergePreview.newContexts }}</dd></div>
              <div><dt>已有原句</dt><dd>{{ mergePreview.existingContexts }}</dd></div>
            </dl>
            <label class="cloud-backup-policy" for="personal-library-merge-policy">
              已有内容不一致时
              <select id="personal-library-merge-policy" v-model="policy" :disabled="operationBusy || app.busy" aria-describedby="personal-library-merge-policy-help">
                <option value="keep-local">保留这台设备已有内容（默认）</option>
                <option value="use-package">使用账号备份中的内容</option>
              </select>
            </label>
            <p id="personal-library-merge-policy-help" class="cloud-backup-note">选择使用账号备份，会替换这台设备中已有的词书、课次、词条或原句内容。</p>
            <p class="cloud-backup-note">合并只添加或更新个人词库内容，不会更改学习状态、当前课或评分。</p>
            <div class="cloud-backup-actions cloud-backup-actions--compact">
              <button type="button" class="cloud-backup-primary" :disabled="operationBusy || app.busy || !app.ready" @click="mergeToDevice">
                {{ operationBusy && operationKind === 'restore' ? '正在合并…' : '合并到这台设备' }}
              </button>
            </div>
            <p v-if="mergeResult" class="cloud-backup-result" role="status" aria-live="polite">
              已完成：新增 {{ mergeResult.newBooks }} 本词书、{{ mergeResult.newLessons }} 课次、{{ mergeResult.newWords }} 个词条和 {{ mergeResult.newContexts }} 条原句；已有 {{ mergeResult.existingWords }} 个词条、{{ mergeResult.existingContexts }} 条原句按所选方式处理。
            </p>
          </div>
        </template>
        <p v-if="errorMessage" class="cloud-backup-message cloud-backup-message--error" role="alert">{{ errorMessage }}</p>
      </div>

      <div v-if="panelMode === 'prepare'" class="cloud-backup-panel">
        <p v-if="remoteStatus === 'loading'" class="cloud-backup-note" role="status" aria-live="polite">正在读取账号备份并准备这台设备的词库…</p>
        <div v-if="revisionConflict" class="cloud-backup-actions cloud-backup-actions--compact">
          <button type="button" :disabled="operationBusy || app.busy || !app.ready" @click="prepareDeviceBackup">重新查看备份并准备</button>
        </div>
        <template v-else-if="localSnapshot && localSnapshotSummary">
          <div class="cloud-backup-snapshot-grid">
            <div>
              <span class="cloud-backup-label">准备保存到账号</span>
              <p class="cloud-backup-summary">{{ summaryLine(localSnapshotSummary) }}</p>
            </div>
            <div>
              <span class="cloud-backup-label">当前账号备份</span>
              <p class="cloud-backup-summary">{{ backupSummary ? summaryLine(backupSummary) : '尚无备份' }}</p>
            </div>
          </div>
          <p class="cloud-backup-note">确认后会用这台设备显示的词库更新账号云端快照。</p>
          <p v-if="localIsEmpty && hasCloudContent" class="cloud-backup-message cloud-backup-message--warning" role="note">
            当前设备没有个人内容，覆盖后账号备份将为空。
          </p>
          <div class="cloud-backup-actions cloud-backup-actions--compact">
            <button type="button" class="cloud-backup-primary" :disabled="operationBusy || app.busy || !app.ready" @click="saveDeviceBackup">
              {{ operationBusy && operationKind === 'save' ? '正在保存…' : backup ? '覆盖账号备份' : '保存账号备份' }}
            </button>
          </div>
        </template>
        <p v-if="errorMessage" class="cloud-backup-message cloud-backup-message--error" role="alert">{{ errorMessage }}</p>
      </div>
    </template>

    <div v-else class="cloud-backup-guest">
      <p>登录后可在同一账号的其他设备取回自建词书、例句、笔记和收藏原句。</p>
      <button type="button" class="cloud-backup-primary" @click="app.showLoginModal = true">登录账号</button>
    </div>
  </section>
</template>

<style scoped>
.personal-library-cloud-backup {
  margin-top: 16px;
  padding-top: 17px;
  border-top: 1px solid var(--line, #dfe7db);
  color: #294638;
}

.cloud-backup-heading h3 {
  margin: 0;
  color: #294638;
  font-size: 15px;
  font-weight: 650;
}

.cloud-backup-heading p,
.cloud-backup-guest > p {
  max-width: 66ch;
  margin: 7px 0 0;
  color: var(--muted, #5d6b61);
  font-size: 12px;
  line-height: 1.7;
}

.cloud-backup-device-summary {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 8px 16px;
  margin-top: 14px;
  min-width: 0;
}

.cloud-backup-label {
  color: #405c47;
  font-size: 12px;
  font-weight: 650;
}

.cloud-backup-counts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(54px, 1fr));
  gap: 8px 10px;
  margin: 0;
  min-width: 0;
}

.cloud-backup-counts > div {
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
  min-width: 0;
}

.cloud-backup-counts:not(.cloud-backup-counts--details) > div {
  white-space: normal;
  overflow-wrap: anywhere;
}

.cloud-backup-counts dt {
  color: var(--muted, #5d6b61);
  font-size: 12px;
}

.cloud-backup-counts dd {
  margin: 0;
  color: #294638;
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.cloud-backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 12px;
}

.cloud-backup-actions button,
.cloud-backup-guest button {
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid #b8cdb6;
  border-radius: 7px;
  background: #f4f8f1;
  color: #31543a;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.cloud-backup-actions button:hover:not(:disabled),
.cloud-backup-guest button:hover {
  background: #eaf2e6;
}

.cloud-backup-actions button:focus-visible,
.cloud-backup-guest button:focus-visible,
.cloud-backup-policy select:focus-visible {
  outline: 3px solid #a87931;
  outline-offset: 3px;
}

.cloud-backup-actions button:disabled {
  cursor: wait;
  opacity: .65;
}

.cloud-backup-actions .cloud-backup-primary,
.cloud-backup-guest .cloud-backup-primary {
  border-color: #3f7048;
  background: #3f7048;
  color: #fff;
}

.cloud-backup-actions .cloud-backup-primary:hover:not(:disabled),
.cloud-backup-guest .cloud-backup-primary:hover {
  background: #315c3b;
}

.cloud-backup-panel {
  margin-top: 14px;
  padding: 14px 15px;
  border: 1px solid #dfe8db;
  border-radius: 8px;
  background: #f8faf6;
}

.cloud-backup-remote-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 16px;
}

.cloud-backup-remote-heading strong {
  font-size: 13px;
}

.cloud-backup-remote-heading time,
.cloud-backup-summary {
  color: #526a53;
  font-size: 12px;
  line-height: 1.7;
}

.cloud-backup-summary {
  margin: 5px 0 0;
}

.cloud-backup-actions--compact {
  margin-top: 10px;
}

.cloud-backup-empty {
  padding: 2px 0;
}

.cloud-backup-empty strong {
  font-size: 13px;
}

.cloud-backup-empty p,
.cloud-backup-note {
  margin: 5px 0 0;
  color: var(--muted, #5d6b61);
  font-size: 12px;
  line-height: 1.65;
}

.cloud-backup-review {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #dfe8db;
}

.cloud-backup-review h4 {
  margin: 0 0 9px;
  color: #294638;
  font-size: 13px;
}

.cloud-backup-counts--details {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 104px), 1fr));
  gap: 8px 12px;
  min-width: 0;
}

.cloud-backup-counts--details > div {
  white-space: normal;
  overflow-wrap: anywhere;
}

.cloud-backup-policy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 13px;
  color: #405c47;
  font-size: 12px;
  font-weight: 600;
}

.cloud-backup-policy select {
  min-height: 44px;
  max-width: 100%;
  padding: 8px 10px;
  border: 1px solid #b8cdb6;
  border-radius: 6px;
  background: #fff;
  color: #294638;
  font-size: 12px;
}

.cloud-backup-snapshot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
}

.cloud-backup-message,
.cloud-backup-result {
  margin: 11px 0 0;
  padding: 9px 11px;
  border-left: 3px solid #8aa481;
  background: #eff5eb;
  color: #31543a;
  font-size: 12px;
  line-height: 1.65;
}

.cloud-backup-message--error {
  border-left-color: #a54a39;
  background: #fff4f0;
  color: #813c30;
}

.cloud-backup-message--warning {
  border-left-color: #a87931;
  background: #fff8e9;
  color: #684b1f;
}

.cloud-backup-result {
  margin-top: 12px;
}

.cloud-backup-guest {
  margin-top: 11px;
}

.cloud-backup-guest .cloud-backup-primary {
  margin-top: 11px;
}

@media (max-width: 620px) {
  .cloud-backup-device-summary {
    align-items: flex-start;
    grid-template-columns: minmax(0, 1fr);
  }

  .cloud-backup-snapshot-grid {
    grid-template-columns: 1fr;
  }
}
</style>
