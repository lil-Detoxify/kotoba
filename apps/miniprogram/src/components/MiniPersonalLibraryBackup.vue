<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { miniPersonalLibraryCloudBackup } from "../services/personal-library-cloud";
import type { MiniPersonalLibraryCloudView } from "../services/personal-library-cloud";
import type {
  ExistingContentPolicy,
  PersonalLibrary,
  PersonalLibraryMergeResult,
  PersonalLibraryPreview,
} from "../services/personal-library";

const emit = defineEmits<{ login: [] }>();

const busy = ref(false);
const viewResult = ref<MiniPersonalLibraryCloudView | null>(null);
const preview = ref<PersonalLibraryPreview | null>(null);
const mergeResult = ref<PersonalLibraryMergeResult | null>(null);
const policy = ref<ExistingContentPolicy>("keep-local");
const errorMessage = ref("");
const successMessage = ref("");
const loginRequired = ref(false);
const conflictNeedsRefresh = ref(false);
let operationId = 0;
let disposed = false;

function contextCount(library: PersonalLibrary): number {
  return library.words.reduce((total, word) => total + (word.readingContexts?.length ?? 0), 0)
    + library.builtinContexts.reduce((total, entry) => total + entry.contexts.length, 0);
}

function counts(library: PersonalLibrary | null) {
  if (!library) return [];
  return [
    { label: "词书", value: library.books.length },
    { label: "课次", value: library.lessons.length },
    { label: "词条", value: library.words.length },
    { label: "原句", value: contextCount(library) },
  ];
}

const localCounts = computed(() => counts(viewResult.value?.localLibrary ?? null));
const cloudCounts = computed(() => counts(viewResult.value?.backup?.library ?? null));
const cloudUpdatedAt = computed(() => {
  const value = viewResult.value?.backup?.updatedAt;
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN") : value;
});

function operationIsCurrent(ticket: number): boolean {
  return !disposed && ticket === operationId;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

function displayError(error: unknown, fallback: string): void {
  errorMessage.value = error instanceof Error && error.message ? error.message : fallback;
  const code = errorCode(error);
  if (code === "unauthorized") {
    loginRequired.value = true;
    emit("login");
  }
  if (code === "backup_conflict") {
    conflictNeedsRefresh.value = true;
    viewResult.value = null;
    preview.value = null;
  }
  if (code === "account_changed" || code === "operation_stale") {
    viewResult.value = null;
    preview.value = null;
  }
}

async function viewAccountBackup(): Promise<void> {
  if (busy.value || disposed) return;
  const ticket = ++operationId;
  busy.value = true;
  viewResult.value = null;
  preview.value = null;
  mergeResult.value = null;
  errorMessage.value = "";
  successMessage.value = "";
  conflictNeedsRefresh.value = false;
  try {
    const result = await miniPersonalLibraryCloudBackup.view();
    if (!operationIsCurrent(ticket)) return;
    viewResult.value = result;
    policy.value = "keep-local";
    loginRequired.value = false;
  } catch (error) {
    if (operationIsCurrent(ticket)) displayError(error, "查看账号备份失败，请稍后重试。");
  } finally {
    if (operationIsCurrent(ticket)) busy.value = false;
  }
}

async function saveDeviceBackup(): Promise<void> {
  if (busy.value || disposed || !viewResult.value) return;
  const ticket = ++operationId;
  busy.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const confirmation = await uni.showModal({
      title: viewResult.value.backup ? "覆盖账号备份？" : "保存账号备份？",
      content: viewResult.value.backup
        ? "将用刚才查看的本机个人词库内容覆盖账号备份。学习进度、当前课和评分不会纳入备份。"
        : "将把刚才查看的本机个人词库内容保存到账号。学习进度、当前课和评分不会纳入备份。",
      confirmText: viewResult.value.backup ? "确认覆盖" : "确认保存",
      cancelText: "取消",
    });
    if (!confirmation.confirm || !operationIsCurrent(ticket)) return;
    const saved = await miniPersonalLibraryCloudBackup.saveDeviceBackup();
    if (!operationIsCurrent(ticket)) return;
    viewResult.value = null;
    preview.value = null;
    successMessage.value = `已保存账号备份（版本 ${saved.revision}）。如需再次保存，请重新查看本机和账号备份。`;
  } catch (error) {
    if (operationIsCurrent(ticket)) displayError(error, "保存账号备份失败，请稍后重试。");
  } finally {
    if (operationIsCurrent(ticket)) busy.value = false;
  }
}

async function previewRestore(): Promise<void> {
  if (busy.value || disposed || !viewResult.value?.backup) return;
  const ticket = ++operationId;
  busy.value = true;
  preview.value = null;
  mergeResult.value = null;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    preview.value = await miniPersonalLibraryCloudBackup.previewRestore(policy.value);
  } catch (error) {
    if (operationIsCurrent(ticket)) displayError(error, "无法预览账号备份，请稍后重试。");
  } finally {
    if (operationIsCurrent(ticket)) busy.value = false;
  }
}

function changePolicy(event: { detail: { value: string } }): void {
  if (event.detail.value !== "keep-local" && event.detail.value !== "use-package") return;
  policy.value = event.detail.value;
  preview.value = null;
  errorMessage.value = "";
}

async function mergeToDevice(): Promise<void> {
  if (busy.value || disposed || !viewResult.value?.backup || !preview.value) return;
  const ticket = ++operationId;
  busy.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const result = await miniPersonalLibraryCloudBackup.mergeToDevice(policy.value);
    if (!operationIsCurrent(ticket)) return;
    mergeResult.value = result;
    viewResult.value = null;
    preview.value = null;
    successMessage.value = "账号备份已合并到本机。学习进度、当前课和评分保持原样。";
  } catch (error) {
    if (operationIsCurrent(ticket)) displayError(error, "合并账号备份失败，请检查后重试。");
  } finally {
    if (operationIsCurrent(ticket)) busy.value = false;
  }
}

function requestLogin(): void {
  emit("login");
}

onBeforeUnmount(() => {
  disposed = true;
  operationId += 1;
  miniPersonalLibraryCloudBackup.reset();
});
</script>

<template>
  <view class="personal-library-backup">
    <view class="backup-heading">
      <text class="backup-title">个人词库云备份</text>
      <text class="backup-description">手动查看、保存或合并自建词书、词条、笔记和收藏原句。学习进度、当前课和评分不会加入备份。</text>
    </view>

    <button class="backup-button backup-button--secondary" :disabled="busy" @tap="viewAccountBackup">
      {{ busy ? "正在处理…" : "查看本机和账号备份" }}
    </button>

    <view v-if="viewResult" class="backup-content">
      <view class="backup-count-card">
        <text class="backup-label">这台设备</text>
        <view class="backup-counts">
          <view v-for="item in localCounts" :key="`local-${item.label}`" class="backup-count">
            <text class="backup-count__label">{{ item.label }}</text>
            <text class="backup-count__value">{{ item.value }}</text>
          </view>
        </view>
      </view>

      <view class="backup-count-card">
        <view class="backup-cloud-heading">
          <text class="backup-label">账号备份</text>
          <text v-if="cloudUpdatedAt" class="backup-time">{{ cloudUpdatedAt }}</text>
        </view>
        <view v-if="viewResult.backup" class="backup-counts">
          <view v-for="item in cloudCounts" :key="`cloud-${item.label}`" class="backup-count">
            <text class="backup-count__label">{{ item.label }}</text>
            <text class="backup-count__value">{{ item.value }}</text>
          </view>
        </view>
        <text v-else class="backup-note">这个账号还没有个人词库云备份。</text>
      </view>

      <view class="backup-actions">
        <button class="backup-button backup-button--primary" :disabled="busy" @tap="saveDeviceBackup">
          {{ viewResult.backup ? "覆盖账号备份" : "保存账号备份" }}
        </button>
        <button v-if="viewResult.backup" class="backup-button backup-button--secondary" :disabled="busy" @tap="previewRestore">
          预览合并
        </button>
      </view>

      <view v-if="viewResult.backup && preview" class="backup-review">
        <text class="backup-label">合并预览</text>
        <view class="backup-preview-grid">
          <text>新增词书 {{ preview.newBooks }}</text>
          <text>新增课次 {{ preview.newLessons }}</text>
          <text>新增词条 {{ preview.newWords }}</text>
          <text>已有词条 {{ preview.existingWords }}</text>
          <text>新增原句 {{ preview.newContexts }}</text>
          <text>已有原句 {{ preview.existingContexts }}</text>
        </view>
        <text class="backup-note">已有内容不一致时的处理方式：</text>
        <radio-group class="backup-policy" @change="changePolicy">
          <label class="backup-radio"><radio value="keep-local" :checked="policy === 'keep-local'" color="#2d765b" />保留本机已有内容</label>
          <label class="backup-radio"><radio value="use-package" :checked="policy === 'use-package'" color="#2d765b" />使用账号备份内容</label>
        </radio-group>
        <text class="backup-note">更改处理方式后请重新预览，再点击合并。合并只处理词库内容，保留学习记录。</text>
        <button class="backup-button backup-button--primary" :disabled="busy" @tap="mergeToDevice">合并到本机</button>
      </view>

    </view>

    <text v-if="conflictNeedsRefresh" class="backup-message backup-message--warning">账号备份已有变化，请重新查看后再保存或合并。</text>
    <text v-if="errorMessage" class="backup-message backup-message--error">{{ errorMessage }}</text>
    <text v-if="successMessage" class="backup-message backup-message--success">{{ successMessage }}</text>
    <text v-if="mergeResult" class="backup-message backup-message--success">
      已合并：新增 {{ mergeResult.newBooks }} 本词书、{{ mergeResult.newLessons }} 课次、{{ mergeResult.newWords }} 个词条和 {{ mergeResult.newContexts }} 条原句。
    </text>
    <button v-if="loginRequired" class="backup-button backup-button--login" @tap="requestLogin">登录账号</button>
  </view>
</template>

<style scoped>
.personal-library-backup { margin-top: 16px; padding: 16px; border: 1px solid #dce8dc; border-radius: 16px; background: #f8fbf6; color: #294638; }
.backup-heading { display: grid; gap: 6px; margin-bottom: 12px; }
.backup-title { font-size: 15px; font-weight: 700; }
.backup-description, .backup-note { color: #65756b; font-size: 12px; line-height: 1.7; }
.backup-button { margin: 8px 0 0; border-radius: 10px; font-size: 13px; }
.backup-button::after { border: 0; }
.backup-button--primary { color: #fff; background: #2d765b; }
.backup-button--secondary { color: #315340; background: #eaf2e9; }
.backup-button--login { color: #315340; background: transparent; }
.backup-content { display: grid; gap: 10px; margin-top: 12px; }
.backup-count-card, .backup-review { padding: 12px; border: 1px solid #e1e9df; border-radius: 12px; background: #fff; }
.backup-label { font-size: 12px; font-weight: 700; }
.backup-cloud-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.backup-time { color: #78877d; font-size: 10px; }
.backup-counts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 9px; }
.backup-count { display: grid; gap: 3px; text-align: center; }
.backup-count__label { color: #748279; font-size: 10px; }
.backup-count__value { font-size: 16px; font-weight: 700; }
.backup-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.backup-preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 10px 0; color: #53695a; font-size: 11px; }
.backup-policy { display: grid; gap: 5px; margin: 8px 0; }
.backup-radio { display: flex; align-items: center; color: #425e4b; font-size: 12px; }
.backup-radio radio { transform: scale(.8); margin-right: 3px; }
.backup-message { display: block; margin-top: 10px; padding: 9px 10px; border-radius: 9px; font-size: 12px; line-height: 1.6; }
.backup-message--error { color: #a34038; background: #fff0ed; }
.backup-message--warning { color: #8a6826; background: #fff7e4; }
.backup-message--success { color: #2d765b; background: #eaf6ed; }
.backup-result { display: block; }
</style>
