<script setup lang="ts">
import {ArrowRight, Check} from 'lucide-vue-next';
import type {DailyStudyPlan} from '../services/daily-study-plan';
import type {DailyPace} from '../services/study-plan-preference';

const props=defineProps<{
  plan:DailyStudyPlan;
  pace:DailyPace;
  unitLabel:string;
  resume?:{remaining:number;scope:string};
  busy:boolean;
}>();

const emit=defineEmits<{
  daily:[];
  resume:[];
  pace:[value:DailyPace];
}>();

function changePace(event:Event){
  const value=(event.target as HTMLSelectElement).value;
  emit('pace',value==='0.5'?0.5:1);
}
</script>

<template>
  <section class="book-study-entry" aria-labelledby="book-study-entry-title" :aria-busy="busy">
    <div class="entry-main">
      <template v-if="resume">
        <p class="eyebrow">接着上次</p>
        <h2 id="book-study-entry-title">{{resume.scope}}</h2>
        <p class="entry-description">还剩 {{resume.remaining}} 词</p>
        <button class="book-study-entry-primary" type="button" :disabled="busy" @click="emit('resume')">
          {{busy?'正在准备…':'继续上次学习'}} <ArrowRight :size="17" aria-hidden="true"/>
        </button>
      </template>

      <template v-else-if="plan.remaining>0">
        <p class="eyebrow">今日计划</p>
        <h2 id="book-study-entry-title">{{plan.lessonTitle}}</h2>
        <p class="entry-description">还剩 {{plan.remaining}} 词</p>
        <button class="book-study-entry-primary" type="button" :disabled="busy" @click="emit('daily')">
          {{busy?'正在准备…':'按今日计划开始'}} <ArrowRight :size="17" aria-hidden="true"/>
        </button>
      </template>

      <template v-else-if="plan.target>0">
        <p class="eyebrow">今日计划</p>
        <h2 id="book-study-entry-title">今日计划已完成</h2>
        <p class="entry-description"><Check :size="17" aria-hidden="true"/> 已完成 {{plan.completed}} / {{plan.target}} 词。今天可以到这里，也可以自由选课继续。</p>
      </template>

      <template v-else>
        <p class="eyebrow">今日计划</p>
        <h2 id="book-study-entry-title">今日计划暂无待学新词</h2>
        <p class="entry-description">可以自由选择词书内容继续学习。</p>
      </template>
    </div>

    <div class="book-plan-progress" aria-label="每日计划进度">
      <p v-if="plan.target>0" class="plan-progress-copy">
        <strong v-if="resume">今日 · {{plan.lessonTitle}}</strong>
        <span v-if="resume">还剩 {{plan.remaining}} 词</span>
        <span>已完成 {{plan.completed}} / {{plan.target}} 词</span>
      </p>
      <label for="book-daily-pace">每日进度
        <select id="book-daily-pace" :value="pace" :disabled="busy" @change="changePace">
          <option :value="0.5">半{{unitLabel}}/天</option>
          <option :value="1">1{{unitLabel}}/天</option>
        </select>
      </label>
    </div>
  </section>
</template>

<style scoped>
.book-study-entry{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.75fr);align-items:center;gap:22px;padding:19px 22px;border:1px solid var(--line);border-radius:10px;background:#f7f8f4;color:#283b32;text-align:left}
.entry-main{min-width:0}
.entry-main .eyebrow{margin:0 0 5px;color:#66775e;font-size:12px;font-weight:600;letter-spacing:1px;line-height:1.5}
.entry-main h2{margin:0;color:var(--green);font-size:19px;font-weight:600;line-height:1.45;overflow-wrap:anywhere}
.entry-description{display:flex;align-items:center;gap:7px;margin:4px 0 11px;color:var(--muted);font-size:14px;line-height:1.6}
.book-study-entry-primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:9px 15px;border:1px solid var(--green);border-radius:6px;background:var(--green);color:white;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.book-study-entry-primary:hover{background:#274b38}
.book-study-entry-primary:disabled{opacity:.58;cursor:wait}
.book-study-entry-primary:focus-visible,#book-daily-pace:focus-visible{outline:3px solid #b08037;outline-offset:3px}
.book-plan-progress{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,auto);align-items:center;gap:12px;min-width:0;padding-left:18px;border-left:1px solid var(--line)}
.plan-progress-copy{display:grid;gap:3px;min-width:0;margin:0;color:var(--muted);font-size:14px;line-height:1.5}
.plan-progress-copy strong{overflow-wrap:anywhere;color:#34483d;font-size:14px;font-weight:600}
.book-plan-progress label{display:grid;gap:5px;color:#526257;font-size:14px;line-height:1.5}
.book-plan-progress select{width:100%;min-height:44px;margin:0;padding:8px 28px 8px 10px;border:1px solid #c7d0c5;border-radius:6px;background:var(--paper);color:inherit;font:inherit;font-size:14px}
.book-plan-progress select:disabled{opacity:.58;cursor:wait}
@media(max-width:620px){.book-study-entry{grid-template-columns:minmax(0,1fr);gap:14px;padding:17px}.book-plan-progress{grid-template-columns:minmax(0,1fr) minmax(130px,auto);padding:13px 0 0;border-top:1px solid var(--line);border-left:0}}
@media(max-width:390px){.book-plan-progress{grid-template-columns:minmax(0,1fr)}.book-plan-progress select{max-width:100%}.book-study-entry-primary{width:100%}}
</style>
