<script setup lang="ts">
import {getCurrentInstance,ref} from 'vue';

interface ClozeQuestion {
  before:string;
  after:string;
  answer:string;
  reading:string;
  ja:string;
  zh:string;
}

const props=defineProps<{
  question:ClozeQuestion;
  value:string;
  revealed:boolean;
  matches:boolean;
  busy:boolean;
  audioAvailable?:boolean;
  audioSourceLabel?:string;
  speaking?:boolean;
  audioError?:string;
  sourceLabel?:string;
}>();

const emit=defineEmits<{
  'update:value':[value:string];
  reveal:[];
  grade:[rating:1|2|3];
  play:[slow:boolean];
  stop:[];
}>();

const composing=ref(false);
const inputId=`sentence-cloze-input-${getCurrentInstance()?.uid??0}`;

function updateValue(event:Event){
  emit('update:value',(event.target as HTMLInputElement).value);
}

function handleEnter(event:KeyboardEvent){
  if(event.key!=='Enter'||props.busy||props.revealed)return;
  if(event.isComposing||composing.value||event.keyCode===229)return;
  event.preventDefault();
  emit('reveal');
  (event.currentTarget as HTMLInputElement).blur();
}
</script>

<template>
  <section class="sentence-cloze" aria-label="句子填空">
    <p v-if="sourceLabel" class="cloze-source-label">{{sourceLabel}}</p>
    <p v-if="question.zh" class="cloze-translation">{{question.zh}}</p>

    <div class="cloze-entry">
      <label class="cloze-input-label" :for="inputId">补全句子</label>
      <p class="cloze-sentence" lang="ja">
        <span>{{question.before}}</span>
        <input
          :id="inputId"
          type="text"
          lang="ja"
          :value="value"
          :disabled="busy"
          :readonly="revealed"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          @input="updateValue"
          @compositionstart="composing=true"
          @compositionend="composing=false"
          @keydown="handleEnter"
        >
        <span>{{question.after}}</span>
      </p>
    </div>

    <div v-if="!revealed" class="cloze-actions" aria-label="查看例句">
      <button type="button" class="cloze-primary" :disabled="busy" @click="emit('reveal')">对照示例</button>
      <button type="button" class="cloze-secondary" :disabled="busy" @click="emit('reveal')">暂时想不起</button>
    </div>

    <div v-else class="cloze-reveal" role="status" aria-live="polite">
      <p class="cloze-feedback">{{matches?'与示例一致':'看看原句的用法'}}</p>
      <p class="cloze-original" lang="ja">{{question.ja}}</p>
      <div v-if="audioAvailable" class="cloze-audio" role="group" aria-label="原句朗读">
        <button type="button" :disabled="busy" @click="emit('play',false)">朗读原句</button>
        <button type="button" :disabled="busy" @click="emit('play',true)">慢速</button>
        <button v-if="speaking" type="button" @click="emit('stop')">停止</button>
        <small>{{audioSourceLabel||'设备日语语音'}}</small>
      </div>
      <p v-else class="cloze-rating-note">设备暂未提供日语朗读语音</p>
      <p v-if="audioError" class="cloze-rating-note" role="status">{{audioError}}</p>
      <div class="cloze-answer-meta">
        <span>补全部分：<strong lang="ja">{{question.answer}}</strong></span>
        <span v-if="question.reading">读音：<strong lang="ja">{{question.reading}}</strong></span>
      </div>
      <p class="cloze-rating-note">对照示例后，按自己的记忆程度评价。</p>
      <div class="cloze-ratings" role="group" aria-label="记忆程度评价">
        <button type="button" class="rating-forgot" :disabled="busy" @click="emit('grade',1)">忘记了</button>
        <button type="button" class="rating-fuzzy" :disabled="busy" @click="emit('grade',2)">模糊</button>
        <button type="button" class="rating-remembered" :disabled="busy" @click="emit('grade',3)">记得</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sentence-cloze{display:grid;gap:18px;padding:6px 0;color:#293e30}
.cloze-source-label{margin:0;font-size:12px;line-height:1.6;color:var(--green)}
.cloze-translation{margin:0;color:#58694f;font-size:15px;line-height:1.8}
.cloze-entry{min-width:0}
.cloze-input-label{display:block;margin:0 0 7px;color:#71806d;font-size:12px;line-height:1.5}
.cloze-sentence{margin:0;color:#293e30;font-size:clamp(20px,3vw,25px);line-height:1.9;letter-spacing:.01em;overflow-wrap:anywhere}
.cloze-sentence input{display:inline-block;vertical-align:baseline;width:clamp(5.5rem,24vw,10rem);min-width:5.5rem;max-width:100%;margin:0 2px;padding:0 3px 2px;border:0;border-bottom:2px solid #718c68;border-radius:0;background:transparent;color:inherit;font:inherit;line-height:1.5;text-align:center}
.cloze-sentence input:focus-visible{border-bottom-color:var(--green)}
.cloze-sentence input[readonly]{color:#50694c}
.cloze-actions,.cloze-ratings{display:flex;flex-wrap:wrap;gap:10px}
.cloze-audio{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.cloze-audio button{min-height:44px;padding:7px 12px;font-size:12px;background:transparent;border-color:var(--line)}
.cloze-audio small{font-size:11px;color:var(--muted)}
.cloze-actions button,.cloze-ratings button{min-height:44px;padding:10px 16px;border:0;border-radius:9px;font-size:13px;line-height:1.4;cursor:pointer}
.cloze-primary{background:var(--green);color:#fff}
.cloze-primary:not(:disabled):hover{background:#254b35}
.cloze-secondary{background:#edf2e8;color:#38553d}
.cloze-ratings button{flex:1 1 110px}
.rating-forgot{background:#f3eee8;color:#785d44}
.rating-fuzzy{background:#f2f2e8;color:#686744}
.rating-remembered{background:#e8f0e5;color:#315944}
.cloze-reveal{display:grid;gap:10px;padding-top:3px}
.cloze-feedback{margin:0;color:var(--green);font-size:14px;font-weight:600;line-height:1.6}
.cloze-original{margin:0;padding-left:13px;border-left:2px solid #b5c6a5;color:#293e30;font-size:22px;line-height:1.75;overflow-wrap:anywhere}
.cloze-answer-meta{display:flex;flex-wrap:wrap;gap:5px 18px;color:#64735c;font-size:13px;line-height:1.7}
.cloze-answer-meta strong{color:#354d38;font-weight:600}
.cloze-rating-note{margin:2px 0 0;color:#66745f;font-size:13px;line-height:1.7}
.cloze-ratings{margin-top:2px}
.cloze-actions button:disabled,.cloze-ratings button:disabled{cursor:default;opacity:.58}
@media(max-width:560px){
  .sentence-cloze{gap:15px}
  .cloze-translation{font-size:14px}
  .cloze-sentence{font-size:20px;line-height:1.85}
  .cloze-original{font-size:19px}
  .cloze-actions,.cloze-ratings{gap:8px}
  .cloze-actions button,.cloze-ratings button{flex:1 1 135px;padding:10px 12px}
}
</style>
