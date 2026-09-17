import type {Word,QuizType,QuizAttempt} from '@jp/models';
export interface Question {type:QuizType;wordId:string;prompt:string;options:string[];correct:string}
export const toHiragana=(value:string)=>value.normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const normalize=(s:string)=>s.normalize('NFKC').replace(/\s/g,'').toLowerCase();
const meanings=(w:Word)=>w.meaning.split(/[;；、,，]/).map(normalize).filter(Boolean);
const overlaps=(a:Word,b:Word)=>meanings(a).some(m=>meanings(b).includes(m));
function shuffle<T>(items:T[],random:()=>number){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result}
/** Only distractors outside the prompt's equivalence class are safe to score. */
export function createQuestion(word:Word,pool:Word[],type:QuizType,random:()=>number=Math.random):Question|null{
 if(type==='kanji-reading'&&!/\p{Script=Han}/u.test(word.term))return null;
 const value=(w:Word)=>type==='kanji-reading'?toHiragana(w.reading):w.meaning.trim();
 const correct=value(word);if(!correct||!word.reading.trim())return null;
 const equivalent=pool.filter(w=>type==='kanji-reading'?normalize(w.term)===normalize(word.term):toHiragana(w.reading)===toHiragana(word.reading));
 const blocked=new Set([normalize(correct),...equivalent.map(w=>normalize(value(w)))]);
 const candidates=shuffle(pool,random).filter(w=>w.id!==word.id&&normalize(w.term)!==normalize(word.term)&&toHiragana(w.reading)!==toHiragana(word.reading)&&!overlaps(word,w));
 const distractors:string[]=[];for(const w of candidates){const v=value(w);if(!v||blocked.has(normalize(v))||equivalent.some(e=>type!=='kanji-reading'&&overlaps(e,w)))continue;blocked.add(normalize(v));distractors.push(v);if(distractors.length===3)break}
 if(distractors.length<1)return null;
 return {type,wordId:word.id,prompt:type==='kanji-reading'?word.term:type==='kana-meaning'?toHiragana(word.reading):'',options:shuffle([correct,...distractors],random),correct};
}
export function quizAttempt(question:Question,selected:string|null):QuizAttempt{
 if(selected!==null&&!question.options.includes(selected))throw Error('答案不在本题选项中');
 return {type:question.type,prompt:question.prompt,options:[...question.options],selected,correct:question.correct,isCorrect:selected===question.correct};
}
export function quizRating(attempt:QuizAttempt,uncertain=false):1|2|3{return attempt.isCorrect?(uncertain?2:3):1}
