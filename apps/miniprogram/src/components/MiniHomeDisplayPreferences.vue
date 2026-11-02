<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import MiniPanel from './MiniPanel.vue';
import MiniNotice from './MiniNotice.vue';
import { MINI_HOME_DISPLAY_OPTIONS, miniHomeDisplayPreference, type MiniHomeDisplay } from '../services/home-display-preference';

const loading = ref(false);
const busy = ref(false);
const loadFailed = ref(false);
const message = ref('');
const messageTone = ref<'success' | 'error'>('success');

async function loadPreference() {
  if (loading.value) return;
  loading.value = true;
  loadFailed.value = false;
  message.value = '';
  try {
    await miniHomeDisplayPreference.load();
  } catch {
    loadFailed.value = true;
    message.value = '首页开屏偏好读取失败，请重试。';
    messageTone.value = 'error';
  } finally {
    loading.value = false;
  }
}

onShow(() => { void loadPreference(); });

async function choose(value: MiniHomeDisplay) {
  if (loading.value || busy.value || loadFailed.value || !miniHomeDisplayPreference.state.ready) return;
  if (value === miniHomeDisplayPreference.state.value) return;
  const option = MINI_HOME_DISPLAY_OPTIONS.find(item => item.value === value);
  if (!option) return;

  busy.value = true;
  message.value = '';
  try {
    await miniHomeDisplayPreference.set(value);
    message.value = `首页开屏已设为${option.label}，偏好已保存在本机。`;
    messageTone.value = 'success';
  } catch {
    message.value = '首页开屏偏好保存失败，请重试。';
    messageTone.value = 'error';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <MiniPanel
    icon="data"
    kicker="HOME / 首页偏好"
    title="首页开屏"
    description="选择打开首页时优先展示的内容。"
  >
    <text class="local-note">随时切换，设置只在这台设备生效。</text>

    <view class="display-options" aria-label="首页开屏方式">
      <button
        v-for="option in MINI_HOME_DISPLAY_OPTIONS"
        :key="option.value"
        class="display-option"
        :class="{ selected: miniHomeDisplayPreference.state.value === option.value && miniHomeDisplayPreference.state.ready && !loadFailed }"
        :disabled="loading || busy || loadFailed || !miniHomeDisplayPreference.state.ready"
        :aria-label="`${option.label}${miniHomeDisplayPreference.state.value === option.value && miniHomeDisplayPreference.state.ready && !loadFailed ? '，当前选中' : ''}`"
        :aria-pressed="miniHomeDisplayPreference.state.ready && !loadFailed && miniHomeDisplayPreference.state.value === option.value"
        @tap="choose(option.value)"
      >
        <view class="display-option-copy">
          <text class="display-option-label">{{ option.label }}</text>
          <text class="display-option-description">{{ option.description }}</text>
        </view>
        <text v-if="miniHomeDisplayPreference.state.ready && !loadFailed && miniHomeDisplayPreference.state.value === option.value" class="selected-label">当前选中</text>
      </button>
    </view>

    <text v-if="loading || (!miniHomeDisplayPreference.state.ready && !loadFailed)" class="load-hint">{{ loading ? '正在读取本机偏好…' : '等待首页偏好就绪。' }}</text>
    <MiniNotice :message="message" :tone="messageTone" />
    <button v-if="loadFailed" class="retry-button" :disabled="loading" :loading="loading" @tap="loadPreference">重新读取偏好</button>
  </MiniPanel>
</template>

<style scoped>
.local-note { display: block; margin: 0 0 18rpx; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.6; }
.display-options { display: flex; flex-direction: column; gap: 14rpx; }
.display-option { display: flex; box-sizing: border-box; width: 100%; min-width: 0; min-height: 104rpx; margin: 0; padding: 18rpx 20rpx; align-items: center; justify-content: space-between; gap: 16rpx; border: 1rpx solid var(--kotoba-line); border-radius: 16rpx; background: #f7f8f2; color: var(--kotoba-ink); text-align: left; white-space: normal; }
.display-option::after, .retry-button::after { border: 0; }
.display-option.selected { border-color: #9db997; background: #edf4e7; box-shadow: inset 0 0 0 1rpx #c5d7bd; }
.display-option[disabled], .retry-button[disabled] { opacity: .55; }
.display-option:active, .retry-button:active { opacity: .76; }
.display-option-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6rpx; }
.display-option-label { display: block; color: var(--kotoba-ink); font-size: 27rpx; line-height: 1.4; font-weight: 600; }
.display-option-description, .current-copy { display: block; color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.5; overflow-wrap: anywhere; }
.selected-label { flex: none; color: #315944; font-size: 22rpx; line-height: 1.4; font-weight: 600; }
.current-description { display: flex; margin-top: 16rpx; padding: 16rpx 18rpx; flex-direction: column; gap: 6rpx; border-radius: 14rpx; background: #eff5e9; }
.current-label { display: block; color: #315944; font-size: 24rpx; line-height: 1.4; font-weight: 600; }
.load-hint { display: block; margin-top: 14rpx; color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.5; }
.retry-button { min-width: 0; min-height: 48px; margin: 14rpx 0 0; padding: 0 18rpx; border: 1rpx solid #cbd7c5; border-radius: 14rpx; background: #f5f7f0; color: var(--kotoba-green); font-size: 24rpx; line-height: 1.35; }
</style>
