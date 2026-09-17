import {ref,watch,onMounted,onUnmounted} from 'vue';
import type {Word} from '@jp/models';
import audioMap from '../audio-map.json';
import {usePronunciationPreference,type PronunciationVoice} from '../services/pronunciationPreference';
import {getGoogleAudioUrl} from '../services/audioUrl';

const bundled=audioMap as Record<string,string>;

export function usePronunciation(){
 const {voice:selectedVoice,voiceModel,setVoice}=usePronunciationPreference();
 const hasJapaneseVoice=ref(false);
 const speaking=ref(false);
 const error=ref('');
 let audio:HTMLAudioElement|undefined;
 let generation=0;
 let timeout:ReturnType<typeof setTimeout>|undefined;

 const synth=typeof speechSynthesis==='undefined'?undefined:speechSynthesis;
 const deviceVoice=()=>synth?.getVoices().find(v=>/^ja(?:-|_)/i.test(v.lang));
 function update(){hasJapaneseVoice.value=!!deviceVoice()}

 function source(word:Word){
   return word.audioUrl||bundled[`${word.term}|${word.reading}`];
 }

 function available(word:Word){
   return !!word.reading||!!source(word)||hasJapaneseVoice.value;
 }

 function stop(){
   generation++;
   audio?.pause();
   audio=undefined;
   synth?.cancel();
   speaking.value=false;
   if(timeout)clearTimeout(timeout);
   timeout=undefined;
 }

 watch(selectedVoice,()=>{stop();error.value=''});

 async function play(word:Word,slow=false):Promise<boolean>{
   stop();
   error.value='';
   const ticket=generation;
   speaking.value=true;
   try{
     const googleUrl = await getGoogleAudioUrl(word.term, word.reading, selectedVoice.value);
     const url = googleUrl || source(word);
     if(url){
       audio=new Audio(url);
       audio.playbackRate=slow?.75:1;
       const media=audio;
       media.onended=()=>{if(ticket===generation)speaking.value=false};
       media.onerror=()=>{
         if(ticket===generation){
           speaking.value=false;
           error.value='音频无法播放，请重试或切换题型';
         }
       };
       await Promise.race([
         media.play(),
         new Promise<never>((_,reject)=>{
           timeout=setTimeout(()=>reject(Error('播放超时')),10000);
         })
       ]);
       if(timeout)clearTimeout(timeout);
       timeout=undefined;
       return ticket===generation;
     }
     const selected=deviceVoice();
     if(!synth||!selected)throw Error('没有可用的日语语音');
     return await new Promise<boolean>(resolve=>{
       let started=false;
       const utterance=new SpeechSynthesisUtterance(word.reading);
       utterance.lang='ja-JP';
       utterance.voice=selected;
       utterance.rate=slow?.65:.9;
       utterance.onstart=()=>{
         started=true;
         if(timeout)clearTimeout(timeout);
         timeout=undefined;
         resolve(ticket===generation);
       };
       utterance.onend=()=>{if(ticket===generation)speaking.value=false};
       utterance.onerror=()=>{
         if(ticket===generation){
           error.value='合成发音失败，请重试或切换题型';
           speaking.value=false;
         }
         resolve(false);
       };
       timeout=setTimeout(()=>{
         if(!started){
           if(ticket===generation){
             error.value='日语语音未能播放，请切换题型';
             speaking.value=false;
             synth.cancel();
           }
           resolve(false);
         }
       },8000);
       synth.speak(utterance);
     });
   }catch{
     if(ticket===generation){
       stop();
       error.value='音频无法播放，请重试或切换题型';
     }
     return false;
   }
 }

 onMounted(()=>{update();synth?.addEventListener('voiceschanged',update)});
 onUnmounted(()=>{stop();synth?.removeEventListener('voiceschanged',update)});

 function sourceLabel(word:Word){
   if(word.reading)return selectedVoice.value==='female'?'Google WaveNet · 女声 A':'Google WaveNet · 男声 C';
   if(word.audioUrl)return `词书音频 · 未生成所选${selectedVoice.value==='female'?'女声':'男声'}`;
   if(bundled[`${word.term}|${word.reading}`])return `本地发音 · 未生成所选${selectedVoice.value==='female'?'女声':'男声'}`;
   return `设备合成发音 · 未提供所选${selectedVoice.value==='female'?'女声':'男声'}`;
 }

 return{available,play,stop,error,speaking,hasJapaneseVoice,source,sourceLabel,selectedVoice,voiceModel,setVoice};
}
