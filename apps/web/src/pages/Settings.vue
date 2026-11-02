<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { gsap } from 'gsap';
import { Cloud, CloudOff, RefreshCw, LogOut, RotateCcw, Volume2, Leaf, Download, Upload } from 'lucide-vue-next';
import { useApp } from '../store';
import { PRONUNCIATION_VOICES, usePronunciationPreference, type PronunciationVoice } from '../services/pronunciationPreference';
import { HOME_DISPLAY_OPTIONS, useHomeDisplayPreference, type HomeDisplay } from '../services/home-display-preference';
import { STUDY_EXERCISE_OPTIONS, useStudyExercisePreference, type StudyExercisePreference } from '../services/study-exercise-preference';
import { ANSWER_SOUND_OPTIONS, previewAnswerSound, stopAnswerSound, useAnswerSoundPreference, type AnswerSoundScheme } from '../services/answer-sound';
import { useWordAutoplayPreference } from '../services/word-autoplay-preference';
import { PET_MANIFESTS } from '../pet/manifest';
import { resolvePetAnimation } from '../pet/manifest';
import PetSprite from '../components/PetSprite.vue';
import PersonalLibraryCloudBackup from '../components/PersonalLibraryCloudBackup.vue';
import DictionaryPreferences from '../components/DictionaryPreferences.vue';
import { pet, resetPetPosition, setPetSettings } from '../pet/runtime';
import { effectiveReducedMotion } from '../pet/settings';
import { showWindowsDownload } from '../services/clientPlatform';
import { RouterLink } from 'vue-router';
import type { PetVariant } from '../pet/model';
import packageInfo from '../../../../package.json';
import type { WechatAttempt } from '../services/wechatAuth';
import brandMarkUrl from '../assets/brand/kotobud-mark.svg';

const app = useApp();
// Development plan is archived. Re-enable only after an explicit product decision.
const wechatLoginAvailable = false;
const pronunciation = usePronunciationPreference();
const voice = pronunciation.voice;
const homeDisplayPreference = useHomeDisplayPreference();
const homeDisplay = homeDisplayPreference.display;
const studyExercisePreference = useStudyExercisePreference();
const studyExercise = studyExercisePreference.exercise;
const answerSoundPreference = useAnswerSoundPreference();
const answerSoundEnabled = answerSoundPreference.enabled;
const wordAutoplayPreference = useWordAutoplayPreference();
const wordAutoplayEnabled = wordAutoplayPreference.enabled;
const answerSoundScheme = answerSoundPreference.scheme;
const answerSoundVolume = answerSoundPreference.volume;
const previewPreparing = ref(false);
const previewError = ref('');
let previewGeneration = 0;
const reduced = computed(() => effectiveReducedMotion(pet.settings, pet.systemPrefersReduced));
const recordCount = computed(() => app.data.logs.length);
const wordCount = computed(() => app.data.states.filter(state => state.status !== 'new').length);
const canDownloadWindows = showWindowsDownload(
  window.location.protocol, navigator.userAgent, navigator.platform, navigator.maxTouchPoints,
);
const windowsDownloadsReady = import.meta.env.VITE_WINDOWS_DOWNLOADS_READY === 'true';
const windowsDownloadVersion = '0.9.3';
const wechatAttempt = ref<WechatAttempt | null>(null);
const wechatBusy = ref(false);
const wechatMessage = ref('');
const settingsLayout = ref<HTMLElement | null>(null);
const feedback = ref('');
let settingsMotion: gsap.Context | undefined;
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
let wechatTimer: ReturnType<typeof setTimeout> | null = null;

const motionAllowed = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !reduced.value;

onMounted(() => {
  if (!settingsLayout.value || !motionAllowed()) return;
  settingsMotion = gsap.context(() => {
    gsap.from('.settings-column > .settings-panel:first-child', {
      autoAlpha: 0, y: 8, duration: 0.24, stagger: 0.04,
      ease: 'power2.out', clearProps: 'all',
    });
  }, settingsLayout.value);
});

onUnmounted(() => {
  cancelSoundPreview();
  if (wechatTimer) clearTimeout(wechatTimer);
  if (feedbackTimer) clearTimeout(feedbackTimer);
  settingsMotion?.revert();
});

async function showFeedback(message: string, target?: EventTarget | null): Promise<void> {
  feedback.value = message;
  if (feedbackTimer) clearTimeout(feedbackTimer);
  if (motionAllowed()) {
    await nextTick();
    const notice = settingsLayout.value?.querySelector('.settings-feedback');
    if (notice) gsap.fromTo(notice, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.2, ease: 'power2.out', overwrite: true, clearProps: 'all' });
  }
  feedbackTimer = setTimeout(() => { feedback.value = ''; }, 2600);
}

async function startWechatLink(): Promise<void> {
  if (wechatBusy.value) return;
  wechatBusy.value = true;
  wechatMessage.value = '';
  try {
    const attempt = await app.startWechatLink();
    wechatAttempt.value = attempt;
    scheduleWechatLinkPoll(attempt);
  } catch (error) { wechatMessage.value = error instanceof Error ? error.message : '微信绑定暂时不可用。'; }
  finally { wechatBusy.value = false; }
}

function scheduleWechatLinkPoll(attempt: WechatAttempt): void {
  if (wechatTimer) clearTimeout(wechatTimer);
  wechatTimer = setTimeout(async () => {
    if (wechatAttempt.value?.attemptId !== attempt.attemptId) return;
    if (Date.now() >= Date.parse(attempt.expiresAt)) {
      wechatMessage.value = '二维码已过期，请重新获取。';
      wechatAttempt.value = null;
      return;
    }
    try {
      if (await app.finishWechatLink(attempt)) {
        wechatAttempt.value = null;
        wechatMessage.value = '微信已绑定当前账号，学习记录未改变。';
      } else scheduleWechatLinkPoll(attempt);
    } catch (error) { wechatMessage.value = error instanceof Error ? error.message : '微信绑定失败，请重试。'; }
  }, 2000);
}

function changeVoice(event: Event): void {
  pronunciation.setVoice((event.target as HTMLSelectElement).value as PronunciationVoice);
  void showFeedback('发音声音已更新', event.target);
}
function changeHomeDisplay(event: Event): void {
  homeDisplayPreference.setDisplay((event.target as HTMLSelectElement).value as HomeDisplay);
  void showFeedback('首页开屏已更新', event.target);
}
function changeStudyExercise(event: Event): void {
  studyExercisePreference.setExercise((event.target as HTMLSelectElement).value as StudyExercisePreference);
  void showFeedback('默认学习方式已更新', event.target);
}
function changeAnswerSoundEnabled(event: Event): void {
  cancelSoundPreview();
  const enabled = (event.target as HTMLInputElement).checked;
  answerSoundPreference.setEnabled(enabled);
  void showFeedback(enabled ? '答题提示音已开启' : '答题提示音已关闭', event.target);
}
function changeWordAutoplayEnabled(event: Event): void {
  wordAutoplayPreference.setEnabled((event.target as HTMLInputElement).checked);
}
function changeAnswerSoundScheme(event: Event): void {
  cancelSoundPreview();
  const value = (event.target as HTMLSelectElement).value as AnswerSoundScheme;
  answerSoundPreference.setScheme(value);
  void showFeedback(`提示音已切换为${ANSWER_SOUND_OPTIONS.find(option => option.id === value)?.name ?? ''}`, event.target);
}
function changeAnswerSoundVolume(event: Event): void {
  const volume = Number((event.target as HTMLInputElement).value) / 100;
  if (volume === 0) cancelSoundPreview();
  else previewError.value = '';
  answerSoundPreference.setVolume(volume);
}
function cancelSoundPreview(): void {
  previewGeneration++;
  previewPreparing.value = false;
  previewError.value = '';
  stopAnswerSound();
}
async function previewSound(correct: boolean): Promise<void> {
  if (answerSoundVolume.value === 0) return;
  const generation = ++previewGeneration;
  previewError.value = '';
  previewPreparing.value = true;
  const played = await previewAnswerSound(answerSoundScheme.value, correct);
  if (generation !== previewGeneration) return;
  previewPreparing.value = false;
  if (!played) previewError.value = '暂时无法播放，请再试一次。';
}
function selectVariant(variant: PetVariant, event: Event): void {
  setPetSettings({ variant });
  void showFeedback(`已切换为${PET_MANIFESTS[variant].name}`, event.target);
  if (motionAllowed()) {
    const portrait = (event.currentTarget as HTMLElement)?.querySelector('.variant-portrait');
    if (portrait) gsap.fromTo(portrait, { y: 3 }, { y: 0, duration: 0.24, ease: 'power2.out', overwrite: true, clearProps: 'transform' });
  }
}
function onEnabled(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked;
  setPetSettings({ enabled });
  void showFeedback(enabled ? '叶团猫已回来陪伴' : '叶团猫已休息', event.target);
}
function onReactions(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked;
  setPetSettings({ reactionsEnabled: enabled });
  void showFeedback(enabled ? '学习反馈已开启' : '学习反馈已关闭', event.target);
}
function onStudyVisibility(event: Event): void {
  setPetSettings({ studyVisibility: (event.target as HTMLSelectElement).value === 'companion' ? 'companion' : 'hide' });
  void showFeedback('学习时的陪伴方式已更新', event.target);
}
function onMotion(event: Event): void {
  setPetSettings({ motionMode: (event.target as HTMLSelectElement).value === 'reduced' ? 'reduced' : 'standard' });
  void showFeedback('动画模式已更新', event.target);
}
function onResetPosition(event: Event): void { resetPetPosition(); void showFeedback('叶团猫已回到默认位置', event.currentTarget); }

function exportPersonalLibrary(event: Event): void {
  try {
    const file = app.exportPersonalLibrary();
    const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    void showFeedback('个人词库文件已导出', event.currentTarget);
  } catch (error) {
    void showFeedback(error instanceof Error ? error.message : '导出失败，请重试。', event.currentTarget);
  }
}
</script>

<template>
  <section class="page-heading settings-heading">
    <div><p class="eyebrow">YOUR SPACE · 自在学习</p><h1>设置与关于<span class="heading-spark" aria-hidden="true">✳</span></h1><p class="muted">声音、陪伴与学习节奏，随时调成你喜欢的样子。</p></div>
    <div class="settings-heading-mark" aria-hidden="true"><span>ことば</span><img class="brand-seal-mark" :src="brandMarkUrl" alt="" width="80" height="80"></div>
  </section>
  <div ref="settingsLayout" class="settings-layout">
    <div v-if="feedback" class="settings-feedback" role="status" aria-live="polite"><span class="feedback-check" aria-hidden="true">✓</span>{{ feedback }}</div>
    <div class="settings-column">
    <section class="settings-panel" aria-labelledby="sound-heading">
      <div class="panel-heading"><span class="panel-icon"><Volume2 :size="20"/></span><div><span class="panel-kicker">01 / LISTEN</span><h2 id="sound-heading">发音与学习</h2><p>选择听起来更顺耳的日语发音。</p></div></div>
      <label class="setting-row" for="pronunciation-voice"><span><strong>发音声音</strong><small>单词与例句朗读使用同一个选择</small></span>
        <select id="pronunciation-voice" :value="voice" @change="changeVoice">
          <option v-for="option in PRONUNCIATION_VOICES" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label class="setting-row" for="home-display"><span><strong>首页开屏</strong><small>{{ HOME_DISPLAY_OPTIONS.find(option => option.value === homeDisplay)?.description }}（仅在这台设备生效）</small></span>
        <select id="home-display" :value="homeDisplay" @change="changeHomeDisplay">
          <option v-for="option in HOME_DISPLAY_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label class="setting-row" for="study-exercise"><span><strong>默认学习方式</strong><small>{{ STUDY_EXERCISE_OPTIONS.find(option => option.value === studyExercise)?.description }} 新一轮使用所选方式，继续学习保留原题型。（仅本机）</small></span>
        <select id="study-exercise" :value="studyExercise" @change="changeStudyExercise">
          <option v-for="option in STUDY_EXERCISE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label class="setting-row switch-row" for="word-autoplay-enabled"><span><strong>自动发音</strong><small>学习和复习时，进入新词自动朗读一次。<br>键入、选读音和填空题在揭晓后朗读。手动点击发音仍可使用。</small></span><input id="word-autoplay-enabled" type="checkbox" :checked="wordAutoplayEnabled" @change="changeWordAutoplayEnabled" /></label>
      <label class="setting-row switch-row" for="answer-sound-enabled"><span><strong>答题提示音</strong><small>用轻声反馈回应记住与待巩固的答案</small></span><input id="answer-sound-enabled" type="checkbox" :checked="answerSoundEnabled" @change="changeAnswerSoundEnabled" /></label>
      <label class="setting-row" for="answer-sound-scheme"><span><strong>提示音音色</strong><small>{{ ANSWER_SOUND_OPTIONS.find(option => option.id === answerSoundScheme)?.description }}</small></span>
        <select id="answer-sound-scheme" :value="answerSoundScheme" @change="changeAnswerSoundScheme"><option v-for="option in ANSWER_SOUND_OPTIONS" :key="option.id" :value="option.id">{{ option.name }}</option></select>
      </label>
      <label class="setting-row answer-volume-row" for="answer-sound-volume"><span><strong>提示音音量</strong><small>轻一点，也能听见反馈</small></span><span class="answer-volume-control"><input id="answer-sound-volume" type="range" min="0" max="100" step="5" :value="Math.round(answerSoundVolume * 100)" :aria-valuetext="`${Math.round(answerSoundVolume * 100)}%`" @input="changeAnswerSoundVolume" /><output for="answer-sound-volume">{{ Math.round(answerSoundVolume * 100) }}%</output></span></label>
      <div class="answer-sound-preview" aria-label="提示音试听">
        <div class="answer-preview-buttons">
          <button type="button" class="answer-preview-correct" :disabled="answerSoundVolume === 0" :aria-busy="previewPreparing" @click="previewSound(true)"><Volume2 :size="16" aria-hidden="true"/>答对试听</button>
          <button type="button" class="answer-preview-incorrect" :disabled="answerSoundVolume === 0" :aria-busy="previewPreparing" @click="previewSound(false)"><Volume2 :size="16" aria-hidden="true"/>答错试听</button>
        </div>
        <p class="answer-preview-hint">{{ answerSoundVolume === 0 ? '调高音量后即可试听。' : '使用当前音量，关闭答题提示音也可试听。' }}</p>
        <p v-if="previewError" class="answer-preview-error" role="status">{{ previewError }}</p>
      </div>
      <p class="panel-footnote">日语发音沿用账户偏好；答题提示音的选择仅在这台设备生效。</p>
    </section>

    <section class="settings-panel" aria-labelledby="account-heading">
      <div class="panel-heading"><span class="panel-icon"><Cloud :size="20"/></span><div><span class="panel-kicker">02 / ACCOUNT</span><h2 id="account-heading">账户与同步</h2><p>学习数据仍由原有账户同步流程管理。</p></div></div>
      <template v-if="app.currentUser">
        <div class="setting-row"><span><strong>当前账号</strong><small>{{ app.currentUser.email || app.currentUser.id }}</small></span><span class="sync-status">{{ app.syncStatus === 'synced' ? '已同步' : app.syncStatus === 'syncing' ? '正在同步' : app.syncStatus === 'offline' ? '离线待同步' : '同步需重试' }}</span></div>
        <p v-if="app.syncError" class="sync-error" role="alert">{{ app.syncError }}</p>
        <div class="settings-actions"><button type="button" :disabled="!app.isSyncReady || app.syncStatus === 'syncing'" @click="app.flushSyncQueue()"><RefreshCw :size="15"/>立即同步</button>
          <button type="button" @click="app.logout()"><LogOut :size="15"/>退出登录</button></div>
        <div v-if="wechatLoginAvailable" class="settings-actions"><button type="button" :disabled="wechatBusy" @click="startWechatLink">绑定微信登录</button><a v-if="wechatAttempt" :href="wechatAttempt.authorizeUrl" target="_blank" rel="noopener noreferrer">打开微信扫码页</a></div>
        <p v-if="wechatAttempt" class="panel-footnote">用要绑定的微信扫码确认，然后返回这里等待绑定完成。</p>
        <p v-if="wechatMessage" class="panel-footnote" role="status">{{ wechatMessage }}</p>
        <p v-if="!app.isSyncReady" class="panel-footnote">首次云端拉取与校验完成前，同步上传保持关闭。</p>
      </template>
      <template v-else><p class="muted">未登录时，学习记录保存在本机。</p><button type="button" class="primary" @click="app.showLoginModal = true"><CloudOff :size="15"/>登录并开启云同步</button></template>
    </section>

    <section class="settings-panel" aria-labelledby="dictionary-settings-heading">
      <div class="panel-heading"><div><span class="panel-kicker">DICTIONARY</span><h2 id="dictionary-settings-heading">词典与查阅</h2><p>按自己的习惯选择释义来源与查看顺序。</p></div></div>
      <DictionaryPreferences />
    </section>

    <section class="settings-panel" aria-labelledby="data-heading">
      <div class="panel-heading"><div><span class="panel-kicker">03 / DATA</span><h2 id="data-heading">数据与关于</h2><p>看得见的学习记录，稳稳地留在这里。</p></div></div>
      <div class="setting-row"><span><strong>本机学习记录</strong><small>已学 {{ wordCount }} 词 · 累计评价 {{ recordCount }} 次</small></span></div>
      <div class="setting-row"><span><strong>学习起点</strong><small>按教材、JLPT 或日常用语重新选择方向</small></span><RouterLink class="button learning-start-link" to="/start">选择起点</RouterLink></div>
      <div class="setting-row"><span><strong>隐私与存储</strong><small>本机使用 IndexedDB；登录后按原有账户同步规则处理学习数据。宠物偏好和位置仅保存在本机。</small></span></div>
      <PersonalLibraryCloudBackup />
      <div class="setting-stack personal-library-transfer">
        <div class="transfer-heading"><strong>个人词库文件</strong><span class="transfer-count">{{ app.personalLibrarySummary.bookCount }} 本词书 · {{ app.personalLibrarySummary.lessonCount }} 课次 · {{ app.personalLibrarySummary.wordCount }} 词 · {{ app.personalLibrarySummary.contextCount }} 条原句</span></div>
        <p>也可以把自建词书、例句、笔记和收藏原句导出为文件，在设备间合并导入。学习记录由账户同步单独管理。</p>
        <div class="settings-actions transfer-actions">
          <button type="button" :disabled="app.busy || (!app.personalLibrarySummary.bookCount && !app.personalLibrarySummary.contextCount)" @click="exportPersonalLibrary"><Download :size="15" aria-hidden="true"/>导出词库包</button>
          <RouterLink class="button" to="/import?mode=file"><Upload :size="15" aria-hidden="true"/>合并导入</RouterLink>
        </div>
      </div>
      <div class="setting-row"><span><strong>Kotobud 版本</strong></span><span>{{ packageInfo.version }}</span></div>
    </section>

    </div>
    <div class="settings-column">
    <section class="settings-panel pet-panel" aria-labelledby="pet-heading">
      <div class="panel-heading"><span class="panel-icon"><Leaf :size="20"/></span><div><span class="panel-kicker">04 / COMPANION</span><h2 id="pet-heading">叶团猫宠物</h2><p>安静陪伴学习，不记录额外的养成数值。</p></div></div>
      <label class="setting-row switch-row"><span><strong>显示叶团猫</strong><small>关闭后停止宠物动画与计时</small></span><input type="checkbox" :checked="pet.settings.enabled" @change="onEnabled" /></label>
      <label class="setting-row" for="pet-study-visibility"><span><strong>学习与复习时</strong><small>选择陪伴时，叶团猫会待在单词右侧，不遮挡操作按钮</small></span>
        <select id="pet-study-visibility" :value="pet.settings.studyVisibility" @change="onStudyVisibility"><option value="hide">自动隐藏</option><option value="companion">继续陪伴</option></select>
      </label>
      <div class="setting-stack"><strong>选择形象</strong><div class="variant-options">
        <button v-for="variant in (['classic','pixel'] as const)" :key="variant" type="button" class="variant-card"
          :class="{ selected: pet.settings.variant === variant }" :aria-pressed="pet.settings.variant === variant"
          @click="selectVariant(variant, $event)">
          <PetSprite class="variant-portrait" :frame="resolvePetAnimation(PET_MANIFESTS[variant], 'idle').frames[0]" :pixel="variant === 'pixel'" />
          <span>{{ PET_MANIFESTS[variant].name }}</span>
        </button>
      </div><small>两种形象共用相同的学习姿态与轻互动。</small></div>
      <label class="setting-row switch-row"><span><strong>学习互动反馈</strong><small>答题、连续正确和完成时轻微回应</small></span><input type="checkbox" :checked="pet.settings.reactionsEnabled" @change="onReactions" /></label>
      <label class="setting-row" for="pet-motion"><span><strong>动画模式</strong><small>系统要求减少动态效果时始终使用静态姿势</small></span>
        <select id="pet-motion" :value="pet.settings.motionMode" @change="onMotion"><option value="standard">标准</option><option value="reduced">减少动态</option></select>
      </label>
      <p class="panel-footnote">当前{{ reduced ? '使用静态姿势' : '使用低频动画' }}。形象与偏好仅保存在这台设备。</p>
      <button type="button" class="quiet-action" @click="onResetPosition"><RotateCcw :size="15"/>重置宠物位置</button>
    </section>

    <section v-if="canDownloadWindows" class="settings-panel" aria-labelledby="download-heading">
      <div class="panel-heading"><span class="panel-icon"><Download :size="20"/></span><div><span class="panel-kicker">05 / DESKTOP</span><h2 id="download-heading">下载 Windows 版</h2><p>KotoBud {{ windowsDownloadVersion }} · Windows x64 · 支持离线学习</p></div></div>
      <p v-if="!windowsDownloadsReady" class="panel-footnote">安装包上传尚未完成，下载暂不可用。</p>
      <div class="settings-actions download-actions">
        <a class="button primary" :href="windowsDownloadsReady ? `/downloads/KotoBud-${windowsDownloadVersion}-Windows-x64-Setup.exe` : undefined" :aria-disabled="!windowsDownloadsReady">下载安装版</a>
        <a class="button" :href="windowsDownloadsReady ? `/downloads/KotoBud-${windowsDownloadVersion}-Windows-x64-Portable.exe` : undefined" :aria-disabled="!windowsDownloadsReady">下载便携版</a>
      </div>
    </section>
    </div>
  </div>
</template>

<style scoped>
.settings-heading{margin-bottom:26px}.settings-layout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin-bottom:50px}.settings-panel{padding:26px;background:var(--paper);border:1px solid var(--line);border-radius:14px;min-width:0}.panel-heading{display:flex;align-items:flex-start;gap:13px;color:var(--green);padding-bottom:18px;border-bottom:1px solid var(--line)}.panel-heading h2{margin:0 0 5px;color:#273c35}.panel-heading p{font-size:12px;color:var(--muted);margin:0}.setting-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 0;border-bottom:1px solid #edf0e9;font-size:13px}.setting-row:last-child{border-bottom:0}.setting-row strong,.setting-stack>strong{display:block;font-size:14px;font-weight:600}.setting-row small,.setting-stack small{display:block;margin-top:6px;color:var(--muted);line-height:1.55}.setting-row select{width:auto;min-width:145px;margin:0;padding:9px 12px;font-size:13px}.switch-row input[type=checkbox]{flex:none;accent-color:var(--green);cursor:pointer}.setting-stack{padding:18px 0;border-bottom:1px solid #edf0e9}.variant-options{display:flex;gap:12px;margin-top:13px}.variant-card{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;background:#f8faf5;border:1px solid var(--line);font-size:12px}.variant-card.selected{border-color:#729074;background:#edf3e9;color:#2c5c3d}.variant-portrait{width:104px;height:104px}.panel-footnote{color:var(--muted);font-size:11px;margin:13px 0 0;line-height:1.6}.quiet-action{border:0;background:transparent;color:var(--green);padding:10px 0;min-height:36px;font-size:12px}.settings-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:19px}.settings-actions button{font-size:12px}.sync-status{color:var(--green);font-size:12px;white-space:nowrap}.sync-error{font-size:12px;color:#873c2c;margin:12px 0}.muted{margin-top:18px}
@media(max-width:950px){.settings-layout{grid-template-columns:1fr}}@media(max-width:760px){.settings-panel{padding:19px}.setting-row{align-items:flex-start}.setting-row select{min-width:120px}.settings-layout{gap:14px}.variant-card{padding:9px}}
.download-actions [aria-disabled="true"]{opacity:.5;cursor:not-allowed}
.personal-library-transfer p{margin:9px 0 0;color:var(--muted);font-size:12px;line-height:1.75;max-width:62ch}.transfer-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px 14px;flex-wrap:wrap}.transfer-heading>strong{color:#294638;font-size:14px;font-weight:650}.transfer-count{color:#526a53;font-size:11px;line-height:1.7}.transfer-actions{margin-top:13px}.transfer-actions button,.transfer-actions .button{min-height:44px;font-size:12px}
.learning-start-link{flex:none;min-height:44px;font-size:12px;white-space:nowrap}
.answer-volume-control{display:flex;align-items:center;gap:10px;flex:0 0 170px;min-width:0}.answer-volume-control input{width:125px;min-width:0;min-height:44px;margin:0;padding:0;accent-color:var(--green);cursor:pointer}.answer-volume-control output{font-size:12px;color:var(--green);min-width:35px;text-align:right}.answer-volume-control input:focus-visible{outline:3px solid #b08037;outline-offset:3px}.answer-volume-row{flex-wrap:wrap}
.answer-sound-preview{padding-top:16px}.answer-preview-buttons{display:flex;gap:10px;flex-wrap:wrap}.answer-preview-buttons button{min-height:44px;padding:10px 14px;border-color:#c9dac7;background:#f5f8f1;color:var(--green);font-size:13px}.answer-preview-buttons button:focus-visible{outline:3px solid #b08037;outline-offset:3px}.answer-preview-hint{margin:9px 0 0;font-size:12px;line-height:1.7;color:var(--muted)}.answer-preview-error{margin:7px 0 0;font-size:12px;color:#873c2c;line-height:1.7}

/* A calmer canvas with unmistakable feedback at each interaction. */
.settings-heading{position:relative;min-height:166px;padding:30px 36px;margin-bottom:22px;overflow:hidden;border-radius:22px;background:radial-gradient(circle at 86% 16%,#dfe9ce 0,transparent 38%),linear-gradient(120deg,#eaf2e2,#f6f7ed 72%);border:1px solid #dce7d3}
.settings-heading .eyebrow{color:#507158;font-size:11px;font-weight:700;letter-spacing:.16em}
.settings-heading h1{margin-bottom:8px;color:#254835;font-size:clamp(34px,3.3vw,48px);letter-spacing:-.055em;line-height:1.12}
.settings-heading .muted{color:#536c5a;margin:0;font-size:14px}
.heading-spark{display:inline-block;margin-left:12px;color:#b8a24c;font-family:serif;font-size:.54em;vertical-align:top;transform:rotate(-18deg)}
.settings-heading-mark{position:absolute;right:7%;top:13px;display:grid;place-items:center;width:156px;height:156px;transform:rotate(12deg);pointer-events:none;color:#50765d}
.settings-heading-mark::before,.settings-heading-mark::after{content:"";position:absolute;border:1px solid rgba(83,119,84,.24);border-radius:50%;inset:5px}
.settings-heading-mark::after{inset:20px;border-style:dashed}
.settings-heading-mark strong{font:72px/1 "Yu Mincho","Noto Serif JP",serif;font-weight:400}
.settings-heading-mark span{position:absolute;bottom:2px;font:11px/1 serif;letter-spacing:.2em}
.settings-layout{position:relative;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);gap:18px;align-items:start}
.settings-panel{position:relative;overflow:hidden;padding:27px 30px 29px;border:1px solid #dfe7db;border-radius:20px;background:var(--paper);box-shadow:0 12px 36px rgba(35,72,47,.045);transition:border-color .24s ease,box-shadow .24s ease,transform .24s ease}
.settings-panel:hover{border-color:var(--border-strong)}
.settings-panel::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#88aa7c;opacity:0;transition:opacity .2s ease}
.settings-panel:hover::before,.settings-panel:focus-within::before{opacity:1}
.settings-column{display:flex;flex-direction:column;gap:18px;min-width:0}
.pet-panel{background:var(--paper)}
.panel-heading{gap:15px;padding-bottom:20px;margin-bottom:2px;border-color:#e6ece2}
.panel-heading h2{margin:2px 0 5px;color:#274535;font-size:21px;letter-spacing:-.035em}
.panel-heading p{font-size:12px;line-height:1.55}
.panel-kicker{font-size:10px;font-weight:700;letter-spacing:.15em;color:#7d9875}
.panel-icon{display:grid;place-items:center;flex:none;width:41px;height:41px;border-radius:13px 5px 13px 5px;background:#e4efdc;color:#406c4b;transition:transform .35s cubic-bezier(.18,.89,.32,1.28),background .25s}
.settings-panel:hover .panel-icon{background:#d5e8cc}
.setting-row{min-height:75px;gap:20px;border-color:#e9eee6;transition:background var(--motion-fast) ease}
.setting-row:hover{background:var(--surface-muted);border-radius:var(--radius-control)}
.setting-row strong,.setting-stack>strong{color:#294638;font-size:14px;font-weight:650}
.setting-row small,.setting-stack small{font-size:11px;max-width:42ch}
.setting-row select{min-height:42px;border-radius:10px;border-color:#c9dac7;background:#f8fbf5;font-weight:600;cursor:pointer;transition:border-color .2s,box-shadow .2s,background .2s}
.setting-row select:hover,.setting-row select:focus{border-color:#709d74;background:#fff;box-shadow:0 3px 12px rgba(48,100,58,.1)}
.switch-row input[type=checkbox]{appearance:none;position:relative;width:47px;height:27px;border:1px solid #c4d1c2;border-radius:99px;background:#d7dfd3;cursor:pointer;transition:background .24s,border-color .24s,box-shadow .24s}
.switch-row input[type=checkbox]::after{content:"";position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:white;box-shadow:0 2px 5px rgba(34,69,39,.2);transition:transform var(--motion-fast) var(--ease-ui)}
.switch-row input[type=checkbox]:checked{background:#4b8159;border-color:#4b8159;box-shadow:0 0 0 4px #e4f1df}
.switch-row input[type=checkbox]:checked::after{transform:translateX(20px)}
.switch-row input[type=checkbox]:active{box-shadow:0 0 0 4px #e4f1df}
.setting-stack{padding:19px 0}
.variant-options{gap:13px}
.variant-card{position:relative;flex:1;min-height:153px;padding:13px;border-radius:14px;background:#f7faf3;border:1px solid #e0e8dc;box-shadow:none;overflow:hidden;align-items:center;justify-content:center;transition:background .24s,border-color .24s,box-shadow .24s,transform .28s cubic-bezier(.2,.8,.2,1)}
.variant-card:hover{border-color:#9dbd96;background:var(--surface-selected)}
.variant-card:active{transform:translateY(1px)}
.variant-card.selected{background:radial-gradient(circle at 50% 34%,#eff8e9,#e3f0df);border-color:#609165;box-shadow:inset 0 0 0 1px #609165,0 10px 23px rgba(44,101,52,.12);color:#295a38}
.variant-card.selected::after{content:"✓";position:absolute;top:10px;right:11px;display:grid;place-items:center;width:21px;height:21px;border-radius:50%;background:#4b8159;color:#fff;font-weight:700}
.variant-card span:last-child{font-size:12px;font-weight:650}
.variant-portrait{width:104px;height:104px;transition:transform .3s cubic-bezier(.2,1.3,.3,1)}
.variant-card:hover .variant-portrait{transform:translateY(-2px)}
.settings-actions button,.settings-actions .button{transition:transform .2s ease,box-shadow .2s ease,background .2s ease}
.settings-actions button:not(:disabled):hover,.settings-actions .button:not([aria-disabled="true"]):hover{box-shadow:0 4px 12px rgba(35,72,47,.08)}
.settings-actions button:not(:disabled):active,.settings-actions .button:not([aria-disabled="true"]):active{transform:translateY(1px)}
.quiet-action{border-radius:9px;padding:10px 12px;margin:7px 0 0 -12px;transition:background .2s,transform .2s}
.quiet-action:hover{background:var(--surface-selected)}
.sync-status{display:inline-flex;padding:6px 10px;border-radius:99px;background:#e4f0df;color:#315a39;font-weight:650}
.settings-feedback{position:fixed;z-index:30;right:30px;bottom:28px;display:flex;align-items:center;gap:10px;min-height:48px;padding:9px 18px 9px 10px;border:1px solid #679773;border-radius:13px;background:#2e6242;color:#fff;box-shadow:0 15px 38px rgba(22,70,39,.25);font-size:13px;font-weight:650;pointer-events:none}
.feedback-check{display:grid;place-items:center;width:29px;height:29px;border-radius:9px;background:rgba(255,255,255,.18);font-size:17px}
@media(max-width:950px){.settings-layout{grid-template-columns:1fr}.pet-panel,.settings-panel[aria-labelledby="download-heading"]{grid-column:auto;grid-row:auto}}
@media(max-width:760px){.settings-heading{min-height:150px;padding:25px 22px}.settings-heading-mark{right:-24px;top:6px;opacity:.2}.settings-panel{padding:22px}.settings-panel:hover{transform:none}.setting-row:hover{padding-left:0;padding-right:0;background:transparent}.settings-feedback{left:16px;right:16px;bottom:88px;justify-content:center}.variant-card{min-height:130px}}
@media(prefers-reduced-motion:reduce){.settings-panel,.panel-icon,.setting-row,.setting-row select,.switch-row input[type=checkbox],.switch-row input[type=checkbox]::after,.variant-card,.variant-portrait,.settings-actions button,.settings-actions .button,.quiet-action{transition:none!important}.settings-panel:hover,.variant-card:hover,.settings-actions button:hover,.quiet-action:hover,.variant-card:hover .variant-portrait{transform:none!important}}
</style>
