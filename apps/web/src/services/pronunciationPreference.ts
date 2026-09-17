import {ref, computed, type Ref, type WritableComputedRef} from 'vue';
export type PronunciationVoice = 'female' | 'male';
export const PRONUNCIATION_VOICES = [{value:'female',label:'女声 · A',googleName:'ja-JP-Wavenet-A'},{value:'male',label:'男声 · C',googleName:'ja-JP-Wavenet-C'}] as const;
const STORAGE_KEY='jp-vocab.pronunciation-voice'; const preference=ref<PronunciationVoice>('female'); let loaded=false;
function isVoice(value:unknown):value is PronunciationVoice{return value==='female'||value==='male'}
function load(){if(loaded||typeof localStorage==='undefined')return;loaded=true;try{const saved=localStorage.getItem(STORAGE_KEY);if(isVoice(saved))preference.value=saved}catch{}}
export function usePronunciationPreference():{voice:Ref<PronunciationVoice>;voiceModel:WritableComputedRef<PronunciationVoice>;setVoice:(value:PronunciationVoice)=>void}{load();function setVoice(value:PronunciationVoice){if(!isVoice(value))return;preference.value=value;try{localStorage.setItem(STORAGE_KEY,value)}catch{}}const voiceModel=computed({get:()=>preference.value,set:setVoice});return{voice:preference,voiceModel,setVoice}}
export function googleVoiceName(value:PronunciationVoice){return PRONUNCIATION_VOICES.find(item=>item.value===value)?.googleName??'ja-JP-Wavenet-A'}
