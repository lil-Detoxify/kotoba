<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { defaultAuthService, defaultSyncCoordinator } from "./adapters";
import { defaultPrivacyConsent } from "./services/privacy-consent";

let startupConsent: Promise<boolean> | undefined;
let syncStarted = false;

function consentAtStartup(): Promise<boolean> {
  if (!startupConsent) {
    const task = defaultPrivacyConsent.promptOnLaunch();
    const wrapped = task.finally(() => {
      if (startupConsent === wrapped) startupConsent = undefined;
    });
    startupConsent = wrapped;
  }
  return startupConsent;
}

function startSyncIfConsented(): void {
  if (!syncStarted) {
    syncStarted = true;
    void defaultSyncCoordinator.init();
  }
}

function stopSyncForPrivacy(): void {
  syncStarted = false;
  defaultSyncCoordinator.signOutToGuest();
  void defaultAuthService.clearLocalSession();
}

onLaunch(() => {
  void consentAtStartup().then((consented) => {
    if (consented) startSyncIfConsented();
    else stopSyncForPrivacy();
  });
});

onShow(() => {
  void consentAtStartup().then((consented) => {
    if (!consented) {
      stopSyncForPrivacy();
      return;
    }
    if (["idle", "signed_out", "error"].includes(defaultSyncCoordinator.state.phase)) void defaultSyncCoordinator.init();
    else {
      syncStarted = true;
      void defaultSyncCoordinator.flush("onShow");
    }
  });
});

onHide(() => {
  void defaultPrivacyConsent.isConsented().then((consented) => {
    if (consented) void defaultSyncCoordinator.flush("onHide");
  });
});
</script>

<style>
page {
  --kotoba-bg: #f7f8f4;
  --kotoba-paper: #fffefb;
  --kotoba-ink: #273c35;
  --kotoba-green: #365d49;
  --kotoba-muted: #69746b;
  --kotoba-line: #dfe5db;
  background-color: var(--kotoba-bg);
  color: var(--kotoba-ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
}

view, text, button, input {
  box-sizing: border-box;
}

.container {
  padding: 32rpx;
}

.card {
  background: #FFFFFF;
  border-radius: 20rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
  border: 1rpx solid #F0ECE4;
}

.primary-btn {
  background: var(--kotoba-green);
  color: #FFFFFF;
  border-radius: 16rpx;
  font-weight: 600;
  font-size: 30rpx;
  padding: 20rpx 48rpx;
  text-align: center;
  border: 1rpx solid var(--kotoba-green);
}

.secondary-btn {
  background: var(--kotoba-paper);
  color: var(--kotoba-ink);
  border-radius: 16rpx;
  font-weight: 500;
  font-size: 28rpx;
  padding: 16rpx 40rpx;
  text-align: center;
  border: 1rpx solid var(--kotoba-line);
}
</style>
