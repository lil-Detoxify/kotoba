<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {ReadingContext,Word} from '@jp/models';
import {useApp} from '../store';
import ReadingContextComposer from './ReadingContextComposer.vue';

const props=withDefaults(defineProps<{wordId:string;compact?:boolean;editable?:boolean}>(),{compact:false,editable:false});
const app=useApp();
const contexts=computed(()=>app.readingContextsForWord(props.wordId));
const sourceWord=computed<Word|undefined>(()=>app.data.words.find(word=>word.id===props.wordId));
const latest=computed(()=>contexts.value[0]);
const remaining=computed(()=>contexts.value.slice(1));
const editing=ref<ReadingContext>();
const removingId=ref('');
const error=ref('');
const notice=ref('');
const owner=computed(()=>app.currentUser?.id??null);
let operation=0;

function safeSourceUrl(value?:string){
  if(!value)return undefined;
  try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'?url.href:undefined}catch{return undefined}
}
function parts(sentence:string,matchedText?:string){
  if(!matchedText)return [{text:sentence,matched:false}];
  const at=sentence.indexOf(matchedText);
  if(at<0)return [{text:sentence,matched:false}];
  return [
    ...(at? [{text:sentence.slice(0,at),matched:false}]:[]),
    {text:matchedText,matched:true},
    ...(at+matchedText.length<sentence.length?[{text:sentence.slice(at+matchedText.length),matched:false}]:[])
  ];
}
function startEdit(context:ReadingContext){
  error.value='';notice.value='';editing.value=context;
}
function cancelEdit(){editing.value=undefined;error.value='';}
function saved(){editing.value=undefined;error.value='';notice.value='原句已保存。';}
async function remove(context:ReadingContext){
  const ticket=++operation;const wordId=props.wordId;const expectedUserId=owner.value;
  removingId.value=context.id;error.value='';notice.value='';
  try{
    const removed=await app.removeReadingContext(wordId,context.id,expectedUserId);
    if(ticket!==operation||wordId!==props.wordId||expectedUserId!==owner.value)return;
    if(!removed){error.value='原句未能移除，请刷新后重试。';return;}
    if(editing.value?.id===context.id)editing.value=undefined;
    notice.value='原句已移除。';
  }catch{
    if(ticket===operation&&wordId===props.wordId&&expectedUserId===owner.value)error.value='原句移除失败，请稍后重试。';
  }finally{
    if(ticket===operation)removingId.value='';
  }
}
watch(()=>[props.wordId,owner.value] as const,()=>{
  operation++;editing.value=undefined;removingId.value='';error.value='';notice.value='';
});
</script>

<template>
  <section v-if="contexts.length||notice||error||editing" class="reading-context-list" :class="{compact}">
    <details v-if="compact&&contexts.length" class="reading-context-drawer">
      <summary>阅读原句 · {{contexts.length}}</summary>
      <div class="reading-context-items">
        <article v-for="context in contexts" :key="context.id" class="reading-context-item">
          <p class="reading-context-sentence" lang="ja"><template v-for="(part,index) in parts(context.sentence,context.matchedText)" :key="index"><mark v-if="part.matched">{{part.text}}</mark><template v-else>{{part.text}}</template></template></p>
          <p v-if="context.translation" class="reading-context-translation">{{context.translation}}</p>
          <small v-if="context.sourceTitle||safeSourceUrl(context.sourceUrl)" class="reading-context-source"><a v-if="safeSourceUrl(context.sourceUrl)" :href="safeSourceUrl(context.sourceUrl)" target="_blank" rel="noopener noreferrer">{{context.sourceTitle||context.sourceUrl}}</a><span v-else>{{context.sourceTitle}}</span></small>
          <div v-if="editable" class="reading-context-actions"><button type="button" @click="startEdit(context)">修改</button><button type="button" :disabled="removingId===context.id" @click="remove(context)">{{removingId===context.id?'正在移除…':'移除'}}</button></div>
        </article>
      </div>
    </details>
    <template v-else-if="contexts.length">
      <div class="reading-context-heading"><h3>我的阅读原句</h3><span>{{contexts.length}} 条</span></div>
      <article v-if="latest" class="reading-context-item latest-context">
        <p class="reading-context-sentence" lang="ja"><template v-for="(part,index) in parts(latest.sentence,latest.matchedText)" :key="index"><mark v-if="part.matched">{{part.text}}</mark><template v-else>{{part.text}}</template></template></p>
        <p v-if="latest.translation" class="reading-context-translation">{{latest.translation}}</p>
        <small v-if="latest.sourceTitle||safeSourceUrl(latest.sourceUrl)" class="reading-context-source"><a v-if="safeSourceUrl(latest.sourceUrl)" :href="safeSourceUrl(latest.sourceUrl)" target="_blank" rel="noopener noreferrer">{{latest.sourceTitle||latest.sourceUrl}}</a><span v-else>{{latest.sourceTitle}}</span></small>
        <div v-if="editable" class="reading-context-actions"><button type="button" @click="startEdit(latest)">修改</button><button type="button" :disabled="removingId===latest.id" @click="remove(latest)">{{removingId===latest.id?'正在移除…':'移除'}}</button></div>
      </article>
      <details v-if="remaining.length" class="reading-context-more">
        <summary>查看其他 {{remaining.length}} 条阅读原句</summary>
        <div class="reading-context-items">
          <article v-for="context in remaining" :key="context.id" class="reading-context-item">
            <p class="reading-context-sentence" lang="ja"><template v-for="(part,index) in parts(context.sentence,context.matchedText)" :key="index"><mark v-if="part.matched">{{part.text}}</mark><template v-else>{{part.text}}</template></template></p>
            <p v-if="context.translation" class="reading-context-translation">{{context.translation}}</p>
            <small v-if="context.sourceTitle||safeSourceUrl(context.sourceUrl)" class="reading-context-source"><a v-if="safeSourceUrl(context.sourceUrl)" :href="safeSourceUrl(context.sourceUrl)" target="_blank" rel="noopener noreferrer">{{context.sourceTitle||context.sourceUrl}}</a><span v-else>{{context.sourceTitle}}</span></small>
            <div v-if="editable" class="reading-context-actions"><button type="button" @click="startEdit(context)">修改</button><button type="button" :disabled="removingId===context.id" @click="remove(context)">{{removingId===context.id?'正在移除…':'移除'}}</button></div>
          </article>
        </div>
      </details>
    </template>
    <p v-if="notice" class="reading-context-status" role="status">{{notice}}</p>
    <p v-if="error" class="reading-context-error" role="alert">{{error}}</p>
    <ReadingContextComposer v-if="editing&&sourceWord" :key="`${owner??'guest'}:${wordId}:${editing.id}`" :word="sourceWord" :existing="editing" :collect-to-difficult="false" @saved="saved" @cancel="cancelEdit" />
  </section>
</template>

<style scoped>
.reading-context-list{min-width:0;margin:18px 0;padding:16px 0;border-top:1px solid var(--border-soft);border-bottom:1px solid var(--border-soft)}
.reading-context-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.reading-context-heading h3{margin:0;font-size:14px;color:var(--green,#365d3d);font-weight:600}
.reading-context-heading span,.reading-context-source{font-size:11px;color:var(--muted,#748069)}
.reading-context-item{min-width:0;padding:10px 0;border-bottom:1px solid var(--border-soft)}
.reading-context-item:last-child{border-bottom:0}
.reading-context-sentence{margin:0;color:#283b31;font-size:16px;line-height:1.85;overflow-wrap:anywhere;word-break:normal}
.reading-context-sentence mark{background:var(--surface-selected);color:inherit;border-radius:4px;padding:0 1px}
.reading-context-translation{margin:5px 0 0;color:#68765f;font-size:12px;line-height:1.7;overflow-wrap:anywhere}
.reading-context-source{display:block;margin-top:6px;overflow-wrap:anywhere;word-break:break-word}
.reading-context-source a{color:#58714d;text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere;word-break:break-all}
.reading-context-more,.reading-context-drawer{margin-top:8px}
.reading-context-more summary,.reading-context-drawer summary{cursor:pointer;color:#65775a;font-size:12px;line-height:1.6;padding:8px 0;min-height:44px;overflow-wrap:anywhere}
.reading-context-drawer>summary{font-weight:600}
.reading-context-items{min-width:0}
.reading-context-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.reading-context-actions button{min-height:44px;padding:8px 13px;font-size:12px;background:var(--paper);border:1px solid var(--border-soft);border-radius:var(--radius-control);color:var(--green)}
.reading-context-actions button:disabled{opacity:.6}
.reading-context-status,.reading-context-error{margin:8px 0 0;font-size:12px;line-height:1.6}
.reading-context-status{color:#496d52}.reading-context-error{color:#8a3d2c}
.reading-context-list.compact{margin:8px 0 0;padding:0;border:0}
.compact .reading-context-drawer{margin:0}
.compact .reading-context-drawer>summary{font-size:11px;padding:6px 0;min-height:44px;font-weight:500}
@media(max-width:560px){.reading-context-list{padding:13px 0}.reading-context-sentence{font-size:15px;line-height:1.8}.reading-context-source a{word-break:break-all}}
</style>
