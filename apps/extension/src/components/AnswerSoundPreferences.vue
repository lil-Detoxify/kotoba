<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { Check, Volume2, X } from 'lucide-vue-next';
import {
  ANSWER_SOUND_OPTIONS,
  previewAnswerSound,
  stopAnswerSound,
  useAnswerSoundPreference,
  type AnswerSoundScheme,
} from '../answer-sound';

const preference = useAnswerSoundPreference();
const enabled = preference.enabled;
const scheme = preference.scheme;
const volume = preference.volume;
const volumePercent = computed(() => Math.round(volume.value * 100));
const previewBusy = ref(false);
const previewError = ref('');
let previewGeneration = 0;

function stopPreview() {
  previewGeneration++;
  previewBusy.value = false;
  previewError.value = '';
  stopAnswerSound();
}

function isForegroundPage(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible' && !document.hidden;
}

function toggleEnabled() {
  stopPreview();
  preference.setEnabled(!enabled.value);
}

function chooseScheme(value: AnswerSoundScheme) {
  if (scheme.value === value) return;
  stopPreview();
  preference.setScheme(value);
}

function changeVolume(event: Event) {
  const nextVolume = Number((event.target as HTMLInputElement).value) / 100;
  if (nextVolume === volume.value) return;
  stopPreview();
  preference.setVolume(nextVolume);
}

async function preview(correct: boolean) {
  if (!isForegroundPage()) {
    stopPreview();
    previewError.value = '请在前台扩展页面中操作试听。';
    return;
  }
  if (volume.value <= 0 || previewBusy.value) return;

  const generation = ++previewGeneration;
  previewError.value = '';
  previewBusy.value = true;
  // The service calls HTMLAudioElement.play() synchronously within this button handler.
  const played = await previewAnswerSound(scheme.value, correct);
  if (generation !== previewGeneration) return;
  previewBusy.value = false;
  if (!played) previewError.value = '试听没有开始，请在扩展前台重新点击。';
}

function stopWhenHidden() {
  if (document.visibilityState !== 'visible' || document.hidden) stopPreview();
}

onMounted(() => {
  document.addEventListener('visibilitychange', stopWhenHidden);
  window.addEventListener('blur', stopPreview);
  window.addEventListener('pagehide', stopPreview);
});

onActivated(() => {
  // Clear any stale preview message when the settings panel is restored.
  previewError.value = '';
});

onDeactivated(stopPreview);

onUnmounted(() => {
  stopPreview();
  document.removeEventListener('visibilitychange', stopWhenHidden);
  window.removeEventListener('blur', stopPreview);
  window.removeEventListener('pagehide', stopPreview);
});
</script>

<template>
  <div class="answer-sound-settings" aria-labelledby="answer-sound-title">
    <div class="answer-sound-heading">
      <span class="answer-sound-icon" aria-hidden="true"><Volume2 :size="18" /></span>
      <div>
        <span class="settings-kicker">01 / ANSWER FEEDBACK</span>
        <h3 id="answer-sound-title">答题提示音</h3>
        <p>保存在当前扩展设备上，不进入账号或云同步。</p>
      </div>
    </div>

    <div class="answer-sound-toggle-row">
      <div><strong>播放答题提示音</strong><small>选择答案后，轻声反馈答对或待巩固</small></div>
      <button
        class="answer-sound-toggle"
        type="button"
        role="switch"
        :aria-checked="enabled"
        @click="toggleEnabled"
      >{{ enabled ? '已开启' : '已关闭' }}</button>
    </div>

    <fieldset class="answer-sound-schemes">
      <legend>提示音音色</legend>
      <div class="answer-sound-options">
        <button
          v-for="option in ANSWER_SOUND_OPTIONS"
          :key="option.id"
          type="button"
          class="answer-sound-option"
          :aria-pressed="scheme === option.id"
          @click="chooseScheme(option.id)"
        >
          <strong>{{ option.name }}</strong>
          <small>{{ option.description }}</small>
        </button>
      </div>
    </fieldset>

    <label class="answer-sound-volume" for="extension-answer-sound-volume">
      <span><strong>提示音音量</strong><small>轻一点，也能听见反馈</small></span>
      <span class="answer-sound-volume-control">
        <input
          id="extension-answer-sound-volume"
          type="range"
          min="0"
          max="100"
          step="5"
          :value="volumePercent"
          :aria-valuetext="`${volumePercent}%`"
          @input="changeVolume"
        />
        <output for="extension-answer-sound-volume">{{ volumePercent }}%</output>
      </span>
    </label>

    <div class="answer-sound-preview" aria-label="提示音试听">
      <button type="button" :disabled="volumePercent === 0 || previewBusy" @click="preview(true)">
        <Check :size="16" aria-hidden="true" />答对试听
      </button>
      <button type="button" :disabled="volumePercent === 0 || previewBusy" @click="preview(false)">
        <X :size="16" aria-hidden="true" />答错试听
      </button>
    </div>
    <p class="answer-sound-preview-hint">{{ volumePercent === 0 ? '调高音量后即可试听。' : '试听使用当前音量；关闭答题提示音时也可试听。' }}</p>
    <p v-if="previewError" class="answer-sound-preview-error" role="status">{{ previewError }}</p>
  </div>
</template>

<style scoped>
.answer-sound-settings { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.answer-sound-heading { display: flex; align-items: flex-start; gap: 11px; }
.answer-sound-icon { display: grid; flex: 0 0 36px; width: 36px; height: 36px; place-items: center; border-radius: 11px 4px 11px 4px; background: var(--green-soft); color: var(--green); }
.answer-sound-heading h3 { margin: 0; color: var(--ink); font-size: 14px; }
.answer-sound-heading p { margin: 5px 0 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.answer-sound-toggle-row, .answer-sound-volume { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
.answer-sound-toggle-row strong, .answer-sound-volume strong { display: block; color: var(--ink-soft); font-size: 12px; }
.answer-sound-toggle-row small, .answer-sound-volume small { display: block; margin-top: 4px; color: var(--muted); font-size: 10px; line-height: 1.5; }
.answer-sound-toggle { flex: none; min-width: 72px; min-height: 44px; padding: 7px 10px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--paper); color: var(--muted); font-size: 11px; font-weight: 650; cursor: pointer; }
.answer-sound-toggle[aria-checked="true"] { border-color: var(--green); background: var(--green); color: var(--paper); }
.answer-sound-schemes { padding: 0; margin: 0; border: 0; min-width: 0; }
.answer-sound-schemes legend { margin-bottom: 7px; color: var(--ink-soft); font-size: 12px; font-weight: 650; }
.answer-sound-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.answer-sound-option { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 3px; min-width: 0; min-height: 50px; padding: 7px 9px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--paper); text-align: left; cursor: pointer; }
.answer-sound-option[aria-pressed="true"] { border-color: var(--green); background: var(--green-pale); color: var(--green); }
.answer-sound-option strong { font-size: 12px; }
.answer-sound-option small { color: var(--muted); font-size: 10px; line-height: 1.4; }
.answer-sound-volume-control { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 96px; max-width: 150px; }
.answer-sound-volume-control input { width: 100%; min-width: 48px; accent-color: var(--green); }
.answer-sound-volume-control output { flex: 0 0 35px; color: var(--muted); font-size: 11px; text-align: right; font-variant-numeric: tabular-nums; }
.answer-sound-preview { display: flex; gap: 8px; }
.answer-sound-preview button { display: flex; align-items: center; justify-content: center; gap: 6px; flex: 1; min-width: 0; min-height: 44px; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--green-pale); color: var(--green); font-size: 11px; cursor: pointer; }
.answer-sound-preview button:disabled { color: var(--muted); opacity: .58; cursor: not-allowed; }
.answer-sound-preview-hint, .answer-sound-preview-error { margin: -8px 0 0; color: var(--muted); font-size: 10px; line-height: 1.55; }
.answer-sound-preview-error { color: var(--red); }
@media (max-width: 320px) {
  .answer-sound-options { gap: 6px; }
  .answer-sound-option { padding-right: 7px; padding-left: 7px; }
  .answer-sound-volume { align-items: flex-start; flex-direction: column; }
  .answer-sound-volume-control { width: 100%; max-width: none; }
}
</style>
