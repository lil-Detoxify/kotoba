<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { defaultAuthService, defaultRepository, defaultSyncCoordinator } from "../../adapters";
import { defaultTextbooks } from "../../services/textbooks";

const totalWords = ref(0);
const totalLearned = ref(0);
const clearMessage = ref("");
const loadError = ref("");
const resetting = ref(false);
const email = ref("");
const password = ref("");
const code = ref("");
const verificationId = ref("");
const authBusy = ref(false);
const authMessage = ref("");
const syncState = defaultSyncCoordinator.state;
const signedIn = computed(() => !!syncState.userId);
const syncBusy = computed(() => ["local_hydrating", "auth_restoring", "pulling", "reconciling"].includes(syncState.phase));
const syncStatusLabel = computed(() => {
  if (syncState.phase === "ready") return "已对齐，可安全上传";
  if (syncState.phase === "error") return "同步暂停，等待重新拉取";
  if (syncBusy.value) return "正在恢复并拉取云端数据";
  return signedIn.value ? "尚未完成首次拉取" : "登录后可开启";
});

async function refreshSettings() {
  loadError.value = "";
  try { await loadSettings(); }
  catch { loadError.value = "学习记录暂时无法读取，请重试。原有记录未被覆盖。"; }
}

async function resetData() {
  if (resetting.value || syncBusy.value) return;
  resetting.value = true;
  const key = defaultRepository.getActiveKey();
  try {
    const confirmation = await uni.showModal({
      title: "清空本机学习记录？",
      content: "当前账户的本机学习进度和打卡记录将清空，已下载教材保留。此操作不会删除云端数据。",
      confirmText: "清空记录",
      cancelText: "取消",
    });
    if (!confirmation.confirm) return;
    if (key !== defaultRepository.getActiveKey()) throw new Error("Account changed");
    loadError.value = "";
    clearMessage.value = "";
    await resetLearningData(key);
  } catch { loadError.value = "重置未完成，请稍后重试。"; }
  finally { resetting.value = false; }
}

async function loadSettings() {
  const data = await defaultTextbooks.hydrate();
  totalWords.value = data.words?.length || 0;
  totalLearned.value = data.states?.filter((state) => state.firstSeenAt || state.reviewCount > 0)?.length || 0;
}

async function resetLearningData(key: string) {
  await defaultRepository.transact((data) => { data.states = []; data.logs = []; }, key);
  clearMessage.value = "已清空本机学习记录，已下载教材保留";
  await loadSettings();
  setTimeout(() => { clearMessage.value = ""; }, 2000);
}

async function loginWithPassword() {
  if (authBusy.value || !email.value.trim() || !password.value) { authMessage.value = "请输入邮箱和密码。"; return; }
  authBusy.value = true;
  authMessage.value = "";
  try {
    const session = await defaultAuthService.loginWithPassword(email.value, password.value);
    password.value = "";
    await defaultSyncCoordinator.activateSession(session);
    authMessage.value = syncState.isSyncReady ? "登录成功，学习进度已完成安全对齐。" : "账号已登录，首次云端拉取尚未完成，请重试同步。";
    await refreshSettings();
  } catch (error) { authMessage.value = error instanceof Error ? error.message : "登录失败，请检查账号后重试。"; }
  finally { authBusy.value = false; }
}

async function sendCode() {
  if (authBusy.value || !email.value.trim()) { authMessage.value = "请先输入邮箱。"; return; }
  authBusy.value = true;
  try {
    const result = await defaultAuthService.sendCode(email.value);
    verificationId.value = result.verificationId;
    authMessage.value = `验证码已发送，${Math.ceil(result.expiresIn / 60)} 分钟内有效。`;
  } catch (error) { authMessage.value = error instanceof Error ? error.message : "验证码发送失败。"; }
  finally { authBusy.value = false; }
}

async function loginWithCode() {
  if (authBusy.value || !verificationId.value || !code.value.trim()) { authMessage.value = "请先获取并输入邮箱验证码。"; return; }
  authBusy.value = true;
  try {
    const session = await defaultAuthService.loginWithCode(email.value, code.value, verificationId.value);
    code.value = "";
    verificationId.value = "";
    await defaultSyncCoordinator.activateSession(session);
    authMessage.value = syncState.isSyncReady ? "登录成功，学习进度已完成安全对齐。" : "账号已登录，首次云端拉取尚未完成，请重试同步。";
    await refreshSettings();
  } catch (error) { authMessage.value = error instanceof Error ? error.message : "验证码登录失败。"; }
  finally { authBusy.value = false; }
}

async function retrySync() {
  if (authBusy.value || syncBusy.value) return;
  authBusy.value = true;
  authMessage.value = "";
  try {
    if (syncState.isSyncReady) await defaultSyncCoordinator.flush("manual");
    else await defaultSyncCoordinator.init();
    authMessage.value = syncState.isSyncReady ? "同步完成。" : "云端拉取仍未完成，本机记录保持不变。";
    await refreshSettings();
  } finally { authBusy.value = false; }
}

async function logout() {
  if (authBusy.value || syncBusy.value) return;
  authBusy.value = true;
  authMessage.value = "";
  try {
    if (syncState.isSyncReady) await defaultSyncCoordinator.flush("manual");
    await defaultAuthService.logout();
    authMessage.value = "已退出账号，本机游客数据仍可使用。";
  } catch { authMessage.value = "本机已退出；网络恢复后可重新登录确认云端会话。"; }
  finally { defaultSyncCoordinator.signOutToGuest(); authBusy.value = false; await refreshSettings(); }
}

onShow(() => { void refreshSettings(); });
</script>

<template>
  <view class="container">
    <view v-if="loadError" class="card"><text>{{ loadError }}</text><button class="secondary-btn" @tap="refreshSettings">重新读取</button></view>
    <view class="section-header"><text class="section-title">设置与关于</text><text class="section-desc">KotoBud 小程序版基础配置</text></view>

    <view class="card">
      <text class="group-title">运行状态</text>
      <view class="info-row"><text class="info-label">学习数据</text><text class="info-value">保存在本机</text></view>
      <view class="info-row"><text class="info-label">云同步</text><text class="info-value" :class="{ 'status-error': syncState.phase === 'error' }">{{ syncStatusLabel }}</text></view>
      <view class="info-row"><text class="info-label">已下载词汇</text><text class="info-value">{{ totalWords }} 词</text></view>
      <view class="info-row"><text class="info-label">已学习词数</text><text class="info-value">{{ totalLearned }} 词</text></view>
    </view>

    <view class="card">
      <text class="group-title">KotoBud 账号</text>
      <template v-if="signedIn">
        <view class="info-row"><text class="info-label">当前账号</text><text class="info-value account-value">{{ syncState.email || syncState.userId }}</text></view>
        <view class="account-actions">
          <button class="primary-btn account-btn" :disabled="authBusy || syncBusy" :loading="authBusy || syncBusy" @tap="retrySync">{{ syncState.isSyncReady ? "立即同步" : "重新拉取云端" }}</button>
          <button class="secondary-btn account-btn" :disabled="authBusy || syncBusy" @tap="logout">退出账号</button>
        </view>
      </template>
      <template v-else>
        <text class="account-note">登录已有 Web / Windows 邮箱账号后，会先拉取并合并云端记录；首次拉取成功前不会上传本机数据。</text>
        <input v-model="email" class="form-input" type="text" placeholder="邮箱地址" :disabled="authBusy" />
        <input v-model="password" class="form-input" password type="text" placeholder="密码" :disabled="authBusy" />
        <button class="primary-btn account-btn" :disabled="authBusy" :loading="authBusy" @tap="loginWithPassword">邮箱密码登录</button>
        <view class="code-row"><input v-model="code" class="form-input code-input" type="number" maxlength="8" placeholder="邮箱验证码" :disabled="authBusy" /><button class="secondary-btn code-btn" :disabled="authBusy" @tap="sendCode">获取验证码</button></view>
        <button class="secondary-btn account-btn" :disabled="authBusy || !verificationId" @tap="loginWithCode">使用验证码登录</button>
        <button class="wechat-btn" disabled>微信快速登录 · 等待服务端安全接口与正式 AppID</button>
      </template>
      <text v-if="authMessage" class="auth-message">{{ authMessage }}</text>
      <text v-if="syncState.error" class="sync-error">{{ syncState.error }}</text>
    </view>

    <view class="card">
      <text class="group-title">数据维护</text>
      <button class="secondary-btn reset-btn" :disabled="resetting || syncBusy" :loading="resetting" @tap="resetData">清空本机学习记录</button>
      <text v-if="clearMessage" class="toast-success">{{ clearMessage }}</text>
    </view>

    <view class="card about-card"><text class="about-app">KotoBud 言葉</text><text class="about-version">版本 0.6.0 · 微信小程序</text><text class="about-meta">Web / Windows / 微信小程序 多端日语背词体系</text></view>
  </view>
</template>

<style scoped>
.section-header { margin-bottom: 24rpx; }
.section-title { display: block; font-size: 40rpx; font-weight: 700; color: #111827; margin-bottom: 6rpx; }
.section-desc { font-size: 26rpx; color: #6B7280; }
.group-title { display: block; font-size: 28rpx; font-weight: 700; color: #111827; margin-bottom: 20rpx; padding-bottom: 12rpx; border-bottom: 1rpx solid #F3F4F6; }
.info-row { display: flex; justify-content: space-between; gap: 24rpx; padding: 16rpx 0; border-bottom: 1rpx solid #F9FAFB; }
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 26rpx; color: #6B7280; }
.info-value { font-size: 26rpx; font-weight: 500; color: #1F2937; text-align: right; }
.status-error, .sync-error { color: #B42318; }
.account-value { max-width: 430rpx; overflow-wrap: anywhere; }
.account-note { display: block; color: #6B7280; font-size: 24rpx; line-height: 1.6; margin-bottom: 20rpx; }
.form-input { width: 100%; min-height: 88rpx; padding: 0 24rpx; margin-bottom: 16rpx; border: 1rpx solid #D6D3D1; border-radius: 16rpx; background: #FAFAF9; font-size: 28rpx; }
.account-actions { display: flex; gap: 16rpx; margin-top: 20rpx; }
.account-btn { min-height: 88rpx; line-height: 1.35; width: 100%; margin-top: 12rpx; }
.code-row { display: flex; gap: 16rpx; align-items: stretch; }
.code-input { flex: 1; margin-bottom: 0; }
.code-btn { min-width: 210rpx; min-height: 88rpx; padding: 12rpx 24rpx; }
.wechat-btn { min-height: 88rpx; margin-top: 24rpx; border: 1rpx dashed #D6D3D1; border-radius: 16rpx; background: #F5F5F4; color: #78716C; font-size: 24rpx; }
.auth-message, .sync-error { display: block; margin-top: 16rpx; font-size: 24rpx; line-height: 1.5; }
.reset-btn { width: 100%; min-height: 88rpx; }
.toast-success { display: block; text-align: center; font-size: 24rpx; color: #059669; margin-top: 16rpx; }
.about-card { text-align: center; padding: 48rpx 32rpx; }
.about-app { display: block; font-size: 36rpx; font-weight: 800; color: #D9532F; margin-bottom: 8rpx; }
.about-version { display: block; font-size: 24rpx; color: #4B5563; margin-bottom: 8rpx; }
.about-meta { font-size: 22rpx; color: #9CA3AF; }
</style>
