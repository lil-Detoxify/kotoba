import {openDB,type DBSchema,type IDBPDatabase} from 'idb';
import {emptyData,type Data} from '@jp/models';
export interface Repository {read():Promise<Data>;transact(change:(data:Data)=>void):Promise<Data>}
interface Schema extends DBSchema {app:{key:string;value:Data}}
export class IndexedDbRepository implements Repository {
 private db:Promise<IDBPDatabase<Schema>>;
 constructor(name='kotoba-v1'){this.db=openDB<Schema>(name,1,{upgrade(db){db.createObjectStore('app')}})}
 async read(){return (await (await this.db).get('app','data'))??emptyData()}
 async transact(change:(data:Data)=>void){const db=await this.db;const tx=db.transaction('app','readwrite');try{const data=(await tx.store.get('data'))??emptyData();change(data);await tx.store.put(data,'data');await tx.done;return data}catch(error){try{tx.abort()}catch{}await tx.done.catch(()=>{});throw error}}
}
export function deleteBook(data:Data,id:string){const lessonIds=new Set(data.lessons.filter(l=>l.bookId===id).map(l=>l.id));const wordIds=new Set(data.words.filter(w=>lessonIds.has(w.lessonId)).map(w=>w.id));data.books=data.books.filter(b=>b.id!==id);data.lessons=data.lessons.filter(l=>!lessonIds.has(l.id));data.words=data.words.filter(w=>!wordIds.has(w.id));data.states=data.states.filter(s=>!wordIds.has(s.wordId));data.logs=data.logs.filter(l=>!wordIds.has(l.wordId));if(data.currentBookId===id)data.currentBookId=data.books[0]?.id}

