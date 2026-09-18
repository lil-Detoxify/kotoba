import type {Data,Book,Lesson,Word} from '@jp/models';

export interface TextbookWord {term:string;reading:string;meaning:string;partOfSpeech?:string;sourceCode:number;sourceIndex:number;rawTerm?:string}
export interface TextbookLesson {title:string;order:number;words:TextbookWord[]}
export interface TextbookDefinition {id:string;title:string;description:string;lessons:TextbookLesson[];wordCount:number}

export function expandTildeAbbreviation(reading:string,parens:string):string{
  if(!parens||!/[～〜~]/.test(parens)||/[～〜~]/.test(reading))return parens;
  if(parens==='～朝～'&&reading==='ササンちょうペルシャ')return 'ササン朝ペルシャ';
  if(parens==='陝西～救護飼養～'&&reading==='せんせいトキきゅうごしようセンター')return '陝西トキ救護飼養センター';
  if(parens==='佐渡～保護～'&&reading==='さどトキほごセンター')return '佐渡トキ保護センター';
  if(parens==='～王立科学～'&&reading==='スウェーデンおうりつかがくアカデミー')return 'スウェーデン王立科学アカデミー';
  if(parens==='～触媒～反応'&&reading==='パラジウムしょくばいクロスカップリングはんのう')return 'パラジウム触媒クロスカップリング反応';
  if(!/^[～〜~]/.test(parens)&&!/[～〜~]$/.test(parens)&&(parens.match(/[～〜~]/g)||[]).length===1){
    if(parens==='段～箱'&&reading==='だんボールばこ')return '段ボール箱';
    if(parens==='100万～の夜景'&&reading==='ひゃくまんドルのやけい')return '100万ドルの夜景';
    if(parens==='とり肉の～炒め'&&reading==='とりにくのカシューナッツいため')return 'とり肉のカシューナッツ炒め';
    if(parens==='中国～保護支援基金'&&reading==='ちゅうごくトキほごしえんききん')return '中国トキ保護支援基金';
    if(parens==='中国～保護観察団'&&reading==='ちゅうごくトキほごかんさつだん')return '中国トキ保護観察団';
    if(parens==='『赤い～』'&&reading==='あかいコーリャン')return '『赤いコーリャン』';
    if(parens==='『～の森』'&&reading==='ノルウェイのもり')return '『ノルウェイの森』';
    if(parens==='新疆～自治区'&&reading==='しんきょうウイグルじちく')return '新疆ウイグル自治区';
    if(parens==='広西～族自治区'&&reading==='こうせいチワンぞくじちく')return '広西チワン族自治区';
    if(parens==='お／ご～申し上げる'&&reading==='お／ご～もうしあげる')return parens;
  }
  if(/^[～〜~]/.test(parens)&&!/[～〜~]$/.test(parens)&&(parens.match(/[～〜~]/g)||[]).length===1){
    const suffix=parens.replace(/^[～〜~]/,'');
    const kataMatch=reading.match(/^([\u30a0-\u30ffーA-Za-z0-9]+)(.*)$/);
    if(kataMatch)return kataMatch[1]+suffix;
    if(reading.startsWith('よろしく')&&(suffix.startsWith('お願い')||suffix.startsWith('お伝え')))return 'よろしく'+suffix;
    if(reading.startsWith('おせち')&&suffix==='料理')return 'おせち'+suffix;
    if(parens==='『～の森』'&&reading==='ノルウェイのもり')return '『ノルウェイの森』';
  }
  if(/[～〜~]$/.test(parens)&&!/^[～〜~]/.test(parens)&&(parens.match(/[～〜~]/g)||[]).length===1){
    const prefix=parens.replace(/[～〜~]$/,'');
    if(reading.endsWith('します'))return prefix+'します';
    if(reading.endsWith('する'))return prefix+'する';
    if(reading.endsWith('になる'))return prefix+'になる';
    if(reading.endsWith('ずる'))return prefix+'ずる';
    if(reading.endsWith('できます'))return prefix+'できます';
    if(reading.endsWith('なさいます'))return prefix+'なさいます';
    if(reading.endsWith('いたします'))return prefix+'いたします';
    if(reading.endsWith('くださいます'))return prefix+'くださいます';
    if(reading.endsWith('あります'))return prefix+'あります';
    if(reading.endsWith('まいります'))return prefix+'まいります';
    if(reading.endsWith('おります'))return prefix+'おります';
    if(reading.endsWith('ございます'))return prefix+'ございます';
    if(reading.endsWith('ごみ'))return prefix+'ごみ';
    if(reading.endsWith('ぐつ'))return prefix+'ぐつ';
    const kataSuffixMatch=reading.match(/^(.*?)([\u30a0-\u30ffー]+)$/);
    if(kataSuffixMatch&&kataSuffixMatch[2].length>=2)return prefix+kataSuffixMatch[2];
  }
  return parens;
}

/** Parse the compact reading(term) notation used by the biaori source. */
export function parseTextbookReading(value:string):{term:string;reading:string;rawTerm?:string}{
  const text=value.trim().split(/[／/]/,1)[0].replace(/\s*［[^］]*］\s*$/,'').replace(/\s*\[[^\]]*\]\s*$/,'').trim();
  const match=text.match(/^(.*?)\s*[（(]([^（）()]*)[）)]/);
  if(!match)return {term:text,reading:text};
  const reading=match[1].trim();
  const rawTerm=match[2].trim();
  const term=expandTildeAbbreviation(reading,rawTerm);
  return {term:term||reading,reading:reading||term,rawTerm:rawTerm!==term?rawTerm:undefined};
}

export function textbookWordId(bookId:string,lessonOrder:number,sourceIndex:number):string{
  return `${bookId}-w-${lessonOrder}-${sourceIndex}`;
}

/** Install bundled textbooks while leaving existing words, states, and current book untouched. */
export function installTextbooks(data:Data,textbooks:TextbookDefinition[],id:()=>string,now=new Date()):string[]{
  const added:string[]=[];
  for(const textbook of textbooks){
    if(data.books.some(book=>book.id===textbook.id))continue;
    const book:Book={id:textbook.id,title:textbook.title,description:textbook.description,language:'ja',createdAt:now.toISOString(),updatedAt:now.toISOString()};
    const lessons:Lesson[]=[];const words:Word[]=[];
    for(const item of textbook.lessons){
      const lesson:Lesson={id:`${textbook.id}-l-${item.order}`,bookId:book.id,title:item.title,order:item.order};lessons.push(lesson);
      for(const [index,row] of item.words.entries())words.push({id:textbookWordId(textbook.id,item.order,row.sourceIndex??index),lessonId:lesson.id,term:row.term,reading:row.reading,meaning:row.meaning,partOfSpeech:row.partOfSpeech,rawTerm:row.rawTerm,order:words.length+1});
    }
    data.books.push(book);data.lessons.push(...lessons);data.words.push(...words);added.push(book.id);
  }
  if(!data.currentBookId&&added.length)data.currentBookId=added[0];
  return added;
}
