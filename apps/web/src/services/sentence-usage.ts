import type {Word} from '@jp/models';
import type {LearningExample} from './learning-example';
import {createVocabularyInflectionMatcher} from './japanese-inflection';

type UsageWord=Pick<Word,'term'|'reading'>&Partial<Pick<Word,'partOfSpeech'>>;
export interface SentenceUsage {kind:string;phrase:string;note:string}
const kana=(value:string)=>value.normalize('NFKC').replace(/[ァ-ヶ]/gu,char=>String.fromCharCode(char.charCodeAt(0)-0x60)).replace(/\s/gu,'');

/** Explain only a structure actually present in this example, never an invented collocation. */
export function sentenceUsageFor(word:UsageWord,example?:LearningExample):SentenceUsage|undefined {
  const answer=example?.cloze?.answer;
  const reading=example?.cloze?.reading;
  if(!example||!answer||!reading||example.ja.split(answer).length!==2||!kana(example.reading).includes(kana(reading)))return undefined;
  const pos=(word.partOfSpeech??'').normalize('NFKC');
  if(!pos||pos==='/'||/专|固有/u.test(pos))return undefined;
  const index=example.ja.indexOf(answer);
  const before=example.ja.slice(0,index),after=example.ja.slice(index+answer.length);
  const note=(kind:string,phrase:string,explanation:string):SentenceUsage=>({kind,phrase,note:`「${phrase}」${explanation}`});
  const verb=/[动動][词詞]|[动動][123]|サ[変变]|カ[変变]|ザ[変变]/u.test(pos.replace(/形容[动動][词詞]/gu,''));
  const suru=/サ[変变]|动3|動3/u.test(pos);
  const noun=/名/u.test(pos);
  const iAdjective=/い形容词|形1|形容詞/u.test(pos)&&!/[なナ]形容/u.test(pos);
  const naAdjective=/形2|形容动词|形容動詞|な形容/u.test(pos);
  const sourceReading=kana(word.reading);
  const actualReading=kana(reading);
  const iStem=sourceReading.endsWith('いい')?sourceReading.slice(0,-2)+'よ':sourceReading.slice(0,-1);
  const simpleIReading=iAdjective&&[sourceReading,...['く','くて','かった','くない','くなかった'].map(ending=>iStem+ending)].includes(actualReading);
  const naBase=sourceReading.replace(/(?:です|だ)$/u,'');
  const simpleNaReading=naAdjective&&['','な','に','で','だ','です','だった','でした'].some(ending=>actualReading===naBase+ending);
  const writtenStem=word.term.normalize('NFKC').replace(/(?:します|する|ます)$/u,'').replace(/[\u3041-\u3096]$/u,'');
  const readingStem=sourceReading.replace(/(?:します|する|ます)$/u,'').slice(0,-1);
  const sameWord=actualReading.includes(sourceReading)||answer.includes(word.term.normalize('NFKC'));
  if(!sameWord&&!simpleIReading&&(!(verb||iAdjective)||!((writtenStem&&answer.startsWith(writtenStem))||(readingStem&&actualReading.startsWith(readingStem)))))return undefined;

  // A suru noun such as あくび in あくびが出る has not itself conjugated.
  const lexicalSuruStem=word.term.replace(/(?:します|する)$/u,'');
  if(suru&&lexicalSuruStem&&answer.startsWith(lexicalSuruStem)){
    const continuation=answer.slice(lexicalSuruStem.length)+after;
    const match=continuation.match(/^(?:しませんでした|しません|しました|します|している|していた|して|した|する)/u);
    if(match)return note('suru-verb',lexicalSuruStem+match[0],'把名词接在「する」这一组活用形式前，作为动词使用。');
    const nominalAction=continuation.match(/^を(?:しませんでした|しません|しました|します|して|した|する)/u)?.[0];
    if(nominalAction)return note('suru-nominal-action',lexicalSuruStem+nominalAction,'把名词作为一项活动来描述，这里的「を」标出所做的活动。');
    if(noun&&/^の[\p{Script=Han}\p{Script=Katakana}]/u.test(continuation))return note('suru-used-as-noun',lexicalSuruStem+'の','在这里作为名词，用「の」连接后面的名词，当前词本身没有发生动词活用。');
    if(noun&&/^[がはを]/u.test(continuation))return note('suru-used-as-noun',lexicalSuruStem+continuation[0],'在这里作为名词使用，后面的助词标出它在句中的关系。不要把后面另一个动词的活用当作这个词的变化。');
  }

  const wholeVerb=verb&&(sourceReading===actualReading||!!createVocabularyInflectionMatcher([word],answer)?.(word)||!!createVocabularyInflectionMatcher([word],reading)?.(word));
  if(wholeVerb&&!(suru&&noun)){
    const polite:[RegExp,string,string][]=[
      [/ませんでした$/u,'verb-polite-negative-past','是礼貌的过去否定形式，表示过去没有发生该动作。'],
      [/ません$/u,'verb-polite-negative','是礼貌的否定形式。是否表示不做或邀请，要结合句尾和语境。'],
      [/(?:て|で)いました$/u,'verb-progressive-past','用「て形＋いました」描述过去正在进行的动作或持续的状态。'],
      [/(?:て|で)います$/u,'verb-progressive','用「て形＋います」描述正在进行的动作或持续的状态，具体含义结合上下文。'],
      [/ました$/u,'verb-polite-past','是礼貌的过去形式，表示过去发生的动作。'],
      [/ましょう$/u,'verb-invitation','以礼貌形式提出建议或邀请，相当于“一起……吧”。'],
      [/ます$/u,'verb-polite','是礼貌形式，可用于表达习惯、一般情况或接下来的动作，并不只表示现在。'],
      [/(?:て|で)いる$/u,'verb-progressive-plain','用「て形＋いる」表示正在进行或持续的状态。'],
      [/(?:て|で)いた$/u,'verb-progressive-past-plain','用「て形＋いた」表示过去正在进行或持续的状态。'],
      [/なかった$/u,'verb-negative-past','是普通体的过去否定形式。'],
      [/ない$/u,'verb-negative','是否定形式，先记住本句的否定词形。'],
    ];
    for(const [pattern,kind,explanation] of polite)if(pattern.test(answer))return note(kind,answer,explanation);
    if(/(?:て|で)$/u.test(answer)&&/^ください/u.test(after))return note('verb-request',answer+'ください','用「て形＋ください」提出请求。');
    if(/(?:て|で)$/u.test(answer)&&/^もいい/u.test(after))return note('verb-permission',answer+'もいい','用「て形＋もいい」表示允许或许可。');
    const prohibition=after.match(/^はいけ(?:ませんでした|ません|なかった|ない)/u)?.[0];
    if(/(?:て|で)$/u.test(answer)&&prohibition)return note('verb-prohibition',answer+prohibition,'用「て形＋はいけない」这一组形式表示禁止。');
    if(/(?:て|で)$/u.test(answer))return note('verb-te',answer,'用て形连接后面的动作、状态或说明。');
    if(/(?:た|だ)$/u.test(answer)&&!/^ら/u.test(after))return note('verb-plain-past',answer,'使用普通体过去形式。若后面接名词，这个形式也可以修饰名词。');
    if(/他动|他動|动[123]\s*他/u.test(pos)&&/を$/u.test(before))return note('transitive-object','〜を'+answer,'中的「を」标出这个动作直接作用的对象。');
    if(/自动|自動|动[123]\s*自/u.test(pos)&&/が$/u.test(before))return note('intransitive-subject','〜が'+answer,'中的「が」标出动作或变化的主体。');
  }

  if(simpleIReading){
    if(/くなかった$/u.test(answer))return note('i-adjective-negative-past',answer,'是い形容词的过去否定形式。');
    if(/くない$/u.test(answer))return note('i-adjective-negative',answer,'把词尾「い」变成「くない」，表示否定。');
    if(/かった$/u.test(answer))return note('i-adjective-past',answer,'把词尾「い」变成「かった」，描述过去的情况。');
    if(/くて$/u.test(answer))return note('i-adjective-connection',answer,'把词尾「い」变成「くて」，连接后面的描述。');
    if(/く$/u.test(answer))return note('i-adjective-adverbial',answer,'把词尾「い」变成「く」，用来连接或修饰后面的表达。');
    if(/い$/u.test(answer)&&/^[\p{Script=Han}\p{Script=Katakana}]/u.test(after))return note('i-adjective-modifier',answer,'作为い形容词直接修饰后面的名词，中间不接「な」。');
  }
  if(simpleNaReading){
    if(/な$/u.test(answer)&&/^[\p{Script=Han}\p{Script=Katakana}]/u.test(after))return note('na-adjective-modifier',answer,'用「な」连接后面的名词。');
    if(/^な(?=[\p{Script=Han}\p{Script=Katakana}]|こと|もの|ところ|とき)/u.test(after))return note('na-adjective-modifier',answer+'な','用「な」连接后面的名词。');
    const change=after.match(/^に(?:な(?:りました|ります|った|る)|成る)/u)?.[0];
    if(change)return note('na-adjective-change',answer+change,'用「な形容词＋に＋なる」这一组形式表示状态的变化。');
    if(/^で[、，]/u.test(after))return note('na-adjective-connection',answer+'で','用「で」连接后面的描述。');
  }
  if(actualReading===sourceReading&&/连体|連体/u.test(pos)&&/^[\p{Script=Han}\p{Script=Katakana}]/u.test(after))return note('attributive-modifier',answer+'〜','作为连体词直接放在名词前，要连同后面的名词一起使用。');
  if(noun&&actualReading===sourceReading&&/^の[\p{Script=Han}\p{Script=Katakana}]/u.test(after))return note('noun-modifier',answer+'の','用「の」连接后面的名词，说明所属或相关关系。');
  return undefined;
}
