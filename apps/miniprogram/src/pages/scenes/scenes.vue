<script lang="ts">
import { createFriendShare, createTimelineShare } from '../../services/share';
export default { onShareAppMessage: createFriendShare, onShareTimeline: createTimelineShare };
</script>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app';
import type { Data } from '@jp/models';
import MiniPage from '../../components/MiniPage.vue';
import MiniHeader from '../../components/MiniHeader.vue';
import MiniNotice from '../../components/MiniNotice.vue';
import MiniSceneTask from '../../components/MiniSceneTask.vue';
import MiniMeaningText from '../../components/MiniMeaningText.vue';
import MiniSentenceAudio from '../../components/MiniSentenceAudio.vue';
import { useMiniPageActivity } from '../../services/page-motion';
import { miniAnswerSound } from '../../services/answer-sound';
import { learningScenes, sceneFor, resolveSceneWords, sceneStudyWords, taskForScene, type SceneItem } from '../../services/learning-scenes';
import { defaultRepository } from '../../adapters';
import { defaultTextbooks, textbookCatalog } from '../../services/textbooks';
import { fullBookTitle } from '../../services/book-presentation';
useMiniPageActivity();
const sceneId = ref<string>();
const activeScene = computed(() => sceneFor(sceneId.value));
const data = ref<Data | null>(null);
const loading = ref(false);
const message = ref('');
const showReading = ref(false);
const showTranslation = ref(false);
const taskRunning = ref(false);
const audioVoice = computed(() => data.value?.userSettings?.preferences?.pronunciationVoice === 'male' ? 'male' : 'female');
const entries = computed(() => activeScene.value && data.value ? resolveSceneWords(activeScene.value, data.value) : []);
const wordsByItem = computed(() => new Map(entries.value.map(entry => [entry.item, entry.word])));
let generation = 0;
let visible = true;
function sourceTitle(bookId: string) {
  const book = textbookCatalog.find(item => item.id === bookId);
  return book ? fullBookTitle(book) : '原词书';
}
function isIgnored(item: SceneItem) {
  const word = wordsByItem.value.get(item);
  return !!word && !!data.value?.states.find(state => state.wordId === word.id)?.isIgnored;
}
function openScene(id: string) { uni.navigateTo({ url: `/pages/scenes/scenes?sceneId=${encodeURIComponent(id)}` }); }
function showAll() { uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/scenes/scenes' }) }); }
async function launch(exercise: 'card' | 'cloze') {
  const scene = activeScene.value;
  if (!scene || loading.value) return;
  const ticket = ++generation, key = defaultRepository.getActiveKey();
  const current = () => visible && ticket === generation && key === defaultRepository.getActiveKey();
  loading.value = true; message.value = '';
  try {
    let snapshot = await defaultTextbooks.hydrate(key);
    for (const bookId of new Set(scene.items.map(item => item.bookId))) {
      snapshot = await defaultTextbooks.ensureBookLoaded(bookId, key);
      if (!current()) return;
    }
    if (!current()) return;
    data.value = snapshot;
    if (resolveSceneWords(scene, snapshot).length !== scene.items.length) throw new Error('部分场景词条尚未读取，请重试。');
    if (!sceneStudyWords(scene, snapshot).length) throw new Error('这个场景的词都已忽略，可到生词本恢复后再练习。');
    uni.navigateTo({ url: `/pages/study/study?sceneId=${encodeURIComponent(scene.id)}&mode=difficult&exercise=${exercise}` });
  } catch (error) {
    if (current()) message.value = error instanceof Error ? error.message : '场景词汇暂时无法读取，请重试。';
  } finally { if (ticket === generation) loading.value = false; }
}
onLoad(query => { sceneId.value = query?.sceneId; });
onShow(() => {
  miniAnswerSound.setForeground(true);
  visible = true;
  const ticket = ++generation, key = defaultRepository.getActiveKey();
  void defaultTextbooks.hydrate(key).then(snapshot => {
    if (visible && ticket === generation && key === defaultRepository.getActiveKey()) data.value = snapshot;
  }).catch(() => { if (visible && ticket === generation) message.value = '本机词汇暂时无法读取，场景对话仍可浏览。'; });
});
function leave() { miniAnswerSound.stop(); generation++; visible = false; loading.value = false; }
onHide(leave); onUnload(leave);
</script>

<template>
  <MiniPage class="scenes-page">
    <template v-if="!sceneId">
      <MiniHeader kicker="JAPANESE IN REAL LIFE / 生活里的日语" title="生活场景" description="从熟悉的词开始，把日语放回真实的生活里。" />
      <view class="scene-list">
        <button v-for="(scene, index) in learningScenes" :key="scene.id" class="card scene-card motion-enter" hover-class="scene-pressed" @tap="openScene(scene.id)">
          <view class="scene-card-top"><text class="scene-number">0{{ index + 1 }}</text><text>进入场景 →</text></view>
          <text class="scene-title">{{ scene.title }}</text><text class="scene-description">{{ scene.description }}</text>
          <view class="scene-goals"><text v-for="goal in scene.canDo" :key="goal">{{ goal }}</text></view>
          <text class="scene-meta">{{ scene.items.length }} 个相关词 · {{ taskForScene(scene.id)?.steps.length }} 步回应 · 短对话</text>
        </button>
      </view>
      <text class="page-note">场景与活用短练习只反馈本次表现。背词仍沿用原词书进度。</text>
    </template>
    <template v-else-if="activeScene">
      <MiniHeader kicker="A LITTLE JAPANESE / 练习表达" :title="activeScene.title" :description="activeScene.description" />
      <button class="secondary-btn all-scenes" @tap="showAll">← 所有场景</button>
      <MiniSceneTask :scene-id="activeScene.id" :voice="audioVoice" @active="taskRunning = $event" />
      <template v-if="!taskRunning">
        <view class="card scene-goal-panel"><text class="section-title">这次想练习的</text><text v-for="goal in activeScene.canDo" :key="goal" class="goal-line">{{ goal }}</text></view>
        <view class="card scene-dialogue">
          <text class="section-title">看看他们怎么说</text>
          <view class="display-options"><button class="secondary-btn" :aria-pressed="showReading" @tap="showReading = !showReading">{{ showReading ? '隐藏读音' : '显示读音' }}</button><button class="secondary-btn" :aria-pressed="showTranslation" @tap="showTranslation = !showTranslation">{{ showTranslation ? '隐藏翻译' : '显示翻译' }}</button></view>
          <view v-for="(line, index) in activeScene.dialogue" :key="index" class="dialogue-line"><text class="speaker">{{ line.speaker }}</text><text class="japanese">{{ line.ja }}</text><MiniSentenceAudio :text="line.ja" :voice="audioVoice" /><text v-if="showReading" class="reading">{{ line.reading }}</text><text v-if="showTranslation" class="translation">{{ line.zh }}</text></view>
        </view>
        <view class="card scene-expressions"><text class="section-title">表达小贴士</text><view v-for="expression in activeScene.expressions" :key="expression.ja" class="expression-line"><text class="japanese">{{ expression.ja }}</text><MiniSentenceAudio :text="expression.ja" :voice="audioVoice" /><text v-if="showReading" class="reading">{{ expression.reading }}</text><text v-if="showTranslation" class="translation">{{ expression.zh }}</text><text class="expression-note">{{ expression.note }}</text></view></view>
        <view class="card scene-vocabulary">
          <text class="section-title">本场景会遇到的词</text>
          <text class="page-note">开始背词时按需读取原词书，保留原来的学习身份。</text>
          <view class="vocabulary-actions"><button class="primary-btn scene-cloze-start" :loading="loading" :disabled="loading" @tap="launch('cloze')">例句填空</button><button class="secondary-btn scene-card-start" :disabled="loading" @tap="launch('card')">先认识这些词</button></view>
          <MiniNotice :message="message" />
          <view v-for="item in activeScene.items" :key="`${item.bookId}:${item.term}:${item.reading}`" class="scene-word"><view class="word-heading"><text class="word-term">{{ item.term }}</text><text class="reading">{{ item.reading }}</text><text v-if="isIgnored(item)" class="ignored-label">已忽略</text></view><MiniMeaningText v-if="wordsByItem.get(item)" class="word-meaning" :word="wordsByItem.get(item)!" /><text class="japanese example-ja">{{ item.example.ja }}</text><MiniSentenceAudio :text="item.example.ja" :voice="audioVoice" /><text v-if="showReading" class="reading">{{ item.example.reading }}</text><text v-if="showTranslation" class="translation">{{ item.example.zh }}</text><text class="word-source">{{ sourceTitle(item.bookId) }}</text></view>
        </view>
      </template>
    </template>
    <view v-else class="card unavailable-scene"><text>这个场景暂不可用。</text><button class="secondary-btn" @tap="showAll">返回场景列表</button></view>
    <text class="page-endnote">ことばを、少しずつ。</text>
  </MiniPage>
</template>

<style scoped>
.scenes-page { padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
.scenes-page .card { padding: 32rpx; margin: 24rpx 0; background: var(--kotoba-paper); border: 1rpx solid var(--kotoba-line); border-radius: 24rpx; }
.scenes-page button { min-height: 48px; line-height: 1.5; font-size: 28rpx; }
.scene-card { width: 100%; display: flex; flex-direction: column; align-items: stretch; text-align: left; white-space: normal; }.scene-card::after { border: 0; }.scene-pressed { opacity: .8; }
.scene-card-top { display: flex; justify-content: space-between; align-items: center; color: var(--kotoba-muted); font-size: 23rpx; }.scene-number { font-size: 30rpx; color: var(--kotoba-green); }
.scene-title { display: block; margin: 24rpx 0 14rpx; color: var(--kotoba-green); font-size: 40rpx; font-weight: 700; }
.scene-description, .goal-line { display: block; color: var(--kotoba-ink); font-size: 28rpx; line-height: 1.8; }
.scene-goals { margin: 24rpx 0; padding-left: 20rpx; border-left: 2px solid var(--kotoba-line); }.scene-goals text { display: block; margin: 10rpx 0; font-size: 25rpx; line-height: 1.7; color: var(--kotoba-muted); }
.scene-meta, .page-note, .word-source { display: block; color: var(--kotoba-muted); font-size: 24rpx; line-height: 1.75; }
.section-title { display: block; margin-bottom: 24rpx; color: var(--kotoba-green); font-size: 34rpx; font-weight: 700; line-height: 1.5; }
.all-scenes { margin: 16rpx 0 24rpx; }.goal-line { margin: 12rpx 0; }
.display-options, .vocabulary-actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin: 24rpx 0; }.display-options button, .vocabulary-actions button { flex: 1 1 180rpx; margin: 0; }
.dialogue-line, .expression-line, .scene-word { padding: 24rpx 0; border-top: 1rpx solid var(--kotoba-line); }
.speaker { display: block; color: var(--kotoba-muted); font-size: 24rpx; margin-bottom: 12rpx; }
.japanese { display: block; color: var(--kotoba-ink); font-family: "Songti SC", "Noto Serif CJK JP", serif; font-size: 36rpx; line-height: 1.8; overflow-wrap: anywhere; }
.reading, .translation { display: block; margin-top: 10rpx; color: var(--kotoba-muted); font-size: 25rpx; line-height: 1.75; overflow-wrap: anywhere; }
.expression-note { display: block; margin-top: 16rpx; font-size: 26rpx; line-height: 1.8; color: var(--kotoba-ink); }
.word-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12rpx; }.word-term { font-size: 36rpx; color: var(--kotoba-green); }.word-heading .reading { margin: 0; }
.word-meaning { display: block; color: var(--kotoba-ink); font-size: 27rpx; margin: 12rpx 0; }.example-ja { margin-top: 20rpx; font-size: 31rpx; }.word-source { margin-top: 16rpx; }.ignored-label { color: var(--kotoba-muted); font-size: 23rpx; }
.scenes-page text { overflow-wrap: anywhere; }.unavailable-scene button { margin-top: 24rpx; }
</style>
