<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import type { Word } from '@jp/models';
import { UniAudioPlayer } from '../adapters/audio';
import { getCloudflareAudioUrl, getWordAudioFallbackUrl, getWordAudioUrl } from '../adapters/audio-url';
import { miniAnswerSound } from '../services/answer-sound';

type AudioWord = Pick<Word, 'term' | 'reading' | 'audioUrl' | 'audioTerm' | 'rawTerm'>;
const props = withDefaults(defineProps<{ word: AudioWord; voice?: 'female' | 'male' }>(), { voice: 'female' });

const speaking = ref(false);
const error = ref('');
let player: UniAudioPlayer | undefined;
let generation = 0;
let visible = true;

function stop(): void {
  generation += 1;
  speaking.value = false;
  const previous = player;
  player = undefined;
  try { previous?.destroy(); } catch { /* Native cleanup is best-effort during navigation. */ }
}

async function play(slow = false): Promise<void> {
  if (!visible) return;
  miniAnswerSound.stop();
  error.value = '';

  const primary = getWordAudioUrl(props.word, props.voice);
  if (!primary) {
    error.value = '暂无可用发音，请稍后重试。';
    return;
  }

  const ticket = ++generation;
  const fallback = getWordAudioFallbackUrl(props.word);
  const urls = [primary, getCloudflareAudioUrl(primary), fallback, fallback ? getCloudflareAudioUrl(fallback) : undefined]
    .filter((url, index, all): url is string => !!url && all.indexOf(url) === index);
  speaking.value = true;

  const onInterrupted = () => {
    if (ticket === generation) {
      generation += 1;
      speaking.value = false;
    }
  };
  let requestPlayer: UniAudioPlayer | undefined;
  try {
    let played = false;
    for (const url of urls) {
      if (ticket !== generation || !visible) return;
      player ||= new UniAudioPlayer();
      requestPlayer = player;
      played = await player.play(url, { slow, onInterrupted });
      if (ticket !== generation || !visible) return;
      if (played) break;
    }
    if (!played && ticket === generation) error.value = '发音暂时无法播放，请稍后重试。';
  } catch {
    if (ticket === generation) error.value = '发音暂时无法播放，请稍后重试。';
  } finally {
    if (ticket === generation) speaking.value = false;
    if (requestPlayer && player === requestPlayer) { requestPlayer.destroy(); player = undefined; }
  }
}

watch(() => [props.word.term, props.word.reading, props.word.audioUrl, props.word.audioTerm, props.word.rawTerm, props.voice], () => {
  error.value = '';
  stop();
});

function leave(): void { visible = false; stop(); }
onShow(() => { visible = true; });
onHide(leave);
onUnload(leave);
onUnmounted(() => { stop(); player?.destroy(); player = undefined; });
</script>

<template>
  <view class="word-audio" @tap.stop>
    <button class="audio-button" :class="{ 'is-speaking': speaking }" :aria-label="speaking ? '停止词语发音' : '播放词语发音'" @tap="speaking ? stop() : play(false)">
      {{ speaking ? '停止' : '播放' }}
    </button>
    <button class="audio-button slow-button" :disabled="speaking" aria-label="慢速播放词语发音" @tap="play(true)">慢速</button>
    <text v-if="error" class="audio-error">{{ error }}</text>
  </view>
</template>

<style scoped>
.word-audio { display: flex; align-items: center; flex-wrap: wrap; gap: 10rpx; }
.audio-button { min-height: 42px; margin: 0; padding: 8rpx 18rpx; border: 1rpx solid var(--kotoba-line); border-radius: 999rpx; background: var(--kotoba-paper); color: var(--kotoba-green); font-size: 23rpx; line-height: 1.4; }
.audio-button::after { border: 0; }
.audio-button.is-speaking { background: #edf3e8; }
.slow-button { color: var(--kotoba-muted); }
.audio-error { flex-basis: 100%; color: #9b4e36; font-size: 22rpx; line-height: 1.5; }
</style>
