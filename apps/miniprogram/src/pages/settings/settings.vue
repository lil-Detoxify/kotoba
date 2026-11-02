<script lang="ts">
import { createFriendShare, createTimelineShare } from "../../services/share";
export default {
  onShareAppMessage: createFriendShare,
  onShareTimeline: createTimelineShare,
};
</script>

<script setup lang="ts">
import { useMiniPageActivity } from "../../services/page-motion";
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import MiniPage from "../../components/MiniPage.vue";
import MiniHeader from "../../components/MiniHeader.vue";
import MiniNotice from "../../components/MiniNotice.vue";
import MiniPanel from "../../components/MiniPanel.vue";
import MiniDictionaryPreferences from "../../components/MiniDictionaryPreferences.vue";
import MiniAnswerSoundPreferences from "../../components/MiniAnswerSoundPreferences.vue";
import MiniPersonalLibraryBackup from "../../components/MiniPersonalLibraryBackup.vue";
import MiniHomeDisplayPreferences from "../../components/MiniHomeDisplayPreferences.vue";
import { miniStudyExercisePreference, MINI_STUDY_EXERCISE_OPTIONS } from "../../services/study-exercise-preference";
import { miniAutoPronunciationPreference } from "../../services/auto-pronunciation-preference";
import packageInfo from "../../../package.json";
import StudyMascot from "../../components/StudyMascot.vue";
import { miniUi, type MiniMotionMode } from "../../services/ui-preferences";
import { defaultAudioCache, defaultAuthService, defaultRepository, defaultStorage, defaultSyncCoordinator, isMissingSnapshotError } from "../../adapters";
import { defaultPrivacyConsent } from "../../services/privacy-consent";
import { defaultTextbooks } from "../../services/textbooks";
import {
  DEFAULT_STUDY_MASCOT_POSITION,
  readStudyMascotVisibility,
  writeStudyMascotPosition,
  writeStudyMascotVisibility,
} from "../../services/mascot";
useMiniPageActivity();
function scrollToAccount() { void uni.pageScrollTo({ selector: '#account-section', duration: 200 }); }

const totalWords = ref(0);
const totalLearned = ref(0);
const clearMessage = ref("");
const loadError = ref("");
const snapshotMissing = ref(false);
const refreshingSettings = ref(false);
const resetting = ref(false);
const cacheBusy = ref(false);
const cacheEntries = ref(0);
const cacheBytes = ref(0);
const cacheMessage = ref("");
const email = ref("");
const password = ref("");
const code = ref("");
const verificationId = ref("");
const authBusy = ref(false);
const authMessage = ref("");
const mascotVisible = ref(false);
const mascotBusy = ref(false);
const mascotPositionBusy = ref(false);
const mascotMessage = ref("");
const motionBusy = ref(false);
const motionMessage = ref("");
const exercisePreferenceBusy = ref(false);
const exercisePreferenceMessage = ref('');
const autoPronunciationBusy = ref(false);
const autoPronunciationMessage = ref('');
const exercisePreferenceLabels = MINI_STUDY_EXERCISE_OPTIONS.map(option => option.label);
const exercisePreferenceIndex = computed(() => MINI_STUDY_EXERCISE_OPTIONS.findIndex(option => option.value === miniStudyExercisePreference.state.value));
async function selectStudyPreference(event: { detail?: { value?: string | number } }) {
  const option = MINI_STUDY_EXERCISE_OPTIONS[Number(event.detail?.value)];
  if (!option || exercisePreferenceBusy.value) return;
  exercisePreferenceBusy.value = true;
  try { await miniStudyExercisePreference.set(option.value); exercisePreferenceMessage.value = '默认学习方式已保存，下次开始学习时生效。'; }
  catch { exercisePreferenceMessage.value = '默认方式暂时没有保存，请重试。'; }
  finally { exercisePreferenceBusy.value = false; }
}
async function toggleAutoPronunciation(event: Event) {
  if (autoPronunciationBusy.value) return;
  autoPronunciationBusy.value = true;
  autoPronunciationMessage.value = '';
  try {
    const value = (event as Event & { detail?: { value?: boolean } }).detail?.value;
    await miniAutoPronunciationPreference.setEnabled(typeof value === 'boolean' ? value : !miniAutoPronunciationPreference.state.enabled);
    autoPronunciationMessage.value = '自动发音偏好已保存在本机。';
  } catch {
    autoPronunciationMessage.value = '自动发音偏好暂时没有保存，请重试。';
  } finally {
    autoPronunciationBusy.value = false;
  }
}
const authMethod = ref<"password" | "code">("password");
const syncState = defaultSyncCoordinator.state;
const signedIn = computed(() => !!syncState.userId);
const privacyStatus = computed(() => defaultPrivacyConsent.state.status);
const privacyStatusLabel = computed(() => privacyStatus.value === "accepted" ? "已同意，可登录和同步" : privacyStatus.value === "declined" ? "已拒绝，仅离线学习" : "尚未选择");
const cacheSizeLabel = computed(() => cacheBytes.value < 1024 * 1024
  ? `${Math.ceil(cacheBytes.value / 1024)} KB`
  : `${(cacheBytes.value / 1024 / 1024).toFixed(1)} MB`);
const syncBusy = computed(() => ["local_hydrating", "auth_restoring", "pulling", "reconciling"].includes(syncState.phase));
const syncStatusLabel = computed(() => {
  if (syncState.phase === "ready") return "已对齐，可安全上传";
  if (syncState.phase === "error") return "同步暂停，等待重新拉取";
  if (syncBusy.value) return "正在恢复并拉取云端数据";
  return signedIn.value ? "尚未完成首次拉取" : "登录后可开启";
});

async function refreshSettings() {
  if (refreshingSettings.value) return;
  refreshingSettings.value = true;
  try {
    await loadSettings();
    loadError.value = "";
    snapshotMissing.value = false;
  } catch (error) {
    snapshotMissing.value = isMissingSnapshotError(error);
    loadError.value = snapshotMissing.value
      ? "本机学习快照文件已缺失，请返回首页查看恢复方式。若曾同步游客记录，可登录原账号拉取云端数据。原记录未被覆盖。"
      : "学习记录暂时无法读取，请重试。原有记录未被覆盖。";
  } finally {
    refreshingSettings.value = false;
  }
}

async function resetData() {
  if (resetting.value || syncBusy.value || snapshotMissing.value) return;
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

function goToRecovery() { uni.switchTab({ url: "/pages/index/index" }); }

async function loadSettings() {
  const data = await defaultTextbooks.hydrate();
  totalWords.value = data.words?.length || 0;
  totalLearned.value = data.states?.filter((state) => state.firstSeenAt || state.reviewCount > 0)?.length || 0;
  try {
    const entries = await defaultAudioCache.getEntries();
    cacheEntries.value = entries.length;
    cacheBytes.value = entries.reduce((sum, entry) => sum + entry.size, 0);
  } catch {
    cacheEntries.value = 0;
    cacheBytes.value = 0;
  }
}

async function loadMascotSetting() {
  mascotVisible.value = await readStudyMascotVisibility(defaultStorage);
}

async function selectMotion(mode: MiniMotionMode) {
  if (motionBusy.value || mode === miniUi.state.mode) return;
  motionBusy.value = true;
  motionMessage.value = "";
  try {
    await miniUi.setMode(mode);
    motionMessage.value = mode === "reduced" ? "已减少动态，页面和叶团猫使用静态反馈。" : "已开启标准动效，设置仅保存在这台设备。";
  } catch { motionMessage.value = "动效设置保存失败，请重试。"; }
  finally { motionBusy.value = false; }
}

async function toggleMascotSetting() {
  if (mascotBusy.value) return;
  mascotBusy.value = true;
  mascotMessage.value = "";
  const nextValue = !mascotVisible.value;
  try {
    await writeStudyMascotVisibility(defaultStorage, nextValue);
    mascotVisible.value = nextValue;
    mascotMessage.value = mascotVisible.value ? "学习页将显示叶团猫。" : "学习页将隐藏叶团猫。";
  } catch {
    mascotMessage.value = "设置保存失败，请重试。";
    await loadMascotSetting();
  } finally {
    mascotBusy.value = false;
  }
}

async function resetMascotPosition() {
  if (mascotPositionBusy.value) return;
  mascotPositionBusy.value = true;
  mascotMessage.value = "";
  try {
    await writeStudyMascotPosition(defaultStorage, DEFAULT_STUDY_MASCOT_POSITION);
    mascotMessage.value = "叶团猫已恢复到卡片上方右侧。";
  } catch {
    mascotMessage.value = "位置保存失败，请重试。";
  } finally {
    mascotPositionBusy.value = false;
  }
}

async function clearAudioCache() {
  if (cacheBusy.value) return;
  cacheBusy.value = true;
  cacheMessage.value = "";
  try {
    const confirmation = await uni.showModal({
      title: "清理发音缓存？",
      content: "只删除已缓存的发音文件，不会影响词书、学习进度或云同步记录。",
      confirmText: "清理缓存",
      cancelText: "取消",
    });
    if (!confirmation.confirm) return;
    await defaultAudioCache.clear();
    cacheEntries.value = 0;
    cacheBytes.value = 0;
    cacheMessage.value = "发音缓存已清理，学习记录未改变。";
  } catch {
    cacheMessage.value = "缓存清理未完成，请稍后重试。";
  } finally {
    cacheBusy.value = false;
  }
}

async function resetLearningData(key: string) {
  await defaultRepository.transact((data) => { data.states = []; data.logs = []; }, key);
  clearMessage.value = "已清空本机学习记录，已下载教材保留";
  await loadSettings();
  setTimeout(() => { clearMessage.value = ""; }, 2000);
}

async function loginWithPassword() {
  if (authBusy.value) return;
  if (!email.value.trim() || !password.value) { authMessage.value = "请输入邮箱和密码。"; return; }
  authBusy.value = true;
  authMessage.value = "";
  try {
    if (!await requestPrivacyConsent()) return;
    const session = await defaultAuthService.loginWithPassword(email.value, password.value);
    password.value = "";
    await defaultSyncCoordinator.activateSession(session);
    authMessage.value = syncState.isSyncReady ? "登录成功，学习进度已完成安全对齐。" : "账号已登录，首次云端拉取尚未完成，请重试同步。";
    await refreshSettings();
  } catch (error) { authMessage.value = error instanceof Error ? error.message : "登录失败，请检查账号后重试。"; }
  finally { authBusy.value = false; }
}

async function sendCode() {
  if (authBusy.value) return;
  if (!email.value.trim()) { authMessage.value = "请先输入邮箱。"; return; }
  authBusy.value = true;
  authMessage.value = "";
  try {
    if (!await requestPrivacyConsent()) return;
    const result = await defaultAuthService.sendCode(email.value);
    verificationId.value = result.verificationId;
    authMessage.value = `验证码已发送，${Math.ceil(result.expiresIn / 60)} 分钟内有效。`;
  } catch (error) { authMessage.value = error instanceof Error ? error.message : "验证码发送失败。"; }
  finally { authBusy.value = false; }
}

async function loginWithCode() {
  if (authBusy.value) return;
  if (!verificationId.value || !code.value.trim()) { authMessage.value = "请先获取并输入邮箱验证码。"; return; }
  authBusy.value = true;
  authMessage.value = "";
  try {
    if (!await requestPrivacyConsent()) return;
    const session = await defaultAuthService.loginWithCode(email.value, code.value, verificationId.value);
    code.value = "";
    verificationId.value = "";
    await defaultSyncCoordinator.activateSession(session);
    authMessage.value = syncState.isSyncReady ? "登录成功，学习进度已完成安全对齐。" : "账号已登录，首次云端拉取尚未完成，请重试同步。";
    await refreshSettings();
  } catch (error) { authMessage.value = error instanceof Error ? error.message : "验证码登录失败。"; }
  finally { authBusy.value = false; }
}

async function loginWithWechat() {
  if (authBusy.value) return;
  authBusy.value = true;
  authMessage.value = '';
  try {
    if (!await requestPrivacyConsent()) return;
    const session = await defaultAuthService.loginWithWechat();
    await defaultSyncCoordinator.activateSession(session);
    authMessage.value = syncState.isSyncReady ? '微信登录成功，学习进度已完成安全对齐。' : '微信登录成功，云端拉取尚未完成，上传已暂停。';
    await refreshSettings();
  } catch (error) { authMessage.value = error instanceof Error ? error.message : '微信登录失败，请重试。'; }
  finally { authBusy.value = false; }
}

async function linkWechat() {
  if (authBusy.value || syncBusy.value) return;
  const confirmation = await uni.showModal({ title: '绑定微信账号？', content: '绑定后可用当前微信登录这个 KotoBud 账号。已有其他账号绑定的微信不能重复绑定。', confirmText: '确认绑定' });
  if (!confirmation.confirm) return;
  authBusy.value = true;
  authMessage.value = '';
  try {
    await defaultAuthService.linkWechat();
    authMessage.value = '微信已绑定当前账号，学习记录未改变。';
  } catch (error) { authMessage.value = error instanceof Error ? error.message : '绑定失败，请重试。'; }
  finally { authBusy.value = false; }
}

async function retrySync() {
  if (authBusy.value || syncBusy.value) return;
  authBusy.value = true;
  authMessage.value = "";
  try {
    if (!await requestPrivacyConsent()) return;
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

async function requestPrivacyConsent(): Promise<boolean> {
  if (await defaultPrivacyConsent.isConsented()) return true;
  const accepted = await defaultPrivacyConsent.requestConsent();
  if (!accepted) authMessage.value = "请先在隐私说明页完成平台授权；同意后可返回登录或同步。";
  if (accepted && ["idle", "signed_out", "error"].includes(syncState.phase)) await defaultSyncCoordinator.init();
  return accepted;
}

async function openPrivacyNotice() {
  uni.navigateTo({ url: "/pages/privacy/privacy" });
}

async function withdrawPrivacyConsent() {
  if (authBusy.value) return;
  authBusy.value = true;
  authMessage.value = "";
  try {
    const confirmation = await uni.showModal({
      title: "撤回隐私同意？",
      content: "撤回后会立即退出账号并关闭登录、验证码和云同步；本机离线学习仍可继续。",
      confirmText: "撤回并退出",
      cancelText: "取消",
    });
    if (!confirmation.confirm) return;
    defaultSyncCoordinator.signOutToGuest();
    await defaultPrivacyConsent.revoke();
    await defaultAuthService.clearLocalSession();
    authMessage.value = "已撤回同意，当前仅可离线学习。";
    await refreshSettings();
  } catch {
    authMessage.value = "撤回未完成，请稍后重试。";
  } finally {
    authBusy.value = false;
  }
}

onShow(() => { void defaultPrivacyConsent.load(); void refreshSettings(); void loadMascotSetting(); void miniStudyExercisePreference.load(); void miniAutoPronunciationPreference.load(); });
</script>

<template>
  <MiniPage class="settings-page">
    <MiniHeader featured kicker="YOUR SPACE · 自在学习" title="设置与关于" description="声音、陪伴与学习节奏，随时调成你喜欢的样子。" />
    <view v-if="loadError" class="card"><text>{{ loadError }}</text><button class="secondary-btn" :disabled="refreshingSettings" :loading="refreshingSettings" @tap="refreshSettings">{{ refreshingSettings ? "正在读取…" : "重新读取" }}</button><button v-if="snapshotMissing" class="secondary-btn" @tap="goToRecovery">返回首页查看恢复方式</button></view>
    <MiniPanel icon="status" accent kicker="01 / YOUR JOURNAL" title="学习手帖" description="看得见的积累，始终留在这里。">
      <view class="info-row"><text class="info-label">学习数据</text><text class="info-value">保存在本机</text></view>
      <view class="info-row"><text class="info-label">云同步</text><text class="info-value" :class="{ 'status-error': syncState.phase === 'error' }">{{ syncStatusLabel }}</text></view>
      <view class="info-row"><text class="info-label">隐私同意</text><text class="info-value">{{ privacyStatusLabel }}</text></view>
      <view class="info-row"><text class="info-label">已下载词汇</text><text class="info-value">{{ totalWords }} 词</text></view>
      <view class="info-row"><text class="info-label">已学习词数</text><text class="info-value">{{ totalLearned }} 词</text></view>
    </MiniPanel>

    <MiniPanel icon="leaf" kicker="02 / COMPANION" title="叶团猫与学习陪伴" description="按你的节奏，安静陪伴每一次学习。">
      <view class="mascot-preview"><view class="mascot-portrait"><StudyMascot pose="studying" :static="!mascotVisible" /></view><view class="mascot-preview-copy"><text class="mascot-setting-title">叶团猫</text><text class="mascot-setting-desc">多见一个词，多积累一点。<br />长按拖动，放在你喜欢的位置。</text></view></view>
      <view class="mascot-setting-row">
        <view class="mascot-setting-copy">
          <text class="mascot-setting-title">学习时显示叶团猫</text>
          <text class="mascot-setting-desc">长按叶团猫拖动；答题和复习时会切换表情。</text>
        </view>
        <switch :checked="mascotVisible" :disabled="mascotBusy" color="#315944" aria-label="学习时显示叶团猫" @change="toggleMascotSetting" />
      </view>
      <view class="motion-setting-row"><view><text class="mascot-setting-title">动画模式</text><text class="mascot-setting-desc">减少动态会保留清晰的状态与文字反馈。</text></view></view>
      <view class="motion-options"><view class="segment-indicator" :class="{ 'segment-right': miniUi.state.mode === 'reduced' }" aria-hidden="true" /><button class="motion-choice" :class="{ selected: miniUi.state.mode === 'standard' }" :disabled="motionBusy" :aria-label="`标准动效${miniUi.state.mode === 'standard' ? '，已选中' : ''}`" @tap="selectMotion('standard')">标准</button><button class="motion-choice" :class="{ selected: miniUi.state.mode === 'reduced' }" :disabled="motionBusy" :aria-label="`减少动态${miniUi.state.mode === 'reduced' ? '，已选中' : ''}`" @tap="selectMotion('reduced')">减少动态</button></view>
      <MiniNotice :message="motionMessage" />
      <button class="secondary-btn mascot-reset" :disabled="mascotPositionBusy" @tap="resetMascotPosition">恢复叶团猫默认位置</button>
      <MiniNotice :message="mascotMessage" />
    </MiniPanel>

    <MiniPanel icon="leaf" kicker="LEARNING" title="默认学习方式" description="选一种更适合今天的练习，下次开始学习时使用。">
      <view class="mascot-setting-row">
        <view class="mascot-setting-copy">
          <text class="mascot-setting-title">自动发音</text>
          <text class="mascot-setting-desc">学习和复习时，进入新词自动朗读一次。</text>
        </view>
        <switch :checked="miniAutoPronunciationPreference.state.enabled" :disabled="autoPronunciationBusy" color="#315944" aria-label="自动发音" @change="toggleAutoPronunciation" />
      </view>
      <text class="account-note">输入和填空题会在答案揭晓后朗读。</text>
      <MiniNotice :message="autoPronunciationMessage" />
      <picker class="study-preference-picker" mode="selector" :range="exercisePreferenceLabels" :value="exercisePreferenceIndex" :disabled="exercisePreferenceBusy" @change="selectStudyPreference">
        <view class="info-row"><text>新一轮学习</text><text>{{ exercisePreferenceLabels[exercisePreferenceIndex] }} · 选择</text></view>
      </picker>
      <text class="account-note">跟随学习任务时，新词用卡片、复习用混合题。偏好保存在这台设备。</text>
      <MiniNotice :message="exercisePreferenceMessage" />
    </MiniPanel>
    <MiniHomeDisplayPreferences />
    <MiniAnswerSoundPreferences />
    <MiniDictionaryPreferences />

    <MiniPanel icon="shield" kicker="03 / PRIVACY" title="隐私保护" description="数据如何使用，由你清楚地选择。">
      <text class="account-note">查看本地隐私说明，了解当前代码处理的数据、用途和存储位置。平台主体与联系方式以微信配置的《小程序用户隐私保护指引》为准。</text>
      <button class="secondary-btn account-btn" :disabled="authBusy" @tap="openPrivacyNotice">查看隐私说明</button>
      <button v-if="privacyStatus === 'accepted'" class="secondary-btn account-btn revoke-btn" :disabled="authBusy" :loading="authBusy" @tap="withdrawPrivacyConsent">撤回同意并关闭同步</button>
    </MiniPanel>

    <MiniPersonalLibraryBackup @login="scrollToAccount" />
    <view id="account-section" />
    <MiniPanel icon="cloud" kicker="04 / ACCOUNT" title="账户与同步" description="换一个设备，也继续原来的积累。">
      <template v-if="signedIn">
        <view class="info-row"><text class="info-label">当前账号</text><text class="info-value account-value">{{ syncState.email || syncState.userId }}</text></view>
        <view class="account-actions">
          <button class="primary-btn account-btn" :disabled="authBusy || syncBusy" :loading="authBusy || syncBusy" @tap="retrySync">{{ syncState.isSyncReady ? "立即同步" : "重新拉取云端" }}</button>
          <button class="secondary-btn account-btn" :disabled="authBusy || syncBusy" :loading="authBusy" @tap="logout">退出账号</button>
        </view>
        <button v-if="false" class="secondary-btn account-btn" :disabled="authBusy || syncBusy" :loading="authBusy" @tap="linkWechat">绑定当前微信账号</button>
      </template>
      <template v-else>
        <text class="account-note">登录已有 Web / Windows 邮箱账号后，会先拉取并合并云端记录；首次拉取成功前不会上传本机数据。</text>
        <view class="auth-methods"><view class="segment-indicator" :class="{ 'segment-right': authMethod === 'code' }" aria-hidden="true" /><button class="motion-choice" :class="{ selected: authMethod === 'password' }" :disabled="authBusy" :aria-label="`邮箱密码${authMethod === 'password' ? '，已选中' : ''}`" @tap="authMethod = 'password'">邮箱密码</button><button class="motion-choice" :class="{ selected: authMethod === 'code' }" :disabled="authBusy" :aria-label="`邮箱验证码${authMethod === 'code' ? '，已选中' : ''}`" @tap="authMethod = 'code'">邮箱验证码</button></view>
        <text class="field-label">邮箱地址</text>
        <input v-model="email" class="form-input" type="text" placeholder="name@example.com" :disabled="authBusy" aria-label="邮箱地址" />
        <template v-if="authMethod === 'password'">
        <text class="field-label">登录密码</text>
        <input v-model="password" class="form-input" password type="text" placeholder="输入密码" :disabled="authBusy" aria-label="登录密码" />
        <button class="primary-btn account-btn" :disabled="authBusy" :loading="authBusy" @tap="loginWithPassword">邮箱密码登录</button>
        </template>
        <template v-else>
        <text class="field-label">邮箱验证码</text>
        <view class="code-row"><input v-model="code" class="form-input code-input" type="number" maxlength="8" placeholder="邮箱验证码" :disabled="authBusy" aria-label="邮箱验证码" /><button class="secondary-btn code-btn" :disabled="authBusy" :loading="authBusy" @tap="sendCode">获取验证码</button></view>
        <button class="secondary-btn account-btn" :disabled="authBusy || !verificationId || !code.trim()" :loading="authBusy" @tap="loginWithCode">使用验证码登录</button>
        </template>
        <button v-if="false" class="wechat-btn" :disabled="authBusy" :loading="authBusy" @tap="loginWithWechat">微信快捷登录</button>
        <text v-if="false" class="account-note">已有邮箱学习记录？请先用邮箱登录并绑定微信，再使用快捷登录。</text>
      </template>
      <MiniNotice :message="authMessage" />
      <MiniNotice :message="syncState.error || ''" tone="error" />
    </MiniPanel>

    <MiniPanel icon="data" kicker="05 / DATA" title="数据与关于" description="学习记录与缓存，清楚地管理。">
      <button class="secondary-btn reset-btn" :disabled="resetting || syncBusy || snapshotMissing" :loading="resetting" @tap="resetData">清空本机学习记录</button>
      <MiniNotice :message="clearMessage" />
      <view class="cache-row"><view><text class="cache-title">发音缓存</text><text class="cache-meta">{{ cacheEntries }} 条 · {{ cacheSizeLabel }}</text></view><button class="secondary-btn cache-btn" :disabled="cacheBusy" :loading="cacheBusy" @tap="clearAudioCache">清理</button></view>
      <MiniNotice :message="cacheMessage" />
      <view class="info-row version-row"><text class="info-label">KotoBud 版本</text><text class="version-badge">{{ packageInfo.version }}</text></view>
    </MiniPanel>

    <view class="card about-card"><text class="about-app">KotoBud 言葉</text><text class="about-version">版本 {{ packageInfo.version }} · 微信小程序</text><text class="about-meta">Web / Windows / 微信小程序 多端日语背词体系</text></view>
  </MiniPage>
</template>

<style scoped>
.settings-page { padding-bottom: calc(32rpx + env(safe-area-inset-bottom)); }
.settings-page .card { background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); border-radius: 24rpx; box-shadow: 0 10rpx 28rpx rgba(35,57,46,.035); }
.section-header { margin-bottom: 24rpx; }
.section-title { display: block; font-size: 40rpx; font-weight: 700; color: var(--kotoba-ink); margin-bottom: 6rpx; }
.section-desc { font-size: 26rpx; color: var(--kotoba-muted); }
.group-title { display: block; font-size: 28rpx; font-weight: 700; color: var(--kotoba-ink); margin-bottom: 20rpx; padding-bottom: 12rpx; border-bottom: 1rpx solid var(--kotoba-line); }
.info-row { display: flex; justify-content: space-between; gap: 24rpx; padding: 16rpx 0; border-bottom: 1rpx solid var(--kotoba-line); }
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 26rpx; color: var(--kotoba-muted); }
.info-value { font-size: 26rpx; font-weight: 500; color: var(--kotoba-ink); text-align: right; }
.mascot-settings-card { padding-bottom: 24rpx; }
.mascot-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; min-height: 74rpx; }
.mascot-setting-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8rpx; }
.mascot-setting-title { color: var(--kotoba-ink); font-size: 27rpx; font-weight: 600; }
.mascot-setting-desc { color: var(--kotoba-muted); font-size: 22rpx; line-height: 1.5; }
.mascot-toggle { flex: none; min-width: 216rpx; min-height: 76rpx; margin: 0; padding: 8rpx 14rpx; font-size: 22rpx; }
.mascot-reset { min-height: 72rpx; margin: 16rpx 0 0; font-size: 23rpx; }
.mascot-message { display: block; margin-top: 12rpx; color: var(--kotoba-green); font-size: 23rpx; }
.status-error, .sync-error { color: #873c2c; }
.account-value { max-width: 430rpx; overflow-wrap: anywhere; }
.account-note { display: block; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.6; margin-bottom: 20rpx; }
.form-input { width: 100%; min-height: 88rpx; padding: 0 24rpx; margin-bottom: 16rpx; border: 1rpx solid var(--kotoba-line); border-radius: 12rpx; background: var(--kotoba-paper); color: var(--kotoba-ink); font-size: 28rpx; }
.field-label { display: block; margin: 14rpx 0 8rpx; color: var(--kotoba-ink); font-size: 25rpx; font-weight: 600; }
.code-label { margin-top: 32rpx; padding-top: 28rpx; border-top: 1rpx solid var(--kotoba-line); }
.account-actions { display: flex; gap: 16rpx; margin-top: 20rpx; }
.account-btn { min-height: 88rpx; line-height: 1.35; width: 100%; margin-top: 12rpx; }
.revoke-btn { color: #873c2c; }
.code-row { display: flex; gap: 16rpx; align-items: stretch; }
.code-input { flex: 1; margin-bottom: 0; }
.code-btn { min-width: 210rpx; min-height: 88rpx; padding: 12rpx 24rpx; }
.wechat-btn { min-height: 88rpx; margin-top: 24rpx; border: 1rpx solid #a9c5ac; border-radius: 14rpx; background: #e9f3e8; color: #245335; font-size: 27rpx; font-weight: 600; }
.auth-message, .sync-error { display: block; margin-top: 16rpx; font-size: 24rpx; line-height: 1.5; }
.reset-btn { width: 100%; min-height: 88rpx; }
.cache-row { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-top: 24rpx; padding-top: 24rpx; border-top: 1rpx solid var(--kotoba-line); }
.cache-title, .cache-meta { display: block; }
.cache-title { color: var(--kotoba-ink); font-size: 26rpx; font-weight: 600; }
.cache-meta { margin-top: 6rpx; color: var(--kotoba-muted); font-size: 22rpx; }
.cache-btn { min-width: 176rpx; min-height: 88rpx; margin: 0; padding: 12rpx 24rpx; }
.toast-success { display: block; text-align: center; font-size: 24rpx; color: var(--kotoba-green); margin-top: 16rpx; }
.about-card { text-align: center; padding: 48rpx 32rpx; }
.about-app { display: block; font-size: 36rpx; font-weight: 800; color: var(--kotoba-green); margin-bottom: 8rpx; }
.about-version { display: block; font-size: 24rpx; color: var(--kotoba-ink); margin-bottom: 8rpx; }
.about-meta { font-size: 22rpx; color: var(--kotoba-muted); }
.settings-page .card { border-radius: 28rpx; padding: 30rpx; }
.overview-panel { border-left: 6rpx solid #a2bb97 !important; }
.info-row { padding: 20rpx 0; align-items: flex-start; }
.info-label { flex: none; }
.info-value { min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.mascot-preview { display: flex; align-items: center; gap: 26rpx; padding: 20rpx; margin: 0 0 24rpx; border: 1rpx solid #dbe6d1; border-radius: 22rpx; background: #f0f5e9; }
.mascot-portrait { width: 136rpx; height: 136rpx; flex: none; }
.mascot-preview-copy { flex: 1; min-width: 0; }
.mascot-preview-copy .mascot-setting-desc { display: block; margin-top: 8rpx; }
.mascot-setting-row { min-height: 104rpx; padding-bottom: 24rpx; border-bottom: 1rpx solid var(--kotoba-line); }
.mascot-setting-row switch { flex: none; }
.mascot-setting-desc { display: block; font-size: 24rpx; line-height: 1.65; }
.motion-setting-row { padding-top: 24rpx; }
.motion-setting-row .mascot-setting-desc { margin-top: 8rpx; }
.motion-options, .auth-methods { display: flex; gap: 10rpx; padding: 8rpx; background: #eef3e8; border: 1rpx solid #dce6d4; border-radius: 20rpx; margin-top: 16rpx; }
.motion-choice { flex: 1; min-width: 0; min-height: 88rpx; margin: 0; padding: 12rpx 14rpx; border: 1rpx solid transparent; border-radius: 14rpx; background: transparent; color: var(--kotoba-muted); font-size: 26rpx; }
.motion-choice.selected { background: var(--kotoba-paper); color: var(--kotoba-green); border-color: #c3d5b8; box-shadow: 0 4rpx 12rpx rgba(49,89,68,.06); font-weight: 600; }
.mascot-reset { min-height: 88rpx; margin-top: 24rpx; color: var(--kotoba-muted); background: transparent; }
.account-note { font-size: 25rpx; line-height: 1.7; }
.auth-methods { margin: 0 0 24rpx; }
.form-input { background: #f8faf4; border-radius: 16rpx; min-width: 0; }
.code-btn { padding: 12rpx 16rpx; min-width: 192rpx; font-size: 25rpx; }
.about-card { background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 30rpx 10rpx !important; }
.about-app { font-weight: 600; font-size: 30rpx; }
.about-version { margin: 12rpx 0; }
.privacy-card, .account-panel { animation-delay: 45ms; }
.data-panel { animation-delay: 90ms; }
.motion-options, .auth-methods { position: relative; gap: 0; border-radius: 18rpx; }
.segment-indicator { position: absolute; z-index: 0; left: 8rpx; top: 8rpx; bottom: 8rpx; width: calc(50% - 8rpx); border: 1rpx solid #c3d5b8; border-radius: 12rpx; background: var(--kotoba-paper); box-shadow: 0 4rpx 12rpx rgba(49,89,68,.06); transition: transform 300ms cubic-bezier(.2,.9,.3,1.2); pointer-events: none; }
.segment-right { transform: translateX(100%); }
.motion-choice { position: relative; z-index: 1; min-height: 44px; border: 0; }
.motion-choice.selected { background: transparent; border: 0; box-shadow: none; }
.version-row { align-items: center; margin-top: 28rpx; padding-top: 26rpx; border-top: 1rpx solid var(--kotoba-line); border-bottom: 0; }
.version-badge { padding: 7rpx 18rpx; border: 1rpx solid #c8d9bd; border-radius: 14rpx; background: #eef5e8; color: #315944; font-size: 25rpx; font-weight: 600; letter-spacing: 1rpx; }
.mascot-preview { margin-top: 22rpx; background: linear-gradient(115deg,#f0f6e8,#edf3e6); }
.mascot-reset { border-style: dashed; }
</style>
