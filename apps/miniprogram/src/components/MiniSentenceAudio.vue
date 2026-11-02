<script setup lang="ts">
import {ref,watch,onUnmounted} from 'vue';
import {onHide,onShow,onUnload} from '@dcloudio/uni-app';
import {UniAudioPlayer} from '../adapters/audio';
import {getCloudflareAudioUrl} from '../adapters/audio-url';
import {miniAnswerSound} from '../services/answer-sound';
import {miniSentenceAudioUrl} from '../services/sentence-audio';

const props=withDefaults(defineProps<{text:string;voice?:'female'|'male';disabled?:boolean}>(),{voice:'female',disabled:false});
const preparing=ref(false),speaking=ref(false),error=ref(''),unavailable=ref(false);
let player:UniAudioPlayer|undefined,generation=0,visible=true,lastSlow=false;
function stop(){generation++;preparing.value=false;speaking.value=false;const previous=player;player=undefined;try{previous?.destroy()}catch{}}
async function play(slow=false){
  if(!visible||props.disabled||!props.text.trim())return;
  stop();miniAnswerSound.stop();lastSlow=slow;error.value='';unavailable.value=false;
  const ticket=generation;preparing.value=true;
  try{
    const primary=await miniSentenceAudioUrl(props.text,props.voice);
    if(ticket!==generation||!visible)return;
    if(!primary){unavailable.value=true;return;}
    preparing.value=false;speaking.value=true;
    const urls=[primary,getCloudflareAudioUrl(primary)].filter((url,index,all):url is string=>!!url&&all.indexOf(url)===index);
    const onInterrupted=()=>{if(ticket===generation)stop();};
    let played=false;
    for(const url of urls){
      if(ticket!==generation||!visible)return;
      player=new UniAudioPlayer();
      played=await player.play(url,{slow,onInterrupted});
      if(ticket!==generation||!visible)return;
      player.destroy();player=undefined;
      if(played)break;
    }
    if(!played)error.value='这句暂时无法播放，请重试。';
  }catch(cause){if(ticket===generation)error.value=cause instanceof Error&&cause.message.includes('隐私')?cause.message:'例句朗读暂时不可用，请重试。';}
  finally{if(ticket===generation){preparing.value=false;speaking.value=false;player?.destroy();player=undefined;}}
}
watch(()=>[props.text,props.voice,props.disabled],()=>{stop();error.value='';unavailable.value=false;});
function leave(){visible=false;stop();}
onShow(()=>{visible=true;});onHide(leave);onUnload(leave);onUnmounted(stop);
</script>
<template>
  <view class="sentence-audio" @tap.stop>
    <view class="sentence-audio-buttons" role="group" aria-label="例句朗读">
      <button class="sentence-audio-button" :disabled="disabled" :aria-busy="preparing" @tap="preparing||speaking?stop():play(false)">{{preparing?'取消等待':speaking?'停止':'朗读用例'}}</button>
      <button class="sentence-audio-button" :disabled="disabled||preparing||speaking" @tap="play(true)">慢速</button>
      <text class="sentence-audio-source">Google 日语语音</text>
    </view>
    <text v-if="preparing" class="sentence-audio-notice" role="status">正在准备朗读…</text>
    <text v-if="unavailable" class="sentence-audio-notice" role="status">这句暂未提供朗读。</text>
    <view v-if="error" class="sentence-audio-error" role="status"><text>{{error}}</text><button class="sentence-audio-button" :disabled="disabled||preparing||speaking" @tap="play(lastSlow)">重试朗读</button></view>
  </view>
</template>
<style scoped>
.sentence-audio{margin-top:16rpx;min-width:0}.sentence-audio-buttons,.sentence-audio-error{display:flex;align-items:center;flex-wrap:wrap;gap:12rpx}.sentence-audio-button{display:inline-flex;align-items:center;justify-content:center;min-height:88rpx;margin:0;padding:12rpx 22rpx;border:1rpx solid #dbe3d3;border-radius:14rpx;background:transparent;color:#365d3d;font-size:24rpx;line-height:1.5}.sentence-audio-button::after{border:0}.sentence-audio-button[disabled]{opacity:.45}.sentence-audio-source,.sentence-audio-notice{color:#74826a;font-size:22rpx;line-height:1.7}.sentence-audio-notice{display:block;margin-top:8rpx}.sentence-audio-error{margin-top:8rpx;color:#92543e;font-size:24rpx;line-height:1.7}
</style>
