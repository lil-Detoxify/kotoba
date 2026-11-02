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
import { defaultAuthService, defaultSyncCoordinator } from "../../adapters";
import { defaultPrivacyConsent, PRIVACY_POLICY_VERSION } from "../../services/privacy-consent";
useMiniPageActivity();

const busy = ref(false);
const message = ref("");
const consentStatus = computed(() => defaultPrivacyConsent.state.status);
const consentLabel = computed(() => consentStatus.value === "accepted" ? "已同意" : consentStatus.value === "declined" ? "已拒绝，当前仅离线" : "尚未选择");
const platformAuthorizationRequired = ref(defaultPrivacyConsent.supportsPlatformAuthorization());

async function agreePrivacy() {
  if (busy.value || consentStatus.value === "accepted") return;
  busy.value = true;
  message.value = "";
  try {
    await defaultPrivacyConsent.accept();
    await defaultSyncCoordinator.init();
    message.value = "已同意，账号登录与云同步已开启。";
  } catch {
    message.value = "保存同意状态失败，请稍后重试。";
  } finally {
    busy.value = false;
  }
}

async function withdrawPrivacy() {
  if (busy.value || consentStatus.value !== "accepted") return;
  busy.value = true;
  try {
    defaultSyncCoordinator.signOutToGuest();
    await defaultPrivacyConsent.revoke();
    await defaultAuthService.clearLocalSession();
    message.value = "已撤回同意，账号与云同步已关闭；离线学习仍可继续。";
  } catch {
    message.value = "撤回未完成，请稍后重试。";
  } finally {
    busy.value = false;
  }
}

async function openPlatformPrivacy() {
  if (busy.value) return;
  busy.value = true;
  message.value = "";
  try {
    if (await defaultPrivacyConsent.openPrivacyContract()) return;
    message.value = "当前平台未提供官方指引入口，以上为本小程序的本地说明。";
  } catch {
    message.value = "打开微信平台指引失败，请稍后重试。";
  } finally {
    busy.value = false;
  }
}

onShow(() => {
  void defaultPrivacyConsent.load();
  void defaultPrivacyConsent.needsPlatformAuthorization().then((required) => {
    if (required !== null) platformAuthorizationRequired.value = required;
  });
});
</script>

<template>
  <MiniPage class="privacy-page">
    <MiniHeader kicker="PRIVACY / 由你决定" title="隐私保护说明" :description="`版本 ${PRIVACY_POLICY_VERSION} · 当前状态：${consentLabel}`" />

    <view class="card notice-card motion-enter">
      <text class="group-title">主体与联系方式</text>
      <text class="body-text">运营主体、联系方式以及具体服务方，以微信平台配置的《小程序用户隐私保护指引》展示内容为准。本页面不臆造或替代平台指引中的主体信息。</text>
    </view>

    <view class="card">
      <text class="group-title">当前代码处理的数据</text>
      <view class="data-item"><text class="data-title">词书与学习记录</text><text class="body-text">词书、单词状态、复习记录、当前词书和学习设置，用于离线学习与恢复进度，保存在小程序本地存储；较大的学习快照会写入小程序沙盒文件。</text></view>
      <view class="data-item"><text class="data-title">发音缓存</text><text class="body-text">发音地址和已下载音频文件，用于播放和离线复用，清单保存在本地存储，文件保存在小程序沙盒。</text></view>
      <view class="data-item"><text class="data-title">账号与同意记录</text><text class="body-text">登录邮箱、账号标识、访问令牌和刷新令牌，仅在登录与云同步时使用；会话和本说明的同意状态保存在小程序本地存储。你同意后，必要的账号与学习数据才会发送到 kotobud.com 的 Cloudflare Worker，并保存到 KotoBud 的 Cloudflare D1，用于跨端同步。</text></view>
    </view>

    <view class="card">
      <text class="group-title">你的选择</text>
      <text class="body-text">拒绝或撤回同意不会影响本机词书和纯离线学习，但会关闭邮箱登录、验证码发送和云同步。你可以随时回到本页重新选择。</text>
      <button v-if="consentStatus !== 'accepted' && platformAuthorizationRequired" class="primary-btn privacy-action" open-type="agreePrivacyAuthorization" :disabled="busy" :loading="busy" @agreeprivacyauthorization="agreePrivacy">同意并开启同步</button>
      <button v-else-if="consentStatus !== 'accepted'" class="primary-btn privacy-action" :disabled="busy" :loading="busy" @tap="agreePrivacy">同意并开启同步</button>
      <button v-else class="secondary-btn privacy-action" :disabled="busy" :loading="busy" @tap="withdrawPrivacy">撤回同意并关闭同步</button>
      <button class="secondary-btn privacy-action" :disabled="busy" :loading="busy" @tap="openPlatformPrivacy">打开微信平台指引</button>
      <MiniNotice :message="message" />
    </view>
  </MiniPage>
</template>

<style scoped>
.privacy-page { padding-bottom: calc(32rpx + env(safe-area-inset-bottom)); }
.section-header { margin-bottom: 24rpx; }
.section-title { display: block; font-size: 40rpx; font-weight: 700; color: #111827; margin-bottom: 6rpx; }
.section-desc { font-size: 26rpx; color: #6B7280; }
.group-title { display: block; font-size: 28rpx; font-weight: 700; color: #111827; margin-bottom: 18rpx; padding-bottom: 12rpx; border-bottom: 1rpx solid #F3F4F6; }
.body-text { display: block; color: #4B5563; font-size: 25rpx; line-height: 1.7; }
.data-item + .data-item { margin-top: 22rpx; }
.data-title { display: block; color: #1F2937; font-size: 26rpx; font-weight: 600; margin-bottom: 5rpx; }
.privacy-action { width: 100%; min-height: 88rpx; margin-top: 20rpx; }
.message { display: block; color: #047857; font-size: 24rpx; line-height: 1.5; margin-top: 16rpx; }
.notice-card { border-left: 6rpx solid #a2bb97; }
.group-title, .data-title { color: var(--kotoba-ink); }
.group-title { border-color: var(--kotoba-line); font-size: 31rpx; }
.body-text { color: var(--kotoba-muted); font-size: 26rpx; line-height: 1.8; }
.data-item + .data-item { margin-top: 30rpx; padding-top: 24rpx; border-top: 1rpx solid var(--kotoba-line); }
</style>
