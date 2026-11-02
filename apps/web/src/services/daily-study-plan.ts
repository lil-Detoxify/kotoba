import type {Data,Word,WordState} from '@jp/models';
import {dayKey} from '@jp/shared';
import type {DailyPace} from './study-plan-preference';

export interface DailyStudyPlan {
  lessonId?: string;
  lessonTitle: string;
  target: number;
  completed: number;
  remaining: number;
  pendingWordIds: string[];
}

/** Today's anchor includes words first learned today, so finishing a goal cannot move it forward. */
export function dailyStudyPlan(data: Data, bookId: string, pace: DailyPace, now = new Date(), userId = 'local'): DailyStudyPlan {
  const today = dayKey(now);
  const states = new Map<string,WordState>();
  for (const state of data.states) {
    if ((state.userId === userId || state.userId === 'local') && !states.has(state.wordId)) states.set(state.wordId,state);
  }
  const isLearned = (word:Word) => {
    const state=states.get(word.id);
    return !!state?.firstSeenAt || (state?.reviewCount??0)>0;
  };
  const beforeToday = (word:Word) => {
    const state=states.get(word.id);
    return state?.firstSeenAt ? dayKey(new Date(state.firstSeenAt))<today : (state?.reviewCount??0)>0;
  };
  const wordsByLesson = new Map<string,Word[]>();
  for (const word of data.words) {
    if (states.get(word.id)?.isIgnored) continue;
    const words=wordsByLesson.get(word.lessonId)??[];
    words.push(word);wordsByLesson.set(word.lessonId,words);
  }
  const lessons=data.lessons.filter(lesson=>lesson.bookId===bookId).slice().sort((a,b)=>a.order-b.order);
  for (const lesson of lessons) {
    const words=(wordsByLesson.get(lesson.id)??[]).slice().sort((a,b)=>a.order-b.order);
    const availableAtStart=words.filter(word=>!beforeToday(word));
    if(!availableAtStart.length)continue;
    const targetWords=availableAtStart.slice(0,Math.min(availableAtStart.length,Math.ceil(words.length*pace)));
    const pending=targetWords.filter(word=>!isLearned(word));
    return {lessonId:lesson.id,lessonTitle:lesson.title,target:targetWords.length,completed:targetWords.length-pending.length,remaining:pending.length,pendingWordIds:pending.map(word=>word.id)};
  }
  return {lessonTitle:'',target:0,completed:0,remaining:0,pendingWordIds:[]};
}
