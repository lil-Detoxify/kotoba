<script setup lang="ts">
import { ref, watch } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import type { ReadingContext, Word } from '@jp/models';
import { defaultRepository } from '../adapters';
import { miniReadingContexts, wordReadingContexts } from '../services/reading-context';
import MiniNotice from './MiniNotice.vue';

const props = withDefaults(defineProps<{ word: Word; initialSentence?: string; initialTranslation?: string; editable?: boolean }>(), { editable: true });
const contexts = ref<ReadingContext[]>([]);
const expanded = ref(false);
const editing = ref(false);
const editingId = ref<string>();
const sentence = ref('');
const translation = ref('');
const sourceTitle = ref('');
const sourceUrl = ref('');
const busy = ref(false);
const message = ref('');
const tone = ref<'success' | 'error'>('success');
let epoch = 0;
let visible = true;
function current(ticket: number, key: string, wordId: string) { return visible && ticket === epoch && key === defaultRepository.getActiveKey() && wordId === props.word.id; }
async function refresh() {
  const ticket = ++epoch, key = defaultRepository.getActiveKey(), id = props.word.id;
  contexts.value = wordReadingContexts(props.word);
  try {
    const saved = await miniReadingContexts.read(id, key);
    if (current(ticket, key, id)) contexts.value = saved;
  } catch { /* Keep the word's current snapshot readable. Writes report failures. */ }
}
function cancel() { editing.value = false; editingId.value = undefined; }
function copySource(url: string) { void uni.setClipboardData({ data: url }); }
function begin(context?: ReadingContext) {
  if (busy.value) return;
  editingId.value = context?.id;
  sentence.value = context?.sentence || props.initialSentence || '';
  translation.value = context?.translation || props.initialTranslation || '';
  sourceTitle.value = context?.sourceTitle || '';
  sourceUrl.value = context?.sourceUrl || '';
  message.value = ''; editing.value = true;
}
async function save() {
  if (busy.value) return;
  const ticket = epoch, key = defaultRepository.getActiveKey(), id = props.word.id;
  busy.value = true; message.value = '';
  try {
    const saved = await miniReadingContexts.save(id, { sentence: sentence.value, translation: translation.value,
      sourceTitle: sourceTitle.value, sourceUrl: sourceUrl.value, matchedText: props.word.term }, editingId.value, key);
    if (!current(ticket, key, id)) return;
    contexts.value = saved; expanded.value = true; cancel(); tone.value = 'success'; message.value = '原句已收藏。';
  } catch (error) {
    if (current(ticket, key, id)) { tone.value = 'error'; message.value = error instanceof Error ? error.message : '保存失败，请重试。'; }
  } finally { if (ticket === epoch) busy.value = false; }
}
async function remove(context: ReadingContext) {
  if (busy.value) return;
  const ticket = epoch, key = defaultRepository.getActiveKey(), id = props.word.id;
  const answer = await uni.showModal({ title: '删除这条原句？', content: '词条与学习记录会保留。', confirmText: '删除', cancelText: '取消' });
  if (!answer.confirm || !current(ticket, key, id)) return;
  busy.value = true;
  try {
    const saved = await miniReadingContexts.remove(id, context.id, key);
    if (current(ticket, key, id)) { contexts.value = saved; message.value = '原句已删除。'; tone.value = 'success'; }
  } catch (error) { if (current(ticket, key, id)) { message.value = error instanceof Error ? error.message : '删除失败，请重试。'; tone.value = 'error'; } }
  finally { if (ticket === epoch) busy.value = false; }
}
watch(() => props.word.id, () => { cancel(); expanded.value = false; message.value = ''; busy.value = false; void refresh(); }, { immediate: true });
onShow(() => { visible = true; void refresh(); });
function leave() { visible = false; epoch++; busy.value = false; cancel(); }
onHide(leave); onUnload(leave);
</script>

<template>
  <view class="reading-contexts" @tap.stop>
    <view class="context-heading"><text class="context-title">我的原句<text v-if="contexts.length"> · {{ contexts.length }}</text></text><button v-if="editable && !editing" class="context-link" :disabled="busy" @tap="begin()">收藏原句 ＋</button></view>
    <view v-for="context in contexts.slice(0, expanded ? contexts.length : 2)" :key="context.id" class="saved-context">
      <text class="context-sentence" lang="ja">{{ context.sentence }}</text><text v-if="context.translation" class="context-translation">{{ context.translation }}</text>
      <text v-if="context.sourceTitle" class="context-source">{{ context.sourceTitle }}</text>
      <button v-if="context.sourceUrl" class="context-link source-link" @tap="copySource(context.sourceUrl)">复制来源网址</button>
      <view v-if="editable" class="context-actions"><button class="context-link" :disabled="busy" @tap="begin(context)">编辑</button><button class="context-link" :disabled="busy" @tap="remove(context)">删除</button></view>
    </view>
    <button v-if="contexts.length > 2" class="context-link" @tap="expanded = !expanded">{{ expanded ? '收起原句' : `查看全部 ${contexts.length} 条原句` }}</button>
    <text v-if="!contexts.length && !editing" class="context-hint">把阅读时遇见的句子留在这个词旁。</text>
    <view v-if="editing" class="context-editor">
      <text class="field-label">日语原句</text><textarea v-model="sentence" class="context-input sentence-field" maxlength="2000" :disabled="busy" placeholder="记下你看到的日语原句" />
      <text class="field-label">中文翻译（选填）</text><textarea v-model="translation" class="context-input" maxlength="2000" :disabled="busy" />
      <text class="field-label">来源名称（选填）</text><input v-model="sourceTitle" class="context-input source-field" maxlength="200" :disabled="busy" />
      <text class="field-label">来源网址（选填）</text><input v-model="sourceUrl" class="context-input source-field" maxlength="2048" :disabled="busy" placeholder="https://" />
      <view class="context-editor-actions"><button class="context-save" :disabled="busy || !sentence.trim()" :loading="busy" @tap="save">保存原句</button><button class="context-link" :disabled="busy" @tap="cancel">取消</button></view>
    </view>
    <MiniNotice :message="message" :tone="tone" />
  </view>
</template>

<style scoped>
.reading-contexts { width: 100%; padding: 24rpx 0 0; margin-top: 24rpx; border-top: 1rpx solid var(--kotoba-line); text-align: left; }
.context-heading, .context-actions, .context-editor-actions { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.context-title { font-size: 28rpx; font-weight: 650; color: var(--kotoba-green); }
.context-link { min-height: 44px; margin: 0; padding: 8rpx 12rpx; background: transparent; border: 0; color: var(--kotoba-green); font-size: 24rpx; line-height: 1.5; }
.saved-context { margin: 12rpx 0 18rpx; padding: 20rpx; background: #f2f6ed; border-radius: 16rpx; }
.context-sentence, .context-translation, .context-source, .context-hint { display: block; line-height: 1.75; overflow-wrap: anywhere; }
.context-sentence { font-size: 29rpx; color: var(--kotoba-ink); }.context-translation { font-size: 25rpx; color: var(--kotoba-muted); margin-top: 8rpx; }.context-source, .context-hint { color: var(--kotoba-muted); font-size: 23rpx; }.source-link { padding-left: 0; justify-content: flex-start; }
.context-actions { justify-content: flex-end; }.field-label { display: block; margin: 16rpx 0 8rpx; font-size: 24rpx; color: var(--kotoba-muted); }
.context-input { width: 100%; box-sizing: border-box; height: 120rpx; padding: 18rpx; border: 1rpx solid var(--kotoba-line); border-radius: 12rpx; background: var(--kotoba-paper); color: var(--kotoba-ink); font-size: 27rpx; line-height: 1.65; }.sentence-field { height: 180rpx; }.source-field { height: 88rpx; }.context-editor-actions { justify-content: flex-start; margin-top: 20rpx; }
.context-save { min-height: 48px; margin: 0; padding: 12rpx 28rpx; border-radius: 14rpx; background: var(--kotoba-green); color: white; font-size: 26rpx; }
</style>
