<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import MiniPanel from './MiniPanel.vue';
import MiniNotice from './MiniNotice.vue';
import { ANSWER_SOUND_OPTIONS, miniAnswerSound } from '../services/answer-sound';

type AnswerSoundSchemeId = (typeof ANSWER_SOUND_OPTIONS)[number]['id'];

const busy = ref(false);
const loading = ref(false);
const message = ref('');
const messageTone = ref<'success' | 'error'>('success');
const previewMessage = ref('');
const previewTone = ref<'success' | 'error' | ''>('');
const previewBusy = ref(false);
const loadFailed = ref(false);
const volumeDraft = ref<number | null>(null);
const displayedVolume = computed(() => volumeDraft.value ?? Math.round(miniAnswerSound.state.volume * 100));
let previewGeneration = 0;

function stopPreview(clearFeedback = true) {
  previewGeneration += 1;
  previewBusy.value = false;
  miniAnswerSound.stop();
  if (clearFeedback) {
    previewMessage.value = '';
    previewTone.value = '';
  }
}

async function loadPreferences() {
  if (loading.value) return;
  loading.value = true;
  if (loadFailed.value) message.value = '';
  loadFailed.value = false;
  try {
    await miniAnswerSound.load();
  } catch {
    loadFailed.value = true;
    message.value = '提示音设置读取失败，请稍后重试。';
    messageTone.value = 'error';
  } finally {
    loading.value = false;
  }
}

onShow(() => {
  miniAnswerSound.setForeground(true);
  void loadPreferences();
});

function leavePage() {
  stopPreview();
}

onHide(leavePage);
onUnload(leavePage);
onUnmounted(leavePage);

async function savePreference(action: () => Promise<unknown>, successMessage: string) {
  if (busy.value || loading.value) return;
  stopPreview();
  busy.value = true;
  message.value = '';
  try {
    const result = await action();
    if (result === false) {
      message.value = '提示音设置保存失败，学习记录不受影响，请重试。';
      messageTone.value = 'error';
    } else {
      message.value = successMessage;
      messageTone.value = 'success';
    }
  } catch {
    message.value = '提示音设置保存失败，学习记录不受影响，请重试。';
    messageTone.value = 'error';
  } finally {
    busy.value = false;
    volumeDraft.value = null;
  }
}

function detailValue(event: unknown): unknown {
  if (!event || typeof event !== 'object' || !('detail' in event)) return undefined;
  const detail = event.detail;
  return detail && typeof detail === 'object' && 'value' in detail ? detail.value : undefined;
}

function eventValue(event: unknown): number | undefined {
  const value = detailValue(event);
  return typeof value === 'number' ? value : undefined;
}

function onEnabledChange(event: unknown) {
  const value = detailValue(event);
  if (typeof value !== 'boolean' && value !== 0 && value !== 1) return;
  const enabled = value === true || value === 1;
  void savePreference(
    () => miniAnswerSound.setEnabled(enabled),
    enabled ? '答题提示音已在本机开启。' : '答题提示音已在本机关闭。',
  );
}

function chooseScheme(id: AnswerSoundSchemeId) {
  void savePreference(() => miniAnswerSound.setScheme(id), '提示音方案已保存在本机。');
}

function onVolumeChanging(event: unknown) {
  if (busy.value || loading.value) return;
  const value = eventValue(event);
  if (value === undefined || !Number.isFinite(value)) return;
  volumeDraft.value = Math.max(0, Math.min(100, value));
  stopPreview();
}

function onVolumeChange(event: unknown) {
  const value = eventValue(event);
  if (value === undefined || !Number.isFinite(value)) {
    volumeDraft.value = null;
    return;
  }
  const percent = Math.max(0, Math.min(100, value));
  volumeDraft.value = percent;
  void savePreference(() => miniAnswerSound.setVolume(percent / 100), '提示音音量已保存在本机。');
}

async function preview(correct: boolean) {
  if (busy.value || loading.value || previewBusy.value || displayedVolume.value <= 0) return;
  stopPreview();
  const generation = previewGeneration;
  previewBusy.value = true;
  previewMessage.value = '正在请求试听…';
  previewTone.value = '';
  try {
    const succeeded = await miniAnswerSound.preview(correct);
    if (generation !== previewGeneration) return;
    previewMessage.value = succeeded
      ? '试听已播放。'
      : miniAnswerSound.state.playbackError || '试听暂不可用，请稍后重试。';
    previewTone.value = succeeded ? 'success' : 'error';
  } catch {
    if (generation !== previewGeneration) return;
    previewMessage.value = '试听失败，请稍后重试。';
    previewTone.value = 'error';
  } finally {
    if (generation === previewGeneration) previewBusy.value = false;
  }
}
</script>

<template>
  <MiniPanel
    icon="leaf"
    kicker="SOUND / 提示音偏好"
    title="答题提示音"
    description="为答题反馈选择轻提示，设置保存在本机。"
  >
    <view class="sound-toggle-row">
      <view class="sound-toggle-copy">
        <text class="section-title">自动播放</text>
        <text class="section-help">关闭后仍可手动试听。</text>
      </view>
      <view class="switch-touch-area">
        <switch
          class="sound-switch"
          :checked="miniAnswerSound.state.enabled"
          :disabled="busy || loading || !miniAnswerSound.state.ready"
          color="#315944"
          aria-label="自动播放答题提示音"
          @change="onEnabledChange"
        />
      </view>
    </view>

    <view class="setting-block">
      <text class="section-title">提示音方案</text>
      <text class="section-help">选一种适合自己的声音。</text>
      <view class="scheme-grid">
        <button
          v-for="option in ANSWER_SOUND_OPTIONS"
          :key="option.id"
          class="scheme-option"
          :class="{ selected: miniAnswerSound.state.scheme === option.id }"
          :disabled="busy || loading || !miniAnswerSound.state.ready"
          :aria-label="`选择${option.name}提示音`"
          :aria-pressed="miniAnswerSound.state.scheme === option.id"
          @tap="chooseScheme(option.id)"
        >
          <text class="scheme-name">{{ option.name }}</text>
          <text class="scheme-description">{{ option.description }}</text>
        </button>
      </view>
    </view>

    <view class="setting-block volume-block">
      <view class="volume-heading">
        <text class="section-title">音量</text>
        <text class="volume-value">{{ displayedVolume }}%</text>
      </view>
      <slider
        class="volume-slider"
        :value="displayedVolume"
        min="0"
        max="100"
        step="5"
        activeColor="#527b55"
        backgroundColor="#d9dfd0"
        block-color="#315944"
        block-size="22"
        :disabled="busy || loading || !miniAnswerSound.state.ready"
        :aria-label="`提示音音量，${displayedVolume}%`"
        @changing="onVolumeChanging"
        @change="onVolumeChange"
      />
      <text class="slider-hint">0% 时试听不可用</text>
    </view>

    <view class="setting-block preview-block">
      <text class="section-title">试听</text>
      <view class="preview-actions">
        <button
          class="preview-button"
          :disabled="busy || loading || previewBusy || !miniAnswerSound.state.ready || displayedVolume <= 0"
          @tap="preview(true)"
        >试听答对提示</button>
        <button
          class="preview-button"
          :disabled="busy || loading || previewBusy || !miniAnswerSound.state.ready || displayedVolume <= 0"
          @tap="preview(false)"
        >试听答错提示</button>
      </view>
      <text v-if="previewMessage" class="preview-feedback" :class="`feedback-${previewTone}`" aria-live="polite">{{ previewMessage }}</text>
    </view>

    <MiniNotice :message="message" :tone="messageTone" />
    <text v-if="loading || !miniAnswerSound.state.ready" class="load-hint">{{ loading ? '正在读取本机设置…' : loadFailed ? '' : '等待提示音设置就绪。' }}</text>
    <button v-if="loadFailed" class="retry-button" :disabled="loading" @tap="loadPreferences">重新读取设置</button>
  </MiniPanel>
</template>

<style scoped>
.sound-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; min-height: 96rpx; padding: 12rpx 0; border-bottom: 1rpx solid var(--kotoba-line); }
.sound-toggle-copy { display: flex; min-width: 0; flex-direction: column; gap: 6rpx; }
.section-title { display: block; color: var(--kotoba-ink); font-size: 28rpx; line-height: 1.4; font-weight: 600; }
.section-help, .slider-hint { display: block; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.55; }
.switch-touch-area { display: flex; flex: none; min-width: 88rpx; min-height: 88rpx; align-items: center; justify-content: center; }
.sound-switch { transform: scale(1.04); transform-origin: center; }
.setting-block { padding: 24rpx 0; border-bottom: 1rpx solid var(--kotoba-line); }
.setting-block:last-of-type { border-bottom: 0; }
.scheme-grid { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; }
.scheme-option { display: flex; flex: 0 0 48%; box-sizing: border-box; min-width: 0; min-height: 88px; margin: 0; padding: 16rpx 18rpx; flex-direction: column; align-items: flex-start; justify-content: center; gap: 6rpx; border: 1rpx solid var(--kotoba-line); border-radius: 16rpx; background: #f7f8f2; color: var(--kotoba-ink); text-align: left; white-space: normal; }
.scheme-option::after, .preview-button::after, .retry-button::after { border: 0; }
.scheme-option.selected { border-color: #9db997; background: #edf4e7; box-shadow: inset 0 0 0 1rpx #c5d7bd; }
.scheme-option[disabled], .preview-button[disabled], .retry-button[disabled] { opacity: .48; }
.scheme-name { display: block; font-size: 27rpx; line-height: 1.35; font-weight: 600; }
.scheme-description { display: block; width: 100%; color: var(--kotoba-muted); font-size: 22rpx; line-height: 1.45; overflow-wrap: anywhere; }
.volume-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; }
.volume-value { flex: none; color: var(--kotoba-green); font-size: 26rpx; font-weight: 600; font-variant-numeric: tabular-nums; }
.volume-slider { display: block; width: 100%; height: 48px; margin: 8rpx 0 0; box-sizing: border-box; }
.slider-hint { margin-top: 2rpx; }
.preview-block { padding-bottom: 18rpx; }
.preview-actions { display: flex; gap: 16rpx; margin-top: 14rpx; }
.preview-button, .retry-button { min-width: 0; min-height: 48px; margin: 0; padding: 0 16rpx; border: 1rpx solid #cbd7c5; border-radius: 14rpx; background: #f5f7f0; color: var(--kotoba-green); font-size: 24rpx; line-height: 1.35; }
.preview-button { flex: 1; }
.preview-button:active, .retry-button:active, .scheme-option:active { opacity: .76; }
.preview-feedback, .load-hint { display: block; margin-top: 12rpx; color: var(--kotoba-muted); font-size: 23rpx; line-height: 1.55; overflow-wrap: anywhere; }
.preview-feedback.feedback-success { color: #315944; }
.preview-feedback.feedback-error { color: #9a4a3f; }
.load-hint { margin-top: 12rpx; }
.retry-button { margin-top: 12rpx; }
</style>
