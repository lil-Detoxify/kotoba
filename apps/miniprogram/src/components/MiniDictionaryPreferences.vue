<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import MiniPanel from './MiniPanel.vue';
import MiniNotice from './MiniNotice.vue';
import { miniDictionaryPreferences as preferences } from '../services/dictionary-preferences';
import type { DictionarySourceId } from '../services/dictionary-comparison';
const orderedSources = preferences.orderedSources;
const hiddenSources = computed(() => preferences.state.preferences.hidden);
const preferredSource = computed(() => preferences.state.preferences.preferredSource);
const busy = ref(false);
const message = ref('');
onMounted(() => { void preferences.load(); });
async function save(action: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  try { message.value = await action() === false ? '至少保留一个词典来源。' : '词典偏好已保存在本机。'; }
  catch { message.value = '设置保存失败，请重试。'; }
  finally { busy.value = false; }
}
function toggleSource(id: DictionarySourceId) { void save(() => preferences.setEnabled(id, preferences.state.preferences.hidden.includes(id))); }
function setPreferred(id: DictionarySourceId) { void save(() => preferences.setPreferred(id)); }
function moveSource(id: DictionarySourceId, direction: -1 | 1) { void save(() => preferences.move(id, direction)); }
</script>

<template>
  <MiniPanel icon="data" kicker="DICTIONARY / 查阅偏好" title="词典与查阅" description="比较中文译释、英文原义与日文解释，按习惯安排来源。">
    <text class="preference-note">进入对照后先展开默认来源，其余来源点击展开。</text>
    <view v-for="(source, index) in orderedSources" :key="source.id" class="source-setting">
      <view class="source-info"><view class="source-title"><text>{{ source.name }}</text><text class="source-language">{{ source.language }}</text></view><switch :checked="!hiddenSources.includes(source.id)" :disabled="busy" color="#315944" :aria-label="`显示${source.name}`" @change="toggleSource(source.id)" /></view>
      <view class="source-actions">
        <button class="source-choice" :class="{ selected: preferredSource === source.id }" :disabled="busy" @tap="setPreferred(source.id)">{{ preferredSource === source.id ? '默认展开' : '设为默认' }}</button>
        <button class="order-button" :disabled="busy || index === 0" :aria-label="`上移${source.name}`" @tap="moveSource(source.id, -1)">上移</button>
        <button class="order-button" :disabled="busy || index === orderedSources.length - 1" :aria-label="`下移${source.name}`" @tap="moveSource(source.id, 1)">下移</button>
      </view>
    </view>
    <MiniNotice :message="message" />
  </MiniPanel>
</template>

<style scoped>
.preference-note { display: block; font-size: 24rpx; line-height: 1.65; color: var(--kotoba-muted); }
.source-setting { padding: 26rpx 0; border-bottom: 1rpx solid var(--kotoba-line); }
.source-setting:last-of-type { border-bottom: 0; }
.source-info { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.source-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 14rpx; font-size: 29rpx; font-weight: 600; color: var(--kotoba-ink); }
.source-language { font-size: 24rpx; color: var(--kotoba-muted); font-weight: 400; }
.source-actions { display: flex; gap: 16rpx; margin-top: 18rpx; }
.source-choice, .order-button { min-height: 44px; margin: 0; padding: 12rpx; background: #f6f8f0; border: 1rpx solid var(--kotoba-line); border-radius: 14rpx; color: var(--kotoba-muted); font-size: 24rpx; }
.source-choice { flex: 1; }
.source-choice.selected { background: #edf4e7; border-color: #c3d5b8; color: var(--kotoba-green); font-weight: 600; }
.order-button { width: 120rpx; flex: none; }
.order-button[disabled] { opacity: .4; }
</style>
