import {readFileSync} from 'node:fs';

const catalog=JSON.parse(readFileSync(new URL('../apps/web/src/textbook-corrections.json',import.meta.url),'utf8'));
const entries=new Map(catalog.entries.map(entry=>[`${entry.bookId}|${entry.lessonOrder}|${entry.sourceIndex}`,entry]));

/** Export corrected wording while preserving the original extraction and source identity. */
export function correctedTextbookWord(bookId,lessonOrder,row,index){
  const entry=entries.get(`${bookId}|${lessonOrder}|${row.sourceIndex??index}`);
  if(!entry)return row;
  return {...row,...entry.corrected,...(entry.previous.term!==entry.corrected.term?{rawTerm:entry.corrected.term}:{})};
}
