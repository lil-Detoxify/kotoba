import type {Data,Book,Lesson,Word} from '@jp/models';

export interface TextbookWord {term:string;reading:string;meaning:string;partOfSpeech?:string;sourceCode:number;sourceIndex:number}
export interface TextbookLesson {title:string;order:number;words:TextbookWord[]}
export interface TextbookDefinition {id:string;title:string;description:string;lessons:TextbookLesson[];wordCount:number}

/** Parse the compact reading(term) notation used by the biaori source. */
export function parseTextbookReading(value:string):{term:string;reading:string}{
  const text=value.trim().split(/[／/]/,1)[0].replace(/\s*［[^］]*］\s*$/,'').replace(/\s*\[[^\]]*\]\s*$/,'').trim();
  const match=text.match(/^(.*?)\s*[（(]([^（）()]*)[）)]/);
  if(!match)return {term:text,reading:text};
  const reading=match[1].trim();
  const term=match[2].trim();
  return {term:term||reading,reading:reading||term};
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
      for(const [index,row] of item.words.entries())words.push({id:textbookWordId(textbook.id,item.order,row.sourceIndex??index),lessonId:lesson.id,term:row.term,reading:row.reading,meaning:row.meaning,partOfSpeech:row.partOfSpeech,order:words.length+1});
    }
    data.books.push(book);data.lessons.push(...lessons);data.words.push(...words);added.push(book.id);
  }
  if(!data.currentBookId&&added.length)data.currentBookId=added[0];
  return added;
}
