<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { extensionApi } from '../client';
import type { CloudAuthStatus, CloudOperationResult } from '../cloud';

const emit = defineEmits<{ changed: [] }>();
type EntryMode = 'email' | 'password' | 'verify';

const status = ref<CloudAuthStatus>({ user: null, activePartitionKey: 'current', phase: 'restoring', ready: false });
const loading = ref(true);
const mode = ref<EntryMode>('email');
const email = ref('');
const password = ref('');
const code = ref('');
const verificationId = ref('');
const registrationFlow = ref<'register' | 'legacy_upgrade'>('register');
const error = ref('');
const message = ref('');
const busy = ref(false);
const mergeConfirmation = ref(false);
const codeSent = ref(false);
let pollTimer: ReturnType<typeof setInterval> | undefined;
let statusRequest = 0;
let polling = false;
let pendingStatusRefresh = false;
let disposed = false;
let accountChannel: BroadcastChannel | undefined;
let lastRefreshSignature = '';

const authenticated = computed(() => status.value.user !== null);
const accountLabel = computed(() => status.value.user?.email || status.value.user?.id || 'KotoBud 账号');
const canPoll = computed(() => authenticated.value && ['restoring', 'pulling', 'pushing'].includes(status.value.phase));

function dispatchChanged(next: CloudAuthStatus, refresh = false) {
  const detail = {
    partitionKey: next.activePartitionKey,
    userId: next.user?.id ?? null,
    ...(refresh ? { refresh: true } : {}),
  };
  const refreshSignature = refresh && next.lastSyncedAt
    ? `${detail.partitionKey}\u0000${detail.userId ?? ''}\u0000${next.lastSyncedAt}`
    : '';
  if (refreshSignature && refreshSignature === lastRefreshSignature) return;
  if (refreshSignature) lastRefreshSignature = refreshSignature;
  window.dispatchEvent(new CustomEvent('kotobud:account-changed', { detail }));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('kotobud-account');
    channel.postMessage(detail);
    channel.close();
  }
  emit('changed');
}

function updatePolling() {
  if (disposed) return;
  if (canPoll.value && !pollTimer) {
    pollTimer = setInterval(() => { void refreshStatus(); }, 1200);
  } else if (!canPoll.value && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

async function refreshStatus() {
  if (disposed) return;
  if (polling) { pendingStatusRefresh = true; return; }
  polling = true;
  const request = ++statusRequest;
  try {
    const current = await extensionApi.authStatus();
    if (!disposed && request === statusRequest) {
      const previous = status.value;
      status.value = current;
      updatePolling();
      const sameIdentity = previous.activePartitionKey === current.activePartitionKey && previous.user?.id === current.user?.id;
      const syncWasActive = previous.phase === 'pulling' || previous.phase === 'pushing';
      const pullMerged = current.ready && Boolean(current.lastSyncedAt) && current.lastSyncedAt !== previous.lastSyncedAt;
      if (!sameIdentity) {
        dispatchChanged(current, true);
      } else if (syncWasActive && pullMerged && ['pushing', 'ready', 'error'].includes(current.phase)) {
        // A pull has already been reconciled locally. Ask open learning pages
        // to reload their snapshot without resetting their active study queue.
        dispatchChanged(current, true);
      }
    }
  } catch {
    // Local account status remains usable while the browser storage is temporarily unavailable.
  } finally {
    polling = false;
    loading.value = false;
    if (pendingStatusRefresh && !disposed) {
      pendingStatusRefresh = false;
      void refreshStatus();
    }
  }
}

function changedIdentity(before: CloudAuthStatus, after: CloudAuthStatus): boolean {
  return before.activePartitionKey !== after.activePartitionKey || before.user?.id !== after.user?.id;
}

async function finishAccountAction(result: CloudOperationResult, before: CloudAuthStatus) {
  statusRequest++;
  try { status.value = await extensionApi.authStatus(); }
  catch {
    status.value = {
      user: result.user,
      activePartitionKey: result.user ? `account:${result.user.id}` : 'current',
      phase: result.phase,
      ready: result.ready,
      ...(result.error ? { error: result.error } : {}),
    };
  }
  updatePolling();
  if (changedIdentity(before, status.value)) dispatchChanged(status.value, true);
  else if (result.ready) dispatchChanged(status.value, true);
  if (result.error) error.value = result.error;
  else if (result.success) message.value = '账号状态已更新。';
}

async function continueWithEmail() {
  const value = email.value.trim();
  if (!value) { error.value = '请输入邮箱地址。'; return; }
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    const result = await extensionApi.checkAccount(value);
    if (result.error) { error.value = result.error; return; }
    if (result.flow === 'password' && result.hasPassword) {
      mode.value = 'password';
      message.value = '请输入账号密码继续。';
    } else {
      registrationFlow.value = result.flow === 'legacy_upgrade' ? 'legacy_upgrade' : 'register';
      mode.value = 'verify';
      message.value = registrationFlow.value === 'legacy_upgrade'
        ? '该邮箱已有旧账号，请验证邮箱并设置新密码。'
        : '验证邮箱后即可创建 KotoBud 账号。';
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '账号查询失败，请重试。';
  } finally { busy.value = false; }
}

async function sendCode() {
  const value = email.value.trim();
  if (!value) { error.value = '请输入邮箱地址。'; return; }
  busy.value = true;
  error.value = '';
  try {
    const result = await extensionApi.sendCode(value);
    if (!result.success || !result.verificationId) {
      error.value = result.error || '验证码发送失败，请重试。';
      return;
    }
    verificationId.value = result.verificationId;
    codeSent.value = true;
    message.value = '验证码已发送，请检查邮箱。';
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '验证码发送失败，请重试。';
  } finally { busy.value = false; }
}

async function submitCredentials() {
  if (!email.value.trim() || !password.value) { error.value = '请填写邮箱和密码。'; return; }
  const before = status.value;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    let result: CloudOperationResult;
    if (mode.value === 'password') {
      result = await extensionApi.login(email.value.trim(), password.value);
    } else {
      if (!code.value.trim() || !verificationId.value) { error.value = '请先获取并填写邮箱验证码。'; return; }
      result = await extensionApi.register(email.value.trim(), password.value, code.value.trim(), verificationId.value, registrationFlow.value);
    }
    await finishAccountAction(result, before);
    if (result.authenticated) {
      password.value = '';
      code.value = '';
      verificationId.value = '';
      codeSent.value = false;
      mode.value = 'email';
    } else {
      password.value = '';
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '账号操作失败，请重试。';
    password.value = '';
  } finally { busy.value = false; }
}

async function syncNow(mergeGuest = false) {
  busy.value = true;
  error.value = '';
  message.value = '';
  mergeConfirmation.value = false;
  try {
    const result = await extensionApi.sync(mergeGuest ? { mergeGuest: true } : undefined);
    statusRequest++;
    try { status.value = await extensionApi.authStatus(); }
    catch { status.value = { ...status.value, phase: result.phase, ready: result.ready, ...(result.error ? { error: result.error } : {}) }; }
    updatePolling();
    if (result.ready) dispatchChanged(status.value, true);
    if (result.success) message.value = mergeGuest ? '游客数据已合并并同步。' : '同步完成。';
    if (result.error) error.value = result.error;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '同步失败，请重试。';
  } finally { busy.value = false; }
}

async function logout() {
  const before = status.value;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    const next = await extensionApi.logout();
    statusRequest++;
    status.value = next;
    updatePolling();
    if (changedIdentity(before, next)) dispatchChanged(next);
    mode.value = 'email';
    password.value = '';
    code.value = '';
    verificationId.value = '';
    mergeConfirmation.value = false;
    message.value = '已退出账号，本机数据仍保留。';
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '退出失败，请重试。';
  } finally { busy.value = false; }
}

function resetEmailEntry() {
  mode.value = 'email';
  password.value = '';
  code.value = '';
  verificationId.value = '';
  codeSent.value = false;
  error.value = '';
  message.value = '';
}

function phaseLabel(phase: CloudAuthStatus['phase']): string {
  return ({
    signed_out: '未登录', restoring: '正在恢复账号', pulling: '正在拉取云端数据',
    pushing: '正在上传学习记录', ready: '同步就绪', error: '需要处理',
  })[phase];
}

const syncedAtLabel = computed(() => {
  if (!status.value.lastSyncedAt) return '尚未完成云端同步';
  const date = new Date(status.value.lastSyncedAt);
  return Number.isNaN(date.getTime()) ? '同步时间暂不可用' : `最近同步 ${date.toLocaleString()}`;
});

function visibleAgain() {
  if (document.visibilityState === 'visible') void refreshStatus();
}
function accountChanged() { void refreshStatus(); }
function onlineAgain() {
  if (authenticated.value && !busy.value) void syncNow();
  else void refreshStatus();
}
onMounted(() => {
  window.addEventListener('kotobud:account-changed', accountChanged);
  window.addEventListener('focus', accountChanged);
  window.addEventListener('online', onlineAgain);
  document.addEventListener('visibilitychange', visibleAgain);
  if (typeof BroadcastChannel !== 'undefined') {
    accountChannel = new BroadcastChannel('kotobud-account');
    accountChannel.addEventListener('message', accountChanged);
  }
  void refreshStatus();
});
onUnmounted(() => {
  disposed = true;
  statusRequest++;
  if (pollTimer) clearInterval(pollTimer);
  window.removeEventListener('kotobud:account-changed', accountChanged);
  window.removeEventListener('focus', accountChanged);
  window.removeEventListener('online', onlineAgain);
  document.removeEventListener('visibilitychange', visibleAgain);
  accountChannel?.removeEventListener('message', accountChanged);
  accountChannel?.close();
});
</script>

<template>
  <section class="account-panel" aria-labelledby="account-title">
    <div class="account-panel-heading">
      <div>
        <p class="account-kicker">KOTOBUD ACCOUNT</p>
        <h2 id="account-title">账号与云同步</h2>
      </div>
      <span class="account-status" :class="`is-${status.phase}`" role="status">{{ phaseLabel(status.phase) }}</span>
    </div>

    <p v-if="loading" class="account-muted" role="status">正在读取本机账号状态…</p>

    <template v-else-if="authenticated">
      <div class="account-identity">
        <span class="account-avatar" aria-hidden="true">言</span>
        <div class="account-identity-copy"><strong>{{ accountLabel }}</strong><small>{{ status.user?.provider === 'kotobud' ? 'KotoBud 邮箱账号' : '已连接账号' }}</small></div>
      </div>
      <p class="account-sync-time">{{ syncedAtLabel }}</p>
      <p v-if="status.error && !error" class="account-message is-error" role="alert">{{ status.error }}</p>

      <div class="account-actions">
        <button class="account-button is-primary" type="button" :disabled="busy" @click="syncNow()">
          {{ busy ? '正在处理…' : '立即同步' }}
        </button>
        <button v-if="!mergeConfirmation" class="account-button" type="button" :disabled="busy" @click="mergeConfirmation = true">
          合并游客数据
        </button>
      </div>
      <div v-if="mergeConfirmation" class="account-merge-confirm" role="group" aria-label="确认合并游客数据">
        <p>把此设备的游客收藏与学习记录合并到 {{ accountLabel }}。云端拉取成功后才会合并；上传未完成时会保留可重试数据。</p>
        <div class="account-actions">
          <button class="account-button is-primary" type="button" :disabled="busy" @click="syncNow(true)">确认合并</button>
          <button class="account-button" type="button" :disabled="busy" @click="mergeConfirmation = false">取消</button>
        </div>
      </div>
      <button class="account-link-button" type="button" :disabled="busy" @click="logout">退出账号</button>
    </template>

    <template v-else-if="!loading">
      <p class="account-description">登录后可在设备间同步教材进度与复习记录。自定义词书内容仍保存在本机。</p>
      <form v-if="mode === 'email'" class="account-form" @submit.prevent="continueWithEmail">
        <label for="account-email">邮箱</label>
        <input id="account-email" v-model="email" type="email" autocomplete="email" required placeholder="name@example.com" :disabled="busy" />
        <button class="account-button is-primary" type="submit" :disabled="busy">{{ busy ? '请稍候…' : '继续' }}</button>
      </form>
      <form v-else class="account-form" @submit.prevent="submitCredentials">
        <div class="account-email-row"><span>{{ email }}</span><button type="button" class="account-link-button" @click="resetEmailEntry">更换</button></div>
        <label for="account-password">{{ mode === 'password' ? '密码' : '设置密码' }}</label>
        <input id="account-password" v-model="password" type="password" :autocomplete="mode === 'password' ? 'current-password' : 'new-password'" required minlength="8" placeholder="至少 8 位" :disabled="busy" />
        <template v-if="mode === 'verify'">
          <label for="account-code">邮箱验证码</label>
          <div class="account-code-row">
            <input id="account-code" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" required placeholder="填写验证码" :disabled="busy" />
            <button class="account-button" type="button" :disabled="busy" @click="sendCode">{{ codeSent ? '重新发送' : '发送验证码' }}</button>
          </div>
        </template>
        <button class="account-button is-primary" type="submit" :disabled="busy">{{ busy ? '正在连接…' : mode === 'password' ? '登录并同步' : registrationFlow === 'legacy_upgrade' ? '验证并升级账号' : '创建账号' }}</button>
      </form>
    </template>

    <p v-if="error" class="account-message is-error" role="alert">{{ error }}</p>
    <p v-else-if="message" class="account-message" role="status">{{ message }}</p>
    <p class="account-footnote">密码和验证码只用于本次请求，不会保存在本机。</p>
  </section>
</template>

<style scoped>
.account-panel {
  display: grid;
  gap: 13px;
  padding: 18px;
  border: 1px solid #dce7d8;
  border-radius: 18px;
  background: linear-gradient(145deg, #fffefa, #f7f9f2);
  color: #233b2e;
  box-shadow: 0 9px 24px rgba(41, 66, 45, 0.045);
}
.account-panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.account-kicker { margin: 0 0 4px; color: #738074; font-size: 9px; font-weight: 800; letter-spacing: .15em; }
.account-panel h2 { margin: 0; font-family: "Yu Mincho", "Hiragino Mincho ProN", serif; font-size: 20px; }
.account-status { flex: 0 0 auto; padding: 5px 9px; border: 1px solid #dce7d8; border-radius: 999px; background: #f3f6ef; color: #667469; font-size: 10px; }
.account-status.is-ready { border-color: #d1e3d1; background: #edf6ec; color: #315c43; }
.account-status.is-error { border-color: #efd4d0; background: #fff3f0; color: #a74c46; }
.account-identity { display: flex; align-items: center; gap: 11px; padding: 12px; border-radius: 13px; background: #f0f5eb; }
.account-avatar { display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; border: 1px solid #d5e2d1; border-radius: 12px; background: #fffefa; color: #315c43; font-family: serif; font-size: 19px; }
.account-identity-copy { display: grid; min-width: 0; gap: 3px; }
.account-identity-copy strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; }
.account-identity-copy small, .account-muted, .account-sync-time, .account-footnote, .account-description { color: #738074; font-size: 11px; line-height: 1.55; }
.account-sync-time, .account-description, .account-muted, .account-footnote { margin: 0; }
.account-form { display: grid; gap: 8px; }
.account-form label { margin-top: 3px; color: #455e4d; font-size: 11px; font-weight: 700; }
.account-form input { width: 100%; min-width: 0; padding: 11px 12px; border: 1px solid #dce5d8; border-radius: 11px; background: #fff; color: #233b2e; font-size: 13px; }
.account-form input:focus { border-color: #82a38a; outline: 3px solid rgba(49, 92, 67, .12); }
.account-form input:disabled { opacity: .65; }
.account-email-row, .account-code-row { display: flex; align-items: center; gap: 8px; }
.account-email-row { justify-content: space-between; color: #455e4d; font-size: 12px; }
.account-code-row input { flex: 1; }
.account-button { min-height: 38px; padding: 8px 12px; border: 1px solid #d9e3d5; border-radius: 11px; background: #fffefa; color: #315c43; font-size: 11px; font-weight: 700; cursor: pointer; }
.account-button:hover:not(:disabled) { background: #f3f7ef; }
.account-button.is-primary { border-color: #315c43; background: #315c43; color: #fffefa; }
.account-button.is-primary:hover:not(:disabled) { background: #254a35; }
.account-button:disabled, .account-link-button:disabled { cursor: wait; opacity: .55; }
.account-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.account-actions > .account-button { flex: 1; }
.account-link-button { justify-self: start; padding: 3px 0; border: 0; background: transparent; color: #607465; font-size: 11px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.account-merge-confirm { display: grid; gap: 10px; padding: 12px; border: 1px solid #e5dfc9; border-radius: 12px; background: #fbf8ed; }
.account-merge-confirm p { margin: 0; color: #6d6653; font-size: 11px; line-height: 1.6; }
.account-message { margin: 0; color: #315c43; font-size: 11px; line-height: 1.55; }
.account-message.is-error { color: #a74c46; }
.account-footnote { padding-top: 2px; font-size: 10px; }
@media (prefers-reduced-motion: reduce) { .account-panel *, .account-panel *::before, .account-panel *::after { scroll-behavior: auto !important; transition-duration: .001ms !important; } }
</style>
