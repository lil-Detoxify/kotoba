import {dictionaryBucket,matchEntries,type DictionaryProvider,type DictionaryEntry} from '@jp/dictionary';
class WebDictionary implements DictionaryProvider {
 private cache=new Map<number,Record<string,DictionaryEntry[]>>();
 async lookup(term:string,reading:string){const key=term.normalize('NFKC');const bucket=dictionaryBucket(key);let entries=this.cache.get(bucket);if(!entries){const version=import.meta.env.VITE_KOTOBA_DATA_VERSION??'v1';const r=await fetch(`/dictionary/${bucket}.json?v=${encodeURIComponent(version)}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('词典加载失败');entries=await r.json() as Record<string,DictionaryEntry[]>;if(this.cache.size>=8)this.cache.delete(this.cache.keys().next().value!);this.cache.set(bucket,entries)}return matchEntries(entries[key]??[],key,reading)}
}
export const dictionary:DictionaryProvider=new WebDictionary();
