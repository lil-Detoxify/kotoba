<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { CloudDownload, CloudUpload, RefreshCw } from 'lucide-vue-next';
import { summarizePersonalLibrary, type ExistingContentPolicy, type PersonalLibrary, type PersonalLibrarySummary } from '../../../web/src/services/personal-library';
import { exportExtensionPersonalLibrary } from '../personal-library';
import { extensionApi } from '../client';
import type { CloudAuthStatus } from '../cloud';
import type { ExtensionSnapshot, ExtensionWord } from '../model';
import type { PersonalBackupView } from '../personal-library-backup';

const props = defineProps<{
  snapshot: ExtensionSnapshot | null;
  catalog: ExtensionWord[];
}>();

const emit = defineEmits<{
  changed: [snapshot: ExtensionSnapshot];
}>();

const status = shallowRef<CloudAuthStatus | null>(null);
const view = shallowRef<PersonalBackupView | null>(null);
const policy = ref<ExistingContentPolicy>('keep-local');
const busy = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
let statusRequest = 0;
let operationTicket = 0;
let disposed = false;
let lastIdentity = '';
let accountChannel: BroadcastChannel | undefined;

const authenticated = computed(() => Boolean(status.value?.user));
const activePartitionKey = computed(() => status.value?.activePartitionKey ?? '');
const currentLibrary = computed<PersonalLibrary | null>(() => {
  if (!props.snapshot) return null;
  try { return exportExtensionPersonalLibrary(props.snapshot, props.catalog); }
  catch { return null; }
});
const currentLibraryChanged = computed(() => Boolean(view.value && (
  !currentLibrary.value || !sameLibraryContent(currentLibrary.value, view.value.local)
)));
const accountReady = computed(() => Boolean(
  status.value?.user && status.value.ready &&
  status.value.activePartitionKey === `account:${status.value.user.id}` &&
  props.snapshot?.identity?.partitionKey === status.value.activePartitionKey,
));
const localSummary = computed(() => view.value ? summarizePersonalLibrary(view.value.local) : null);
const remoteSummary = computed(() => view.value?.backup ? summarizePersonalLibrary(view.value.backup.library) : null);

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

function identityOf(value: CloudAuthStatus): string {
  return `${value.activePartitionKey}\u0000${value.user?.id ?? ''}`;
}

function clearReview(): void {
  operationTicket++;
  busy.value = false;
  view.value = null;
  policy.value = 'keep-local';
  errorMessage.value = '';
  successMessage.value = '';
}

function applyStatus(next: CloudAuthStatus): void {
  const identity = identityOf(next);
  if (lastIdentity && identity !== lastIdentity) clearReview();
  lastIdentity = identity;
  status.value = next;
}

async function refreshStatus(): Promise<void> {
  if (disposed) return;
  const request = ++statusRequest;
  try {
    const next = await extensionApi.authStatus();
    if (!disposed && request === statusRequest) applyStatus(next);
  } catch {
    if (!disposed && request === statusRequest && !status.value) {
      errorMessage.value = '暂时无法读取账号状态，请稍后重试。';
    }
  }
}

function expectedPartition(): string | null {
  const current = status.value;
  if (!current?.user) {
    errorMessage.value = '请先登录 KotoBud 账号，再管理个人词库备份。';
    return null;
  }
  if (!accountReady.value) {
    errorMessage.value = '账号数据仍在载入，请稍后再操作。';
    return null;
  }
  if (!props.snapshot || props.catalog.length === 0) {
    errorMessage.value = '这台设备的词库还在载入，请稍后再操作。';
    return null;
  }
  return current.activePartitionKey;
}

async function confirmCurrentAccount(ticket: number, partitionKey: string): Promise<boolean> {
  const latest = await extensionApi.authStatus();
  if (ticket !== operationTicket || disposed) return false;
  applyStatus(latest);
  return latest.user !== null && latest.activePartitionKey === partitionKey &&
    latest.activePartitionKey === `account:${latest.user.id}`;
}

function showError(reason: unknown, fallback: string): void {
  errorMessage.value = reason instanceof Error && reason.message ? reason.message : fallback;
}

async function readBackup(): Promise<void> {
  const partitionKey = expectedPartition();
  if (!partitionKey || busy.value) return;
  const ticket = ++operationTicket;
  busy.value = true;
  view.value = null;
  policy.value = 'keep-local';
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const result = await extensionApi.readPersonalBackup();
    if (ticket !== operationTicket || disposed) return;
    if (!await confirmCurrentAccount(ticket, partitionKey)) {
      clearReview();
      return;
    }
    view.value = result;
    successMessage.value = result.backup ? '已读取这台设备与账号的个人词库。' : '账号还没有云端词库备份，可以保存这台设备的内容。';
  } catch (reason) {
    if (ticket === operationTicket && !disposed) showError(reason, '读取云端备份失败，请重试。');
  } finally {
    if (ticket === operationTicket && !disposed) busy.value = false;
  }
}

async function saveBackup(): Promise<void> {
  const partitionKey = expectedPartition();
  if (!partitionKey || busy.value || !view.value || currentLibraryChanged.value) {
    if (currentLibraryChanged.value) errorMessage.value = '本机词库已有变化，请重新读取后再保存。';
    return;
  }
  const ticket = ++operationTicket;
  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const result = await extensionApi.savePersonalBackup();
    if (ticket !== operationTicket || disposed) return;
    if (!await confirmCurrentAccount(ticket, partitionKey)) {
      clearReview();
      return;
    }
    view.value = result;
    successMessage.value = '已保存，账号个人词库备份已更新。';
  } catch (reason) {
    if (ticket === operationTicket && !disposed) showError(reason, '保存云端备份失败，请重新查看后再试。');
  } finally {
    if (ticket === operationTicket && !disposed) busy.value = false;
  }
}

async function mergeBackup(): Promise<void> {
  const partitionKey = expectedPartition();
  if (!partitionKey || busy.value || !view.value?.backup || !view.value.preview || currentLibraryChanged.value) {
    if (currentLibraryChanged.value) errorMessage.value = '本机词库已有变化，请重新读取并检查预览后再合并。';
    return;
  }
  const ticket = ++operationTicket;
  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const result = await extensionApi.mergePersonalBackup(policy.value);
    if (ticket !== operationTicket || disposed) return;
    if (!await confirmCurrentAccount(ticket, partitionKey)) {
      clearReview();
      return;
    }
    view.value = null;
    emit('changed', result);
    successMessage.value = '云端个人词库已合并到这台设备。';
  } catch (reason) {
    if (ticket === operationTicket && !disposed) showError(reason, '合并云端备份失败，请重新查看后再试。');
  } finally {
    if (ticket === operationTicket && !disposed) busy.value = false;
  }
}

function summaryText(summary: PersonalLibrarySummary): string {
  return `${summary.bookCount} 本词书 · ${summary.lessonCount} 课次 · ${summary.wordCount} 词条 · ${summary.contextCount} 条原句`;
}

function updatedAtText(value: string | undefined): string {
  if (!value) return '更新时间暂不可用';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '更新时间暂不可用'
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function accountChanged(): void { void refreshStatus(); }
function focusAgain(): void { void refreshStatus(); }

watch(() => props.snapshot?.identity?.partitionKey ?? null, (next, previous) => {
  if (previous && next !== previous) clearReview();
});

onMounted(() => {
  window.addEventListener('kotobud:account-changed', accountChanged);
  window.addEventListener('focus', focusAgain);
  if (typeof BroadcastChannel !== 'undefined') {
    accountChannel = new BroadcastChannel('kotobud-account');
    accountChannel.addEventListener('message', accountChanged);
  }
  void refreshStatus();
});

onUnmounted(() => {
  disposed = true;
  statusRequest++;
  operationTicket++;
  window.removeEventListener('kotobud:account-changed', accountChanged);
  window.removeEventListener('focus', focusAgain);
  accountChannel?.removeEventListener('message', accountChanged);
  accountChannel?.close();
});
</script>

<template>
  <section class="personal-library-backup" aria-labelledby="personal-library-backup-title" :aria-busy="busy">
    <header class="backup-heading">
      <div class="backup-heading-icon" aria-hidden="true"><CloudUpload :size="18" /></div>
      <div>
        <p class="backup-kicker">MANUAL ACCOUNT BACKUP</p>
        <h3 id="personal-library-backup-title">个人词库云备份</h3>
        <p class="backup-description">由你手动读取、保存或合并自建词书、词条、笔记和收藏原句。</p>
      </div>
    </header>

    <p v-if="!status" class="backup-guidance" role="status">正在读取账号状态…</p>
    <p v-else-if="!authenticated" class="backup-guidance">请先在上方登录 KotoBud 账号，再管理个人词库备份。</p>
    <p v-else-if="!accountReady" class="backup-guidance" role="status">账号数据正在载入，完成后即可手动管理备份。</p>
    <template v-else>
      <div class="backup-actions">
        <button class="backup-button is-primary" type="button" :disabled="busy" @click="readBackup">
          <RefreshCw :size="15" :class="{ spinning: busy }" aria-hidden="true" />
          {{ busy ? '正在读取…' : '读取云端备份' }}
        </button>
      </div>

      <template v-if="view">
        <div class="backup-summary-grid" aria-label="个人词库内容数量">
          <section class="backup-summary-card" aria-labelledby="backup-local-title">
            <span class="backup-summary-label">本机</span>
            <h4 id="backup-local-title">这台设备</h4>
            <p>{{ localSummary ? summaryText(localSummary) : '正在读取' }}</p>
          </section>
          <section class="backup-summary-card" aria-labelledby="backup-cloud-title">
            <span class="backup-summary-label">账号</span>
            <h4 id="backup-cloud-title">云端备份</h4>
            <p v-if="remoteSummary">{{ summaryText(remoteSummary) }}</p>
            <p v-else>该账号尚无云端词库备份</p>
            <small v-if="view.backup">{{ updatedAtText(view.backup.updatedAt) }}</small>
          </section>
        </div>

        <p v-if="currentLibraryChanged" class="backup-notice" role="status">本机词库已有变化，请重新读取并确认最新内容。</p>

        <section v-if="view.backup && view.preview" class="backup-preview" aria-labelledby="backup-preview-title">
          <div class="preview-heading"><CloudDownload :size="16" aria-hidden="true" /><h4 id="backup-preview-title">合并预览</h4></div>
          <p>将从账号备份导入 {{ view.preview.newBooks }} 本词书、{{ view.preview.newLessons }} 节课次、{{ view.preview.newWords }} 个词条和 {{ view.preview.newContexts }} 条原句。</p>
          <p class="preview-existing">本机已有 {{ view.preview.existingWords }} 个同 ID 词条和 {{ view.preview.existingContexts }} 条同 ID 原句。</p>
          <fieldset class="backup-policy" :disabled="busy || currentLibraryChanged">
            <legend>已有内容如何处理</legend>
            <label><input v-model="policy" type="radio" value="keep-local" /> 保留本机同 ID 内容</label>
            <label><input v-model="policy" type="radio" value="use-package" /> 使用云端备份覆盖同 ID 内容</label>
          </fieldset>
          <p class="policy-help">两种方式都会补入本机缺少的内容；合并不会修改学习进度和复习记录。</p>
        </section>

        <div class="backup-actions backup-actions-bottom">
          <button class="backup-button" type="button" :disabled="busy || currentLibraryChanged" @click="saveBackup">
            {{ busy ? '正在处理…' : '保存本机词库' }}
          </button>
          <button v-if="view.backup" class="backup-button is-primary" type="button" :disabled="busy || currentLibraryChanged || !view.preview" @click="mergeBackup">
            {{ busy ? '正在处理…' : '合并到本机' }}
          </button>
        </div>
      </template>
      <p v-else class="backup-muted">先读取云端备份，确认本机和账号中的词库后，再选择保存或合并。</p>
    </template>

    <p v-if="errorMessage" class="backup-message is-error" role="alert">{{ errorMessage }}</p>
    <p v-else-if="successMessage" class="backup-message" role="status">{{ successMessage }}</p>
    <p class="backup-footnote">账号备份只在你点击按钮时读写，保存或合并前都会检查账号和词库状态。</p>
  </section>
</template>

<style scoped>
.personal-library-backup { display: grid; gap: 12px; padding: 17px; border: 1px solid #dce7d8; border-radius: 17px; background: #fffefa; color: #233b2e; }
.backup-heading { display: flex; align-items: flex-start; gap: 11px; }
.backup-heading-icon { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border: 1px solid #dce7d8; border-radius: 11px; background: #f0f5eb; color: #315c43; }
.backup-kicker { margin: 0 0 4px; color: #738074; font-size: 9px; font-weight: 800; letter-spacing: .13em; }
.backup-heading h3 { margin: 0; font-family: "Yu Mincho", "Hiragino Mincho ProN", serif; font-size: 17px; }
.backup-description, .backup-guidance, .backup-muted, .backup-footnote { margin: 4px 0 0; color: #738074; font-size: 11px; line-height: 1.6; }
.backup-guidance { padding: 10px 12px; border-radius: 11px; background: #f4f6ef; color: #556b5c; }
.backup-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.backup-button { display: inline-flex; min-height: 37px; flex: 1; align-items: center; justify-content: center; gap: 7px; padding: 8px 12px; border: 1px solid #d9e3d5; border-radius: 11px; background: #fffefa; color: #315c43; font-size: 11px; font-weight: 700; cursor: pointer; }
.backup-button:hover:not(:disabled) { background: #f3f7ef; }
.backup-button.is-primary { border-color: #315c43; background: #315c43; color: #fffefa; }
.backup-button.is-primary:hover:not(:disabled) { background: #254a35; }
.backup-button:disabled { cursor: wait; opacity: .55; }
.backup-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.backup-summary-card { min-width: 0; padding: 11px; border: 1px solid #e5eade; border-radius: 12px; background: #f8faf5; }
.backup-summary-label { color: #738074; font-size: 9px; font-weight: 800; letter-spacing: .1em; }
.backup-summary-card h4 { margin: 4px 0; color: #315c43; font-size: 12px; }
.backup-summary-card p { margin: 0; color: #526657; font-size: 10px; line-height: 1.55; }
.backup-summary-card small { display: block; margin-top: 5px; color: #849087; font-size: 9px; }
.backup-preview { display: grid; gap: 7px; padding: 12px; border: 1px solid #e5dfc9; border-radius: 12px; background: #fbf8ed; }
.preview-heading { display: flex; align-items: center; gap: 6px; color: #806d37; }
.preview-heading h4 { margin: 0; font-size: 12px; }
.backup-preview > p { margin: 0; color: #625b49; font-size: 10px; line-height: 1.55; }
.backup-preview > .preview-existing, .policy-help { color: #837c69; }
.backup-policy { display: grid; gap: 7px; margin: 3px 0 0; padding: 0; border: 0; }
.backup-policy legend { margin-bottom: 7px; color: #625b49; font-size: 10px; font-weight: 700; }
.backup-policy label { display: flex; align-items: center; gap: 7px; color: #465b4c; font-size: 10px; cursor: pointer; }
.backup-policy input { accent-color: #315c43; }
.policy-help { margin: -1px 0 0; font-size: 9px; line-height: 1.5; }
.backup-actions-bottom { padding-top: 1px; }
.backup-notice, .backup-message { margin: 0; color: #315c43; font-size: 10px; line-height: 1.55; }
.backup-notice { color: #8a6f36; }
.backup-message.is-error { color: #a74c46; }
.backup-footnote { padding-top: 2px; font-size: 9px; }
.spinning { animation: backup-spin 1s linear infinite; }
@keyframes backup-spin { to { transform: rotate(360deg); } }
@media (max-width: 360px) { .backup-summary-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .personal-library-backup *, .personal-library-backup *::before, .personal-library-backup *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; } }
</style>
