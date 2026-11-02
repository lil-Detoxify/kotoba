import {reactive} from 'vue';
import type {LearningExample} from './learning-example';
import {loadBookUsageDeepening} from './learning-usage-deepening';

export const bookLearningExamples=reactive(new Map<string,LearningExample>());
const loaders=import.meta.glob<Record<string,LearningExample>>('../learning-examples-biaori/*.json',{import:'default'});
const pending=new Map<string,Promise<boolean>>();

/** Load only the active textbook's extra examples; cached words still need this after a reload. */
export function loadBookLearningExamples(bookId:string):Promise<boolean>{
  void loadBookUsageDeepening(bookId);
  const loader=loaders[`../learning-examples-biaori/${bookId}.json`];
  if(!loader)return Promise.resolve(true);
  const existing=pending.get(bookId);
  if(existing)return existing;
  const request=loader().then(examples=>{
    for(const [key,example] of Object.entries(examples))bookLearningExamples.set(key,example);
    return true;
  }).catch(error=>{
    pending.delete(bookId);
    console.warn(`Failed to load examples for ${bookId}:`,error);
    return false;
  });
  pending.set(bookId,request);
  return request;
}
