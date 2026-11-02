import type {Data,Lesson,WordState} from '@jp/models';

/** The earliest lesson with actual, unignored new words in this book. */
export function nextUnlearnedLesson(data:Data,bookId:string,userId='local'):Lesson|undefined {
  const states=new Map<string,WordState>();
  for(const state of data.states){
    if((state.userId===userId||state.userId==='local')&&!states.has(state.wordId))states.set(state.wordId,state);
  }
  const pendingLessons=new Set<string>();
  for(const word of data.words){
    const state=states.get(word.id);
    if(!state?.isIgnored&&!state?.firstSeenAt&&(state?.reviewCount??0)<=0)pendingLessons.add(word.lessonId);
  }
  return data.lessons.filter(lesson=>lesson.bookId===bookId&&pendingLessons.has(lesson.id))
    .sort((a,b)=>a.order-b.order)[0];
}
