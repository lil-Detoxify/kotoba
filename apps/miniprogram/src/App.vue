<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
import { defaultAuthService, defaultSyncCoordinator } from "./adapters";
import { defaultPrivacyConsent } from "./services/privacy-consent";
import { miniUi } from "./services/ui-preferences";
import { miniAnswerSound } from "./services/answer-sound";

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
  void miniAnswerSound.load().catch(() => undefined);
  void miniUi.load();
  void consentAtStartup().then((consented) => {
    if (consented) startSyncIfConsented();
    else stopSyncForPrivacy();
  });
});

onShow(() => {
  miniAnswerSound.setForeground(true);
  miniUi.state.foreground = true;
  void miniUi.load();
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
  miniAnswerSound.setForeground(false);
  miniUi.state.foreground = false;
  void defaultPrivacyConsent.isConsented().then((consented) => {
    if (consented) void defaultSyncCoordinator.flush("onHide");
  });
});
</script>

<style>
@import "./ui-polish.css";
page {
  --kotoba-bg: #f8f9f5;
  --kotoba-paper: #fffefa;
  --kotoba-ink: #23392e;
  --kotoba-green: #315944;
  --kotoba-muted: #56665b;
  --kotoba-line: #d9e2d5;
  --kotoba-sage: #e8efdf;
  --kotoba-error: #873c2c;
  background-color: var(--kotoba-bg);
  color: var(--kotoba-ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
}

view, text, button, input {
  box-sizing: border-box;
}

button {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1.35;
  transition: transform 160ms cubic-bezier(.2,.8,.2,1), background-color 180ms ease, border-color 180ms ease, opacity 160ms ease;
}
button::after { border: 0; }
button[disabled] { opacity: .6; }

button.button-hover {
  opacity: .9;
  transform: scale(.97) translateY(1rpx);
}

.container {
  padding: 32rpx;
}

.card {
  background: var(--kotoba-paper);
  border-radius: 28rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 12rpx 36rpx rgba(35, 57, 46, 0.04);
  border: 1rpx solid var(--kotoba-line);
}

.primary-btn {
  background: var(--kotoba-green);
  color: #FFFFFF;
  border-radius: 18rpx;
  font-weight: 600;
  font-size: 30rpx;
  padding: 20rpx 48rpx;
  text-align: center;
  border: 1rpx solid var(--kotoba-green);
  min-height: 88rpx;
}

.secondary-btn {
  background: var(--kotoba-paper);
  color: var(--kotoba-ink);
  border-radius: 18rpx;
  font-weight: 500;
  font-size: 28rpx;
  padding: 16rpx 40rpx;
  text-align: center;
  border: 1rpx solid var(--kotoba-line);
  min-height: 88rpx;
}
</style>
