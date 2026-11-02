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
import MiniSkeleton from "../../components/MiniSkeleton.vue";
import MiniNotice from "../../components/MiniNotice.vue";
import MiniResumeStudy from "../../components/MiniResumeStudy.vue";
import { miniStudyCheckpoint, type MiniStudyCheckpoint } from "../../services/study-checkpoint";
import type { Data } from "@jp/models";
import { defaultRepository, isMissingSnapshotError, type MissingSnapshotError } from "../../adapters";
import { defaultTextbooks, isBookLoaded, textbookCatalog } from "../../services/textbooks";
import { calculateLearningStatistics, type LearningStatistics } from "../../services/learning-statistics";
import { fullBookTitle } from "../../services/book-presentation";
import { miniDailyStudyPlan } from "../../services/daily-study-plan";
import { miniStudyPlanPreference } from "../../services/study-plan-preference";
import { miniHomeDisplayPreference } from "../../services/home-display-preference";
useMiniPageActivity();

const appData = ref<Data | null>(null);
const statistics = ref<LearningStatistics | null>(null);
const loading = ref(true);
const currentBookTitle = ref("标准日本语");
const checkpoint = ref<MiniStudyCheckpoint | null>(null);
const checkpointBusy = ref(false);
const loadError = ref("");
const missingSnapshot = ref<MissingSnapshotError | null>(null);
const recovering = ref(false);
const recoveryHint = computed(() => {
  const missing = missingSnapshot.value;
  if (!missing) return "";
  if (missing.key !== "data_guest") return "该账号的本机文件缺失，已暂停写入与同步。请保留本机数据，避免清空缓存。";
  if (missing.inlineValue) return "发现一份旧的本机副本，可确认恢复；最近的学习记录可能不在其中。";
  return "若曾同步，请到设置登录原账号拉取云端记录。未同步且没有本机副本的记录无法自动找回。";
});
const searchQuery = ref("");
const currentMeta = computed(() => textbookCatalog.find((book) => book.id === appData.value?.currentBookId));
const catalogWordCount = textbookCatalog.reduce((sum, book) => sum + book.wordCount, 0);
const activityMax = computed(() => Math.max(1, ...(statistics.value?.days.map((day) => day.count) || [0])));
const activityDays = computed(() => statistics.value?.days || []);
const currentBookProgress = computed(() => statistics.value?.books.find((book) => book.bookId === appData.value?.currentBookId));
const preferenceError = ref("");
const today = ref(new Date());
const dailyPace = computed(() => miniStudyPlanPreference.getPace(appData.value?.currentBookId || ""));
const unitLabel = computed(() => appData.value?.currentBookId?.startsWith("jlpt-") ? "组" : "课");
const paceLabel = computed(() => `${dailyPace.value === .5 ? "半" : "一"}${unitLabel.value} / 天`);
const todayPlan = computed(() => {
  const data = appData.value;
  return data?.currentBookId && miniStudyPlanPreference.state.ready && (isBookLoaded(data, data.currentBookId) || !textbookCatalog.some(book => book.id === data.currentBookId))
    ? miniDailyStudyPlan(data, data.currentBookId, dailyPace.value, today.value) : null;
});
const focusCard = computed(() => {
  const display = miniHomeDisplayPreference.state.value;
  if (display === "today") {
    const plan = todayPlan.value;
    return { label: "今日待学", value: plan ? plan.remaining : "—", unit: "词",
      note: plan ? plan.target ? `今日已学 ${plan.completed} / ${plan.target} 词` : currentBookProgress.value?.total ? "当前词书的新词，已经认识了。" : "词书里还没有词汇，先添加几个词吧。" : "开始今日计划后，按这本词书的进度准备新词。",
      caption: plan?.lessonTitle ? `${plan.lessonTitle} · ${paceLabel.value}` : paceLabel.value };
  }
  if (display === "progress") return { label: "词书进度", value: currentBookProgress.value?.percent || 0, unit: "%",
    note: `已学 ${currentBookProgress.value?.learned || 0} / ${currentBookProgress.value?.total || 0} 词`, caption: currentBookTitle.value };
  return { label: "待复习", value: statistics.value?.due || 0, unit: "词",
    note: statistics.value?.due ? "让熟悉的词，再见一次。" : "今天暂无到期复习。",
    caption: statistics.value?.due ? "温习熟悉的词，也是一小步。" : "先认识几个新词，到了时间再相见。" };
});
const primaryReview = computed(() => miniHomeDisplayPreference.state.value === "review" && !!statistics.value?.due);
const planComplete = computed(() => !!todayPlan.value?.target && !todayPlan.value.remaining);
const learningActionLabel = computed(() => primaryReview.value ? "开始复习" : planComplete.value ? "今日计划已完成"
  : todayPlan.value && !todayPlan.value.target ? currentBookProgress.value?.total ? "选择其他课次" : "添加词汇" : todayPlan.value?.completed ? "继续今日计划" : "开始今日计划");
let homeReadEpoch = 0;

function isCurrentRead(epoch: number, key: string) {
  return epoch === homeReadEpoch && key === defaultRepository.getActiveKey();
}

async function refreshData() {
  const epoch = ++homeReadEpoch;
  const key = defaultRepository.getActiveKey();
  loadError.value = "";
  missingSnapshot.value = null;
  loading.value = true;
  today.value = new Date();
  try { await loadData(epoch, key); }
  catch (error: unknown) {
    if (!isCurrentRead(epoch, key)) return;
    const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const scalar = (value: unknown) => typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
    console.error("[HomeDataRead] learning snapshot unavailable", {
      name: scalar(details.name),
      message: scalar(details.message) ?? (typeof error === "string" ? error : undefined),
      errMsg: scalar(details.errMsg),
      code: scalar(details.code),
    });
    if (isMissingSnapshotError(error)) {
      missingSnapshot.value = error;
      loadError.value = "本机学习快照文件已缺失。原指针和待同步记录已保留。";
    } else {
      loadError.value = "学习记录暂时无法读取，请重试。原有记录未被覆盖。";
    }
  }
  finally { if (isCurrentRead(epoch, key)) loading.value = false; }
}

async function loadData(epoch: number, key: string) {
  const data = await defaultTextbooks.hydrate(key);
  if (!isCurrentRead(epoch, key)) return;

  appData.value = data;
  statistics.value = calculateLearningStatistics(data, new Date());
  const curBook = data.books.find((b) => b.id === data.currentBookId) || data.books[0];
  if (curBook) {
    currentBookTitle.value = fullBookTitle(curBook);
  }
  try {
    const saved = await miniStudyCheckpoint.load(key);
    if (!isCurrentRead(epoch, key)) return;
    if (saved) {
      const presentWords = new Set(data.words.map(word => word.id));
      const builtinBooks = new Set(textbookCatalog.map(book => book.id));
      const wordIds = saved.wordIds.filter(id => {
        const state = data.states.find(state => state.wordId === id);
        const exists = presentWords.has(id) || saved.bookIds.some(bookId => builtinBooks.has(bookId) && id.startsWith(`${bookId}-w-`));
        return exists && !state?.isIgnored && (saved.mode !== 'new' || !state?.firstSeenAt && !(state?.reviewCount));
      });
      checkpoint.value = wordIds.length ? { ...saved, wordIds } : null;
    } else checkpoint.value = null;
  } catch { if (isCurrentRead(epoch, key)) { checkpoint.value = null; preferenceError.value = '续学位置暂时无法读取，学习记录仍保留。'; } }
}

function resumeStudy() { if (!checkpointBusy.value) uni.navigateTo({ url: '/pages/study/study?resume=1' }); }
async function dismissCheckpoint() {
  const key = defaultRepository.getActiveKey();
  if (checkpointBusy.value) return;
  checkpointBusy.value = true;
  try { await miniStudyCheckpoint.clear(key); if (key === defaultRepository.getActiveKey()) checkpoint.value = null; }
  catch { preferenceError.value = '续学位置暂时无法收起，请重试。'; }
  finally { checkpointBusy.value = false; }
}

function goToSettings() { uni.switchTab({ url: "/pages/settings/settings" }); }

async function recoverSnapshot() {
  const missing = missingSnapshot.value;
  if (recovering.value || missing?.key !== "data_guest" || !missing.inlineValue) return;
  recovering.value = true;
  try {
    const confirmation = await uni.showModal({
      title: "恢复旧的本机副本？",
      content: "旧副本可能缺少最近的学习记录。恢复前会归档原指针与副本，不会删除待同步记录。此步骤仅恢复本机副本，后续登录沿用原有同步流程。请先尝试重新读取。",
      confirmText: "确认恢复",
      cancelText: "取消",
    });
    if (!confirmation.confirm) return;
    if (missing.key !== defaultRepository.getActiveKey() || missingSnapshot.value?.pointer !== missing.pointer) return;
    await defaultRepository.recoverMissingSnapshot(missing.pointer, missing.key);
    await refreshData();
  } catch {
    if (missing.key === defaultRepository.getActiveKey()) {
      loadError.value = "恢复未完成，原指针与副本仍保留。请重新读取后再试。";
    }
  } finally { recovering.value = false; }
}

function goToStudy() {
  if (primaryReview.value) {
    uni.navigateTo({ url: "/pages/study/study?mode=review" });
    return;
  }
  if (planComplete.value) return;
  if (todayPlan.value && !todayPlan.value.target) {
    if (!currentBookProgress.value?.total && appData.value?.currentBookId) uni.navigateTo({ url: `/pages/personal/personal?bookId=${encodeURIComponent(appData.value.currentBookId)}` });
    else goToBooks();
    return;
  }
  const bookId = appData.value?.currentBookId;
  if (bookId) uni.navigateTo({ url: `/pages/study/study?dailyBookId=${encodeURIComponent(bookId)}` });
  else goToBooks();
}

function goToBooks() {
  uni.switchTab({
    url: "/pages/books/books"
  });
}

function goToLists() { uni.navigateTo({ url: "/pages/lists/lists" }); }
function goToScenes() { uni.navigateTo({ url: "/pages/scenes/scenes" }); }
function goToStatistics() { uni.navigateTo({ url: "/pages/statistics/statistics" }); }
function goToReview() { uni.switchTab({ url: "/pages/review/review" }); }
function goToDifficult() { uni.navigateTo({ url: "/pages/study/study?mode=difficult" }); }
function activityHeight(count: number) { return count ? Math.max(14, Math.round(count / activityMax.value * 76)) : 8; }
function onSearchInput(event: unknown) {
  const detail = event && typeof event === "object" ? (event as { detail?: unknown }).detail : undefined;
  const value = detail && typeof detail === "object" ? (detail as { value?: unknown }).value : undefined;
  // Tap events carry coordinates, not input text. Only a text-bearing input or
  // keyboard-confirm event may replace the query, including an explicit clear.
  if (typeof value === "string") searchQuery.value = value.slice(0, 80);
}
function goToSearch(event?: unknown) {
  if (event !== undefined) onSearchInput(event);
  const query = searchQuery.value.trim();
  if (!query) {
    uni.showToast({ title: "请输入日语词或中文释义", icon: "none" });
    return;
  }
  uni.navigateTo({ url: `/pages/search/search?q=${encodeURIComponent(query)}` });
}

onShow(() => {
  void refreshData();
  preferenceError.value = "";
  void Promise.all([miniStudyPlanPreference.load(), miniHomeDisplayPreference.load()]).catch(() => {
    preferenceError.value = "本机学习偏好暂时无法读取，可到设置中重试。";
  });
});
</script>

<template>
  <MiniPage class="dashboard-page">
    <MiniHeader kicker="KOTOBUD / 今日、少しずつ。" title="今天，也学一点吧" description="不用着急，每一个词都在让世界变得清晰。" />
    <MiniSkeleton v-if="loading" label="正在读取学习概览…" />
    <view v-else-if="loadError" class="card status-card">
      <text>{{ loadError }}</text>
      <text v-if="recoveryHint" class="recovery-hint">{{ recoveryHint }}</text>
      <button class="secondary-btn" :disabled="recovering" @tap="refreshData">重新读取</button>
      <button v-if="missingSnapshot?.key === 'data_guest' && missingSnapshot?.inlineValue" class="primary-btn" :disabled="recovering" :loading="recovering" @tap="recoverSnapshot">恢复本机旧副本</button>
      <button v-if="missingSnapshot" class="secondary-btn" :disabled="recovering" @tap="goToSettings">前往账号与同步</button>
    </view>
    <template v-else>
    <view class="card today-panel motion-enter">
      <view class="panel-header">
        <text class="panel-label">今日の手帖</text>
        <button class="focus-settings" @tap="goToSettings">调整开屏</button>
      </view>
      <view class="focus-body">
        <view class="focus-copy">
          <text class="due-title">{{ focusCard.label }}</text>
          <view class="due-row"><text class="due-number">{{ focusCard.value }}</text><text class="focus-unit">{{ focusCard.unit }}</text></view>
          <text class="focus-note">{{ focusCard.note }}</text>
          <text class="focus-caption">{{ focusCard.caption }}</text>
        </view>
        <view class="mini-brand-mark focus-brand-mark" aria-hidden="true"><view class="mini-seal-ring" /><view class="mini-seal-ring mini-seal-inner" /><text class="mini-seal-character">言</text><text class="mini-seal-caption">ことば</text></view>
      </view>
      <view v-if="miniHomeDisplayPreference.state.value === 'progress'" class="focus-progress"><view :style="{ width: `${currentBookProgress?.percent || 0}%` }" /></view>
      <view class="focus-plan-line">
        <text>新词计划 · {{ paceLabel }}</text>
        <text class="streak-badge">连续 {{ statistics?.streak || 0 }} 天</text>
      </view>
      <view class="action-row">
        <button class="primary-btn focus-primary" :disabled="!primaryReview && planComplete" @tap="goToStudy"><text>{{ learningActionLabel }}</text><text v-if="!planComplete || primaryReview" class="action-arrow" aria-hidden="true">↗</text></button>
        <button class="secondary-btn" @tap="goToBooks">选择课次</button>
      </view>
      <view class="quick-actions">
        <button v-if="statistics?.due && !primaryReview" class="secondary-btn quick-btn" @tap="goToReview">复习到期词（{{ statistics.due }}）</button>
        <button v-if="statistics?.difficult" class="secondary-btn quick-btn" @tap="goToDifficult">巩固难词（{{ statistics.difficult }}）</button>
      </view>
    </view>
    <MiniNotice :message="preferenceError" tone="error" />
    <MiniResumeStudy v-if="checkpoint" :checkpoint="checkpoint" :busy="checkpointBusy" @resume="resumeStudy" @dismiss="dismissCheckpoint" />

    <view class="card search-entry motion-enter">
      <view class="search-entry-heading"><text class="search-entry-title">查一查日语词汇</text><text class="search-entry-caption">汉字、假名或中文释义 · 最多 80 字</text></view>
      <view class="search-entry-row">
        <input
          class="search-entry-input"
          :value="searchQuery"
          maxlength="80"
          confirm-type="search"
          placeholder="例如：学生、がくせい"
          placeholder-class="search-entry-placeholder"
          aria-label="搜索教材词汇"
          @input="onSearchInput"
          @confirm="goToSearch"
        />
        <button class="primary-btn search-entry-button" @tap="goToSearch()">查词</button>
      </view>
    </view>

    <button class="card scene-entry motion-enter" @tap="goToScenes">
      <view><text class="scene-entry-kicker">JAPANESE IN REAL LIFE</text><text class="scene-entry-title">场景学习</text><text class="scene-entry-copy">购物、点餐、问路……把熟悉的词用起来。</text></view>
      <text class="scene-entry-arrow" aria-hidden="true">→</text>
    </button>
    <view class="stats-grid motion-enter">
      <view class="card stat-item">
        <text class="stat-num">{{ statistics?.todayNew || 0 }}</text>
        <text class="stat-label">今日新学</text>
      </view>
      <view class="card stat-item">
        <text class="stat-num">{{ statistics?.todayReview || 0 }}</text>
        <text class="stat-label">今日复习</text>
      </view>
      <view class="card stat-item">
        <text class="stat-num">{{ statistics?.learned || 0 }}</text>
        <text class="stat-label">累计已学</text>
      </view>
      <view class="card stat-item">
        <text class="stat-num">{{ catalogWordCount }}</text>
        <text class="stat-label">内置词书词汇</text>
      </view>
    </view>

    <view class="card activity-card motion-enter">
      <view class="section-heading">
        <text class="section-title">近 7 日活动</text>
        <text class="section-caption">按本地日期统计</text>
      </view>
      <view class="activity-grid">
        <view v-for="day in activityDays" :key="day.day" class="activity-day">
          <view class="activity-track"><view class="activity-bar" :class="{ 'activity-empty': !day.count }" :style="{ transform: `scaleY(${activityHeight(day.count) / 76})` }" /></view>
          <text class="activity-count">{{ day.count }}</text>
          <text class="activity-label">{{ day.label }}</text>
        </view>
      </view>
      <button class="secondary-btn" @tap="goToStatistics">查看完整学习统计</button>
    </view>

    <button class="card book-card motion-enter" @tap="goToBooks" :aria-label="`当前词书：${currentBookTitle}，已学 ${currentBookProgress?.learned || 0} / ${currentBookProgress?.total || 0} 词，前往词书`">
      <view class="book-info">
        <text class="book-tag">正在学习</text>
        <text class="book-title">{{ currentBookTitle }}</text>
        <text class="book-meta">{{ currentMeta ? currentMeta.lessons.length + (currentMeta.id.startsWith('jlpt-') ? ' 组 · ' : ' 课 · ') + currentMeta.wordCount + ' 词' : '已保存的词书' }}</text>
        <view class="book-progress"><view class="book-progress-fill" :style="{ transform: `scaleX(${(currentBookProgress?.percent || 0) / 100})` }" /></view>
        <text class="book-progress-caption">已学 {{ currentBookProgress?.learned || 0 }} / {{ currentBookProgress?.total || 0 }} 词 · 查看课次 →</text>
      </view>
    </button>
    <button class="secondary-btn" @tap="goToLists">打开生词本</button>
    </template>
    <text class="page-endnote">ことばを、少しずつ。</text>
  </MiniPage>
</template>

<style scoped>
.scene-entry { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 24rpx; padding: 32rpx; text-align: left; white-space: normal; }
.scene-entry::after { border: 0; }.scene-entry-kicker { display: block; color: var(--kotoba-muted); font-size: 22rpx; letter-spacing: 2rpx; }
.scene-entry-title { display: block; color: var(--kotoba-green); font-size: 36rpx; font-weight: 700; margin: 12rpx 0; }.scene-entry-copy { display: block; color: var(--kotoba-muted); font-size: 25rpx; line-height: 1.7; }.scene-entry-arrow { flex-shrink: 0; color: var(--kotoba-green); font-size: 38rpx; }
.dashboard-page { padding-bottom: calc(32rpx + env(safe-area-inset-bottom)); }
.dashboard-page .card { background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); border-radius: 24rpx; box-shadow: 0 10rpx 28rpx rgba(35, 57, 46, .035); }
.dashboard-page button { min-height: 96rpx; }
.status-card { padding: 44rpx 32rpx; text-align: center; }
.status-card .secondary-btn { min-height: 96rpx; margin-top: 20rpx; }
.status-card .primary-btn { margin-top: 20rpx; }
.recovery-hint { display: block; margin-top: 18rpx; font-size: 25rpx; line-height: 1.7; color: var(--kotoba-muted); }
.hero-section {
  margin-top: 20rpx;
  margin-bottom: 34rpx;
  display: flex;
  flex-direction: column;
}
.hero-eyebrow {
  font-size: 24rpx;
  color: var(--kotoba-green);
  font-weight: 650;
  letter-spacing: 2rpx;
  margin-bottom: 10rpx;
}
.hero-title {
  font-size: 48rpx;
  font-weight: 700;
  color: var(--kotoba-ink);
  margin-bottom: 8rpx;
}
.hero-subtitle {
  font-size: 26rpx;
  color: var(--kotoba-muted);
  line-height: 1.65;
}
.today-panel {
  background: #edf4e7 !important;
  border-color: #d7e5d1 !important;
  padding: 34rpx;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}
.panel-label {
  font-size: 24rpx;
  color: var(--kotoba-green);
  font-weight: 600;
}
.streak-badge {
  font-size: 24rpx;
  background: #eaf0e3;
  color: var(--kotoba-green);
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-weight: 600;
}
.due-row {
  display: flex;
  align-items: baseline;
  margin-bottom: 28rpx;
}
.due-number {
  font-size: 72rpx;
  font-weight: 800;
  color: var(--kotoba-ink);
  margin-right: 12rpx;
}
.due-desc {
  font-size: 26rpx;
  color: var(--kotoba-muted);
}
.action-row {
  display: flex;
  gap: 16rpx;
}
.action-row button { flex: 1; min-height: 96rpx; }
.quick-actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 20rpx; }
.quick-btn { flex: 1; min-width: 260rpx; min-height: 96rpx; margin: 0; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; margin-bottom: 20rpx; }
.section-title { font-size: 28rpx; font-weight: 700; color: var(--kotoba-ink); }
.section-caption { font-size: 22rpx; color: var(--kotoba-muted); }
.activity-card { padding-bottom: 28rpx; }
.activity-grid { display: flex; align-items: flex-end; justify-content: space-between; gap: 16rpx; min-height: 136rpx; }
.activity-day { display: flex; flex: 1; min-width: 0; flex-direction: column; align-items: center; gap: 8rpx; }
.activity-track { display: flex; width: 100%; height: 84rpx; align-items: flex-end; justify-content: center; border-bottom: 1rpx solid var(--kotoba-line); }
.activity-bar { width: 28rpx; min-height: 8rpx; border-radius: 8rpx 8rpx 0 0; background: var(--kotoba-green); }
.activity-count, .activity-label { font-size: 22rpx; color: var(--kotoba-muted); }
.activity-count { color: var(--kotoba-green); font-weight: 600; }
.activity-label { white-space: nowrap; }
.stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.stat-item {
  flex: 1 1 42%;
  min-width: 220rpx;
  text-align: center;
  padding: 24rpx;
  margin-bottom: 0;
}
.stat-num {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: var(--kotoba-ink);
  margin-bottom: 4rpx;
}
.stat-label {
  font-size: 24rpx;
  color: var(--kotoba-muted);
}
.book-card {
  border: 1rpx solid var(--kotoba-line);
  display: block;
  width: 100%;
  margin: 0 0 24rpx;
  text-align: left;
  line-height: 1.5;
}
.book-card::after { border: 0; }
.book-info { width: 100%; }
.book-progress { height: 10rpx; margin-top: 20rpx; overflow: hidden; border-radius: 10rpx; background: #e3eade; }
.book-progress-fill { height: 100%; border-radius: 10rpx; background: var(--kotoba-green); }
.book-progress-caption { display: block; margin-top: 12rpx; font-size: 23rpx; color: var(--kotoba-green); }
.dashboard-page > .secondary-btn { width: 100%; margin: 0; }
@media (max-width: 360px) {
  .panel-header { align-items: flex-start; flex-direction: column; gap: 10rpx; }
  .action-row { flex-direction: column; }
}
.book-tag {
  display: inline-block;
  font-size: 22rpx;
  color: var(--kotoba-green);
  margin-bottom: 8rpx;
}
.book-title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--kotoba-ink);
  margin-bottom: 8rpx;
  overflow-wrap: anywhere;
}
.book-meta {
  font-size: 24rpx;
  color: var(--kotoba-muted);
  overflow-wrap: anywhere;
}
.today-panel { position: relative; overflow: hidden; border-radius: 30rpx !important; background: #eaf1e3 !important; }
.today-panel .panel-header { align-items: center; flex-direction: row; gap: 20rpx; margin-bottom: 26rpx; }
.focus-settings { min-height: 44px; margin: -12rpx -10rpx -12rpx 0; padding: 8rpx 10rpx; border: 0; background: transparent; color: var(--kotoba-green); font-size: 23rpx; text-decoration: underline; text-underline-offset: 5rpx; }
.focus-body { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.focus-copy { flex: 1; min-width: 0; }
.focus-body .due-row { align-items: baseline; gap: 8rpx; margin: 18rpx 0 22rpx; }
.focus-unit { font-size: 28rpx; color: var(--kotoba-green); }
.focus-note, .focus-caption { display: block; font-size: 25rpx; line-height: 1.65; overflow-wrap: anywhere; }
.focus-note { color: var(--kotoba-ink); }
.focus-caption { margin-top: 8rpx; color: var(--kotoba-muted); font-size: 23rpx; }
.focus-brand-mark { flex: none; opacity: .8; }
.focus-plan-line { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12rpx; margin: 26rpx 0 22rpx; padding-top: 22rpx; border-top: 1rpx solid #cedcc4; color: var(--kotoba-green); font-size: 23rpx; }
.focus-progress { height: 8rpx; overflow: hidden; border-radius: 8rpx; margin-top: 24rpx; background: #d8e3d0; }
.focus-progress > view { height: 100%; border-radius: inherit; background: var(--kotoba-green); }
.focus-primary { gap: 16rpx; }
.panel-header, .due-row, .action-row, .quick-actions { position: relative; }
.panel-label { font-size: 22rpx; letter-spacing: 2rpx; }
.streak-badge { border-radius: 8rpx; padding: 8rpx 14rpx; background: #dce9d1; font-size: 23rpx; }
.due-row { align-items: center; gap: 18rpx; margin: 24rpx 0 30rpx; }
.due-number { font-size: 104rpx; line-height: 1; font-weight: 600; letter-spacing: -4rpx; font-variant-numeric: tabular-nums; }
.due-title { display: block; font-size: 30rpx; font-weight: 600; color: var(--kotoba-ink); margin-bottom: 8rpx; }
.due-desc { font-size: 25rpx; }
.action-row .primary-btn { flex: 1.45; padding: 16rpx 22rpx; justify-content: space-between; gap: 8rpx; }
.action-row .secondary-btn { flex: 1; padding: 16rpx 20rpx; background: #f4f7ef; }
.action-arrow { font-size: 32rpx; }
.quick-actions:empty { display: none; }
.stats-grid { margin: 0 0 28rpx; gap: 18rpx; animation-delay: 45ms; }
.stat-item { text-align: left; min-width: 0; flex-basis: 44%; padding: 24rpx 28rpx; box-shadow: none !important; }
.stat-num { font-size: 44rpx; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; }
.stat-label { display: block; margin-top: 8rpx; }
.activity-card { animation-delay: 90ms; }
.activity-bar { height: 76rpx; transform-origin: center bottom; transition: transform 420ms cubic-bezier(.2,.8,.2,1); }
.activity-empty { background: #ccd9c4; }
.book-card { animation-delay: 120ms; border-left: 6rpx solid #a6bd96 !important; }
.book-progress-fill { width: 100%; transform-origin: left center; transition: transform 420ms cubic-bezier(.2,.8,.2,1); }
.page-endnote { display: block; margin: 30rpx 0 6rpx; font-size: 22rpx; color: var(--kotoba-muted); letter-spacing: 2rpx; }
.search-entry { margin-bottom: 22rpx; padding: 26rpx; border-left: 5rpx solid #a6bd96 !important; border-radius: 22rpx; }
.search-entry-heading { display: flex; flex-direction: column; gap: 6rpx; margin-bottom: 14rpx; }
.search-entry-title { color: var(--kotoba-ink); font-size: 28rpx; font-weight: 700; }
.search-entry-caption { color: var(--kotoba-muted); font-size: 22rpx; }
.search-entry-row { display: flex; gap: 12rpx; align-items: stretch; }
.search-entry-input { flex: 1; min-width: 0; height: 80rpx; box-sizing: border-box; padding: 0 20rpx; border: 1rpx solid #d8e3d2; border-radius: 16rpx; background: #fffefa; color: var(--kotoba-ink); font-size: 26rpx; }
.search-entry-placeholder { color: #89968b; font-size: 24rpx; }
.search-entry-button { width: 128rpx; min-height: 80rpx !important; margin: 0; padding: 0 16rpx; font-size: 25rpx; }
</style>
